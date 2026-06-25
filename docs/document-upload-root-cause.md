# Document Upload — Reproduction, Root Cause & Fix

## Reproduction (against the real project)

Ran a live diagnosis using the real service account (`secrets/service-account.json`,
project `opsflow-cc01b`):

```
project_id: opsflow-cc01b | private_key present: true
bucket opsflow-cc01b.firebasestorage.app -> exists: false
bucket opsflow-cc01b.appspot.com         -> exists: false
NO WORKING BUCKET FOUND.

# attempting to provision a bucket:
creating bucket opsflow-cc01b-receipts ...
ERROR: The billing account for the owning project is disabled in state absent
```

## Pipeline verification (each required step)

| Step | Status | Evidence |
|---|---|---|
| Browser sends `multipart/form-data` | ✅ | axios `lib/api.ts` sets **no** `Content-Type`, so the browser auto-adds `multipart/form-data` with the boundary for `FormData`. |
| Backend receives the file | ✅ | route reaches `uploadReceipt` → controller (live multipart test, 5/5). |
| Multer receives the file | ✅ | `req.file` populated (buffer/mimetype/size); type filter + 5 MB limit work. |
| **Firebase Storage upload succeeds** | ❌ | **No bucket exists** → `bucket.file().save()` throws. |
| Metadata stored in Firestore | ✅ (logic) | `expenseDocuments` write + `documentId` link verified against a fake bucket. |
| Signed URL generated | ✅ (capability) | service account **has a private key**, so `getSignedUrl` can sign offline. |
| Employee can view document | ⛔ blocked | depends on the upload + bucket. |

## Root cause (exact)

**Firebase Cloud Storage is not provisioned for `opsflow-cc01b`, and it cannot be —
the project is on the free Spark plan with no billing account.** Cloud Storage
buckets require the **Blaze (pay-as-you-go) plan**. With no bucket:

- Both candidate bucket names (`.firebasestorage.app`, `.appspot.com`) report
  `exists: false`.
- Programmatic bucket creation fails: *"The billing account for the owning
  project is disabled in state absent."*

The application code (form-data, multer, save, metadata, signed URL) is correct —
it simply has **no bucket to write to**. Previously this surfaced as an opaque
`500`, which hid the cause.

## Fix

**Required (environment — only you can do this):**
1. Upgrade the Firebase project to the **Blaze** plan (add a billing account):
   Firebase Console → ⚙ → Usage and billing → Modify plan → Blaze.
2. Enable Storage: Console → Build → **Storage → Get started** (creates the
   default bucket, named `opsflow-cc01b.firebasestorage.app`).
3. Set it in `backend/.env`:
   `FIREBASE_STORAGE_BUCKET=opsflow-cc01b.firebasestorage.app`
4. Restart the backend. Startup now logs `[storage] Bucket OK: …`, or a loud
   warning if the bucket is still missing.

**Code changes shipped (so it works the moment Storage is on):**
- Default bucket corrected to `<project>.firebasestorage.app` (was the
  non-existent `.appspot.com`).
- `verifyStorageBucket()` runs at startup and logs whether the bucket exists.
- Storage `save()` / `getSignedUrl()` now return a clear **502** with an
  actionable message and **log the underlying error + bucket name** (no more
  opaque 500).
- `FIREBASE_STORAGE_BUCKET` documented in `.env.example`.

**No-billing alternative (if Blaze is not an option):** store small receipts as
base64 in a Firestore subdocument (≤ ~700 KB after encoding, within the 1 MB
doc limit) or use an external object store (S3/Cloudinary). This is a different
design than the specified Firebase Storage integration — flag if you want it.

## Other fixes in this pass
- **Admin can change reimbursement status** — `PATCH /expenses/:id/reimbursement`
  (ADMIN, approved expenses only; PENDING → PROCESSING → PAID). UI: a status
  selector on the expense detail page for admins. Verified 6/6.
- **Project Spending shows the project name** — the page now displays
  `projectName` (from the backend) as a heading, and the table resolves names via
  the spending payload (no IDs shown).
