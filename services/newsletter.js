// ============================================================================
// PHOENIX PUBLICATIONS — services/newsletter.js
// Builds the curated-digest HTML and sends it to eligible subscribers.
// ============================================================================

const db = require('../db/db');
const { sendEmail, emailLayout } = require('./email');

function esc(s) { return (s || '').replace(/</g, '&lt;'); }
function price(c) { return c === 0 ? 'Free' : '$' + (c / 100).toFixed(2); }

// Build the HTML body for one recipient (their unsubscribe link is personal).
function buildNewsletterHtml(featured, appUrl, unsubscribeToken) {
  const worksHtml = featured.map(w => {
    const bookUrl = appUrl + '/bookDetail.html?id=' + w.id;
    const cover = (w.cover_key && w.cover_key !== 'none' && w.cover_key !== 'pending')
      ? '<img src="' + appUrl + '/' + w.cover_key + '" alt="" width="80" style="border-radius:2px;display:block">'
      : '';
    return `
      <table style="margin-bottom:24px"><tr>
        ${cover ? '<td style="vertical-align:top;padding-right:16px;width:80px">' + cover + '</td>' : ''}
        <td style="vertical-align:top">
          <a href="${bookUrl}" style="font-family:Georgia,serif;font-size:18px;font-weight:600;color:#16130F;text-decoration:none">${esc(w.title)}</a>
          <div style="font-size:13px;color:#8A8377;margin:2px 0 8px">by ${esc(w.author)} &middot; ${price(w.price_cents)}</div>
          ${w.curator_note ? '<div style="font-size:14px;color:#3D5A52;font-style:italic;line-height:1.5">&ldquo;' + esc(w.curator_note) + '&rdquo;</div>' : ''}
        </td>
      </tr></table>`;
  }).join('');

  const unsubUrl = appUrl + '/api/unsubscribe?token=' + unsubscribeToken;

  return emailLayout(
    '<p style="font-size:16px;line-height:1.6">A few works we chose by hand this season &mdash; each one read and picked by a person, not an algorithm.</p>' +
    '<div style="margin:24px 0">' + worksHtml + '</div>' +
    '<p style="font-size:14px;color:#8A8377;line-height:1.6">Thank you for reading with us.</p>' +
    '<p style="font-size:12px;color:#8A8377;margin-top:24px;border-top:1px solid #e5e2db;padding-top:12px">' +
      'You get this because you asked for Phoenix\'s picks. ' +
      '<a href="' + unsubUrl + '" style="color:#8A8377">Unsubscribe</a>.' +
    '</p>'
  );
}

// Send the newsletter to all eligible subscribers. Returns a summary.
async function sendNewsletter() {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const featured = db.getFeaturedForNewsletter();
  if (featured.length === 0) {
    return { ok: false, error: 'No featured works to send. Feature some works first.' };
  }
  const recipients = db.getNewsletterRecipients();
  if (recipients.length === 0) {
    return { ok: false, error: 'No eligible subscribers (need opted-in + verified members).' };
  }

  let sent = 0, failed = 0;
  for (const r of recipients) {
    const html = buildNewsletterHtml(featured, appUrl, r.unsubscribe_token);
    const result = await sendEmail({
      to: r.email,
      subject: 'Phoenix Publications — this season\'s picks',
      html
    });
    if (result.ok) sent++; else failed++;
  }
  return { ok: true, sent, failed, total: recipients.length, works: featured.length };
}

module.exports = { sendNewsletter, buildNewsletterHtml, getFeaturedForNewsletter: db.getFeaturedForNewsletter };