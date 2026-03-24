import fs from "node:fs/promises";
import path from "node:path";
import { dataRoot } from "../config.js";
import { bootstrapDatabase } from "../db/bootstrap.js";
import { PhotoService } from "../services/photoService.js";

bootstrapDatabase();

const reportDir = path.join(dataRoot, "reports");
await fs.mkdir(reportDir, { recursive: true });
const startedAt = new Date();
const startedAtToken = startedAt.toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportDir, `narrative-backfill-${startedAtToken}.jsonl`);

const photoService = new PhotoService();
await fs.appendFile(
  reportPath,
  `${JSON.stringify({
    type: "session_start",
    startedAt: startedAt.toISOString(),
    reportPath
  })}\n`
);

const result = await photoService.backfillLocationNarratives({
  forceRegenerate: true,
  concurrency: 4,
  onGroupProcessed: async (group, index, total) => {
    const statusLabel =
      group.status === "success"
        ? group.action === "updated"
          ? "SUCCESS updated"
          : "SUCCESS unchanged"
        : group.status === "skipped"
          ? `SKIPPED ${group.action}`
          : `FAILED ${group.action}`;
    const truncationLabel = group.wasTruncated ? " [TRUNCATED]" : "";
    console.log(
      `[${index}/${total}] ${statusLabel}${truncationLabel} · ${group.locationLabel || group.geoSummaryEn || group.key} · ${group.photoCount} photo(s)`
    );
    if (group.error) {
      console.log(`  error: ${group.error}`);
    }
    if (group.wasTruncated) {
      console.log(`  truncation: raw=${group.rawCharacterCount} saved<=120`);
    }
    await fs.appendFile(
      reportPath,
      `${JSON.stringify({
        type: "group_result",
        index,
        total,
        processedAt: new Date().toISOString(),
        ...group
      })}\n`
    );
  }
});

await fs.appendFile(
  reportPath,
  `${JSON.stringify({
    type: "session_end",
    finishedAt: new Date().toISOString(),
    ...result
  })}\n`
);

console.log("Shared location narrative backfill completed");
console.log(`Photos with GPS: ${result.totalWithGeo}`);
console.log(`Unique coordinate groups scanned: ${result.coordinateGroupCount}`);
console.log(`Photos updated: ${result.updatedCount}`);
console.log(`Photos skipped: ${result.skippedCount}`);
console.log(`Photos failed: ${result.failedCount}`);
console.log(`Photos flagged as truncated: ${result.truncatedCount}`);
console.log(`Backfill report: ${reportPath}`);
