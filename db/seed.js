
// ============================================================================
// PHOENIX PUBLICATIONS — seed.js
// ============================================================================
//
// WHAT THIS FILE IS:
//   A one-time setup script that fills the TAXONOMY tables with their fixed
//   reference data: the 4 content types, all the categories (each grouped under
//   its type), and the audience tags. These are the lists every dropdown and
//   filter on the site points at — so they must exist before anyone can publish
//   or browse.
//
// HOW TO RUN IT:
//   From your project root, in the terminal:   node db/seed.js
//   Run it ONCE on a fresh database. It is SAFE to run again — it checks whether
//   the taxonomy is already there and skips if so, so you can't create duplicates.
//
// WHAT IT DOES NOT DO:
//   It does NOT create your admin account, and it does NOT add sample books.
//   Just the taxonomy. (Admin account is a separate, careful step.)
// ============================================================================
 
const db = require('./db'); // our database interface — loading it also makes
                            // sure the tables exist (db.js builds them on first load)
 
// We reach past the named functions to the raw connection here, because seeding
// is a one-off setup task, not normal app behavior. db._db is that raw handle.
const conn = db._db;
 
 
// ----------------------------------------------------------------------------
// THE DATA
// ----------------------------------------------------------------------------
// The 4 broad content types.
const CONTENT_TYPES = ['Book', 'Journal & Magazine', 'Research & Academic', 'Short Read'];
 
// The audience tags (independent of type).
const AUDIENCES = ['Children', 'Teens', 'Young Adults', 'Adults', 'Professionals', 'Educators', 'Researchers'];
 
// Categories, grouped under the type they belong to (Option A — faithful to the
// original lists; the same name can appear under different types as its own row).
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
 
 
// ----------------------------------------------------------------------------
// THE SEEDING LOGIC
// ----------------------------------------------------------------------------
 
function seed() {
  // Safety check: is the taxonomy already seeded? If content_types has rows,
  // we assume it's done and stop, so running this twice can't duplicate anything.
  const already = conn.prepare('SELECT COUNT(*) AS n FROM content_types').get();
  if (already.n > 0) {
    console.log('  [seed] Taxonomy already present — nothing to do.');
    return;
  }
 
  console.log('  [seed] Seeding taxonomy...');
 
  // We wrap everything in a TRANSACTION. A transaction means "do all of these
  // inserts as one all-or-nothing batch": if anything fails partway, the whole
  // thing rolls back and the database is left untouched — never half-seeded.
  // better-sqlite3 gives us db.transaction(fn) for exactly this.
  const insertAll = conn.transaction(() => {
 
    // Prepare the insert statements once, reuse them many times (faster).
    const insertType     = conn.prepare('INSERT INTO content_types (name) VALUES (?)');
    const insertCategory = conn.prepare('INSERT INTO categories (content_type_id, name) VALUES (?, ?)');
    const insertAudience = conn.prepare('INSERT INTO audiences (name) VALUES (?)');
 
    // 1) Insert each content type, and remember the id it was given, so we can
    //    link this type's categories to it.
    for (const typeName of CONTENT_TYPES) {
      const result = insertType.run(typeName);
      const typeId = result.lastInsertRowid; // the auto-assigned id for this type
 
      // 2) Insert all categories that belong to this type, pointing each at typeId.
      const cats = CATEGORIES[typeName] || [];
      for (const catName of cats) {
        insertCategory.run(typeId, catName);
      }
    }
 
    // 3) Insert the audience tags.
    for (const audName of AUDIENCES) {
      insertAudience.run(audName);
    }
  });
 
  insertAll(); // actually run the transaction
 
  // Report what we created, so you can see it worked.
  const t = conn.prepare('SELECT COUNT(*) AS n FROM content_types').get().n;
  const c = conn.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  const a = conn.prepare('SELECT COUNT(*) AS n FROM audiences').get().n;
  console.log(`  [seed] Done. ${t} content types, ${c} categories, ${a} audiences.`);
}
 
seed();