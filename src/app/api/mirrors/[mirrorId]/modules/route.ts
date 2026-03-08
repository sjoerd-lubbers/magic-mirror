import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { userCanAccessMirror } from "@/lib/household";
import {
  normalizeModuleConfig,
  readModuleConfig,
  type MirrorModuleType,
} from "@/lib/module-config";
import { prisma } from "@/lib/prisma";
import { broadcastToMirror } from "@/lib/ws-hub";

export const runtime = "nodejs";

const schema = z.object({
  type: z.enum(["CLOCK", "WEATHER", "TIMERS", "CALENDAR", "ATTENTION", "TODOIST"]),
  enabled: z.boolean().optional(),
  config: z.unknown().optional(),
});

type Params = {
  params: Promise<{ mirrorId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { mirrorId } = await params;
  const hasAccess = await userCanAccessMirror(user.id, mirrorId);

  if (!hasAccess) {
    return NextResponse.json({ error: "Geen toegang tot spiegel" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige input" }, { status: 400 });
  }

  if (parsed.data.enabled === undefined && parsed.data.config === undefined) {
    return NextResponse.json(
      { error: "Geen wijziging meegegeven" },
      { status: 400 },
    );
  }

  const type = parsed.data.type as MirrorModuleType;
  const existing = await prisma.mirrorModule.findUnique({
    where: {
      mirrorId_type: {
        mirrorId,
        type,
      },
    },
  });

  const normalizedConfig =
    parsed.data.config === undefined
      ? readModuleConfig(type, existing?.config ?? null)
      : normalizeModuleConfig(type, parsed.data.config);
  const nextEnabled = parsed.data.enabled ?? existing?.enabled ?? true;

  const moduleState = await prisma.mirrorModule.upsert({
    where: {
      mirrorId_type: {
        mirrorId,
        type,
      },
    },
    create: {
      mirrorId,
      type,
      enabled: nextEnabled,
      config: JSON.stringify(normalizedConfig),
    },
    update: {
      enabled: nextEnabled,
      config: JSON.stringify(normalizedConfig),
    },
  });

  broadcastToMirror(mirrorId, {
    type: "module_updated",
    module: {
      type,
      enabled: moduleState.enabled,
      config: normalizedConfig,
    },
  });

  return NextResponse.json({
    ok: true,
    module: {
      ...moduleState,
      config: normalizedConfig,
    },
  });
}
