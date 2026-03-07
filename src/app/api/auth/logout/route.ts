import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("mm_session")?.value;

  if (token) {
    await prisma.session.deleteMany({
      where: { token },
    });
  }

  await clearSessionCookie();

  return NextResponse.json({ ok: true });
}
