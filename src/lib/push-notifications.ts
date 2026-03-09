import webpush from "web-push";
import { getWebPushConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";

type PushMessage = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
};

type UpsertPushSubscriptionInput = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let pushConfigured = false;
let pushConfiguredAttempted = false;

function ensurePushConfigured() {
  if (pushConfiguredAttempted) {
    return pushConfigured;
  }

  pushConfiguredAttempted = true;
  const config = getWebPushConfig();

  if (!config.enabled) {
    pushConfigured = false;
    return false;
  }

  try {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    pushConfigured = true;
  } catch (error) {
    console.error("Web push configuratie ongeldig", { error });
    pushConfigured = false;
  }

  return pushConfigured;
}

export function getPushPublicKey() {
  const config = getWebPushConfig();
  return config.enabled ? config.publicKey : null;
}

export function isPushEnabled() {
  return ensurePushConfigured();
}

export async function upsertPushSubscription(input: UpsertPushSubscriptionInput) {
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: {
      userId: input.userId,
      p256dh: input.p256dh,
      auth: input.auth,
    },
    create: {
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
    },
  });
}

export async function removePushSubscription({
  endpoint,
  userId,
}: {
  endpoint: string;
  userId?: string;
}) {
  await prisma.pushSubscription.deleteMany({
    where: {
      endpoint,
      ...(userId ? { userId } : {}),
    },
  });
}

function shouldDeleteSubscriptionOnError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const statusCode =
    "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : null;
  const status =
    "status" in error && typeof error.status === "number" ? error.status : null;

  return statusCode === 404 || statusCode === 410 || status === 404 || status === 410;
}

export async function sendPushToUser(userId: string, message: PushMessage) {
  if (!ensurePushConfigured()) {
    return { sent: 0, failed: 0, removed: 0, skipped: true };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: {
      endpoint: true,
      p256dh: true,
      auth: true,
    },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, removed: 0, skipped: false };
  }

  let sent = 0;
  let failed = 0;
  let removed = 0;
  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    tag: message.tag,
    data: {
      url: message.url ?? "/dashboard/mobile",
    },
  });

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
        {
          TTL: 60,
          urgency: "high",
        },
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("Push versturen mislukt", {
        endpoint: subscription.endpoint,
        error,
      });

      if (shouldDeleteSubscriptionOnError(error)) {
        await removePushSubscription({ endpoint: subscription.endpoint });
        removed += 1;
      }
    }
  }

  return { sent, failed, removed, skipped: false };
}
