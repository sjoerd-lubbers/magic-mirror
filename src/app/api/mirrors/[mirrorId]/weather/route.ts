import { NextResponse } from "next/server";
import { readModuleConfig } from "@/lib/module-config";
import { prisma } from "@/lib/prisma";
import { getWeatherModuleData } from "@/lib/weather";
import { getMirrorSubscriberCount } from "@/lib/ws-hub";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ mirrorId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { mirrorId } = await params;
  const subscriberCount = getMirrorSubscriberCount(mirrorId);

  if (subscriberCount === 0) {
    return NextResponse.json({
      ok: true,
      weather: null,
      skipped: "mirror_offline",
    });
  }

  const mirror = await prisma.mirror.findUnique({
    where: { id: mirrorId },
    select: {
      latitude: true,
      longitude: true,
      locationName: true,
      modules: {
        where: {
          type: "WEATHER",
        },
        select: {
          enabled: true,
          config: true,
        },
        take: 1,
      },
    },
  });

  const weatherModule = mirror?.modules[0];
  if (!mirror || !weatherModule?.enabled) {
    return NextResponse.json({ ok: true, weather: null });
  }

  const config = readModuleConfig("WEATHER", weatherModule.config ?? null);
  const weather = await getWeatherModuleData({
    latitude: mirror.latitude,
    longitude: mirror.longitude,
    locationName: mirror.locationName,
    forecastDays: config.forecastDays,
  });

  return NextResponse.json({
    ok: true,
    weather,
  });
}
