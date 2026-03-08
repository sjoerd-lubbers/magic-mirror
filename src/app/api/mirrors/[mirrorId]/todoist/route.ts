import { NextResponse } from "next/server";
import { readModuleConfig } from "@/lib/module-config";
import { prisma } from "@/lib/prisma";
import { getTodoistModuleData } from "@/lib/todoist";
import { getMirrorSubscriberCount } from "@/lib/ws-hub";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ mirrorId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { mirrorId } = await params;
  const subscriberCount = getMirrorSubscriberCount(mirrorId);

  if (subscriberCount === 0) {
    return NextResponse.json({
      ok: true,
      todoist: null,
      skipped: "mirror_offline",
    });
  }

  const mirror = await prisma.mirror.findUnique({
    where: {
      id: mirrorId,
    },
    select: {
      householdId: true,
      modules: {
        where: {
          type: "TODOIST",
        },
        select: {
          enabled: true,
          config: true,
        },
        take: 1,
      },
    },
  });

  const todoistModule = mirror?.modules[0];

  if (!mirror || !todoistModule?.enabled) {
    return NextResponse.json({ ok: true, todoist: null });
  }

  const config = readModuleConfig("TODOIST", todoistModule.config ?? null);
  const todoist = await getTodoistModuleData({
    householdId: mirror.householdId,
    projectId: config.projectId,
    maxVisible: config.maxVisible,
  });

  return NextResponse.json({
    ok: true,
    todoist,
  });
}
