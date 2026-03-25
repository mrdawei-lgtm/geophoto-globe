import { getDb } from "./client.js";

const CURRENT_SCHEMA_VERSION = 5;

function hasColumn(tableName: string, columnName: string) {
  const db = getDb();
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

export function migrateDatabase() {
  const db = getDb();
  const currentVersion = Number(db.prepare("PRAGMA user_version").get()?.user_version || 0);

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    return;
  }

  if (currentVersion < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        original_asset_path TEXT NOT NULL,
        managed_asset_path TEXT NOT NULL,
        thumbnail_url TEXT NOT NULL,
        display_image_url TEXT NOT NULL,
        title TEXT NOT NULL,
        narrative_prompt TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        description_source TEXT NOT NULL DEFAULT 'none' CHECK (description_source IN ('none', 'auto', 'manual')),
        captured_at TEXT,
        latitude REAL,
        longitude REAL,
        altitude REAL,
        has_geo INTEGER NOT NULL DEFAULT 0,
        location_label TEXT NOT NULL DEFAULT '',
        geo_country_en TEXT NOT NULL DEFAULT '',
        geo_region_en TEXT NOT NULL DEFAULT '',
        geo_locality_en TEXT NOT NULL DEFAULT '',
        geo_summary_en TEXT NOT NULL DEFAULT '',
        geo_resolved_at TEXT,
        visibility_status TEXT NOT NULL CHECK (visibility_status IN ('visible', 'hidden')),
        deleted_at TEXT,
        imported_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_photos_visibility_deleted_geo
        ON photos (visibility_status, deleted_at, has_geo);
      CREATE INDEX IF NOT EXISTS idx_photos_captured_at ON photos (captured_at DESC);
    `);
  }

  if (currentVersion < 2) {
    db.exec(`
      DROP TABLE IF EXISTS import_job_items;
      DROP TABLE IF EXISTS import_jobs;

      CREATE TABLE import_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
        total_count INTEGER NOT NULL DEFAULT 0,
        processed_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        summary_message TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs (created_at DESC);

      CREATE TABLE import_job_items (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'uploading', 'processing', 'success', 'failed')),
        photo_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES import_jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_import_job_items_job_id ON import_job_items (job_id, created_at);
    `);
  }

  if (currentVersion < 3) {
    if (!hasColumn("photos", "geo_country_en")) {
      db.exec(`ALTER TABLE photos ADD COLUMN geo_country_en TEXT NOT NULL DEFAULT ''`);
    }
    if (!hasColumn("photos", "geo_region_en")) {
      db.exec(`ALTER TABLE photos ADD COLUMN geo_region_en TEXT NOT NULL DEFAULT ''`);
    }
    if (!hasColumn("photos", "geo_locality_en")) {
      db.exec(`ALTER TABLE photos ADD COLUMN geo_locality_en TEXT NOT NULL DEFAULT ''`);
    }
    if (!hasColumn("photos", "geo_summary_en")) {
      db.exec(`ALTER TABLE photos ADD COLUMN geo_summary_en TEXT NOT NULL DEFAULT ''`);
    }
    if (!hasColumn("photos", "geo_resolved_at")) {
      db.exec(`ALTER TABLE photos ADD COLUMN geo_resolved_at TEXT`);
    }
  }

  if (currentVersion < 4) {
    if (!hasColumn("photos", "description_source")) {
      db.exec(`ALTER TABLE photos ADD COLUMN description_source TEXT NOT NULL DEFAULT 'none' CHECK (description_source IN ('none', 'auto', 'manual'))`);
    }
    db.exec(`
      UPDATE photos
      SET description_source = CASE
        WHEN TRIM(COALESCE(description, '')) <> '' THEN 'manual'
        ELSE 'none'
      END
      WHERE COALESCE(description_source, '') NOT IN ('none', 'auto', 'manual')
         OR (
           description_source = 'none'
           AND TRIM(COALESCE(description, '')) <> ''
         )
    `);
  }

  if (currentVersion < 5) {
    if (!hasColumn("photos", "narrative_prompt")) {
      db.exec(`ALTER TABLE photos ADD COLUMN narrative_prompt TEXT NOT NULL DEFAULT ''`);
    }
  }

  db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
}
