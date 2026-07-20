// ============================================================================
// PHOENIX PUBLICATIONS — db/autoSeed.js
// ============================================================================
//
// WHAT THIS DOES:
//   Runs automatically when the server starts. Checks if the database is empty
//   (no taxonomy, no admin) and, if so, populates it — taxonomy + demo admin
//   accounts. This is essential for the free-tier demo, where the database is
//   rebuilt fresh on every restart: this re-seeds it each time, with zero
//   manual steps.
//
//   Safe to run every startup: it checks first and skips anything already there.
//
// HOW IT'S USED:
//   In server.js, require and call it once before app.listen():
//     require('./db/autoSeed')();
// ============================================================================

const db = require('./db');
const bcrypt = require('bcrypt');

const conn = db._db;

// --- The taxonomy data (same as seed.js) ---
const CONTENT_TYPES = ['Book', 'Journal & Magazine', 'Research & Academic', 'Short Read'];
const AUDIENCES = ['Children', 'Teens', 'Young Adults', 'Adults', 'Professionals', 'Educators', 'Researchers'];
const CATEGORIES = {
  'Book': [
    'Fiction', 'Non-Fiction', 'Fantasy', 'Science Fiction', 'Mystery & Thriller',
    'Romance', 'Horror', 'Adventure', 'Historical Fiction', 'Literary Fiction',
    'Young Adult', "Children's Books", 'Poetry', 'Drama', 'Comics & Graphic Novels',
    'Biographies & Memoirs', 'Self-Help', 'Business & Entrepreneurship',
    'Personal Finance', 'Technology & Programming', 'Artificial Intelligence',
    'Science', 'Mathematics', 'Engineering', 'Health & Fitness', 'Psychology',
    'Philosophy', 'Religion & Spirituality', 'History', 'Politics', 'Law',
    'Education & Study Guides', 'Language Learning', 'Cooking & Recipes', 'Travel',
    'Arts & Photography', 'Music', 'Crafts & DIY', 'Sports', 'Parenting', 'Pets', 'Humor'
  ],
  'Journal & Magazine': [
    'Business', 'Technology', 'AI & Innovation', 'Science', 'Health & Wellness',
    'Fitness', 'Finance & Investing', 'Real Estate', 'Marketing', 'Entrepreneurship',
    'Education', 'Travel', 'Food & Cooking', 'Fashion', 'Beauty', 'Photography',
    'Art & Design', 'Music', 'Gaming', 'Movies & TV', 'News & Current Affairs',
    'Politics', 'Environment', 'Automotive', 'Home & Garden', 'Lifestyle',
    'Relationships', 'Parenting', 'Sports', 'Local & Community'
  ],
  'Research & Academic': [
    'Computer Science', 'Engineering', 'Mathematics', 'Physics', 'Chemistry',
    'Biology', 'Medicine', 'Nursing', 'Psychology', 'Economics', 'Business', 'Law',
    'Education', 'Environmental Science', 'Agriculture', 'Social Sciences', 'Humanities'
  ],
  'Short Read': [
    'Short Stories', 'Essays', 'Opinion Pieces', 'Tutorials', 'Case Studies',
    'Interviews', 'Guides', 'Reviews'
  ]
};

// The demo admin accounts (login is by EMAIL).
const ADMINS = [
  { handle: 'admin', display_name: 'Admin',     email: 'admin@phoenix.demo', password: '12345678' },
  { handle: 'root',  display_name: 'Root User', email: 'root@phoenix.demo',  password: '12345678' }
];

function seedTaxonomy() {
  const already = conn.prepare('SELECT COUNT(*) AS n FROM content_types').get();
  if (already.n > 0) { console.log('  [autoSeed] Taxonomy already present.'); return; }

  console.log('  [autoSeed] Seeding taxonomy...');
  const insertAll = conn.transaction(() => {
    const insertType     = conn.prepare('INSERT INTO content_types (name) VALUES (?)');
    const insertCategory = conn.prepare('INSERT INTO categories (content_type_id, name) VALUES (?, ?)');
    const insertAudience = conn.prepare('INSERT INTO audiences (name) VALUES (?)');
    for (const typeName of CONTENT_TYPES) {
      const typeId = insertType.run(typeName).lastInsertRowid;
      for (const catName of (CATEGORIES[typeName] || [])) insertCategory.run(typeId, catName);
    }
    for (const audName of AUDIENCES) insertAudience.run(audName);
  });
  insertAll();
  console.log('  [autoSeed] Taxonomy seeded.');
}

async function seedAdmins() {
  const findByEmail = conn.prepare('SELECT id FROM members WHERE email = ?');
  const findByHandle = conn.prepare('SELECT id FROM members WHERE handle = ?');
  const insert = conn.prepare(`
    INSERT INTO members (handle, display_name, email, password_hash, is_admin, profile_visibility, verified, created_at)
    VALUES (?, ?, ?, ?, 1, 'public', 1, datetime('now'))
  `);
  for (const a of ADMINS) {
    if (findByEmail.get(a.email) || findByHandle.get(a.handle)) continue;
    const hash = await bcrypt.hash(a.password, 12);
    insert.run(a.handle, a.display_name, a.email, hash);
    console.log(`  [autoSeed] Created admin: ${a.email}`);
  }
}

// The main function server.js calls. Runs both seeds, safely.
module.exports = async function autoSeed() {
  try {
    seedTaxonomy();
    await seedAdmins();
    console.log('  [autoSeed] Ready. Admin login: admin@phoenix.demo / 12345678');
  } catch (err) {
    console.error('  [autoSeed] error:', err.message);
    // Non-fatal — the app still starts even if seeding hiccups.
  }
};