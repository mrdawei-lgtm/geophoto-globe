import type { GeoSummaryFields } from "../types.js";

type ReverseGeocodeResponse = {
  display_name?: string;
  namedetails?: Record<string, string | undefined>;
  address?: Record<string, string | undefined>;
};

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const REQUEST_INTERVAL_MS = 1100;
const CHINA_MUNICIPALITIES = new Set(["Beijing", "Shanghai", "Tianjin", "Chongqing"]);
const EMPTY_GEO_SUMMARY: GeoSummaryFields = {
  geoCountryEn: "",
  geoRegionEn: "",
  geoLocalityEn: "",
  geoSummaryEn: "",
  geoResolvedAt: null
};

let nextRequestAt = 0;
let requestQueue = Promise.resolve();

function dedupeSegments(values: Array<string | undefined>) {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function looksEnglishEnough(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  const letters = normalized.match(/\p{Letter}/gu) ?? [];
  if (!letters.length) {
    return true;
  }
  return letters.some((letter) => /\p{Script=Latin}/u.test(letter));
}

function looksLikePostalCode(value: string) {
  const normalized = value.trim();
  return /^[A-Z0-9 -]{4,10}$/i.test(normalized) && /\d/.test(normalized);
}

function englishOrBlank(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }
    if (looksLikePostalCode(normalized)) {
      continue;
    }
    if (looksEnglishEnough(normalized)) {
      return normalized;
    }
  }
  return "";
}

function parseDisplayName(value: string | undefined) {
  const segments = value
    ?.split(",")
    .map((segment) => segment.trim())
    .filter(Boolean) ?? [];

  const candidates = segments.filter((segment) => !looksLikePostalCode(segment));

  return {
    locality: candidates.length >= 3 ? candidates[candidates.length - 3] : candidates[0] ?? "",
    region: candidates.length >= 2 ? candidates[candidates.length - 2] : "",
    country: candidates.length >= 1 ? candidates[candidates.length - 1] : ""
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enqueueRateLimitedRequest<T>(task: () => Promise<T>) {
  const nextTask = requestQueue.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, nextRequestAt - now);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
    return task();
  });
  requestQueue = nextTask.then(
    () => undefined,
    () => undefined
  );
  return nextTask;
}

export function emptyGeoSummaryFields(): GeoSummaryFields {
  return { ...EMPTY_GEO_SUMMARY };
}

export class GeoSummaryService {
  private readonly cache = new Map<string, Promise<GeoSummaryFields>>();

  async resolve(latitude: number, longitude: number): Promise<GeoSummaryFields> {
    const cacheKey = `${latitude}:${longitude}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = enqueueRateLimitedRequest(async () => {
      const response = await fetch(
        `${NOMINATIM_ENDPOINT}?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&namedetails=1&accept-language=en`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "GeoPhotoGlobe/0.1 (english geo summary cache)"
          }
        }
      );
      if (!response.ok) {
        throw new Error(`Reverse geocoding failed with ${response.status}`);
      }

      const result = (await response.json()) as ReverseGeocodeResponse;
      const address = result.address ?? {};
      const namedetails = result.namedetails ?? {};
      const displayName = parseDisplayName(result.display_name);
      const country = englishOrBlank(address.country, displayName.country, namedetails["name:en"], namedetails.name);
      const region = englishOrBlank(
        address.state,
        address.province,
        address.region,
        address.state_district,
        displayName.region
      );
      const city = englishOrBlank(
        address.city,
        address.town,
        address.municipality,
        address.city_district,
        address.county,
        address.village,
        address.hamlet,
        address.suburb,
        address.neighbourhood,
        address.quarter,
        displayName.locality
      );
      const isChinaMunicipality = country === "China" && CHINA_MUNICIPALITIES.has(region);
      const locality = isChinaMunicipality ? region : city;
      const summarySegments = isChinaMunicipality
        ? dedupeSegments([region, country])
        : dedupeSegments([locality, region, country]);

      return {
        geoCountryEn: country,
        geoRegionEn: region,
        geoLocalityEn: locality,
        geoSummaryEn: summarySegments.join(", "),
        geoResolvedAt: new Date().toISOString()
      };
    }).catch(() => {
      this.cache.delete(cacheKey);
      return emptyGeoSummaryFields();
    });

    this.cache.set(cacheKey, request);
    return request;
  }
}
