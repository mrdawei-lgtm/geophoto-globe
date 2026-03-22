import { Router } from "express";
import type { PhotoRecord } from "../types.js";
import { PhotoService } from "../services/photoService.js";

function buildClusters(photos: PhotoRecord[], deviceTier: string) {
  const step = deviceTier === "mobile" ? 18 : deviceTier === "low" ? 14 : 10;
  const groups = new Map<string, { latitude: number; longitude: number; count: number; coverThumbnailUrl: string; id: string }>();
  for (const photo of photos) {
    const latitude = photo.latitude ?? 0;
    const longitude = photo.longitude ?? 0;
    const key = `${Math.round(latitude / step)}:${Math.round(longitude / step)}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      group.latitude = (group.latitude + latitude) / 2;
      group.longitude = (group.longitude + longitude) / 2;
    } else {
      groups.set(key, {
        id: key,
        latitude,
        longitude,
        count: 1,
        coverThumbnailUrl: photo.thumbnailUrl
      });
    }
  }
  return Array.from(groups.values());
}

function dedupePhotosByExactCoordinates(photos: PhotoRecord[]) {
  const groups = new Map<string, PhotoRecord>();
  for (const photo of photos) {
    groups.set(`${photo.latitude}:${photo.longitude}`, groups.get(`${photo.latitude}:${photo.longitude}`) ?? photo);
  }
  return Array.from(groups.values());
}

function visibleItems(photos: PhotoRecord[], deviceTier: string) {
  const max = deviceTier === "mobile" ? 18 : deviceTier === "low" ? 28 : 42;
  return dedupePhotosByExactCoordinates(photos)
    .slice(0, max)
    .map((photo) => ({
      id: photo.id,
      latitude: photo.latitude,
      longitude: photo.longitude,
      thumbnailUrl: photo.thumbnailUrl,
      title: photo.title
    }));
}

function sortPublicPhotos(photos: PhotoRecord[]) {
  return [...photos].sort((a, b) => (b.capturedAt || "").localeCompare(a.capturedAt || ""));
}

function serializePublicPhoto(photo: PhotoRecord) {
  return {
    id: photo.id,
    imageUrl: photo.displayImageUrl,
    title: photo.title,
    description: photo.description,
    capturedAt: photo.capturedAt,
    locationLabel: photo.locationLabel,
    latitude: photo.latitude,
    longitude: photo.longitude
  };
}

export function createPublicRouter(photoService: PhotoService) {
  const router = Router();

  router.get("/photos", (req, res) => {
    const mode = req.query.mode === "items" ? "items" : "cluster";
    const deviceTier = String(req.query.deviceTier || "desktop");
    const photos = sortPublicPhotos(photoService.listPublicPhotos());
    res.json({
      mode,
      items: mode === "items" ? visibleItems(photos, deviceTier) : buildClusters(photos, deviceTier)
    });
  });

  router.get("/photos/:id", (req, res) => {
    const publicPhotos = sortPublicPhotos(photoService.listPublicPhotos());
    const photo = publicPhotos.find((item) => item.id === req.params.id) ?? null;
    if (!photo) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }
    const groupItems = publicPhotos.filter(
      (item) => item.latitude === photo.latitude && item.longitude === photo.longitude
    );
    const groupIndex = groupItems.findIndex((item) => item.id === photo.id);
    res.json({
      ...serializePublicPhoto(photo),
      groupItems: groupItems.map(serializePublicPhoto),
      groupIndex,
      groupCount: groupItems.length
    });
  });

  return router;
}
