import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPushPublicKey } from "@/lib/push-notifications";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const publicKey = getPushPublicKey();

  return NextResponse.json({
    enabled: Boolean(publicKey),
    publicKey,
  });
}
