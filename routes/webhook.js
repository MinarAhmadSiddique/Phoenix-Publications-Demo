// ============================================================================
// PHOENIX PUBLICATIONS — routes/webhook.js
// ============================================================================
// Stripe's server-to-server callback. After a payment, Stripe POSTs here to
// tell us it completed. This — NOT the browser redirect — is what we trust to
// record the purchase. We verify Stripe's signature so we know it's really them.
// ============================================================================

const express = require('express');
const db = require('../db/db');
const router = express.Router();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// IMPORTANT: this route uses express.raw, NOT express.json. Signature
// verification needs the EXACT raw bytes Stripe sent — parsing to JSON first
// would change them and break the signature check.
router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['stripe-signature'];
  let event;

  try {
    // Verify the signature: proves this really came from Stripe (not a faker).
    event = stripe.webhooks.constructEvent(
      req.body,                              // the raw bytes
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[webhook] signature verification failed:', err.message);
    return res.status(400).send('Webhook signature verification failed.');
  }

  // We care about one event: a checkout that completed (payment succeeded).
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // The metadata we attached when creating the session (Stage 1).
    const bookId = Number(session.metadata.bookId);
    const memberId = Number(session.metadata.memberId);
    const priceCents = session.amount_total;            // what they actually paid
    const stripePaymentId = session.payment_intent;     // Stripe's payment id

    try {
      const isNew = db.recordPurchase(memberId, bookId, priceCents, stripePaymentId);
      if (isNew) {
        console.log(`[webhook] Purchase recorded: member ${memberId} bought book ${bookId}`);
      } else {
        console.log(`[webhook] Duplicate webhook ignored: member ${memberId}, book ${bookId}`);
      }
    } catch (err) {
      console.error('[webhook] failed to record purchase:', err);
      // Return 500 so Stripe RETRIES (the purchase didn't get recorded).
      return res.status(500).send('Could not record purchase.');
    }
  }

  // Acknowledge receipt so Stripe stops sending this event.
  res.json({ received: true });
});

module.exports = router;