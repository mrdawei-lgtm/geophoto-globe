import type { SQLInputValue } from "node:sqlite";
import { getDb } from "../db/client.js";
import type { PhotoListFilters, PhotoRecord } from "../types.js";
import type { DescriptionSource } from "../types.js";

type PhotoRow = {
  id: string;
  original_asset_path: string;
  managed_asset_path: string;
  thumbnail_url: string;
  display_image_url: string;
  title: string;
  description: string;
  description_source: DescriptionSource;
  captured_at: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  has_geo: number;
  location_label: string;
  geo_country_en: string;
  geo_region_en: string;
  geo_locality_en: string;
  geo_summary_en: string;
  geo_resolved_at: string | null;
  visibility_status: "visible" | "hidden";
  deleted_at: string | null;
  imported_at: string;
  updated_at: string;
};

function mapPhotoRow(row: PhotoRow): PhotoRecord {
  return {
    id: row.id,
    originalAssetPath: row.original_asset_path,
    managedAssetPath: row.managed_asset_path,
    thumbnailUrl: row.thumbnail_url,
    displayImageUrl: row.display_image_url,
    title: row.title,
    description: row.description,
    descriptionSource: row.description_source,
    capturedAt: row.captured_at,
    latitude: row.latitude,
    longitude: row.longitude,
    altitude: row.altitude,
    hasGeo: Boolean(row.has_geo),
    locationLabel: row.location_label,
    geoCountryEn: row.geo_country_en,
    geoRegionEn: row.geo_region_en,
    geoLocalityEn: row.geo_locality_en,
    geoSummaryEn: row.geo_summary_en,
    geoResolvedAt: row.geo_resolved_at,
    visibilityStatus: row.visibility_status,
    deletedAt: row.deleted_at,
    importedAt: row.imported_at,
    updatedAt: row.updated_at
  };
}

function mapPhotoParams(record: PhotoRecord) {
  return {
    id: record.id,
    originalAssetPath: record.originalAssetPath,
    managedAssetPath: record.managedAssetPath,
    thumbnailUrl: record.thumbnailUrl,
    displayImageUrl: record.displayImageUrl,
    title: record.title,
    description: record.description,
    descriptionSource: record.descriptionSource,
    capturedAt: record.capturedAt,
    latitude: record.latitude,
    longitude: record.longitude,
    altitude: record.altitude,
    hasGeo: record.hasGeo ? 1 : 0,
    locationLabel: record.locationLabel,
    geoCountryEn: record.geoCountryEn ?? "",
    geoRegionEn: record.geoRegionEn ?? "",
    geoLocalityEn: record.geoLocalityEn ?? "",
    geoSummaryEn: record.geoSummaryEn ?? "",
    geoResolvedAt: record.geoResolvedAt ?? null,
    visibilityStatus: record.visibilityStatus,
    deletedAt: record.deletedAt,
    importedAt: record.importedAt,
    updatedAt: record.updatedAt
  };
}

export class PhotoRepository {
  private readonly db = getDb();

  list(filters: PhotoListFilters = {}) {
    const clauses: string[] = [];
    const params: Record<string, SQLInputValue> = {};

    if (filters.visibilityStatus) {
      clauses.push("visibility_status = @visibilityStatus");
      params.visibilityStatus = filters.visibilityStatus;
    }

    if (typeof filters.hasGeo === "boolean") {
      clauses.push("has_geo = @hasGeo");
      params.hasGeo = filters.hasGeo ? 1 : 0;
    }

    if (typeof filters.hasLocationLabel === "boolean") {
      clauses.push(
        filters.hasLocationLabel
          ? "TRIM(COALESCE(location_label, '')) <> ''"
          : "TRIM(COALESCE(location_label, '')) = ''"
      );
    }

    if (typeof filters.deleted === "boolean") {
      clauses.push(filters.deleted ? "deleted_at IS NOT NULL" : "deleted_at IS NULL");
    }

    if (filters.q) {
      clauses.push("(LOWER(title) LIKE @keyword OR LOWER(description) LIKE @keyword OR LOWER(location_label) LIKE @keyword)");
      params.keyword = `%${filters.q.trim().toLowerCase()}%`;
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM photos ${where} ORDER BY COALESCE(captured_at, imported_at) DESC, imported_at DESC`)
      .all(params) as PhotoRow[];

    return rows.map(mapPhotoRow);
  }

  getById(id: string) {
    const row = this.db.prepare("SELECT * FROM photos WHERE id = ?").get(id) as PhotoRow | undefined;
    return row ? mapPhotoRow(row) : null;
  }

  listByCoordinates(latitude: number, longitude: number) {
    const rows = this.db
      .prepare("SELECT * FROM photos WHERE latitude = ? AND longitude = ?")
      .all(latitude, longitude) as PhotoRow[];
    return rows.map(mapPhotoRow);
  }

  upsert(record: PhotoRecord) {
    this.db.prepare(`
      INSERT INTO photos (
        id,
        original_asset_path,
        managed_asset_path,
        thumbnail_url,
        display_image_url,
        title,
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
      ON CONFLICT(id) DO UPDATE SET
        original_asset_path = excluded.original_asset_path,
        managed_asset_path = excluded.managed_asset_path,
        thumbnail_url = excluded.thumbnail_url,
        display_image_url = excluded.display_image_url,
        title = excluded.title,
        description = excluded.description,
        description_source = excluded.description_source,
        captured_at = excluded.captured_at,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        altitude = excluded.altitude,
        has_geo = excluded.has_geo,
        location_label = excluded.location_label,
        geo_country_en = excluded.geo_country_en,
        geo_region_en = excluded.geo_region_en,
        geo_locality_en = excluded.geo_locality_en,
        geo_summary_en = excluded.geo_summary_en,
        geo_resolved_at = excluded.geo_resolved_at,
        visibility_status = excluded.visibility_status,
        deleted_at = excluded.deleted_at,
        imported_at = excluded.imported_at,
        updated_at = excluded.updated_at
    `).run(mapPhotoParams(record));

    return this.getById(record.id);
  }

  update(id: string, patch: Partial<PhotoRecord>) {
    const current = this.getById(id);
    if (!current) {
      return null;
    }
    const updated: PhotoRecord = {
      ...current,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString()
    };
    return this.upsert(updated);
  }

  deleteById(id: string) {
    const current = this.getById(id);
    if (!current) {
      return null;
    }
    this.db.prepare("DELETE FROM photos WHERE id = ?").run(id);
    return current;
  }

  batchUpdate(ids: string[], patch: Partial<PhotoRecord>) {
    this.db.exec("BEGIN");
    try {
      for (const id of ids) {
        this.update(id, patch);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return ids.map((id) => this.getById(id)).filter((photo): photo is PhotoRecord => Boolean(photo));
  }
}
