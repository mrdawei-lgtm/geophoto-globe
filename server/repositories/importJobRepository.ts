import crypto from "node:crypto";
import { getDb } from "../db/client.js";
import type { ImportJob, ImportJobItem, ImportJobItemStatus, ImportJobStatus, ImportJobWithItems } from "../types.js";

type ImportJobRow = {
  id: string;
  status: ImportJobStatus;
  total_count: number;
  processed_count: number;
  success_count: number;
  failed_count: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  summary_message: string;
};

type ImportJobItemRow = {
  id: string;
  job_id: string;
  original_filename: string;
  status: ImportJobItemStatus;
  photo_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function mapJob(row: ImportJobRow): ImportJob {
  return {
    id: row.id,
    status: row.status,
    totalCount: row.total_count,
    processedCount: row.processed_count,
    successCount: row.success_count,
    failedCount: row.failed_count,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    summaryMessage: row.summary_message
  };
}

function mapItem(row: ImportJobItemRow): ImportJobItem {
  return {
    id: row.id,
    jobId: row.job_id,
    originalFilename: row.original_filename,
    status: row.status,
    photoId: row.photo_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ImportJobRepository {
  private readonly db = getDb();

  createJob(totalCount: number) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO import_jobs (
        id, status, total_count, processed_count, success_count, failed_count,
        started_at, finished_at, created_at, updated_at, summary_message
      ) VALUES (?, 'pending', ?, 0, 0, 0, NULL, NULL, ?, ?, '')
    `).run(id, totalCount, now, now);
    return this.getJob(id)!;
  }

  createItems(jobId: string, filenames: string[]) {
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT INTO import_job_items (
        id, job_id, original_filename, status, photo_id, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, 'queued', NULL, NULL, ?, ?)
    `);
    this.db.exec("BEGIN");
    try {
      for (const filename of filenames) {
        insert.run(crypto.randomUUID(), jobId, filename, now, now);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.listItems(jobId);
  }

  getItem(jobId: string, itemId: string) {
    const row = this.db
      .prepare("SELECT * FROM import_job_items WHERE id = ? AND job_id = ?")
      .get(itemId, jobId) as ImportJobItemRow | undefined;
    return row ? mapItem(row) : null;
  }

  markJobRunning(jobId: string) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE import_jobs
      SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ?
      WHERE id = ?
    `).run(now, now, jobId);
  }

  private summarize(jobId: string) {
    const counts = this.db.prepare(`
      SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN status IN ('success', 'failed') THEN 1 ELSE 0 END) as processed_count,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN status IN ('uploading', 'processing') THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued_count
      FROM import_job_items
      WHERE job_id = ?
    `).get(jobId) as {
      total_count: number | null;
      processed_count: number | null;
      success_count: number | null;
      failed_count: number | null;
      active_count: number | null;
      queued_count: number | null;
    };
    const job = this.db.prepare("SELECT started_at FROM import_jobs WHERE id = ?").get(jobId) as { started_at: string | null } | undefined;
    return {
      totalCount: counts.total_count ?? 0,
      processedCount: counts.processed_count ?? 0,
      successCount: counts.success_count ?? 0,
      failedCount: counts.failed_count ?? 0,
      activeCount: counts.active_count ?? 0,
      queuedCount: counts.queued_count ?? 0,
      startedAt: job?.started_at ?? null
    };
  }

  refreshJob(jobId: string) {
    const summary = this.summarize(jobId);
    if (summary.totalCount === 0) {
      return this.getJob(jobId);
    }

    let status: ImportJobStatus = "running";
    if (!summary.startedAt) {
      status = "pending";
    } else if (summary.processedCount >= summary.totalCount) {
      status =
        summary.failedCount === 0 ? "completed" : summary.successCount === 0 ? "failed" : "partial";
    } else if (summary.activeCount === 0 && summary.failedCount > 0) {
      status = "partial";
    }

    const finishedAt = summary.processedCount >= summary.totalCount ? new Date().toISOString() : null;
    const summaryMessage =
      summary.processedCount >= summary.totalCount
        ? summary.failedCount === 0
          ? `Imported ${summary.successCount} of ${summary.totalCount} file(s).`
          : summary.successCount === 0
            ? `Failed to import all ${summary.totalCount} file(s).`
            : `Imported ${summary.successCount} file(s), ${summary.failedCount} failed.`
        : `Processed ${summary.processedCount} of ${summary.totalCount} file(s). ${summary.queuedCount} remaining.`;

    this.db.prepare(`
      UPDATE import_jobs
      SET status = ?,
          total_count = ?,
          processed_count = ?,
          success_count = ?,
          failed_count = ?,
          finished_at = COALESCE(?, finished_at),
          updated_at = ?,
          summary_message = ?
      WHERE id = ?
    `).run(
      status,
      summary.totalCount,
      summary.processedCount,
      summary.successCount,
      summary.failedCount,
      finishedAt,
      new Date().toISOString(),
      summaryMessage,
      jobId
    );

    return this.getJob(jobId);
  }

  updateItem(itemId: string, patch: Partial<Pick<ImportJobItem, "status" | "photoId" | "errorMessage">>) {
    const current = this.db.prepare("SELECT * FROM import_job_items WHERE id = ?").get(itemId) as ImportJobItemRow | undefined;
    if (!current) {
      return null;
    }
    const now = new Date().toISOString();
    const photoId = Object.prototype.hasOwnProperty.call(patch, "photoId") ? patch.photoId ?? null : current.photo_id;
    const errorMessage = Object.prototype.hasOwnProperty.call(patch, "errorMessage")
      ? patch.errorMessage ?? null
      : current.error_message;
    this.db.prepare(`
      UPDATE import_job_items
      SET status = ?, photo_id = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(
      patch.status ?? current.status,
      photoId,
      errorMessage,
      now,
      itemId
    );
    return this.db.prepare("SELECT * FROM import_job_items WHERE id = ?").get(itemId) as ImportJobItemRow;
  }

  updateJobProgress(jobId: string, counts: Pick<ImportJob, "processedCount" | "successCount" | "failedCount">) {
    this.db.prepare(`
      UPDATE import_jobs
      SET processed_count = ?, success_count = ?, failed_count = ?, updated_at = ?
      WHERE id = ?
    `).run(counts.processedCount, counts.successCount, counts.failedCount, new Date().toISOString(), jobId);
  }

  finalizeJob(jobId: string, status: ImportJobStatus, summaryMessage: string) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE import_jobs
      SET status = ?, finished_at = ?, updated_at = ?, summary_message = ?
      WHERE id = ?
    `).run(status, now, now, summaryMessage, jobId);
  }

  listJobs() {
    const rows = this.db.prepare("SELECT id FROM import_jobs ORDER BY created_at DESC").all() as Array<{ id: string }>;
    return rows
      .map((row) => this.refreshJob(row.id))
      .filter((job): job is ImportJob => Boolean(job));
  }

  listItems(jobId: string) {
    const rows = this.db
      .prepare("SELECT * FROM import_job_items WHERE job_id = ? ORDER BY created_at ASC")
      .all(jobId) as ImportJobItemRow[];
    return rows.map(mapItem);
  }

  getJob(jobId: string) {
    const row = this.db.prepare("SELECT * FROM import_jobs WHERE id = ?").get(jobId) as ImportJobRow | undefined;
    return row ? mapJob(row) : null;
  }

  getJobWithItems(jobId: string): ImportJobWithItems | null {
    const job = this.refreshJob(jobId);
    if (!job) {
      return null;
    }
    return {
      ...job,
      items: this.listItems(jobId)
    };
  }
}
