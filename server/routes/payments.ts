import type { Express, Request, Response } from "express";
import { stripe, isStripeConfigured, NEUROTEXT_CREDITS_PACKAGE, hasUnlimitedCredits } from "../lib/stripe-config";
import { storage } from "../storage";

export function registerPaymentRoutes(app: Express) {
  // Create Stripe Checkout Session for $100 NeuroText Credits package
  app.post("/api/payments/checkout", async (req: Request, res: Response) => {
    try {
      if (!isStripeConfigured || !stripe) {
        return res.status(503).json({ message: "Payment system not configured" });
      }

      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Check if user has unlimited credits (JMK)
      if (hasUnlimitedCredits(req.user.username)) {
        return res.status(400).json({ 
          message: "You have unlimited credits and don't need to purchase more" 
        });
      }

      // Get the price ID from environment
      const priceId = process.env.STRIPE_PRICE_ID_100;
      if (!priceId) {
        return res.status(503).json({ message: "Stripe price not configured" });
      }

      // Create pending transaction
      const transaction = await storage.createCreditTransaction({
        userId: req.user.id,
        provider: "neurotext",
        amount: NEUROTEXT_CREDITS_PACKAGE.priceInCents,
        credits: NEUROTEXT_CREDITS_PACKAGE.credits,
        transactionType: "purchase",
        status: "pending",
        metadata: { package: "neurotext-100" },
      });

      // Build success/cancel URLs
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : 'http://localhost:5000';

      // Create Stripe Checkout Session using the pre-configured Price ID
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${baseUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}?payment=cancelled`,
        client_reference_id: String(req.user.id),
        metadata: {
          userId: String(req.user.id),
          credits: String(NEUROTEXT_CREDITS_PACKAGE.credits),
          transactionId: String(transaction.id),
        },
      });

      // Update transaction with Stripe session ID
      await storage.updateCreditTransactionSessionId(transaction.id, session.id);

      res.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
      console.error("Checkout error:", error);
      res.status(500).json({ message: "Error creating checkout session", error: error.message });
    }
  });

  // Stripe Webhook Handler
  app.post("/api/payments/webhook", async (req: Request, res: Response) => {
    if (!isStripeConfigured || !stripe) {
      return res.status(503).send("Payment system not configured");
    }

    const sig = req.headers["stripe-signature"];
    
    if (!sig) {
      return res.status(400).send("No signature");
    }

    let event: any;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      
      try {
        const userId = parseInt(session.metadata.userId);
        const credits = parseInt(session.metadata.credits);
        const transactionId = parseInt(session.metadata.transactionId);

        // Get current credits or initialize for "neurotext" provider (general credits)
        let userCredits = await storage.getUserCredits(userId, "neurotext");
        if (!userCredits) {
          userCredits = await storage.initializeUserCredits(userId, "neurotext");
        }

        // Add 1000 credits
        await storage.updateUserCredits(
          userId,
          "neurotext",
          userCredits.credits + credits
        );

        // Update transaction status
        await storage.updateCreditTransactionStatus(
          transactionId,
          "completed",
          session.payment_intent as string
        );

        console.log(`✅ Credits added: ${credits} NeuroText credits for user ${userId}`);
      } catch (error) {
        console.error("Error processing webhook:", error);
      }
    }

    res.json({ received: true });
  });

  // Get user credit balance
  app.get("/api/credits/balance", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.json({
          credits: 0,
          total: 0,
          unlimited: false,
        });
      }

      // Check for unlimited credits
      if (hasUnlimitedCredits(req.user.username)) {
        return res.json({
          credits: Infinity,
          total: Infinity,
          unlimited: true,
        });
      }

      const credits = await storage.getAllUserCredits(req.user.id);
      
      let total = 0;
      credits.forEach((credit) => {
        total += credit.credits;
      });

      res.json({
        credits: total,
        total: total,
        unlimited: false,
      });
    } catch (error: any) {
      console.error("Error fetching balance:", error);
      res.status(500).json({ message: "Error fetching credit balance" });
    }
  });
}
