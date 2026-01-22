import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useRef } from "react";

interface PaywallOverlayProps {
  totalWords: number;
  visibleWords: number;
  percentageShown: number;
}

export function PaywallOverlay({ totalWords, visibleWords, percentageShown }: PaywallOverlayProps) {
  const { user } = useAuth();
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  useEffect(() => {
    if (buttonRef.current) {
      const btn = buttonRef.current;
      btn.style.setProperty('all', 'revert', 'important');
      btn.style.setProperty('background-color', '#000000', 'important');
      btn.style.setProperty('background', '#000000', 'important');
      btn.style.setProperty('color', '#FFFFFF', 'important');
      btn.style.setProperty('opacity', '1', 'important');
      btn.style.setProperty('font-weight', '900', 'important');
      btn.style.setProperty('font-size', '18px', 'important');
      btn.style.setProperty('padding', '18px 44px', 'important');
      btn.style.setProperty('border-radius', '9999px', 'important');
      btn.style.setProperty('border', '4px solid #FFFFFF', 'important');
      btn.style.setProperty('cursor', 'pointer', 'important');
      btn.style.setProperty('text-transform', 'uppercase', 'important');
      btn.style.setProperty('letter-spacing', '1px', 'important');
      btn.style.setProperty('display', 'inline-block', 'important');
      btn.style.setProperty('text-decoration', 'none', 'important');
      btn.style.setProperty('box-shadow', '0 0 0 3px #000000, 0 4px 20px rgba(0,0,0,0.5)', 'important');
      btn.style.setProperty('pointer-events', 'auto', 'important');
      btn.style.setProperty('-webkit-text-fill-color', '#FFFFFF', 'important');
      btn.style.setProperty('filter', 'none', 'important');
      btn.style.setProperty('font-family', 'system-ui, -apple-system, sans-serif', 'important');
      btn.style.setProperty('isolation', 'isolate', 'important');
      btn.style.setProperty('position', 'relative', 'important');
      btn.style.setProperty('z-index', '9999', 'important');
    }
  });
  
  const handleBuyCredits = async () => {
    if (!user) {
      sessionStorage.setItem('redirectAfterLogin', 'stripe-checkout');
      window.location.href = '/auth/google';
      return;
    }
    
    try {
      const response = await fetch('/api/payments/checkout', {
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
    <div style={{ 
      position: 'relative', 
      marginTop: '16px', 
      fontFamily: 'system-ui, -apple-system, sans-serif', 
      isolation: 'isolate', 
      zIndex: 9999,
      all: 'initial'
    }}>
      <div style={{
        background: 'linear-gradient(to bottom, #fffbeb, #fff7ed)',
        border: '3px solid #fbbf24',
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'center',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <div style={{ backgroundColor: '#fef3c7', padding: '12px', borderRadius: '50%' }}>
            <Lock style={{ width: '32px', height: '32px', color: '#d97706' }} />
          </div>
        </div>
        
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937', marginBottom: '8px' }}>
          Content Preview
        </h3>
        
        <p style={{ fontSize: '14px', color: '#4b5563', marginBottom: '16px' }}>
          You're seeing <span style={{ fontWeight: 600, color: '#d97706' }}>{percentageShown}%</span> of this content ({visibleWords.toLocaleString()} of {totalWords.toLocaleString()} words).
          <br />
          <span style={{ fontWeight: 500 }}>{hiddenWords.toLocaleString()} words</span> are hidden.
        </p>
        
        <button
          ref={buttonRef}
          type="button"
          onClick={handleBuyCredits}
          data-testid="button-buy-credits-paywall"
          style={{
            all: 'revert',
            backgroundColor: '#000000',
            background: '#000000',
            color: '#FFFFFF',
            opacity: 1,
            fontWeight: 900,
            fontSize: '18px',
            padding: '18px 44px',
            borderRadius: '9999px',
            border: '4px solid #FFFFFF',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            display: 'inline-block',
            textDecoration: 'none',
            boxShadow: '0 0 0 3px #000000, 0 4px 20px rgba(0,0,0,0.5)',
            pointerEvents: 'auto',
            WebkitTextFillColor: '#FFFFFF',
            filter: 'none',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            isolation: 'isolate',
            position: 'relative',
            zIndex: 9999,
          }}
        >
          BUY CREDITS TO SEE FULL CONTENT
        </button>
        
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>
          $100 = 1,000 credits. Credits are used based on AI model selected.
        </p>
      </div>
    </div>
  );
}
