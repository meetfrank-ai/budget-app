import { SignJWT } from "jose";

export const SESSION_COOKIE = "budget_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function signSession(secret: string): Promise<string> {
  return new SignJWT({ ok: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode(secret));
}

// In-memory per-IP attempt counter. Resets on deploy (and Render restarts
// processes often enough that this stays "good enough" for a single user
// behind an obscure URL). If two IPs hit in parallel the window is merged;
// fine for this threat model.
type AttemptRecord = { count: number; lockedUntil: number };
const attempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export function isLockedOut(ip: string): number {
  const rec = attempts.get(ip);
  if (!rec) return 0;
  if (rec.lockedUntil > Date.now()) return rec.lockedUntil - Date.now();
  return 0;
}

export function recordFailure(ip: string): number {
  const rec = attempts.get(ip) ?? { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    rec.count = 0;
  }
  attempts.set(ip, rec);
  return rec.lockedUntil;
}

export function clearAttempts(ip: string) {
  attempts.delete(ip);
}
