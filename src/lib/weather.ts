import { getOpenWeatherApiKey } from "@/lib/config";

export type WeatherCurrent = {
  temperatureC: number;
  description: string;
  icon: string;
  city: string;
};

export type WeatherForecastDay = {
  dateIso: string;
  dayLabel: string;
  icon: string;
  minTempC: number;
  maxTempC: number;
};

export type WeatherModuleData = {
  current: WeatherCurrent | null;
  forecast: WeatherForecastDay[];
};

type ForecastBucket = {
  score: number;
  dateIso: string;
  icon: string;
  minTempC: number;
  maxTempC: number;
};

function isoDayKeyFromUnix(seconds: number) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function dayLabel(dateIso: string) {
  return new Intl.DateTimeFormat("nl-NL", { weekday: "short" }).format(
    new Date(`${dateIso}T12:00:00Z`),
  );
}

function normalizeForecast(
  rawList: Array<{
    dt?: number;
    weather?: Array<{ icon?: string }>;
    main?: { temp_min?: number; temp_max?: number };
  }>,
  maxDays: number,
): WeatherForecastDay[] {
  const buckets = new Map<string, ForecastBucket>();
  const todayKey = new Date().toISOString().slice(0, 10);

  for (const item of rawList) {
    if (!item.dt) {
      continue;
    }

    const date = new Date(item.dt * 1000);
    const key = isoDayKeyFromUnix(item.dt);
    const hour = date.getUTCHours();
    const score = Math.abs(hour - 12);

    const existing = buckets.get(key);
    if (existing && existing.score <= score) {
      continue;
    }

    buckets.set(key, {
      score,
      dateIso: key,
      icon: item.weather?.[0]?.icon ?? "01d",
      minTempC: Math.round(item.main?.temp_min ?? 0),
      maxTempC: Math.round(item.main?.temp_max ?? 0),
    });
  }

  return [...buckets.values()]
    .filter((item) => item.dateIso > todayKey)
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso))
    .slice(0, maxDays)
    .map((item) => ({
      dateIso: item.dateIso,
      dayLabel: dayLabel(item.dateIso),
      icon: item.icon,
      minTempC: item.minTempC,
      maxTempC: item.maxTempC,
    }));
}

export async function getWeatherModuleData({
  latitude,
  longitude,
  locationName,
  forecastDays,
}: {
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  forecastDays: 3 | 5 | 7;
}): Promise<WeatherModuleData | null> {
  const apiKey = getOpenWeatherApiKey();

  if (!apiKey) {
    return null;
  }

  const hasCoords = latitude !== null && longitude !== null;
  const hasLocationName = Boolean(locationName?.trim());

  if (!hasCoords && !hasLocationName) {
    return null;
  }

  const currentUrl = new URL("https://api.openweathermap.org/data/2.5/weather");
  if (hasCoords) {
    currentUrl.searchParams.set("lat", String(latitude));
    currentUrl.searchParams.set("lon", String(longitude));
  } else {
    currentUrl.searchParams.set("q", locationName!.trim());
  }
  currentUrl.searchParams.set("appid", apiKey);
  currentUrl.searchParams.set("units", "metric");
  currentUrl.searchParams.set("lang", "nl");

  const forecastUrl = new URL("https://api.openweathermap.org/data/2.5/forecast");
  if (hasCoords) {
    forecastUrl.searchParams.set("lat", String(latitude));
    forecastUrl.searchParams.set("lon", String(longitude));
  } else {
    forecastUrl.searchParams.set("q", locationName!.trim());
  }
  forecastUrl.searchParams.set("appid", apiKey);
  forecastUrl.searchParams.set("units", "metric");
  forecastUrl.searchParams.set("lang", "nl");

  const [currentResponse, forecastResponse] = await Promise.all([
    fetch(currentUrl, { next: { revalidate: 15 * 60 } }),
    fetch(forecastUrl, { next: { revalidate: 24 * 60 * 60 } }),
  ]);

  if (!currentResponse.ok && !forecastResponse.ok) {
    return null;
  }

  const currentJson = currentResponse.ok
    ? ((await currentResponse.json()) as {
        main?: { temp?: number };
        weather?: Array<{ description?: string; icon?: string }>;
        name?: string;
      })
    : null;

  const forecastJson = forecastResponse.ok
    ? ((await forecastResponse.json()) as {
        list?: Array<{
          dt?: number;
          weather?: Array<{ icon?: string }>;
          main?: { temp_min?: number; temp_max?: number };
        }>;
      })
    : null;

  const current: WeatherCurrent | null = currentJson
    ? {
        temperatureC: Number((currentJson.main?.temp ?? 0).toFixed(1)),
        description: currentJson.weather?.[0]?.description ?? "onbekend",
        icon: currentJson.weather?.[0]?.icon ?? "01d",
        city: currentJson.name ?? "Onbekend",
      }
    : null;

  const forecast = forecastJson?.list
    ? normalizeForecast(forecastJson.list, forecastDays)
    : [];

  if (!current && forecast.length === 0) {
    return null;
  }

  return {
    current,
    forecast,
  };
}
