import { Button } from "@/components/ui/button";
import { Lock, CreditCard } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface PaywallOverlayProps {
  totalWords: number;
  visibleWords: number;
  percentageShown: number;
}

export function PaywallOverlay({ totalWords, visibleWords, percentageShown }: PaywallOverlayProps) {
  const { user } = useAuth();
  
  const handleBuyCredits = async () => {
    if (!user) {
      sessionStorage.setItem('redirectAfterLogin', 'stripe-checkout');
      window.location.href = '/api/login';
      return;
    }
    
    try {
      const response = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      
      if (response.ok) {
        const { url } = await response.json();
        if (url) {
          window.location.href = url;
        }
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
    }
  };
  
  const hiddenWords = totalWords - visibleWords;
  
  return (
    <div className="relative mt-4">
      <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-gray-900 via-white/95 dark:via-gray-900/95 to-transparent pointer-events-none" style={{ height: '150px', bottom: 0, top: 'auto' }} />
      
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-2 border-amber-300 dark:border-amber-700 rounded-lg p-6 text-center shadow-lg">
        <div className="flex justify-center mb-3">
          <div className="bg-amber-100 dark:bg-amber-900/50 p-3 rounded-full">
            <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
          Content Preview
        </h3>
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          You're seeing <span className="font-semibold text-amber-600">{percentageShown}%</span> of this content ({visibleWords.toLocaleString()} of {totalWords.toLocaleString()} words).
          <br />
          <span className="font-medium">{hiddenWords.toLocaleString()} words</span> are hidden.
        </p>
        
        <Button
          onClick={handleBuyCredits}
          className="bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 font-bold px-8 py-3 text-base shadow-md"
          data-testid="button-buy-credits-paywall"
        >
          <CreditCard className="w-5 h-5 mr-2" />
          Buy Credits to See Full Content
        </Button>
        
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
          $100 = 1,000 credits. Credits are used based on AI model selected.
        </p>
      </div>
    </div>
  );
}
