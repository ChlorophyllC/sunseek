-- Live acceptance against the real PostgreSQL implementation; rolls back every change.
BEGIN;
DO $$
DECLARE a jsonb; b jsonb; stamp timestamptz;
BEGIN
 ASSERT NOT has_table_privilege('anon','public.sunseek_weather_cache','SELECT');
 ASSERT NOT has_table_privilege('anon','public.sunseek_weather_cache','INSERT');
 ASSERT NOT has_table_privilege('authenticated','public.sunseek_weather_cache','UPDATE');
 ASSERT NOT has_function_privilege('anon','public.sunseek_weather_claim(jsonb,text,text)','EXECUTE');
 DELETE FROM public.sunseek_weather_usage;
 UPDATE public.sunseek_weather_budget SET pause_until=NULL,day_units=0,hour_units=0,minute_units=0 WHERE singleton;
 a:=public.sunseek_weather_claim('[{"id":"__sunseek_test__","profile":"test"}]','owner-a','2026-11-15');
 ASSERT (a->0->>'claimed')::boolean;
 b:=public.sunseek_weather_claim('[{"id":"__sunseek_test__","profile":"test"}]','owner-b','2026-11-15');
 ASSERT NOT coalesce((b->0->>'claimed')::boolean,false) AND (b->0->>'pending')::boolean;
 UPDATE public.sunseek_weather_cache SET lease_until=now()-interval '1 second' WHERE city_id='__sunseek_test__';
 b:=public.sunseek_weather_claim('[{"id":"__sunseek_test__","profile":"test"}]','owner-b','2026-11-15');
 ASSERT (b->0->>'claimed')::boolean;
 ASSERT public.sunseek_weather_finish('owner-a','[{"cityId":"__sunseek_test__","profile":"test","forecast":{"test":true}}]','2026-11-15')='[]'::jsonb;
 a:=public.sunseek_weather_finish('owner-b','[{"cityId":"__sunseek_test__","profile":"test","forecast":{"test":true}}]','2026-11-15');
 ASSERT jsonb_array_length(a)=1;
 SELECT fetched_at INTO stamp FROM public.sunseek_weather_cache WHERE city_id='__sunseek_test__';
 b:=public.sunseek_weather_claim('[{"id":"__sunseek_test__","profile":"test"}]','reader','2026-11-15');
 ASSERT (b->0->>'fresh')::boolean;
 ASSERT (SELECT fetched_at=stamp FROM public.sunseek_weather_cache WHERE city_id='__sunseek_test__');
 b:=public.sunseek_weather_claim('[{"id":"__sunseek_test__","profile":"changed"}]','new-profile','2026-11-15');
 ASSERT (b->0->>'claimed')::boolean AND b->0->'forecast'='null'::jsonb;
 PERFORM public.sunseek_weather_fail('new-profile','["__sunseek_test__"]','rate-limited',180);
 ASSERT (SELECT forecast IS NOT NULL AND fetched_at=stamp FROM public.sunseek_weather_cache WHERE city_id='__sunseek_test__');
 b:=public.sunseek_weather_claim('[{"id":"__sunseek_test_budget__","profile":"test"}]','paused','2026-11-15');
 ASSERT b->0->>'failure'='rate-limited' AND NOT coalesce((b->0->>'claimed')::boolean,false);
 UPDATE public.sunseek_weather_budget SET pause_until=NULL WHERE singleton;
 DELETE FROM public.sunseek_weather_usage;
 INSERT INTO public.sunseek_weather_usage(units) VALUES(399);
 b:=public.sunseek_weather_claim('[{"id":"__sunseek_test_budget__","profile":"test"}]','budget','2026-11-15');
 ASSERT b->0->>'failure'='rate-limited' AND NOT coalesce((b->0->>'claimed')::boolean,false);
END $$;
ROLLBACK;
