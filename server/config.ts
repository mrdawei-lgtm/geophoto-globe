import crypto from "node:crypto";
import path from "node:path";

const appRootCandidate = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

try {
  process.loadEnvFile(path.join(appRootCandidate, ".env"));
} catch {
  // Ignore missing or unreadable local env files and fall back to inherited process.env.
}

export const appRoot = appRootCandidate;
export const dataRoot = path.join(appRoot, "data");
export const storageRoot = path.join(appRoot, "storage");
export const uploadsRoot = path.join(appRoot, "uploads");

export const databasePath = process.env.DATABASE_PATH || path.join(dataRoot, "geophoto-globe.sqlite");
export const legacyPhotosJsonPath = path.join(dataRoot, "photos.json");

export const port = Number(process.env.PORT || 8787);
export const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
export const adminToken = crypto.createHash("sha256").update(adminPassword).digest("hex");
export const narrativeApiBaseUrl = (process.env.NARRATIVE_API_BASE_URL || "").trim();
export const narrativeApiKey = (process.env.NARRATIVE_API_KEY || "").trim();
export const narrativeModel = (process.env.NARRATIVE_MODEL || "").trim();
