import { prisma } from "@/lib/prisma";

export async function getPrimaryHouseholdForUser(userId: string) {
  const membership = await prisma.householdMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      household: {
        include: {
          members: {
            include: {
              user: true,
            },
            orderBy: { createdAt: "asc" },
          },
          mirrors: {
            include: {
              modules: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  return membership;
}

export async function userCanAccessMirror(userId: string, mirrorId: string) {
  const mirror = await prisma.mirror.findUnique({
    where: { id: mirrorId },
    select: { householdId: true },
  });

  if (!mirror) {
    return false;
  }

  const membership = await prisma.householdMember.findFirst({
    where: {
      userId,
      householdId: mirror.householdId,
    },
    select: { id: true },
  });

  return Boolean(membership);
}
