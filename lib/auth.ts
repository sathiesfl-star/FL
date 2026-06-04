/**
 * Lightweight password-gate auth for this internal tool.
 * One shared APP_PASSWORD opens the app. On success we set a signed (HMAC) cookie,
 * so it can't be forged. The middleware checks this cookie on every request.
 *
 * Edge-runtime safe: uses Web Crypto (works in Next middleware).
 */

const COOKIE_NAME = "bidcopilot_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  return process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
}

async function hmac(value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build the cookie value: a fixed payload + its signature. */
export async function makeSessionValue(): Promise<string> {
  const payload = "ok"; // single-user gate; payload is constant
  const sig = await hmac(payload);
  return `${payload}.${sig}`;
}

/** Verify a cookie value was signed by us. */
export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const [payload, sig] = cookieValue.split(".");
  if (payload !== "ok" || !sig) return false;
  const expected = await hmac(payload);
  // constant-time-ish compare
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Check a submitted password against APP_PASSWORD. */
export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD || "";
  return !!expected && input === expected;
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = COOKIE_MAX_AGE;
