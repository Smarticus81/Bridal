import type { Appearance } from "@clerk/types";

// The server injects the key into index.html at request time (see the
// api-server's serveIndexHtml), so a bundle built without
// VITE_CLERK_PUBLISHABLE_KEY still picks it up from the deployment
// environment. The runtime value wins so a rotated key needs no rebuild.
const runtimeKey =
  typeof document !== "undefined"
    ? document
        .querySelector('meta[name="clerk-publishable-key"]')
        ?.getAttribute("content")
        ?.trim()
    : undefined;

const rawKey =
  runtimeKey ||
  (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  null;

/**
 * The Clerk frontend-API host is base64-encoded inside the publishable key
 * (`pk_test_`/`pk_live_` + base64("<host>$")). Decoding it lets us validate
 * the key before handing it to ClerkProvider (an invalid key makes the
 * provider throw, blanking every page) and detect production keys served
 * from the wrong domain.
 */
function decodeFrontendApiHost(key: string): string | null {
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/=]+)$/.exec(key);
  if (!match) return null;
  try {
    const host = atob(match[1]).replace(/\$$/, "");
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host)) {
      return null;
    }
    return host.toLowerCase();
  } catch {
    return null;
  }
}

const frontendApiHost = rawKey ? decodeFrontendApiHost(rawKey) : null;

/**
 * Production keys (`pk_live_`) only work when the page is served from the
 * instance's domain or a subdomain of it — Clerk's API rejects every other
 * origin with a 400 and clerk-js never loads. Detect that here so owner
 * pages can explain the misconfiguration instead of rendering nothing.
 */
function detectDomainMismatch(): string | null {
  if (!rawKey?.startsWith("pk_live_") || !frontendApiHost) return null;
  if (typeof window === "undefined") return null;
  // Production frontend API hosts look like "clerk.<domain>".
  const domain = frontendApiHost.replace(/^clerk\./, "");
  const hostname = window.location.hostname.toLowerCase();
  if (hostname === domain || hostname.endsWith(`.${domain}`)) return null;
  return domain;
}

/** The domain the production key is locked to, when the page is served from elsewhere. */
export const clerkExpectedDomain = detectDomainMismatch();

export type ClerkStatus = "ready" | "missing" | "invalid-key" | "domain-mismatch";

export const clerkStatus: ClerkStatus = !rawKey
  ? "missing"
  : !frontendApiHost
    ? "invalid-key"
    : clerkExpectedDomain
      ? "domain-mismatch"
      : "ready";

export const CLERK_PUBLISHABLE_KEY = clerkStatus === "ready" ? rawKey : null;

export const clerkConfigured = clerkStatus === "ready";

export const studioAppearance: Appearance = {
  variables: {
    colorBackground: "#ffffff",
    colorInputBackground: "#faf9fd",
    colorText: "#211b30",
    colorInputText: "#211b30",
    colorTextSecondary: "#655e70",
    colorPrimary: "#5839ba",
    colorTextOnPrimaryBackground: "#ffffff",
    colorDanger: "#a23a32",
    colorSuccess: "#345b43",
    colorNeutral: "#211b30",
    borderRadius: "0.125rem",
    fontFamily: "'Chivo', system-ui, sans-serif",
  },
  elements: { card: "shadow-none border border-border", headerTitle: "font-display" },
};
