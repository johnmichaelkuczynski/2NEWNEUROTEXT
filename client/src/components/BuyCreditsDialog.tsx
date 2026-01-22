import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { loadStripe } from "@stripe/stripe-js";

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

interface BuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BuyCreditsDialog({ open, onOpenChange }: BuyCreditsDialogProps) {
  const { toast } = useToast();

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/payments/checkout", {});
      return await response.json();
    },
    onSuccess: async (data) => {
      const stripe = await stripePromise;
      if (!stripe) {
        toast({ title: "Error", description: "Stripe failed to load", variant: "destructive" });
        return;
      }
      
      // Save pending purchase state
      localStorage.setItem("neurotext:pending-purchase", JSON.stringify({
        timestamp: Date.now(),
        amount: 100,
        credits: 1000,
      }));
      
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create checkout session",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Buy NeuroText Credits
          </DialogTitle>
          <DialogDescription>
            Purchase credits for AI-powered text analysis and reconstruction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <Card className="p-6 border-2 border-primary bg-primary/5">
            <div className="text-center space-y-4">
              <div className="text-4xl font-bold text-primary">$100</div>
              <div className="text-2xl font-semibold">1,000 Credits</div>
              <p className="text-muted-foreground">
                Use credits for AI-powered text reconstruction, coherence analysis, and document expansion.
              </p>
            </div>
          </Card>

          <Button
            onClick={() => checkoutMutation.mutate()}
            disabled={checkoutMutation.isPending}
            className="w-full h-12 text-lg"
            data-testid="button-checkout"
          >
            {checkoutMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Purchase Credits - $100
              </>
            )}
          </Button>
          
          <p className="text-xs text-center text-muted-foreground">
            Secure payment powered by Stripe. Credits are non-refundable.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
