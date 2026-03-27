import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { WebSocketServer, type WebSocket } from "ws";
import { prisma } from "@/lib/prisma";
import { buildTimerAnnouncementAudioKey } from "@/lib/timer-announcement-key";
import { buildTimerAnnouncementMessage } from "@/lib/timer-announcement";

type TimerPayload = {
  id: string;
  label: string | null;
  durationSeconds: number;
  endsAt: string;
  greetingName: string | null;
  announcementAudioKey: string;
};

type MirrorEvent =
  | {
      type: "timer_created";
      timer: TimerPayload;
    }
  | {
      type: "timer_canceled";
      timerId: string;
    }
  | {
      type: "timers_snapshot";
      timers: TimerPayload[];
    }
  | {
      type: "module_updated";
      module: {
        type: string;
        enabled: boolean;
        config: unknown;
      };
    }
  | {
      type: "mirror_updated";
      mirror: {
        highContrastMonochrome?: boolean;
        showAlignmentGrid?: boolean;
        gridRows?: number;
      };
    }
  | {
      type: "timer_announcement_test";
      announcementVolume: number;
      announcementAudioKey?: string | null;
    };

type ConnectedClient = {
  id: string;
  socket: WebSocket;
  mirrorId: string | null;
};

type HubState = {
  clients: Set<ConnectedClient>;
  wsServer: WebSocketServer | null;
};

declare global {
  var __mirrorWsHubState: HubState | undefined;
}

function getHubState(): HubState {
  if (!global.__mirrorWsHubState) {
    global.__mirrorWsHubState = {
      clients: new Set<ConnectedClient>(),
      wsServer: null,
    };
  }

  return global.__mirrorWsHubState;
}

function safeParse(input: string) {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

function onMessage(client: ConnectedClient, rawMessage: string) {
  const payload = safeParse(rawMessage);

  if (!payload || typeof payload !== "object") {
    return;
  }

  const event = payload as { type?: string; mirrorId?: string };

  if (event.type === "subscribe" && typeof event.mirrorId === "string") {
    client.mirrorId = event.mirrorId;
    client.socket.send(
      JSON.stringify({ type: "subscribed", mirrorId: event.mirrorId }),
    );
    void sendTimersSnapshot(client, event.mirrorId).catch((error) => {
      console.error("WS timers snapshot mislukt", {
        clientId: client.id,
        mirrorId: event.mirrorId,
        error,
      });
    });
    console.info("WS client subscribed", {
      clientId: client.id,
      mirrorId: event.mirrorId,
    });
  }

  if (event.type === "refresh_timers" && client.mirrorId) {
    void sendTimersSnapshot(client, client.mirrorId).catch((error) => {
      console.error("WS refresh timers snapshot mislukt", {
        clientId: client.id,
        mirrorId: client.mirrorId,
        error,
      });
    });
  }
}

async function sendTimersSnapshot(client: ConnectedClient, mirrorId: string) {
  const timers = await prisma.timer.findMany({
    where: {
      mirrorId,
      status: "ACTIVE",
      endsAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      endsAt: "asc",
    },
    take: 50,
    select: {
      id: true,
      label: true,
      durationSeconds: true,
      endsAt: true,
      greetingName: true,
    },
  });

  if (client.socket.readyState !== client.socket.OPEN || client.mirrorId !== mirrorId) {
    return;
  }

  client.socket.send(
    JSON.stringify({
      type: "timers_snapshot",
      timers: timers.map((timer) => ({
        id: timer.id,
        label: timer.label,
        durationSeconds: timer.durationSeconds,
        endsAt: timer.endsAt.toISOString(),
        greetingName: timer.greetingName,
        announcementAudioKey: buildTimerAnnouncementAudioKey(
          buildTimerAnnouncementMessage({
            greetingName: timer.greetingName,
            durationSeconds: timer.durationSeconds,
          }),
        ),
      })),
    }),
  );
}

export function attachWebSocketServer(server: {
  on: (
    event: "upgrade",
    listener: (req: IncomingMessage, socket: Socket, head: Buffer) => void,
  ) => void;
}, options?: {
  forwardUpgrade?: (req: IncomingMessage, socket: Socket, head: Buffer) => void;
}) {
  const state = getHubState();

  if (state.wsServer) {
    return state.wsServer;
  }

  state.wsServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/ws")) {
      options?.forwardUpgrade?.(req, socket, head);
      return;
    }

    state.wsServer?.handleUpgrade(req, socket, head, (clientSocket) => {
      state.wsServer?.emit("connection", clientSocket, req);
    });
  });

  state.wsServer.on("connection", (socket) => {
    const client: ConnectedClient = {
      id: `ws-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      socket,
      mirrorId: null,
    };
    state.clients.add(client);

    console.info("WS client connected", { clientId: client.id });

    socket.on("message", (message) => {
      onMessage(client, message.toString());
    });

    socket.on("close", () => {
      state.clients.delete(client);
      console.info("WS client closed", { clientId: client.id });
    });
  });

  return state.wsServer;
}

export function broadcastToMirror(mirrorId: string, event: MirrorEvent) {
  const state = getHubState();
  const message = JSON.stringify(event);
  let delivered = 0;

  for (const client of state.clients) {
    if (client.mirrorId !== mirrorId) {
      continue;
    }

    if (client.socket.readyState === client.socket.OPEN) {
      client.socket.send(message);
      delivered += 1;
    }
  }

  console.info("WS broadcast event", {
    eventType: event.type,
    mirrorId,
    delivered,
    connectedClients: state.clients.size,
  });
}

export function getMirrorSubscriberCount(mirrorId: string) {
  const state = getHubState();
  let count = 0;

  for (const client of state.clients) {
    if (client.mirrorId !== mirrorId) {
      continue;
    }

    if (client.socket.readyState === client.socket.OPEN) {
      count += 1;
    }
  }

  return count;
}

export function hasMirrorSubscribers(mirrorId: string) {
  return getMirrorSubscriberCount(mirrorId) > 0;
}
