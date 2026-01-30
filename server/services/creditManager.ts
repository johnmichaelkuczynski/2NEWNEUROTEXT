import { storage } from "../storage";
import { hasUnlimitedCredits as checkUnlimited } from "../lib/stripe-config";

// Token multipliers for credit calculation
// Credits = tokens generated * multiplier
export const TOKEN_MULTIPLIERS: Record<string, number> = {
  deepseek: 1,
  grok: 3,
  openai: 5,
  chatgpt: 5,
  anthropic: 7,
  claude: 7,
  perplexity: 7,
};

// Calculate credits from tokens generated
export function calculateCreditsFromTokens(tokensGenerated: number, provider: string): number {
  const normalizedProvider = provider.toLowerCase();
  const multiplier = TOKEN_MULTIPLIERS[normalizedProvider] || TOKEN_MULTIPLIERS.openai;
  return Math.ceil(tokensGenerated * multiplier);
}

export async function checkAndDeductCredits(
  userId: number | undefined,
  username: string | undefined,
  provider: string,
  tokensGenerated?: number
): Promise<{ success: boolean; error?: string; creditsDeducted?: number }> {
  if (!userId) {
    return { success: false, error: "User not authenticated" };
  }

  if (checkUnlimited(username)) {
    return { success: true, creditsDeducted: 0 };
  }

  // Calculate credits based on tokens if provided, otherwise use minimum cost
  const cost = tokensGenerated 
    ? calculateCreditsFromTokens(tokensGenerated, provider)
    : getMinimumCost(provider);

  const totalCredits = await storage.getTotalUserCredits(userId);

  if (totalCredits < cost) {
    return {
      success: false,
      error: `Insufficient credits. You have ${totalCredits} credits but need ${cost} for ${provider}. Please buy more credits.`,
    };
  }

  // Get all credit buckets and deduct from those with positive balance
  const allCredits = await storage.getAllUserCredits(userId);
  let remaining = cost;
  
  for (const bucket of allCredits) {
    if (remaining <= 0) break;
    if (bucket.credits <= 0) continue;
    
    const toDeduct = Math.min(bucket.credits, remaining);
    const deducted = await storage.deductCredits(userId, bucket.provider, toDeduct);
    if (deducted) {
      remaining -= toDeduct;
    }
  }
  
  if (remaining > 0) {
    return {
      success: false,
      error: `Failed to deduct all credits. Please try again or contact support.`,
    };
  }

  console.log(`[CreditManager] Deducted ${cost} credits for ${provider} from user ${userId} (tokens: ${tokensGenerated || 'N/A'})`);
  return { success: true, creditsDeducted: cost };
}

// Get minimum cost for a provider (for pre-checks before token count is known)
export function getMinimumCost(provider: string): number {
  const normalizedProvider = provider.toLowerCase();
  // Minimum cost is 1 token * multiplier
  return TOKEN_MULTIPLIERS[normalizedProvider] || TOKEN_MULTIPLIERS.openai;
}

export function getCreditCost(provider: string, tokensGenerated: number = 1): number {
  return calculateCreditsFromTokens(tokensGenerated, provider);
}

export function getMultiplier(provider: string): number {
  const normalizedProvider = provider.toLowerCase();
  return TOKEN_MULTIPLIERS[normalizedProvider] || TOKEN_MULTIPLIERS.openai;
}

// Check if user has credits without deducting - returns word limit
// Users with credits: unlimited words, Users without: specific limits per function
export const FREEMIUM_WORD_LIMIT = 500; // Main reconstruction
export const FREEMIUM_LIMITS = {
  reconstruction: 500,
  screenplay: 750,
  chat: 750,
  document: 750,
  outline: 750,
  coherence: 300,
};

// Helper to truncate text to word limit
export function truncateToWordLimit(text: string, maxWords: number): { text: string; wasTruncated: boolean; originalWords: number } {
  const words = text.trim().split(/\s+/);
  const originalWords = words.length;
  if (words.length <= maxWords) {
    return { text, wasTruncated: false, originalWords };
  }
  const truncated = words.slice(0, maxWords).join(' ');
  return { 
    text: truncated + '\n\n[OUTPUT TRUNCATED - Purchase credits to unlock full content]', 
    wasTruncated: true, 
    originalWords 
  };
}

export async function getUserWordLimit(
  userId: number | undefined,
  username: string | undefined
): Promise<{ hasCredits: boolean; wordLimit: number | null }> {
  // Unlimited users get no word limit
  if (checkUnlimited(username)) {
    return { hasCredits: true, wordLimit: null };
  }

  // Not logged in - hard 500 word limit
  if (!userId) {
    return { hasCredits: false, wordLimit: FREEMIUM_WORD_LIMIT };
  }

  // Check if user has any credits
  const totalCredits = await storage.getTotalUserCredits(userId);
  
  if (totalCredits > 0) {
    return { hasCredits: true, wordLimit: null };
  }

  // No credits - 500 word limit
  return { hasCredits: false, wordLimit: FREEMIUM_WORD_LIMIT };
}

export { checkUnlimited as hasUnlimitedCredits };
