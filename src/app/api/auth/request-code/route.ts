import { NextResponse } from "next/server";
import { z } from "zod";
import { MemberRole } from "@prisma/client";
import { createNumericCode, hashVerificationCode, normalizeEmail } from "@/lib/auth";
import { getSmtpConfig } from "@/lib/config";
import { sendLoginCodeEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  email: z.email(),
});

function defaultHouseholdName(email: string) {
  const localPart = email.split("@")[0] ?? "nieuw";
  return `Gezin ${localPart}`;
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige input" }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);

  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });

    if (existing) {
      return existing;
    }

    const createdUser = await tx.user.create({
      data: {
        email,
      },
    });

    await tx.household.create({
      data: {
        name: defaultHouseholdName(email),
        members: {
          create: {
            userId: createdUser.id,
            role: MemberRole.OWNER,
          },
        },
      },
    });

    return createdUser;
  });

  const code = createNumericCode();
  const codeHash = hashVerificationCode(email, code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.verificationCode.deleteMany({
    where: {
      email,
      purpose: "LOGIN",
      consumedAt: null,
    },
  });

  const verificationCode = await prisma.verificationCode.create({
    data: {
      userId: user.id,
      email,
      codeHash,
      purpose: "LOGIN",
      expiresAt,
    },
  });

  try {
    const sendResult = await sendLoginCodeEmail({
      to: email,
      code,
    });

    return NextResponse.json({
      ok: true,
      ...(process.env.NODE_ENV === "development"
        ? { debug: { smtpHostUsed: sendResult.usedHost } }
        : {}),
    });
  } catch (error) {
    await prisma.verificationCode.delete({
      where: { id: verificationCode.id },
    });

    const smtp = getSmtpConfig();
    const errorMessage =
      error instanceof Error ? error.message : "Onbekende SMTP fout";
    console.error("Kon logincode e-mail niet versturen", {
      smtpHost: smtp.host,
      smtpPort: smtp.port,
      error: errorMessage,
    });

    const debugDetail =
      process.env.NODE_ENV === "development"
        ? ` (SMTP ${smtp.host}:${smtp.port} - ${errorMessage})`
        : "";

    return NextResponse.json(
      process.env.NODE_ENV === "development"
        ? {
            ok: true,
            debug: {
              code,
              smtpHost: smtp.host,
              smtpPort: smtp.port,
              error: errorMessage,
            },
            warning: `SMTP verzending mislukt, gebruik tijdelijk deze code: ${code}.${debugDetail}`,
          }
        : {
            error:
              `Kon geen e-mail versturen. Controleer of MailHog/SMTP draait op localhost:1025 (UI: localhost:8025).${debugDetail}`,
          },
      { status: process.env.NODE_ENV === "development" ? 200 : 500 },
    );
  }
}
