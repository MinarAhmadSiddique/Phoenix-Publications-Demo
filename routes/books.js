// ============================================================================
// routes/books.js — publishing, browsing, buying (built in stages)
// ============================================================================
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');                 // for hashing the file (anti-piracy fingerprint)
const fs = require('fs');                          // to read the file for hashing
const db = require('../db/db');                    // database functions
const storage = require('../services/storage');    // file storage layer (Stage 2)

const router = express.Router();

// multer: incoming files are saved temporarily to "uploads/". storage.js then
// moves them to their permanent home.
const upload = multer({ dest: 'uploads/' });

// --- POST /publish — STAGE 3c: create book, save files, record keys --------
router.post('/publish',
  upload.fields([{ name: 'manuscript', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
  (req, res) => {
    try {
      // Who's publishing (from the session).
      const publisherId = req.session.memberId;

      // --- Money: dollars -> integer cents. "Make it free" overrides to 0. ---
      const isFree = req.body.is_free === 'yes';
      const priceCents = isFree ? 0 : Math.round(parseFloat(req.body.price) * 100);

      // --- Consent checkboxes: present = 'yes' (1), absent = off (0). ---
      const featureYoutube    = req.body.feature_youtube    === 'yes' ? 1 : 0;
      const featureNewsletter = req.body.feature_newsletter === 'yes' ? 1 : 0;

      // --- A manuscript is required (a book with no file is meaningless). ---
      if (!req.files || !req.files.manuscript) {
        return res.status(400).send('A manuscript file is required. <a href="/members/publish.html">Try again</a>');
      }

      // --- 1. Create the book record (placeholder keys for now). Get its id. ---
      const bookId = db.createBook({
        publisherId,
        contentTypeId: parseInt(req.body.content_type_id),
        title: req.body.title,
        description: req.body.description,
        priceCents,
        featureYoutube,
        featureNewsletter,
        categoryId: parseInt(req.body.category_id),
        audienceId: parseInt(req.body.audience_id)
      });

      // --- 2. Hash the manuscript's bytes BEFORE moving it ---
      // (We hash the temp file now, because storage.saveManuscript MOVES it next,
      //  so the temp path won't exist afterward.) This sha256 is the fingerprint
      //  we'll later use to detect duplicate/pirated re-uploads.
      const m = req.files.manuscript[0];
      const fileBuffer = fs.readFileSync(m.path);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // --- 3. Save the manuscript via storage.js (moves it into manuscripts/book-<id>/) ---
      const manuscriptKey = storage.saveManuscript(bookId, m.path, m.originalname);

      // --- 4. Save the cover, if one was uploaded (optional). ---
      let coverKey = 'none';
      if (req.files.cover) {
        const c = req.files.cover[0];
        coverKey = storage.saveCover(bookId, c.path, c.originalname);
      }

      // --- 5. Replace the placeholder keys with the real ones. ---
      db.updateBookKeys(bookId, manuscriptKey, coverKey, fileHash);

      console.log(`[publish] Book #${bookId} fully published (pending review). manuscript=${manuscriptKey}`);

     res.redirect('/members/dashboard.html?published=1');

    } catch (err) {
      console.error('[publish] error:', err);
      res.status(500).send('Something went wrong publishing. <a href="/members/publish.html">Try again</a>');
    }finally {
      // Clean up any leftover temp uploads, whether we succeeded or failed.
      // (storage.saveManuscript already moved the manuscript; this catches the
      //  cover's temp copy and anything left behind by an error.)
      if (req.files) {
        for (const field of Object.values(req.files)) {
          for (const file of field) {
            // If the temp file still exists (wasn't moved), delete it.
            try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (e) {}
          }
        }
      }
    }
  }
);

module.exports = router;