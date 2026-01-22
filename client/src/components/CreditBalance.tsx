import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";

interface CreditBalanceData {
  credits: number;
  total: number;
  unlimited: boolean;
}

export function CreditBalance() {
  const { data: credits } = useQuery<CreditBalanceData>({
    queryKey: ["/api/credits/balance"],
    refetchInterval: 3000, // Refetch every 3 seconds for real-time updates
  });

  if (!credits) return null;

  const formatCredits = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "0";
    if (amount === Number.POSITIVE_INFINITY) return "Unlimited";
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toString();
  };

  return (
    <div className="flex items-center gap-2 text-sm" data-testid="credit-balance-container">
      <CreditCard className="h-4 w-4" />
      <span className="font-medium whitespace-nowrap" data-testid="total-credits">
        Credits: {credits.unlimited ? "Unlimited" : formatCredits(credits.total)}
      </span>
    </div>
  );
}
