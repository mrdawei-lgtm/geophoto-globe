export type PhotoListItem = {
  id: string;
  thumbnailUrl: string;
  title: string;
  photoGroupId: string | null;
  groupPhotoCount: number;
  photoGroupCoverThumbnailUrl: string | null;
  isGroupCover: boolean;
  narrativePrompt: string;
  description: string;
  descriptionSource: "none" | "auto" | "manual";
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  hasGeo: boolean;
  locationLabel: string;
  geoCountryEn: string;
  geoRegionEn: string;
  geoLocalityEn: string;
  geoSummaryEn: string;
  visibilityStatus: "visible" | "hidden";
  deletedAt: string | null;
};

export type PhotoGroupItem = {
  id: string;
  latitude: number;
  longitude: number;
  locationLabel: string;
  narrativePrompt: string;
  description: string;
  descriptionSource: "none" | "auto" | "manual";
  geoCountryEn: string;
  geoRegionEn: string;
  geoLocalityEn: string;
  geoSummaryEn: string;
  geoResolvedAt: string | null;
  coverPhotoId: string | null;
  createdAt: string;
  updatedAt: string;
  photoCount: number;
  visibleCount: number;
  hiddenCount: number;
  deletedCount: number;
  issues: string[];
  coverThumbnailUrl: string | null;
};

export type PhotoGroupMember = {
  id: string;
  title: string;
  thumbnailUrl: string;
  capturedAt: string | null;
  visibilityStatus: "visible" | "hidden";
  deletedAt: string | null;
  isCover: boolean;
};

export type PhotoGroupDetail = PhotoGroupItem & {
  members: PhotoGroupMember[];
};

export type SharedNarrativePreview = {
  latitude: number;
  longitude: number;
  locationLabel: string;
  narrativePrompt: string;
  description: string;
  descriptionSource: "none" | "auto" | "manual";
  photoCount: number;
  wasTruncated: boolean;
  finishReason: string | null;
  error: string | null;
};

export type PublicPhotoItem = {
  id: string;
  imageUrl: string;
  title: string;
  description: string;
  capturedAt: string | null;
  locationLabel: string;
  latitude: number | null;
  longitude: number | null;
};

export type ImportJobStatus = "pending" | "running" | "completed" | "partial" | "failed";
export type ImportJobItemStatus = "queued" | "uploading" | "processing" | "success" | "failed";

export type ImportJobItem = {
  id: string;
  jobId: string;
  originalFilename: string;
  status: ImportJobItemStatus;
  photoId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ImportJob = {
  id: string;
  status: ImportJobStatus;
  totalCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  summaryMessage: string;
  items: ImportJobItem[];
};

async function request<T>(url: string, init?: RequestInit, auth = false): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && !(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = localStorage.getItem("adminToken");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error || "Request failed");
  }
  return response.json() as Promise<T>;
}

export const api = {
  login(password: string) {
    return request<{ token: string }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password })
    });
  },
  listAdminPhotos(query = "") {
    return request<{ items: PhotoListItem[] }>(`/api/admin/photos${query}`, undefined, true);
  },
  getAdminPhoto(id: string) {
    return request<PhotoListItem & {
      originalAssetPath: string;
      managedAssetPath: string;
      displayImageUrl: string;
      group: PhotoGroupDetail | null;
    }>(
      `/api/admin/photos/${id}`,
      undefined,
      true
    );
  },
  updatePhoto(id: string, payload: Record<string, unknown>) {
    return request<PhotoListItem & {
      originalAssetPath: string;
      managedAssetPath: string;
      displayImageUrl: string;
      group: PhotoGroupDetail | null;
    }>(
      `/api/admin/photos/${id}`,
      { method: "PATCH", body: JSON.stringify(payload) },
      true
    );
  },
  regenerateLocationNarrative(id: string) {
    return request<{
      photo: PhotoListItem & {
        originalAssetPath: string;
        managedAssetPath: string;
        displayImageUrl: string;
        group: PhotoGroupDetail | null;
      };
      updatedCount: number;
    }>(`/api/admin/photos/${id}/regenerate-description`, { method: "POST" }, true);
  },
  listAdminPhotoGroups(query = "") {
    return request<{ items: PhotoGroupItem[] }>(`/api/admin/photo-groups${query}`, undefined, true);
  },
  getAdminPhotoGroup(id: string) {
    return request<PhotoGroupDetail>(`/api/admin/photo-groups/${id}`, undefined, true);
  },
  updatePhotoGroup(id: string, payload: Record<string, unknown>) {
    return request<{ group: PhotoGroupDetail; items: PhotoListItem[] }>(
      `/api/admin/photo-groups/${id}`,
      { method: "PATCH", body: JSON.stringify(payload) },
      true
    );
  },
  setPhotoGroupCover(id: string, photoId: string) {
    return request<PhotoGroupDetail>(
      `/api/admin/photo-groups/${id}/set-cover`,
      { method: "POST", body: JSON.stringify({ photoId }) },
      true
    );
  },
  regeneratePhotoGroupDescription(id: string) {
    return request<{ group: PhotoGroupDetail | null; items: PhotoListItem[] }>(
      `/api/admin/photo-groups/${id}/regenerate-description`,
      { method: "POST" },
      true
    );
  },
  mergePhotoGroups(sourceGroupIds: string[], targetGroupId: string) {
    return request<{ group: PhotoGroupDetail | null; items: PhotoListItem[] }>(
      "/api/admin/photo-groups/merge",
      { method: "POST", body: JSON.stringify({ sourceGroupIds, targetGroupId }) },
      true
    );
  },
  removePhotosFromGroup(id: string, photoIds: string[], mode: "new_group" | "ungrouped") {
    return request<{ group: PhotoGroupDetail | null; items: PhotoListItem[] }>(
      `/api/admin/photo-groups/${id}/remove-photos`,
      { method: "POST", body: JSON.stringify({ photoIds, mode }) },
      true
    );
  },
  addPhotosToGroup(id: string, photoIds: string[]) {
    return request<{ group: PhotoGroupDetail | null; items: PhotoListItem[] }>(
      `/api/admin/photo-groups/${id}/add-photos`,
      { method: "POST", body: JSON.stringify({ photoIds }) },
      true
    );
  },
  setPhotoGroupVisibility(id: string, visibilityStatus: "visible" | "hidden") {
    return request<{ group: PhotoGroupDetail | null; items: PhotoListItem[] }>(
      `/api/admin/photo-groups/${id}/visibility`,
      { method: "POST", body: JSON.stringify({ visibilityStatus }) },
      true
    );
  },
  createImportJob(filenames: string[]) {
    return request<ImportJob>(
      "/api/admin/import-jobs",
      { method: "POST", body: JSON.stringify({ filenames }) },
      true
    );
  },
  getImportJobs() {
    return request<{ items: ImportJob[] }>("/api/admin/import-jobs", undefined, true);
  },
  getImportJob(id: string) {
    return request<ImportJob>(`/api/admin/import-jobs/${id}`, undefined, true);
  },
  uploadImportJobFile(
    jobId: string,
    itemId: string,
    file: File,
    options?: {
      onUploadProgress?: (progress: number) => void;
      onUploadComplete?: () => void;
    }
  ) {
    return new Promise<{
      item: ImportJobItem;
      job: ImportJob;
      result: { id?: string; hasGeo?: boolean; filename: string; status: "success" | "failed"; error?: string };
    }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/admin/import-jobs/${jobId}/files`);
      const token = localStorage.getItem("adminToken");
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }
        options?.onUploadProgress?.(event.loaded / event.total);
        if (event.loaded >= event.total) {
          options?.onUploadComplete?.();
        }
      };

      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.onload = () => {
        const payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(payload?.error || "Upload failed"));
          return;
        }
        resolve(payload);
      };

      const formData = new FormData();
      formData.append("itemId", itemId);
      formData.append("photo", file);
      xhr.send(formData);
    });
  },
  importPhotos(formData: FormData) {
    return request("/api/admin/photos/import", { method: "POST", body: formData }, true);
  },
  batchVisibility(ids: string[], visibilityStatus: "visible" | "hidden") {
    return request(
      "/api/admin/photos/batch/visibility",
      { method: "POST", body: JSON.stringify({ ids, visibilityStatus }) },
      true
    );
  },
  batchDelete(ids: string[]) {
    return request("/api/admin/photos/batch/delete", { method: "POST", body: JSON.stringify({ ids }) }, true);
  },
  batchRestore(ids: string[]) {
    return request("/api/admin/photos/batch/restore", { method: "POST", body: JSON.stringify({ ids }) }, true);
  },
  batchPurge(ids: string[]) {
    return request<{
      items: Array<{ id: string; status: "purged" | "failed" | "skipped"; error?: string }>;
      successCount: number;
      failedCount: number;
      skippedCount: number;
    }>("/api/admin/photos/batch/purge", { method: "POST", body: JSON.stringify({ ids }) }, true);
  },
  batchPurgeDeleted() {
    return request<{
      items: Array<{ id: string; status: "purged" | "failed" | "skipped"; error?: string }>;
      successCount: number;
      failedCount: number;
      skippedCount: number;
    }>("/api/admin/photos/batch/purge-deleted", { method: "POST" }, true);
  },
  batchGps(ids: string[], latitude: number, longitude: number, locationLabel: string, narrativePrompt: string) {
    return request<{ items: PhotoListItem[]; narrative: SharedNarrativePreview | null }>(
      "/api/admin/photos/batch/gps",
      { method: "POST", body: JSON.stringify({ ids, latitude, longitude, locationLabel, narrativePrompt }) },
      true
    );
  },
  regenerateBatchGpsNarrative(ids: string[], latitude: number, longitude: number, locationLabel: string, narrativePrompt: string) {
    return request<{ items: PhotoListItem[]; narrative: SharedNarrativePreview | null }>(
      "/api/admin/photos/batch/gps/regenerate",
      { method: "POST", body: JSON.stringify({ ids, latitude, longitude, locationLabel, narrativePrompt }) },
      true
    );
  },
  saveBatchGpsNarrative(
    ids: string[],
    latitude: number,
    longitude: number,
    locationLabel: string,
    description: string,
    narrativePrompt: string
  ) {
    return request<{ items: PhotoListItem[]; narrative: SharedNarrativePreview | null }>(
      "/api/admin/photos/batch/gps/description",
      { method: "POST", body: JSON.stringify({ ids, latitude, longitude, locationLabel, description, narrativePrompt }) },
      true
    );
  },
  geocode(query: string) {
    return request<{ results: Array<{ displayName: string; latitude: number; longitude: number }> }>(
      `/api/admin/geocode/search?q=${encodeURIComponent(query)}`,
      undefined,
      true
    );
  },
  publicPhotos(mode: "cluster" | "items", deviceTier: string) {
    return request<{ mode: string; items: Array<Record<string, unknown>> }>(
      `/api/photos?mode=${mode}&deviceTier=${deviceTier}`
    );
  },
  publicPhoto(id: string) {
    return request<
      PublicPhotoItem & {
        geoPrimaryLabel: string;
        groupItems: PublicPhotoItem[];
        groupIndex: number;
        groupCount: number;
      }
    >(`/api/photos/${id}`);
  }
};
