import type { SQLInputValue } from "node:sqlite";
import { getDb } from "../db/client.js";
import type { DescriptionSource, PhotoGroupRecord } from "../types.js";

type PhotoGroupRow = {
  id: string;
  latitude: number;
  longitude: number;
  location_label: string;
  narrative_prompt: string;
  description: string;
  description_source: DescriptionSource;
  geo_country_en: string;
  geo_region_en: string;
  geo_locality_en: string;
  geo_summary_en: string;
  geo_resolved_at: string | null;
  cover_photo_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapPhotoGroupRow(row: PhotoGroupRow): PhotoGroupRecord {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    locationLabel: row.location_label,
    narrativePrompt: row.narrative_prompt,
    description: row.description,
    descriptionSource: row.description_source,
    geoCountryEn: row.geo_country_en,
    geoRegionEn: row.geo_region_en,
    geoLocalityEn: row.geo_locality_en,
    geoSummaryEn: row.geo_summary_en,
    geoResolvedAt: row.geo_resolved_at,
    coverPhotoId: row.cover_photo_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPhotoGroupParams(record: PhotoGroupRecord) {
  return {
    id: record.id,
    latitude: record.latitude,
    longitude: record.longitude,
    locationLabel: record.locationLabel,
    narrativePrompt: record.narrativePrompt,
    description: record.description,
    descriptionSource: record.descriptionSource,
    geoCountryEn: record.geoCountryEn,
    geoRegionEn: record.geoRegionEn,
    geoLocalityEn: record.geoLocalityEn,
    geoSummaryEn: record.geoSummaryEn,
    geoResolvedAt: record.geoResolvedAt,
    coverPhotoId: record.coverPhotoId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export class PhotoGroupRepository {
  private readonly db = getDb();

  list() {
    const rows = this.db
      .prepare("SELECT * FROM photo_groups ORDER BY updated_at DESC, created_at DESC")
      .all() as PhotoGroupRow[];
    return rows.map(mapPhotoGroupRow);
  }

  listByCoordinates(latitude: number, longitude: number) {
    const rows = this.db
      .prepare("SELECT * FROM photo_groups WHERE latitude = ? AND longitude = ? ORDER BY updated_at DESC, created_at DESC")
      .all(latitude, longitude) as PhotoGroupRow[];
    return rows.map(mapPhotoGroupRow);
  }

  listByIds(ids: string[]) {
    if (!ids.length) {
      return [];
    }
    const placeholders = ids.map((_, index) => `@id${index}`).join(", ");
    const params = ids.reduce<Record<string, SQLInputValue>>((result, id, index) => {
      result[`id${index}`] = id;
      return result;
    }, {});
    const rows = this.db
      .prepare(`SELECT * FROM photo_groups WHERE id IN (${placeholders})`)
      .all(params) as PhotoGroupRow[];
    return rows.map(mapPhotoGroupRow);
  }

  getById(id: string) {
    const row = this.db.prepare("SELECT * FROM photo_groups WHERE id = ?").get(id) as PhotoGroupRow | undefined;
    return row ? mapPhotoGroupRow(row) : null;
  }

  upsert(record: PhotoGroupRecord) {
    this.db.prepare(`
      INSERT INTO photo_groups (
        id,
        latitude,
        longitude,
        location_label,
        narrative_prompt,
        description,
        description_source,
        geo_country_en,
        geo_region_en,
        geo_locality_en,
        geo_summary_en,
        geo_resolved_at,
        cover_photo_id,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @latitude,
        @longitude,
        @locationLabel,
        @narrativePrompt,
        @description,
        @descriptionSource,
        @geoCountryEn,
        @geoRegionEn,
        @geoLocalityEn,
        @geoSummaryEn,
        @geoResolvedAt,
        @coverPhotoId,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        location_label = excluded.location_label,
        narrative_prompt = excluded.narrative_prompt,
        description = excluded.description,
        description_source = excluded.description_source,
        geo_country_en = excluded.geo_country_en,
        geo_region_en = excluded.geo_region_en,
        geo_locality_en = excluded.geo_locality_en,
        geo_summary_en = excluded.geo_summary_en,
        geo_resolved_at = excluded.geo_resolved_at,
        cover_photo_id = excluded.cover_photo_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `).run(mapPhotoGroupParams(record));

    return this.getById(record.id);
  }

  create(record: PhotoGroupRecord) {
    return this.upsert(record);
  }

  update(id: string, patch: Partial<PhotoGroupRecord>) {
    const current = this.getById(id);
    if (!current) {
      return null;
    }
    const updated: PhotoGroupRecord = {
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
    this.db.prepare("DELETE FROM photo_groups WHERE id = ?").run(id);
    return current;
  }
}
