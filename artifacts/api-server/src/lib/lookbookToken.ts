import { randomBytes } from "crypto";

/**
 * Mint the opaque token that appears in a `/try/:lookbookToken` URL. It must be
 * unguessable (it is the only thing standing between the public and a bride's
 * try-on session — no account) and URL-safe. 18 random bytes → 24 base64url
 * chars, comfortably above the 16-char floor share tokens use elsewhere.
 */
export function mintLookbookToken(): string {
  return randomBytes(18).toString("base64url");
}

/** A token is well-formed if it is URL-safe and long enough to be unguessable. */
export function isWellFormedLookbookToken(token: string): boolean {
  return typeof token === "string" && /^[A-Za-z0-9_-]{16,}$/.test(token);
}
