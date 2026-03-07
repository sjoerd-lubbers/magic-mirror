import nodemailer from "nodemailer";
import { getSmtpConfig } from "@/lib/config";

function isLocalHost(host: string) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function createTransporter(host: string) {
  const smtp = getSmtpConfig();
  const usingLocalHost = isLocalHost(host);

  return nodemailer.createTransport({
    host,
    port: smtp.port,
    secure: smtp.secure,
    ignoreTLS: usingLocalHost ? smtp.ignoreTLS : false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: {
      rejectUnauthorized: usingLocalHost ? false : smtp.tlsRejectUnauthorized,
    },
    auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
}

async function sendWithHost({
  host,
  to,
  code,
}: {
  host: string;
  to: string;
  code: string;
}) {
  const smtp = getSmtpConfig();
  const transporter = createTransporter(host);
  await transporter.sendMail({
    from: smtp.from,
    to,
    subject: "Je Magic Mirror inlogcode",
    text: `Je inlogcode is ${code}. Deze code is 10 minuten geldig.`,
  });
}

function uniqueHosts(hosts: string[]) {
  return [...new Set(hosts.filter((host) => host.trim().length > 0))];
}

export async function sendLoginCodeEmail({
  to,
  code,
}: {
  to: string;
  code: string;
}) {
  const smtp = getSmtpConfig();
  const hostsToTry = isLocalHost(smtp.host)
    ? uniqueHosts([smtp.host, "localhost", "127.0.0.1", "::1"])
    : [smtp.host];
  let lastError: unknown = null;

  for (const host of hostsToTry) {
    try {
      await sendWithHost({ host, to, code });
      return {
        usedHost: host,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
