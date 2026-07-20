// ============================================================================
// PHOENIX PUBLICATIONS — services/preview.js
// ============================================================================
// Generates a NON-secret "look inside" sample from a manuscript PDF.
// SECURITY: the preview is a SEPARATE, physically-truncated PDF containing ONLY
// the first 10% (min 3, max 15) of pages. The full manuscript's other pages do
// not exist in this file, so serving the preview can never leak the paid work.
// PDF only — EPUB/other formats get no preview.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// How many pages the sample shows.
function previewPageCount(total) {
  return Math.min(total, Math.max(3, Math.min(15, Math.ceil(total * 0.10))));
}

// Generate (once) and return the path to a book's preview PDF, or null if the
// source isn't a PDF / can't be previewed. Caches to previews/book-N/preview.pdf.
async function ensurePreview(bookId, manuscriptKey) {
  // Only PDFs can be previewed.
  if (!manuscriptKey || !manuscriptKey.toLowerCase().endsWith('.pdf')) return null;

  const previewDir = path.join(__dirname, '..', 'previews', 'book-' + bookId);
  const previewPath = path.join(previewDir, 'preview.pdf');

  // Already generated? Serve the cached one.
  if (fs.existsSync(previewPath)) return previewPath;

  // Source manuscript on disk.
  const srcPath = path.join(__dirname, '..', manuscriptKey);
  if (!fs.existsSync(srcPath)) return null;

  try {
    const srcBytes = fs.readFileSync(srcPath);
    const srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    const total = srcDoc.getPageCount();
    if (total === 0) return null;

    const count = previewPageCount(total);
    const preview = await PDFDocument.create();
    const pages = await preview.copyPages(srcDoc, Array.from({ length: count }, (_, i) => i));
    pages.forEach(p => preview.addPage(p));

    const previewBytes = await preview.save();
    fs.mkdirSync(previewDir, { recursive: true });
    fs.writeFileSync(previewPath, previewBytes);
    return previewPath;
  } catch (err) {
    console.error('[preview] generation failed for book', bookId, ':', err.message);
    return null;
  }
}

module.exports = { ensurePreview, previewPageCount };