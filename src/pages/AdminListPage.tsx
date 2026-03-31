import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  ImportJob,
  PhotoGroupDetail,
  PhotoGroupItem,
  PhotoListItem,
  SharedNarrativePreview
} from "../lib/api";
import { formatCoordinatePair, parseCoordinatePair } from "../lib/coordinates";
import { readPublicDebugPanelVisible, writePublicDebugPanelVisible } from "../lib/preferences";

type AdminView = "photos" | "groups";
type GeoFilter = "all" | "missing" | "attached";
type LocationLabelFilter = "all" | "missing" | "present";
type VisibilityFilter = "all" | "hidden" | "visible";
type DeletedFilter = "all" | "deleted" | "active";
type GpsMode = "coordinates" | "address";
type GpsProgressStage = "idle" | "resolving" | "saving" | "generating" | "complete";
type UploadItemStatus = "queued" | "uploading" | "processing" | "success" | "failed";
type GroupDescriptionFilter = "all" | "missing" | "auto" | "manual";
type GroupBooleanFilter = "all" | "yes" | "no";
type GroupIssueFilter =
  | "all"
  | "missing_location_label"
  | "missing_description"
  | "mixed_visibility"
  | "mixed_location_label"
  | "orphaned_cover";
type WorkQueue =
  | "missing_gps"
  | "missing_place"
  | "missing_description"
  | "review_auto"
  | "issues"
  | "hidden"
  | "deleted";

type UploadQueueItem = {
  localId: string;
  file: File;
  filename: string;
  status: UploadItemStatus;
  progress: number;
  error: string;
  jobItemId: string | null;
  photoId: string | null;
};

type GroupDraft = {
  locationLabel: string;
  narrativePrompt: string;
  description: string;
  coordinateInput: string;
};

function createUploadQueueItem(file: File): UploadQueueItem {
  return {
    localId: crypto.randomUUID(),
    file,
    filename: file.name,
    status: "queued",
    progress: 0,
    error: "",
    jobItemId: null,
    photoId: null
  };
}

function booleanFilterToQueryValue(value: GroupBooleanFilter) {
  if (value === "yes") {
    return "true";
  }
  if (value === "no") {
    return "false";
  }
  return null;
}

function buildGroupDraft(group: PhotoGroupDetail): GroupDraft {
  return {
    locationLabel: group.locationLabel,
    narrativePrompt: group.narrativePrompt,
    description: group.description,
    coordinateInput: formatCoordinatePair(group.latitude, group.longitude)
  };
}

function issueLabel(issue: string) {
  if (issue === "missing_location_label") {
    return "Missing place";
  }
  if (issue === "missing_description") {
    return "Missing intro";
  }
  if (issue === "mixed_visibility") {
    return "Mixed visibility";
  }
  if (issue === "mixed_location_label") {
    return "Mixed labels";
  }
  if (issue === "orphaned_cover") {
    return "Cover reset";
  }
  return issue;
}

export function AdminListPage() {
  const [view, setView] = useState<AdminView>("photos");
  const [items, setItems] = useState<PhotoListItem[]>([]);
  const [groups, setGroups] = useState<PhotoGroupItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [geoFilter, setGeoFilter] = useState<GeoFilter>("all");
  const [locationLabelFilter, setLocationLabelFilter] = useState<LocationLabelFilter>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const [deletedFilter, setDeletedFilter] = useState<DeletedFilter>("all");
  const [groupQuery, setGroupQuery] = useState("");
  const [groupVisibilityFilter, setGroupVisibilityFilter] = useState<VisibilityFilter>("all");
  const [groupDescriptionFilter, setGroupDescriptionFilter] = useState<GroupDescriptionFilter>("all");
  const [groupHasPromptFilter, setGroupHasPromptFilter] = useState<GroupBooleanFilter>("all");
  const [groupHasDeletedFilter, setGroupHasDeletedFilter] = useState<GroupBooleanFilter>("all");
  const [groupHasHiddenFilter, setGroupHasHiddenFilter] = useState<GroupBooleanFilter>("all");
  const [groupIssueFilter, setGroupIssueFilter] = useState<GroupIssueFilter>("all");
  const [groupIssuesOnly, setGroupIssuesOnly] = useState(false);
  const [activeQueue, setActiveQueue] = useState<WorkQueue | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<PhotoGroupDetail | null>(null);
  const [activeGroupDraft, setActiveGroupDraft] = useState<GroupDraft | null>(null);
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [gpsDialogOpen, setGpsDialogOpen] = useState(false);
  const [gpsMode, setGpsMode] = useState<GpsMode>("coordinates");
  const [coordinateInput, setCoordinateInput] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [locationLabelInput, setLocationLabelInput] = useState("");
  const [narrativePromptInput, setNarrativePromptInput] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsProgressStage, setGpsProgressStage] = useState<GpsProgressStage>("idle");
  const [gpsProgressPercent, setGpsProgressPercent] = useState(0);
  const [gpsResult, setGpsResult] = useState<SharedNarrativePreview | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadQueueItem[]>([]);
  const [uploadJob, setUploadJob] = useState<ImportJob | null>(null);
  const [uploadRunning, setUploadRunning] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDialogMinimized, setUploadDialogMinimized] = useState(false);
  const [publicDebugPanelVisible, setPublicDebugPanelVisible] = useState(() => readPublicDebugPanelVisible());
  const gpsProgressTimerRef = useRef<number | null>(null);

  function buildPhotoQueryString(overrides?: Partial<{
    query: string;
    geoFilter: GeoFilter;
    locationLabelFilter: LocationLabelFilter;
    visibilityFilter: VisibilityFilter;
    deletedFilter: DeletedFilter;
  }>) {
    const next = {
      query,
      geoFilter,
      locationLabelFilter,
      visibilityFilter,
      deletedFilter,
      ...overrides
    };
    const params = new URLSearchParams();
    if (next.query.trim()) {
      params.set("q", next.query.trim());
    }
    if (next.geoFilter === "missing") {
      params.set("hasGeo", "false");
    }
    if (next.geoFilter === "attached") {
      params.set("hasGeo", "true");
    }
    if (next.locationLabelFilter === "present") {
      params.set("hasLocationLabel", "true");
    }
    if (next.locationLabelFilter === "missing") {
      params.set("hasLocationLabel", "false");
    }
    if (next.visibilityFilter !== "all") {
      params.set("visibilityStatus", next.visibilityFilter);
    }
    if (next.deletedFilter === "deleted") {
      params.set("deleted", "true");
    }
    if (next.deletedFilter === "active") {
      params.set("deleted", "false");
    }
    return params.size ? `?${params.toString()}` : "";
  }

  function buildGroupQueryString(overrides?: Partial<{
    query: string;
    visibilityFilter: VisibilityFilter;
    descriptionFilter: GroupDescriptionFilter;
    hasPromptFilter: GroupBooleanFilter;
    hasDeletedFilter: GroupBooleanFilter;
    hasHiddenFilter: GroupBooleanFilter;
    issueFilter: GroupIssueFilter;
  }>) {
    const next = {
      query: groupQuery,
      visibilityFilter: groupVisibilityFilter,
      descriptionFilter: groupDescriptionFilter,
      hasPromptFilter: groupHasPromptFilter,
      hasDeletedFilter: groupHasDeletedFilter,
      hasHiddenFilter: groupHasHiddenFilter,
      issueFilter: groupIssueFilter,
      ...overrides
    };
    const params = new URLSearchParams();
    if (next.query.trim()) {
      params.set("q", next.query.trim());
    }
    if (next.visibilityFilter !== "all") {
      params.set("visibilityStatus", next.visibilityFilter);
    }
    if (next.descriptionFilter !== "all") {
      params.set("descriptionStatus", next.descriptionFilter);
    }
    const hasPromptValue = booleanFilterToQueryValue(next.hasPromptFilter);
    if (hasPromptValue) {
      params.set("hasPrompt", hasPromptValue);
    }
    const hasDeletedValue = booleanFilterToQueryValue(next.hasDeletedFilter);
    if (hasDeletedValue) {
      params.set("hasDeleted", hasDeletedValue);
    }
    const hasHiddenValue = booleanFilterToQueryValue(next.hasHiddenFilter);
    if (hasHiddenValue) {
      params.set("hasHidden", hasHiddenValue);
    }
    if (next.issueFilter !== "all") {
      params.set("issueType", next.issueFilter);
    }
    return params.size ? `?${params.toString()}` : "";
  }

  async function loadPhotos(queryString = buildPhotoQueryString()) {
    const data = await api.listAdminPhotos(queryString);
    setItems(data.items);
    setSelected((current) => current.filter((id) => data.items.some((item) => item.id === id)));
  }

  async function loadGroups(queryString = buildGroupQueryString()) {
    const data = await api.listAdminPhotoGroups(queryString);
    setGroups(data.items);
    setSelectedGroups((current) => current.filter((id) => data.items.some((item) => item.id === id)));
  }

  async function reloadAll() {
    await Promise.all([loadPhotos(), loadGroups()]);
  }

  useEffect(() => {
    void reloadAll().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    });
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedGroupSet = useMemo(() => new Set(selectedGroups), [selectedGroups]);
  const selectedGroupMemberSet = useMemo(() => new Set(selectedGroupMembers), [selectedGroupMembers]);

  const visibleGroups = useMemo(
    () => (groupIssuesOnly ? groups.filter((group) => group.issues.length > 0) : groups),
    [groupIssuesOnly, groups]
  );

  const uploadSummary = useMemo(() => {
    const total = uploadItems.length;
    const queued = uploadItems.filter((item) => item.status === "queued").length;
    const uploading = uploadItems.filter((item) => item.status === "uploading").length;
    const processing = uploadItems.filter((item) => item.status === "processing").length;
    const success = uploadItems.filter((item) => item.status === "success").length;
    const failed = uploadItems.filter((item) => item.status === "failed").length;
    return { total, queued, uploading, processing, success, failed };
  }, [uploadItems]);
  const queuedUploadCount = useMemo(
    () => uploadItems.filter((item) => item.status === "queued").length,
    [uploadItems]
  );
  const hasUploadSession = uploadItems.length > 0 || uploadJob !== null;
  const showUploadDock = hasUploadSession && (uploadDialogMinimized || (uploadRunning && !uploadDialogOpen));
  const uploadDockLabel = useMemo(() => {
    if (uploadRunning) {
      if (uploadSummary.uploading) {
        return `${uploadSummary.uploading} uploading`;
      }
      if (uploadSummary.processing) {
        return `${uploadSummary.processing} processing`;
      }
      return "Upload running";
    }
    if (uploadSummary.failed) {
      return `${uploadSummary.failed} failed`;
    }
    if (uploadSummary.success) {
      return `${uploadSummary.success} complete`;
    }
    if (uploadSummary.queued) {
      return `${uploadSummary.queued} queued`;
    }
    return "No uploads";
  }, [uploadRunning, uploadSummary]);

  function togglePublicDebugPanel() {
    setPublicDebugPanelVisible((current) => {
      const nextValue = !current;
      writePublicDebugPanelVisible(nextValue);
      return nextValue;
    });
  }

  function openUploadDialog() {
    setUploadDialogOpen(true);
    setUploadDialogMinimized(false);
  }

  function minimizeUploadDialog() {
    setUploadDialogOpen(false);
    setUploadDialogMinimized(true);
  }

  function closeUploadDialog() {
    setUploadDialogOpen(false);
    setUploadDialogMinimized(uploadRunning);
  }

  function togglePhotoSelection(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleGroupSelection(id: string) {
    setSelectedGroups((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleGroupMemberSelection(id: string) {
    setSelectedGroupMembers((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function selectAllVisiblePhotos() {
    setSelected(items.map((item) => item.id));
  }

  function selectAllVisibleGroups() {
    setSelectedGroups(visibleGroups.map((group) => group.id));
  }

  function clearPhotoSelection() {
    setSelected([]);
  }

  function clearGroupSelection() {
    setSelectedGroups([]);
  }

  async function runPhotoSearch() {
    try {
      setError("");
      await loadPhotos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photos");
    }
  }

  async function runGroupSearch() {
    try {
      setError("");
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photo groups");
    }
  }

  async function openGroupDetail(groupId: string) {
    try {
      setGroupLoading(true);
      setError("");
      const group = await api.getAdminPhotoGroup(groupId);
      setActiveGroupId(groupId);
      setActiveGroup(group);
      setActiveGroupDraft(buildGroupDraft(group));
      setSelectedGroupMembers([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photo group");
    } finally {
      setGroupLoading(false);
    }
  }

  function closeGroupDetail() {
    setActiveGroupId(null);
    setActiveGroup(null);
    setActiveGroupDraft(null);
    setSelectedGroupMembers([]);
    setGroupSubmitting(false);
  }

  async function refreshActiveGroup(groupId = activeGroupId) {
    if (!groupId) {
      return;
    }
    const group = await api.getAdminPhotoGroup(groupId);
    setActiveGroup(group);
    setActiveGroupDraft(buildGroupDraft(group));
    setSelectedGroupMembers((current) => current.filter((id) => group.members.some((member) => member.id === id)));
  }

  async function doBatch(action: "visible" | "hidden" | "delete" | "restore" | "purge" | "gps") {
    if (!selected.length) {
      return;
    }
    try {
      setError("");
      if (action === "visible" || action === "hidden") {
        await api.batchVisibility(selected, action);
        setNotice(`${selected.length} photo(s) updated to ${action}.`);
      } else if (action === "delete") {
        await api.batchDelete(selected);
        setNotice(`${selected.length} photo(s) moved to deleted state.`);
      } else if (action === "restore") {
        await api.batchRestore(selected);
        setNotice(`${selected.length} photo(s) restored.`);
      } else if (action === "purge") {
        const confirmed = window.confirm(
          `Permanently delete ${selected.length} selected photo(s)? This will remove database records and all image files. This cannot be undone.`
        );
        if (!confirmed) {
          return;
        }
        const result = await api.batchPurge(selected);
        setNotice(
          `Purge finished: ${result.successCount} purged, ${result.failedCount} failed, ${result.skippedCount} skipped.`
        );
      } else {
        setGpsDialogOpen(true);
        return;
      }
      setSelected([]);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch update failed");
    }
  }

  async function purgeDeletedPhotos() {
    const confirmed = window.confirm(
      "Permanently delete every photo currently in deleted state? This will remove database records and image files. This cannot be undone."
    );
    if (!confirmed) {
      return;
    }
    try {
      setError("");
      const result = await api.batchPurgeDeleted();
      setSelected([]);
      setNotice(
        `Empty trash finished: ${result.successCount} purged, ${result.failedCount} failed, ${result.skippedCount} skipped.`
      );
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to empty deleted photos");
    }
  }

  function updateUploadItem(localId: string, patch: Partial<UploadQueueItem>) {
    setUploadItems((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }

  function onSelectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files?.length) {
      return;
    }
    const nextItems = Array.from(files).map(createUploadQueueItem);
    const shouldReplaceExisting = !uploadRunning && uploadItems.every((item) => item.status !== "queued");
    setUploadItems((current) => (shouldReplaceExisting ? nextItems : [...current, ...nextItems]));
    if (shouldReplaceExisting) {
      setUploadJob(null);
      setNotice("");
      setError("");
    }
    setUploadDialogOpen(true);
    setUploadDialogMinimized(false);
    event.target.value = "";
  }

  function removeUploadItem(localId: string) {
    if (uploadRunning) {
      return;
    }
    setUploadItems((current) => current.filter((item) => item.localId !== localId));
  }

  async function startUploadBatch() {
    if (uploadRunning || queuedUploadCount === 0) {
      return;
    }

    const pendingItems = uploadItems
      .filter((item) => item.status === "queued")
      .map((item) => ({
        localId: item.localId,
        file: item.file,
        filename: item.filename
      }));

    try {
      setUploadRunning(true);
      setError("");
      setNotice("");

      const job = await api.createImportJob(pendingItems.map((item) => item.filename));
      setUploadJob(job);
      setUploadItems((current) => {
        let queuedIndex = 0;
        return current.map((item) => {
          if (item.status !== "queued") {
            return item;
          }
          const jobItem = job.items[queuedIndex];
          queuedIndex += 1;
          return {
            ...item,
            status: "queued",
            progress: 0,
            error: "",
            photoId: null,
            jobItemId: jobItem?.id ?? null
          };
        });
      });

      let nextIndex = 0;
      const workerCount = Math.min(2, pendingItems.length);

      async function worker() {
        while (nextIndex < pendingItems.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          const currentItem = pendingItems[currentIndex];
          const jobItem = job.items[currentIndex];
          if (!jobItem) {
            updateUploadItem(currentItem.localId, {
              status: "failed",
              error: "Missing import job item"
            });
            continue;
          }

          updateUploadItem(currentItem.localId, {
            status: "uploading",
            progress: 0,
            error: "",
            jobItemId: jobItem.id
          });

          try {
            const response = await api.uploadImportJobFile(job.id, jobItem.id, currentItem.file, {
              onUploadProgress: (progress) => {
                updateUploadItem(currentItem.localId, {
                  status: progress >= 1 ? "processing" : "uploading",
                  progress
                });
              },
              onUploadComplete: () => {
                updateUploadItem(currentItem.localId, { status: "processing", progress: 1 });
              }
            });

            setUploadJob(response.job);
            updateUploadItem(currentItem.localId, {
              status: response.result.status === "success" ? "success" : "failed",
              progress: 1,
              error: response.result.error || response.item?.errorMessage || "",
              photoId: response.item?.photoId || null
            });
          } catch (err) {
            updateUploadItem(currentItem.localId, {
              status: "failed",
              error: err instanceof Error ? err.message : "Upload failed"
            });
            const refreshedJob = await api.getImportJob(job.id).catch(() => null);
            if (refreshedJob) {
              setUploadJob(refreshedJob);
            }
          }
        }
      }

      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      const finalJob = await api.getImportJob(job.id);
      setUploadJob(finalJob);
      setNotice(finalJob.summaryMessage || `Upload batch finished: ${finalJob.successCount} success, ${finalJob.failedCount} failed.`);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start upload batch");
    } finally {
      setUploadRunning(false);
    }
  }

  function closeGpsDialog() {
    if (gpsProgressTimerRef.current !== null) {
      window.clearInterval(gpsProgressTimerRef.current);
      gpsProgressTimerRef.current = null;
    }
    setGpsDialogOpen(false);
    setGpsMode("coordinates");
    setCoordinateInput("");
    setAddressInput("");
    setLocationLabelInput("");
    setNarrativePromptInput("");
    setGpsLoading(false);
    setGpsProgressStage("idle");
    setGpsProgressPercent(0);
    setGpsResult(null);
  }

  function beginGpsProgress(stage: GpsProgressStage, startPercent: number) {
    if (gpsProgressTimerRef.current !== null) {
      window.clearInterval(gpsProgressTimerRef.current);
    }
    setGpsProgressStage(stage);
    setGpsProgressPercent(startPercent);
    gpsProgressTimerRef.current = window.setInterval(() => {
      setGpsProgressPercent((current) => Math.min(current + Math.max(1, (92 - current) / 8), 92));
    }, 420);
  }

  function advanceGpsProgress(stage: GpsProgressStage, nextPercent: number) {
    setGpsProgressStage(stage);
    setGpsProgressPercent((current) => Math.max(current, nextPercent));
  }

  function finishGpsProgress() {
    if (gpsProgressTimerRef.current !== null) {
      window.clearInterval(gpsProgressTimerRef.current);
      gpsProgressTimerRef.current = null;
    }
    setGpsProgressStage("complete");
    setGpsProgressPercent(100);
  }

  async function submitGpsBatch() {
    if (!selected.length) {
      closeGpsDialog();
      return;
    }
    try {
      setError("");
      setGpsLoading(true);
      setGpsResult(null);
      let latitude = 0;
      let longitude = 0;
      let locationLabel = locationLabelInput.trim();
      if (gpsMode === "coordinates") {
        beginGpsProgress("saving", 18);
        const parsed = parseCoordinatePair(coordinateInput);
        if (!parsed) {
          throw new Error("Coordinates must be two valid numbers in 'latitude, longitude' format");
        }
        latitude = parsed.latitude;
        longitude = parsed.longitude;
      } else {
        beginGpsProgress("resolving", 12);
        const searchQuery = addressInput.trim();
        if (!searchQuery) {
          throw new Error("Address is required");
        }
        const geocoded = await api.geocode(searchQuery);
        const first = geocoded.results[0];
        if (!first) {
          throw new Error("No coordinates found for that address");
        }
        latitude = first.latitude;
        longitude = first.longitude;
        setCoordinateInput(formatCoordinatePair(first.latitude, first.longitude));
        if (!locationLabel) {
          locationLabel = first.displayName;
        }
        advanceGpsProgress("saving", 40);
      }
      advanceGpsProgress("generating", 68);
      const result = await api.batchGps(selected, latitude, longitude, locationLabel, narrativePromptInput.trim());
      finishGpsProgress();
      setGpsResult(result.narrative);
      setLocationLabelInput(result.narrative?.locationLabel ?? locationLabel);
      setNarrativePromptInput(result.narrative?.narrativePrompt ?? narrativePromptInput.trim());
      setNotice(`GPS updated for ${selected.length} photo(s).`);
      await reloadAll();
      setGpsLoading(false);
    } catch (err) {
      if (gpsProgressTimerRef.current !== null) {
        window.clearInterval(gpsProgressTimerRef.current);
        gpsProgressTimerRef.current = null;
      }
      setGpsLoading(false);
      setGpsProgressStage("idle");
      setGpsProgressPercent(0);
      setError(err instanceof Error ? err.message : "Batch GPS update failed");
    }
  }

  async function rerunGpsNarrative() {
    if (!gpsResult || !selected.length) {
      return;
    }
    try {
      setError("");
      setGpsLoading(true);
      beginGpsProgress("generating", 56);
      const result = await api.regenerateBatchGpsNarrative(
        selected,
        gpsResult.latitude,
        gpsResult.longitude,
        locationLabelInput.trim() || gpsResult.locationLabel,
        narrativePromptInput.trim()
      );
      finishGpsProgress();
      setGpsResult(result.narrative);
      setLocationLabelInput(result.narrative?.locationLabel ?? (locationLabelInput.trim() || gpsResult.locationLabel));
      setNarrativePromptInput(result.narrative?.narrativePrompt ?? narrativePromptInput.trim());
      setNotice(`AI intro regenerated for ${result.narrative?.photoCount ?? selected.length} photo(s).`);
      await reloadAll();
      setGpsLoading(false);
    } catch (err) {
      if (gpsProgressTimerRef.current !== null) {
        window.clearInterval(gpsProgressTimerRef.current);
        gpsProgressTimerRef.current = null;
      }
      setGpsLoading(false);
      setGpsProgressStage("idle");
      setGpsProgressPercent(0);
      setError(err instanceof Error ? err.message : "AI intro regeneration failed");
    }
  }

  async function saveGpsNarrativeManually() {
    if (!gpsResult || !selected.length) {
      return;
    }
    try {
      setError("");
      setGpsLoading(true);
      beginGpsProgress("saving", 52);
      const result = await api.saveBatchGpsNarrative(
        selected,
        gpsResult.latitude,
        gpsResult.longitude,
        locationLabelInput.trim() || gpsResult.locationLabel,
        gpsResult.description,
        narrativePromptInput.trim()
      );
      finishGpsProgress();
      setGpsResult(result.narrative);
      setLocationLabelInput(result.narrative?.locationLabel ?? (locationLabelInput.trim() || gpsResult.locationLabel));
      setNarrativePromptInput(result.narrative?.narrativePrompt ?? narrativePromptInput.trim());
      setNotice(`Manual intro saved for ${result.narrative?.photoCount ?? selected.length} photo(s).`);
      await reloadAll();
      setGpsLoading(false);
    } catch (err) {
      if (gpsProgressTimerRef.current !== null) {
        window.clearInterval(gpsProgressTimerRef.current);
        gpsProgressTimerRef.current = null;
      }
      setGpsLoading(false);
      setGpsProgressStage("idle");
      setGpsProgressPercent(0);
      setError(err instanceof Error ? err.message : "Manual intro save failed");
    }
  }

  async function saveActiveGroup() {
    if (!activeGroup || !activeGroupDraft) {
      return;
    }
    try {
      setGroupSubmitting(true);
      setError("");
      const parsed = parseCoordinatePair(activeGroupDraft.coordinateInput);
      if (!parsed) {
        throw new Error("Group coordinates must be two valid numbers in 'latitude, longitude' format");
      }
      const result = await api.updatePhotoGroup(activeGroup.id, {
        locationLabel: activeGroupDraft.locationLabel,
        narrativePrompt: activeGroupDraft.narrativePrompt,
        description: activeGroupDraft.description,
        latitude: parsed.latitude,
        longitude: parsed.longitude
      });
      setNotice(`Updated group "${result.group.locationLabel || result.group.id}".`);
      setActiveGroup(result.group);
      setActiveGroupDraft(buildGroupDraft(result.group));
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update photo group");
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function setActiveGroupCover(photoId: string) {
    if (!activeGroup) {
      return;
    }
    try {
      setGroupSubmitting(true);
      const group = await api.setPhotoGroupCover(activeGroup.id, photoId);
      setActiveGroup(group);
      setActiveGroupDraft(buildGroupDraft(group));
      setNotice("Group cover updated.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set cover photo");
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function regenerateActiveGroupDescription() {
    if (!activeGroup) {
      return;
    }
    try {
      setGroupSubmitting(true);
      const result = await api.regeneratePhotoGroupDescription(activeGroup.id);
      if (result.group) {
        setActiveGroup(result.group);
        setActiveGroupDraft(buildGroupDraft(result.group));
      }
      setNotice("Group AI intro regenerated.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate group intro");
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function setActiveGroupVisibility(nextVisibility: "visible" | "hidden") {
    if (!activeGroup) {
      return;
    }
    try {
      setGroupSubmitting(true);
      const result = await api.setPhotoGroupVisibility(activeGroup.id, nextVisibility);
      if (result.group) {
        setActiveGroup(result.group);
        setActiveGroupDraft(buildGroupDraft(result.group));
      }
      setNotice(`Group updated to ${nextVisibility}.`);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update group visibility");
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function removeSelectedMembers(mode: "new_group" | "ungrouped") {
    if (!activeGroup || !selectedGroupMembers.length) {
      return;
    }
    try {
      setGroupSubmitting(true);
      const result = await api.removePhotosFromGroup(activeGroup.id, selectedGroupMembers, mode);
      if (result.group) {
        setActiveGroup(result.group);
        setActiveGroupDraft(buildGroupDraft(result.group));
      } else {
        closeGroupDetail();
      }
      setSelectedGroupMembers([]);
      setNotice(mode === "new_group" ? "Selected photos moved into a new group." : "Selected photos removed from group.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photos from group");
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function addSelectedPhotosToActiveGroup() {
    if (!activeGroup || !selected.length) {
      return;
    }
    try {
      setGroupSubmitting(true);
      const result = await api.addPhotosToGroup(activeGroup.id, selected);
      if (result.group) {
        setActiveGroup(result.group);
        setActiveGroupDraft(buildGroupDraft(result.group));
      }
      setNotice(`Added ${selected.length} selected photo(s) to the group.`);
      setSelected([]);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add selected photos to group");
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function mergeSelectedPhotoGroups() {
    if (selectedGroups.length < 2) {
      return;
    }
    const [targetGroupId] = selectedGroups;
    try {
      setError("");
      setGroupSubmitting(true);
      const result = await api.mergePhotoGroups(selectedGroups, targetGroupId);
      setSelectedGroups(result.group ? [result.group.id] : []);
      setNotice(`Merged ${selectedGroups.length} groups into one.`);
      await reloadAll();
      if (result.group) {
        await openGroupDetail(result.group.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge groups");
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function applyWorkQueue(queue: WorkQueue) {
    setError("");
    try {
      if (activeQueue === queue) {
        setActiveQueue(null);
        if (queue === "missing_description" || queue === "review_auto" || queue === "issues") {
          setView("groups");
          setGroupVisibilityFilter("all");
          setGroupDescriptionFilter("all");
          setGroupHasPromptFilter("all");
          setGroupHasDeletedFilter("all");
          setGroupHasHiddenFilter("all");
          setGroupIssueFilter("all");
          setGroupIssuesOnly(false);
          await loadGroups(
            buildGroupQueryString({
              visibilityFilter: "all",
              descriptionFilter: "all",
              hasPromptFilter: "all",
              hasDeletedFilter: "all",
              hasHiddenFilter: "all",
              issueFilter: "all"
            })
          );
          return;
        }
        setView("photos");
        setGeoFilter("all");
        setLocationLabelFilter("all");
        setVisibilityFilter("all");
        setDeletedFilter("all");
        await loadPhotos(
          buildPhotoQueryString({
            geoFilter: "all",
            locationLabelFilter: "all",
            visibilityFilter: "all",
            deletedFilter: "all"
          })
        );
        return;
      }

      setActiveQueue(queue);
      if (queue === "missing_gps") {
        setView("photos");
        setGeoFilter("missing");
        setLocationLabelFilter("all");
        setVisibilityFilter("all");
        setDeletedFilter("active");
        await loadPhotos(
          buildPhotoQueryString({
            geoFilter: "missing",
            locationLabelFilter: "all",
            visibilityFilter: "all",
            deletedFilter: "active"
          })
        );
        return;
      }
      if (queue === "missing_place") {
        setView("photos");
        setGeoFilter("attached");
        setLocationLabelFilter("missing");
        setVisibilityFilter("all");
        setDeletedFilter("active");
        await loadPhotos(
          buildPhotoQueryString({
            geoFilter: "attached",
            locationLabelFilter: "missing",
            visibilityFilter: "all",
            deletedFilter: "active"
          })
        );
        return;
      }
      if (queue === "missing_description") {
        setView("groups");
        setGroupVisibilityFilter("all");
        setGroupDescriptionFilter("missing");
        setGroupHasPromptFilter("all");
        setGroupHasDeletedFilter("all");
        setGroupHasHiddenFilter("all");
        setGroupIssueFilter("all");
        setGroupIssuesOnly(false);
        await loadGroups(
          buildGroupQueryString({
            visibilityFilter: "all",
            descriptionFilter: "missing",
            hasPromptFilter: "all",
            hasDeletedFilter: "all",
            hasHiddenFilter: "all",
            issueFilter: "all"
          })
        );
        return;
      }
      if (queue === "review_auto") {
        setView("groups");
        setGroupVisibilityFilter("all");
        setGroupDescriptionFilter("auto");
        setGroupHasPromptFilter("all");
        setGroupHasDeletedFilter("all");
        setGroupHasHiddenFilter("all");
        setGroupIssueFilter("all");
        setGroupIssuesOnly(false);
        await loadGroups(
          buildGroupQueryString({
            visibilityFilter: "all",
            descriptionFilter: "auto",
            hasPromptFilter: "all",
            hasDeletedFilter: "all",
            hasHiddenFilter: "all",
            issueFilter: "all"
          })
        );
        return;
      }
      if (queue === "issues") {
        setView("groups");
        setGroupVisibilityFilter("all");
        setGroupDescriptionFilter("all");
        setGroupHasPromptFilter("all");
        setGroupHasDeletedFilter("all");
        setGroupHasHiddenFilter("all");
        setGroupIssuesOnly(true);
        setGroupIssueFilter("all");
        await loadGroups(
          buildGroupQueryString({
            visibilityFilter: "all",
            descriptionFilter: "all",
            hasPromptFilter: "all",
            hasDeletedFilter: "all",
            hasHiddenFilter: "all",
            issueFilter: "all"
          })
        );
        return;
      }
      if (queue === "hidden") {
        setView("photos");
        setGeoFilter("all");
        setLocationLabelFilter("all");
        setVisibilityFilter("hidden");
        setDeletedFilter("active");
        await loadPhotos(
          buildPhotoQueryString({
            geoFilter: "all",
            locationLabelFilter: "all",
            visibilityFilter: "hidden",
            deletedFilter: "active"
          })
        );
        return;
      }
      setView("photos");
      setGeoFilter("all");
      setLocationLabelFilter("all");
      setVisibilityFilter("all");
      setDeletedFilter("deleted");
      await loadPhotos(
        buildPhotoQueryString({
          geoFilter: "all",
          locationLabelFilter: "all",
          visibilityFilter: "all",
          deletedFilter: "deleted"
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply work queue");
    }
  }

  return (
    <main className="admin-shell">
      <div className="admin-toolbar-shell">
        <section className="admin-toolbar panel admin-toolbar-primary admin-toolbar-compact">
          <div className="toolbar-row toolbar-row-primary">
            <div className="toolbar-group toolbar-group-tight toolbar-view-group">
              <span className="toolbar-label">View</span>
              <button type="button" className={view === "photos" ? "active-toggle" : "ghost-button"} onClick={() => setView("photos")}>
                Photos
              </button>
              <button type="button" className={view === "groups" ? "active-toggle" : "ghost-button"} onClick={() => setView("groups")}>
                Groups
              </button>
            </div>
            <div className="toolbar-group toolbar-group-tight toolbar-queue-group">
              <span className="toolbar-label">Work queues</span>
              <button type="button" className={activeQueue === "missing_gps" ? "active-toggle" : "ghost-button"} onClick={() => void applyWorkQueue("missing_gps")}>
                Missing GPS
              </button>
              <button type="button" className={activeQueue === "missing_place" ? "active-toggle" : "ghost-button"} onClick={() => void applyWorkQueue("missing_place")}>
                Missing place
              </button>
              <button type="button" className={activeQueue === "missing_description" ? "active-toggle" : "ghost-button"} onClick={() => void applyWorkQueue("missing_description")}>
                Missing intro
              </button>
              <button type="button" className={activeQueue === "review_auto" ? "active-toggle" : "ghost-button"} onClick={() => void applyWorkQueue("review_auto")}>
                Review AI
              </button>
              <button type="button" className={activeQueue === "issues" ? "active-toggle" : "ghost-button"} onClick={() => void applyWorkQueue("issues")}>
                Issues
              </button>
              <button type="button" className={activeQueue === "hidden" ? "active-toggle" : "ghost-button"} onClick={() => void applyWorkQueue("hidden")}>
                Hidden
              </button>
              <button type="button" className={activeQueue === "deleted" ? "active-toggle" : "ghost-button"} onClick={() => void applyWorkQueue("deleted")}>
                Deleted
              </button>
            </div>
            <div className="toolbar-group toolbar-group-tight toolbar-group-settings">
              <label className="toolbar-toggle">
                <input type="checkbox" checked={publicDebugPanelVisible} onChange={togglePublicDebugPanel} />
                <span>Homepage test window</span>
              </label>
            </div>
          </div>

          {view === "photos" ? (
            <>
              <div className="toolbar-row toolbar-row-search">
                <div className="toolbar-group toolbar-group-tight toolbar-search-group">
                  <div className="toolbar-search-cluster">
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, intro or place" />
                    <button type="button" onClick={() => void runPhotoSearch()}>
                      Search
                    </button>
                  </div>
                  <select value={geoFilter} onChange={(event) => setGeoFilter(event.target.value as GeoFilter)}>
                    <option value="all">All GPS</option>
                    <option value="missing">Missing GPS</option>
                    <option value="attached">GPS attached</option>
                  </select>
                  <select value={locationLabelFilter} onChange={(event) => setLocationLabelFilter(event.target.value as LocationLabelFilter)}>
                    <option value="all">All place labels</option>
                    <option value="present">With place label</option>
                    <option value="missing">Without place label</option>
                  </select>
                  <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value as VisibilityFilter)}>
                    <option value="all">All visibility</option>
                    <option value="visible">Visible only</option>
                    <option value="hidden">Hidden only</option>
                  </select>
                  <select value={deletedFilter} onChange={(event) => setDeletedFilter(event.target.value as DeletedFilter)}>
                    <option value="all">All states</option>
                    <option value="active">Active only</option>
                    <option value="deleted">Deleted only</option>
                  </select>
                </div>
                <div className="toolbar-group toolbar-group-tight toolbar-summary-group">
                  <span className="toolbar-summary">
                    {selected.length} selected / {items.length} shown
                  </span>
                  <button type="button" onClick={openUploadDialog}>
                    Upload photos
                  </button>
                </div>
              </div>
              <div className="toolbar-row toolbar-row-actions">
                <div className="toolbar-group toolbar-group-tight toolbar-action-group">
                  <button type="button" onClick={selectAllVisiblePhotos} disabled={!items.length}>
                    Select all
                  </button>
                  <button type="button" onClick={clearPhotoSelection} disabled={!selected.length}>
                    Deselect all
                  </button>
                  <button type="button" onClick={() => void doBatch("visible")} disabled={!selected.length}>
                    Show
                  </button>
                  <button type="button" onClick={() => void doBatch("hidden")} disabled={!selected.length}>
                    Hide
                  </button>
                  <button type="button" onClick={() => void doBatch("gps")} disabled={!selected.length}>
                    Set GPS
                  </button>
                  <button type="button" onClick={() => void doBatch("delete")} className="danger" disabled={!selected.length}>
                    Delete
                  </button>
                  <button type="button" onClick={() => void doBatch("restore")} disabled={!selected.length}>
                    Restore
                  </button>
                  <button type="button" onClick={() => void doBatch("purge")} className="danger" disabled={!selected.length}>
                    Purge
                  </button>
                  <button type="button" onClick={() => void purgeDeletedPhotos()} className="danger">
                    Empty trash
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="toolbar-row toolbar-row-search">
                <div className="toolbar-group toolbar-group-tight toolbar-search-group">
                  <div className="toolbar-search-cluster">
                    <input
                      value={groupQuery}
                      onChange={(event) => setGroupQuery(event.target.value)}
                      placeholder="Search place, intro, prompt or coordinates"
                    />
                    <button type="button" onClick={() => void runGroupSearch()}>
                      Search
                    </button>
                  </div>
                  <select value={groupVisibilityFilter} onChange={(event) => setGroupVisibilityFilter(event.target.value as VisibilityFilter)}>
                    <option value="all">All visibility</option>
                    <option value="visible">Visible groups</option>
                    <option value="hidden">Hidden groups</option>
                  </select>
                  <select value={groupDescriptionFilter} onChange={(event) => setGroupDescriptionFilter(event.target.value as GroupDescriptionFilter)}>
                    <option value="all">All intros</option>
                    <option value="missing">Missing intro</option>
                    <option value="auto">AI intro</option>
                    <option value="manual">Manual intro</option>
                  </select>
                  <select value={groupHasPromptFilter} onChange={(event) => setGroupHasPromptFilter(event.target.value as GroupBooleanFilter)}>
                    <option value="all">Prompt any</option>
                    <option value="yes">With prompt</option>
                    <option value="no">No prompt</option>
                  </select>
                  <select value={groupHasDeletedFilter} onChange={(event) => setGroupHasDeletedFilter(event.target.value as GroupBooleanFilter)}>
                    <option value="all">Deleted any</option>
                    <option value="yes">Has deleted</option>
                    <option value="no">No deleted</option>
                  </select>
                  <select value={groupHasHiddenFilter} onChange={(event) => setGroupHasHiddenFilter(event.target.value as GroupBooleanFilter)}>
                    <option value="all">Hidden any</option>
                    <option value="yes">Has hidden</option>
                    <option value="no">No hidden</option>
                  </select>
                  <select value={groupIssueFilter} onChange={(event) => setGroupIssueFilter(event.target.value as GroupIssueFilter)}>
                    <option value="all">All issues</option>
                    <option value="missing_location_label">Missing place</option>
                    <option value="missing_description">Missing intro</option>
                    <option value="mixed_visibility">Mixed visibility</option>
                    <option value="mixed_location_label">Mixed labels</option>
                    <option value="orphaned_cover">Cover reset</option>
                  </select>
                  <label className="toolbar-toggle toolbar-inline-toggle">
                    <input type="checkbox" checked={groupIssuesOnly} onChange={() => setGroupIssuesOnly((value) => !value)} />
                    <span>Only issues</span>
                  </label>
                </div>
                <div className="toolbar-group toolbar-group-tight toolbar-summary-group">
                  <span className="toolbar-summary">
                    {selectedGroups.length} selected / {visibleGroups.length} shown
                  </span>
                </div>
              </div>
              <div className="toolbar-row toolbar-row-actions">
                <div className="toolbar-group toolbar-group-tight toolbar-action-group">
                  <button type="button" onClick={selectAllVisibleGroups} disabled={!visibleGroups.length}>
                    Select all
                  </button>
                  <button type="button" onClick={clearGroupSelection} disabled={!selectedGroups.length}>
                    Deselect all
                  </button>
                  <button type="button" onClick={() => void mergeSelectedPhotoGroups()} disabled={selectedGroups.length < 2}>
                    Merge into first selected
                  </button>
                  <button type="button" onClick={() => void openGroupDetail(selectedGroups[0])} disabled={selectedGroups.length !== 1}>
                    Open selected
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {notice ? <p className="notice panel admin-status-banner">{notice}</p> : null}
        {error ? <p className="error panel admin-status-banner">{error}</p> : null}
      </div>

      <section className="admin-browser">
        {view === "photos" ? (
          <section className="cms-grid">
            {items.map((item) => (
              <article key={item.id} className={`photo-card panel ${selectedSet.has(item.id) ? "selected" : ""}`}>
                <div className="photo-meta">
                  <div className="photo-meta-top">
                    <label className="photo-select-inline">
                      <input type="checkbox" checked={selectedSet.has(item.id)} onChange={() => togglePhotoSelection(item.id)} />
                    </label>
                    <button type="button" className="photo-place-button" onClick={() => togglePhotoSelection(item.id)}>
                      <span className="photo-place" title={item.locationLabel || "Place label missing"}>
                        {item.locationLabel || "Place label missing"}
                      </span>
                    </button>
                  </div>
                  <div className="photo-status-row">
                    <span>{item.hasGeo ? "GPS attached" : "Missing GPS"}</span>
                    <span>{item.visibilityStatus}</span>
                  </div>
                  <div className="photo-status-row">
                    <span>{item.deletedAt ? "Deleted" : "Active"}</span>
                    {item.photoGroupId && item.groupPhotoCount ? (
                      <button type="button" className="inline-text-link inline-status-link" onClick={() => void openGroupDetail(item.photoGroupId!)}>
                        {item.groupPhotoCount} in group
                      </button>
                    ) : (
                      <span>Ungrouped</span>
                    )}
                  </div>
                </div>
                <Link to={`/admin/photos/${item.id}`} className="photo-card-link">
                  <img src={item.thumbnailUrl} alt={item.title} />
                </Link>
              </article>
            ))}
          </section>
        ) : (
          <section className="group-grid">
            {visibleGroups.map((group) => (
              <article key={group.id} className={`group-card panel ${selectedGroupSet.has(group.id) ? "selected" : ""}`}>
                <div className="group-card-header">
                  <input type="checkbox" checked={selectedGroupSet.has(group.id)} onChange={() => toggleGroupSelection(group.id)} />
                  <button type="button" className="ghost-button inline-ghost-button" onClick={() => void openGroupDetail(group.id)}>
                    Open
                  </button>
                </div>
                {group.coverThumbnailUrl ? <img src={group.coverThumbnailUrl} alt={group.locationLabel || group.id} className="group-cover" /> : null}
                <div className="group-copy">
                  <p className="photo-place">{group.locationLabel || "Place label missing"}</p>
                  <div className="photo-status-row">
                    <span>{group.photoCount} photo(s)</span>
                    <span>{group.descriptionSource}</span>
                    <span>{group.narrativePrompt.trim() ? "Prompt" : "No prompt"}</span>
                  </div>
                  <div className="photo-status-row">
                    <span>{group.visibleCount} visible</span>
                    <span>{group.hiddenCount} hidden</span>
                    <span>{group.deletedCount} deleted</span>
                  </div>
                  <p className="group-coordinates">{formatCoordinatePair(group.latitude, group.longitude)}</p>
                  {group.issues.length ? (
                    <div className="group-issue-list">
                      {group.issues.map((issue) => (
                        <span key={issue} className="group-issue-chip">
                          {issueLabel(issue)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="field-hint">No issue flags.</p>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </section>

      {uploadDialogOpen ? (
        <section className="modal-backdrop" onClick={closeUploadDialog}>
          <div className="modal-panel panel upload-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Batch Upload</p>
                <h2>Import multiple photos</h2>
              </div>
              <div className="upload-modal-header-actions">
                {hasUploadSession ? (
                  <button type="button" className="ghost-button" onClick={minimizeUploadDialog}>
                    Minimize
                  </button>
                ) : null}
                <button type="button" className="ghost-button" onClick={closeUploadDialog}>
                  Close
                </button>
              </div>
            </div>
            <div className="upload-panel-actions">
              <label className="file-button">
                Select photos
                <input type="file" multiple accept="image/*" onChange={onSelectFiles} disabled={uploadRunning} />
              </label>
              <button type="button" onClick={() => void startUploadBatch()} disabled={queuedUploadCount === 0 || uploadRunning}>
                {uploadRunning ? "Uploading..." : "Start upload"}
              </button>
            </div>
            <div className="upload-summary">
              <span>Total {uploadSummary.total}</span>
              <span>Queued {uploadSummary.queued}</span>
              <span>Uploading {uploadSummary.uploading}</span>
              <span>Processing {uploadSummary.processing}</span>
              <span>Success {uploadSummary.success}</span>
              <span>Failed {uploadSummary.failed}</span>
            </div>
            {uploadJob ? (
              <p className="upload-job-note">
                Job {uploadJob.id} · {uploadJob.status} · {uploadJob.summaryMessage || "Waiting to start."}
              </p>
            ) : null}
            {uploadItems.length ? (
              <div className="upload-list">
                {uploadItems.map((item) => (
                  <div key={item.localId} className={`upload-row ${item.status}`}>
                    <div className="upload-row-main">
                      <strong>{item.filename}</strong>
                      <span>{item.status === "uploading" ? `Uploading ${Math.round(item.progress * 100)}%` : item.status}</span>
                    </div>
                    <div className="upload-row-meta">
                      {item.error ? <span className="error">{item.error}</span> : null}
                      {!uploadRunning && item.status === "queued" ? (
                        <button type="button" className="ghost-button" onClick={() => removeUploadItem(item.localId)}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="upload-empty">Select one or more photos to create a batch import job.</p>
            )}
          </div>
        </section>
      ) : null}

      {showUploadDock ? (
        <section className="upload-dock panel">
          <div className="upload-dock-copy">
            <strong>Batch upload</strong>
            <span>{uploadDockLabel}</span>
          </div>
          <div className="upload-dock-actions">
            <button type="button" className="ghost-button" onClick={openUploadDialog}>
              Open
            </button>
            {!uploadRunning ? (
              <button type="button" className="ghost-button" onClick={() => setUploadDialogMinimized(false)}>
                Hide
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {gpsDialogOpen ? (
        <section className="modal-backdrop" onClick={closeGpsDialog}>
          <div className="modal-panel panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Batch GPS</p>
                <h2>Update {selected.length} selected photo(s)</h2>
              </div>
              <button type="button" className="ghost-button" onClick={closeGpsDialog}>
                Close
              </button>
            </div>
            <div className="modal-toggle-row">
              <button type="button" className={gpsMode === "coordinates" ? "active-toggle" : "ghost-button"} onClick={() => setGpsMode("coordinates")}>
                Coordinates
              </button>
              <button type="button" className={gpsMode === "address" ? "active-toggle" : "ghost-button"} onClick={() => setGpsMode("address")}>
                Address lookup
              </button>
            </div>
            {gpsMode === "coordinates" ? (
              <label>
                Coordinates
                <span className="field-hint">Paste Google Maps coordinates like "39.9042, 116.4074".</span>
                <input value={coordinateInput} onChange={(event) => setCoordinateInput(event.target.value)} placeholder="39.9042, 116.4074" />
              </label>
            ) : (
              <label>
                Address or place
                <input value={addressInput} onChange={(event) => setAddressInput(event.target.value)} placeholder="Tokyo Station" />
              </label>
            )}
            <label>
              Location label
              <input value={locationLabelInput} onChange={(event) => setLocationLabelInput(event.target.value)} placeholder="Optional display label" />
            </label>
            <label>
              Personalized prompt
              <textarea
                rows={4}
                value={narrativePromptInput}
                onChange={(event) => setNarrativePromptInput(event.target.value)}
                placeholder="Optional guidance for this location group's AI intro"
              />
            </label>
            {(gpsLoading || gpsProgressStage === "complete") && gpsProgressStage !== "idle" ? (
              <div className="gps-progress-card">
                <div className="gps-progress-header">
                  <strong>
                    {gpsProgressStage === "resolving"
                      ? "Resolving address"
                      : gpsProgressStage === "saving"
                        ? "Saving GPS"
                        : gpsProgressStage === "generating"
                          ? "Generating AI intro"
                          : "Completed"}
                  </strong>
                  <span>{Math.round(gpsProgressPercent)}%</span>
                </div>
                <div className="gps-progress-bar">
                  <span style={{ width: `${gpsProgressPercent}%` }} />
                </div>
                <p className="field-hint">
                  {gpsProgressStage === "complete"
                    ? "The latest backend result is ready below."
                    : "The backend is updating GPS and resolving the shared intro for this coordinate group."}
                </p>
              </div>
            ) : null}
            {gpsResult ? (
              <div className="gps-result-card">
                <div className="gps-result-header">
                  <strong>{gpsResult.locationLabel || "Shared intro result"}</strong>
                  <span className="field-meta">
                    {gpsResult.descriptionSource} · {gpsResult.photoCount} photo(s)
                  </span>
                </div>
                {gpsResult.wasTruncated ? (
                  <p className="error">This AI intro was truncated to fit the current 120-character limit.</p>
                ) : null}
                <label>
                  Generated intro
                  <textarea
                    rows={6}
                    value={gpsResult.description}
                    onChange={(event) =>
                      setGpsResult((current) => (current ? { ...current, description: event.target.value } : current))
                    }
                  />
                </label>
              </div>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={closeGpsDialog}>
                Close
              </button>
              {!gpsResult ? (
                <button type="button" onClick={() => void submitGpsBatch()} disabled={gpsLoading}>
                  {gpsLoading ? "Saving..." : "Apply GPS"}
                </button>
              ) : (
                <>
                  <button type="button" className="ghost-button" onClick={() => void rerunGpsNarrative()} disabled={gpsLoading}>
                    {gpsLoading ? "Working..." : "Rerun AI"}
                  </button>
                  <button type="button" onClick={() => void saveGpsNarrativeManually()} disabled={gpsLoading}>
                    {gpsLoading ? "Saving..." : "Save intro"}
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeGroupId ? (
        <section className="modal-backdrop" onClick={closeGroupDetail}>
          <div className="modal-panel panel group-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <button type="button" className="ghost-button" onClick={closeGroupDetail}>
                Close
              </button>
            </div>
            {groupLoading || !activeGroup || !activeGroupDraft ? (
              <p className="upload-empty">Loading group…</p>
            ) : (
              <div className="group-detail-layout">
                <div className="group-detail-main">
                  <label>
                    Location label
                    <input
                      value={activeGroupDraft.locationLabel}
                      onChange={(event) => setActiveGroupDraft((current) => (current ? { ...current, locationLabel: event.target.value } : current))}
                    />
                  </label>
                  <label>
                    Coordinates
                    <input
                      value={activeGroupDraft.coordinateInput}
                      onChange={(event) => setActiveGroupDraft((current) => (current ? { ...current, coordinateInput: event.target.value } : current))}
                    />
                  </label>
                  <label>
                    Shared prompt
                    <textarea
                      rows={4}
                      value={activeGroupDraft.narrativePrompt}
                      onChange={(event) => setActiveGroupDraft((current) => (current ? { ...current, narrativePrompt: event.target.value } : current))}
                    />
                  </label>
                  <label>
                    Shared intro
                    <textarea
                      rows={6}
                      value={activeGroupDraft.description}
                      onChange={(event) => setActiveGroupDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                    />
                  </label>
                  <div className="group-detail-actions">
                    <button type="button" onClick={() => void saveActiveGroup()} disabled={groupSubmitting}>
                      {groupSubmitting ? "Saving..." : "Save group"}
                    </button>
                    <button type="button" className="ghost-button" onClick={() => void regenerateActiveGroupDescription()} disabled={groupSubmitting}>
                      Regenerate AI intro
                    </button>
                    <button type="button" className="ghost-button" onClick={() => void setActiveGroupVisibility("visible")} disabled={groupSubmitting}>
                      Show group
                    </button>
                    <button type="button" className="ghost-button" onClick={() => void setActiveGroupVisibility("hidden")} disabled={groupSubmitting}>
                      Hide group
                    </button>
                  </div>
                  {activeGroup.issues.length ? (
                    <div className="group-issue-list">
                      {activeGroup.issues.map((issue) => (
                        <span key={issue} className="group-issue-chip">
                          {issueLabel(issue)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="group-detail-members">
                  <div className="group-member-toolbar">
                    <strong>Photos</strong>
                    <div className="group-member-toolbar-actions">
                      <button type="button" className="ghost-button" onClick={() => setSelectedGroupMembers(activeGroup.members.map((member) => member.id))}>
                        Select all
                      </button>
                      <button type="button" className="ghost-button" onClick={() => setSelectedGroupMembers([])} disabled={!selectedGroupMembers.length}>
                        Clear
                      </button>
                      <button type="button" className="ghost-button" onClick={() => void removeSelectedMembers("new_group")} disabled={!selectedGroupMembers.length || groupSubmitting}>
                        Move to new group
                      </button>
                      <button type="button" className="ghost-button" onClick={() => void removeSelectedMembers("ungrouped")} disabled={!selectedGroupMembers.length || groupSubmitting}>
                        Ungroup
                      </button>
                      {selected.length ? (
                        <button type="button" className="ghost-button" onClick={() => void addSelectedPhotosToActiveGroup()} disabled={groupSubmitting}>
                          Add {selected.length}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="group-member-grid">
                    {activeGroup.members.map((member) => (
                      <article key={member.id} className={`group-member-card ${selectedGroupMemberSet.has(member.id) ? "selected" : ""}`}>
                        <Link to={`/admin/photos/${member.id}`} className="group-member-thumb-link" title={member.title || "Untitled"}>
                          <img src={member.thumbnailUrl} alt={member.title} />
                        </Link>
                        <div className="group-member-copy">
                          <label className="group-member-select">
                            <input
                              type="checkbox"
                              checked={selectedGroupMemberSet.has(member.id)}
                              onChange={() => toggleGroupMemberSelection(member.id)}
                            />
                            <span>Select</span>
                          </label>
                          <div className="photo-status-row">
                            <span>{member.visibilityStatus}</span>
                            {member.deletedAt ? <span>Deleted</span> : null}
                            {member.isCover ? <span>Cover</span> : null}
                          </div>
                        </div>
                        <div className="group-member-actions">
                          <button type="button" className="inline-text-link" onClick={() => void setActiveGroupCover(member.id)} disabled={groupSubmitting}>
                            Set cover
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
