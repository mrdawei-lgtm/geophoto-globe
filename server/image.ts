import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import exifr from "exifr";
import { ExifTool } from "exiftool-vendored";
import { appRoot, storageRoot, uploadsRoot } from "./config.js";

const exiftool = new ExifTool();

export type ParsedMetadata = {
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  hasGeo: boolean;
};

async function ensureDirs() {
  await Promise.all([
    fs.mkdir(path.join(storageRoot, "originals"), { recursive: true }).catch(() => undefined),
    fs.mkdir(path.join(storageRoot, "managed"), { recursive: true }).catch(() => undefined),
    fs.mkdir(path.join(storageRoot, "thumbs"), { recursive: true }).catch(() => undefined),
    fs.mkdir(path.join(storageRoot, "display"), { recursive: true }).catch(() => undefined),
    fs.mkdir(uploadsRoot, { recursive: true }).catch(() => undefined)
  ]);
}

export async function ingestUploadedFile(filePath: string, originalName: string) {
  await ensureDirs();
  const id = crypto.randomUUID();
  const ext = path.extname(originalName || "") || ".jpg";
  const originalTarget = path.join(storageRoot, "originals", `${id}${ext}`);
  const managedTarget = path.join(storageRoot, "managed", `${id}${ext}`);
  const thumbTarget = path.join(storageRoot, "thumbs", `${id}.jpg`);
  const displayTarget = path.join(storageRoot, "display", `${id}.jpg`);

  await fs.copyFile(filePath, originalTarget);
  await fs.copyFile(filePath, managedTarget);
  await sharp(filePath).rotate().resize(320, 320, { fit: "cover" }).jpeg({ quality: 80 }).toFile(thumbTarget);
  await sharp(filePath).rotate().resize(1800, 1800, { fit: "inside" }).jpeg({ quality: 88 }).toFile(displayTarget);

  return {
    id,
    originalTarget,
    managedTarget,
    thumbTarget,
    displayTarget
  };
}

export async function parseMetadata(filePath: string): Promise<ParsedMetadata> {
  const meta = await exifr.parse(filePath, { gps: true });
  const lat = typeof meta?.latitude === "number" ? meta.latitude : null;
  const lng = typeof meta?.longitude === "number" ? meta.longitude : null;
  const altitude = typeof meta?.altitude === "number" ? meta.altitude : null;
  const captured = meta?.DateTimeOriginal instanceof Date ? meta.DateTimeOriginal.toISOString() : null;
  return {
    capturedAt: captured,
    latitude: lat,
    longitude: lng,
    altitude,
    hasGeo: lat !== null && lng !== null
  };
}

export async function writeGpsToManagedExif(filePath: string, latitude: number, longitude: number) {
  await exiftool.write(filePath, {
    GPSLatitude: latitude,
    GPSLongitude: longitude,
    GPSCoordinates: `${latitude}, ${longitude}`
  });
}

export function toPublicPath(filePath: string) {
  const relative = path.relative(appRoot, filePath).split(path.sep).join("/");
  return `/${relative}`;
}
