import fs from "node:fs/promises";
import path from "node:path";
import type { Express } from "express";
import { appRoot } from "../config.js";
import { ingestUploadedFile, parseMetadata, readCapturedAtFromExif, toPublicPath } from "../image.js";
import { ImportJobRepository } from "../repositories/importJobRepository.js";
import { PhotoRepository } from "../repositories/photoRepository.js";
import { GeoSummaryService, emptyGeoSummaryFields } from "./geoSummaryService.js";
import { LocationNarrativeService } from "./locationNarrativeService.js";
import type { LocationNarrativeGenerationResult } from "./locationNarrativeService.js";
import type {
  DescriptionSource,
  ImportJobWithItems,
  PhotoListFilters,
  PhotoRecord,
  VisibilityStatus
} from "../types.js";

type UpdatePhotoInput = {
  title?: string;
  narrativePrompt?: string;
  description?: string;
  capturedAt?: string | null;
  locationLabel?: string;
  visibilityStatus?: VisibilityStatus;
  latitude?: number | null;
  longitude?: number | null;
};

function readTitleFromFilename(originalName: string) {
  return originalName.replace(path.extname(originalName), "");
}

async function cleanupGeneratedFiles(paths: Array<string | undefined>) {
  await Promise.all(paths.filter(Boolean).map((filePath) => fs.unlink(filePath!).catch(() => undefined)));
}

async function deleteFileIfPresent(filePath: string | null | undefined) {
  if (!filePath) {
    return;
  }
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") {
      throw error;
    }
  }
}

function publicAssetPathToAbsolute(urlPath: string | null | undefined) {
  if (!urlPath) {
    return null;
  }
  const normalized = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath;
  return path.join(appRoot, normalized);
}

function groupPhotosByExactCoordinates(photos: PhotoRecord[]) {
  const grouped = new Map<string, PhotoRecord[]>();
  const orderedKeys: string[] = [];
  const ungrouped: PhotoRecord[] = [];

  for (const photo of photos) {
    if (photo.latitude === null || photo.longitude === null) {
      ungrouped.push(photo);
      continue;
    }

    const key = `${photo.latitude}:${photo.longitude}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.push(photo);
    } else {
      grouped.set(key, [photo]);
      orderedKeys.push(key);
    }
  }

  return [
    ...orderedKeys.flatMap((key) => grouped.get(key) ?? []),
    ...ungrouped
  ];
}

function sameCoordinates(
  left: { latitude: number | null; longitude: number | null },
  right: { latitude: number | null; longitude: number | null }
) {
  return left.latitude === right.latitude && left.longitude === right.longitude;
}

function normalizeDescription(value: string | undefined) {
  return (value ?? "").trim();
}

function inferDescriptionSource(description: string): DescriptionSource {
  return description ? "manual" : "none";
}

function coordinateKey(photo: { latitude: number | null; longitude: number | null }) {
  return `${photo.latitude}:${photo.longitude}`;
}

function sortByUpdatedAtDesc(photos: PhotoRecord[]) {
  return [...photos].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function countCharacters(value: string) {
  return Array.from(value).length;
}

function latestNarrativePrompt(photos: PhotoRecord[]) {
  return [...photos]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((photo) => photo.narrativePrompt?.trim() ?? "")
    .find(Boolean) ?? "";
}

export type NarrativeBackfillGroupResult = {
  key: string;
  photoCount: number;
  latitude: number;
  longitude: number;
  locationLabel: string;
  geoSummaryEn: string;
  status: "success" | "failure" | "skipped";
  action: "updated" | "unchanged" | "skipped_manual" | "preserved_existing" | "empty";
  descriptionSource: DescriptionSource;
  descriptionPreview: string;
  wasTruncated: boolean;
  rawCharacterCount: number;
  finishReason: string | null;
  retriedFinalOnly: boolean;
  error: string | null;
};

export type CapturedAtBackfillPhotoResult = {
  id: string;
  title: string;
  locationLabel: string;
  status: "updated" | "unchanged" | "failed";
  previousCapturedAt: string | null;
  nextCapturedAt: string | null;
  error: string | null;
};

export type SharedNarrativeResult = {
  latitude: number;
  longitude: number;
  locationLabel: string;
  narrativePrompt: string;
  description: string;
  descriptionSource: DescriptionSource;
  photoCount: number;
  wasTruncated: boolean;
  finishReason: string | null;
  error: string | null;
};

export class PhotoService {
  constructor(
    private readonly photoRepository = new PhotoRepository(),
    private readonly importJobRepository = new ImportJobRepository(),
    private readonly geoSummaryService = new GeoSummaryService(),
    private readonly locationNarrativeService = new LocationNarrativeService()
  ) {}

  listPublicPhotos() {
    return this.photoRepository.list({ visibilityStatus: "visible", deleted: false, hasGeo: true });
  }

  listAdminPhotos(filters: PhotoListFilters) {
    return groupPhotosByExactCoordinates(this.photoRepository.list(filters));
  }

  getPhoto(id: string) {
    return this.photoRepository.getById(id);
  }

  private async resolveGeoSummaryForCoordinates(latitude: number | null, longitude: number | null) {
    if (latitude === null || longitude === null) {
      return emptyGeoSummaryFields();
    }
    return this.geoSummaryService.resolve(latitude, longitude);
  }

  private listCoordinateGroup(latitude: number | null, longitude: number | null) {
    if (latitude === null || longitude === null) {
      return [];
    }
    return this.photoRepository.listByCoordinates(latitude, longitude);
  }

  private async resolveSharedDescriptionForGroup(
    photos: PhotoRecord[],
    options?: { forceRegenerate?: boolean }
  ): Promise<{
    description: string;
    descriptionSource: DescriptionSource;
    generation: LocationNarrativeGenerationResult | null;
  }> {
    const ordered = sortByUpdatedAtDesc(photos);
    const manual = ordered.find((photo) => photo.descriptionSource === "manual" && normalizeDescription(photo.description));
    if (manual) {
      return {
        description: normalizeDescription(manual.description),
        descriptionSource: "manual" as const,
        generation: null
      };
    }

    const existing = ordered.find((photo) => normalizeDescription(photo.description));
    if (existing && !options?.forceRegenerate) {
      return {
        description: normalizeDescription(existing.description),
        descriptionSource: existing.descriptionSource === "none" ? ("auto" as const) : existing.descriptionSource,
        generation: null
      };
    }

    const generation = await this.locationNarrativeService.generateDetailedForPhotos(photos);
    const generated = normalizeDescription(generation.description);
    return {
      description: generated,
      descriptionSource: generated ? ("auto" as const) : ("none" as const),
      generation
    };
  }

  private async syncSharedDescriptionForCoordinates(
    latitude: number | null,
    longitude: number | null,
    options?: { forceRegenerate?: boolean }
  ) {
    const result = await this.syncSharedDescriptionForCoordinatesDetailed(latitude, longitude, options);
    return result.photos;
  }

  private async syncSharedDescriptionForCoordinatesDetailed(
    latitude: number | null,
    longitude: number | null,
    options?: { forceRegenerate?: boolean }
  ): Promise<{
    photos: PhotoRecord[];
    resolved: {
      description: string;
      descriptionSource: DescriptionSource;
      generation: LocationNarrativeGenerationResult | null;
    } | null;
  }> {
    const group = this.listCoordinateGroup(latitude, longitude);
    if (!group.length) {
      return { photos: [], resolved: null };
    }

    const resolved = await this.resolveSharedDescriptionForGroup(group, options);
    const needsUpdate = group.some(
      (photo) =>
        normalizeDescription(photo.description) !== resolved.description ||
        photo.descriptionSource !== resolved.descriptionSource
    );

    if (!needsUpdate) {
      return {
        photos: group,
        resolved
      };
    }

    return {
      photos: this.photoRepository.batchUpdate(
        group.map((photo) => photo.id),
        {
          description: resolved.description,
          descriptionSource: resolved.descriptionSource
        }
      ),
      resolved
    };
  }

  private setManualDescriptionForCoordinates(latitude: number, longitude: number, description: string) {
    const group = this.listCoordinateGroup(latitude, longitude);
    if (!group.length) {
      return [];
    }

    const normalized = normalizeDescription(description);
    return this.photoRepository.batchUpdate(
      group.map((photo) => photo.id),
      {
        description: normalized,
        descriptionSource: inferDescriptionSource(normalized)
      }
    );
  }

  private buildSharedNarrativeResult(
    photos: PhotoRecord[],
    resolved:
      | {
          description: string;
          descriptionSource: DescriptionSource;
          generation: LocationNarrativeGenerationResult | null;
        }
      | null,
    fallback?: { latitude: number; longitude: number; locationLabel?: string; narrativePrompt?: string }
  ): SharedNarrativeResult | null {
    if (!photos.length && !fallback) {
      return null;
    }

    const anchor = photos[0];
    return {
      latitude: anchor?.latitude ?? fallback?.latitude ?? 0,
      longitude: anchor?.longitude ?? fallback?.longitude ?? 0,
      locationLabel: fallback?.locationLabel || photos.find((photo) => photo.locationLabel.trim())?.locationLabel || "",
      narrativePrompt: fallback?.narrativePrompt ?? latestNarrativePrompt(photos),
      description: resolved?.description ?? photos.find((photo) => normalizeDescription(photo.description))?.description ?? "",
      descriptionSource:
        resolved?.descriptionSource ??
        photos.find((photo) => normalizeDescription(photo.description))?.descriptionSource ??
        "none",
      photoCount: photos.length,
      wasTruncated: resolved?.generation?.wasTruncated ?? false,
      finishReason: resolved?.generation?.finishReason ?? null,
      error: resolved?.generation?.error ?? null
    };
  }

  private findUpdatedPhoto(photos: PhotoRecord[], id: string) {
    return photos.find((photo) => photo.id === id) ?? this.photoRepository.getById(id);
  }

  async updatePhoto(id: string, input: UpdatePhotoInput) {
    const current = this.photoRepository.getById(id);
    if (!current) {
      return null;
    }

    const capturedAt = input.capturedAt === undefined ? current.capturedAt : input.capturedAt;
    const latitude = input.latitude === undefined ? current.latitude : input.latitude;
    const longitude = input.longitude === undefined ? current.longitude : input.longitude;
    const hasGeo = latitude !== null && longitude !== null;
    const coordinatesChanged = !sameCoordinates(current, { latitude, longitude });
    const capturedAtChanged = capturedAt !== current.capturedAt;
    const descriptionChanged = input.description !== undefined;
    const nextDescription = descriptionChanged
      ? normalizeDescription(input.description)
      : hasGeo && coordinatesChanged
        ? ""
        : current.description;
    const nextDescriptionSource = descriptionChanged
      ? inferDescriptionSource(nextDescription)
      : hasGeo && coordinatesChanged
        ? ("none" as const)
        : current.descriptionSource;

    const shouldRefreshGeoSummary =
      !hasGeo ||
      coordinatesChanged ||
      !current.geoSummaryEn;
    const geoSummaryFields = shouldRefreshGeoSummary
      ? await this.resolveGeoSummaryForCoordinates(latitude, longitude)
      : {
          geoCountryEn: current.geoCountryEn,
          geoRegionEn: current.geoRegionEn,
          geoLocalityEn: current.geoLocalityEn,
          geoSummaryEn: current.geoSummaryEn,
          geoResolvedAt: current.geoResolvedAt
        };

    const updated = this.photoRepository.update(id, {
      title: input.title ?? current.title,
      narrativePrompt: input.narrativePrompt ?? current.narrativePrompt,
      description: nextDescription,
      descriptionSource: nextDescriptionSource,
      capturedAt,
      locationLabel: input.locationLabel ?? current.locationLabel,
      visibilityStatus: input.visibilityStatus ?? current.visibilityStatus,
      latitude,
      longitude,
      hasGeo,
      ...geoSummaryFields
    });
    if (!updated) {
      return null;
    }

    if (!hasGeo) {
      return updated;
    }

    if (descriptionChanged) {
      return this.findUpdatedPhoto(this.setManualDescriptionForCoordinates(latitude, longitude, nextDescription), id);
    }

    if (coordinatesChanged) {
      return this.findUpdatedPhoto(await this.syncSharedDescriptionForCoordinates(latitude, longitude), id);
    }

    if (capturedAtChanged) {
      return this.findUpdatedPhoto(
        await this.syncSharedDescriptionForCoordinates(latitude, longitude, { forceRegenerate: true }),
        id
      );
    }

    return updated;
  }

  async regenerateLocationNarrativeForPhoto(id: string) {
    const current = this.photoRepository.getById(id);
    if (!current) {
      return null;
    }
    if (current.latitude === null || current.longitude === null) {
      throw new Error("Photo must have GPS coordinates before regenerating an AI intro");
    }

    const group = this.listCoordinateGroup(current.latitude, current.longitude);
    if (!group.length) {
      throw new Error("No photos found for this coordinate group");
    }

    const generation = await this.locationNarrativeService.generateDetailedForPhotos(group);
    const description = normalizeDescription(generation.description);
    if (!description) {
      throw new Error(generation.error || "AI intro generation returned empty text");
    }

    const updatedGroup = this.photoRepository.batchUpdate(
      group.map((photo) => photo.id),
      {
        description,
        descriptionSource: "auto"
      }
    );

    return {
      photo: this.findUpdatedPhoto(updatedGroup, id),
      updatedCount: updatedGroup.length
    };
  }

  batchVisibility(ids: string[], visibilityStatus: VisibilityStatus) {
    return this.photoRepository.batchUpdate(ids, { visibilityStatus });
  }

  batchDelete(ids: string[]) {
    return this.photoRepository.batchUpdate(ids, { deletedAt: new Date().toISOString() });
  }

  batchRestore(ids: string[]) {
    return this.photoRepository.batchUpdate(ids, { deletedAt: null });
  }

  async batchPurge(ids: string[]) {
    const items: Array<{ id: string; status: "purged" | "failed" | "skipped"; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const id of ids) {
      const photo = this.photoRepository.getById(id);
      if (!photo || !photo.deletedAt) {
        items.push({ id, status: "skipped", error: photo ? "Photo is not deleted" : "Photo not found" });
        skippedCount += 1;
        continue;
      }

      try {
        await deleteFileIfPresent(photo.originalAssetPath);
        await deleteFileIfPresent(publicAssetPathToAbsolute(photo.thumbnailUrl));
        await deleteFileIfPresent(publicAssetPathToAbsolute(photo.displayImageUrl));
        this.photoRepository.deleteById(id);
        items.push({ id, status: "purged" });
        successCount += 1;
      } catch (error) {
        items.push({
          id,
          status: "failed",
          error: error instanceof Error ? error.message : "Purge failed"
        });
        failedCount += 1;
      }
    }

    return {
      items,
      successCount,
      failedCount,
      skippedCount
    };
  }

  async batchPurgeDeleted() {
    const deletedIds = this.photoRepository
      .list({ deleted: true })
      .filter((photo) => Boolean(photo.deletedAt))
      .map((photo) => photo.id);

    return this.batchPurge(deletedIds);
  }

  async batchGps(ids: string[], latitude: number, longitude: number, locationLabel: string, narrativePrompt?: string) {
    const updated: PhotoRecord[] = [];
    const normalizedPrompt = (narrativePrompt ?? "").trim();
    const geoSummaryFields = await this.resolveGeoSummaryForCoordinates(latitude, longitude);
    for (const id of ids) {
      const photo = this.photoRepository.getById(id);
      if (!photo) {
        continue;
      }
      const result = this.photoRepository.update(id, {
        latitude,
        longitude,
        hasGeo: true,
        narrativePrompt: normalizedPrompt || photo.narrativePrompt,
        description: "",
        descriptionSource: "none",
        locationLabel: locationLabel || photo.locationLabel,
        ...geoSummaryFields
      });
      if (result) {
        updated.push(result);
      }
    }
    const synced = await this.syncSharedDescriptionForCoordinatesDetailed(latitude, longitude);
    return {
      items: updated
        .map((photo) => synced.photos.find((item) => item.id === photo.id) ?? this.photoRepository.getById(photo.id))
        .filter((photo): photo is PhotoRecord => Boolean(photo)),
      narrative: this.buildSharedNarrativeResult(synced.photos, synced.resolved, {
        latitude,
        longitude,
        locationLabel,
        narrativePrompt: normalizedPrompt
      })
    };
  }

  async regenerateBatchGpsNarrative(
    ids: string[],
    latitude: number,
    longitude: number,
    locationLabel: string,
    narrativePrompt?: string
  ) {
    const normalizedPrompt = (narrativePrompt ?? "").trim();
    if (ids.length && (normalizedPrompt || locationLabel)) {
      this.photoRepository.batchUpdate(ids, {
        ...(normalizedPrompt ? { narrativePrompt: normalizedPrompt } : {}),
        ...(locationLabel ? { locationLabel } : {})
      });
    }

    const synced = await this.syncSharedDescriptionForCoordinatesDetailed(latitude, longitude, { forceRegenerate: true });
    return {
      items: synced.photos.filter((photo) => ids.includes(photo.id)),
      narrative: this.buildSharedNarrativeResult(synced.photos, synced.resolved, {
        latitude,
        longitude,
        locationLabel,
        narrativePrompt: normalizedPrompt
      })
    };
  }

  saveBatchGpsNarrative(
    ids: string[],
    latitude: number,
    longitude: number,
    locationLabel: string,
    description: string,
    narrativePrompt?: string
  ) {
    const normalizedPrompt = (narrativePrompt ?? "").trim();
    if (ids.length && (normalizedPrompt || locationLabel)) {
      this.photoRepository.batchUpdate(ids, {
        ...(normalizedPrompt ? { narrativePrompt: normalizedPrompt } : {}),
        ...(locationLabel ? { locationLabel } : {})
      });
    }

    const normalizedDescription = normalizeDescription(description);
    const synced = this.setManualDescriptionForCoordinates(latitude, longitude, normalizedDescription);
    return {
      items: synced.filter((photo) => ids.includes(photo.id)),
      narrative: this.buildSharedNarrativeResult(
        synced,
        {
          description: normalizedDescription,
          descriptionSource: inferDescriptionSource(normalizedDescription),
          generation: null
        },
        {
          latitude,
          longitude,
          locationLabel,
          narrativePrompt: normalizedPrompt
        }
      )
    };
  }

  createImportJob(filenames: string[]) {
    const job = this.importJobRepository.createJob(filenames.length);
    this.importJobRepository.createItems(job.id, filenames);
    return this.importJobRepository.getJobWithItems(job.id)!;
  }

  private async processSingleFile(jobId: string, itemId: string, file: Express.Multer.File) {
    const item = this.importJobRepository.getItem(jobId, itemId);
    if (!item) {
      throw new Error("Import job item not found");
    }
    if (item.status === "success") {
      throw new Error("Import job item already completed");
    }

    this.importJobRepository.markJobRunning(jobId);
    this.importJobRepository.updateItem(itemId, { status: "uploading", errorMessage: null, photoId: null });

    let generated:
      | {
          id: string;
          originalTarget: string;
          managedTarget: string;
          thumbTarget: string;
          displayTarget: string;
        }
      | undefined;

    try {
      this.importJobRepository.updateItem(itemId, { status: "processing" });
      generated = await ingestUploadedFile(file.path, file.originalname);
      const metadata = await parseMetadata(generated.managedTarget);
      const now = new Date().toISOString();
      const geoSummaryFields =
        metadata.hasGeo && metadata.latitude !== null && metadata.longitude !== null
          ? await this.resolveGeoSummaryForCoordinates(metadata.latitude, metadata.longitude)
          : emptyGeoSummaryFields();
      const record: PhotoRecord = {
        id: generated.id,
        originalAssetPath: generated.originalTarget,
        managedAssetPath: generated.managedTarget,
        thumbnailUrl: toPublicPath(generated.thumbTarget),
        displayImageUrl: toPublicPath(generated.displayTarget),
        title: readTitleFromFilename(file.originalname),
        narrativePrompt: "",
        description: "",
        descriptionSource: "none",
        capturedAt: metadata.capturedAt,
        latitude: metadata.latitude,
        longitude: metadata.longitude,
        altitude: metadata.altitude,
        hasGeo: metadata.hasGeo,
        locationLabel: "",
        ...geoSummaryFields,
        visibilityStatus: "visible",
        deletedAt: null,
        importedAt: now,
        updatedAt: now
      };

      this.photoRepository.upsert(record);
      if (record.hasGeo && record.latitude !== null && record.longitude !== null) {
        await this.syncSharedDescriptionForCoordinates(record.latitude, record.longitude);
      }
      this.importJobRepository.updateItem(itemId, {
        status: "success",
        photoId: record.id,
        errorMessage: null
      });
      return { id: record.id, hasGeo: record.hasGeo, filename: file.originalname, status: "success" as const };
    } catch (error) {
      await cleanupGeneratedFiles([
        generated?.originalTarget,
        generated?.managedTarget,
        generated?.thumbTarget,
        generated?.displayTarget
      ]);
      const message = error instanceof Error ? error.message : "Import failed";
      this.importJobRepository.updateItem(itemId, {
        status: "failed",
        errorMessage: message,
        photoId: null
      });
      return { filename: file.originalname, status: "failed" as const, error: message };
    } finally {
      await fs.unlink(file.path).catch(() => undefined);
      this.importJobRepository.refreshJob(jobId);
    }
  }

  async uploadFileToImportJob(jobId: string, itemId: string, file: Express.Multer.File) {
    const result = await this.processSingleFile(jobId, itemId, file);
    return {
      item: this.importJobRepository.getItem(jobId, itemId),
      job: this.importJobRepository.getJobWithItems(jobId),
      result
    };
  }

  async importUploadedPhotos(files: Express.Multer.File[]) {
    const job = this.createImportJob(files.map((file) => file.originalname));
    const results = [];

    for (let index = 0; index < files.length; index += 1) {
      const item = job.items[index];
      const file = files[index];
      const processed = await this.processSingleFile(job.id, item.id, file);
      results.push(processed);
    }

    return {
      job: this.importJobRepository.getJobWithItems(job.id)!,
      results
    };
  }

  listImportJobs() {
    return this.importJobRepository.listJobs();
  }

  getImportJob(jobId: string): ImportJobWithItems | null {
    return this.importJobRepository.getJobWithItems(jobId);
  }

  async backfillGeoSummaries(force = false) {
    const photos = this.photoRepository.list({ hasGeo: true });
    const targetPhotos = force ? photos : photos.filter((photo) => !photo.geoSummaryEn.trim());
    const groups = new Map<string, PhotoRecord[]>();

    for (const photo of targetPhotos) {
      if (photo.latitude === null || photo.longitude === null) {
        continue;
      }
      const key = `${photo.latitude}:${photo.longitude}`;
      const existing = groups.get(key);
      if (existing) {
        existing.push(photo);
      } else {
        groups.set(key, [photo]);
      }
    }

    let updatedCount = 0;
    let skippedCount = 0;

    for (const group of groups.values()) {
      const [firstPhoto] = group;
      if (firstPhoto.latitude === null || firstPhoto.longitude === null) {
        skippedCount += group.length;
        continue;
      }
      const geoSummaryFields = await this.resolveGeoSummaryForCoordinates(firstPhoto.latitude, firstPhoto.longitude);
      if (!geoSummaryFields.geoSummaryEn) {
        skippedCount += group.length;
        continue;
      }
      this.photoRepository.batchUpdate(
        group.map((photo) => photo.id),
        geoSummaryFields
      );
      updatedCount += group.length;
    }

    return {
      totalWithGeo: photos.length,
      missingSummaryCount: targetPhotos.length,
      coordinateGroupCount: groups.size,
      updatedCount,
      skippedCount
    };
  }

  async backfillCapturedAt(options?: {
    onPhotoProcessed?: (result: CapturedAtBackfillPhotoResult, index: number, total: number) => void | Promise<void>;
  }) {
    const photos = this.photoRepository.list();
    const totalCount = photos.length;
    let updatedCount = 0;
    let unchangedCount = 0;
    let failedCount = 0;

    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      try {
        const nextCapturedAt = await readCapturedAtFromExif(photo.originalAssetPath);
        const status = nextCapturedAt === photo.capturedAt ? "unchanged" : "updated";

        if (status === "updated") {
          this.photoRepository.update(photo.id, { capturedAt: nextCapturedAt });
          updatedCount += 1;
        } else {
          unchangedCount += 1;
        }

        await options?.onPhotoProcessed?.(
          {
            id: photo.id,
            title: photo.title,
            locationLabel: photo.locationLabel,
            status,
            previousCapturedAt: photo.capturedAt,
            nextCapturedAt,
            error: null
          },
          index + 1,
          totalCount
        );
      } catch (error) {
        failedCount += 1;
        await options?.onPhotoProcessed?.(
          {
            id: photo.id,
            title: photo.title,
            locationLabel: photo.locationLabel,
            status: "failed",
            previousCapturedAt: photo.capturedAt,
            nextCapturedAt: null,
            error: error instanceof Error ? error.message : "Failed to backfill captured time"
          },
          index + 1,
          totalCount
        );
      }
    }

    return {
      totalCount,
      updatedCount,
      unchangedCount,
      failedCount
    };
  }

  async backfillLocationNarratives(options?: {
    forceRegenerate?: boolean;
    concurrency?: number;
    onGroupProcessed?: (result: NarrativeBackfillGroupResult, index: number, total: number) => void | Promise<void>;
  }) {
    const photos = this.photoRepository.list({ hasGeo: true });
    const groups = new Map<string, PhotoRecord[]>();

    for (const photo of photos) {
      if (photo.latitude === null || photo.longitude === null) {
        continue;
      }
      const key = coordinateKey(photo);
      const existing = groups.get(key);
      if (existing) {
        existing.push(photo);
      } else {
        groups.set(key, [photo]);
      }
    }

    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let truncatedCount = 0;
    let processedGroupCount = 0;
    const totalGroupCount = groups.size;
    const entries = Array.from(groups.entries());
    let nextIndex = 0;
    const concurrency = Math.max(1, Math.min(options?.concurrency ?? 4, totalGroupCount || 1));

    async function processEntry(this: PhotoService, entry: [string, PhotoRecord[]]) {
      const [key, group] = entry;
      const [firstPhoto] = group;
      const locationLabel = group.find((photo) => normalizeDescription(photo.locationLabel))?.locationLabel ?? "";
      const geoSummaryEn = group.find((photo) => normalizeDescription(photo.geoSummaryEn))?.geoSummaryEn ?? "";

      if (firstPhoto.latitude === null || firstPhoto.longitude === null) {
        skippedCount += group.length;
        return {
          key,
          photoCount: group.length,
          latitude: 0,
          longitude: 0,
          locationLabel,
          geoSummaryEn,
          status: "skipped" as const,
          action: "empty" as const,
          descriptionSource: "none" as const,
          descriptionPreview: "",
          wasTruncated: false,
          rawCharacterCount: 0,
          finishReason: null,
          retriedFinalOnly: false,
          error: "Missing coordinates"
        };
      }

      const orderedGroup = sortByUpdatedAtDesc(group);
      const existingWithDescription = orderedGroup.find((photo) => normalizeDescription(photo.description));
      const hadExistingDescription = Boolean(existingWithDescription);
      const existingDescription = normalizeDescription(existingWithDescription?.description);
      const existingSource = existingWithDescription?.descriptionSource ?? "none";
      const resolved = await this.resolveSharedDescriptionForGroup(group, {
        forceRegenerate: Boolean(options?.forceRegenerate)
      });
      const needsUpdate = group.some(
        (photo) =>
          normalizeDescription(photo.description) !== resolved.description ||
          photo.descriptionSource !== resolved.descriptionSource
      );

      if (resolved.descriptionSource === "manual") {
        skippedCount += group.length;
        return {
          key,
          photoCount: group.length,
          latitude: firstPhoto.latitude,
          longitude: firstPhoto.longitude,
          locationLabel,
          geoSummaryEn,
          status: "skipped" as const,
          action: "skipped_manual" as const,
          descriptionSource: "manual" as const,
          descriptionPreview: resolved.description.slice(0, 120),
          wasTruncated: false,
          rawCharacterCount: countCharacters(resolved.description),
          finishReason: null,
          retriedFinalOnly: false,
          error: null
        };
      }

      if (!resolved.description) {
        failedCount += group.length;
        return {
          key,
          photoCount: group.length,
          latitude: firstPhoto.latitude,
          longitude: firstPhoto.longitude,
          locationLabel,
          geoSummaryEn,
          status: "failure" as const,
          action: hadExistingDescription ? ("preserved_existing" as const) : ("empty" as const),
          descriptionSource: hadExistingDescription ? existingSource : ("none" as const),
          descriptionPreview: hadExistingDescription ? existingDescription.slice(0, 120) : "",
          wasTruncated: false,
          rawCharacterCount: resolved.generation?.rawCharacterCount ?? 0,
          finishReason: resolved.generation?.finishReason ?? null,
          retriedFinalOnly: resolved.generation?.retriedFinalOnly ?? false,
          error: resolved.generation?.error ?? "Narrative generation returned empty text"
        };
      }

      if (!needsUpdate) {
        skippedCount += group.length;
        if (resolved.generation?.wasTruncated) {
          truncatedCount += group.length;
        }
        return {
          key,
          photoCount: group.length,
          latitude: firstPhoto.latitude,
          longitude: firstPhoto.longitude,
          locationLabel,
          geoSummaryEn,
          status: "success" as const,
          action: "unchanged" as const,
          descriptionSource: resolved.descriptionSource,
          descriptionPreview: resolved.description.slice(0, 120),
          wasTruncated: resolved.generation?.wasTruncated ?? false,
          rawCharacterCount: resolved.generation?.rawCharacterCount ?? countCharacters(resolved.description),
          finishReason: resolved.generation?.finishReason ?? null,
          retriedFinalOnly: resolved.generation?.retriedFinalOnly ?? false,
          error: null
        };
      }

      this.photoRepository.batchUpdate(
        group.map((photo) => photo.id),
        {
          description: resolved.description,
          descriptionSource: resolved.descriptionSource
        }
      );
      updatedCount += group.length;
      if (resolved.generation?.wasTruncated) {
        truncatedCount += group.length;
      }
      return {
        key,
        photoCount: group.length,
        latitude: firstPhoto.latitude,
        longitude: firstPhoto.longitude,
        locationLabel,
        geoSummaryEn,
        status: "success" as const,
        action: "updated" as const,
        descriptionSource: resolved.descriptionSource,
        descriptionPreview: resolved.description.slice(0, 120),
        wasTruncated: resolved.generation?.wasTruncated ?? false,
        rawCharacterCount: resolved.generation?.rawCharacterCount ?? countCharacters(resolved.description),
        finishReason: resolved.generation?.finishReason ?? null,
        retriedFinalOnly: resolved.generation?.retriedFinalOnly ?? false,
        error: null
      };
    }

    async function worker(this: PhotoService) {
      while (nextIndex < entries.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const result = await processEntry.call(this, entries[currentIndex]);
        processedGroupCount += 1;
        await options?.onGroupProcessed?.(result, processedGroupCount, totalGroupCount);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker.call(this)));

    return {
      totalWithGeo: photos.length,
      coordinateGroupCount: groups.size,
      updatedCount,
      skippedCount,
      failedCount,
      truncatedCount
    };
  }
}
