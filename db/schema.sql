
-- ============================================================================
-- PHOENIX PUBLICATIONS — schema.sql
-- ============================================================================
-- THE SINGLE SOURCE OF TRUTH for the database structure.
--
-- Running this file against a fresh database builds the COMPLETE, current
-- schema — every table, column, constraint, and index. If you rebuild the DB
-- anywhere (a new machine, a teammate, a production server), this one file
-- recreates it correctly.
--
-- IMPORTANT: whenever you change the database (add a column, a table, an index),
-- record that change HERE. Never rely on one-off ALTER TABLE commands in the
-- terminal alone — those live only in your local .db file and would be lost on
-- a rebuild. This file must always describe the real, complete schema.
--
-- Conventions used throughout:
--   • Money is stored as INTEGER cents ($4.50 -> 450). Never floats.
--   • Timestamps are ISO text via datetime('now'), stored in UTC.
--   • Booleans are INTEGER 0/1.
--   • Foreign keys use REFERENCES; ON DELETE CASCADE where child rows should
--     die with their parent. (Enable enforcement with PRAGMA foreign_keys=ON
--     on each connection — the app's db.js does this.)
-- ============================================================================
 
 
-- ============================================================================
-- MEMBERS — every account (readers, writers, and the admin).
-- ============================================================================
CREATE TABLE members (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
 
    -- Public @handle used to find and follow someone. UNIQUE — no duplicates.
    handle                   TEXT NOT NULL UNIQUE,
 
    -- Display name shown on the profile.
    display_name             TEXT NOT NULL,
 
    -- Login email. UNIQUE so one email = one account.
    email                    TEXT NOT NULL UNIQUE,
 
    -- We NEVER store the real password — only a bcrypt hash (one-way).
    password_hash            TEXT NOT NULL,
 
    -- "About" text on the profile. Optional.
    bio                      TEXT,
 
    -- Readers default to PRIVATE (not searchable/followable). Publishing a work
    -- flips this to 'public' in app code. CHECK restricts to the two values.
    profile_visibility       TEXT NOT NULL DEFAULT 'private'
                             CHECK (profile_visibility IN ('public','private')),
 
    -- Admin flag. 1 = admin/curator. Set DIRECTLY in the DB for your own
    -- account — there is deliberately no in-app button to grant admin.
    is_admin                 INTEGER NOT NULL DEFAULT 0,
 
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    edited_at                TEXT,
 
    -- 2FA (TOTP) secret for the admin control room. NULL until 2FA is enrolled.
    totp_secret              TEXT,
 
    -- A one-line tagline shown under the display name on the profile.
    tagline                  TEXT,
 
    -- Storage key for the profile avatar image. NULL/'none' -> show initials.
    avatar_key               TEXT,
 
    -- Preference toggles (0/1), set in editProfile:
    pref_newsletter          INTEGER DEFAULT 0,   -- receive the Phoenix newsletter
    pref_consider_channel    INTEGER DEFAULT 0,   -- my work may be considered for the channel
    pref_consider_newsletter INTEGER DEFAULT 0,   -- my work may be shared in the newsletter
    pref_notify              INTEGER DEFAULT 0,   -- (reserved) notify preference
 
    -- Account lifecycle flags (0/1):
    deleted                  INTEGER DEFAULT 0,   -- account closed & anonymized (can't log in)
    suspended                INTEGER DEFAULT 0,   -- suspended by admin (can't log in; reversible)
    verified                 INTEGER DEFAULT 0,   -- email address confirmed
 
    -- Token placed in the newsletter unsubscribe link, so one click can turn
    -- off pref_newsletter without the member logging in.
    unsubscribe_token        TEXT
);
 
 
-- ============================================================================
-- CONTENT TAXONOMY — the fixed vocabulary works are classified by.
-- ============================================================================
CREATE TABLE content_types (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE          -- 'Book', 'Journal', 'Research', 'Short Read'
);
 
CREATE TABLE categories (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type_id  INTEGER NOT NULL REFERENCES content_types(id),
    name             TEXT NOT NULL,
    -- Same name can exist under different types; uniqueness is on (type + name).
    UNIQUE (content_type_id, name)
);
 
CREATE TABLE audiences (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE          -- Children, Teens, Adults, Professionals...
);
 
 
-- ============================================================================
-- BOOKS — the published works (books, journals, research, short reads).
-- ============================================================================
CREATE TABLE books (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
 
    -- Who published it. This is the "Publisher" shown on the book's page.
    publisher_id          INTEGER NOT NULL REFERENCES members(id),
 
    -- The broad type (Book/Journal/...). One per work.
    content_type_id       INTEGER NOT NULL REFERENCES content_types(id),
 
    title                 TEXT NOT NULL,
    description           TEXT,
 
    -- Price in CENTS. 0 = free. CHECK refuses negatives.
    price_cents           INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
 
    -- Storage key for the PRIVATE manuscript file (only buyers get a link).
    manuscript_key        TEXT NOT NULL,
 
    -- Storage key for the PUBLIC cover image. Optional.
    cover_key             TEXT,
 
    -- Hash of the uploaded file — a built-in duplicate/anti-piracy check.
    file_hash             TEXT,
 
    -- PER-BOOK consent: may we feature this work on the channel / newsletter?
    feature_on_youtube    INTEGER NOT NULL DEFAULT 0,
    feature_in_newsletter INTEGER NOT NULL DEFAULT 0,
 
    -- Lifecycle: pending -> live / rejected, and removed later if needed.
    status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','live','rejected','removed')),
 
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    edited_at             TEXT
);
 
-- A work can sit in multiple categories / target multiple audiences.
CREATE TABLE book_categories (
    book_id      INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    category_id  INTEGER NOT NULL REFERENCES categories(id),
    PRIMARY KEY (book_id, category_id)   -- no duplicate links
);
 
CREATE TABLE book_audiences (
    book_id      INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    audience_id  INTEGER NOT NULL REFERENCES audiences(id),
    PRIMARY KEY (book_id, audience_id)
);
 
 
-- ============================================================================
-- FEATURED — the hand-curated homepage picks ("chosen by Phoenix").
-- ============================================================================
CREATE TABLE featured (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id        INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
 
    -- Order on the homepage (1 = top).
    position       INTEGER NOT NULL,
 
    -- The hand-written "why we chose it" note — the human touch no algorithm
    -- can produce. Shown on the homepage and the book's page.
    curator_note   TEXT,
 
    featured_from  TEXT NOT NULL DEFAULT (datetime('now')),
 
    -- NULL = stays until removed. A date = rotates off automatically.
    featured_until TEXT,
 
    UNIQUE (book_id)                     -- one featured slot per book
);
 
 
-- ============================================================================
-- COMMERCE — purchases (with snapshotted price + commission).
-- ============================================================================
CREATE TABLE purchases (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
 
    buyer_id          INTEGER NOT NULL REFERENCES members(id),
    book_id           INTEGER NOT NULL REFERENCES books(id),
 
    -- SNAPSHOT the price + our 4% commission at sale time, so history never
    -- changes even if the writer later re-prices the work.
    price_cents       INTEGER NOT NULL,
    commission_cents  INTEGER NOT NULL,
 
    -- Stripe's payment ID, to reconcile our records with Stripe's.
    stripe_payment_id TEXT,
 
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
 
    UNIQUE (buyer_id, book_id)           -- you own a work once
);
 
 
-- ============================================================================
-- SOCIAL — follows, likes, comments, reviews.
-- ============================================================================
CREATE TABLE follows (
    follower_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    followed_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
 
    PRIMARY KEY (follower_id, followed_id),   -- can't follow someone twice
    CHECK (follower_id <> followed_id)        -- can't follow yourself
);
 
CREATE TABLE likes (
    member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (member_id, book_id)
);
 
CREATE TABLE comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
 
    -- Set when edited; we show "edited" publicly when this isn't NULL.
    edited_at  TEXT,
 
    UNIQUE (member_id, book_id)          -- one comment per member per book
);
 
-- Reader reviews. Only BUYERS can review (enforced in app code): a review ties
-- a member to a book they purchased, with a 1–10 rating and a written body.
CREATE TABLE reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    rating     INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    edited_at  TEXT,
    UNIQUE (member_id, book_id)          -- one review per member per book (editable)
);
 
 
-- ============================================================================
-- MODERATION — reports of members, books, or comments.
-- ============================================================================
CREATE TABLE reports (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
 
    -- The reporter, if logged in (NULL if anonymous).
    reporter_id    INTEGER REFERENCES members(id),
 
    -- Snapshotted so the report stands alone even if that account changes/leaves.
    reporter_name  TEXT NOT NULL,
    reporter_email TEXT NOT NULL,
 
    -- Polymorphic target: a member, a book, or a comment.
    target_type    TEXT NOT NULL CHECK (target_type IN ('member','book','comment')),
    target_id      INTEGER NOT NULL,
 
    reason         TEXT NOT NULL,
 
    status         TEXT NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('submitted','reviewing','resolved')),
 
    action_taken   TEXT,
    resolved_at    TEXT,
 
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
 
 
-- ============================================================================
-- EMAIL — password reset & verification tokens; newsletter subscribers.
-- ============================================================================
 
-- One-time, time-limited tokens for the "forgot password" flow (~1 hour).
CREATE TABLE password_reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
 
-- One-time, time-limited tokens for confirming a member's email (~24 hours).
CREATE TABLE email_verify_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
 
-- Standalone newsletter subscriber list (for possible email-only signups and a
-- separate unsubscribe-token mechanism). NOTE: the current newsletter targets
-- members via members.pref_newsletter directly; this table remains for
-- flexibility and non-member subscribers.
CREATE TABLE newsletter_subscribers (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id         INTEGER REFERENCES members(id),   -- NULL if email-only
    email             TEXT NOT NULL UNIQUE,
    subscribed_at     TEXT NOT NULL DEFAULT (datetime('now')),
    unsubscribe_token TEXT NOT NULL UNIQUE,
    is_active         INTEGER NOT NULL DEFAULT 1        -- 0 = unsubscribed (row kept as a record)
);
 
 
-- ============================================================================
-- INDEXES — speed up the lookups the app does most.
-- ============================================================================
CREATE INDEX idx_books_publisher   ON books(publisher_id);
CREATE INDEX idx_books_status      ON books(status);
CREATE INDEX idx_books_type        ON books(content_type_id);
CREATE INDEX idx_bookcats_cat      ON book_categories(category_id);
CREATE INDEX idx_featured_position ON featured(position);
CREATE INDEX idx_purchases_buyer   ON purchases(buyer_id);
CREATE INDEX idx_follows_followed  ON follows(followed_id);
CREATE INDEX idx_likes_book        ON likes(book_id);
CREATE INDEX idx_comments_book     ON comments(book_id);
CREATE INDEX idx_reviews_book      ON reviews(book_id);
CREATE INDEX idx_reports_status    ON reports(status);