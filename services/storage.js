// ============================================================================
// PHOENIX PUBLICATIONS — services/storage.js
// ============================================================================
//
// WHAT THIS FILE IS:
//   The single place that knows HOW and WHERE files are stored. The rest of the
//   app never touches the disk directly — it calls saveManuscript() / saveCover()
//   and gets back a KEY (a logical path string) to store in the database.
//
// WHY (the storage seam):
//   This is the twin of db.js. Today it saves to local folders. Later, to move
//   to Azure Blob, we rewrite ONLY this file — the function names stay the same,
//   so nothing else in the app changes. That's the whole point of routing all
//   file handling through here.
//
// THE TWO LOCATIONS (security split):
//   - manuscripts  -> /manuscripts at the project ROOT, OUTSIDE public.
//                     PRIVATE. Never directly downloadable. Paid files.
//   - covers       -> /public/covers, INSIDE public.
//                     PUBLIC. Served to everyone (they're marketing).
//
// ORGANIZED BY BOOK ID (ids never change; handles do):
//   manuscripts/book-4/manuscript.pdf
//   covers/book-4/cover.jpg
//
// WHAT WE STORE IN THE DB:
//   The KEY (e.g. "manuscripts/book-4/manuscript.pdf"), not a real disk path.
// ============================================================================

const path = require('path');
const fs = require('fs');

// Base folders, both anchored to the project root (.. climbs out of /services).
const MANUSCRIPTS_DIR = path.join(__dirname, '..', 'manuscripts');       // private
const COVERS_DIR      = path.join(__dirname, '..', 'public', 'covers');  // public

// Make a folder if it doesn't exist yet (recursive: makes parents too).
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- saveManuscript(bookId, tempFilePath, originalName) ---------------------
// Moves an uploaded manuscript into manuscripts/book-<id>/ and returns its KEY.
//   bookId        - the new book's id (so we group by book)
//   tempFilePath  - where the upload library put the file temporarily
//   originalName  - the original filename, to keep its extension (.pdf/.epub)
function saveManuscript(bookId, tempFilePath, originalName) {
  const ext = path.extname(originalName) || '.pdf';      // keep .pdf/.epub
  const bookFolder = path.join(MANUSCRIPTS_DIR, 'book-' + bookId);
  ensureDir(bookFolder);

  const finalName = 'manuscript' + ext;
  const finalPath = path.join(bookFolder, finalName);
  fs.renameSync(tempFilePath, finalPath);                // move temp -> final

  // Return the KEY (forward slashes, logical path) to store in the DB.
  return 'manuscripts/book-' + bookId + '/' + finalName;
}

// --- saveCover(bookId, tempFilePath, originalName) --------------------------
// Same idea, but into the PUBLIC covers folder. Returns the cover KEY.
function saveCover(bookId, tempFilePath, originalName) {
  const ext = path.extname(originalName) || '.jpg';
  const bookFolder = path.join(COVERS_DIR, 'book-' + bookId);
  ensureDir(bookFolder);

  const finalName = 'cover' + ext;
  const finalPath = path.join(bookFolder, finalName);
  fs.renameSync(tempFilePath, finalPath);

  return 'covers/book-' + bookId + '/' + finalName;
}

module.exports = { saveManuscript, saveCover };