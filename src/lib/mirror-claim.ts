import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CLAIM_MINUTES = 15;
const MAX_CREATE_ATTEMPTS = 8;

function createClaimToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function normalizeClaimToken(input: string | null | undefined) {
  const token = (input ?? "").trim();
  return token.length > 0 ? token : "";
}

export async function createMirrorClaimSession() {
  const expiresAt = new Date(Date.now() + CLAIM_MINUTES * 60 * 1000);

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    const token = createClaimToken();

    try {
      return await prisma.mirrorClaimSession.create({
        data: {
          token,
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

  throw new Error("Kon geen unieke claim-token voor spiegel registreren");
}

export async function getPendingMirrorClaimSession(token: string) {
  return prisma.mirrorClaimSession.findFirst({
    where: {
      token,
      claimedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
  });
}

export async function getMirrorClaimSession(token: string) {
  return prisma.mirrorClaimSession.findUnique({
    where: {
      token,
    },
  });
}

export async function ensurePendingMirrorClaimSession(token: string) {
  const normalizedToken = normalizeClaimToken(token);

  if (normalizedToken) {
    const existing = await getPendingMirrorClaimSession(normalizedToken);
    if (existing) {
      return existing;
    }
  }

  return createMirrorClaimSession();
}

export async function claimMirrorSession({
  token,
  mirrorId,
}: {
  token: string;
  mirrorId: string;
}) {
  const now = new Date();
  const updated = await prisma.mirrorClaimSession.updateMany({
    where: {
      token,
      claimedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    data: {
      mirrorId,
      claimedAt: now,
    },
  });

  if (updated.count === 0) {
    return null;
  }

  return getMirrorClaimSession(token);
}
