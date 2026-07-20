// ============================================================================
// PHOENIX PUBLICATIONS — routes/download.js
// ============================================================================
// Secure delivery of the private manuscript. The file lives OUTSIDE /public
// (in manuscripts/), so it's never directly reachable. This route is the ONLY
// way to get it, and it checks that the requester is actually allowed:
//   - the publisher of the book (always), OR
//   - anyone, if the book is free, OR
//   - someone who has a purchase record for it (even if the book was removed).
// Otherwise: denied.
// ============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db/db');
const router = express.Router();

// --- GET /download/:bookId -------------------------------------------------
router.get('/:bookId', (req, res) => {
  try {
    // Must be logged in.
    if (!req.session.memberId) {
      return res.status(401).send('Please log in to download. <a href="/login.html">Log in</a>');
    }

    const memberId = req.session.memberId;
    const bookId = Number(req.params.bookId);
    const book = db.getBookForDownload(bookId);

    // Compute access facts once.
    const hasBought = book ? db.hasPurchased(memberId, bookId) : false;
    const isPublisher = book ? (book.publisher_id === memberId) : false;
    const isFree = book ? (book.price_cents === 0) : false;

    // Must exist. Allow if live, OR the person bought it (even if the book was
    // later removed — buyers keep access), OR they're the publisher.
    if (!book || (book.status !== 'live' && !hasBought && !isPublisher)) {
      return res.status(404).send('This work is not available.');
    }

    // --- ACCESS CHECK ---
    // To download: be the publisher, OR it's free, OR you bought it.
    if (!isPublisher && !isFree && !hasBought) {
      // They don't own it. Don't reveal whether the file exists — just deny.
      return res.status(403).send('You need to buy this work to download it. <a href="/bookDetail.html?id=' + bookId + '">View it</a>');
    }

    // --- SERVE THE FILE ---
    // manuscript_key looks like "manuscripts/book-1/manuscript.pdf".
    // It's stored at the project root, OUTSIDE public/.
    const filePath = path.join(__dirname, '..', book.manuscript_key);

    // Safety: confirm the file actually exists on disk.
    if (!fs.existsSync(filePath)) {
      console.error('[download] file missing on disk:', filePath);
      return res.status(404).send('Sorry, this file could not be found.');
    }

    // A clean filename for the reader's download (their book title + .pdf).
    const safeTitle = book.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
    const downloadName = (safeTitle || 'book') + '.pdf';

    // res.download() sends the file as an attachment (prompts a save).
    res.download(filePath, downloadName, (err) => {
      if (err && !res.headersSent) {
        console.error('[download] send error:', err);
        res.status(500).send('Could not send the file.');
      }
    });

  } catch (err) {
    console.error('[download] error:', err);
    res.status(500).send('Something went wrong.');
  }
});

module.exports = router;