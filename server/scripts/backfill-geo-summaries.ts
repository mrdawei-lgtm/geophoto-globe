import { bootstrapDatabase } from "../db/bootstrap.js";
import { PhotoService } from "../services/photoService.js";

bootstrapDatabase();

const photoService = new PhotoService();
const result = await photoService.backfillGeoSummaries(true);

console.log("English geo summary backfill completed");
console.log(`Photos with GPS: ${result.totalWithGeo}`);
console.log(`Photos missing summary before run: ${result.missingSummaryCount}`);
console.log(`Unique coordinate groups queried: ${result.coordinateGroupCount}`);
console.log(`Photos updated: ${result.updatedCount}`);
console.log(`Photos skipped: ${result.skippedCount}`);
