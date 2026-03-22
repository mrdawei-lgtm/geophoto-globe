import { bootstrapDatabase } from "../db/bootstrap.js";
import { databasePath, legacyPhotosJsonPath } from "../config.js";

const result = bootstrapDatabase();

console.log(`SQLite ready: ${databasePath}`);
if (result.imported > 0) {
  console.log(`Imported ${result.imported} legacy photo record(s) from ${legacyPhotosJsonPath}`);
} else {
  console.log("No legacy JSON import needed");
}
