import { NextResponse } from "next/server";
import { z } from "zod";
import { buildGreetingName, getCurrentUser } from "@/lib/auth";
import { userCanAccessMirror } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import {
  buildTimerAnnouncementAudioKey,
  buildTimerAnnouncementMessage,
  prepareTimerAnnouncementAudio,
} from "@/lib/timer-announcement-audio";
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

const cancelSchema = z.object({
  timerId: z.string().min(1),
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
      announcementAudioKey: buildTimerAnnouncementAudioKey(
        buildTimerAnnouncementMessage({
          greetingName: timer.greetingName,
          durationSeconds: timer.durationSeconds,
        }),
      ),
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

  const announcementMessage = buildTimerAnnouncementMessage({
    greetingName: timer.greetingName,
    durationSeconds: timer.durationSeconds,
  });
  const announcementAudioKey = buildTimerAnnouncementAudioKey(announcementMessage);

  try {
    await prepareTimerAnnouncementAudio(announcementMessage);
  } catch (error) {
    console.error("Timer announcement audio voorbereiden mislukt", {
      timerId: timer.id,
      error,
    });
  }

  broadcastToMirror(mirrorId, {
    type: "timer_created",
    timer: {
      id: timer.id,
      label: timer.label,
      durationSeconds: timer.durationSeconds,
      endsAt: timer.endsAt.toISOString(),
      greetingName: timer.greetingName,
      announcementAudioKey,
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
      announcementAudioKey,
    },
  });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = cancelSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "timerId ontbreekt" }, { status: 400 });
  }

  const timer = await prisma.timer.findUnique({
    where: { id: parsed.data.timerId },
    select: {
      id: true,
      mirrorId: true,
      status: true,
    },
  });

  if (!timer) {
    return NextResponse.json({ error: "Timer niet gevonden" }, { status: 404 });
  }

  const hasAccess = await userCanAccessMirror(user.id, timer.mirrorId);

  if (!hasAccess) {
    return NextResponse.json({ error: "Geen toegang tot spiegel" }, { status: 403 });
  }

  if (timer.status !== "ACTIVE") {
    return NextResponse.json({ error: "Timer is niet meer actief" }, { status: 409 });
  }

  const canceledAt = new Date();
  const result = await prisma.timer.updateMany({
    where: {
      id: timer.id,
      status: "ACTIVE",
    },
    data: {
      status: "CANCELED",
      completedAt: canceledAt,
    },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Timer is niet meer actief" }, { status: 409 });
  }

  broadcastToMirror(timer.mirrorId, {
    type: "timer_canceled",
    timerId: timer.id,
  });

  return NextResponse.json({
    ok: true,
    timerId: timer.id,
  });
}
