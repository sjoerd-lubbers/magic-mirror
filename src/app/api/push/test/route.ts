import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push-notifications";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const result = await sendPushToUser(user.id, {
    title: "Test push",
    body: "Deze melding komt van Magic Mirror.",
    tag: "test-push",
    url: "/dashboard/mobile",
  });

  return NextResponse.json({
    ok: true,
    result,
  });
}
