import { NextResponse } from "next/server";
import { readModuleConfig } from "@/lib/module-config";
import { prisma } from "@/lib/prisma";
import { getTodoistModuleData } from "@/lib/todoist";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ mirrorId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { mirrorId } = await params;

  const todoistModule = await prisma.mirrorModule.findUnique({
    where: {
      mirrorId_type: {
        mirrorId,
        type: "TODOIST",
      },
    },
    select: {
      enabled: true,
      config: true,
    },
  });

  if (!todoistModule?.enabled) {
    return NextResponse.json({ ok: true, todoist: null });
  }

  const config = readModuleConfig("TODOIST", todoistModule.config ?? null);
  const todoist = await getTodoistModuleData({
    projectId: config.projectId,
    maxVisible: config.maxVisible,
  });

  return NextResponse.json({
    ok: true,
    todoist,
  });
}
