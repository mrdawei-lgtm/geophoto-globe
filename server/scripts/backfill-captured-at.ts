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
const reportPath = path.join(reportDir, `captured-at-backfill-${startedAtToken}.jsonl`);

const photoService = new PhotoService();
await fs.appendFile(
  reportPath,
  `${JSON.stringify({
    type: "session_start",
    startedAt: startedAt.toISOString(),
    reportPath
  })}\n`
);

const result = await photoService.backfillCapturedAt({
  onPhotoProcessed: async (photo, index, total) => {
    const label = photo.locationLabel || photo.title || photo.id;
    console.log(`[${index}/${total}] ${photo.status.toUpperCase()} · ${label}`);
    if (photo.error) {
      console.log(`  error: ${photo.error}`);
    }
    if (photo.status === "updated") {
      console.log(`  ${photo.previousCapturedAt || "null"} -> ${photo.nextCapturedAt || "null"}`);
    }
    await fs.appendFile(
      reportPath,
      `${JSON.stringify({
        type: "photo_result",
        index,
        total,
        processedAt: new Date().toISOString(),
        ...photo
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

console.log("Captured time backfill completed");
console.log(`Photos scanned: ${result.totalCount}`);
console.log(`Photos updated: ${result.updatedCount}`);
console.log(`Photos unchanged: ${result.unchangedCount}`);
console.log(`Photos failed: ${result.failedCount}`);
console.log(`Backfill report: ${reportPath}`);
