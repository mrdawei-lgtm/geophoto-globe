export type CoordinatePair = {
  latitude: number;
  longitude: number;
};

export function formatCoordinatePair(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) {
    return "";
  }

  return `${latitude}, ${longitude}`;
}

export function parseCoordinatePair(input: string): CoordinatePair | null {
  const normalized = input
    .trim()
    .replace(/[()]/g, " ")
    .replace(/\u00a0/g, " ");

  if (!normalized) {
    return null;
  }

  const parts = normalized
    .split(/[,\uFF0C]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length !== 2) {
    return null;
  }

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }

  return { latitude, longitude };
}
