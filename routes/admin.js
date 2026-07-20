
// ============================================================================
// PHOENIX PUBLICATIONS — routes/admin.js
// ============================================================================
// The admin Control room — the SECOND layer of admin security.
//
// TWO-LAYER FLOW:
//   1. You must ALREADY be logged in as a member (via the normal /login).
//   2. Then, here, you prove admin rights again: password + 2FA code. On
//      success we set req.session.adminVerified = true, which is what
//      requireAdmin checks before letting you into any /admin page.
//
//   Logging in as the admin account through the normal member login is NOT
//   enough on its own — it never sets adminVerified. You must clear this room.
//
// Also holds the 2FA enrollment flow (setup + confirm), guarded by the lighter
// requireAdminMember (you can't have passed 2FA while still enrolling it).
// ============================================================================
 
const express = require('express');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const db = require('../db/db');
const { requireAdminMember } = require('../middleware/requireAuth');
 
const router = express.Router();
 
// --- POST /admin/login -----------------------------------------------------
router.post('/login', async (req, res) => {
  const { email, password, code } = req.body;
 
  // LAYER 1 GATE: you must already be logged in as a member to use this room.
  if (!req.session || !req.session.memberId) {
    return res.status(401).send('Please log in to Phoenix first. <a href="/login.html">Member login</a>');
  }
 
  if (!email || !password) {
    return res.status(400).send('Email and password are required. <a href="/admin/adminLogin.html">Try again</a>');
  }
 
  // Look up the account.
  const member = db.getMemberByEmail(email);
 
  // Verify password (same vague message for all failures — reveal nothing).
  const passwordOk = member
    ? await bcrypt.compare(password, member.password_hash)
    : false;
 
  // Must exist AND password correct AND be an admin AND be the SAME account
  // you're already logged in as (you can't verify into a different admin than
  // the one you logged in with). Any failure -> same vague message.
  if (!member || !passwordOk || member.is_admin !== 1 || member.id !== req.session.memberId) {
    return res.status(401).send('Invalid credentials. <a href="/admin/adminLogin.html">Try again</a>');
  }
 
  // --- 2FA is REQUIRED for admin access ---
  // If this admin hasn't enrolled 2FA yet, they must set it up before entering.
  if (!member.totp_secret) {
    return res.status(403).send('Two-factor is required for admin access. <a href="/admin/2fa-setup">Set up 2FA</a>');
  }
 
  const codeOk = speakeasy.totp.verify({
    secret: member.totp_secret,
    encoding: 'base32',
    token: code || '',
    window: 1
  });
  if (!codeOk) {
    return res.status(401).send('Invalid credentials. <a href="/admin/adminLogin.html">Try again</a>');
  }
 
  // All layers passed — mark THIS session as admin-verified. This is the flag
  // requireAdmin looks for. It is set nowhere else.
  req.session.adminVerified = true;
 
  res.redirect('/admin/contentManage.html');
});
 
// --- GET /admin/logout — leave the control room ----------------------------
// This drops ONLY the admin verification. You stay logged in as a member.
// (Use the normal /logout to end the whole session.)
router.get('/logout', (req, res) => {
  req.session.adminVerified = false;
  res.redirect('/');
});
 
// --- GET /admin/2fa-setup — show the QR code to enroll ---------------------
// Guarded by requireAdminMember (logged-in admin, but need NOT be 2FA-verified
// yet — because they're enrolling 2FA right now).
router.get('/2fa-setup', requireAdminMember, async (req, res) => {
  try {
    const member = db.getMemberById(req.session.memberId);
    const secret = speakeasy.generateSecret({ name: `Phoenix Admin (${member.handle})` });
    req.session.pendingTotpSecret = secret.base32;
    const qrImage = await qrcode.toDataURL(secret.otpauth_url);
 
    res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Set up 2FA &middot; Phoenix Admin</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600&family=Inter:wght@400;500&display=swap');
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:#16130F; color:#FBF9F4;
         font-family:'Inter',system-ui,sans-serif; display:flex; align-items:center;
         justify-content:center; padding:40px 20px; }
  .card { max-width:440px; width:100%; background:rgba(255,255,255,0.03);
          border:1px solid rgba(255,255,255,0.1); border-radius:2px; padding:48px 40px; text-align:center; }
  .lock { font-size:32px; margin-bottom:16px; }
  h1 { font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:28px; margin:0 0 8px; }
  .sub { color:rgba(251,249,244,0.5); font-size:14px; margin-bottom:32px; line-height:1.5; }
  .steps { text-align:left; font-size:14px; color:rgba(251,249,244,0.8); line-height:1.7; margin-bottom:24px; }
  .steps b { color:#B5462E; }
  .qr { background:#FBF9F4; padding:16px; border-radius:2px; display:inline-block; margin-bottom:28px; }
  .qr img { display:block; width:200px; height:200px; }
  input { width:100%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15);
          color:#FBF9F4; font-size:24px; letter-spacing:10px; text-align:center; padding:14px;
          border-radius:2px; font-family:'Fraunces',serif; margin-bottom:20px; }
  input:focus { outline:none; border-color:#B5462E; }
  input::placeholder { color:rgba(251,249,244,0.25); letter-spacing:10px; }
  button { width:100%; background:#B5462E; color:#FBF9F4; border:none; font-size:15px; font-weight:500;
           padding:14px; border-radius:2px; cursor:pointer; font-family:'Inter',sans-serif; }
  button:hover { background:#9c3a25; }
  .note { margin-top:20px; font-size:12px; color:rgba(251,249,244,0.4); line-height:1.6; }
</style></head>
<body>
  <div class="card">
    <div class="lock">&#128274;</div>
    <h1>Set up two-factor</h1>
    <div class="sub">One more layer protecting your control room.</div>
    <div class="steps">
      <b>1.</b> Open your authenticator app (Google Authenticator, Authy, etc.)<br>
      <b>2.</b> Scan this code:
    </div>
    <div class="qr"><img src="${qrImage}" alt="QR code"></div>
    <div class="steps"><b>3.</b> Enter the 6-digit code it shows:</div>
    <form action="/admin/2fa-confirm" method="POST">
      <input type="text" name="token" placeholder="000000" maxlength="6" inputmode="numeric" autocomplete="one-time-code" required>
      <button type="submit">Confirm &amp; enable 2FA</button>
    </form>
    <div class="note">This code lives only on your device. Phoenix never sees it &mdash; it only checks that it matches.</div>
  </div>
</body></html>`);
  } catch (err) {
    console.error('[2fa-setup] error:', err);
    res.status(500).send('Could not start 2FA setup.');
  }
});
 
// --- POST /admin/2fa-confirm — verify the code, save the secret ------------
router.post('/2fa-confirm', requireAdminMember, (req, res) => {
  const page = (body) => `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;500&display=swap');
      body{margin:0;min-height:100vh;background:#16130F;color:#FBF9F4;font-family:'Inter',sans-serif;
           display:flex;align-items:center;justify-content:center;padding:40px;text-align:center}
      .card{max-width:420px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);
            border-radius:2px;padding:48px 40px}
      h1{font-family:'Fraunces',serif;font-size:26px;margin:0 0 12px}
      p{color:rgba(251,249,244,0.6);font-size:14px;line-height:1.6;margin:0 0 24px}
      a{display:inline-block;background:#B5462E;color:#FBF9F4;padding:12px 24px;border-radius:2px;
        text-decoration:none;font-size:14px;font-weight:500}
    </style></head><body><div class="card">${body}</div></body></html>`;
 
  try {
    const pendingSecret = req.session.pendingTotpSecret;
    if (!pendingSecret) {
      return res.status(400).send(page(`<h1>No setup in progress</h1>
        <p>Your setup session expired.</p><a href="/admin/2fa-setup">Start over</a>`));
    }
 
    const ok = speakeasy.totp.verify({
      secret: pendingSecret, encoding: 'base32', token: req.body.token, window: 1
    });
 
    if (!ok) {
      return res.status(400).send(page(`<h1>That code didn't match</h1>
        <p>The code may have expired (they change every 30 seconds). Try the setup again.</p>
        <a href="/admin/2fa-setup">Try again</a>`));
    }
 
    // Correct — save the secret permanently. 2FA is now enabled for this account.
    db.setTotpSecret(req.session.memberId, pendingSecret);
    delete req.session.pendingTotpSecret;
 
    res.send(page(`<h1>&#10003; Two-factor enabled</h1>
      <p>Your admin account is now protected by your authenticator app. Enter the Control room with your password and a code.</p>
      <a href="/admin/adminLogin.html">Go to the Control room</a>`));
  } catch (err) {
    console.error('[2fa-confirm] error:', err);
    res.status(500).send('Could not confirm 2FA.');
  }
});
 
module.exports = router;