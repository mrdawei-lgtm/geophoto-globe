import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ImportJob, PhotoListItem, SharedNarrativePreview } from "../lib/api";
import { readPublicDebugPanelVisible, writePublicDebugPanelVisible } from "../lib/preferences";

type GeoFilter = "all" | "missing" | "attached";
type LocationLabelFilter = "all" | "missing" | "present";
type VisibilityFilter = "all" | "hidden" | "visible";
type DeletedFilter = "all" | "deleted" | "active";
type GpsMode = "coordinates" | "address";
type GpsProgressStage = "idle" | "resolving" | "saving" | "generating" | "complete";
type UploadItemStatus = "queued" | "uploading" | "processing" | "success" | "failed";

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

export function AdminListPage() {
  const [items, setItems] = useState<PhotoListItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [geoFilter, setGeoFilter] = useState<GeoFilter>("all");
  const [locationLabelFilter, setLocationLabelFilter] = useState<LocationLabelFilter>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const [deletedFilter, setDeletedFilter] = useState<DeletedFilter>("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [gpsDialogOpen, setGpsDialogOpen] = useState(false);
  const [gpsMode, setGpsMode] = useState<GpsMode>("coordinates");
  const [latitudeInput, setLatitudeInput] = useState("");
  const [longitudeInput, setLongitudeInput] = useState("");
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

  async function load() {
    try {
      setError("");
      const params = new URLSearchParams();
      if (query.trim()) {
        params.set("q", query.trim());
      }
      if (geoFilter === "missing") {
        params.set("hasGeo", "false");
      }
      if (geoFilter === "attached") {
        params.set("hasGeo", "true");
      }
      if (locationLabelFilter === "present") {
        params.set("hasLocationLabel", "true");
      }
      if (locationLabelFilter === "missing") {
        params.set("hasLocationLabel", "false");
      }
      if (visibilityFilter !== "all") {
        params.set("visibilityStatus", visibilityFilter);
      }
      if (deletedFilter === "deleted") {
        params.set("deleted", "true");
      }
      if (deletedFilter === "active") {
        params.set("deleted", "false");
      }
      const data = await api.listAdminPhotos(params.size ? `?${params.toString()}` : "");
      setItems(data.items);
      setSelected((current) => current.filter((id) => data.items.some((item) => item.id === id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photos");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

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

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function selectAllVisible() {
    setSelected(items.map((item) => item.id));
  }

  function clearSelection() {
    setSelected([]);
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
      await load();
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
      await load();
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
    setUploadItems((current) =>
      shouldReplaceExisting ? nextItems : [...current, ...nextItems]
    );
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
      await load();
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
    setLatitudeInput("");
    setLongitudeInput("");
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
        latitude = Number(latitudeInput.trim());
        longitude = Number(longitudeInput.trim());
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error("Latitude and longitude must be valid numbers");
        }
      } else {
        beginGpsProgress("resolving", 12);
        const query = addressInput.trim();
        if (!query) {
          throw new Error("Address is required");
        }
        const geocoded = await api.geocode(query);
        const first = geocoded.results[0];
        if (!first) {
          throw new Error("No coordinates found for that address");
        }
        latitude = first.latitude;
        longitude = first.longitude;
        if (!locationLabel) {
          locationLabel = first.displayName;
        }
        advanceGpsProgress("saving", 40);
      }
      advanceGpsProgress("generating", 68);
      const result = await api.batchGps(
        selected,
        latitude,
        longitude,
        locationLabel,
        narrativePromptInput.trim()
      );
      finishGpsProgress();
      setGpsResult(result.narrative);
      setLocationLabelInput(result.narrative?.locationLabel ?? locationLabel);
      setNarrativePromptInput(result.narrative?.narrativePrompt ?? narrativePromptInput.trim());
      setNotice(`GPS updated for ${selected.length} photo(s).`);
      await load();
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
      await load();
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
      await load();
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

  return (
    <main className="admin-shell">
      <div className="admin-toolbar-shell">
        <section className="admin-toolbar panel">
          <div className="toolbar-group">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, text or place" />
            <select value={geoFilter} onChange={(event) => setGeoFilter(event.target.value as GeoFilter)}>
              <option value="all">All GPS</option>
              <option value="missing">Missing GPS</option>
              <option value="attached">GPS attached</option>
            </select>
            <select
              value={locationLabelFilter}
              onChange={(event) => setLocationLabelFilter(event.target.value as LocationLabelFilter)}
            >
              <option value="all">All place labels</option>
              <option value="present">With place label</option>
              <option value="missing">Without place label</option>
            </select>
            <select
              value={visibilityFilter}
              onChange={(event) => setVisibilityFilter(event.target.value as VisibilityFilter)}
            >
              <option value="all">All visibility</option>
              <option value="visible">Visible only</option>
              <option value="hidden">Hidden only</option>
            </select>
            <select value={deletedFilter} onChange={(event) => setDeletedFilter(event.target.value as DeletedFilter)}>
              <option value="all">All states</option>
              <option value="active">Active only</option>
              <option value="deleted">Deleted only</option>
            </select>
            <button onClick={() => void load()}>Search</button>
          </div>
          <div className="toolbar-group">
            <button type="button" onClick={selectAllVisible} disabled={!items.length}>
              Select all
            </button>
            <button type="button" onClick={clearSelection} disabled={!selected.length}>
              Deselect all
            </button>
            <button type="button" onClick={openUploadDialog}>
              Upload photos
            </button>
            <button onClick={() => void doBatch("visible")}>Show</button>
            <button onClick={() => void doBatch("hidden")}>Hide</button>
            <button onClick={() => void doBatch("gps")}>Set GPS</button>
            <button onClick={() => void doBatch("delete")} className="danger">
              Delete
            </button>
            <button onClick={() => void doBatch("restore")}>Restore</button>
            <button onClick={() => void doBatch("purge")} className="danger">
              Purge
            </button>
            <button type="button" onClick={() => void purgeDeletedPhotos()} className="danger">
              Empty trash
            </button>
          </div>
          <div className="toolbar-group toolbar-group-settings">
            <label className="toolbar-toggle">
              <input type="checkbox" checked={publicDebugPanelVisible} onChange={togglePublicDebugPanel} />
              <span>Show homepage test window</span>
            </label>
          </div>
        </section>

        {notice ? <p className="notice panel admin-status-banner">{notice}</p> : null}
        {error ? <p className="error panel admin-status-banner">{error}</p> : null}
      </div>

      <section className="admin-browser">
        <section className="cms-grid">
          {items.map((item) => (
            <article key={item.id} className={`photo-card panel ${selectedSet.has(item.id) ? "selected" : ""}`}>
              <div className="photo-select">
                <input type="checkbox" checked={selectedSet.has(item.id)} onChange={() => toggle(item.id)} />
              </div>
              <div className="photo-meta">
                <span className="photo-place">{item.locationLabel || "Place label missing"}</span>
                <div className="photo-status-row">
                  <span>{item.hasGeo ? "GPS attached" : "Missing GPS"}</span>
                  <span>{item.visibilityStatus}</span>
                </div>
                <span>{item.deletedAt ? "Deleted" : "Active"}</span>
              </div>
              <Link to={`/admin/photos/${item.id}`} className="photo-card-link">
                <img src={item.thumbnailUrl} alt={item.title} />
              </Link>
            </article>
          ))}
        </section>
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
              <button
                type="button"
                className={gpsMode === "coordinates" ? "active-toggle" : "ghost-button"}
                onClick={() => setGpsMode("coordinates")}
              >
                Coordinates
              </button>
              <button
                type="button"
                className={gpsMode === "address" ? "active-toggle" : "ghost-button"}
                onClick={() => setGpsMode("address")}
              >
                Address lookup
              </button>
            </div>
            {gpsMode === "coordinates" ? (
              <div className="grid-two">
                <label>
                  Latitude
                  <input
                    value={latitudeInput}
                    onChange={(event) => setLatitudeInput(event.target.value)}
                    placeholder="39.9042"
                  />
                </label>
                <label>
                  Longitude
                  <input
                    value={longitudeInput}
                    onChange={(event) => setLongitudeInput(event.target.value)}
                    placeholder="116.4074"
                  />
                </label>
              </div>
            ) : (
              <label>
                Address or place
                <input
                  value={addressInput}
                  onChange={(event) => setAddressInput(event.target.value)}
                  placeholder="Tokyo Station"
                />
              </label>
            )}
            <label>
              Location label
              <input
                value={locationLabelInput}
                onChange={(event) => setLocationLabelInput(event.target.value)}
                placeholder="Optional display label"
              />
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
    </main>
  );
}
