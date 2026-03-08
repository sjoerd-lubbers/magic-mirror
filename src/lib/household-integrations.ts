import crypto from "crypto";
import { getICloudCalendarConfig, getTodoistConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";

const ENCRYPTION_PREFIX = "enc:v1";

function integrationEncryptionKey() {
  const secret =
    process.env.INTEGRATIONS_ENCRYPTION_KEY ??
    process.env.AUTH_CODE_SECRET ??
    "dev-only-auth-code-secret";

  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSecret(plainText: string) {
  const value = plainText.trim();
  if (!value) {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", integrationEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(encryptedValue: string | null | undefined) {
  if (!encryptedValue) {
    return "";
  }

  if (!encryptedValue.startsWith(`${ENCRYPTION_PREFIX}:`)) {
    return encryptedValue;
  }

  const parts = encryptedValue.split(":");
  if (parts.length !== 5) {
    return "";
  }

  const iv = Buffer.from(parts[2] ?? "", "base64");
  const tag = Buffer.from(parts[3] ?? "", "base64");
  const encrypted = Buffer.from(parts[4] ?? "", "base64");

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", integrationEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

function toPositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

export async function getHouseholdIntegrationSettings(householdId: string) {
  return prisma.householdIntegrationSettings.findUnique({
    where: { householdId },
  });
}

export async function getHouseholdCalendarRuntimeConfig(householdId: string) {
  const fallback = getICloudCalendarConfig();
  const stored = await getHouseholdIntegrationSettings(householdId);
  const username = decryptSecret(stored?.iCloudUsernameEnc).trim();
  const password = decryptSecret(stored?.iCloudPasswordEnc).trim();

  if (username && password) {
    return {
      source: "household" as const,
      baseUrl: stored?.iCloudCalDavUrl?.trim() || fallback.baseUrl,
      username,
      password,
      cacheSeconds:
        stored?.calendarCacheSeconds && stored.calendarCacheSeconds > 0
          ? stored.calendarCacheSeconds
          : fallback.cacheSeconds,
    };
  }

  return {
    source: "env" as const,
    baseUrl: fallback.baseUrl,
    username: fallback.username.trim(),
    password: fallback.password.trim(),
    cacheSeconds: fallback.cacheSeconds,
  };
}

export async function getHouseholdTodoistRuntimeConfig(householdId: string) {
  const fallback = getTodoistConfig();
  const stored = await getHouseholdIntegrationSettings(householdId);
  const apiToken = decryptSecret(stored?.todoistApiTokenEnc).trim();

  if (apiToken) {
    return {
      source: "household" as const,
      apiToken,
      projectId: stored?.todoistProjectId?.trim() ?? "",
      cacheSeconds:
        stored?.todoistCacheSeconds && stored.todoistCacheSeconds > 0
          ? stored.todoistCacheSeconds
          : fallback.cacheSeconds,
    };
  }

  return {
    source: "env" as const,
    apiToken: fallback.apiToken.trim(),
    projectId: fallback.projectId.trim(),
    cacheSeconds: fallback.cacheSeconds,
  };
}

export async function saveHouseholdICloudSettings({
  householdId,
  baseUrl,
  usernameToSet,
  passwordToSet,
  cacheSecondsRaw,
}: {
  householdId: string;
  baseUrl: string;
  usernameToSet?: string;
  passwordToSet?: string;
  cacheSecondsRaw: string;
}) {
  const existing = await getHouseholdIntegrationSettings(householdId);
  const nextCacheSeconds = toPositiveInt(cacheSecondsRaw, 300);

  await prisma.householdIntegrationSettings.upsert({
    where: { householdId },
    create: {
      householdId,
      iCloudCalDavUrl: baseUrl.trim() || null,
      iCloudUsernameEnc: encryptSecret(usernameToSet ?? ""),
      iCloudPasswordEnc: encryptSecret(passwordToSet ?? ""),
      calendarCacheSeconds: nextCacheSeconds,
    },
    update: {
      iCloudCalDavUrl: baseUrl.trim() || null,
      iCloudUsernameEnc:
        usernameToSet !== undefined
          ? encryptSecret(usernameToSet)
          : existing?.iCloudUsernameEnc ?? null,
      iCloudPasswordEnc:
        passwordToSet !== undefined
          ? encryptSecret(passwordToSet)
          : existing?.iCloudPasswordEnc ?? null,
      calendarCacheSeconds: nextCacheSeconds,
    },
  });
}

export async function clearHouseholdICloudSettings(householdId: string) {
  await prisma.householdIntegrationSettings.upsert({
    where: { householdId },
    create: {
      householdId,
      iCloudCalDavUrl: null,
      iCloudUsernameEnc: null,
      iCloudPasswordEnc: null,
    },
    update: {
      iCloudCalDavUrl: null,
      iCloudUsernameEnc: null,
      iCloudPasswordEnc: null,
    },
  });
}

export async function saveHouseholdTodoistSettings({
  householdId,
  apiTokenToSet,
  projectId,
  cacheSecondsRaw,
}: {
  householdId: string;
  apiTokenToSet?: string;
  projectId: string;
  cacheSecondsRaw: string;
}) {
  const existing = await getHouseholdIntegrationSettings(householdId);
  const nextCacheSeconds = toPositiveInt(cacheSecondsRaw, 60);

  await prisma.householdIntegrationSettings.upsert({
    where: { householdId },
    create: {
      householdId,
      todoistApiTokenEnc: encryptSecret(apiTokenToSet ?? ""),
      todoistProjectId: projectId.trim() || null,
      todoistCacheSeconds: nextCacheSeconds,
    },
    update: {
      todoistApiTokenEnc:
        apiTokenToSet !== undefined
          ? encryptSecret(apiTokenToSet)
          : existing?.todoistApiTokenEnc ?? null,
      todoistProjectId: projectId.trim() || null,
      todoistCacheSeconds: nextCacheSeconds,
    },
  });
}

export async function clearHouseholdTodoistSettings(householdId: string) {
  await prisma.householdIntegrationSettings.upsert({
    where: { householdId },
    create: {
      householdId,
      todoistApiTokenEnc: null,
      todoistProjectId: null,
    },
    update: {
      todoistApiTokenEnc: null,
      todoistProjectId: null,
    },
  });
}
