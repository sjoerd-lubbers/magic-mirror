import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";
import { buildMirrorSettingsSnapshot } from "@/lib/mirror-settings";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ mirrorId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const membership = await getPrimaryHouseholdForUser(user.id);
  if (!membership) {
    return NextResponse.json({ error: "Geen huishouden gevonden" }, { status: 403 });
  }

  const canManageMirrors =
    membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  if (!canManageMirrors) {
    return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
  }

  const { mirrorId } = await params;

  const mirror = await prisma.mirror.findFirst({
    where: {
      id: mirrorId,
      householdId: membership.householdId,
    },
    include: {
      modules: true,
    },
  });

  if (!mirror) {
    return NextResponse.json({ error: "Spiegel niet gevonden" }, { status: 404 });
  }

  const snapshot = buildMirrorSettingsSnapshot(mirror);

  return new Response(JSON.stringify(snapshot, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"mirror-settings-${mirror.id}.json\"`,
    },
  });
}
