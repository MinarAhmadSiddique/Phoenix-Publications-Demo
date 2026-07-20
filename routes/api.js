// ============================================================================
// PHOENIX PUBLICATIONS — routes/api.js
// ============================================================================
//
// WHAT THIS FILE IS:
//   The "data provider" side of the app. These routes don't return HTML pages —
//   they return raw DATA as JSON. The browser (your pages) calls these with
//   fetch(), gets the data, and builds the visible content from it.
//
//   This is the heart of "Option B": the server hands out data, the page
//   displays it. Keeps your HTML pure (no template markup) — the page just
//   asks for data and renders it.
//
// WHAT IS JSON?
//   JSON is just a text format for data — objects and arrays, like JavaScript.
//   res.json(something) converts a JS value into JSON text and sends it. The
//   browser's fetch() turns it back into a JS value on the other end. It's the
//   common language the server and the page speak to each other.
//
// CONVENTION:
//   We prefix these routes with /api/ (e.g. /api/featured) to clearly separate
//   "data endpoints" from "page" URLs. Anything under /api/ returns data, not pages.
// ============================================================================

const express = require('express');
const db = require('../db/db');                          // our database functions
const { requireAdmin } = require('../middleware/requireAuth');  // admin guard for admin routes

const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const avatarUpload = multer({ dest: 'public/avatars/tmp/', limits: { fileSize: 3 * 1024 * 1024 } });
const bcrypt = require('bcrypt');
// ----------------------------------------------------------------------------
// GET /api/featured
// ----------------------------------------------------------------------------
// Returns the curated featured works for the homepage, as JSON. The homepage's
// script will fetch this and build the featured cards from it.
// ----------------------------------------------------------------------------
router.get('/featured', (req, res) => {
  try {
    const featured = db.getFeaturedBooks();
    res.json(featured);
  } catch (err) {
    console.error('[api/featured] error:', err);
    res.status(500).json({ error: 'Could not load featured works.' });
  }
});

// POST /api/admin/member/:id/suspend — suspend or restore a member
router.post('/admin/member/:id/suspend', requireAdmin, express.json(), (req, res) => {
  try {
    const suspend = req.body.suspend === true || req.body.suspend === 'yes';
    db.setMemberSuspended(Number(req.params.id), suspend);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/admin/suspend] error:', err);
    res.status(500).json({ error: 'Could not update member.' });
  }
});

// GET /api/admin/comments?search= — all comments
router.get('/admin/comments', requireAdmin, (req, res) => {
  try {
    res.json({
      comments: db.getAllCommentsForAdmin((req.query.search || '').trim() || null),
      total: db.countAllComments()
    });
  } catch (err) {
    console.error('[api/admin/comments] error:', err);
    res.status(500).json({ error: 'Could not load comments.' });
  }
});

// POST /api/admin/comment/:id/delete — delete a comment
router.post('/admin/comment/:id/delete', requireAdmin, express.json(), (req, res) => {
  try {
    db.deleteCommentAsAdmin(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/admin/comment/delete] error:', err);
    res.status(500).json({ error: 'Could not delete comment.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/my-books — the logged-in member's own books (for their dashboard)
// ----------------------------------------------------------------------------
router.get('/my-books', (req, res) => {
  try {
    if (!req.session.memberId) {
      return res.status(401).json({ error: 'Not logged in.' });
    }
    const books = db.getMyBooks(req.session.memberId);
    res.json(books);
  } catch (err) {
    console.error('[api/my-books] error:', err);
    res.status(500).json({ error: 'Could not load your books.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/taxonomy
// ----------------------------------------------------------------------------
// Returns content types, categories, and audiences as JSON, so the publish
// form can fill its dropdowns with the real options from the database.
// ----------------------------------------------------------------------------
router.get('/taxonomy', (req, res) => {
  try {
    const taxonomy = db.getTaxonomy();
    res.json(taxonomy);
  } catch (err) {
    console.error('[api/taxonomy] error:', err);
    res.status(500).json({ error: 'Could not load taxonomy.' });
  }
});


// ============================================================================
// ADMIN-ONLY ROUTES — the review queue. Protected by requireAdmin: only a
// logged-in admin reaches these. A regular member or stranger is bounced.
// ============================================================================

// ----------------------------------------------------------------------------
// GET /api/admin/pending — books awaiting review (the moderation queue)
// ----------------------------------------------------------------------------
router.get('/admin/pending', requireAdmin, (req, res) => {
  try {
    res.json(db.getPendingBooks());
  } catch (err) {
    console.error('[api/admin/pending] error:', err);
    res.status(500).json({ error: 'Could not load pending books.' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/admin/review — approve or reject a book
// JSON body: { bookId: number, action: 'approve' | 'reject' }
//   approve -> status becomes 'live'
//   reject  -> status becomes 'rejected'
// ----------------------------------------------------------------------------
router.post('/admin/review', requireAdmin, express.json(), (req, res) => {
  try {
    const { bookId, action } = req.body;
    if (!bookId || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Need a bookId and action (approve/reject).' });
    }
    const newStatus = action === 'approve' ? 'live' : 'rejected';
    db.setBookStatus(bookId, newStatus);
    console.log(`[admin/review] Book #${bookId} -> ${newStatus}`);
    res.json({ ok: true, bookId, status: newStatus });
  } catch (err) {
    console.error('[api/admin/review] error:', err);
    res.status(500).json({ error: 'Could not update the book.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/book/:id — one book's full detail (for the book detail page)
// Only LIVE books are shown publicly. Pending/rejected -> 404 (not viewable).
// ----------------------------------------------------------------------------
router.get('/book/:id', (req, res) => {
  try {
    const book = db.getBookForDisplay(Number(req.params.id));

    // Not found, or not live -> don't reveal it publicly.
    if (!book || book.status !== 'live') {
      return res.status(404).json({ error: 'Book not found.' });
    }

    // Tell the page whether the current viewer has liked it (if logged in).
    const likedByMe = req.session.memberId
      ? db.hasLiked(req.session.memberId, book.id)
      : false;

    res.json({ ...book, likedByMe, loggedIn: !!req.session.memberId });
  } catch (err) {
    console.error('[api/book] error:', err);
    res.status(500).json({ error: 'Could not load the book.' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/book/:id/like — toggle a like (must be logged in)
// ----------------------------------------------------------------------------
router.post('/book/:id/like', express.json(), (req, res) => {
  try {
    if (!req.session.memberId) {
      return res.status(401).json({ error: 'Please log in to like.' });
    }
    const bookId = Number(req.params.id);
    const memberId = req.session.memberId;

    // Toggle: if already liked, unlike; otherwise, like.
    if (db.hasLiked(memberId, bookId)) {
      db.removeLike(memberId, bookId);
    } else {
      db.addLike(memberId, bookId);
    }

    res.json({ liked: db.hasLiked(memberId, bookId), likes: db.countLikes(bookId) });
  } catch (err) {
    console.error('[api/book/like] error:', err);
    res.status(500).json({ error: 'Could not update like.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/member/:handle — a member's public profile + their works
// ----------------------------------------------------------------------------
// ============================================================================
// GET /api/member/:handle — a member's public profile + their works
// ============================================================================
router.get('/member/:handle', (req, res) => {
  try {
    const member = db.getMemberProfileByHandle(req.params.handle);
    if (!member) {
      return res.status(404).json({ error: 'No such member.' });
    }

    // Is the viewer the owner of this profile?
    const isOwner = req.session.memberId === member.id;

    // Private profiles are only viewable by their owner.
    if (member.profile_visibility !== 'public' && !isOwner) {
      return res.status(404).json({ error: 'This profile is private.' });
    }

    // Owner sees all their books; everyone else sees only live ones.
    const books = db.getBooksForProfile(member.id, isOwner);
    const followers = db.countFollowers(member.id);
    const iFollow = req.session.memberId
      ? db.isFollowing(req.session.memberId, member.id)
      : false;

res.json({
      id: member.id,
      handle: member.handle,
      display_name: member.display_name,
      tagline: member.tagline,
      bio: member.bio,
      avatar_key: member.avatar_key,
      profile_visibility: member.profile_visibility,
      created_at: member.created_at,
      books,
      followers,
      iFollow,
      isOwner,
      achievements: db.getMemberAchievements(member.id),
      loggedIn: !!req.session.memberId
    });
  } catch (err) {
    console.error('[api/member] error:', err);
    res.status(500).json({ error: 'Could not load profile.' });
  }
});

// GET /api/reviewable-books?q= — books I've bought (for the review picker)
router.get('/reviewable-books', (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    res.json(db.getReviewableBooks(req.session.memberId, (req.query.q || '').trim() || null));
  } catch (err) {
    console.error('[reviewable-books] error:', err);
    res.status(500).json({ error: 'Could not load.' });
  }
});

// GET /api/reviews?q= — all reviews (newest first), optional smart search
router.get('/reviews', (req, res) => {
  try {
    res.json(db.getReviews((req.query.q || '').trim() || null));
  } catch (err) {
    console.error('[reviews] error:', err);
    res.status(500).json({ error: 'Could not load reviews.' });
  }
});

// POST /api/reviews — post a review (buyers only). Body: { bookId, rating, body }
router.post('/reviews', express.json(), (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Please log in to review.' });
    const bookId = Number(req.body.bookId);
    const rating = Number(req.body.rating);
    const body = (req.body.body || '').trim();

    if (!bookId) return res.status(400).json({ error: 'Please pick a book you\'ve read.' });
    if (!db.hasBoughtBook(req.session.memberId, bookId)) {
      return res.status(403).json({ error: 'You can only review works you\'ve gotten from Phoenix.' });
    }
    if (!(rating >= 1 && rating <= 10)) return res.status(400).json({ error: 'Rating must be 1–10.' });
    if (!body) return res.status(400).json({ error: 'Please write a few words.' });
    if (body.length > 3000) return res.status(400).json({ error: 'Review is too long.' });

    db.upsertReview(req.session.memberId, bookId, rating, body);
    res.json({ ok: true });
  } catch (err) {
    console.error('[reviews POST] error:', err);
    res.status(500).json({ error: 'Could not post your review.' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/member/:handle/follow — toggle following (must be logged in)
// ----------------------------------------------------------------------------
router.post('/member/:handle/follow', express.json(), (req, res) => {
  try {
    if (!req.session.memberId) {
      return res.status(401).json({ error: 'Please log in to follow.' });
    }
    const member = db.getMemberProfileByHandle(req.params.handle);
    if (!member) return res.status(404).json({ error: 'No such member.' });
    if (member.id === req.session.memberId) {
      return res.status(400).json({ error: "You can't follow yourself." });
    }
    const nowFollowing = db.toggleFollow(req.session.memberId, member.id);
    res.json({ following: nowFollowing, followers: db.countFollowers(member.id) });
  } catch (err) {
    console.error('[api/member/follow] error:', err);
    res.status(500).json({ error: 'Could not update follow.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/search — search live books with filters
// Query params: q, type, category, price, sort
// ----------------------------------------------------------------------------
router.get('/search', (req, res) => {
  try {
    const results = db.searchBooks({
      q: (req.query.q || '').trim() || null,
      typeId: req.query.type ? Number(req.query.type) : null,
      categoryId: req.query.category ? Number(req.query.category) : null,
      audienceId: req.query.audience ? Number(req.query.audience) : null,
      priceBand: req.query.price || null,
      sort: req.query.sort || 'newest'
    });
    res.json(results);
  } catch (err) {
    console.error('[api/search] error:', err);
    res.status(500).json({ error: 'Search failed.' });
  }
});
// GET /api/dashboard — the logged-in writer's real stats
router.get('/dashboard', (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    const me = db.getMemberById(req.session.memberId);
    res.json({ display_name: me.display_name, ...db.getDashboardStats(req.session.memberId) });
  } catch (err) {
    console.error('[api/dashboard] error:', err);
    res.status(500).json({ error: 'Could not load dashboard.' });
  }
});

// GET /api/my-book/:id — fetch one of MY books for editing
router.get('/my-book/:id', (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    const book = db.getBookForEdit(Number(req.params.id));
    if (!book) return res.status(404).json({ error: 'Not found.' });
    if (book.publisher_id !== req.session.memberId) return res.status(403).json({ error: 'Not your book.' });
    res.json(book);
  } catch (err) {
    console.error('[api/my-book] error:', err);
    res.status(500).json({ error: 'Could not load.' });
  }
});

// POST /api/my-book/:id — save metadata edits (author only)
router.post('/my-book/:id', express.json(), (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    const book = db.getBookForEdit(Number(req.params.id));
    if (!book) return res.status(404).json({ error: 'Not found.' });
    if (book.publisher_id !== req.session.memberId) return res.status(403).json({ error: 'Not your book.' });

    const title = (req.body.title || '').trim();
    const description = (req.body.description || '').trim();
    const isFree = req.body.is_free === true || req.body.is_free === 'yes';
    const priceCents = isFree ? 0 : Math.round(parseFloat(req.body.price) * 100);
    const categoryId = req.body.category_id ? Number(req.body.category_id) : null;

    if (!title) return res.status(400).json({ error: 'Title is required.' });
    if (!isFree && (isNaN(priceCents) || priceCents < 0)) return res.status(400).json({ error: 'Invalid price.' });

    db.updateBookMeta(Number(req.params.id), { title, description, priceCents, categoryId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/my-book POST] error:', err);
    res.status(500).json({ error: 'Could not save.' });
  }
});

// POST /api/my-book/:id/delete — author deletes their own book (retention rule)
router.post('/my-book/:id/delete', express.json(), (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    const book = db.getBookForEdit(Number(req.params.id));
    if (!book) return res.status(404).json({ error: 'Not found.' });
    if (book.publisher_id !== req.session.memberId) return res.status(403).json({ error: 'Not your book.' });

    const result = db.removeOrDeleteBook(Number(req.params.id));  // delete-if-unsold / soft-if-sold
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[api/my-book delete] error:', err);
    res.status(500).json({ error: 'Could not remove.' });
  }
});

// GET /api/my-followers — list of people who follow me
router.get('/my-followers', (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    res.json(db.getFollowers(req.session.memberId));
  } catch (err) {
    console.error('[api/my-followers] error:', err);
    res.status(500).json({ error: 'Could not load followers.' });
  }
});

// POST /api/me/password — change password (logged in). Body: { current, next }
router.post('/me/password', express.json(), async (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });

    const current = req.body.current || '';
    const next = req.body.next || '';

    // Validate the new password.
    if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    if (next === current) return res.status(400).json({ error: 'New password must be different from the current one.' });

    // Verify the current password.
    const hash = db.getPasswordHash(req.session.memberId);
    if (!hash) return res.status(400).json({ error: 'Account not found.' });
    const ok = await bcrypt.compare(current, hash);
    if (!ok) return res.status(400).json({ error: 'Your current password is incorrect.' });

    // Hash and save the new one.
    const newHash = await bcrypt.hash(next, 10);
    db.updatePassword(req.session.memberId, newHash);

    res.json({ ok: true });
  } catch (err) {
    console.error('[api/me/password] error:', err);
    res.status(500).json({ error: 'Could not change your password.' });
  }
});

// POST /api/me/delete — delete (anonymize) my account. Body: { confirmHandle }
router.post('/me/delete', express.json(), (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    const me = db.getMemberById(req.session.memberId);

    // Require the user to type their exact handle to confirm.
    if (!req.body.confirmHandle || req.body.confirmHandle.trim() !== me.handle) {
      return res.status(400).json({ error: 'Please type your exact handle to confirm.' });
    }

    db.deleteAccount(req.session.memberId);

    // End their session.
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  } catch (err) {
    console.error('[api/me/delete] error:', err);
    res.status(500).json({ error: 'Could not delete your account.' });
  }
});

// GET /api/admin/members?search= — all member accounts
router.get('/admin/members', requireAdmin, (req, res) => {
  try {
    res.json({
      members: db.getAllMembersForAdmin((req.query.search || '').trim() || null),
      total: db.countAllMembers()
    });
  } catch (err) {
    console.error('[api/admin/members] error:', err);
    res.status(500).json({ error: 'Could not load members.' });
  }
});

// GET /api/my-following — list of people I follow
router.get('/my-following', (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    res.json(db.getFollowing(req.session.memberId));
  } catch (err) {
    console.error('[api/my-following] error:', err);
    res.status(500).json({ error: 'Could not load following.' });
  }
});
// ----------------------------------------------------------------------------
// POST /api/book/:id/get-free — add a FREE book to your library (no payment)
// ----------------------------------------------------------------------------
router.post('/book/:id/get-free', express.json(), (req, res) => {
  try {
    if (!req.session.memberId) {
      return res.status(401).json({ error: 'Please log in to save this.' });
    }
    const bookId = Number(req.params.id);
    const book = db.getBookForDisplay(bookId);

    if (!book || book.status !== 'live') {
      return res.status(404).json({ error: 'Book not available.' });
    }
    // This route is ONLY for free books. Paid books must go through checkout.
    if (book.price_cents !== 0) {
      return res.status(400).json({ error: 'This work is paid — please buy it.' });
    }

    // Record it as a purchase at price 0 (a "saved" book). Duplicate-safe.
    const added = db.recordPurchase(req.session.memberId, bookId, 0, null);
    res.json({ ok: true, added });   // added=false means already in library
  } catch (err) {
    console.error('[api/get-free] error:', err);
    res.status(500).json({ error: 'Could not add to your library.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/my-library — the logged-in member's purchased books
// ----------------------------------------------------------------------------
router.get('/my-library', (req, res) => {
  try {
    if (!req.session.memberId) {
      return res.status(401).json({ error: 'Not logged in.' });
    }
    res.json(db.getMyPurchases(req.session.memberId));
  } catch (err) {
    console.error('[api/my-library] error:', err);
    res.status(500).json({ error: 'Could not load your library.' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/book/:id/comments — a book's comments
// ----------------------------------------------------------------------------
router.get('/book/:id/comments', (req, res) => {
  try {
    const comments = db.getComments(Number(req.params.id));
    // Tell the page who the viewer is, so it can show edit/delete on their own.
    res.json({ comments, me: req.session.memberId || null });
  } catch (err) {
    console.error('[api/comments] error:', err);
    res.status(500).json({ error: 'Could not load comments.' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/book/:id/comments — post (or edit) your comment (must be logged in)
// ----------------------------------------------------------------------------
router.post('/book/:id/comments', express.json(), (req, res) => {
  try {
    if (!req.session.memberId) {
      return res.status(401).json({ error: 'Please log in to comment.' });
    }
    const body = (req.body.body || '').trim();
    if (!body) {
      return res.status(400).json({ error: 'Comment cannot be empty.' });
    }
    if (body.length > 2000) {
      return res.status(400).json({ error: 'Comment is too long.' });
    }
    db.addComment(req.session.memberId, Number(req.params.id), body);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/comments POST] error:', err);
    res.status(500).json({ error: 'Could not post your comment.' });
  }
});

// ----------------------------------------------------------------------------
// DELETE your own comment (must be logged in)
// ----------------------------------------------------------------------------
router.post('/book/:id/comments/delete', express.json(), (req, res) => {
  try {
    if (!req.session.memberId) {
      return res.status(401).json({ error: 'Not logged in.' });
    }
    db.deleteComment(req.session.memberId, Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/comments delete] error:', err);
    res.status(500).json({ error: 'Could not delete.' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/report — file a report (works logged-in OR anonymous)
// ----------------------------------------------------------------------------
router.post('/report', express.json(), (req, res) => {
  try {
    const { targetType, targetText, reasonChoice, details, name, email } = req.body;

    // Basic validation.
    if (!['member', 'book', 'comment'].includes(targetType)) {
      return res.status(400).json({ error: 'Please choose what you are reporting.' });
    }
    if (!reasonChoice) {
      return res.status(400).json({ error: 'Please choose a reason.' });
    }
    if (!name || !email) {
      return res.status(400).json({ error: 'Please give your name and email.' });
    }

    // If the reporter is logged in, tag their id; otherwise null (anonymous).
    const reporterId = req.session.memberId || null;

    const reportId = db.createReport({
      reporterId,
      name: name.trim(),
      email: email.trim(),
      targetType,
      targetText: (targetText || '').trim(),
      reasonChoice,
      details: (details || '').trim()
    });

    console.log(`[report] New report #${reportId} (${targetType})`);
    res.json({ ok: true, reportId });
  } catch (err) {
    console.error('[api/report] error:', err);
    res.status(500).json({ error: 'Could not submit your report.' });
  }
});

// --- ADMIN: reports (admin-only) -------------------------------------------

// GET /api/admin/reports?status=submitted — list reports
router.get('/admin/reports', requireAdmin, (req, res) => {
  try {
    const reports = db.getReports(req.query.status || 'submitted');
    res.json({ reports, counts: db.getReportCounts() });
  } catch (err) {
    console.error('[api/admin/reports] error:', err);
    res.status(500).json({ error: 'Could not load reports.' });
  }
});

// POST /api/admin/reports/:id — update a report's status
// JSON body: { status: 'reviewing'|'resolved', actionTaken?: string }
router.post('/admin/reports/:id', requireAdmin, express.json(), (req, res) => {
  try {
    const { status, actionTaken } = req.body;
    if (!['submitted', 'reviewing', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    db.updateReportStatus(Number(req.params.id), status, actionTaken);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/admin/reports POST] error:', err);
    res.status(500).json({ error: 'Could not update the report.' });
  }
});

// --- ADMIN: curation (admin-only) ------------------------------------------

router.get('/admin/featured', requireAdmin, (req, res) => {
  try {
    res.json({
      featured: db.getFeaturedForAdmin(),
      candidates: db.getFeatureCandidates((req.query.search || '').trim() || null)
    });
  } catch (err) {
    console.error('[api/admin/featured] error:', err);
    res.status(500).json({ error: 'Could not load curation.' });
  }
});

router.post('/admin/feature', requireAdmin, express.json(), (req, res) => {
  try {
    const { bookId, curatorNote } = req.body;
    if (!bookId) return res.status(400).json({ error: 'Which book?' });
    db.featureBook(Number(bookId), (curatorNote || '').trim());
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/admin/feature] error:', err);
    res.status(500).json({ error: 'Could not feature it.' });
  }
});

router.post('/admin/feature/:id/note', requireAdmin, express.json(), (req, res) => {
  try {
    db.updateCuratorNote(Number(req.params.id), (req.body.note || '').trim());
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/admin/note] error:', err);
    res.status(500).json({ error: 'Could not update note.' });
  }
});

router.post('/admin/unfeature/:id', requireAdmin, express.json(), (req, res) => {
  try {
    db.unfeatureBook(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/admin/unfeature] error:', err);
    res.status(500).json({ error: 'Could not remove.' });
  }
});

// GET /api/admin/books?status=all&search= — all works for content management
router.get('/admin/books', requireAdmin, (req, res) => {
  try {
    res.json({
      books: db.getAllBooksForAdmin(req.query.status || 'all', (req.query.search || '').trim() || null),
      total: db.countAllBooks()
    });
  } catch (err) {
    console.error('[api/admin/books] error:', err);
    res.status(500).json({ error: 'Could not load works.' });
  }
});

// POST /api/admin/book/:id/remove — smart remove (delete if unsold, soft if sold)
router.post('/admin/book/:id/remove', requireAdmin, express.json(), (req, res) => {
  try {
    const result = db.removeOrDeleteBook(Number(req.params.id));
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[api/admin/remove] error:', err);
    res.status(500).json({ error: 'Could not remove.' });
  }
});

// POST /api/admin/book/:id/restore — restore a soft-removed work to live
router.post('/admin/book/:id/restore', requireAdmin, express.json(), (req, res) => {
  try {
    db.setBookStatus(Number(req.params.id), 'live');
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/admin/restore] error:', err);
    res.status(500).json({ error: 'Could not restore.' });
  }
});

// GET /api/me — the logged-in member's full editable profile
router.get('/me', (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    const m = db.getMemberById(req.session.memberId);
  res.json({
      id: m.id, handle: m.handle, display_name: m.display_name, email: m.email,
      tagline: m.tagline, bio: m.bio, avatar_key: m.avatar_key,
      profile_visibility: m.profile_visibility,
      verified: m.verified,
      pref_newsletter: m.pref_newsletter, pref_consider_channel: m.pref_consider_channel,
      pref_consider_newsletter: m.pref_consider_newsletter, pref_notify: m.pref_notify
    });
  } catch (err) {
    console.error('[api/me] error:', err);
    res.status(500).json({ error: 'Could not load your info.' });
  }
});

// POST /api/me — save all editable profile fields
router.post('/me', express.json(), (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    const b = req.body;
    const displayName = (b.display_name || '').trim();
    if (!displayName) return res.status(400).json({ error: 'Name cannot be empty.' });
    if (displayName.length > 80) return res.status(400).json({ error: 'Name too long.' });

    db.updateProfile(req.session.memberId, {
      displayName,
      tagline: (b.tagline || '').trim().slice(0, 160),
      bio: (b.bio || '').trim().slice(0, 1000),
      visibility: b.visibility === 'public' ? 'public' : 'private',
      prefNewsletter: b.pref_newsletter ? 1 : 0,
      prefConsiderChannel: b.pref_consider_channel ? 1 : 0,
      prefConsiderNewsletter: b.pref_consider_newsletter ? 1 : 0,
      prefNotify: b.pref_notify ? 1 : 0
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/me POST] error:', err);
    res.status(500).json({ error: 'Could not save.' });
  }
});
const { sendEmail, emailLayout } = require('../services/email');

// POST /api/forgot-password — request a reset link. Body: { email }
router.post('/forgot-password', express.json(), async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    // ALWAYS respond the same way (don't reveal whether an email is registered).
    const genericOk = { ok: true, message: 'If that email has an account, a reset link is on its way.' };

    if (!email) return res.json(genericOk);
    const member = db.getMemberByEmail(email);

    // Only send if the account exists and isn't deleted.
    if (member && member.deleted !== 1) {
      const token = db.createResetToken(member.id);
      const resetUrl = (process.env.APP_URL || 'http://localhost:3000') + '/reset-password.html?token=' + token;
      await sendEmail({
        to: member.email,
        subject: 'Reset your Phoenix password',
        html: emailLayout(
          '<p style="font-size:16px;line-height:1.6">Hi ' + (member.display_name || 'there').replace(/</g,'&lt;') + ',</p>' +
          '<p style="font-size:16px;line-height:1.6">Someone asked to reset your Phoenix password. If it was you, click below. The link works once and expires in an hour.</p>' +
          '<p style="margin:24px 0"><a href="' + resetUrl + '" style="background:#B5462E;color:#FBF9F4;padding:12px 24px;border-radius:2px;text-decoration:none;font-weight:500">Reset my password</a></p>' +
          '<p style="font-size:14px;color:#8A8377;line-height:1.6">If you didn\'t ask for this, you can ignore this email — your password stays the same.</p>'
        )
      });
    }
    res.json(genericOk);  // same response whether or not the email existed
  } catch (err) {
    console.error('[forgot-password] error:', err);
    res.json({ ok: true, message: 'If that email has an account, a reset link is on its way.' });
  }
});

// POST /api/me/send-verification — (re)send the verification email to myself
router.post('/me/send-verification', async (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    const member = db.getMemberById(req.session.memberId);
    if (!member) return res.status(404).json({ error: 'Not found.' });
    if (member.verified === 1) return res.json({ ok: true, alreadyVerified: true });

    const token = db.createVerifyToken(member.id);
    const verifyUrl = (process.env.APP_URL || 'http://localhost:3000') + '/api/verify-email?token=' + token;
    await sendEmail({
      to: member.email,
      subject: 'Verify your Phoenix email',
      html: emailLayout(
        '<p style="font-size:16px;line-height:1.6">Hi ' + (member.display_name || 'there').replace(/</g,'&lt;') + ',</p>' +
        '<p style="font-size:16px;line-height:1.6">Confirm this is your email so we can reach you for password resets, the newsletter, and important notices.</p>' +
        '<p style="margin:24px 0"><a href="' + verifyUrl + '" style="background:#B5462E;color:#FBF9F4;padding:12px 24px;border-radius:2px;text-decoration:none;font-weight:500">Verify my email</a></p>' +
        '<p style="font-size:14px;color:#8A8377;line-height:1.6">This link expires in 24 hours. If you didn\'t sign up for Phoenix, you can ignore this.</p>'
      )
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[send-verification] error:', err);
    res.status(500).json({ error: 'Could not send.' });
  }
});

// GET /api/verify-email?token=... — the link target; verifies then shows a page
router.get('/verify-email', (req, res) => {
  const page = (title, body, color) => `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <link rel="stylesheet" href="/css/tokens.css">
    <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--paper);font-family:var(--font-body);padding:40px}
    .c{max-width:420px;text-align:center}.i{font-size:48px;margin-bottom:16px}h1{font-family:var(--font-display);color:${color};margin:0 0 12px}
    p{color:var(--stone);line-height:1.6;margin:0 0 24px}a{display:inline-block;background:var(--ink);color:var(--paper);padding:12px 24px;border-radius:2px;text-decoration:none}</style>
    </head><body><div class="c"><div class="i">${title.includes('Verified')?'\u2705':'\u26A0\uFE0F'}</div><h1>${title}</h1><p>${body}</p><a href="/members/dashboard.html">Go to your dashboard</a></div></body></html>`;
  try {
    const token = req.query.token;
    const memberId = token ? db.getValidVerifyToken(token) : null;
    if (!memberId) {
      return res.status(400).send(page('Link expired', 'This verification link is invalid or has expired. You can send a fresh one from your profile settings.', 'var(--ember)'));
    }
    db.markVerified(memberId, token);
    res.send(page('Email Verified', 'Thank you \u2014 your email is confirmed. Password resets and the newsletter can now reach you.', 'var(--pine)'));
  } catch (err) {
    console.error('[verify-email] error:', err);
    res.status(500).send('Could not verify.');
  }
});

// POST /api/reset-password — set a new password with a valid token. Body: { token, password }
router.post('/reset-password', express.json(), async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Missing token or password.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const memberId = db.getValidResetToken(token);
    if (!memberId) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });

    const hash = await bcrypt.hash(password, 12);
    db.updatePassword(memberId, hash);
    db.markResetTokenUsed(token);

    res.json({ ok: true });
  } catch (err) {
    console.error('[reset-password] error:', err);
    res.status(500).json({ error: 'Could not reset your password.' });
  }
});
// GET /api/book/:id/has-preview — does this book support a preview (is it a PDF)?
router.get('/book/:id/has-preview', (req, res) => {
  try {
    const book = db.getBookForDownload(Number(req.params.id));
    const canPreview = !!(book && book.status === 'live' && book.manuscript_key && book.manuscript_key.toLowerCase().endsWith('.pdf'));
    res.json({ canPreview });
  } catch (err) {
    res.json({ canPreview: false });
  }
});

// POST /api/me/avatar — upload a profile picture
router.post('/me/avatar', avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    if (!req.file) return res.status(400).json({ error: 'No image.' });

    const memberId = req.session.memberId;
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[req.file.mimetype];
    if (!ext) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Use JPG, PNG, or WebP.' }); }

    const dir = path.join(__dirname, '..', 'public', 'avatars', 'member-' + memberId);
    fs.mkdirSync(dir, { recursive: true });
    fs.readdirSync(dir).forEach(f => fs.unlinkSync(path.join(dir, f)));  // clear old
    const finalPath = path.join(dir, 'avatar' + ext);
    fs.renameSync(req.file.path, finalPath);

    const avatarKey = 'avatars/member-' + memberId + '/avatar' + ext;
    db.setAvatarKey(memberId, avatarKey);
    res.json({ ok: true, avatar_key: avatarKey });
  } catch (err) {
    console.error('[api/me/avatar] error:', err);
    res.status(500).json({ error: 'Could not upload.' });
  }
});

const { sendNewsletter } = require('../services/newsletter');

// GET /api/admin/newsletter/preview — featured works + recipient count (admin)
router.get('/admin/newsletter/preview', requireAdmin, (req, res) => {
  try {
    res.json({
      works: db.getFeaturedForNewsletter(),
      recipientCount: db.countNewsletterRecipients()
    });
  } catch (err) {
    console.error('[newsletter preview] error:', err);
    res.status(500).json({ error: 'Could not load preview.' });
  }
});

// POST /api/admin/newsletter/send — send it (admin)
router.post('/admin/newsletter/send', requireAdmin, express.json(), async (req, res) => {
  try {
    const result = await sendNewsletter();
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    console.error('[newsletter send] error:', err);
    res.status(500).json({ error: 'Could not send the newsletter.' });
  }
});

// GET /api/unsubscribe?token=... — public one-click unsubscribe
router.get('/unsubscribe', (req, res) => {
  const done = req.query.token ? db.unsubscribeByToken(req.query.token) : false;
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/css/tokens.css">
    <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--paper);font-family:var(--font-body);padding:40px;text-align:center}
    .c{max-width:420px}h1{font-family:var(--font-display);margin:0 0 12px}p{color:var(--stone);line-height:1.6}a{color:var(--ember)}</style></head>
    <body><div class="c"><h1>${done ? 'You\'re unsubscribed' : 'Link not recognized'}</h1>
    <p>${done ? 'You won\'t receive the Phoenix newsletter anymore. You can re-enable it any time in your profile settings.' : 'This unsubscribe link is invalid. You can manage your preferences in your profile settings.'}</p>
    <p><a href="/">Return to Phoenix</a></p></div></body></html>`);
});

// GET /api/home-feed — the logged-in member's homepage leaderboards
router.get('/home-feed', (req, res) => {
  try {
    if (!req.session.memberId) return res.status(401).json({ error: 'Not logged in.' });
    const me = db.getMemberById(req.session.memberId);
    res.json({
      display_name: me.display_name,
      curated: db.getFeaturedBooks(),          // your existing featured query
      topEarning: db.getTopEarningBooks(20),
      mostLoved: db.getMostLikedBooks(10),
      mostDiscussed: db.getMostDiscussedBooks(10)
    });
  } catch (err) {
    console.error('[home-feed] error:', err);
    res.status(500).json({ error: 'Could not load your feed.' });
  }
});
// Make this router available to server.js.
module.exports = router;