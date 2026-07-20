// ============================================================================
// PHOENIX PUBLICATIONS — routes/preview.js
// GET /preview/:bookId — serves the sample PDF (public; generated on first view).
// ============================================================================

const express = require('express');
const db = require('../db/db');
const { ensurePreview } = require('../services/preview');
const router = express.Router();

router.get('/:bookId', async (req, res) => {
  try {
    const bookId = Number(req.params.bookId);
    const book = db.getBookForDownload(bookId);  // gives us manuscript_key + status
    if (!book) return res.status(404).send('Not found.');

    // Only preview live books (or let the publisher preview their own — optional).
    if (book.status !== 'live') return res.status(404).send('No preview available.');

    const previewPath = await ensurePreview(bookId, book.manuscript_key);
    if (!previewPath) return res.status(404).send('No preview available for this work.');

    // Serve inline (opens in the browser's PDF viewer).
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.sendFile(previewPath);
  } catch (err) {
    console.error('[preview] error:', err);
    res.status(500).send('Could not load preview.');
  }
});

module.exports = router;