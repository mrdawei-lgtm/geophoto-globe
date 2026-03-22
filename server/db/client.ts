import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dataRoot, databasePath } from "../config.js";

let database: DatabaseSync | null = null;

export function getDb() {
  if (database) {
    return database;
  }

  fs.mkdirSync(dataRoot, { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 5000;");
  return database;
}
