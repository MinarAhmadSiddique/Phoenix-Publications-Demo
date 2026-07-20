// ============================================================
// Phoenix Publications — server.js
// ============================================================
// The thin entry point. It wires everything together in the
// CORRECT ORDER (order matters — see comments).
// ============================================================

require('dotenv').config();                    // load .env into process.env (must be first)

const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 0. Stripe webhook — MUST come BEFORE any body parser ----
// Stripe's signature verification needs the EXACT raw bytes it sent. If a
// body parser (urlencoded/json) runs first, it transforms the body and the
// signature check fails. So this is mounted before everything else.
const webhookRoutes = require('./routes/webhook');
app.use('/webhook', webhookRoutes);

// --- 1. Read form submissions into req.body ------------------
app.use(express.urlencoded({ extended: true }));

// --- 2. Sessions: the server's memory of who's logged in -----
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7   // 7 days
  }
}));

// --- 3. Routes -----------------------------------------------
// Member auth (login / signup / logout)
const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

// Data API (JSON endpoints)
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// Books (publishing)
const bookRoutes = require('./routes/books');
app.use('/', bookRoutes);

// Secure downloads (purchased manuscripts)
const downloadRoutes = require('./routes/download');
app.use('/download', downloadRoutes);

// Checkout (Stripe)
const checkoutRoutes = require('./routes/checkout');
app.use('/checkout', checkoutRoutes);

const previewRoutes = require('./routes/preview');
app.use('/preview', previewRoutes);

// Admin auth (separate admin login / logout) — mounted at /admin
const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

// --- 4. GUARDS — must come BEFORE express.static -------------
const { requireLogin, requireAdmin, requireAdminMember } = require('./middleware/requireAuth');

// Guard the /admin area. Let the login PAGE and the login/logout ROUTES
// through unguarded (you can't require admin to reach the thing that makes
// you admin). Everything else under /admin requires a logged-in admin.
app.use('/admin', (req, res, next) => {
  // These are open ONLY to a logged-in admin member (not the public):
  //   the Control room page, its login POST, 2FA setup/confirm.
  // The member-login gate happens inside requireAdminMember.
  if (req.path === '/adminLogin.html' ||
      req.path === '/login' ||
      req.path === '/2fa-setup' ||
      req.path === '/2fa-confirm') {
    return requireAdminMember(req, res, next);   // must be logged in as admin member
  }
  if (req.path === '/logout') return next();      // logout: always allowed
  return requireAdmin(req, res, next);            // admin pages: full 2FA-verified admin
});

// Guard the /members area: must be logged in (any member).
app.use('/members', requireLogin);

// --- 5. Serve the static site (AFTER the guards) -------------
app.use(express.static(path.join(__dirname, 'public')));

// --- 6. 404 --------------------------------------------------
app.use((req, res) => {
  res.status(404).send('Page not found. <a href="/">Back to Phoenix</a>');
});

// --- Start ---------------------------------------------------
// --- Start ---------------------------------------------------
// Auto-seed the database (taxonomy + demo admins) on startup, THEN listen.
// On the free-tier demo the DB is rebuilt on each restart, so this re-seeds
// it every time. It checks first and skips anything already present.
require('./db/autoSeed')().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('  Phoenix is running.');
    console.log('  Open: http://localhost:' + PORT);
    console.log('');
  });
});