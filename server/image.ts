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

function toIsoTimestamp(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (typeof value === "object") {
    const withIso = value as { toISOString?: () => string };
    if (typeof withIso.toISOString === "function") {
      const iso = withIso.toISOString();
      const parsed = new Date(iso);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    const withDate = value as { toDate?: () => Date };
    if (typeof withDate.toDate === "function") {
      const parsed = withDate.toDate();
      if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    const withString = value as { toString?: () => string };
    if (typeof withString.toString === "function") {
      const raw = withString.toString();
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  return null;
}

export async function readCapturedAtFromExif(filePath: string) {
  const tags = (await exiftool.read(filePath)) as Record<string, unknown>;
  const candidates = [
    tags.DateTimeOriginal,
    tags.CreateDate,
    tags.MediaCreateDate,
    tags.TrackCreateDate,
    tags.ModifyDate
  ];

  for (const candidate of candidates) {
    const normalized = toIsoTimestamp(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

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
  const captured = await readCapturedAtFromExif(filePath);
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
