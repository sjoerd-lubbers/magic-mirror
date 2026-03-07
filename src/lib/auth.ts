import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthCodeSecret, getCookieSecure } from "@/lib/config";

const SESSION_COOKIE_NAME = "mm_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: "USER" | "PLATFORM_ADMIN";
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createNumericCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function hashVerificationCode(email: string, code: string) {
  return crypto
    .createHash("sha256")
    .update(`${normalizeEmail(email)}:${code}:${getAuthCodeSecret()}`)
    .digest("hex");
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: getCookieSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function createSession(userId: string) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  await setSessionCookie(token, expiresAt);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: true,
    },
  });

  if (!session || session.expiresAt <= new Date()) {
    await prisma.session.deleteMany({ where: { token } });
    await clearSessionCookie();
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export function buildGreetingName(displayName: string | null, email: string) {
  if (displayName && displayName.trim()) {
    return displayName.trim();
  }

  return email.split("@")[0] ?? "daar";
}
