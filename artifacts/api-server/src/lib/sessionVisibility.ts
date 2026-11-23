type GalleryAssetVisibilityInput = {
  assetType: string;
  displayOrder: number;
};

const REQUIRED_PUBLIC_STILL_DISPLAY_ORDERS = [1, 2, 3, 4] as const;

export function hasCompletePublicGalleryAssets(
  assets: GalleryAssetVisibilityInput[],
): boolean {
  if (assets.length !== REQUIRED_PUBLIC_STILL_DISPLAY_ORDERS.length + 1) return false;

  const stills = assets.filter((asset) => asset.assetType === "image");
  const motionReels = assets.filter(
    (asset) => asset.assetType === "video" && asset.displayOrder === 0,
  );
  if (stills.length !== REQUIRED_PUBLIC_STILL_DISPLAY_ORDERS.length) return false;
  if (motionReels.length !== 1) return false;

  const stillDisplayOrders = new Set(stills.map((asset) => asset.displayOrder));
  if (stillDisplayOrders.size !== stills.length) return false;

  const hasRequiredStills = REQUIRED_PUBLIC_STILL_DISPLAY_ORDERS.every((displayOrder) =>
    stillDisplayOrders.has(displayOrder),
  );
  return hasRequiredStills;
}

export function canExposeGeneratedAssetsToSharePage(status: string): boolean {
  return status === "ready";
}

export function canReadGeneratedAssetWithShareToken(
  status: string,
  assets: GalleryAssetVisibilityInput[],
): boolean {
  return canExposeGeneratedAssetsToSharePage(status) && hasCompletePublicGalleryAssets(assets);
}

/**
 * A remote try-on session holds looks, not the four-still-plus-reel wedding
 * gallery bundle. Each look is a single image; a session is a try-on when every
 * generated asset is an image and there is at least one. A wedding gallery only
 * reaches "ready" with its full bundle (which includes a video reel), so this
 * never widens visibility into a partially-generated gallery.
 */
export function isTryonLookSession(assets: GalleryAssetVisibilityInput[]): boolean {
  if (assets.length === 0) return false;
  return assets.every((asset) => asset.assetType === "image");
}

export function canReadTryonLookWithShareToken(
  status: string,
  assets: GalleryAssetVisibilityInput[],
): boolean {
  return canExposeGeneratedAssetsToSharePage(status) && isTryonLookSession(assets);
}
