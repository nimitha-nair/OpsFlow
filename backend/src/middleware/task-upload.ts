import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { extname } from "node:path";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import {
  TASK_ALLOWED_MIME,
  TASK_MAX_BYTES,
  TASK_UPLOAD_DIR,
} from "../services/task-attachment.service";

// Ensure the upload directory exists (created once at startup).
mkdirSync(TASK_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TASK_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const raw = extname(file.originalname).toLowerCase();
    const ext = /^\.[a-z0-9]{1,8}$/.test(raw) ? raw : ".bin";
    cb(null, `task_${Date.now()}_${randomBytes(6).toString("hex")}${ext}`);
  },
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (TASK_ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file type. Allowed: images, PDF, and office docs."));
  }
};

const single = multer({
  storage,
  limits: { fileSize: TASK_MAX_BYTES, files: 1 },
  fileFilter,
}).single("file");

/** Parse a single multipart "file" field for a task attachment. */
export function uploadTaskFile(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  single(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "File too large (max 10 MB)" });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : "Invalid upload" });
      return;
    }
    next();
  });
}
