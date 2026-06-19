export const ADMIN_SESSION_COOKIE = "geekshare_admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

type AdminSession = {
  username: string;
  expiresAt: number;
};

const encoder = new TextEncoder();

function getSessionSecret() {
  return process.env.SESSION_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getSigningKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createAdminSessionToken(username: string) {
  const secret = getSessionSecret();

  if (!secret) {
    return null;
  }

  const session: AdminSession = {
    username,
    expiresAt: Date.now() + ADMIN_SESSION_MAX_AGE * 1000,
  };
  const payload = bytesToBase64Url(
    encoder.encode(JSON.stringify(session)),
  );
  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );

  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAdminSessionToken(token?: string | null) {
  const secret = getSessionSecret();

  if (!secret || !token) {
    return null;
  }

  const [payload, signature, extra] = token.split(".");

  if (!payload || !signature || extra) {
    return null;
  }

  try {
    const key = await getSigningKey(secret);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      encoder.encode(payload),
    );

    if (!isValid) {
      return null;
    }

    const session = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payload)),
    ) as Partial<AdminSession>;
    const configuredUsername = process.env.ADMIN_USERNAME;

    if (
      !configuredUsername ||
      typeof session.username !== "string" ||
      session.username !== configuredUsername ||
      typeof session.expiresAt !== "number" ||
      session.expiresAt <= Date.now()
    ) {
      return null;
    }

    return session as AdminSession;
  } catch {
    return null;
  }
}
