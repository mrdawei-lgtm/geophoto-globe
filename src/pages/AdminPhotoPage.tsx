import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, PhotoListItem } from "../lib/api";

export function AdminPhotoPage() {
  const { id = "" } = useParams();
  const [photo, setPhoto] = useState<(PhotoListItem & { displayImageUrl?: string }) | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function load() {
    try {
      setPhoto(await api.getAdminPhoto(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photo");
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo) {
      return;
    }
    try {
      await api.updatePhoto(photo.id, photo);
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
            Description
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
