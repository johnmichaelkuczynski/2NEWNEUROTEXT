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

export { checkUnlimited as hasUnlimitedCredits };
