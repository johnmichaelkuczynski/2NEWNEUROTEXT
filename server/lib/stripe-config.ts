import Stripe from "stripe";

// Stripe is optional - app can run without payment functionality
export const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export const isStripeConfigured = !!process.env.STRIPE_SECRET_KEY;

// Log Stripe configuration status at module load
console.log(`[Stripe] Configuration status: ${isStripeConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
console.log(`[Stripe] Webhook secret: ${process.env.STRIPE_WEBHOOK_SECRET ? 'SET' : 'NOT SET'}`);
console.log(`[Stripe] Price ID $100: ${process.env.STRIPE_PRICE_ID_100 ? 'SET' : 'NOT SET'}`);

// Single $100 package: 1000 credits
export const NEUROTEXT_CREDITS_PACKAGE = {
  priceInCents: 10000, // $100
  credits: 1000,
  priceId: process.env.STRIPE_PRICE_ID_100,
};

// Helper to check if user has unlimited credits
export function hasUnlimitedCredits(username: string | undefined): boolean {
  // No users have unlimited credits - all users must purchase credits
  return false;
}

// Calculate token count from text (rough estimate: 1 token ≈ 4 characters)
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
