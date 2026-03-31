import crypto from "node:crypto";
import { getDb } from "./client.js";
import type { DescriptionSource } from "../types.js";

type PhotoRow = {
  id: string;
  photo_group_id: string | null;
  title: string;
  narrative_prompt: string;
  description: string;
  description_source: DescriptionSource;
  captured_at: string | null;
  latitude: number | null;
  longitude: number | null;
  has_geo: number;
  location_label: string;
  geo_country_en: string;
  geo_region_en: string;
  geo_locality_en: string;
  geo_summary_en: string;
  geo_resolved_at: string | null;
  deleted_at: string | null;
  imported_at: string;
  updated_at: string;
};

type PhotoGroupRow = {
  id: string;
  latitude: number;
  longitude: number;
  cover_photo_id: string | null;
};

function coordinateKey(latitude: number, longitude: number) {
  return `${latitude}:${longitude}`;
}

function normalizeValue(value: string | null | undefined) {
  return (value ?? "").trim();
}

function sortPhotosForAnchor(photos: PhotoRow[]) {
  return [...photos].sort((left, right) => {
    const leftValue = left.captured_at || left.imported_at;
    const rightValue = right.captured_at || right.imported_at;
    if (leftValue === rightValue) {
      return right.imported_at.localeCompare(left.imported_at);
    }
    return rightValue.localeCompare(leftValue);
  });
}

function pickGroupField(photos: PhotoRow[], field: keyof Pick<
  PhotoRow,
  | "location_label"
  | "narrative_prompt"
  | "description"
  | "geo_country_en"
  | "geo_region_en"
  | "geo_locality_en"
  | "geo_summary_en"
>) {
  return sortPhotosForAnchor(photos).find((photo) => normalizeValue(photo[field]))?.[field] ?? "";
}

function pickDescriptionSource(photos: PhotoRow[]) {
  return sortPhotosForAnchor(photos).find((photo) => normalizeValue(photo.description))?.description_source ?? "none";
}

function pickGeoResolvedAt(photos: PhotoRow[]) {
  return sortPhotosForAnchor(photos).find((photo) => photo.geo_resolved_at)?.geo_resolved_at ?? null;
}

export function initializeMissingPhotoGroups() {
  const db = getDb();
  const groupRows = db
    .prepare("SELECT id, latitude, longitude, cover_photo_id FROM photo_groups")
    .all() as PhotoGroupRow[];
  const geoPhotos = db.prepare(`
    SELECT
      id,
      photo_group_id,
      title,
      narrative_prompt,
      description,
      description_source,
      captured_at,
      latitude,
      longitude,
      has_geo,
      location_label,
      geo_country_en,
      geo_region_en,
      geo_locality_en,
      geo_summary_en,
      geo_resolved_at,
      deleted_at,
      imported_at,
      updated_at
    FROM photos
    WHERE has_geo = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY COALESCE(captured_at, imported_at) DESC, imported_at DESC
  `).all() as PhotoRow[];

  const groupsByCoordinate = new Map<string, PhotoGroupRow[]>();
  for (const group of groupRows) {
    const key = coordinateKey(group.latitude, group.longitude);
    const existing = groupsByCoordinate.get(key);
    if (existing) {
      existing.push(group);
    } else {
      groupsByCoordinate.set(key, [group]);
    }
  }

  const missingByCoordinate = new Map<string, PhotoRow[]>();
  for (const photo of geoPhotos) {
    if (photo.photo_group_id) {
      continue;
    }
    const key = coordinateKey(photo.latitude ?? 0, photo.longitude ?? 0);
    const existing = missingByCoordinate.get(key);
    if (existing) {
      existing.push(photo);
    } else {
      missingByCoordinate.set(key, [photo]);
    }
  }

  const createGroup = db.prepare(`
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updatePhotoGroupId = db.prepare("UPDATE photos SET photo_group_id = ?, updated_at = ? WHERE id = ?");
  const updateGroupCover = db.prepare("UPDATE photo_groups SET cover_photo_id = ?, updated_at = ? WHERE id = ?");
  const deleteGroup = db.prepare("DELETE FROM photo_groups WHERE id = ?");

  let createdCount = 0;
  let assignedCount = 0;
  let deletedCount = 0;
  let repairedCoverCount = 0;

  db.exec("BEGIN");
  try {
    for (const [key, photos] of missingByCoordinate.entries()) {
      const [latitudeString, longitudeString] = key.split(":");
      const latitude = Number(latitudeString);
      const longitude = Number(longitudeString);
      const existingGroups = groupsByCoordinate.get(key) ?? [];
      const anchorPhotos = sortPhotosForAnchor(photos);
      const coverPhoto = anchorPhotos[0] ?? null;
      const now = coverPhoto?.updated_at ?? new Date().toISOString();

      let groupId = existingGroups.length === 1 ? existingGroups[0].id : null;
      if (!groupId) {
        groupId = crypto.randomUUID();
        createGroup.run(
          groupId,
          latitude,
          longitude,
          pickGroupField(photos, "location_label"),
          pickGroupField(photos, "narrative_prompt"),
          pickGroupField(photos, "description"),
          pickDescriptionSource(photos),
          pickGroupField(photos, "geo_country_en"),
          pickGroupField(photos, "geo_region_en"),
          pickGroupField(photos, "geo_locality_en"),
          pickGroupField(photos, "geo_summary_en"),
          pickGeoResolvedAt(photos),
          coverPhoto?.id ?? null,
          coverPhoto?.imported_at ?? now,
          now
        );
        createdCount += 1;
      }

      for (const photo of photos) {
        updatePhotoGroupId.run(groupId, photo.updated_at, photo.id);
        assignedCount += 1;
      }
    }

    const allGroups = db
      .prepare("SELECT id, cover_photo_id FROM photo_groups")
      .all() as Array<{ id: string; cover_photo_id: string | null }>;
    for (const group of allGroups) {
      const members = sortPhotosForAnchor(
        db.prepare(`
          SELECT
            id,
            photo_group_id,
            title,
            narrative_prompt,
            description,
            description_source,
            captured_at,
            latitude,
            longitude,
            has_geo,
            location_label,
            geo_country_en,
            geo_region_en,
            geo_locality_en,
            geo_summary_en,
            geo_resolved_at,
            deleted_at,
            imported_at,
            updated_at
          FROM photos
          WHERE photo_group_id = ?
        `).all(group.id) as PhotoRow[]
      );

      if (!members.length) {
        deleteGroup.run(group.id);
        deletedCount += 1;
        continue;
      }

      if (!group.cover_photo_id || !members.some((photo) => photo.id === group.cover_photo_id)) {
        updateGroupCover.run(members[0].id, new Date().toISOString(), group.id);
        repairedCoverCount += 1;
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    createdCount,
    assignedCount,
    deletedCount,
    repairedCoverCount
  };
}
