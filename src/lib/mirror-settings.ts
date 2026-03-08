import { z } from "zod";

export const mirrorModuleTypeValues = [
  "CLOCK",
  "WEATHER",
  "TIMERS",
  "CALENDAR",
  "ATTENTION",
  "TODOIST",
] as const;

const moduleTypeOrder = new Map(
  mirrorModuleTypeValues.map((value, index) => [value, index]),
);

const mirrorModuleTypeSchema = z.enum(mirrorModuleTypeValues);

const moduleSettingsSnapshotSchema = z.object({
  type: mirrorModuleTypeSchema,
  enabled: z.boolean(),
  config: z.string().nullable(),
});

const mirrorSettingsSnapshotSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  sourceMirrorId: z.string().optional(),
  sourceMirrorName: z.string().optional(),
  mirror: z.object({
    locationName: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    timezone: z.string().nullable(),
    highContrastMonochrome: z.boolean(),
    showAlignmentGrid: z.boolean().optional().default(false),
    gridRows: z.number().int().min(12).max(24).optional().default(12),
  }),
  modules: z.array(moduleSettingsSnapshotSchema),
});

export type MirrorModuleType = z.infer<typeof mirrorModuleTypeSchema>;
export type MirrorSettingsSnapshot = z.infer<typeof mirrorSettingsSnapshotSchema>;

type MirrorSnapshotSource = {
  id: string;
  name: string;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  highContrastMonochrome: boolean;
  showAlignmentGrid: boolean;
  gridRows: number;
  modules: Array<{
    type: string;
    enabled: boolean;
    config: string | null;
  }>;
};

function isMirrorModuleType(value: string): value is MirrorModuleType {
  return mirrorModuleTypeValues.includes(value as MirrorModuleType);
}

export function buildMirrorSettingsSnapshot(
  mirror: MirrorSnapshotSource,
): MirrorSettingsSnapshot {
  const modules = mirror.modules
    .flatMap((module) => {
      if (!isMirrorModuleType(module.type)) {
        return [];
      }

      return [
        {
          type: module.type,
          enabled: module.enabled,
          config: module.config,
        },
      ];
    })
    .sort(
      (a, b) =>
        (moduleTypeOrder.get(a.type) ?? 0) - (moduleTypeOrder.get(b.type) ?? 0),
    );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceMirrorId: mirror.id,
    sourceMirrorName: mirror.name,
    mirror: {
      locationName: mirror.locationName,
      latitude: mirror.latitude,
      longitude: mirror.longitude,
      timezone: mirror.timezone,
      highContrastMonochrome: mirror.highContrastMonochrome,
      showAlignmentGrid: mirror.showAlignmentGrid,
      gridRows: mirror.gridRows,
    },
    modules,
  };
}

export function parseMirrorSettingsSnapshot(
  input: string,
): MirrorSettingsSnapshot | null {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(input);
  } catch {
    return null;
  }

  const parsed = mirrorSettingsSnapshotSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return null;
  }

  const byType = new Map(
    parsed.data.modules.map((module) => [module.type, module]),
  );

  const modules = mirrorModuleTypeValues
    .map((type) => byType.get(type))
    .filter((module): module is (typeof parsed.data.modules)[number] => Boolean(module));

  return {
    ...parsed.data,
    modules,
  };
}
