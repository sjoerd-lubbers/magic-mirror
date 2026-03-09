import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-notifications";

function formatDurationLabel(durationSeconds: number) {
  if (durationSeconds < 60) {
    return `${durationSeconds} seconden`;
  }

  const minutes = Math.round(durationSeconds / 60);
  return `${minutes} minuten`;
}

export async function cleanupExpiredActiveTimers({
  mirrorId,
  notifyPush = true,
  maxBatch = 100,
}: {
  mirrorId?: string;
  notifyPush?: boolean;
  maxBatch?: number;
} = {}) {
  const dueTimers = await prisma.timer.findMany({
    where: {
      status: "ACTIVE",
      endsAt: {
        lte: new Date(),
      },
      ...(mirrorId ? { mirrorId } : {}),
    },
    include: {
      mirror: {
        select: {
          id: true,
          name: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
        },
      },
    },
    orderBy: {
      endsAt: "asc",
    },
    take: Math.max(1, maxBatch),
  });

  let completedCount = 0;

  for (const timer of dueTimers) {
    const completedAt = new Date();
    const result = await prisma.timer.updateMany({
      where: {
        id: timer.id,
        status: "ACTIVE",
      },
      data: {
        status: "COMPLETED",
        completedAt,
        announcedAt: completedAt,
      },
    });

    if (result.count === 0) {
      continue;
    }

    completedCount += 1;

    if (!notifyPush) {
      continue;
    }

    const timerLabel = timer.label?.trim()
      ? timer.label.trim()
      : `timer van ${formatDurationLabel(timer.durationSeconds)}`;
    const mirrorName = timer.mirror.name.trim() || "je spiegel";
    const pushResult = await sendPushToUser(timer.requestedBy.id, {
      title: "Timer klaar",
      body: `${timerLabel} op ${mirrorName} is klaar.`,
      tag: `timer-${timer.id}`,
      url: `/dashboard/mobile?mirrorId=${encodeURIComponent(timer.mirror.id)}`,
    });
    console.info("Timer push verwerkt", {
      timerId: timer.id,
      userId: timer.requestedBy.id,
      sent: pushResult.sent,
      failed: pushResult.failed,
      removed: pushResult.removed,
      skipped: pushResult.skipped,
    });
  }

  return completedCount;
}
