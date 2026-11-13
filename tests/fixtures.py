"""Deterministic hourly forecasts, including night rain and unavailable hours."""
import json
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

TODAY = datetime.now(ZoneInfo('Asia/Shanghai')).date()
DATES = [(TODAY + timedelta(days=i)).isoformat() for i in range(16)]


def payload_for(url):
    query = parse_qs(urlparse(url).query)
    latitudes = [float(v) for v in query['latitude'][0].split(',')]
    longitudes = [float(v) for v in query['longitude'][0].split(',')]
    payload = []
    for lat, lon in zip(latitudes, longitudes):
        code, maximum, snow, rain = 0, 22, 0, 0
        if lat >= 42:
            code, maximum, snow, rain = 71, -2, 2, 2
        elif 28 < lat < 33:
            code, maximum, rain = 61, 20, 4
        if lat == 39.9:
            code, rain = 95, 60
        gust = 80 if lat == 30.59 else 16
        daily = {
            'time': DATES, 'weather_code': [61 if lat == 25.61 else code] * 16,
            'temperature_2m_max': [None if lat == 22.54 else maximum] * 16,
            'temperature_2m_min': [maximum - 8] * 16,
            'precipitation_probability_max': [80 if rain or lat == 25.61 else 5] * 16,
            'precipitation_sum': [5 if lat == 25.61 else rain] * 16, 'snowfall_sum': [snow] * 16,
            'wind_speed_10m_max': [8] * 16, 'wind_gusts_10m_max': [gust] * 16,
        }
        hourly = {key: [] for key in ['time', 'weather_code', 'temperature_2m', 'apparent_temperature',
            'precipitation', 'snowfall', 'wind_speed_10m', 'wind_gusts_10m', 'cloud_cover', 'is_day']}
        for date in DATES:
            for hour in range(24):
                hcode, cloud = code, 20 if code < 3 else 85
                precipitation, snowfall = (0.5 if rain else 0), (0.2 if snow else 0)
                if lat == 25.61:
                    hcode, cloud, precipitation = (61,90,0.5) if hour < 8 or hour >= 20 else (0,20,0)
                if lat == 26.87 and 12 <= hour < 18:
                    hcode, cloud = 3,95
                values = {'time': f'{date}T{hour:02d}:00', 'weather_code': hcode,
                    'temperature_2m': maximum, 'apparent_temperature': None if lat == 23.13 and hour == 12 else maximum,
                    'precipitation': precipitation, 'snowfall': snowfall, 'wind_speed_10m': 8,
                    'wind_gusts_10m': gust, 'cloud_cover': cloud, 'is_day': int(8 <= hour < (17 if lat >= 42 else 18))}
                for key,value in values.items(): hourly[key].append(value)
        payload.append({'latitude':lat, 'longitude':lon, 'daily':daily, 'hourly':hourly})
    return payload


def fixture(route):
    route.fulfill(status=200, content_type='application/json', body=json.dumps(payload_for(route.request.url)))
