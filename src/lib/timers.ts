import { prisma } from "@/lib/prisma";

export async function cleanupExpiredActiveTimers({
  mirrorId,
}: {
  mirrorId?: string;
} = {}) {
  const now = new Date();
  const result = await prisma.timer.updateMany({
    where: {
      status: "ACTIVE",
      endsAt: {
        lte: now,
      },
      ...(mirrorId ? { mirrorId } : {}),
    },
    data: {
      status: "COMPLETED",
      completedAt: now,
    },
  });

  return result.count;
}
