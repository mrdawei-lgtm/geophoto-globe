import fs from "node:fs/promises";
import path from "node:path";
import { dataRoot } from "../config.js";
import { PhotoRepository } from "../repositories/photoRepository.js";
import { LocationNarrativeService } from "../services/locationNarrativeService.js";

type GroupResultRecord = {
  type: "group_result";
  key: string;
  status: "success" | "failure" | "skipped";
  action: string;
  latitude: number;
  longitude: number;
  locationLabel: string;
  photoCount: number;
  error: string | null;
};

function countCharacters(value: string) {
  return Array.from(value).length;
}

function normalizeDescription(value: string | null | undefined) {
  return (value ?? "").trim();
}

async function resolveReportPath(inputPath?: string) {
  if (inputPath) {
    return path.resolve(inputPath);
  }

  const reportsDir = path.join(dataRoot, "reports");
  const entries = await fs.readdir(reportsDir).catch(() => []);
  const latest = entries
    .filter((entry) => entry.startsWith("narrative-backfill-") && entry.endsWith(".jsonl"))
    .sort()
    .at(-1);

  if (!latest) {
    throw new Error("No narrative backfill report found");
  }

  return path.join(reportsDir, latest);
}

async function main() {
  const reportPath = await resolveReportPath(process.argv[2]);
  const content = await fs.readFile(reportPath, "utf8");
  const failedGroups = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type?: string } & Partial<GroupResultRecord>)
    .filter(
      (item): item is GroupResultRecord =>
        item.type === "group_result" &&
        item.status === "failure" &&
        item.action === "preserved_existing" &&
        typeof item.key === "string" &&
        typeof item.latitude === "number" &&
        typeof item.longitude === "number"
    );

  const uniqueFailedGroups = failedGroups.filter(
    (group, index, groups) => groups.findIndex((item) => item.key === group.key) === index
  );

  const reportsDir = path.join(dataRoot, "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const reportOutputPath = path.join(
    reportsDir,
    `narrative-retry-${startedAt.replaceAll(":", "-").replaceAll(".", "-")}.jsonl`
  );
  await fs.writeFile(
    reportOutputPath,
    `${JSON.stringify({ type: "session_start", startedAt, sourceReportPath: reportPath, reportPath: reportOutputPath })}\n`
  );

  const photoRepository = new PhotoRepository();
  const narrativeService = new LocationNarrativeService();
  let updatedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let truncatedCount = 0;

  for (let index = 0; index < uniqueFailedGroups.length; index += 1) {
    const group = uniqueFailedGroups[index];
    const photos = photoRepository.listByCoordinates(group.latitude, group.longitude);
    const manual = photos.find(
      (photo) => photo.descriptionSource === "manual" && normalizeDescription(photo.description)
    );

    if (manual) {
      skippedCount += photos.length;
      const record = {
        type: "group_result",
        index: index + 1,
        total: uniqueFailedGroups.length,
        processedAt: new Date().toISOString(),
        key: group.key,
        photoCount: photos.length,
        latitude: group.latitude,
        longitude: group.longitude,
        locationLabel: group.locationLabel,
        status: "skipped",
        action: "skipped_manual",
        wasTruncated: false,
        rawCharacterCount: countCharacters(normalizeDescription(manual.description)),
        error: null
      };
      await fs.appendFile(reportOutputPath, `${JSON.stringify(record)}\n`);
      console.log(`[${index + 1}/${uniqueFailedGroups.length}] SKIPPED manual · ${group.locationLabel || group.key} · ${photos.length} photo(s)`);
      continue;
    }

    const generation = await narrativeService.generateDetailedForPhotos(photos);
    const description = normalizeDescription(generation.description);

    if (!description) {
      failedCount += photos.length;
      const record = {
        type: "group_result",
        index: index + 1,
        total: uniqueFailedGroups.length,
        processedAt: new Date().toISOString(),
        key: group.key,
        photoCount: photos.length,
        latitude: group.latitude,
        longitude: group.longitude,
        locationLabel: group.locationLabel,
        status: "failure",
        action: "preserved_existing",
        wasTruncated: false,
        rawCharacterCount: generation.rawCharacterCount,
        error: generation.error ?? "Narrative generation returned empty text"
      };
      await fs.appendFile(reportOutputPath, `${JSON.stringify(record)}\n`);
      console.log(`[${index + 1}/${uniqueFailedGroups.length}] FAILED preserved_existing · ${group.locationLabel || group.key} · ${photos.length} photo(s)`);
      console.log(`  error: ${record.error}`);
      continue;
    }

    photoRepository.batchUpdate(
      photos.map((photo) => photo.id),
      {
        description,
        descriptionSource: "auto"
      }
    );
    updatedCount += photos.length;
    if (generation.wasTruncated) {
      truncatedCount += photos.length;
    }
    const record = {
      type: "group_result",
      index: index + 1,
      total: uniqueFailedGroups.length,
      processedAt: new Date().toISOString(),
      key: group.key,
      photoCount: photos.length,
      latitude: group.latitude,
      longitude: group.longitude,
      locationLabel: group.locationLabel,
      status: "success",
      action: "updated",
      wasTruncated: generation.wasTruncated,
      rawCharacterCount: generation.rawCharacterCount,
      error: null
    };
    await fs.appendFile(reportOutputPath, `${JSON.stringify(record)}\n`);
    console.log(
      `[${index + 1}/${uniqueFailedGroups.length}] SUCCESS updated${generation.wasTruncated ? " [TRUNCATED]" : ""} · ${group.locationLabel || group.key} · ${photos.length} photo(s)`
    );
    if (generation.wasTruncated) {
      console.log(`  truncation: raw=${generation.rawCharacterCount} saved<=120`);
    }
  }

  const finishedAt = new Date().toISOString();
  await fs.appendFile(
    reportOutputPath,
    `${JSON.stringify({
      type: "session_end",
      finishedAt,
      sourceReportPath: reportPath,
      updatedCount,
      failedCount,
      skippedCount,
      truncatedCount
    })}\n`
  );

  console.log("Location narrative retry completed");
  console.log(`Source report: ${reportPath}`);
  console.log(`Retry groups scanned: ${uniqueFailedGroups.length}`);
  console.log(`Photos updated: ${updatedCount}`);
  console.log(`Photos failed: ${failedCount}`);
  console.log(`Photos skipped: ${skippedCount}`);
  console.log(`Photos flagged as truncated: ${truncatedCount}`);
  console.log(`Retry report: ${reportOutputPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
