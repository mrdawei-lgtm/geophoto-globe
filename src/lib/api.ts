export type PhotoListItem = {
  id: string;
  thumbnailUrl: string;
  title: string;
  description: string;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  hasGeo: boolean;
  locationLabel: string;
  visibilityStatus: "visible" | "hidden";
  deletedAt: string | null;
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
    return request<PhotoListItem & { originalAssetPath: string; managedAssetPath: string }>(
      `/api/admin/photos/${id}`,
      undefined,
      true
    );
  },
  updatePhoto(id: string, payload: Record<string, unknown>) {
    return request(`/api/admin/photos/${id}`, { method: "PATCH", body: JSON.stringify(payload) }, true);
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
  batchGps(ids: string[], latitude: number, longitude: number, locationLabel: string) {
    return request(
      "/api/admin/photos/batch/gps",
      { method: "POST", body: JSON.stringify({ ids, latitude, longitude, locationLabel }) },
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
        groupItems: PublicPhotoItem[];
        groupIndex: number;
        groupCount: number;
      }
    >(`/api/photos/${id}`);
  }
};
