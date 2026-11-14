-- Private cache tables. Never grant browser roles write access or privileged RPC.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sunseek_weather_cache (
 city_id text PRIMARY KEY, profile text NOT NULL, base_date text NOT NULL,
 forecast jsonb, fetched_at timestamptz, lease_owner text, lease_until timestamptz,
 retry_at timestamptz, failure text
);
CREATE TABLE IF NOT EXISTS public.sunseek_weather_budget (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 day_start date NOT NULL DEFAULT CURRENT_DATE, day_units integer NOT NULL DEFAULT 0,
 hour_start timestamptz NOT NULL DEFAULT date_trunc('hour',now()), hour_units integer NOT NULL DEFAULT 0,
 minute_start timestamptz NOT NULL DEFAULT date_trunc('minute',now()), minute_units integer NOT NULL DEFAULT 0,
 pause_until timestamptz
);
CREATE TABLE IF NOT EXISTS public.sunseek_weather_usage (
 at timestamptz NOT NULL DEFAULT now(), units integer NOT NULL CHECK(units>0)
);
CREATE INDEX IF NOT EXISTS sunseek_weather_usage_at ON public.sunseek_weather_usage(at);
ALTER TABLE public.sunseek_weather_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sunseek_weather_usage FROM PUBLIC,anon,authenticated;
INSERT INTO public.sunseek_weather_budget(singleton) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.sunseek_weather_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sunseek_weather_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sunseek_weather_cache,public.sunseek_weather_budget FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sunseek_weather_claim(points jsonb, owner_id text, forecast_date text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE p jsonb; c public.sunseek_weather_cache; b public.sunseek_weather_budget;
 result jsonb := '[]'; fresh boolean; units integer;
BEGIN
 IF jsonb_array_length(points) NOT BETWEEN 1 AND 16 THEN RAISE EXCEPTION 'Invalid batch'; END IF;
 -- One short transaction orders competing refreshes and reserves weighted upstream quota.
 SELECT * INTO b FROM public.sunseek_weather_budget WHERE singleton FOR UPDATE;
 DELETE FROM public.sunseek_weather_usage WHERE at<=now()-interval '24 hours';
 SELECT coalesce(sum(u.units),0),coalesce(sum(u.units) FILTER(WHERE u.at>now()-interval '1 hour'),0),coalesce(sum(u.units) FILTER(WHERE u.at>now()-interval '1 minute'),0)
 INTO b.day_units,b.hour_units,b.minute_units FROM public.sunseek_weather_usage u;
 b.day_start:=CURRENT_DATE; b.hour_start:=date_trunc('hour',now()); b.minute_start:=date_trunc('minute',now());
 FOR p IN SELECT value FROM jsonb_array_elements(points) ORDER BY value->>'id' LOOP
  INSERT INTO public.sunseek_weather_cache(city_id,profile,base_date)
   VALUES(p->>'id',p->>'profile',forecast_date) ON CONFLICT DO NOTHING;
  SELECT * INTO c FROM public.sunseek_weather_cache WHERE city_id=p->>'id' FOR UPDATE;
  fresh:=c.forecast IS NOT NULL AND c.profile=p->>'profile' AND c.base_date=forecast_date AND c.fetched_at>now()-interval '1 hour';
  IF NOT fresh AND coalesce(c.lease_until,'epoch')<=now() AND coalesce(c.retry_at,'epoch')<=now() THEN
   -- ceil(17/10 * 16/14) = 2 weighted units/location; reserve before I/O.
   units:=2;
   IF coalesce(b.pause_until,'epoch')<=now() AND b.day_units+units<=8000 AND b.hour_units+units<=4000 AND b.minute_units+units<=400 THEN
    UPDATE public.sunseek_weather_cache SET lease_owner=owner_id,lease_until=now()+interval '45 seconds'
     WHERE city_id=c.city_id RETURNING * INTO c;
    b.day_units:=b.day_units+units; b.hour_units:=b.hour_units+units; b.minute_units:=b.minute_units+units;
    INSERT INTO public.sunseek_weather_usage(units) VALUES(units);
   ELSE
    c.failure:='rate-limited';
    c.retry_at:=greatest(coalesce(b.pause_until,'epoch'),CASE WHEN b.day_units+units>8000 THEN now()+interval '1 hour' WHEN b.hour_units+units>4000 THEN now()+interval '1 hour' ELSE now()+interval '61 seconds' END);
   END IF;
  END IF;
  result:=result||jsonb_build_array(jsonb_build_object(
   'cityId',c.city_id,'fresh',fresh,'claimed',c.lease_owner=owner_id AND c.lease_until>now(),
   'forecast',CASE WHEN c.profile=p->>'profile' AND c.base_date=forecast_date AND c.fetched_at>now()-interval '6 hours' THEN c.forecast ELSE NULL END,
   'fetchedAt',c.fetched_at,'retryAt',greatest(c.retry_at,b.pause_until),
   'failure',c.failure,'pending',c.lease_until>now()));
 END LOOP;
 UPDATE public.sunseek_weather_budget SET day_start=b.day_start,day_units=b.day_units,
  hour_start=b.hour_start,hour_units=b.hour_units,minute_start=b.minute_start,minute_units=b.minute_units WHERE singleton;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.sunseek_weather_finish(owner_id text, items jsonb, forecast_date text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE p jsonb; c public.sunseek_weather_cache; result jsonb:='[]';
BEGIN
 FOR p IN SELECT value FROM jsonb_array_elements(items) LOOP
  -- Fencing: a timed-out worker cannot overwrite a newer lease or change another point's clock.
  UPDATE public.sunseek_weather_cache SET forecast=p->'forecast',profile=p->>'profile',base_date=forecast_date,
   fetched_at=clock_timestamp(),lease_owner=NULL,lease_until=NULL,retry_at=NULL,failure=NULL
   WHERE city_id=p->>'cityId' AND lease_owner=owner_id AND lease_until>clock_timestamp()
   RETURNING * INTO c;
  IF FOUND THEN result:=result||jsonb_build_array(jsonb_build_object('cityId',c.city_id,'fetchedAt',c.fetched_at)); END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.sunseek_weather_fail(owner_id text, ids jsonb, reason text, cooldown integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.sunseek_weather_cache SET lease_owner=NULL,lease_until=NULL,
  retry_at=now()+make_interval(secs=>greatest(10,least(cooldown,3600))),failure=reason
  WHERE city_id IN (SELECT jsonb_array_elements_text(ids)) AND lease_owner=owner_id;
 IF reason='rate-limited' THEN
  UPDATE public.sunseek_weather_budget SET pause_until=greatest(coalesce(pause_until,'epoch'),now()+make_interval(secs=>greatest(60,least(cooldown,3600)))) WHERE singleton;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.sunseek_weather_claim(jsonb,text,text),public.sunseek_weather_finish(text,jsonb,text),public.sunseek_weather_fail(text,jsonb,text,integer) FROM PUBLIC,anon,authenticated;
COMMIT;
