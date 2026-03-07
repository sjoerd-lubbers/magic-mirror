import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSession,
  hashVerificationCode,
  normalizeEmail,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  email: z.email(),
  code: z.string().length(6),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige input" }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  const code = parsed.data.code;

  const verification = await prisma.verificationCode.findFirst({
    where: {
      email,
      purpose: "LOGIN",
      consumedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      user: true,
    },
  });

  if (!verification) {
    return NextResponse.json({ error: "Code is ongeldig of verlopen" }, { status: 400 });
  }

  const expectedHash = hashVerificationCode(email, code);
  const expected = Buffer.from(expectedHash);
  const actual = Buffer.from(verification.codeHash);

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: "Code is ongeldig of verlopen" }, { status: 400 });
  }

  await prisma.verificationCode.update({
    where: { id: verification.id },
    data: { consumedAt: new Date() },
  });

  await createSession(verification.userId);

  return NextResponse.json({
    ok: true,
    user: {
      id: verification.user.id,
      email: verification.user.email,
      displayName: verification.user.displayName,
    },
  });
}
