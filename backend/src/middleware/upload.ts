import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import {
  ALLOWED_MIME_TYPES,
  EXPENSE_UPLOAD_DIR,
  MAX_FILE_BYTES,
  extForMime,
} from "../services/expense-document.service";

// Ensure the upload directory exists (created once at startup).
mkdirSync(EXPENSE_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, EXPENSE_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Unique, non-guessable, extension preserved: expense_<ts>_<rand>.<ext>
    const unique = `${Date.now()}_${randomBytes(6).toString("hex")}`;
    cb(null, `expense_${unique}.${extForMime(file.mimetype)}`);
  },
});

const multerUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Allowed: JPG, JPEG, PNG, WEBP, PDF"));
    }
  },
}).single("file");

/**
 * Parse a single multipart "file" field, writing it to local disk via multer's
 * disk storage (`req.file.path`). Maps multer errors to consistent HTTP
 * responses (413 for too large, 400 otherwise).
 */
export function uploadReceipt(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  multerUpload(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "File too large (max 5 MB)" });
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
