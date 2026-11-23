import type { Request } from "express";

function normalizeIp(value: string | undefined): string | null {
  const ip = value?.trim();
  if (!ip) return null;
  if (ip.startsWith("::ffff:")) return ip.slice("::ffff:".length);
  return ip;
}

export function clientKey(req: Request): string {
  return normalizeIp(req.ip) ?? normalizeIp(req.socket.remoteAddress) ?? "unknown";
}

interface RateBucket {
  count: number;
  resetAt: number;
  pendingPhotos?: Set<string>;
}

const rateBuckets = new Map<string, RateBucket>();
let lastPruneAt = 0;

function pruneExpiredBuckets(now: number): void {
  if (now - lastPruneAt < 60_000 && rateBuckets.size < 10_000) return;
  lastPruneAt = now;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt < now) rateBuckets.delete(key);
  }
}

function takeSlot(key: string, limit: number, windowMs: number): RateBucket | undefined {
  const now = Date.now();
  pruneExpiredBuckets(now);
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt < now) {
    const bucket = { count: 1, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
    return bucket;
  }
  if (existing.count >= limit) return undefined;
  existing.count += 1;
  return existing;
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  return Boolean(takeSlot(key, limit, windowMs));
}

// Unused upload URLs still consume their spam-protection slots. A bride who
// submits a photo for a funded look can immediately upload for her next gown.
export function reserveUploadSlot(address: string) {
  const bucket = takeSlot(`upload:${address}`, 120, 60 * 60 * 1000);
  if (!bucket) return undefined;
  return (objectKey: string) => {
    (bucket.pendingPhotos ??= new Set()).add(objectKey);
  };
}

export function releaseSubmittedPhoto(address: string, objectKey: string) {
  const bucket = rateBuckets.get(`upload:${address}`);
  if (bucket?.pendingPhotos?.delete(objectKey)) bucket.count--;
}
