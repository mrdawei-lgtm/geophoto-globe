import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { Express } from "express";
import { appRoot } from "../config.js";
import { ingestUploadedFile, parseMetadata, readCapturedAtFromExif, toPublicPath } from "../image.js";
import { ImportJobRepository } from "../repositories/importJobRepository.js";
import { PhotoGroupRepository } from "../repositories/photoGroupRepository.js";
import { PhotoRepository } from "../repositories/photoRepository.js";
import { GeoSummaryService, emptyGeoSummaryFields } from "./geoSummaryService.js";
import { LocationNarrativeService } from "./locationNarrativeService.js";
import type { LocationNarrativeGenerationResult } from "./locationNarrativeService.js";
import type {
  DescriptionSource,
  ImportJobWithItems,
  PhotoListFilters,
  PhotoGroupListFilters,
  PhotoGroupRecord,
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

type UpdatePhotoGroupInput = {
  locationLabel?: string;
  narrativePrompt?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
};

type GroupSyncOptions = {
  forceRegenerate?: boolean;
};

type PhotoGroupMemberSummary = {
  id: string;
  title: string;
  thumbnailUrl: string;
  capturedAt: string | null;
  visibilityStatus: VisibilityStatus;
  deletedAt: string | null;
  isCover: boolean;
};

type PhotoGroupDetail = PhotoGroupRecord & {
  photoCount: number;
  visibleCount: number;
  hiddenCount: number;
  deletedCount: number;
  issues: string[];
  coverThumbnailUrl: string | null;
  members: PhotoGroupMemberSummary[];
};

type EnrichedPhotoRecord = PhotoRecord & {
  groupPhotoCount: number;
  photoGroupCoverThumbnailUrl: string | null;
  isGroupCover: boolean;
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

function groupPhotosForAdmin(photos: PhotoRecord[]) {
  const grouped = new Map<string, PhotoRecord[]>();
  const orderedKeys: string[] = [];
  const ungrouped: PhotoRecord[] = [];

  for (const photo of photos) {
    if (!photo.photoGroupId) {
      ungrouped.push(photo);
      continue;
    }

    const key = photo.photoGroupId;
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

function explicitGroupKey(photo: { photoGroupId: string | null; latitude: number | null; longitude: number | null }) {
  return photo.photoGroupId ?? coordinateKey(photo);
}

function sortByUpdatedAtDesc(photos: PhotoRecord[]) {
  return [...photos].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function sortByGroupDisplayOrder(photos: PhotoRecord[]) {
  return [...photos].sort((left, right) => {
    const leftValue = left.capturedAt || left.importedAt;
    const rightValue = right.capturedAt || right.importedAt;
    if (leftValue === rightValue) {
      return right.importedAt.localeCompare(left.importedAt);
    }
    return rightValue.localeCompare(leftValue);
  });
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

function pickNonEmptyValue(photos: PhotoRecord[], selector: (photo: PhotoRecord) => string) {
  return sortByUpdatedAtDesc(photos)
    .map((photo) => selector(photo).trim())
    .find(Boolean) ?? "";
}

function buildPhotoGroupIssues(group: PhotoGroupRecord, members: PhotoRecord[]) {
  const issues: string[] = [];
  const activeMembers = members.filter((photo) => !photo.deletedAt);
  const visibilitySet = new Set(activeMembers.map((photo) => photo.visibilityStatus));
  const locationLabelSet = new Set(
    members.map((photo) => photo.locationLabel.trim()).filter(Boolean)
  );

  if (!group.locationLabel.trim()) {
    issues.push("missing_location_label");
  }
  if (!group.description.trim()) {
    issues.push("missing_description");
  }
  if (visibilitySet.size > 1) {
    issues.push("mixed_visibility");
  }
  if (locationLabelSet.size > 1) {
    issues.push("mixed_location_label");
  }
  if (!group.coverPhotoId || !members.some((photo) => photo.id === group.coverPhotoId && !photo.deletedAt)) {
    issues.push("orphaned_cover");
  }

  return issues;
}

export class PhotoService {
  constructor(
    private readonly photoRepository = new PhotoRepository(),
    private readonly photoGroupRepository = new PhotoGroupRepository(),
    private readonly importJobRepository = new ImportJobRepository(),
    private readonly geoSummaryService = new GeoSummaryService(),
    private readonly locationNarrativeService = new LocationNarrativeService()
  ) {}

  listPublicPhotos() {
    return this.photoRepository.list({ visibilityStatus: "visible", deleted: false, hasGeo: true });
  }

  listPublicPhotoGroups() {
    const photos = sortByGroupDisplayOrder(this.listPublicPhotos());
    const groups = this.photoGroupRepository.list();
    const groupMap = new Map(groups.map((group) => [group.id, group] as const));
    const grouped = new Map<string, PhotoRecord[]>();

    for (const photo of photos) {
      const key = explicitGroupKey(photo);
      const existing = grouped.get(key);
      if (existing) {
        existing.push(photo);
      } else {
        grouped.set(key, [photo]);
      }
    }

    return Array.from(grouped.entries()).map(([key, members]) => {
      const group = members[0].photoGroupId ? groupMap.get(members[0].photoGroupId) ?? null : null;
      const coverPhoto = members.find((photo) => photo.id === group?.coverPhotoId) ?? members[0];
      return {
        id: key,
        photoId: coverPhoto.id,
        latitude: group?.latitude ?? coverPhoto.latitude ?? 0,
        longitude: group?.longitude ?? coverPhoto.longitude ?? 0,
        count: members.length,
        coverThumbnailUrl: coverPhoto.thumbnailUrl
      };
    });
  }

  listAdminPhotos(filters: PhotoListFilters) {
    return groupPhotosForAdmin(this.enrichPhotosWithGroupSummary(this.photoRepository.list(filters)));
  }

  listAdminPhotoGroups(filters: PhotoGroupListFilters = {}) {
    const groups = this.photoGroupRepository.list();
    const photos = this.photoRepository.list();
    const photosByGroupId = new Map<string, PhotoRecord[]>();

    for (const photo of photos) {
      if (!photo.photoGroupId) {
        continue;
      }
      const existing = photosByGroupId.get(photo.photoGroupId);
      if (existing) {
        existing.push(photo);
      } else {
        photosByGroupId.set(photo.photoGroupId, [photo]);
      }
    }

    return groups
      .map((group) => {
        const members = sortByGroupDisplayOrder(photosByGroupId.get(group.id) ?? []);
        if (!members.length) {
          return null;
        }

        const activeMembers = members.filter((photo) => !photo.deletedAt);
        const visibleCount = activeMembers.filter((photo) => photo.visibilityStatus === "visible").length;
        const hiddenCount = activeMembers.filter((photo) => photo.visibilityStatus === "hidden").length;
        const deletedCount = members.filter((photo) => Boolean(photo.deletedAt)).length;
        const coverPhoto = members.find((photo) => photo.id === group.coverPhotoId) ?? activeMembers[0] ?? members[0] ?? null;
        const issues = buildPhotoGroupIssues(group, members);

        return {
          ...group,
          photoCount: members.length,
          visibleCount,
          hiddenCount,
          deletedCount,
          issues,
          coverThumbnailUrl: coverPhoto?.thumbnailUrl ?? null
        };
      })
      .filter((group): group is NonNullable<typeof group> => Boolean(group))
      .filter((group) => this.matchesPhotoGroupFilters(group, filters));
  }

  getPhoto(id: string) {
    return this.photoRepository.getById(id);
  }

  getAdminPhoto(id: string) {
    const photo = this.photoRepository.getById(id);
    if (!photo) {
      return null;
    }

    const enriched = this.enrichPhotoWithGroupSummary(photo);
    if (!photo.photoGroupId) {
      return {
        ...enriched,
        group: null
      };
    }

    return {
      ...enriched,
      group: this.getAdminPhotoGroup(photo.photoGroupId)
    };
  }

  getAdminPhotoGroup(id: string): PhotoGroupDetail | null {
    const group = this.photoGroupRepository.getById(id);
    if (!group) {
      return null;
    }
    const members = sortByGroupDisplayOrder(this.photoRepository.listByGroupId(id));
    if (!members.length) {
      return null;
    }
    const activeMembers = members.filter((photo) => !photo.deletedAt);
    const coverPhoto = members.find((photo) => photo.id === group.coverPhotoId) ?? activeMembers[0] ?? members[0] ?? null;

    return {
      ...group,
      photoCount: members.length,
      visibleCount: activeMembers.filter((photo) => photo.visibilityStatus === "visible").length,
      hiddenCount: activeMembers.filter((photo) => photo.visibilityStatus === "hidden").length,
      deletedCount: members.filter((photo) => Boolean(photo.deletedAt)).length,
      issues: buildPhotoGroupIssues(group, members),
      coverThumbnailUrl: coverPhoto?.thumbnailUrl ?? null,
      members: members.map((photo) => ({
        id: photo.id,
        title: photo.title,
        thumbnailUrl: photo.thumbnailUrl,
        capturedAt: photo.capturedAt,
        visibilityStatus: photo.visibilityStatus,
        deletedAt: photo.deletedAt,
        isCover: photo.id === group.coverPhotoId
      }))
    };
  }

  private async resolveGeoSummaryForCoordinates(latitude: number | null, longitude: number | null) {
    if (latitude === null || longitude === null) {
      return emptyGeoSummaryFields();
    }
    return this.geoSummaryService.resolve(latitude, longitude);
  }

  private matchesPhotoGroupFilters(
    group: {
      locationLabel: string;
      narrativePrompt: string;
      description: string;
      descriptionSource: DescriptionSource;
      visibleCount: number;
      hiddenCount: number;
      deletedCount: number;
      issues: string[];
      coverThumbnailUrl: string | null;
      photoCount: number;
      latitude: number;
      longitude: number;
      geoSummaryEn: string;
    },
    filters: PhotoGroupListFilters
  ) {
    const keyword = filters.q?.trim().toLowerCase();
    if (keyword) {
      const haystack = [
        group.locationLabel,
        group.description,
        group.narrativePrompt,
        group.geoSummaryEn,
        String(group.latitude),
        String(group.longitude)
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) {
        return false;
      }
    }

    if (filters.visibilityStatus === "visible" && group.visibleCount === 0) {
      return false;
    }
    if (filters.visibilityStatus === "hidden" && group.hiddenCount === 0) {
      return false;
    }
    if (filters.descriptionStatus === "missing" && group.description.trim()) {
      return false;
    }
    if (filters.descriptionStatus === "auto" && group.descriptionSource !== "auto") {
      return false;
    }
    if (filters.descriptionStatus === "manual" && group.descriptionSource !== "manual") {
      return false;
    }
    if (typeof filters.hasPrompt === "boolean" && filters.hasPrompt !== Boolean(group.narrativePrompt.trim())) {
      return false;
    }
    if (typeof filters.hasDeleted === "boolean" && filters.hasDeleted !== Boolean(group.deletedCount)) {
      return false;
    }
    if (typeof filters.hasHidden === "boolean" && filters.hasHidden !== Boolean(group.hiddenCount)) {
      return false;
    }
    if (filters.issueType && filters.issueType !== "all" && !group.issues.includes(filters.issueType)) {
      return false;
    }

    return true;
  }

  private enrichPhotosWithGroupSummary(photos: PhotoRecord[]) {
    const groups = this.photoGroupRepository.list();
    const groupMap = new Map(groups.map((group) => [group.id, group] as const));
    const membersByGroupId = new Map<string, PhotoRecord[]>();
    for (const photo of this.photoRepository.list()) {
      if (!photo.photoGroupId) {
        continue;
      }
      const existing = membersByGroupId.get(photo.photoGroupId);
      if (existing) {
        existing.push(photo);
      } else {
        membersByGroupId.set(photo.photoGroupId, [photo]);
      }
    }

    return photos.map((photo) => this.enrichPhotoWithGroupSummary(photo, groupMap, membersByGroupId));
  }

  private enrichPhotoWithGroupSummary(
    photo: PhotoRecord,
    groupMap = new Map(this.photoGroupRepository.list().map((group) => [group.id, group] as const)),
    membersByGroupId = new Map<string, PhotoRecord[]>()
  ): EnrichedPhotoRecord {
    let groupMembers = photo.photoGroupId ? membersByGroupId.get(photo.photoGroupId) : undefined;
    if (!groupMembers && photo.photoGroupId) {
      groupMembers = this.photoRepository.listByGroupId(photo.photoGroupId);
    }
    const group = photo.photoGroupId ? groupMap.get(photo.photoGroupId) ?? this.photoGroupRepository.getById(photo.photoGroupId) : null;
    const coverPhoto = groupMembers?.find((member) => member.id === group?.coverPhotoId) ?? null;

    return {
      ...photo,
      groupPhotoCount: groupMembers?.length ?? (photo.photoGroupId ? 1 : 0),
      photoGroupCoverThumbnailUrl: coverPhoto?.thumbnailUrl ?? null,
      isGroupCover: Boolean(group && group.coverPhotoId === photo.id)
    };
  }

  private listGroupMembersByReference(photo: { photoGroupId: string | null; latitude: number | null; longitude: number | null }) {
    if (photo.photoGroupId) {
      return this.photoRepository.listByGroupId(photo.photoGroupId);
    }
    if (photo.latitude === null || photo.longitude === null) {
      return [];
    }
    return this.photoRepository.listByCoordinates(photo.latitude, photo.longitude);
  }

  private buildPhotoGroupRecord(photos: PhotoRecord[], patch?: Partial<PhotoGroupRecord>): PhotoGroupRecord {
    const orderedByCapture = sortByGroupDisplayOrder(photos);
    const anchor = orderedByCapture[0];
    const now = new Date().toISOString();
    const description = patch?.description ?? pickNonEmptyValue(photos, (photo) => photo.description);
    const descriptionSource = patch?.descriptionSource ?? (
      description
        ? sortByUpdatedAtDesc(photos).find((photo) => normalizeDescription(photo.description))?.descriptionSource ?? "manual"
        : "none"
    );

    return {
      id: patch?.id ?? crypto.randomUUID(),
      latitude: patch?.latitude ?? anchor?.latitude ?? 0,
      longitude: patch?.longitude ?? anchor?.longitude ?? 0,
      locationLabel: patch?.locationLabel ?? pickNonEmptyValue(photos, (photo) => photo.locationLabel),
      narrativePrompt: patch?.narrativePrompt ?? latestNarrativePrompt(photos),
      description,
      descriptionSource,
      geoCountryEn: patch?.geoCountryEn ?? pickNonEmptyValue(photos, (photo) => photo.geoCountryEn),
      geoRegionEn: patch?.geoRegionEn ?? pickNonEmptyValue(photos, (photo) => photo.geoRegionEn),
      geoLocalityEn: patch?.geoLocalityEn ?? pickNonEmptyValue(photos, (photo) => photo.geoLocalityEn),
      geoSummaryEn: patch?.geoSummaryEn ?? pickNonEmptyValue(photos, (photo) => photo.geoSummaryEn),
      geoResolvedAt: patch?.geoResolvedAt ?? sortByUpdatedAtDesc(photos).find((photo) => photo.geoResolvedAt)?.geoResolvedAt ?? null,
      coverPhotoId: patch?.coverPhotoId ?? anchor?.id ?? null,
      createdAt: patch?.createdAt ?? anchor?.importedAt ?? now,
      updatedAt: patch?.updatedAt ?? now
    };
  }

  private findAutoJoinGroup(latitude: number, longitude: number) {
    const matches = this.photoGroupRepository.listByCoordinates(latitude, longitude);
    return matches.length === 1 ? matches[0] : null;
  }

  private syncGroupFieldsToPhotos(group: PhotoGroupRecord, photos = this.photoRepository.listByGroupId(group.id)) {
    if (!photos.length) {
      return [];
    }

    return this.photoRepository.batchUpdate(
      photos.map((photo) => photo.id),
      {
        photoGroupId: group.id,
        latitude: group.latitude,
        longitude: group.longitude,
        hasGeo: true,
        locationLabel: group.locationLabel,
        narrativePrompt: group.narrativePrompt,
        description: group.description,
        descriptionSource: group.descriptionSource,
        geoCountryEn: group.geoCountryEn,
        geoRegionEn: group.geoRegionEn,
        geoLocalityEn: group.geoLocalityEn,
        geoSummaryEn: group.geoSummaryEn,
        geoResolvedAt: group.geoResolvedAt
      }
    );
  }

  private ensureValidGroupCover(groupId: string) {
    const group = this.photoGroupRepository.getById(groupId);
    if (!group) {
      return null;
    }
    const members = sortByGroupDisplayOrder(this.photoRepository.listByGroupId(groupId));
    if (!members.length) {
      this.photoGroupRepository.deleteById(groupId);
      return null;
    }

    const nextCover = members.find((photo) => photo.id === group.coverPhotoId && !photo.deletedAt)
      ?? members.find((photo) => !photo.deletedAt)
      ?? members[0];

    if (nextCover.id !== group.coverPhotoId) {
      return this.photoGroupRepository.update(groupId, { coverPhotoId: nextCover.id });
    }

    return group;
  }

  private async assignPhotosToGroup(
    photoIds: string[],
    group: PhotoGroupRecord
  ) {
    const now = new Date().toISOString();
    const members = this.photoRepository.listByIds(photoIds);
    for (const member of members) {
      this.photoRepository.update(member.id, {
        photoGroupId: group.id,
        latitude: group.latitude,
        longitude: group.longitude,
        hasGeo: true,
        locationLabel: group.locationLabel,
        narrativePrompt: group.narrativePrompt,
        description: group.description,
        descriptionSource: group.descriptionSource,
        geoCountryEn: group.geoCountryEn,
        geoRegionEn: group.geoRegionEn,
        geoLocalityEn: group.geoLocalityEn,
        geoSummaryEn: group.geoSummaryEn,
        geoResolvedAt: group.geoResolvedAt,
        updatedAt: now
      });
    }
    return this.photoRepository.listByGroupId(group.id);
  }

  private getOrCreatePhotoGroup(
    latitude: number,
    longitude: number,
    patch?: Partial<PhotoGroupRecord>
  ) {
    const existing = this.findAutoJoinGroup(latitude, longitude);
    if (existing) {
      return this.photoGroupRepository.update(existing.id, {
        latitude,
        longitude,
        ...patch
      }) ?? existing;
    }

    return this.photoGroupRepository.create(
      this.buildPhotoGroupRecord([], {
        latitude,
        longitude,
        descriptionSource: patch?.descriptionSource ?? "none",
        coverPhotoId: patch?.coverPhotoId ?? null,
        ...patch
      })
    )!;
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

  private async syncSharedDescriptionForGroup(
    groupId: string,
    options?: GroupSyncOptions
  ) {
    const result = await this.syncSharedDescriptionForGroupDetailed(groupId, options);
    return result.photos;
  }

  private async syncSharedDescriptionForGroupDetailed(
    groupId: string,
    options?: GroupSyncOptions
  ): Promise<{
    group: PhotoGroupRecord | null;
    photos: PhotoRecord[];
    resolved: {
      description: string;
      descriptionSource: DescriptionSource;
      generation: LocationNarrativeGenerationResult | null;
    } | null;
  }> {
    const group = this.photoGroupRepository.getById(groupId);
    if (!group) {
      return { group: null, photos: [], resolved: null };
    }
    const photos = this.photoRepository.listByGroupId(groupId);
    if (!photos.length) {
      this.photoGroupRepository.deleteById(groupId);
      return { group: null, photos: [], resolved: null };
    }

    const resolved = await this.resolveSharedDescriptionForGroup(photos, options);
    const nextGroup = this.photoGroupRepository.update(groupId, {
      description: resolved.description,
      descriptionSource: resolved.descriptionSource
    });
    if (!nextGroup) {
      return { group: null, photos: [], resolved };
    }

    return {
      group: nextGroup,
      photos: this.syncGroupFieldsToPhotos(nextGroup, photos),
      resolved
    };
  }

  private setManualDescriptionForGroup(groupId: string, description: string) {
    const group = this.photoGroupRepository.getById(groupId);
    if (!group) {
      return [];
    }

    const normalized = normalizeDescription(description);
    const nextGroup = this.photoGroupRepository.update(groupId, {
      description: normalized,
      descriptionSource: inferDescriptionSource(normalized)
    });
    if (!nextGroup) {
      return [];
    }

    return this.syncGroupFieldsToPhotos(nextGroup);
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
    const locationLabelChanged = input.locationLabel !== undefined && input.locationLabel !== current.locationLabel;
    const narrativePromptChanged = input.narrativePrompt !== undefined && input.narrativePrompt !== current.narrativePrompt;
    const nextDescription = descriptionChanged ? normalizeDescription(input.description) : current.description;

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

    if (!hasGeo) {
      const updated = this.photoRepository.update(id, {
        title: input.title ?? current.title,
        capturedAt,
        visibilityStatus: input.visibilityStatus ?? current.visibilityStatus,
        latitude,
        longitude,
        hasGeo: false,
        photoGroupId: null,
        locationLabel: input.locationLabel ?? current.locationLabel,
        narrativePrompt: input.narrativePrompt ?? current.narrativePrompt,
        description: descriptionChanged ? nextDescription : current.description,
        descriptionSource: descriptionChanged ? inferDescriptionSource(nextDescription) : current.descriptionSource,
        ...geoSummaryFields
      });
      if (current.photoGroupId) {
        this.ensureValidGroupCover(current.photoGroupId);
      }
      return updated ? this.getAdminPhoto(id) : null;
    }

    const currentGroup = current.photoGroupId ? this.photoGroupRepository.getById(current.photoGroupId) : null;
    const currentGroupMembers = current.photoGroupId ? this.photoRepository.listByGroupId(current.photoGroupId) : [];
    const currentGroupWillMove = coordinatesChanged || !current.photoGroupId;
    const sharedPatch: Partial<PhotoGroupRecord> = {
      latitude,
      longitude,
      locationLabel: input.locationLabel ?? currentGroup?.locationLabel ?? current.locationLabel,
      narrativePrompt: input.narrativePrompt ?? currentGroup?.narrativePrompt ?? current.narrativePrompt,
      geoCountryEn: geoSummaryFields.geoCountryEn,
      geoRegionEn: geoSummaryFields.geoRegionEn,
      geoLocalityEn: geoSummaryFields.geoLocalityEn,
      geoSummaryEn: geoSummaryFields.geoSummaryEn,
      geoResolvedAt: geoSummaryFields.geoResolvedAt
    };
    if (descriptionChanged) {
      sharedPatch.description = nextDescription;
      sharedPatch.descriptionSource = inferDescriptionSource(nextDescription);
    }

    let targetGroup: PhotoGroupRecord;
    let targetHadMembersBeforeMove = false;

    if (!currentGroupWillMove && currentGroup) {
      targetGroup = this.photoGroupRepository.update(currentGroup.id, sharedPatch) ?? currentGroup;
      targetHadMembersBeforeMove = currentGroupMembers.length > 0;
    } else if (currentGroup && currentGroupMembers.length === 1 && !this.findAutoJoinGroup(latitude, longitude)) {
      targetGroup = this.photoGroupRepository.update(currentGroup.id, {
        ...sharedPatch,
        ...(descriptionChanged
          ? {}
          : {
              description: "",
              descriptionSource: "none"
            })
      }) ?? currentGroup;
      targetHadMembersBeforeMove = false;
    } else {
      const autoJoin = this.findAutoJoinGroup(latitude, longitude);
      targetHadMembersBeforeMove = Boolean(autoJoin && this.photoRepository.listByGroupId(autoJoin.id).length);
      targetGroup = this.getOrCreatePhotoGroup(
        latitude,
        longitude,
        autoJoin
          ? sharedPatch
          : {
              ...sharedPatch,
              description: descriptionChanged ? nextDescription : "",
              descriptionSource: descriptionChanged ? inferDescriptionSource(nextDescription) : "none"
            }
      );
    }

    const updated = this.photoRepository.update(id, {
      title: input.title ?? current.title,
      capturedAt,
      visibilityStatus: input.visibilityStatus ?? current.visibilityStatus,
      latitude,
      longitude,
      hasGeo: true,
      photoGroupId: targetGroup.id,
      locationLabel: targetGroup.locationLabel,
      narrativePrompt: targetGroup.narrativePrompt,
      description: targetGroup.description,
      descriptionSource: targetGroup.descriptionSource,
      ...geoSummaryFields
    });
    if (!updated) {
      return null;
    }

    if (current.photoGroupId && current.photoGroupId !== targetGroup.id) {
      this.ensureValidGroupCover(current.photoGroupId);
    }

    let syncedPhotos = this.syncGroupFieldsToPhotos(targetGroup);

    if (descriptionChanged) {
      syncedPhotos = this.setManualDescriptionForGroup(targetGroup.id, nextDescription);
    } else if (coordinatesChanged) {
      if (targetHadMembersBeforeMove && targetGroup.description.trim()) {
        syncedPhotos = this.syncGroupFieldsToPhotos(targetGroup);
      } else {
        syncedPhotos = await this.syncSharedDescriptionForGroup(targetGroup.id);
      }
    } else if (capturedAtChanged) {
      syncedPhotos = await this.syncSharedDescriptionForGroup(targetGroup.id, { forceRegenerate: true });
    } else if (locationLabelChanged || narrativePromptChanged) {
      syncedPhotos = this.syncGroupFieldsToPhotos(targetGroup);
    }

    return this.getAdminPhoto(id);
  }

  async regenerateLocationNarrativeForPhoto(id: string) {
    const current = this.photoRepository.getById(id);
    if (!current) {
      return null;
    }
    if (current.latitude === null || current.longitude === null) {
      throw new Error("Photo must have GPS coordinates before regenerating an AI intro");
    }
    const group = this.listGroupMembersByReference(current);
    if (!group.length) {
      throw new Error("No photos found for this photo group");
    }
    const groupId = group[0].photoGroupId;
    if (!groupId) {
      throw new Error("Photo group is missing");
    }
    const synced = await this.syncSharedDescriptionForGroupDetailed(groupId, { forceRegenerate: true });

    return {
      photo: this.getAdminPhoto(id),
      updatedCount: synced.photos.length
    };
  }

  batchVisibility(ids: string[], visibilityStatus: VisibilityStatus) {
    return this.photoRepository.batchUpdate(ids, { visibilityStatus });
  }

  batchDelete(ids: string[]) {
    const affectedGroupIds = new Set(
      ids
        .map((id) => this.photoRepository.getById(id)?.photoGroupId ?? null)
        .filter((groupId): groupId is string => Boolean(groupId))
    );
    const updated = this.photoRepository.batchUpdate(ids, { deletedAt: new Date().toISOString() });
    for (const groupId of affectedGroupIds) {
      this.ensureValidGroupCover(groupId);
    }
    return updated;
  }

  batchRestore(ids: string[]) {
    return this.photoRepository.batchUpdate(ids, { deletedAt: null });
  }

  async batchPurge(ids: string[]) {
    const items: Array<{ id: string; status: "purged" | "failed" | "skipped"; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const affectedGroupIds = new Set<string>();

    for (const id of ids) {
      const photo = this.photoRepository.getById(id);
      if (!photo || !photo.deletedAt) {
        items.push({ id, status: "skipped", error: photo ? "Photo is not deleted" : "Photo not found" });
        skippedCount += 1;
        continue;
      }

      try {
        if (photo.photoGroupId) {
          affectedGroupIds.add(photo.photoGroupId);
        }
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

    for (const groupId of affectedGroupIds) {
      this.ensureValidGroupCover(groupId);
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
    const normalizedPrompt = (narrativePrompt ?? "").trim();
    const geoSummaryFields = await this.resolveGeoSummaryForCoordinates(latitude, longitude);
    const photos = this.photoRepository.listByIds(ids);
    const oldGroupIds = new Set(
      photos.map((photo) => photo.photoGroupId).filter((groupId): groupId is string => Boolean(groupId))
    );
    const group = this.getOrCreatePhotoGroup(latitude, longitude, {
      locationLabel,
      narrativePrompt: normalizedPrompt,
      description: "",
      descriptionSource: "none",
      geoCountryEn: geoSummaryFields.geoCountryEn,
      geoRegionEn: geoSummaryFields.geoRegionEn,
      geoLocalityEn: geoSummaryFields.geoLocalityEn,
      geoSummaryEn: geoSummaryFields.geoSummaryEn,
      geoResolvedAt: geoSummaryFields.geoResolvedAt
    });

    await this.assignPhotosToGroup(ids, group);
    for (const oldGroupId of oldGroupIds) {
      if (oldGroupId !== group.id) {
        this.ensureValidGroupCover(oldGroupId);
      }
    }
    const synced = await this.syncSharedDescriptionForGroupDetailed(group.id);
    return {
      items: this.enrichPhotosWithGroupSummary(synced.photos.filter((photo) => ids.includes(photo.id))),
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
    const targetPhoto = this.photoRepository.listByIds(ids)[0]
      ?? this.photoRepository.list().find((photo) => photo.latitude === latitude && photo.longitude === longitude)
      ?? null;
    if (!targetPhoto?.photoGroupId) {
      return { items: [], narrative: null };
    }
    this.photoGroupRepository.update(targetPhoto.photoGroupId, {
      ...(normalizedPrompt ? { narrativePrompt: normalizedPrompt } : {}),
      ...(locationLabel ? { locationLabel } : {})
    });
    const synced = await this.syncSharedDescriptionForGroupDetailed(targetPhoto.photoGroupId, { forceRegenerate: true });
    return {
      items: this.enrichPhotosWithGroupSummary(synced.photos.filter((photo) => ids.includes(photo.id))),
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
    const targetPhoto = this.photoRepository.listByIds(ids)[0]
      ?? this.photoRepository.list().find((photo) => photo.latitude === latitude && photo.longitude === longitude)
      ?? null;
    if (!targetPhoto?.photoGroupId) {
      return { items: [], narrative: null };
    }
    this.photoGroupRepository.update(targetPhoto.photoGroupId, {
      ...(normalizedPrompt ? { narrativePrompt: normalizedPrompt } : {}),
      ...(locationLabel ? { locationLabel } : {})
    });
    const normalizedDescription = normalizeDescription(description);
    const synced = this.setManualDescriptionForGroup(targetPhoto.photoGroupId, normalizedDescription);
    return {
      items: this.enrichPhotosWithGroupSummary(synced.filter((photo) => ids.includes(photo.id))),
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

  async updatePhotoGroup(id: string, input: UpdatePhotoGroupInput) {
    const group = this.photoGroupRepository.getById(id);
    if (!group) {
      return null;
    }

    const latitude = input.latitude ?? group.latitude;
    const longitude = input.longitude ?? group.longitude;
    const geoSummaryFields =
      latitude !== group.latitude || longitude !== group.longitude
        ? await this.resolveGeoSummaryForCoordinates(latitude, longitude)
        : {
            geoCountryEn: group.geoCountryEn,
            geoRegionEn: group.geoRegionEn,
            geoLocalityEn: group.geoLocalityEn,
            geoSummaryEn: group.geoSummaryEn,
            geoResolvedAt: group.geoResolvedAt
          };
    const description = input.description === undefined ? group.description : normalizeDescription(input.description);
    const nextGroup = this.photoGroupRepository.update(id, {
      latitude,
      longitude,
      locationLabel: input.locationLabel ?? group.locationLabel,
      narrativePrompt: input.narrativePrompt ?? group.narrativePrompt,
      description,
      descriptionSource: input.description === undefined ? group.descriptionSource : inferDescriptionSource(description),
      ...geoSummaryFields
    });
    if (!nextGroup) {
      return null;
    }

    let syncedPhotos = this.syncGroupFieldsToPhotos(nextGroup);
    if (input.description === undefined && (latitude !== group.latitude || longitude !== group.longitude)) {
      syncedPhotos = await this.syncSharedDescriptionForGroup(id);
    }
      const detail = this.getAdminPhotoGroup(id);
      return detail
        ? {
            group: detail,
            items: this.enrichPhotosWithGroupSummary(syncedPhotos)
          }
        : null;
  }

  setPhotoGroupCover(id: string, photoId: string) {
    const group = this.photoGroupRepository.getById(id);
    if (!group) {
      return null;
    }
    const members = this.photoRepository.listByGroupId(id);
    if (!members.some((photo) => photo.id === photoId)) {
      throw new Error("Cover photo must belong to this group");
    }
    this.photoGroupRepository.update(id, { coverPhotoId: photoId });
    return this.getAdminPhotoGroup(id);
  }

  async regeneratePhotoGroupDescription(id: string) {
    const synced = await this.syncSharedDescriptionForGroupDetailed(id, { forceRegenerate: true });
    if (!synced.group) {
      return null;
    }
    return {
      group: this.getAdminPhotoGroup(id),
      items: this.enrichPhotosWithGroupSummary(synced.photos)
    };
  }

  mergePhotoGroups(sourceGroupIds: string[], targetGroupId: string) {
    const targetGroup = this.photoGroupRepository.getById(targetGroupId);
    if (!targetGroup) {
      return null;
    }
    const moveGroupIds = sourceGroupIds.filter((groupId) => groupId !== targetGroupId);
    for (const sourceGroupId of moveGroupIds) {
      const members = this.photoRepository.listByGroupId(sourceGroupId);
      this.photoRepository.batchUpdate(
        members.map((photo) => photo.id),
        { photoGroupId: targetGroupId }
      );
      this.photoGroupRepository.deleteById(sourceGroupId);
    }
    const synced = this.syncGroupFieldsToPhotos(targetGroup);
    this.ensureValidGroupCover(targetGroupId);
    return {
      group: this.getAdminPhotoGroup(targetGroupId),
      items: this.enrichPhotosWithGroupSummary(synced)
    };
  }

  removePhotosFromGroup(id: string, photoIds: string[], mode: "new_group" | "ungrouped") {
    const group = this.photoGroupRepository.getById(id);
    if (!group) {
      return null;
    }
    const members = this.photoRepository.listByGroupId(id);
    const selectedMembers = members.filter((photo) => photoIds.includes(photo.id));
    if (!selectedMembers.length) {
      return {
        group: this.getAdminPhotoGroup(id),
        items: []
      };
    }

    let nextGroupId: string | null = null;
    if (mode === "new_group") {
      const newGroup = this.photoGroupRepository.create(
        this.buildPhotoGroupRecord(selectedMembers, {
          latitude: group.latitude,
          longitude: group.longitude,
          locationLabel: group.locationLabel,
          narrativePrompt: group.narrativePrompt,
          description: group.description,
          descriptionSource: group.descriptionSource,
          geoCountryEn: group.geoCountryEn,
          geoRegionEn: group.geoRegionEn,
          geoLocalityEn: group.geoLocalityEn,
          geoSummaryEn: group.geoSummaryEn,
          geoResolvedAt: group.geoResolvedAt,
          coverPhotoId: sortByGroupDisplayOrder(selectedMembers)[0]?.id ?? null
        })
      )!;
      nextGroupId = newGroup.id;
    }

    const items = this.photoRepository.batchUpdate(
      selectedMembers.map((photo) => photo.id),
      {
        photoGroupId: nextGroupId,
        description: group.description,
        descriptionSource: group.descriptionSource,
        locationLabel: group.locationLabel,
        narrativePrompt: group.narrativePrompt
      }
    );
    this.ensureValidGroupCover(id);
    if (nextGroupId) {
      this.ensureValidGroupCover(nextGroupId);
    }
    return {
      group: this.getAdminPhotoGroup(id),
      items: this.enrichPhotosWithGroupSummary(items)
    };
  }

  addPhotosToGroup(id: string, photoIds: string[]) {
    const group = this.photoGroupRepository.getById(id);
    if (!group) {
      return null;
    }
    const photos = this.photoRepository.listByIds(photoIds);
    for (const photo of photos) {
      if (photo.latitude !== group.latitude || photo.longitude !== group.longitude) {
        throw new Error("Photos must match the target group's coordinates");
      }
    }
    const oldGroupIds = new Set(
      photos.map((photo) => photo.photoGroupId).filter((groupId): groupId is string => Boolean(groupId) && groupId !== id)
    );
    this.photoRepository.batchUpdate(
      photos.map((photo) => photo.id),
      { photoGroupId: id }
    );
    const groupSynced = this.syncGroupFieldsToPhotos(group);
    for (const oldGroupId of oldGroupIds) {
      this.ensureValidGroupCover(oldGroupId);
    }
    return {
      group: this.getAdminPhotoGroup(id),
      items: this.enrichPhotosWithGroupSummary(groupSynced.filter((photo) => photoIds.includes(photo.id)))
    };
  }

  setPhotoGroupVisibility(id: string, visibilityStatus: VisibilityStatus) {
    const group = this.photoGroupRepository.getById(id);
    if (!group) {
      return null;
    }
    const items = this.photoRepository.batchUpdate(
      this.photoRepository.listByGroupId(id).map((photo) => photo.id),
      { visibilityStatus }
    );
    return {
      group: this.getAdminPhotoGroup(id),
      items
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
        photoGroupId: null,
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
        const group = this.getOrCreatePhotoGroup(record.latitude, record.longitude, {
          geoCountryEn: geoSummaryFields.geoCountryEn,
          geoRegionEn: geoSummaryFields.geoRegionEn,
          geoLocalityEn: geoSummaryFields.geoLocalityEn,
          geoSummaryEn: geoSummaryFields.geoSummaryEn,
          geoResolvedAt: geoSummaryFields.geoResolvedAt
        });
        await this.assignPhotosToGroup([record.id], group);
        await this.syncSharedDescriptionForGroup(group.id);
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
      const key = explicitGroupKey(photo);
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
      if (firstPhoto.photoGroupId) {
        this.photoGroupRepository.update(firstPhoto.photoGroupId, geoSummaryFields);
      }
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
      const key = explicitGroupKey(photo);
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

      if (firstPhoto.photoGroupId) {
        const nextGroup = this.photoGroupRepository.update(firstPhoto.photoGroupId, {
          description: resolved.description,
          descriptionSource: resolved.descriptionSource
        });
        if (nextGroup) {
          this.syncGroupFieldsToPhotos(nextGroup, group);
        }
      } else {
        this.photoRepository.batchUpdate(
          group.map((photo) => photo.id),
          {
            description: resolved.description,
            descriptionSource: resolved.descriptionSource
          }
        );
      }
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
