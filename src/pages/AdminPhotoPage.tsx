import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, PhotoGroupDetail, PhotoListItem } from "../lib/api";
import { formatCoordinatePair, parseCoordinatePair } from "../lib/coordinates";

type EditablePhoto = PhotoListItem & {
  displayImageUrl: string;
  originalAssetPath: string;
  managedAssetPath: string;
  group: PhotoGroupDetail | null;
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
  if (current.narrativePrompt !== original.narrativePrompt) {
    payload.narrativePrompt = current.narrativePrompt;
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

export function AdminPhotoPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [photo, setPhoto] = useState<EditablePhoto | null>(null);
  const [initialPhoto, setInitialPhoto] = useState<EditablePhoto | null>(null);
  const [address, setAddress] = useState("");
  const [coordinateInput, setCoordinateInput] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [coverSaving, setCoverSaving] = useState(false);

  async function load() {
    try {
      const loaded = await api.getAdminPhoto(id);
      setPhoto(loaded);
      setInitialPhoto(loaded);
      setCoordinateInput(formatCoordinatePair(loaded.latitude, loaded.longitude));
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
      const parsedCoordinates = parseCoordinatePair(coordinateInput);
      if (coordinateInput.trim() && !parsedCoordinates) {
        throw new Error("Coordinates must be two valid numbers in 'latitude, longitude' format");
      }

      const nextPhoto = parsedCoordinates
        ? { ...photo, latitude: parsedCoordinates.latitude, longitude: parsedCoordinates.longitude }
        : { ...photo, latitude: null, longitude: null };
      const normalizedPayload = buildDirtyPayload(nextPhoto, initialPhoto);
      const updated = Object.keys(normalizedPayload).length ? await api.updatePhoto(photo.id, normalizedPayload) : nextPhoto;
      setPhoto(updated);
      setInitialPhoto(updated);
      setCoordinateInput(formatCoordinatePair(updated.latitude, updated.longitude));
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
      setCoordinateInput(formatCoordinatePair(first.latitude, first.longitude));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Geocoding failed");
    }
  }

  async function regenerateNarrative() {
    if (!photo) {
      return;
    }
    try {
      setRegenerating(true);
      const result = await api.regenerateLocationNarrative(photo.id);
      setPhoto(result.photo);
      setInitialPhoto(result.photo);
      setSaved(`AI intro regenerated for ${result.updatedCount} photo${result.updatedCount === 1 ? "" : "s"} in this location group.`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI intro regeneration failed");
    } finally {
      setRegenerating(false);
    }
  }

  async function setCurrentAsCover() {
    if (!photo?.group) {
      return;
    }
    try {
      setCoverSaving(true);
      await api.setPhotoGroupCover(photo.group.id, photo.id);
      await load();
      setSaved("Set as group cover.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set group cover");
    } finally {
      setCoverSaving(false);
    }
  }

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/admin");
  }

  const groupMembers = photo?.group?.members ?? [];
  const currentGroupIndex = useMemo(
    () => groupMembers.findIndex((member) => member.id === photo?.id),
    [groupMembers, photo?.id]
  );
  const previousMember = currentGroupIndex > 0 ? groupMembers[currentGroupIndex - 1] : null;
  const nextMember = currentGroupIndex >= 0 && currentGroupIndex < groupMembers.length - 1 ? groupMembers[currentGroupIndex + 1] : null;

  if (!photo) {
    return <main className="admin-shell panel">Loading...</main>;
  }

  return (
    <main className="admin-shell">
      <form className="edit-layout edit-layout-grouped" onSubmit={onSave}>
        <section className="panel edit-sidebar">
          <img src={photo.thumbnailUrl} alt={photo.title} className="edit-preview" />
          <div className="edit-sidebar-footer">
            <button type="button" className="ghost-button" onClick={handleBack}>
              Back
            </button>
          </div>
        </section>
        <section className="panel edit-form">
          <label>
            Title
            <input value={photo.title} onChange={(event) => setPhoto({ ...photo, title: event.target.value })} />
          </label>
          <label>
            Captured time
            <span className="field-hint">
              Edit in your current browser timezone. Saving updates the exact timestamp used for sorting and group ordering.
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
              Shared at the group level. Saving here updates the entire group, not just this photo.
            </span>
            <span className="field-meta">Source: {descriptionSourceLabel(photo.descriptionSource)}</span>
            <textarea rows={6} value={photo.description} onChange={(event) => setPhoto({ ...photo, description: event.target.value })} />
          </label>
          <label>
            Prompt
            <span className="field-hint">
              Shared at the group level. The latest saved group prompt is used when regenerating the group intro.
            </span>
            <textarea rows={4} value={photo.narrativePrompt} onChange={(event) => setPhoto({ ...photo, narrativePrompt: event.target.value })} />
          </label>
          <label>
            Location label
            <span className="field-hint">Shared at the group level. Saving updates every member in this group.</span>
            <input value={photo.locationLabel} onChange={(event) => setPhoto({ ...photo, locationLabel: event.target.value })} />
          </label>
          <label>
            Resolved GPS location
            <span className="field-meta">{photo.geoSummaryEn || "Location summary unavailable"}</span>
            <span className="field-hint">
              {photo.hasGeo
                ? [photo.geoLocalityEn, photo.geoRegionEn, photo.geoCountryEn].filter(Boolean).join(" / ") || "Reverse geocoding has not filled region details yet."
                : "This photo does not have GPS coordinates yet."}
            </span>
          </label>
          <label>
            Coordinates
            <span className="field-hint">Paste Google Maps coordinates like "39.9042, 116.4074".</span>
            <input
              value={coordinateInput}
              onChange={(event) => {
                const nextValue = event.target.value;
                setCoordinateInput(nextValue);
                const parsed = parseCoordinatePair(nextValue);
                if (!nextValue.trim()) {
                  setPhoto({ ...photo, latitude: null, longitude: null, hasGeo: false });
                  return;
                }
                if (parsed) {
                  setPhoto({ ...photo, latitude: parsed.latitude, longitude: parsed.longitude, hasGeo: true });
                }
              }}
              placeholder="39.9042, 116.4074"
            />
          </label>
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
              onChange={(event) => setPhoto({ ...photo, visibilityStatus: event.target.value as "visible" | "hidden" })}
            >
              <option value="visible">visible</option>
              <option value="hidden">hidden</option>
            </select>
          </label>
          <div className="edit-actions">
            <button type="submit">Save changes</button>
            <button type="button" className="ghost-button" onClick={() => void regenerateNarrative()} disabled={!photo.hasGeo || regenerating}>
              {regenerating ? "Regenerating..." : "Regenerate AI intro"}
            </button>
            {saved ? <span>{saved}</span> : null}
            {error ? <span className="error">{error}</span> : null}
          </div>
        </section>
        <aside className="panel photo-group-sidebar">
          <div className="photo-group-sidebar-header">
            <p className="eyebrow">Group Sidebar</p>
            <strong>{photo.group ? photo.group.locationLabel || "Unnamed group" : "Ungrouped photo"}</strong>
          </div>
          {photo.group ? (
            <>
              {photo.group.coverThumbnailUrl ? (
                <img src={photo.group.coverThumbnailUrl} alt={photo.group.locationLabel || photo.group.id} className="photo-group-cover" />
              ) : null}
              <div className="photo-group-sidebar-copy">
                <span>{photo.group.photoCount} photo(s)</span>
                <span>{formatCoordinatePair(photo.group.latitude, photo.group.longitude)}</span>
                <span>{photo.isGroupCover ? "Current photo is cover" : "Current photo is not cover"}</span>
              </div>
              <div className="photo-group-sidebar-actions">
                <button type="button" className="ghost-button" onClick={() => void setCurrentAsCover()} disabled={coverSaving}>
                  {coverSaving ? "Saving..." : "Set current as cover"}
                </button>
                {previousMember ? (
                  <Link to={`/admin/photos/${previousMember.id}`} className="ghost-button inline-link-button">
                    Previous
                  </Link>
                ) : null}
                {nextMember ? (
                  <Link to={`/admin/photos/${nextMember.id}`} className="ghost-button inline-link-button">
                    Next
                  </Link>
                ) : null}
              </div>
              {photo.group.issues.length ? (
                <div className="group-issue-list">
                  {photo.group.issues.map((issue) => (
                    <span key={issue} className="group-issue-chip">
                      {issueLabel(issue)}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="photo-group-member-strip">
                {photo.group.members.map((member) => (
                  <Link key={member.id} to={`/admin/photos/${member.id}`} className={`photo-group-member-thumb ${member.id === photo.id ? "active" : ""}`}>
                    <img src={member.thumbnailUrl} alt={member.title || member.id} />
                    <span>{member.isCover ? "Cover" : member.visibilityStatus}</span>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="field-hint">
              This photo is not currently assigned to a photo group. Add GPS coordinates and save to attach or create a group.
            </p>
          )}
        </aside>
      </form>
    </main>
  );
}
