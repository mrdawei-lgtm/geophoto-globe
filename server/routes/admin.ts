import { Router } from "express";
import type { RequestHandler } from "express";
import multer from "multer";
import { uploadsRoot } from "../config.js";
import { PhotoService } from "../services/photoService.js";
import type { PhotoListFilters, VisibilityStatus } from "../types.js";

function readIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function hasOwn(body: unknown, key: string) {
  return Boolean(body) && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, key);
}

function readCoordinate(value: unknown) {
  if (value === "" || value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Latitude and longitude must be valid numbers");
  }
  return parsed;
}

function readCapturedAt(value: unknown) {
  if (value === "" || value === null) {
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Captured time must be a valid date");
  }
  return parsed.toISOString();
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

export function createAdminRouter({
  requireAdmin,
  photoService
}: {
  requireAdmin: RequestHandler;
  photoService: PhotoService;
}) {
  const router = Router();
  const upload = multer({
    dest: uploadsRoot,
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 1
    },
    fileFilter: (_req, file, callback) => {
      callback(null, file.mimetype.startsWith("image/"));
    }
  });
  const batchUpload = multer({
    dest: uploadsRoot,
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 200
    },
    fileFilter: (_req, file, callback) => {
      callback(null, file.mimetype.startsWith("image/"));
    }
  });

  router.get("/photos", requireAdmin, (req, res) => {
    const filters: PhotoListFilters = {};
    if (req.query.visibilityStatus === "visible" || req.query.visibilityStatus === "hidden") {
      filters.visibilityStatus = req.query.visibilityStatus as VisibilityStatus;
    }
    if (req.query.hasGeo === "true") {
      filters.hasGeo = true;
    }
    if (req.query.hasGeo === "false") {
      filters.hasGeo = false;
    }
    if (req.query.hasLocationLabel === "true") {
      filters.hasLocationLabel = true;
    }
    if (req.query.hasLocationLabel === "false") {
      filters.hasLocationLabel = false;
    }
    if (req.query.deleted === "true") {
      filters.deleted = true;
    }
    if (req.query.deleted === "false") {
      filters.deleted = false;
    }
    const keyword = String(req.query.q || "").trim();
    if (keyword) {
      filters.q = keyword;
    }
    res.json({ items: photoService.listAdminPhotos(filters) });
  });

  router.get("/photos/:id", requireAdmin, (req, res) => {
    const photo = photoService.getPhoto(String(req.params.id));
    if (!photo) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }
    res.json(photo);
  });

  router.patch("/photos/:id", requireAdmin, async (req, res) => {
    const body = req.body ?? {};
    let latitude: number | null | undefined;
    let longitude: number | null | undefined;
    let capturedAt: string | null | undefined;

    try {
      latitude = hasOwn(body, "latitude") ? readCoordinate(req.body.latitude) : undefined;
      longitude = hasOwn(body, "longitude") ? readCoordinate(req.body.longitude) : undefined;
      capturedAt = hasOwn(body, "capturedAt") ? readCapturedAt(req.body.capturedAt) : undefined;
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid update payload" });
      return;
    }

    const updated = await photoService.updatePhoto(String(req.params.id), {
      title: hasOwn(body, "title") ? String(req.body.title ?? "") : undefined,
      description: hasOwn(body, "description") ? String(req.body.description ?? "") : undefined,
      capturedAt,
      locationLabel: hasOwn(body, "locationLabel") ? String(req.body.locationLabel ?? "") : undefined,
      visibilityStatus: hasOwn(body, "visibilityStatus")
        ? (req.body.visibilityStatus === "hidden" ? "hidden" : "visible")
        : undefined,
      latitude,
      longitude
    });
    if (!updated) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }
    res.json(updated);
  });

  router.post("/photos/:id/regenerate-description", requireAdmin, async (req, res) => {
    try {
      const result = await photoService.regenerateLocationNarrativeForPhoto(String(req.params.id));
      if (!result?.photo) {
        res.status(404).json({ error: "Photo not found" });
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to regenerate AI intro" });
    }
  });

  router.post("/import-jobs", requireAdmin, (req, res) => {
    const filenames = Array.isArray(req.body?.filenames)
      ? req.body.filenames.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    if (!filenames.length) {
      res.status(400).json({ error: "At least one filename is required" });
      return;
    }
    res.status(201).json(photoService.createImportJob(filenames));
  });

  router.post("/import-jobs/:id/files", requireAdmin, upload.single("photo"), async (req, res) => {
    const file = req.file;
    const itemId = String(req.body.itemId || "").trim();
    if (!file) {
      res.status(400).json({ error: "Photo file is required" });
      return;
    }
    if (!itemId) {
      res.status(400).json({ error: "itemId is required" });
      return;
    }
    const result = await photoService.uploadFileToImportJob(String(req.params.id), itemId, file);
    if (!result.item || !result.job) {
      res.status(404).json({ error: "Import job item not found" });
      return;
    }
    res.json(result);
  });

  router.post("/photos/import", requireAdmin, batchUpload.array("photos", 200), async (req, res) => {
    const files = ((req.files as Express.Multer.File[]) || []).filter(Boolean);
    const result = await photoService.importUploadedPhotos(files);
    res.json({
      results: result.results,
      jobId: result.job.id,
      job: result.job
    });
  });

  router.post("/photos/batch/visibility", requireAdmin, (req, res) => {
    const visibilityStatus = req.body.visibilityStatus === "hidden" ? "hidden" : "visible";
    res.json({ items: photoService.batchVisibility(readIds(req.body.ids), visibilityStatus) });
  });

  router.post("/photos/batch/delete", requireAdmin, (req, res) => {
    res.json({ items: photoService.batchDelete(readIds(req.body.ids)) });
  });

  router.post("/photos/batch/restore", requireAdmin, (req, res) => {
    res.json({ items: photoService.batchRestore(readIds(req.body.ids)) });
  });

  router.post("/photos/batch/purge", requireAdmin, async (req, res) => {
    res.json(await photoService.batchPurge(readIds(req.body.ids)));
  });

  router.post("/photos/batch/purge-deleted", requireAdmin, async (_req, res) => {
    res.json(await photoService.batchPurgeDeleted());
  });

  router.post("/photos/batch/gps", requireAdmin, async (req, res) => {
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const items = await photoService.batchGps(
      readIds(req.body.ids),
      latitude,
      longitude,
      String(req.body.locationLabel || "")
    );
    res.json({ items });
  });

  router.get("/import-jobs", requireAdmin, (_req, res) => {
    res.json({ items: photoService.listImportJobs() });
  });

  router.get("/import-jobs/:id", requireAdmin, (req, res) => {
    const job = photoService.getImportJob(String(req.params.id));
    if (!job) {
      res.status(404).json({ error: "Import job not found" });
      return;
    }
    res.json(job);
  });

  router.get("/geocode/search", requireAdmin, async (req, res) => {
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

  return router;
}
