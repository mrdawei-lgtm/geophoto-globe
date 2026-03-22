export type VisibilityStatus = "visible" | "hidden";

export type PhotoRecord = {
  id: string;
  originalAssetPath: string;
  managedAssetPath: string;
  thumbnailUrl: string;
  displayImageUrl: string;
  title: string;
  description: string;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  hasGeo: boolean;
  locationLabel: string;
  visibilityStatus: VisibilityStatus;
  deletedAt: string | null;
  importedAt: string;
  updatedAt: string;
};

export type PhotoListFilters = {
  visibilityStatus?: VisibilityStatus;
  hasGeo?: boolean;
  deleted?: boolean;
  q?: string;
};

export type ImportJobStatus = "pending" | "running" | "completed" | "failed" | "partial";
export type ImportJobItemStatus = "queued" | "uploading" | "processing" | "success" | "failed";

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
};

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

export type ImportJobWithItems = ImportJob & {
  items: ImportJobItem[];
};
