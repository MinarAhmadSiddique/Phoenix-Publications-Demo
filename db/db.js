

// ============================================================================
// PHOENIX PUBLICATIONS — db.js
// ============================================================================
//
// WHAT THIS FILE IS:
//   This is the ONLY file in Phoenix that talks to the database directly.
//   Everything else (your routes, your pages) calls the functions at the
//   bottom of this file — like getFeaturedBooks() — and never writes SQL.
//
// WHY DO IT THIS WAY (this is the important idea):
//   Think of this file as a *counter* at a library. The shelves (the database)
//   are in the back. Your app doesn't wander into the back and grab books — it
//   asks the person at the counter ("get me the featured books"), and the
//   counter handles the messy details. This matters for two reasons:
//
//     1. Your routes stay clean and readable. A route just says
//        db.getFeaturedBooks() instead of containing a big SQL query.
//
//     2. THE AZURE MOVE. Right now the "shelves in the back" are a SQLite file
//        on your computer. Later they'll be Azure SQL in the cloud. When that
//        day comes, you rewrite the INSIDE of this one file — but the function
//        names (getFeaturedBooks, insertBook...) stay identical, so every route
//        that calls them keeps working untouched. The whole migration is
//        contained to this single file. That is the entire point.
//
// THE LIBRARY WE USE:
//   better-sqlite3 — the simplest, fastest way to use SQLite from Node. It is
//   SYNCHRONOUS, which means queries return their result immediately (no
//   await/async noise). For a file-based database on the same machine this is
//   perfect and keeps the code clean and easy to read.
// ============================================================================
 
 
// --- Bring in the tools we need -------------------------------------------
const Database = require('better-sqlite3'); // the SQLite library
const path = require('path');               // helps build safe file paths
const fs = require('fs');   
               // lets us read the schema file
 
 
// --- Decide WHERE the database file lives ---------------------------------
// We put phoenix.db at the project root (next to server.js). __dirname is the
// folder THIS file is in (/db), so '..' steps up one level to the root.
// (phoenix.db is in .gitignore — it holds real user data and is never committed.)
const DB_PATH = path.join(__dirname, '..', 'phoenix.db');
 
// Where the schema (our blueprint) lives — right next to this file, in /db.
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
 
 
// --- Open the database -----------------------------------------------------
// This line opens phoenix.db. IF THE FILE DOESN'T EXIST YET, better-sqlite3
// CREATES IT automatically. So the very first time you run the app, an empty
// phoenix.db appears. After that, it just opens the existing one.
const db = new Database(DB_PATH);
 
 
// --- Configure the database (settings that must run on every open) ---------
 
// Turn ON foreign-key enforcement. (Remember: SQLite has this OFF by default.
// Our schema also says PRAGMA foreign_keys=ON, but that only applies while the
// schema runs. We must set it here too so it's on for every normal query.)
db.pragma('foreign_keys = ON');
 
// "WAL" mode (Write-Ahead Logging). Don't worry about the details — it just
// makes the database faster and lets reading and writing happen at the same
// time without blocking each other. A safe, standard setting.
db.pragma('journal_mode = WAL');
 
 
// --- Build the tables the FIRST time only ----------------------------------
// We check: does the 'members' table already exist? If NOT, this is a fresh
// database, so we run schema.sql to build all the tables. If it DOES exist,
// we skip this — the tables are already there, no need to rebuild.
function initializeSchema() {
  // Ask the database's internal catalog whether 'members' exists.
  const membersExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='members'")
    .get(); // .get() returns the first matching row, or undefined if none
 
  if (!membersExists) {
    // Fresh database — read the schema file and run the whole thing at once.
    console.log('  [db] First run: building tables from schema.sql...');
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema); // .exec() runs a whole script of SQL statements
    console.log('  [db] Tables created.');
  }
}
 
initializeSchema(); // run the check right now, as the file loads
 
 
// ============================================================================
// THE FUNCTIONS — this is the "counter" your app talks to.
// ----------------------------------------------------------------------------
// A note on how better-sqlite3 works, so the code below makes sense:
//
//   db.prepare("SQL with ? placeholders")  -> makes a reusable query
//      .get(value)   -> returns ONE row (or undefined)
//      .all(value)   -> returns ALL matching rows (an array)
//      .run(value)   -> for INSERT/UPDATE/DELETE; returns info about the change
//
// The "?" marks are PLACEHOLDERS. We never glue user input into the SQL string
// directly — we pass it as a separate value, and the library safely inserts it.
// This prevents "SQL injection" (a classic attack where someone types SQL into
// a form field to hijack your query). Always use ? placeholders. Always.
// ============================================================================
 
 
// --- MEMBERS ---------------------------------------------------------------
 
// Find a member by their email (used at login: look them up, then check password).
function getMemberByEmail(email) {
  return db
    .prepare('SELECT * FROM members WHERE email = ?')
    .get(email);
}
 
// Find a member by their public handle (used on profile pages, /@handle).
function getMemberProfileByHandle(handle) {
  return db.prepare(`
    SELECT id, handle, display_name, tagline, bio, avatar_key, profile_visibility, created_at
    FROM members WHERE handle = ?
  `).get(handle);
}
 
// Find a member by id.
function getMemberById(id) {
  return db
    .prepare('SELECT * FROM members WHERE id = ?')
    .get(id);
}
 
// Create a new member (used at signup). We pass the ALREADY-HASHED password —
// hashing happens in the auth route, never here. Returns the new member's id.
function createMember(handle, displayName, email, passwordHash) {
  const result = db
    .prepare(`INSERT INTO members (handle, display_name, email, password_hash)
              VALUES (?, ?, ?, ?)`)
    .run(handle, displayName, email, passwordHash);
  // .lastInsertRowid is the id the database auto-assigned to the new row.
  return result.lastInsertRowid;
}
 // Find a member by their handle (full row — used for auth/lookups).
function getMemberByHandle(handle) {
  return db.prepare('SELECT * FROM members WHERE handle = ?').get(handle);
}
 
// --- BOOKS -----------------------------------------------------------------
 
// Get all books published by one member (their shelf / dashboard).
function getBooksByPublisher(publisherId) {
  return db
    .prepare('SELECT * FROM books WHERE publisher_id = ? ORDER BY created_at DESC')
    .all(publisherId);
}
const crypto = require('crypto');  // add near the top if not already required

// Create a password-reset token for a member (valid 1 hour).
function createResetToken(memberId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare("INSERT INTO password_reset_tokens (member_id, token, expires_at) VALUES (?, ?, datetime('now','+1 hour'))")
    .run(memberId, token);
  return token;
}

// Look up a valid (unused, unexpired) reset token -> returns the member_id or null.
function getValidResetToken(token) {
  const row = db.prepare("SELECT member_id FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')").get(token);
  return row ? row.member_id : null;
}

// Mark a token used (after a successful reset).
function markResetTokenUsed(token) {
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);
}
// All members for the admin members tab, with their work + follower counts.
function getAllMembersForAdmin(search) {
  let sql = `
    SELECT m.id, m.handle, m.display_name, m.email, m.is_admin,m.suspended, m.profile_visibility, m.created_at,
           (SELECT COUNT(*) FROM books WHERE publisher_id = m.id AND status IN ('live','removed')) AS works,
           (SELECT COUNT(*) FROM follows WHERE followed_id = m.id) AS followers
    FROM members m
    WHERE 1=1
  `;
  const params = [];
  if (search) {
    sql += ' AND (m.display_name LIKE ? OR m.handle LIKE ? OR m.email LIKE ?)';
    params.push('%'+search+'%', '%'+search+'%', '%'+search+'%');
  }
  sql += ' ORDER BY m.created_at DESC';
  return db.prepare(sql).all(...params);
}

function countAllMembers() {
  return db.prepare('SELECT COUNT(*) AS n FROM members').get().n;
}

// Get the logged-in member's books for their dashboard — with each book's
// category name and like count. Used by /api/my-books.
function getMyBooks(memberId) {
  return db.prepare(`
    SELECT b.id, b.title, b.price_cents, b.status, b.created_at,
           (SELECT c.name FROM categories c
            JOIN book_categories bc ON bc.category_id = c.id
            WHERE bc.book_id = b.id LIMIT 1) AS category,
           (SELECT COUNT(*) FROM likes WHERE book_id = b.id) AS likes,
           (SELECT COUNT(*) FROM purchases WHERE book_id = b.id) AS readers,
           (SELECT COALESCE(SUM(price_cents - commission_cents), 0)
            FROM purchases WHERE book_id = b.id) AS earned_cents
    FROM books b
    WHERE b.publisher_id = ?
    ORDER BY b.created_at DESC
  `).all(memberId);
}
 
// Get a single book by id (the book detail page).
function getBookById(id) {
  return db
    .prepare('SELECT * FROM books WHERE id = ?')
    .get(id);
}

// --- COMMENTS --------------------------------------------------------------

// Get a book's comments, newest first, with each author's name and handle.
function getComments(bookId) {
  return db.prepare(`
    SELECT c.id, c.body, c.created_at, c.edited_at, c.member_id,
           m.display_name AS author, m.handle
    FROM comments c
    JOIN members m ON m.id = c.member_id
    WHERE c.book_id = ?
    ORDER BY c.created_at DESC
  `).all(bookId);
}

// Add or update a member's comment on a book (one per member per book).
// If they already commented, this EDITS it (sets edited_at); otherwise inserts.
function addComment(memberId, bookId, body) {
  const existing = db.prepare('SELECT id FROM comments WHERE member_id = ? AND book_id = ?').get(memberId, bookId);
  if (existing) {
    db.prepare("UPDATE comments SET body = ?, edited_at = datetime('now') WHERE id = ?").run(body, existing.id);
  } else {
    db.prepare('INSERT INTO comments (member_id, book_id, body) VALUES (?, ?, ?)').run(memberId, bookId, body);
  }
}

// Delete a member's own comment (they can only delete their own).
function deleteComment(memberId, bookId) {
  db.prepare('DELETE FROM comments WHERE member_id = ? AND book_id = ?').run(memberId, bookId);
}
 
// Create a new book. It starts as 'pending' (per the schema default), so it
// waits for your safety review before going live. Returns the new book's id.
function insertBook(publisherId, contentTypeId, title, description, priceCents, manuscriptKey, coverKey, fileHash) {
  const result = db
    .prepare(`INSERT INTO books
                (publisher_id, content_type_id, title, description,
                 price_cents, manuscript_key, cover_key, file_hash)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(publisherId, contentTypeId, title, description, priceCents, manuscriptKey, coverKey, fileHash);
  return result.lastInsertRowid;
}

// --- ADMIN REVIEW (the approval queue) -------------------------------------

// Books awaiting review (status 'pending'), with publisher + category, oldest
// first (fairest — first submitted, first reviewed).
function getPendingBooks() {
  return db.prepare(`
    SELECT b.id, b.title, b.description, b.price_cents, b.created_at,
           m.display_name AS publisher, m.handle,
           (SELECT c.name FROM categories c
            JOIN book_categories bc ON bc.category_id = c.id
            WHERE bc.book_id = b.id LIMIT 1) AS category
    FROM books b
    JOIN members m ON m.id = b.publisher_id
    WHERE b.status = 'pending'
    ORDER BY b.created_at ASC
  `).all();
}

// Change a book's status (approve -> 'live', reject -> 'rejected').
function setBookStatus(bookId, status) {
  const allowed = ['pending', 'live', 'rejected', 'removed'];
  if (!allowed.includes(status)) throw new Error('Invalid status: ' + status);
  db.prepare('UPDATE books SET status = ? WHERE id = ?').run(status, bookId);
}

// Get one book with everything the detail page needs: publisher, type,
// category, audience, and like count. Returns undefined if no such book.
function getBookForDisplay(bookId) {
  return db.prepare(`
    SELECT b.id, b.title, b.description, b.price_cents, b.cover_key, b.status, b.created_at,
           m.display_name AS publisher, m.handle, m.bio AS publisher_bio,
           ct.name AS content_type,
           (SELECT c.name FROM categories c JOIN book_categories bc ON bc.category_id = c.id
            WHERE bc.book_id = b.id LIMIT 1) AS category,
           (SELECT a.name FROM audiences a JOIN book_audiences ba ON ba.audience_id = a.id
            WHERE ba.book_id = b.id LIMIT 1) AS audience,
           (SELECT COUNT(*) FROM likes WHERE book_id = b.id) AS likes
    FROM books b
    JOIN members m ON m.id = b.publisher_id
    JOIN content_types ct ON ct.id = b.content_type_id
    WHERE b.id = ?
  `).get(bookId);
}

// Has this member liked this book? (for showing the like button's state)
function hasLiked(memberId, bookId) {
  const row = db.prepare('SELECT 1 FROM likes WHERE member_id = ? AND book_id = ?').get(memberId, bookId);
  return !!row;  // true if a row exists, false otherwise
}
 
// Create a book AND its category/audience links together, in a transaction
// (all-or-nothing: if any insert fails, none happen). Used by the publish flow.
// Keys (manuscript/cover) are filled in later, after files are saved, so we
// insert NULL for them here. Takes a single `data` object. Returns the new id.
const createBook = db.transaction((data) => {
  // 1. Insert the book. status defaults to 'pending'. Keys NULL for now.
  const result = db.prepare(`
    INSERT INTO books
      (publisher_id, content_type_id, title, description, price_cents,
       manuscript_key, cover_key, file_hash,
       feature_on_youtube, feature_in_newsletter)
    VALUES (?, ?, ?, ?, ?, 'pending', 'pending', 'pending', ?, ?)
  `).run(
    data.publisherId, data.contentTypeId, data.title, data.description,
    data.priceCents, data.featureYoutube, data.featureNewsletter
  );
  const bookId = result.lastInsertRowid;

  // 2. Link the chosen category and audience (the join rows).
  db.prepare('INSERT INTO book_categories (book_id, category_id) VALUES (?, ?)')
    .run(bookId, data.categoryId);
  db.prepare('INSERT INTO book_audiences (book_id, audience_id) VALUES (?, ?)')
    .run(bookId, data.audienceId);

  return bookId;
});

// Fill in a book's file keys after the files are saved (Stage 3c).
function updateBookKeys(bookId, manuscriptKey, coverKey, fileHash) {
  db.prepare('UPDATE books SET manuscript_key = ?, cover_key = ?, file_hash = ? WHERE id = ?')
    .run(manuscriptKey, coverKey, fileHash, bookId);
} 

// --- FEATURED (the curated front — the homepage) ---------------------------
 
// Get the featured works for the homepage, in order, with their publisher and
// curator note. This is a JOIN: it stitches together three tables —
//   featured  (the slot + note)  ->  books (the work)  ->  members (the author)
// We only show works that are 'live' and whose feature hasn't expired.
function getFeaturedBooks() {
  return db
    .prepare(`
      SELECT b.id, b.title, b.description, b.price_cents, b.cover_key,
             m.display_name AS publisher, m.handle,
             f.curator_note, f.position
      FROM featured f
      JOIN books b   ON b.id = f.book_id
      JOIN members m ON m.id = b.publisher_id
      WHERE b.status = 'live'
        AND (f.featured_until IS NULL OR f.featured_until > datetime('now'))
      ORDER BY f.position ASC
    `)
    .all();
}
 
 
// --- LIKES (the one-per-member pattern in action) --------------------------
 
// How many likes does a book have? We COUNT the rows (remember: no count column;
// each like is a row).
function countLikes(bookId) {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM likes WHERE book_id = ?')
    .get(bookId);
  return row.n;
}
 
// Add a like. If this member already liked this book, the UNIQUE constraint
// would normally throw an error — "INSERT OR IGNORE" tells SQLite to quietly do
// nothing in that case instead. So liking twice is harmless.
function addLike(memberId, bookId) {
  db.prepare('INSERT OR IGNORE INTO likes (member_id, book_id) VALUES (?, ?)')
    .run(memberId, bookId);
}
 
// Remove a like (un-like). Just delete the row.
function removeLike(memberId, bookId) {
  db.prepare('DELETE FROM likes WHERE member_id = ? AND book_id = ?')
    .run(memberId, bookId);
}

// Save a member's 2FA secret (during enrollment).
function setTotpSecret(memberId, secret) {
  db.prepare('UPDATE members SET totp_secret = ? WHERE id = ?').run(secret, memberId);
}

// --- PROFILES & FOLLOWS ----------------------------------------------------

// A member's public profile by handle (or undefined if no such handle).

// A member's books for their profile. If `includeAll` is true (the owner viewing
// their own profile), returns every status; otherwise only 'live' (public view).
function getBooksForProfile(publisherId, includeAll) {
  if (includeAll) {
    return db.prepare(`
      SELECT id, title, price_cents, status, cover_key
      FROM books WHERE publisher_id = ? ORDER BY created_at DESC
    `).all(publisherId);
  }
  return db.prepare(`
    SELECT id, title, price_cents, status, cover_key
    FROM books WHERE publisher_id = ? AND status = 'live' ORDER BY created_at DESC
  `).all(publisherId);
}

// Follower count for a member.
function countFollowers(memberId) {
  return db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followed_id = ?').get(memberId).n;
}

// Does follower already follow followed?
function isFollowing(followerId, followedId) {
  return !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?').get(followerId, followedId);
}

// Toggle a follow. Returns the new state (true = now following).
function toggleFollow(followerId, followedId) {
  if (followerId === followedId) return false;  // can't follow yourself
  if (isFollowing(followerId, followedId)) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?').run(followerId, followedId);
    return false;
  } else {
    db.prepare('INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)').run(followerId, followedId);
    return true;
  }
}

// --- SEARCH ----------------------------------------------------------------
// Search live books with optional filters. `opts` can have:
//   q         - text to match in title/description
//   typeId    - content_type_id to filter by
//   categoryId- category id to filter by
//   priceBand - 'free' | 'under5' | '5to10' | 'over10'
//   sort      - 'newest' | 'likes' | 'price_low' | 'price_high'
function searchBooks(opts = {}) {
  let sql = `
    SELECT b.id, b.title, b.description, b.price_cents, b.status, b.created_at, b.cover_key,
           m.display_name AS publisher, m.handle,
           ct.name AS content_type,
           (SELECT COUNT(*) FROM likes WHERE book_id = b.id) AS likes,
           (SELECT c.name FROM categories c JOIN book_categories bc ON bc.category_id = c.id
            WHERE bc.book_id = b.id LIMIT 1) AS category
    FROM books b
    JOIN members m ON m.id = b.publisher_id
    JOIN content_types ct ON ct.id = b.content_type_id
    WHERE b.status = 'live'
  `;
  const params = [];

 if (opts.q) {
    sql += ' AND (b.title LIKE ? OR b.description LIKE ? OR m.display_name LIKE ? OR m.handle LIKE ?)';
    const like = '%' + opts.q + '%';
    params.push(like, like, like, like);
  }
  if (opts.typeId) {
    sql += ' AND b.content_type_id = ?';
    params.push(opts.typeId);
  }
  if (opts.categoryId) {
    sql += ' AND EXISTS (SELECT 1 FROM book_categories bc WHERE bc.book_id = b.id AND bc.category_id = ?)';
    params.push(opts.categoryId);
  }
  if (opts.priceBand === 'free')   sql += ' AND b.price_cents = 0';
  if (opts.priceBand === 'under5') sql += ' AND b.price_cents > 0 AND b.price_cents < 500';
  if (opts.priceBand === '5to10')  sql += ' AND b.price_cents >= 500 AND b.price_cents <= 1000';
  if (opts.priceBand === 'over10') sql += ' AND b.price_cents > 1000';

  if (opts.categoryId) {
    sql += ' AND EXISTS (SELECT 1 FROM book_categories bc WHERE bc.book_id = b.id AND bc.category_id = ?)';
    params.push(opts.categoryId);
  }
  if (opts.audienceId) {
    sql += ' AND EXISTS (SELECT 1 FROM book_audiences ba WHERE ba.book_id = b.id AND ba.audience_id = ?)';
    params.push(opts.audienceId);
  }

  const orders = {
    newest: 'b.created_at DESC',
    likes: 'likes DESC',
    price_low: 'b.price_cents ASC',
    price_high: 'b.price_cents DESC'
  };
  sql += ' ORDER BY ' + (orders[opts.sort] || 'b.created_at DESC');

  return db.prepare(sql).all(...params);
}

// --- PURCHASES -------------------------------------------------------------

// Record a purchase. Snapshots the price AND our 4% commission at sale time
// (so history stays accurate even if the price changes later). INSERT OR IGNORE
// + the UNIQUE(buyer_id,book_id) constraint means a duplicate webhook is safely
// ignored (a member owns a book at most once). Returns true if newly recorded.
function recordPurchase(buyerId, bookId, priceCents, stripePaymentId) {
  const commissionCents = Math.round(priceCents * 0.04);  // Phoenix's 4%
  const result = db.prepare(`
    INSERT OR IGNORE INTO purchases (buyer_id, book_id, price_cents, commission_cents, stripe_payment_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(buyerId, bookId, priceCents, commissionCents, stripePaymentId);
  return result.changes > 0;   // true = newly inserted, false = already owned
}

// Has this member already bought this book?
function hasPurchased(memberId, bookId) {
  return !!db.prepare('SELECT 1 FROM purchases WHERE buyer_id = ? AND book_id = ?').get(memberId, bookId);
}

// Get the info needed to decide if someone may download a book:
// the publisher, price, manuscript key, and status.
function getBookForDownload(bookId) {
  return db.prepare(`
    SELECT id, publisher_id, price_cents, manuscript_key, status, title
    FROM books WHERE id = ?
  `).get(bookId);
}

// Get the books a member has purchased (their library), newest first, with
// author, type, cover, and what/when they paid.
function getMyPurchases(memberId) {
  return db.prepare(`
    SELECT b.id, b.title, b.cover_key,
           m.display_name AS publisher, m.handle,
           ct.name AS content_type,
           p.price_cents AS paid_cents, p.created_at AS purchased_at
    FROM purchases p
    JOIN books b ON b.id = p.book_id
    JOIN members m ON m.id = b.publisher_id
    JOIN content_types ct ON ct.id = b.content_type_id
    WHERE p.buyer_id = ?
    ORDER BY p.created_at DESC
  `).all(memberId);
}

// --- REPORTS ---------------------------------------------------------------

// File a report. reporterId is null for logged-out reporters. The target
// reference and details are folded into the reason text (the table has no
// separate details column, and target_id must be an int — we use 0 as a
// "see the text" placeholder for free-text targets).
function createReport({ reporterId, name, email, targetType, targetText, reasonChoice, details }) {
  let reason = reasonChoice;
  if (targetText) reason += ' | Target: ' + targetText;
  if (details)    reason += ' | Details: ' + details;

  const result = db.prepare(`
    INSERT INTO reports (reporter_id, reporter_name, reporter_email, target_type, target_id, reason)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(reporterId, name, email, targetType, reason);
  return result.lastInsertRowid;
}

// Get reports, optionally filtered by status ('submitted'/'reviewing'/'resolved'/'all').
function getReports(status) {
  let sql = `
    SELECT id, reporter_name, reporter_email, target_type, target_id,
           reason, status, action_taken, created_at, resolved_at
    FROM reports
  `;
  const params = [];
  if (status && status !== 'all') {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params);
}

// Update a report's status, recording the action taken when resolving.
function updateReportStatus(reportId, status, actionTaken) {
  if (status === 'resolved') {
    db.prepare(`UPDATE reports SET status = ?, action_taken = ?, resolved_at = datetime('now') WHERE id = ?`)
      .run(status, actionTaken || null, reportId);
  } else {
    db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, reportId);
  }
}

// Counts per status (for the filter tab badges).
function getReportCounts() {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM reports GROUP BY status').all();
  const counts = { submitted: 0, reviewing: 0, resolved: 0 };
  rows.forEach(r => { counts[r.status] = r.n; });
  return counts;
}

// --- CURATION / FEATURING (admin) ------------------------------------------

// Currently featured works, in display order, with title + publisher.
function getFeaturedForAdmin() {
  return db.prepare(`
    SELECT f.id AS feature_id, f.book_id, f.position, f.curator_note, f.featured_until,
           b.title, b.price_cents, m.display_name AS publisher, m.handle
    FROM featured f
    JOIN books b ON b.id = f.book_id
    JOIN members m ON m.id = b.publisher_id
    ORDER BY f.position ASC
  `).all();
}

// Live works NOT currently featured — candidates to lift up.
// Sorted by fewest readers first (surface promising work with little attention).
function getFeatureCandidates(search) {
  let sql = `
    SELECT b.id, b.title, b.price_cents, m.display_name AS publisher,
           ct.name AS content_type,
           (SELECT c.name FROM categories c JOIN book_categories bc ON bc.category_id=c.id WHERE bc.book_id=b.id LIMIT 1) AS category,
           (SELECT COUNT(*) FROM purchases WHERE book_id=b.id) AS readers
    FROM books b
    JOIN members m ON m.id = b.publisher_id
    JOIN content_types ct ON ct.id = b.content_type_id
    WHERE b.status = 'live' AND b.id NOT IN (SELECT book_id FROM featured)
  `;
  const params = [];
  if (search) {
    sql += ' AND (b.title LIKE ? OR m.display_name LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }
  sql += ' ORDER BY readers ASC, b.created_at DESC';
  return db.prepare(sql).all(...params);
}

// Feature a book (adds it to the front). Position = next available.
function featureBook(bookId, curatorNote) {
  const max = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM featured').get().m;
  db.prepare('INSERT INTO featured (book_id, position, curator_note) VALUES (?, ?, ?)')
    .run(bookId, max + 1, curatorNote || null);
}

// Update a featured work's curator note.
function updateCuratorNote(featureId, note) {
  db.prepare('UPDATE featured SET curator_note = ? WHERE id = ?').run(note || null, featureId);
}

// Remove a work from the front.
function unfeatureBook(featureId) {
  db.prepare('DELETE FROM featured WHERE id = ?').run(featureId);
}

// All works for the admin content page, filterable by status + search.
// status: 'all' | 'live' | 'pending' | 'removed' | 'rejected' | 'featured'
function getAllBooksForAdmin(status, search) {
  let sql = `
    SELECT b.id, b.title, b.price_cents, b.status,
           m.display_name AS publisher, m.handle,
           ct.name AS content_type,
           (SELECT c.name FROM categories c JOIN book_categories bc ON bc.category_id=c.id WHERE bc.book_id=b.id LIMIT 1) AS category,
           (SELECT COUNT(*) FROM purchases WHERE book_id=b.id) AS sales,
           EXISTS(SELECT 1 FROM featured WHERE book_id=b.id) AS is_featured
    FROM books b
    JOIN members m ON m.id = b.publisher_id
    JOIN content_types ct ON ct.id = b.content_type_id
    WHERE 1=1
  `;
  const params = [];
  if (status === 'featured') {
    sql += ' AND EXISTS(SELECT 1 FROM featured WHERE book_id=b.id)';
  } else if (status && status !== 'all') {
    sql += ' AND b.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (b.title LIKE ? OR m.display_name LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }
  sql += ' ORDER BY b.created_at DESC';
  return db.prepare(sql).all(...params);
}

// Total works count (for the header).
function countAllBooks() {
  return db.prepare('SELECT COUNT(*) AS n FROM books').get().n;
}
// --- TAXONOMY (for populating the publish form's dropdowns) ----------------

// Smart remove: ZERO purchases -> delete permanently (record + related rows +
// files). HAS purchases -> soft-remove (status='removed') so buyers keep access.
function removeOrDeleteBook(bookId) {
  const purchaseCount = db.prepare('SELECT COUNT(*) AS n FROM purchases WHERE book_id = ?').get(bookId).n;

  if (purchaseCount === 0) {
    const book = db.prepare('SELECT manuscript_key, cover_key FROM books WHERE id = ?').get(bookId);

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM book_categories WHERE book_id = ?').run(bookId);
      db.prepare('DELETE FROM book_audiences WHERE book_id = ?').run(bookId);
      db.prepare('DELETE FROM likes WHERE book_id = ?').run(bookId);
      db.prepare('DELETE FROM comments WHERE book_id = ?').run(bookId);
      db.prepare('DELETE FROM featured WHERE book_id = ?').run(bookId);
      db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
    });
    tx();

    if (book) {
      [book.manuscript_key, book.cover_key].forEach(key => {
        if (key && key !== 'none' && key !== 'pending') {
          try {
            const filePath = path.join(__dirname, '..', key);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              const dir = path.dirname(filePath);
              if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
            }
          } catch (e) { console.error('[removeBook] file delete failed:', e.message); }
        }
      });
    }
    return { deleted: true };
  } else {
    db.prepare("UPDATE books SET status = 'removed' WHERE id = ?").run(bookId);
    db.prepare('DELETE FROM featured WHERE book_id = ?').run(bookId);
    return { deleted: false, buyers: purchaseCount };
  }
}

// Update a member's editable profile fields.
function updateProfile(memberId, data) {
  db.prepare(`
    UPDATE members SET
      display_name = ?, tagline = ?, bio = ?, profile_visibility = ?,
      pref_newsletter = ?, pref_consider_channel = ?, pref_consider_newsletter = ?, pref_notify = ?,
      edited_at = datetime('now')
    WHERE id = ?
  `).run(
    data.displayName, data.tagline, data.bio, data.visibility,
    data.prefNewsletter, data.prefConsiderChannel, data.prefConsiderNewsletter, data.prefNotify,
    memberId
  );
}
function setAvatarKey(memberId, avatarKey) {
  db.prepare('UPDATE members SET avatar_key = ? WHERE id = ?').run(avatarKey, memberId);
}

// --- DASHBOARD STATS -------------------------------------------------------

// Aggregate stats for a writer's dashboard.
function getDashboardStats(memberId) {
  const works = db.prepare("SELECT COUNT(*) AS n FROM books WHERE publisher_id = ? AND status IN ('live','removed')").get(memberId).n;
  const readers = db.prepare("SELECT COUNT(*) AS n FROM purchases p JOIN books b ON b.id=p.book_id WHERE b.publisher_id = ?").get(memberId).n;
  const followers = db.prepare("SELECT COUNT(*) AS n FROM follows WHERE followed_id = ?").get(memberId).n;
  const following = db.prepare("SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?").get(memberId).n;
  const earned = db.prepare("SELECT COALESCE(SUM(p.price_cents - p.commission_cents),0) AS c FROM purchases p JOIN books b ON b.id=p.book_id WHERE b.publisher_id = ?").get(memberId).c;
  const featured = db.prepare("SELECT COUNT(*) AS n FROM featured f JOIN books b ON b.id=f.book_id WHERE b.publisher_id = ?").get(memberId).n;
  return { works, readers, followers, following, earned_cents: earned, featured };
}

// Per-book readers + earnings for the dashboard works table.
function getBookStatsForPublisher(bookId) {
  return db.prepare("SELECT COUNT(*) AS readers, COALESCE(SUM(price_cents - commission_cents),0) AS earned_cents FROM purchases WHERE book_id = ?").get(bookId);
}

// --- FOLLOWERS / FOLLOWING LISTS -------------------------------------------

// People who follow this member.
function getFollowers(memberId) {
  return db.prepare(`
    SELECT m.handle, m.display_name, m.tagline, m.avatar_key, f.created_at
    FROM follows f JOIN members m ON m.id = f.follower_id
    WHERE f.followed_id = ?
    ORDER BY f.created_at DESC
  `).all(memberId);
}

// People this member follows.
function getFollowing(memberId) {
  return db.prepare(`
    SELECT m.handle, m.display_name, m.tagline, m.avatar_key, f.created_at
    FROM follows f JOIN members m ON m.id = f.followed_id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
  `).all(memberId);
}
// Delete (anonymize) a member account — Approach A.
// - Unsold books: permanently deleted (record + files).
// - Sold books: soft-removed (kept for buyers), author becomes "Former member".
// - The member row is anonymized (personal data scrubbed), not deleted, so
//   kept books and the member's own purchase history still have a valid anchor.
function deleteAccount(memberId) {
  const member = db.prepare('SELECT avatar_key FROM members WHERE id = ?').get(memberId);

  const tx = db.transaction(() => {
    // 1. Handle each published book per the retention rule.
    const books = db.prepare('SELECT id, manuscript_key, cover_key FROM books WHERE publisher_id = ?').all(memberId);
    for (const b of books) {
      const purchases = db.prepare('SELECT COUNT(*) AS n FROM purchases WHERE book_id = ?').get(b.id).n;
      if (purchases === 0) {
        // Unsold — delete permanently (record + related rows).
        db.prepare('DELETE FROM book_categories WHERE book_id = ?').run(b.id);
        db.prepare('DELETE FROM book_audiences WHERE book_id = ?').run(b.id);
        db.prepare('DELETE FROM likes WHERE book_id = ?').run(b.id);
        db.prepare('DELETE FROM comments WHERE book_id = ?').run(b.id);
        db.prepare('DELETE FROM featured WHERE book_id = ?').run(b.id);
        db.prepare('DELETE FROM books WHERE id = ?').run(b.id);
        // delete its files
        _deleteBookFiles(b.manuscript_key, b.cover_key);
      } else {
        // Sold — keep for buyers, remove from public, unfeature.
        db.prepare("UPDATE books SET status = 'removed' WHERE id = ?").run(b.id);
        db.prepare('DELETE FROM featured WHERE book_id = ?').run(b.id);
      }
    }

    // 2. Remove the member's social footprint (as an actor).
    db.prepare('DELETE FROM follows WHERE follower_id = ? OR followed_id = ?').run(memberId, memberId);
    db.prepare('DELETE FROM likes WHERE member_id = ?').run(memberId);
    db.prepare('DELETE FROM comments WHERE member_id = ?').run(memberId);

    // 3. Anonymize the member row (scrub personal data, keep the row).
    //    email + handle must stay unique/non-null -> placeholders.
    db.prepare(`
      UPDATE members SET
        handle = 'deleted_' || id,
        display_name = 'Former member',
        email = 'deleted-' || id || '@deleted.invalid',
        password_hash = '',
        bio = NULL,
        tagline = NULL,
        avatar_key = NULL,
        profile_visibility = 'private',
        totp_secret = NULL,
        deleted = 1
      WHERE id = ?
    `).run(memberId);
  });
  tx();

  // 4. Delete the avatar file (outside the transaction).
  if (member && member.avatar_key && member.avatar_key !== 'none') {
    try {
      const p = path.join(__dirname, '..', 'public', member.avatar_key);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) { console.error('[deleteAccount] avatar delete failed:', e.message); }
  }
}

// Helper: delete a book's files from disk.
function _deleteBookFiles(manuscriptKey, coverKey) {
  [manuscriptKey, coverKey].forEach(key => {
    if (key && key !== 'none' && key !== 'pending') {
      try {
        const filePath = path.join(__dirname, '..', key);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          const dir = path.dirname(filePath);
          if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
        }
      } catch (e) { console.error('[deleteBookFiles] failed:', e.message); }
    }
  });
}

// Update a book's metadata (author-editable fields). Ownership is checked in
// the route. Does NOT change status (metadata edits don't need re-review) and
// does NOT touch the manuscript.
function updateBookMeta(bookId, { title, description, priceCents, categoryId }) {
  db.prepare('UPDATE books SET title = ?, description = ?, price_cents = ? WHERE id = ?')
    .run(title, description, priceCents, bookId);
  // Update the category link if provided.
  if (categoryId) {
    db.prepare('DELETE FROM book_categories WHERE book_id = ?').run(bookId);
    db.prepare('INSERT INTO book_categories (book_id, category_id) VALUES (?, ?)').run(bookId, categoryId);
  }
}

// Get one book for its author to edit (includes current category).
function getBookForEdit(bookId) {
  return db.prepare(`
    SELECT b.id, b.publisher_id, b.content_type_id, b.title, b.description,
           b.price_cents, b.cover_key, b.status,
           (SELECT category_id FROM book_categories WHERE book_id = b.id LIMIT 1) AS category_id
    FROM books b WHERE b.id = ?
  `).get(bookId);
}

// Get a member's password hash (for verifying the current password).
function getPasswordHash(memberId) {
  const row = db.prepare('SELECT password_hash FROM members WHERE id = ?').get(memberId);
  return row ? row.password_hash : null;
}

// Update a member's password (receives the ALREADY-HASHED new password —
// hashing happens in the route, matching how createMember works).
function updatePassword(memberId, newHash) {
  db.prepare("UPDATE members SET password_hash = ?, edited_at = datetime('now') WHERE id = ?")
    .run(newHash, memberId);
}

// --- ADMIN: member moderation ----------------------------------------------

// Suspend or restore a member (reversible). Suspended = can't log in, hidden.
function setMemberSuspended(memberId, suspended) {
  db.prepare('UPDATE members SET suspended = ? WHERE id = ?').run(suspended ? 1 : 0, memberId);
}

// --- ADMIN: comment moderation ---------------------------------------------

// All comments for the admin view, with author + book context.
function getAllCommentsForAdmin(search) {
  let sql = `
    SELECT c.id, c.body, c.created_at, c.edited_at,
           m.handle AS author_handle, m.display_name AS author_name,
           b.id AS book_id, b.title AS book_title
    FROM comments c
    JOIN members m ON m.id = c.member_id
    JOIN books b ON b.id = c.book_id
    WHERE 1=1
  `;
  const params = [];
  if (search) {
    sql += ' AND (c.body LIKE ? OR m.display_name LIKE ? OR b.title LIKE ?)';
    params.push('%'+search+'%', '%'+search+'%', '%'+search+'%');
  }
  sql += ' ORDER BY c.created_at DESC';
  return db.prepare(sql).all(...params);
}

function deleteCommentAsAdmin(commentId) {
  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
}

function countAllComments() {
  return db.prepare('SELECT COUNT(*) AS n FROM comments').get().n;
}

// Create an email-verification token (valid 24 hours).
function createVerifyToken(memberId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare("INSERT INTO email_verify_tokens (member_id, token, expires_at) VALUES (?, ?, datetime('now','+24 hours'))")
    .run(memberId, token);
  return token;
}

// Validate a verify token -> member_id or null.
function getValidVerifyToken(token) {
  const row = db.prepare("SELECT member_id FROM email_verify_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')").get(token);
  return row ? row.member_id : null;
}

// Mark a member verified + burn the token.
function markVerified(memberId, token) {
  db.prepare('UPDATE members SET verified = 1 WHERE id = ?').run(memberId);
  db.prepare('UPDATE email_verify_tokens SET used = 1 WHERE token = ?').run(token);
}

// --- NEWSLETTER --------------------------------------------------------------

// Eligible newsletter recipients: opted in, verified, active. Ensures each has
// an unsubscribe token (backfills if missing).
function getNewsletterRecipients() {
  const rows = db.prepare(`
    SELECT id, display_name, email, unsubscribe_token
    FROM members
    WHERE pref_newsletter = 1 AND verified = 1
      AND COALESCE(deleted,0) = 0 AND COALESCE(suspended,0) = 0
  `).all();
  // Safety: make sure everyone has an unsubscribe token.
  const setTok = db.prepare('UPDATE members SET unsubscribe_token = ? WHERE id = ?');
  for (const r of rows) {
    if (!r.unsubscribe_token) {
      r.unsubscribe_token = crypto.randomBytes(24).toString('base64url');
      setTok.run(r.unsubscribe_token, r.id);
    }
  }
  return rows;
}

// Count eligible recipients (for the admin preview).
function countNewsletterRecipients() {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM members
    WHERE pref_newsletter = 1 AND verified = 1
      AND COALESCE(deleted,0) = 0 AND COALESCE(suspended,0) = 0
  `).get().n;
}

// The featured works to include in the newsletter (currently featured, live).
function getFeaturedForNewsletter() {
  return db.prepare(`
    SELECT b.id, b.title, b.description, b.price_cents, b.cover_key,
           m.display_name AS author, m.handle, f.curator_note
    FROM featured f
    JOIN books b ON b.id = f.book_id
    JOIN members m ON m.id = b.publisher_id
    WHERE b.status = 'live'
    ORDER BY f.position
  `).all();
}

// Turn off a member's newsletter subscription by their unsubscribe token.
function unsubscribeByToken(token) {
  const info = db.prepare('UPDATE members SET pref_newsletter = 0 WHERE unsubscribe_token = ?').run(token);
  return info.changes > 0;
}

// --- LOGGED-IN HOMEPAGE LEADERBOARDS ----------------------------------------

// Top earning works — ranked by total earnings (price minus commission).
// We return the RANK and the work, but NOT the exact earnings (income stays
// private — the status of ranking is the motivator, not the dollar figure).
function getTopEarningBooks(limit = 20) {
  return db.prepare(`
    SELECT b.id, b.title, b.cover_key, b.price_cents,
           m.display_name AS author, m.handle
    FROM books b
    JOIN members m ON m.id = b.publisher_id
    JOIN purchases p ON p.book_id = b.id
    WHERE b.status = 'live'
    GROUP BY b.id
    ORDER BY SUM(p.price_cents - p.commission_cents) DESC
    LIMIT ?
  `).all(limit);
}

// Most-liked works.
function getMostLikedBooks(limit = 10) {
  return db.prepare(`
    SELECT b.id, b.title, b.cover_key, b.price_cents,
           m.display_name AS author, m.handle,
           COUNT(l.book_id) AS like_count
    FROM books b
    JOIN members m ON m.id = b.publisher_id
    JOIN likes l ON l.book_id = b.id
    WHERE b.status = 'live'
    GROUP BY b.id
    ORDER BY like_count DESC
    LIMIT ?
  `).all(limit);
}

// Most-commented works.
function getMostDiscussedBooks(limit = 10) {
  return db.prepare(`
    SELECT b.id, b.title, b.cover_key, b.price_cents,
           m.display_name AS author, m.handle,
           COUNT(c.book_id) AS comment_count
    FROM books b
    JOIN members m ON m.id = b.publisher_id
    JOIN comments c ON c.book_id = b.id
    WHERE b.status = 'live'
    GROUP BY b.id
    ORDER BY comment_count DESC
    LIMIT ?
  `).all(limit);
}

// Compute a member's earned achievements (all truthful, all positive).
function getMemberAchievements(memberId) {
  const mine = db.prepare("SELECT id FROM books WHERE publisher_id = ? AND status = 'live'").all(memberId).map(r => r.id);
  const publishedCount = mine.length;

  const inList = (sql) => {
    if (mine.length === 0) return false;
    const ids = db.prepare(sql).all().map(r => r.id);
    return mine.some(id => ids.includes(id));
  };

  const featured = db.prepare(
    "SELECT COUNT(*) n FROM featured f JOIN books b ON b.id = f.book_id WHERE b.publisher_id = ? AND b.status='live'"
  ).get(memberId).n > 0;

  const onLeaderboard = inList(
    "SELECT b.id FROM books b JOIN purchases p ON p.book_id=b.id WHERE b.status='live' GROUP BY b.id ORDER BY SUM(p.price_cents-p.commission_cents) DESC LIMIT 20"
  );
  const mostLoved = inList(
    "SELECT b.id FROM books b JOIN likes l ON l.book_id=b.id WHERE b.status='live' GROUP BY b.id ORDER BY COUNT(*) DESC LIMIT 10"
  );
  const mostDiscussed = inList(
    "SELECT b.id FROM books b JOIN comments c ON c.book_id=b.id WHERE b.status='live' GROUP BY b.id ORDER BY COUNT(*) DESC LIMIT 10"
  );

  const badges = [];
  if (featured)       badges.push({ key: 'featured',    label: 'Featured by Phoenix', desc: 'Chosen by hand for the homepage.' });
  if (onLeaderboard)  badges.push({ key: 'leaderboard', label: 'On the Leaderboard',  desc: 'Among the top-selling works.' });
  if (mostLoved)      badges.push({ key: 'loved',       label: 'Most Loved',          desc: 'A work readers can\u2019t stop liking.' });
  if (mostDiscussed)  badges.push({ key: 'discussed',   label: 'Most Discussed',      desc: 'A work sparking conversation.' });
  if (publishedCount >= 10)     badges.push({ key: 'published10', label: 'Prolific',    desc: '10 or more works published.' });
  else if (publishedCount >= 5) badges.push({ key: 'published5',  label: 'Established', desc: '5 or more works published.' });
  else if (publishedCount >= 1) badges.push({ key: 'published1',  label: 'Published',   desc: 'Has work on Phoenix.' });

  return badges;
}

// --- REVIEWS -----------------------------------------------------------------

// Books this member has bought (for the review autocomplete). Includes author.
function getReviewableBooks(memberId, search) {
  let sql = `SELECT b.id, b.title, m.display_name AS author, m.handle AS author_handle
             FROM purchases p JOIN books b ON b.id = p.book_id
             JOIN members m ON m.id = b.publisher_id
             WHERE p.buyer_id = ? AND b.status = 'live'`;
  const args = [memberId];
  if (search) { sql += ' AND LOWER(b.title) LIKE ?'; args.push('%' + search.toLowerCase() + '%'); }
  sql += ' ORDER BY b.title LIMIT 10';
  return db.prepare(sql).all(...args);
}

// Did this member buy this book? (buyers-only enforcement)
function hasBoughtBook(memberId, bookId) {
  return !!db.prepare('SELECT 1 FROM purchases WHERE buyer_id = ? AND book_id = ?').get(memberId, bookId);
}

// Create or update this member's review of a book (one per member per book).
function upsertReview(memberId, bookId, rating, body) {
  const existing = db.prepare('SELECT id FROM reviews WHERE member_id = ? AND book_id = ?').get(memberId, bookId);
  if (existing) {
    db.prepare("UPDATE reviews SET rating = ?, body = ?, edited_at = datetime('now') WHERE id = ?").run(rating, body, existing.id);
  } else {
    db.prepare('INSERT INTO reviews (member_id, book_id, rating, body) VALUES (?, ?, ?, ?)').run(memberId, bookId, rating, body);
  }
}

// List reviews, newest first, with optional smart search by book title or author.
function getReviews(search) {
  let sql = `SELECT rv.id, rv.rating, rv.body, rv.created_at, rv.edited_at,
                    b.id AS book_id, b.title, b.cover_key,
                    m.display_name AS reviewer, m.handle AS reviewer_handle, m.avatar_key AS reviewer_avatar,
                    au.display_name AS author, au.handle AS author_handle
             FROM reviews rv
             JOIN books b ON b.id = rv.book_id
             JOIN members m ON m.id = rv.member_id
             JOIN members au ON au.id = b.publisher_id`;
  const args = [];
  if (search) {
    sql += ' WHERE LOWER(b.title) LIKE ? OR LOWER(au.display_name) LIKE ?';
    const like = '%' + search.toLowerCase() + '%';
    args.push(like, like);
  }
  sql += ' ORDER BY rv.created_at DESC LIMIT 100';
  return db.prepare(sql).all(...args);
}
// Gather the full taxonomy: content types, categories (each tagged with which
// type it belongs to), and audiences. The publish form uses this to fill its
// dropdowns with the REAL options from the database.
function getTaxonomy() {
  const content_types = db.prepare('SELECT id, name FROM content_types ORDER BY id').all();
  const categories    = db.prepare('SELECT id, content_type_id, name FROM categories ORDER BY name').all();
  const audiences     = db.prepare('SELECT id, name FROM audiences ORDER BY name').all();
  return { content_types, categories, audiences };
}
 
// ============================================================================
// EXPORT — make these functions available to the rest of the app.
// ----------------------------------------------------------------------------
// Other files will write:  const db = require('./db/db');
// and then call:           db.getFeaturedBooks();
// We also export the raw `db` connection itself (as `_db`) for the rare case
// we need it directly — but normal code should use the named functions.
// ============================================================================
module.exports = {
  _db: db, // the raw connection, for special cases only
 
  // members
  getMemberByEmail,
  getMemberByHandle,
  getMemberById,
  createMember,
  setTotpSecret,
  getMemberProfileByHandle,
  getBooksForProfile,
  countFollowers,
  isFollowing,
  toggleFollow,
  updateProfile,
  setAvatarKey,
  // books
  getBooksByPublisher,
  getBookById,
  insertBook,
  createBook,
  updateBookKeys,
  getMyBooks,
  getPendingBooks,
  setBookStatus,
  getBookForDisplay,
  hasLiked,
  getComments,
  addComment,
  deleteComment,
  searchBooks,
  getBookForDownload,
  getMyPurchases,
  getFeaturedForAdmin,
  getFeatureCandidates,
  featureBook,
  updateCuratorNote,
  unfeatureBook,
  getAllBooksForAdmin,
  countAllBooks,
  removeOrDeleteBook,
  updateBookMeta,
  getBookForEdit,
 
  // featured
  getFeaturedBooks,
  getMemberAchievements,

  // taxonomy
  getTaxonomy,
 
  // likes
  countLikes,
  addLike,
  removeLike,

  //purchases
  recordPurchase,
  hasPurchased, 

  //admin
   getAllMembersForAdmin,
   countAllMembers,
   setMemberSuspended,
   getAllCommentsForAdmin,
   deleteCommentAsAdmin,
   countAllComments,

   //Reports
  createReport,
  getReports,
  updateReportStatus,
  getReportCounts,

  //dashboard
  getDashboardStats,
  getBookStatsForPublisher,
  getFollowers,
  getFollowing,

  //password
  getPasswordHash,
  updatePassword,
  createResetToken,
  getValidResetToken,
  markResetTokenUsed,

  //email verification
  createVerifyToken,
  getValidVerifyToken,
  markVerified,

  //delete
 deleteAccount,

 //newsletter
 getNewsletterRecipients,
 countNewsletterRecipients,
 getFeaturedForNewsletter,
 unsubscribeByToken,

 //booksRecommendations
 getTopEarningBooks,
 getMostLikedBooks,
 getMostDiscussedBooks,
 getReviewableBooks,
 hasBoughtBook,
 upsertReview,
 getReviews,
};