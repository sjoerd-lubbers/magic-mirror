import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getMirrorClaimSession,
  normalizeClaimToken,
} from "@/lib/mirror-claim";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "ongeldige input" }, { status: 400 });
  }

  const token = normalizeClaimToken(parsed.data.token);
  const session = await getMirrorClaimSession(token);

  if (!session || !session.claimedAt || !session.mirrorId) {
    return NextResponse.json({ ok: false, error: "claim niet afgerond" }, { status: 409 });
  }

  const mirror = await prisma.mirror.findUnique({
    where: { id: session.mirrorId },
    select: { id: true },
  });

  if (!mirror) {
    return NextResponse.json({ ok: false, error: "spiegel niet gevonden" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    mirrorId: mirror.id,
    redirectTo: `/mirror/${mirror.id}`,
  });
}
