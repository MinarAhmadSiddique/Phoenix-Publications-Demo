// ============================================================================
// PHOENIX PUBLICATIONS — routes/checkout.js
// ============================================================================
// Stripe checkout. When a logged-in reader buys a book, we create a Stripe
// "checkout session" (a hosted payment page) and send them to it. Stripe
// handles the card details — we never touch them.
//
// The secret key comes from .env (process.env.STRIPE_SECRET_KEY) so switching
// to live mode later is just a key swap, no code change.
// ============================================================================

const express = require('express');
const db = require('../db/db');
const router = express.Router();

// Initialize Stripe with our secret key (from .env).
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// --- POST /checkout/:bookId — start a purchase --------------------------------
router.post('/:bookId', express.json(), async (req, res) => {
  try {
    // Must be logged in to buy.
    if (!req.session.memberId) {
      return res.status(401).json({ error: 'Please log in to buy.' });
    }

    const bookId = Number(req.params.bookId);
    const book = db.getBookForDisplay(bookId);

    // The book must exist and be live (you can't buy a pending/removed book).
    if (!book || book.status !== 'live') {
      return res.status(404).json({ error: 'Book not available.' });
    }

    // Free books don't go through Stripe — guard against it.
    if (book.price_cents === 0) {
      return res.status(400).json({ error: 'This work is free — no purchase needed.' });
    }

    // Don't let someone buy their own book.
    if (book.publisher_id === req.session.memberId) {
      return res.status(400).json({ error: "You can't buy your own work." });
    }

    // Build the success/cancel URLs (where Stripe sends them after).
    const base = req.protocol + '://' + req.get('host');

    // Create the Stripe checkout session.
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: book.title, description: 'by ' + book.publisher },
          unit_amount: book.price_cents,   // already in cents — Stripe wants cents
        },
        quantity: 1,
      }],
      // We tag the session with who's buying what, so the webhook (Stage 2)
      // knows what to fulfill.
      metadata: {
        bookId: String(bookId),
        memberId: String(req.session.memberId),
      },
      success_url: base + '/members/library.html?purchased=' + bookId,
      cancel_url: base + '/bookDetail.html?id=' + bookId,
    });

    // Send the session URL back; the page will redirect the browser to it.
    res.json({ url: checkoutSession.url });

  } catch (err) {
    console.error('[checkout] error:', err);
    res.status(500).json({ error: 'Could not start checkout.' });
  }
});

module.exports = router;