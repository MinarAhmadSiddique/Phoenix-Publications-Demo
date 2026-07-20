// ============================================================================
// PHOENIX PUBLICATIONS — db/seedAdmin.js
// ============================================================================
//
// WHAT THIS FILE IS:
//   A SEPARATE one-time script that creates the demo ADMIN accounts. It does
//   NOT touch the taxonomy seed (seed.js) or any existing data — it only adds
//   two admin members if they don't already exist.
//
//   Built for the public DEMO deployment, where you want easy, known logins so
//   testers (and you) can sign in and see the admin side.
//
// HOW TO RUN:
//   From the project root:   node db/seedAdmin.js
//   Safe to run repeatedly — it skips any account that already exists.
//
// SECURITY NOTE:
//   The password here (12345678) is intentionally simple FOR A DEMO ONLY.
//   Never use this on a real deployment with real users or real money.
// ============================================================================

const db = require('./db');
const bcrypt = require('bcrypt');

const conn = db._db;

// The demo admin accounts. Login is by EMAIL. Both are admins.
const ADMINS = [
  { handle: 'admin', display_name: 'Admin',      email: 'admin@phoenix.demo', password: '12345678' },
  { handle: 'root',  display_name: 'Root User',  email: 'root@phoenix.demo',  password: '12345678' }
];

async function seedAdmins() {
  console.log('  [seedAdmin] Creating demo admin accounts...');

  const findByEmail = conn.prepare('SELECT id FROM members WHERE email = ?');
  const findByHandle = conn.prepare('SELECT id FROM members WHERE handle = ?');
  const insert = conn.prepare(`
    INSERT INTO members (handle, display_name, email, password_hash, is_admin, profile_visibility, verified, created_at)
    VALUES (?, ?, ?, ?, 1, 'public', 1, datetime('now'))
  `);

  for (const a of ADMINS) {
    // Skip if an account with this email OR handle already exists.
    if (findByEmail.get(a.email) || findByHandle.get(a.handle)) {
      console.log(`  [seedAdmin] "${a.handle}" (${a.email}) already exists — skipping.`);
      continue;
    }
    const hash = await bcrypt.hash(a.password, 12);
    insert.run(a.handle, a.display_name, a.email, hash);
    console.log(`  [seedAdmin] Created admin: ${a.email}  (password: ${a.password})`);
  }

  console.log('  [seedAdmin] Done.');
  console.log('');
  console.log('  Log in at /login.html with:');
  console.log('    admin@phoenix.demo  /  12345678');
  console.log('    root@phoenix.demo   /  12345678');
}

seedAdmins().then(() => process.exit(0)).catch(err => {
  console.error('  [seedAdmin] error:', err);
  process.exit(1);
});