import { notFound } from "next/navigation";
import { MirrorClient } from "@/components/mirror/MirrorClient";
import { getCalendarModuleData } from "@/lib/calendar";
import { buildModuleSettingsMap } from "@/lib/module-config";
import { prisma } from "@/lib/prisma";
import { buildTimerAnnouncementAudioKey } from "@/lib/timer-announcement-key";
import { buildTimerAnnouncementMessage } from "@/lib/timer-announcement";
import { getTodoistModuleData } from "@/lib/todoist";
import { cleanupExpiredActiveTimers } from "@/lib/timers";
import { getWeatherModuleData } from "@/lib/weather";

type MirrorPageProps = {
  params: Promise<{ mirrorId: string }>;
};

export default async function MirrorPage({ params }: MirrorPageProps) {
  const { mirrorId } = await params;
  await cleanupExpiredActiveTimers({ mirrorId });

  const mirror = await prisma.mirror.findUnique({
    where: { id: mirrorId },
    include: {
      modules: true,
      timers: {
        where: {
          status: "ACTIVE",
          endsAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          endsAt: "asc",
        },
        take: 50,
      },
    },
  });

  if (!mirror) {
    notFound();
  }

  const modules = buildModuleSettingsMap(
    mirror.modules.map((module) => ({
      type: module.type,
      enabled: module.enabled,
      config: module.config,
    })),
    { rows: mirror.gridRows },
  );

  const weather = modules.WEATHER.enabled
    ? await getWeatherModuleData({
        latitude: mirror.latitude,
        longitude: mirror.longitude,
        locationName: mirror.locationName,
        forecastDays: modules.WEATHER.config.forecastDays,
      })
    : null;

  const calendar = modules.CALENDAR.enabled
    ? await getCalendarModuleData({
        householdId: mirror.householdId,
        calendarName: modules.CALENDAR.config.calendarName,
        daysAhead: modules.CALENDAR.config.daysAhead,
      })
    : null;

  const todoist = modules.TODOIST.enabled
    ? await getTodoistModuleData({
        householdId: mirror.householdId,
        projectId: modules.TODOIST.config.projectId,
        maxVisible: modules.TODOIST.config.maxVisible,
      })
    : null;

  return (
    <MirrorClient
      mirrorId={mirror.id}
      mirrorName={mirror.name}
      highContrastMonochrome={mirror.highContrastMonochrome}
      showAlignmentGrid={mirror.showAlignmentGrid}
      gridRows={mirror.gridRows}
      modules={modules}
      weather={weather}
      calendar={calendar}
      todoist={todoist}
      initialTimers={mirror.timers.map((timer) => ({
        id: timer.id,
        label: timer.label,
        durationSeconds: timer.durationSeconds,
        endsAt: timer.endsAt.toISOString(),
        greetingName: timer.greetingName,
        announcementAudioKey: buildTimerAnnouncementAudioKey(
          buildTimerAnnouncementMessage({
            greetingName: timer.greetingName,
            durationSeconds: timer.durationSeconds,
          }),
        ),
      }))}
    />
  );
}
