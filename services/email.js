// ============================================================================
// PHOENIX PUBLICATIONS — services/email.js
// ============================================================================
// The single place that actually sends email. Everything else (password reset,
// notifications, newsletter) calls sendEmail() — so if we ever change provider,
// only this file changes. Uses Resend (https://resend.com).
//
// The API key lives in .env as RESEND_API_KEY (never in code).
// FROM address: during testing we use Resend's sandbox sender. When Phoenix has
// a real verified domain, change FROM to hello@yourdomain.com.
// ============================================================================

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Test sender (works with no domain). Swap for your domain once verified.
const FROM = 'Phoenix Publications <onboarding@resend.dev>';

// Send one email. Returns { ok: true } or { ok: false, error }.
async function sendEmail({ to, subject, html }) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error('[email] RESEND_API_KEY not set — email not sent.');
      return { ok: false, error: 'Email not configured.' };
    }
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error('[email] send failed:', error);
      return { ok: false, error };
    }
    console.log('[email] sent to', to, '| id:', data && data.id);
    return { ok: true, id: data && data.id };
  } catch (err) {
    console.error('[email] error:', err.message);
    return { ok: false, error: err.message };
  }
}

// A simple branded HTML wrapper so all emails look consistent.
function emailLayout(bodyHtml) {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #16130F;">
    <div style="font-size: 20px; font-weight: 600; color: #B5462E; margin-bottom: 24px;">✦ Phoenix Publications</div>
    ${bodyHtml}
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e2db; font-size: 12px; color: #8A8377;">
      Phoenix Publications — books chosen by hand, not by an algorithm.
    </div>
  </div>`;
}

module.exports = { sendEmail, emailLayout };