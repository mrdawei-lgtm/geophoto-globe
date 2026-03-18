import fs from "node:fs";
import path from "node:path";

export type VisibilityStatus = "visible" | "hidden";

export type PhotoRecord = {
  id: string;
  originalAssetPath: string;
  managedAssetPath: string;
  thumbnailUrl: string;
  displayImageUrl: string;
  title: string;
  description: string;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  hasGeo: boolean;
  locationLabel: string;
  visibilityStatus: VisibilityStatus;
  deletedAt: string | null;
  importedAt: string;
  updatedAt: string;
};

type PhotoStore = {
  photos: PhotoRecord[];
};

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dataFile = path.join(rootDir, "data", "photos.json");
const storageDir = path.join(rootDir, "storage");

function normalizeAssetPath(assetPath: string) {
  if (!assetPath) {
    return assetPath;
  }

  if (assetPath.startsWith(storageDir)) {
    return assetPath;
  }

  const marker = `${path.sep}storage${path.sep}`;
  const markerIndex = assetPath.lastIndexOf(marker);
  if (markerIndex < 0) {
    return assetPath;
  }

  return path.join(storageDir, assetPath.slice(markerIndex + marker.length));
}

function normalizePhoto(record: PhotoRecord) {
  return {
    ...record,
    originalAssetPath: normalizeAssetPath(record.originalAssetPath),
    managedAssetPath: normalizeAssetPath(record.managedAssetPath)
  };
}

function ensureStore() {
  if (!fs.existsSync(dataFile)) {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify({ photos: [] }, null, 2));
  }
}

export function loadStore(): PhotoStore {
  ensureStore();
  const rawStore = JSON.parse(fs.readFileSync(dataFile, "utf-8")) as PhotoStore;
  const normalizedStore = {
    photos: rawStore.photos.map(normalizePhoto)
  };

  if (JSON.stringify(rawStore) !== JSON.stringify(normalizedStore)) {
    saveStore(normalizedStore);
  }

  return normalizedStore;
}

export function saveStore(store: PhotoStore) {
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

export function listPhotos() {
  return loadStore().photos;
}

export function getPhoto(id: string) {
  return listPhotos().find((photo) => photo.id === id) ?? null;
}

export function upsertPhoto(record: PhotoRecord) {
  const store = loadStore();
  const index = store.photos.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    store.photos[index] = record;
  } else {
    store.photos.unshift(record);
  }
  saveStore(store);
}

export function updatePhoto(id: string, patch: Partial<PhotoRecord>) {
  const store = loadStore();
  const index = store.photos.findIndex((photo) => photo.id === id);
  if (index < 0) {
    return null;
  }
  store.photos[index] = { ...store.photos[index], ...patch, updatedAt: new Date().toISOString() };
  saveStore(store);
  return store.photos[index];
}

export function batchUpdate(ids: string[], patch: Partial<PhotoRecord>) {
  const idSet = new Set(ids);
  const store = loadStore();
  store.photos = store.photos.map((photo) =>
    idSet.has(photo.id)
      ? { ...photo, ...patch, updatedAt: new Date().toISOString() }
      : photo
  );
  saveStore(store);
  return store.photos.filter((photo) => idSet.has(photo.id));
}
