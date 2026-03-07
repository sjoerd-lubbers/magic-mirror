import { ModuleType } from "@prisma/client";
import { getDefaultModuleConfig } from "@/lib/module-config";
import { prisma } from "@/lib/prisma";

export async function createMirrorWithDefaultModules({
  householdId,
  name,
  locationName,
  latitude,
  longitude,
}: {
  householdId: string;
  name: string;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.mirror.create({
      data: {
        householdId,
        name,
        locationName,
        latitude,
        longitude,
      },
    });

    await tx.mirrorModule.createMany({
      data: [
        {
          mirrorId: created.id,
          type: ModuleType.CLOCK,
          enabled: true,
          config: JSON.stringify(getDefaultModuleConfig("CLOCK")),
        },
        {
          mirrorId: created.id,
          type: ModuleType.WEATHER,
          enabled: true,
          config: JSON.stringify(getDefaultModuleConfig("WEATHER")),
        },
        {
          mirrorId: created.id,
          type: ModuleType.TIMERS,
          enabled: true,
          config: JSON.stringify(getDefaultModuleConfig("TIMERS")),
        },
        {
          mirrorId: created.id,
          type: ModuleType.CALENDAR,
          enabled: true,
          config: JSON.stringify(getDefaultModuleConfig("CALENDAR")),
        },
        {
          mirrorId: created.id,
          type: ModuleType.ATTENTION,
          enabled: true,
          config: JSON.stringify(getDefaultModuleConfig("ATTENTION")),
        },
        {
          mirrorId: created.id,
          type: ModuleType.TODOIST,
          enabled: false,
          config: JSON.stringify(getDefaultModuleConfig("TODOIST")),
        },
      ],
    });

    return created;
  });
}
