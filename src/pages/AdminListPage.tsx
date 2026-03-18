import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, PhotoListItem } from "../lib/api";

type GeoFilter = "all" | "missing" | "attached";
type VisibilityFilter = "all" | "hidden" | "visible";
type DeletedFilter = "all" | "deleted" | "active";
type GpsMode = "coordinates" | "address";

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

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function doBatch(action: "visible" | "hidden" | "delete" | "restore" | "gps") {
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

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files?.length) {
      return;
    }
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("photos", file));
    try {
      setError("");
      await api.importPhotos(formData);
      setNotice(`${files.length} photo(s) imported.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
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
          <button onClick={() => void load()}>Search</button>
        </div>
        <div className="toolbar-group">
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
          <label className="file-button">
            Import photos
            <input type="file" multiple accept="image/*" onChange={onImport} />
          </label>
          <button onClick={() => void doBatch("visible")}>Show</button>
          <button onClick={() => void doBatch("hidden")}>Hide</button>
          <button onClick={() => void doBatch("gps")}>Set GPS</button>
          <button onClick={() => void doBatch("delete")} className="danger">
            Delete
          </button>
          <button onClick={() => void doBatch("restore")}>Restore</button>
        </div>
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
