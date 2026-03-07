import { NextResponse } from "next/server";
import { z } from "zod";
import { buildGreetingName, getCurrentUser } from "@/lib/auth";
import { userCanAccessMirror } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import { cleanupExpiredActiveTimers } from "@/lib/timers";
import { broadcastToMirror } from "@/lib/ws-hub";

export const runtime = "nodejs";

const schema = z.object({
  mirrorId: z.string().min(1),
  durationMinutes: z.number().int().min(1).max(720).optional(),
  durationSeconds: z.number().int().min(5).max(12 * 60 * 60).optional(),
  label: z.string().trim().max(80).optional(),
}).refine(
  (value) =>
    typeof value.durationMinutes === "number" ||
    typeof value.durationSeconds === "number",
  {
    message: "Geef durationMinutes of durationSeconds mee",
  },
);

const getQuerySchema = z.object({
  mirrorId: z.string().min(1),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = getQuerySchema.safeParse({
    mirrorId: url.searchParams.get("mirrorId"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "mirrorId ontbreekt" }, { status: 400 });
  }

  const { mirrorId } = parsed.data;
  const hasAccess = await userCanAccessMirror(user.id, mirrorId);

  if (!hasAccess) {
    return NextResponse.json({ error: "Geen toegang tot spiegel" }, { status: 403 });
  }

  await cleanupExpiredActiveTimers({ mirrorId });

  const timers = await prisma.timer.findMany({
    where: {
      mirrorId,
      status: "ACTIVE",
      endsAt: {
        gt: new Date(),
      },
    },
    include: {
      requestedBy: {
        select: {
          displayName: true,
          email: true,
        },
      },
    },
    orderBy: {
      endsAt: "asc",
    },
    take: 30,
  });

  return NextResponse.json({
    ok: true,
    timers: timers.map((timer) => ({
      id: timer.id,
      label: timer.label,
      durationSeconds: timer.durationSeconds,
      endsAt: timer.endsAt.toISOString(),
      greetingName: timer.greetingName,
      requestedBy: timer.requestedBy.displayName ?? timer.requestedBy.email,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige input" }, { status: 400 });
  }

  const { mirrorId, durationMinutes, durationSeconds, label } = parsed.data;

  const hasAccess = await userCanAccessMirror(user.id, mirrorId);

  if (!hasAccess) {
    return NextResponse.json({ error: "Geen toegang tot spiegel" }, { status: 403 });
  }

  const timerDurationSeconds =
    typeof durationSeconds === "number"
      ? durationSeconds
      : (durationMinutes ?? 1) * 60;
  const endsAt = new Date(Date.now() + timerDurationSeconds * 1000);

  const timer = await prisma.timer.create({
    data: {
      mirrorId,
      requestedById: user.id,
      durationSeconds: timerDurationSeconds,
      endsAt,
      label: label || null,
      greetingName: buildGreetingName(user.displayName, user.email),
    },
  });

  broadcastToMirror(mirrorId, {
    type: "timer_created",
    timer: {
      id: timer.id,
      label: timer.label,
      durationSeconds: timer.durationSeconds,
      endsAt: timer.endsAt.toISOString(),
      greetingName: timer.greetingName,
    },
  });

  return NextResponse.json({
    ok: true,
    timer: {
      id: timer.id,
      label: timer.label,
      durationSeconds: timer.durationSeconds,
      endsAt: timer.endsAt.toISOString(),
      greetingName: timer.greetingName,
    },
  });
}
