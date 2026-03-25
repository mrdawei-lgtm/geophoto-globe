import path from "node:path";
import { storageRoot } from "./config.js";

function getStorageRelativePath(assetPath: string) {
  if (!assetPath) {
    return null;
  }

  if (assetPath.startsWith(storageRoot)) {
    return path.relative(storageRoot, assetPath);
  }

  const normalized = assetPath.replace(/\\/g, "/");
  const marker = "/storage/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  return normalized.slice(markerIndex + marker.length);
}

export function normalizeStoredAssetPath(assetPath: string) {
  const relative = getStorageRelativePath(assetPath);
  if (relative === null) {
    return assetPath;
  }

  const segments = relative.split(/[\\/]+/).filter(Boolean);
  return segments.length ? path.join(storageRoot, ...segments) : storageRoot;
}
