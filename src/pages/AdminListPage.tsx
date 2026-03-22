import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ImportJob, PhotoListItem } from "../lib/api";

type GeoFilter = "all" | "missing" | "attached";
type VisibilityFilter = "all" | "hidden" | "visible";
type DeletedFilter = "all" | "deleted" | "active";
type GpsMode = "coordinates" | "address";
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
  const [gpsLoading, setGpsLoading] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadQueueItem[]>([]);
  const [uploadJob, setUploadJob] = useState<ImportJob | null>(null);
  const [uploadRunning, setUploadRunning] = useState(false);

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

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
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
    setGpsDialogOpen(false);
    setGpsMode("coordinates");
    setLatitudeInput("");
    setLongitudeInput("");
    setAddressInput("");
    setLocationLabelInput("");
    setGpsLoading(false);
  }

  async function submitGpsBatch() {
    if (!selected.length) {
      closeGpsDialog();
      return;
    }
    try {
      setError("");
      setGpsLoading(true);
      let latitude = 0;
      let longitude = 0;
      let locationLabel = locationLabelInput.trim();
      if (gpsMode === "coordinates") {
        latitude = Number(latitudeInput.trim());
        longitude = Number(longitudeInput.trim());
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error("Latitude and longitude must be valid numbers");
        }
      } else {
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
      }
      await api.batchGps(selected, latitude, longitude, locationLabel);
      setNotice(`GPS updated for ${selected.length} photo(s).`);
      setSelected([]);
      closeGpsDialog();
      await load();
    } catch (err) {
      setGpsLoading(false);
      setError(err instanceof Error ? err.message : "Batch GPS update failed");
    }
  }

  return (
    <main className="admin-shell">
      <section className="admin-toolbar panel">
        <div className="toolbar-group">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, text or place" />
          <select value={geoFilter} onChange={(event) => setGeoFilter(event.target.value as GeoFilter)}>
            <option value="all">All GPS</option>
            <option value="missing">Missing GPS</option>
            <option value="attached">GPS attached</option>
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
        </div>
      </section>

      <section className="panel upload-panel">
        <div className="upload-panel-header">
          <div>
            <p className="eyebrow">Batch Upload</p>
            <h2>Import multiple photos</h2>
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
        </div>
        <div className="upload-summary">
          <span>Total {uploadSummary.total}</span>
          <span>Queued {uploadSummary.queued}</span>
          <span>Uploading {uploadSummary.uploading}</span>
          <span>Processing {uploadSummary.processing}</span>
          <span>Success {uploadSummary.success}</span>
          <span>Failed {uploadSummary.failed}</span>
        </div>
        {uploadJob ? <p className="upload-job-note">Job {uploadJob.id} · {uploadJob.status} · {uploadJob.summaryMessage || "Waiting to start."}</p> : null}
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
      </section>

      {notice ? <p className="notice panel">{notice}</p> : null}
      {error ? <p className="error panel">{error}</p> : null}
      <section className="cms-grid">
        {items.map((item) => (
          <article key={item.id} className={`photo-card panel ${selectedSet.has(item.id) ? "selected" : ""}`}>
            <div className="photo-select">
              <input type="checkbox" checked={selectedSet.has(item.id)} onChange={() => toggle(item.id)} />
            </div>
            <Link to={`/admin/photos/${item.id}`}>
              <img src={item.thumbnailUrl} alt={item.title} />
            </Link>
            <div className="photo-meta">
              <strong>{item.title}</strong>
              <span>{item.hasGeo ? "GPS attached" : "Missing GPS"}</span>
              <span>{item.visibilityStatus}</span>
              <span>{item.deletedAt ? "Deleted" : "Active"}</span>
            </div>
          </article>
        ))}
      </section>
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
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={closeGpsDialog}>
                Cancel
              </button>
              <button type="button" onClick={() => void submitGpsBatch()} disabled={gpsLoading}>
                {gpsLoading ? "Saving..." : "Apply GPS"}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
