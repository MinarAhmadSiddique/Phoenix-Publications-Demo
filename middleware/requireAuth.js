
// ============================================================================
// PHOENIX PUBLICATIONS — middleware/requireAuth.js
// ============================================================================
//
// Three gatekeepers:
//   requireLogin  -> "is anyone logged in?"        (guards /members/... pages)
//   requireAdmin  -> "logged-in admin who ALSO     (guards the /admin area)
//                     passed the 2FA control room?"
//
// TWO-LAYER ADMIN SECURITY:
//   Reaching the admin area now requires BOTH:
//     (1) being logged in as a member whose account is is_admin = 1, AND
//     (2) having passed the admin Control room (password + 2FA), which sets
//         req.session.adminVerified = true.
//   Normal member login sets memberId but NOT adminVerified — so logging in as
//   the admin account alone is not enough; you must also clear the Control room.
// ============================================================================
 
const db = require('../db/db');
 
// ----------------------------------------------------------------------------
// requireLogin — must be logged in (any member). Guards member-only pages.
// ----------------------------------------------------------------------------
function requireLogin(req, res, next) {
  if (req.session && req.session.memberId) {
    return next();
  }
  return res.redirect('/login.html');
}
 
// ----------------------------------------------------------------------------
// requireAdmin — must be logged in AND an admin AND 2FA-verified this session.
// ----------------------------------------------------------------------------
function requireAdmin(req, res, next) {
  // Layer 1: must be logged in as a member.
  if (!req.session || !req.session.memberId) {
    return res.redirect('/login.html');
  }
 
  // Must be an admin account (checked fresh from the DB — the source of truth).
  const member = db.getMemberById(req.session.memberId);
  if (!member || member.is_admin !== 1) {
    // Logged in, but not an admin. 404 reveals nothing about the admin area.
    return res.status(404).send('Page not found. <a href="/">Back to Phoenix</a>');
  }
 
  // Layer 2: must have passed the admin Control room (password + 2FA).
  // This flag is set ONLY by POST /admin/login — never by normal member login.
  if (!req.session.adminVerified) {
    return res.redirect('/admin/adminLogin.html');
  }
 
  return next();
}
 
// ----------------------------------------------------------------------------
// requireAdminMember — LIGHTER guard for the 2FA-enrollment pages only.
// Being logged in as an admin member is enough here, WITHOUT adminVerified —
// because you can't have passed 2FA yet if you're still setting 2FA up.
// (Chicken-and-egg: first-time enrollment needs a guard that doesn't itself
// require the thing being enrolled.)
// ----------------------------------------------------------------------------
function requireAdminMember(req, res, next) {
  if (!req.session || !req.session.memberId) {
    return res.redirect('/login.html');
  }
  const member = db.getMemberById(req.session.memberId);
  if (!member || member.is_admin !== 1) {
    return res.status(404).send('Page not found. <a href="/">Back to Phoenix</a>');
  }
  return next();
}
 
module.exports = { requireLogin, requireAdmin, requireAdminMember };