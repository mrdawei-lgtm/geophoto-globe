import { Router } from "express";
import type { PhotoRecord } from "../types.js";
import { PhotoService } from "../services/photoService.js";

function buildClusters(
  photoGroups: Array<{ id: string; photoId: string; latitude: number; longitude: number; count: number; coverThumbnailUrl: string }>,
  deviceTier: string
) {
  const step = deviceTier === "mobile" ? 18 : deviceTier === "low" ? 14 : 10;
  const clustered = new Map<string, { latitude: number; longitude: number; count: number; coverThumbnailUrl: string; id: string }>();
  for (const groupItem of photoGroups) {
    const latitude = groupItem.latitude;
    const longitude = groupItem.longitude;
    const key = `${Math.round(latitude / step)}:${Math.round(longitude / step)}`;
    const group = clustered.get(key);
    if (group) {
      group.count += 1;
      group.latitude = (group.latitude + latitude) / 2;
      group.longitude = (group.longitude + longitude) / 2;
    } else {
      clustered.set(key, {
        id: groupItem.photoId,
        latitude,
        longitude,
        count: 1,
        coverThumbnailUrl: groupItem.coverThumbnailUrl
      });
    }
  }
  return Array.from(clustered.values());
}

function groupKey(photo: PhotoRecord) {
  return photo.photoGroupId ?? `${photo.latitude}:${photo.longitude}`;
}

function visibleItems(photos: PhotoRecord[], photoGroups: Array<{ photoId: string }>) {
  return photoGroups
    .map((group) => photos.find((photo) => photo.id === group.photoId))
    .filter((photo): photo is PhotoRecord => Boolean(photo))
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
    const publicGroups = photoService.listPublicPhotoGroups();
    res.json({
      mode,
      items: mode === "items" ? visibleItems(photos, publicGroups) : buildClusters(publicGroups, deviceTier)
    });
  });

  router.get("/photos/:id", (req, res) => {
    const publicPhotos = sortPublicPhotos(photoService.listPublicPhotos());
    const photo = publicPhotos.find((item) => item.id === req.params.id) ?? null;
    if (!photo) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }
    const groupItems = publicPhotos.filter((item) => groupKey(item) === groupKey(photo));
    const groupIndex = groupItems.findIndex((item) => item.id === photo.id);
    res.json({
      ...serializePublicPhoto(photo),
      geoPrimaryLabel: photo.geoSummaryEn || "Location unavailable",
      groupItems: groupItems.map(serializePublicPhoto),
      groupIndex,
      groupCount: groupItems.length
    });
  });

  return router;
}
