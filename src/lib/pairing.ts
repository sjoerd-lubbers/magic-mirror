import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PAIRING_MINUTES = 15;

function createDisplayCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createPairingCode({
  householdId,
  createdById,
}: {
  householdId: string;
  createdById: string;
}) {
  const expiresAt = new Date(Date.now() + PAIRING_MINUTES * 60 * 1000);
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const token = crypto.randomBytes(24).toString("base64url");
    const displayCode = createDisplayCode();

    try {
      return await prisma.mirrorPairingCode.create({
        data: {
          householdId,
          createdById,
          token,
          displayCode,
          expiresAt,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Kon geen unieke koppelcode genereren");
}

export async function getValidPairingCode(token: string) {
  return prisma.mirrorPairingCode.findFirst({
    where: {
      token,
      usedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
  });
}

export async function getValidPairingCodeByDisplayCode(code: string) {
  return prisma.mirrorPairingCode.findFirst({
    where: {
      displayCode: code,
      usedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
  });
}
