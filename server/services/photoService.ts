import fs from "node:fs/promises";
import path from "node:path";
import type { Express } from "express";
import { appRoot } from "../config.js";
import { ingestUploadedFile, parseMetadata, toPublicPath, writeGpsToManagedExif } from "../image.js";
import { ImportJobRepository } from "../repositories/importJobRepository.js";
import { PhotoRepository } from "../repositories/photoRepository.js";
import type { ImportJobWithItems, PhotoListFilters, PhotoRecord, VisibilityStatus } from "../types.js";

type UpdatePhotoInput = {
  title?: string;
  description?: string;
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

export class PhotoService {
  constructor(
    private readonly photoRepository = new PhotoRepository(),
    private readonly importJobRepository = new ImportJobRepository()
  ) {}

  listPublicPhotos() {
    return this.photoRepository.list({ visibilityStatus: "visible", deleted: false, hasGeo: true });
  }

  listAdminPhotos(filters: PhotoListFilters) {
    return this.photoRepository.list(filters);
  }

  getPhoto(id: string) {
    return this.photoRepository.getById(id);
  }

  async updatePhoto(id: string, input: UpdatePhotoInput) {
    const current = this.photoRepository.getById(id);
    if (!current) {
      return null;
    }

    const latitude = input.latitude === undefined ? current.latitude : input.latitude;
    const longitude = input.longitude === undefined ? current.longitude : input.longitude;
    const hasGeo = latitude !== null && longitude !== null;

    if (hasGeo) {
      await writeGpsToManagedExif(current.managedAssetPath, latitude, longitude);
    }

    return this.photoRepository.update(id, {
      title: input.title ?? current.title,
      description: input.description ?? current.description,
      locationLabel: input.locationLabel ?? current.locationLabel,
      visibilityStatus: input.visibilityStatus ?? current.visibilityStatus,
      latitude,
      longitude,
      hasGeo
    });
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
        await deleteFileIfPresent(photo.managedAssetPath);
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

  async batchGps(ids: string[], latitude: number, longitude: number, locationLabel: string) {
    const updated: PhotoRecord[] = [];
    for (const id of ids) {
      const photo = this.photoRepository.getById(id);
      if (!photo) {
        continue;
      }
      await writeGpsToManagedExif(photo.managedAssetPath, latitude, longitude);
      const result = this.photoRepository.update(id, {
        latitude,
        longitude,
        hasGeo: true,
        locationLabel: locationLabel || photo.locationLabel
      });
      if (result) {
        updated.push(result);
      }
    }
    return updated;
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
      const record: PhotoRecord = {
        id: generated.id,
        originalAssetPath: generated.originalTarget,
        managedAssetPath: generated.managedTarget,
        thumbnailUrl: toPublicPath(generated.thumbTarget),
        displayImageUrl: toPublicPath(generated.displayTarget),
        title: readTitleFromFilename(file.originalname),
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

      this.photoRepository.upsert(record);
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
}
