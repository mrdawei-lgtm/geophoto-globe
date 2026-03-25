import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import { adminPassword, adminToken, appRoot, port } from "./config.js";
import { bootstrapDatabase } from "./db/bootstrap.js";
import { createAdminRouter } from "./routes/admin.js";
import { createPublicRouter } from "./routes/public.js";
import { PhotoService } from "./services/photoService.js";

const app = express();
const bootstrap = bootstrapDatabase();
const photoService = new PhotoService();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/storage", express.static(path.join(appRoot, "storage")));

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token !== adminToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.post("/api/admin/login", (req, res) => {
  if (req.body?.password !== adminPassword) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.json({ token: adminToken });
});
app.use("/api", createPublicRouter(photoService));
app.use("/api/admin", createAdminRouter({ requireAdmin, photoService }));

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!error) {
    next();
    return;
  }
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "File is too large. Limit is 50MB per photo." });
      return;
    }
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof Error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Unexpected server error" });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(appRoot, "dist")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(appRoot, "dist", "index.html"));
  });
}

if (bootstrap.imported > 0) {
  console.log(`Imported ${bootstrap.imported} photo record(s) from legacy JSON into SQLite`);
}

if (bootstrap.normalizedAssetPaths > 0) {
  console.log(`Normalized storage paths for ${bootstrap.normalizedAssetPaths} photo record(s)`);
}

app.listen(port, () => {
  console.log(`GeoPhoto Globe server listening on http://localhost:${port}`);
});
