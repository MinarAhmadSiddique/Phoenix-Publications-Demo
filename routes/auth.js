
// ============================================================================
// PHOENIX PUBLICATIONS — routes/auth.js
// ============================================================================
//   POST /signup  -> create a new account (hash password, send verification)
//   POST /login   -> verify email + password, start a session
//   GET  /logout  -> end the session
// ============================================================================
 
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/db');
const { sendEmail, emailLayout } = require('../services/email');   // for the signup verification email
 
const router = express.Router();
 
 
// ============================================================================
// POST /signup  — create a new account
// ============================================================================
router.post('/signup', async (req, res) => {
  const { display_name, handle, email, password } = req.body;
 
  // --- Validation ---
  if (!display_name || !handle || !email || !password) {
    return res.status(400).send('All fields are required. <a href="/signup.html">Try again</a>');
  }
  if (password.length < 8) {
    return res.status(400).send('Password must be at least 8 characters. <a href="/signup.html">Try again</a>');
  }
 
  // --- Uniqueness checks (friendly messages instead of DB crashes) ---
  if (db.getMemberByEmail(email)) {
    return res.status(400).send('That email is already registered. <a href="/login.html">Log in instead?</a>');
  }
  if (db.getMemberByHandle(handle)) {
    return res.status(400).send('That handle is taken. <a href="/signup.html">Pick another</a>');
  }
 
  // --- Hash the password (never store plaintext). ---
  const passwordHash = await bcrypt.hash(password, 12);
 
  // --- Create the account. createMember returns the new member's id. ---
  const newId = db.createMember(handle, display_name, email, passwordHash);
 
  // --- Send a verification email (soft — they can use the site regardless). ---
  try {
    const token = db.createVerifyToken(newId);
    const verifyUrl = (process.env.APP_URL || 'http://localhost:3000') + '/api/verify-email?token=' + token;
    await sendEmail({
      to: email,
      subject: 'Verify your Phoenix email',
      html: emailLayout(
        '<p style="font-size:16px;line-height:1.6">Welcome to Phoenix!</p>' +
        '<p style="font-size:16px;line-height:1.6">Confirm your email so we can reach you for password resets and the newsletter.</p>' +
        '<p style="margin:24px 0"><a href="' + verifyUrl + '" style="background:#B5462E;color:#FBF9F4;padding:12px 24px;border-radius:2px;text-decoration:none;font-weight:500">Verify my email</a></p>' +
        '<p style="font-size:14px;color:#8A8377;line-height:1.6">This link expires in 24 hours.</p>'
      )
    });
  } catch (e) {
    console.error('[signup] verification email failed:', e.message);
    // Not fatal — the account still works; they can resend from their profile.
  }
 
  // --- Log them in immediately by starting a session. ---
  req.session.memberId = newId;
 
  // --- On to the dashboard. ---
  res.redirect('/members/dashboard.html');
});
 
 
// ============================================================================
// POST /login  — verify credentials and start a session
// ============================================================================
router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
 
    if (!email || !password) {
      return res.redirect('/login.html?error=required');
    }
 
    const member = db.getMemberByEmail(email);
 
    // No such email, or wrong password -> same generic message (no enumeration).
    if (!member) {
      return res.redirect('/login.html?error=invalid');
    }
 
    // Deleted (anonymized) accounts can't log in -> generic.
    if (member.deleted === 1) {
      return res.redirect('/login.html?error=invalid');
    }
 
    const ok = await bcrypt.compare(password, member.password_hash);
    if (!ok) {
      return res.redirect('/login.html?error=invalid');
    }
 
    // Password is correct. If suspended, tell them (they've proven ownership).
    if (member.suspended === 1) {
      return res.redirect('/login.html?error=suspended');
    }
 
    // Success — log them in.
    req.session.memberId = member.id;
    res.redirect('/members/dashboard.html');
 
  } catch (err) {
    console.error('[login] error:', err);
    res.redirect('/login.html?error=invalid');
  }
});
 
 
// ============================================================================
// GET /logout  — end the session
// ============================================================================
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});
 
 
module.exports = router;