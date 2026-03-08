import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";
import {
  getHouseholdCalendarRuntimeConfig,
  getHouseholdTodoistRuntimeConfig,
} from "@/lib/household-integrations";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const membership = await getPrimaryHouseholdForUser(user.id);
  if (!membership) {
    return NextResponse.json({ error: "Geen huishouden gevonden" }, { status: 403 });
  }

  const canManage =
    membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  if (!canManage) {
    return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
  }

  const calendar = await getHouseholdCalendarRuntimeConfig(membership.householdId);
  const todoist = await getHouseholdTodoistRuntimeConfig(membership.householdId);

  const snapshot = {
    version: 1,
    householdIntegration: {
      iCloud: {
        baseUrl: calendar.baseUrl,
        username: calendar.username,
        password: calendar.password,
        cacheSeconds: calendar.cacheSeconds,
      },
      todoist: {
        apiToken: todoist.apiToken,
        projectId: todoist.projectId,
        cacheSeconds: todoist.cacheSeconds,
      },
    },
  };

  return new Response(JSON.stringify(snapshot, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"integration-settings.json\"",
    },
  });
}
