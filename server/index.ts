import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { appRoot, ingestUploadedFile, parseMetadata, toPublicPath, writeGpsToManagedExif } from "./image.js";
import { batchUpdate, getPhoto, listPhotos, PhotoRecord, updatePhoto, upsertPhoto } from "./store.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const upload = multer({ dest: path.join(appRoot, "uploads") });
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
const adminToken = crypto.createHash("sha256").update(adminPassword).digest("hex");

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/storage", express.static(path.join(appRoot, "storage")));

function readIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token !== adminToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function basePhotoFilter(photo: PhotoRecord) {
  return photo.visibilityStatus === "visible" && !photo.deletedAt && photo.hasGeo;
}

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
    const key = `${photo.latitude}:${photo.longitude}`;
    if (!groups.has(key)) {
      groups.set(key, photo);
    }
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
  return photos.sort((a, b) => (b.capturedAt || "").localeCompare(a.capturedAt || ""));
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

async function geocode(query: string) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`,
    {
      headers: {
        "User-Agent": "GeoPhotoGlobe/0.1 (admin geocoding)"
      }
    }
  );
  if (!response.ok) {
    throw new Error(`Geocoding failed with ${response.status}`);
  }
  const results = (await response.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
    boundingbox?: string[];
  }>;
  return {
    provider: "nominatim",
    query,
    results: results.map((item) => ({
      displayName: item.display_name,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      boundingBox: item.boundingbox ?? null
    }))
  };
}

app.post("/api/admin/login", (req, res) => {
  if (req.body?.password !== adminPassword) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.json({ token: adminToken });
});

app.get("/api/photos", (req, res) => {
  const mode = req.query.mode === "items" ? "items" : "cluster";
  const deviceTier = String(req.query.deviceTier || "desktop");
  const photos = sortPublicPhotos(listPhotos().filter(basePhotoFilter));
  res.json({
    mode,
    items: mode === "items" ? visibleItems(photos, deviceTier) : buildClusters(photos, deviceTier)
  });
});

app.get("/api/photos/:id", (req, res) => {
  const publicPhotos = sortPublicPhotos(listPhotos().filter(basePhotoFilter));
  const photo = publicPhotos.find((item) => item.id === req.params.id) ?? null;
  if (!photo || !basePhotoFilter(photo)) {
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

app.get("/api/admin/photos", requireAdmin, (req, res) => {
  let photos = listPhotos();
  if (req.query.visibilityStatus === "visible") {
    photos = photos.filter((photo) => photo.visibilityStatus === "visible");
  }
  if (req.query.visibilityStatus === "hidden") {
    photos = photos.filter((photo) => photo.visibilityStatus === "hidden");
  }
  if (req.query.hasGeo === "true") {
    photos = photos.filter((photo) => photo.hasGeo);
  }
  if (req.query.hasGeo === "false") {
    photos = photos.filter((photo) => !photo.hasGeo);
  }
  if (req.query.deleted === "true") {
    photos = photos.filter((photo) => !!photo.deletedAt);
  }
  if (req.query.deleted === "false") {
    photos = photos.filter((photo) => !photo.deletedAt);
  }
  const keyword = String(req.query.q || "").trim().toLowerCase();
  if (keyword) {
    photos = photos.filter(
      (photo) =>
        photo.title.toLowerCase().includes(keyword) ||
        photo.description.toLowerCase().includes(keyword) ||
        photo.locationLabel.toLowerCase().includes(keyword)
    );
  }
  res.json({ items: photos });
});

app.get("/api/admin/photos/:id", requireAdmin, (req, res) => {
  const id = String(req.params.id);
  const photo = getPhoto(id);
  if (!photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }
  res.json(photo);
});

app.patch("/api/admin/photos/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const current = getPhoto(id);
  if (!current) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }
  const latitude = req.body.latitude === "" || req.body.latitude === null ? null : Number(req.body.latitude);
  const longitude = req.body.longitude === "" || req.body.longitude === null ? null : Number(req.body.longitude);
  if (latitude !== null && longitude !== null) {
    await writeGpsToManagedExif(current.managedAssetPath, latitude, longitude);
  }
  const updated = updatePhoto(id, {
    title: String(req.body.title ?? current.title),
    description: String(req.body.description ?? current.description),
    locationLabel: String(req.body.locationLabel ?? current.locationLabel),
    visibilityStatus: req.body.visibilityStatus === "hidden" ? "hidden" : "visible",
    latitude,
    longitude,
    hasGeo: latitude !== null && longitude !== null
  });
  res.json(updated);
});

app.post("/api/admin/photos/import", requireAdmin, upload.array("photos", 200), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  const results = [];
  for (const file of files) {
    const ingested = await ingestUploadedFile(file.path, file.originalname);
    const metadata = await parseMetadata(ingested.managedTarget);
    const now = new Date().toISOString();
    const record: PhotoRecord = {
      id: ingested.id,
      originalAssetPath: ingested.originalTarget,
      managedAssetPath: ingested.managedTarget,
      thumbnailUrl: toPublicPath(ingested.thumbTarget),
      displayImageUrl: toPublicPath(ingested.displayTarget),
      title: file.originalname.replace(path.extname(file.originalname), ""),
      description: "",
      capturedAt: metadata.capturedAt,
      latitude: metadata.latitude,
      longitude: metadata.longitude,
      altitude: metadata.altitude,
      hasGeo: metadata.hasGeo,
      locationLabel: "",
      visibilityStatus: "visible",
      deletedAt: null,
      importedAt: now,
      updatedAt: now
    };
    upsertPhoto(record);
    results.push({
      id: record.id,
      hasGeo: record.hasGeo
    });
    await fs.unlink(file.path).catch(() => undefined);
  }
  res.json({ results });
});

app.post("/api/admin/photos/batch/visibility", requireAdmin, (req, res) => {
  const visibilityStatus = req.body.visibilityStatus === "hidden" ? "hidden" : "visible";
  res.json({ items: batchUpdate(readIds(req.body.ids), { visibilityStatus }) });
});

app.post("/api/admin/photos/batch/delete", requireAdmin, (req, res) => {
  res.json({ items: batchUpdate(readIds(req.body.ids), { deletedAt: new Date().toISOString() }) });
});

app.post("/api/admin/photos/batch/restore", requireAdmin, (req, res) => {
  res.json({ items: batchUpdate(readIds(req.body.ids), { deletedAt: null }) });
});

app.post("/api/admin/photos/batch/gps", requireAdmin, async (req, res) => {
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  const ids = readIds(req.body.ids);
  const updated: PhotoRecord[] = [];
  for (const id of ids) {
    const photo = getPhoto(id);
    if (!photo) {
      continue;
    }
    await writeGpsToManagedExif(photo.managedAssetPath, latitude, longitude);
    const result = updatePhoto(id, {
      latitude,
      longitude,
      hasGeo: true,
      locationLabel: String(req.body.locationLabel || photo.locationLabel)
    });
    if (result) {
      updated.push(result);
    }
  }
  res.json({ items: updated });
});

app.get("/api/admin/geocode/search", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    res.json({ provider: "nominatim", query: q, results: [] });
    return;
  }
  try {
    res.json(await geocode(q));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Geocoding failed" });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(appRoot, "dist")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(appRoot, "dist", "index.html"));
  });
}

app.listen(port, () => {
  console.log(`GeoPhoto Globe server listening on http://localhost:${port}`);
});
