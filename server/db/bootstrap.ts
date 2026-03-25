import fs from "node:fs";
import { legacyPhotosJsonPath } from "../config.js";
import { normalizeStoredAssetPath } from "../storagePaths.js";
import type { DescriptionSource } from "../types.js";
import type { PhotoRecord } from "../types.js";
import { getDb } from "./client.js";
import { migrateDatabase } from "./migrate.js";

type LegacyPhotoStore = {
  photos: PhotoRecord[];
};

function normalizePhoto(record: PhotoRecord): PhotoRecord {
  const description = record.description ?? "";
  const descriptionSource: DescriptionSource =
    record.descriptionSource ?? (description.trim() ? "manual" : "none");
  return {
    ...record,
    originalAssetPath: normalizeStoredAssetPath(record.originalAssetPath),
    managedAssetPath: normalizeStoredAssetPath(record.managedAssetPath),
    narrativePrompt: record.narrativePrompt ?? "",
    description,
    descriptionSource,
    geoCountryEn: record.geoCountryEn ?? "",
    geoRegionEn: record.geoRegionEn ?? "",
    geoLocalityEn: record.geoLocalityEn ?? "",
    geoSummaryEn: record.geoSummaryEn ?? "",
    geoResolvedAt: record.geoResolvedAt ?? null
  };
}

function importLegacyJsonIfNeeded() {
  const db = getDb();
  const countRow = db.prepare("SELECT COUNT(*) as count FROM photos").get() as { count: number };
  if (countRow.count > 0 || !fs.existsSync(legacyPhotosJsonPath)) {
    return { imported: 0 };
  }

  const raw = JSON.parse(fs.readFileSync(legacyPhotosJsonPath, "utf-8")) as LegacyPhotoStore;
  const photos = raw.photos.map(normalizePhoto);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO photos (
      id,
      original_asset_path,
      managed_asset_path,
      thumbnail_url,
        display_image_url,
        title,
        narrative_prompt,
        description,
        description_source,
      captured_at,
      latitude,
      longitude,
      altitude,
      has_geo,
      location_label,
      geo_country_en,
      geo_region_en,
      geo_locality_en,
      geo_summary_en,
      geo_resolved_at,
      visibility_status,
      deleted_at,
      imported_at,
      updated_at
    ) VALUES (
      @id,
      @originalAssetPath,
      @managedAssetPath,
      @thumbnailUrl,
      @displayImageUrl,
      @title,
      @narrativePrompt,
      @description,
      @descriptionSource,
      @capturedAt,
      @latitude,
      @longitude,
      @altitude,
      @hasGeo,
      @locationLabel,
      @geoCountryEn,
      @geoRegionEn,
      @geoLocalityEn,
      @geoSummaryEn,
      @geoResolvedAt,
      @visibilityStatus,
      @deletedAt,
      @importedAt,
      @updatedAt
    )
  `);
  db.exec("BEGIN");
  try {
    for (const photo of photos) {
      insert.run({
        ...photo,
        hasGeo: photo.hasGeo ? 1 : 0
      });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { imported: photos.length };
}

function normalizeStoredPhotoAssetPaths() {
  const db = getDb();
  const rows = db.prepare("SELECT id, original_asset_path, managed_asset_path FROM photos").all() as Array<{
    id: string;
    original_asset_path: string;
    managed_asset_path: string;
  }>;
  const update = db.prepare(`
    UPDATE photos
    SET original_asset_path = ?,
        managed_asset_path = ?
    WHERE id = ?
  `);

  let normalized = 0;
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      const nextOriginal = normalizeStoredAssetPath(row.original_asset_path);
      const nextManaged = normalizeStoredAssetPath(row.managed_asset_path);
      if (nextOriginal === row.original_asset_path && nextManaged === row.managed_asset_path) {
        continue;
      }

      update.run(nextOriginal, nextManaged, row.id);
      normalized += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return normalized;
}

function recoverInterruptedImportItems() {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE import_job_items
    SET status = 'failed',
        error_message = COALESCE(error_message, 'Server restarted during import'),
        updated_at = ?
    WHERE status IN ('uploading', 'processing')
  `).run(now);
}

export function bootstrapDatabase() {
  migrateDatabase();
  recoverInterruptedImportItems();
  const imported = importLegacyJsonIfNeeded();
  const normalizedAssetPaths = normalizeStoredPhotoAssetPaths();
  return {
    ...imported,
    normalizedAssetPaths
  };
}
