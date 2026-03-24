import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, PhotoListItem } from "../lib/api";

type EditablePhoto = PhotoListItem & {
  displayImageUrl: string;
  originalAssetPath: string;
  managedAssetPath: string;
};

function toLocalDateTimeInputValue(value: string | null) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function fromLocalDateTimeInputValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function buildDirtyPayload(current: EditablePhoto, original: EditablePhoto) {
  const payload: Record<string, unknown> = {};

  if (current.title !== original.title) {
    payload.title = current.title;
  }
  if (current.description !== original.description) {
    payload.description = current.description;
  }
  if (current.capturedAt !== original.capturedAt) {
    payload.capturedAt = current.capturedAt;
  }
  if (current.locationLabel !== original.locationLabel) {
    payload.locationLabel = current.locationLabel;
  }
  if (current.visibilityStatus !== original.visibilityStatus) {
    payload.visibilityStatus = current.visibilityStatus;
  }
  if (current.latitude !== original.latitude) {
    payload.latitude = current.latitude;
  }
  if (current.longitude !== original.longitude) {
    payload.longitude = current.longitude;
  }

  return payload;
}

function descriptionSourceLabel(source: PhotoListItem["descriptionSource"]) {
  if (source === "manual") {
    return "Manual";
  }
  if (source === "auto") {
    return "Auto";
  }
  return "Empty";
}

export function AdminPhotoPage() {
  const { id = "" } = useParams();
  const [photo, setPhoto] = useState<EditablePhoto | null>(null);
  const [initialPhoto, setInitialPhoto] = useState<EditablePhoto | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function load() {
    try {
      const loaded = await api.getAdminPhoto(id);
      setPhoto(loaded);
      setInitialPhoto(loaded);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photo");
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo || !initialPhoto) {
      return;
    }
    try {
      const payload = buildDirtyPayload(photo, initialPhoto);
      const updated = Object.keys(payload).length ? await api.updatePhoto(photo.id, payload) : photo;
      setPhoto(updated);
      setInitialPhoto(updated);
      setSaved("Saved.");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function searchAddress() {
    if (!address || !photo) {
      return;
    }
    try {
      const results = await api.geocode(address);
      const first = results.results[0];
      if (!first) {
        throw new Error("No results");
      }
      setPhoto({
        ...photo,
        latitude: first.latitude,
        longitude: first.longitude,
        hasGeo: true,
        locationLabel: first.displayName
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Geocoding failed");
    }
  }

  if (!photo) {
    return <main className="admin-shell panel">Loading...</main>;
  }

  return (
    <main className="admin-shell">
      <form className="edit-layout" onSubmit={onSave}>
        <section className="panel">
          <Link to="/admin">Back to CMS</Link>
          <img src={photo.thumbnailUrl} alt={photo.title} className="edit-preview" />
        </section>
        <section className="panel edit-form">
          <label>
            Title
            <input value={photo.title} onChange={(event) => setPhoto({ ...photo, title: event.target.value })} />
          </label>
          <label>
            Captured time
            <span className="field-hint">
              Edit in your current browser timezone. Saving updates the exact timestamp used for sorting and auto-generated intros.
            </span>
            <input
              type="datetime-local"
              step={60}
              value={toLocalDateTimeInputValue(photo.capturedAt)}
              onChange={(event) => setPhoto({ ...photo, capturedAt: fromLocalDateTimeInputValue(event.target.value) })}
            />
          </label>
          <label>
            Description
            <span className="field-hint">
              Shared by exact GPS match. Saving here will sync the same intro to other photos at this location.
            </span>
            <span className="field-meta">Source: {descriptionSourceLabel(photo.descriptionSource)}</span>
            <textarea
              rows={6}
              value={photo.description}
              onChange={(event) => setPhoto({ ...photo, description: event.target.value })}
            />
          </label>
          <label>
            Location label
            <input value={photo.locationLabel} onChange={(event) => setPhoto({ ...photo, locationLabel: event.target.value })} />
          </label>
          <div className="grid-two">
            <label>
              Latitude
              <input
                value={photo.latitude ?? ""}
                onChange={(event) =>
                  setPhoto({ ...photo, latitude: event.target.value === "" ? null : Number(event.target.value) })
                }
              />
            </label>
            <label>
              Longitude
              <input
                value={photo.longitude ?? ""}
                onChange={(event) =>
                  setPhoto({ ...photo, longitude: event.target.value === "" ? null : Number(event.target.value) })
                }
              />
            </label>
          </div>
          <label>
            Address search
            <div className="inline-row">
              <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Search an address" />
              <button type="button" onClick={() => void searchAddress()}>
                Search GPS
              </button>
            </div>
          </label>
          <label>
            Visibility
            <select
              value={photo.visibilityStatus}
              onChange={(event) =>
                setPhoto({ ...photo, visibilityStatus: event.target.value as "visible" | "hidden" })
              }
            >
              <option value="visible">visible</option>
              <option value="hidden">hidden</option>
            </select>
          </label>
          <div className="inline-row">
            <button type="submit">Save changes</button>
            {saved ? <span>{saved}</span> : null}
            {error ? <span className="error">{error}</span> : null}
          </div>
        </section>
      </form>
    </main>
  );
}
