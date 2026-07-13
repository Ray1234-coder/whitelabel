import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// HMAC-signed state for the Stripe Connect OAuth round-trip, so the callback
// can trust which workspace initiated the flow. Keyed off the server-only
// Stripe secret key — never expose either.
export function signState(workspaceId: string, exp: number): string {
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const mac = createHmac("sha256", secret).update(`${workspaceId}|${exp}`).digest("hex");
  return Buffer.from(`${workspaceId}|${exp}|${mac}`).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const [workspaceId, expStr, mac] = Buffer.from(state, "base64url").toString().split("|");
    if (!workspaceId || !expStr || !mac) return null;
    if (Number(expStr) < Date.now()) return null;
    const secret = process.env.STRIPE_SECRET_KEY || "";
    const expected = createHmac("sha256", secret).update(`${workspaceId}|${expStr}`).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(mac);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return workspaceId;
  } catch {
    return null;
  }
}
