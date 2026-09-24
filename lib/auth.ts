// Minimal cookie session: a signed `username.expiry` token.
// Uses Web Crypto so it works in both middleware (edge) and route handlers (node).

export const SESSION_COOKIE = "n8nforge_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "admin";
// Local-dev fallback; set AUTH_SECRET in production so tokens can't be forged
const DEFAULT_SECRET = "n8n-forge-local-dev-secret";

export function getCredentials() {
  return {
    username: process.env.AUTH_USERNAME || DEFAULT_USERNAME,
    password: process.env.AUTH_PASSWORD || DEFAULT_PASSWORD,
  };
}

export function usingDefaultCredentials(): boolean {
  return !process.env.AUTH_USERNAME && !process.env.AUTH_PASSWORD;
}

const encoder = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(process.env.AUTH_SECRET || DEFAULT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (compares HMACs so lengths never leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([hmac(`cmp:${a}`), hmac(`cmp:${b}`)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(username: string): Promise<string> {
  const payload = `${encodeURIComponent(username)}.${Date.now() + SESSION_MAX_AGE * 1000}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return false;
  const payload = token.slice(0, lastDot);
  const expiry = Number(payload.split(".")[1]);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  return safeEqual(token.slice(lastDot + 1), await hmac(payload));
}
