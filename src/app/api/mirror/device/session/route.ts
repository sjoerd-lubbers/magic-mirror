import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getAppUrlFromHeaders } from "@/lib/config";
import {
  ensurePendingMirrorClaimSession,
  getMirrorClaimSession,
  normalizeClaimToken,
} from "@/lib/mirror-claim";

export const runtime = "nodejs";

function buildPairUrl(token: string, request: Request) {
  const appUrl = getAppUrlFromHeaders(request.headers);
  return `${appUrl}/dashboard/pair?source=mirror&claimToken=${encodeURIComponent(token)}`;
}

async function buildQrDataUrl(url: string) {
  return QRCode.toDataURL(url, {
    margin: 1,
    width: 280,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { token?: string }
    | null;
  const tokenToReuse = normalizeClaimToken(body?.token ?? "");
  const session = await ensurePendingMirrorClaimSession(tokenToReuse);
  const pairUrl = buildPairUrl(session.token, request);
  const qrDataUrl = await buildQrDataUrl(pairUrl);
  return NextResponse.json({
    ok: true,
    status: "pending",
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    pairUrl,
    qrDataUrl,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = normalizeClaimToken(url.searchParams.get("token") ?? "");

  if (!token) {
    return NextResponse.json({ ok: false, error: "claim token ontbreekt" }, { status: 400 });
  }

  const session = await getMirrorClaimSession(token);

  if (!session) {
    return NextResponse.json({ ok: true, status: "expired" });
  }

  if (session.claimedAt && session.mirrorId) {
    return NextResponse.json({
      ok: true,
      status: "claimed",
      mirrorId: session.mirrorId,
    });
  }

  if (session.expiresAt <= new Date()) {
    return NextResponse.json({ ok: true, status: "expired" });
  }

  return NextResponse.json({
    ok: true,
    status: "pending",
    expiresAt: session.expiresAt.toISOString(),
  });
}
