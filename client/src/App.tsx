import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import HomePage from "@/pages/HomePage";
import TranslationPage from "@/pages/TranslationPage";
import WebSearchPage from "@/pages/WebSearchPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import JobHistoryPage from "@/pages/JobHistoryPage";
import DissertationWizardPage from "@/pages/DissertationWizardPage";
import NotFound from "@/pages/not-found";
import { BrainCircuit, Languages, FileEdit, Globe, Bot, Brain, Mail, User, LogOut, Trash2, History, Eye, Loader2, CreditCard } from "lucide-react";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useState, createContext, useContext, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ActiveJobProvider, useActiveJob } from "@/contexts/ActiveJobContext";
import { JobViewerModal } from "@/components/JobViewerModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditBalance } from "@/components/CreditBalance";
import { BuyCreditsDialog } from "@/components/BuyCreditsDialog";
import neurotextLogo from "@assets/generated_images/robot_thinker_pose_with_book.png";

// Reset Context
interface ResetContextType {
  resetAll: () => void;
}

const ResetContext = createContext<ResetContextType | null>(null);

export function useReset() {
  const context = useContext(ResetContext);
  if (!context) {
    throw new Error("useReset must be used within a ResetProvider");
  }
  return context;
}

function LoginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { loginMutation, registerMutation } = useAuth();
  const [activeTab, setActiveTab] = useState("login");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ username: "", password: "", email: "" });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginForm, {
      onSuccess: () => {
        onOpenChange(false);
        setLoginForm({ username: "", password: "" });
      }
    });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(registerForm, {
      onSuccess: () => {
        onOpenChange(false);
        setRegisterForm({ username: "", password: "", email: "" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Account Access</DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login" className="space-y-4">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="login-username">Username</Label>
                <Input
                  id="login-username"
                  type="text"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  required
                  autoComplete="username"
                  data-testid="input-login-username"
                />
              </div>
              <div>
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  required
                  autoComplete="current-password"
                  data-testid="input-login-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-login">
                {loginMutation.isPending ? "Logging in..." : "Login"}
              </Button>
            </form>
          </TabsContent>
          
          <TabsContent value="register" className="space-y-4">
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <Label htmlFor="register-username">Username</Label>
                <Input
                  id="register-username"
                  type="text"
                  value={registerForm.username}
                  onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                  required
                  data-testid="input-register-username"
                />
              </div>
              <div>
                <Label htmlFor="register-email">Email (optional)</Label>
                <Input
                  id="register-email"
                  type="email"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  data-testid="input-register-email"
                />
              </div>
              <div>
                <Label htmlFor="register-password">Password</Label>
                <Input
                  id="register-password"
                  type="password"
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                  required
                  data-testid="input-register-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="button-register">
                {registerMutation.isPending ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ResetConfirmDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { resetAll } = useReset();

  const handleReset = () => {
    resetAll();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset All Data</DialogTitle>
          <DialogDescription>
            This will clear all your current input and analysis results. You'll start completely fresh. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-reset">
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleReset} data-testid="button-confirm-reset">
            <Trash2 className="h-4 w-4 mr-2" />
            Reset All
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Navigation() {
  const { user, logoutMutation } = useAuth();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [buyCreditsDialogOpen, setBuyCreditsDialogOpen] = useState(false);
  const { activeJob, openViewer } = useActiveJob();

  return (
    <nav className="bg-primary text-primary-foreground py-4">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity" data-testid="link-home">
            <img src={neurotextLogo} alt="NEUROTEXT Logo" className="h-16 w-16 rounded-md" />
            <span className="font-bold text-xl">NEUROTEXT</span>
          </Link>
          <a 
            href="mailto:contact@zhisystems.ai" 
            className="flex items-center gap-2 hover:underline text-sm"
          >
            <Mail className="h-4 w-4" />
            <span>Contact Us</span>
          </a>
          <Link 
            href="/dissertation-wizard" 
            className="flex items-center gap-2 hover:underline text-sm bg-emerald-600/80 text-white px-3 py-1.5 rounded-md"
            data-testid="link-dissertation-wizard"
          >
            <FileEdit className="h-4 w-4" />
            <span>Dissertation Wizard</span>
          </Link>
          <Link 
            href="/job-history" 
            className="flex items-center gap-2 hover:underline text-sm bg-primary-foreground/10 px-3 py-1.5 rounded-md"
            data-testid="link-job-history"
          >
            <History className="h-4 w-4" />
            <span>Job History</span>
          </Link>
          {/* OPEN PROGRESS POPUP - Always visible button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Dispatch custom event to open the streaming modal in HomePage
              window.dispatchEvent(new CustomEvent('openProgressPopup'));
            }}
            className="flex items-center gap-2 text-primary-foreground bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md"
            data-testid="button-open-progress-popup-header"
          >
            <Eye className="h-4 w-4" />
            <span>Open Progress Popup</span>
          </Button>
          {activeJob && activeJob.isProcessing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={openViewer}
              className="flex items-center gap-2 text-primary-foreground bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-md animate-pulse"
              data-testid="button-view-current-job"
            >
              <Eye className="h-4 w-4" />
              <span>View Current Job</span>
              <Loader2 className="h-3 w-3 animate-spin" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setResetDialogOpen(true)}
              className="text-primary-foreground hover:bg-primary-foreground/10"
              data-testid="button-reset-all"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Reset All
            </Button>
            
            <div className="flex items-center gap-4 border-l border-primary-foreground/20 pl-4">
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm">Welcome, {(user as any).displayName || user.username}!</span>
                  <div className="bg-primary-foreground/20 px-2 py-1 rounded">
                    <CreditBalance />
                  </div>
                  <Button
                    onClick={() => setBuyCreditsDialogOpen(true)}
                    className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-sm font-medium"
                    data-testid="button-buy-credits"
                  >
                    <CreditCard className="h-4 w-4" />
                    Buy Credits
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => logoutMutation.mutate()}
                    className="text-primary-foreground hover:bg-primary-foreground/10"
                    data-testid="button-logout"
                  >
                    <LogOut className="h-4 w-4 mr-1" />
                    Logout
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <a
                    href="/auth/google"
                    className="inline-flex items-center gap-2 bg-white text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-gray-100 border border-gray-300"
                    data-testid="button-google-login"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign in with Google
                  </a>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setLoginDialogOpen(true)}
                    className="text-primary-foreground hover:bg-primary-foreground/10"
                    data-testid="button-open-login"
                  >
                    <User className="h-4 w-4 mr-1" />
                    Login / Register
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <LoginDialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen} />
      <ResetConfirmDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen} />
      <BuyCreditsDialog open={buyCreditsDialogOpen} onOpenChange={setBuyCreditsDialogOpen} />
    </nav>
  );
}

function Router({ resetKey }: { resetKey: number }) {
  const { toast } = useToast();
  const { user } = useAuth();

  // Handle redirect to Stripe checkout after login
  useEffect(() => {
    if (user) {
      const redirectAction = sessionStorage.getItem('redirectAfterLogin');
      if (redirectAction === 'stripe-checkout') {
        sessionStorage.removeItem('redirectAfterLogin');
        // Redirect to Stripe checkout
        const initiateCheckout = async () => {
          try {
            const response = await apiRequest("POST", "/api/payments/checkout", {});
            const data = await response.json();
            if (data.url) {
              window.location.href = data.url;
            }
          } catch (error) {
            console.error("Failed to create checkout session:", error);
            toast({
              title: "Error",
              description: "Failed to start checkout. Please try again.",
              variant: "destructive",
            });
          }
        };
        initiateCheckout();
      }
    }
  }, [user, toast]);

  // Handle return from Stripe checkout - verify payment and add credits
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const sessionId = params.get('session_id');

    if (paymentStatus === 'success' && sessionId && user) {
      // Verify the payment and add credits
      const verifyPayment = async () => {
        try {
          const response = await apiRequest("POST", "/api/payments/verify-session", { sessionId });
          const data = await response.json();
          
          if (data.success) {
            toast({
              title: "Payment Successful!",
              description: `${data.credits} credits have been added to your account.`,
            });
          }
        } catch (error: any) {
          console.error("Payment verification error:", error);
        }
        
        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);
      };

      verifyPayment();
    } else if (paymentStatus === 'cancelled') {
      toast({
        title: "Payment Cancelled",
        description: "Your payment was cancelled. No credits were added.",
        variant: "destructive",
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [user, toast]);

  return (
    <>
      <Navigation />
      <Switch key={resetKey}>
        <Route path="/" component={HomePage} />
        <Route path="/dissertation-wizard" component={DissertationWizardPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/job-history" component={JobHistoryPage} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  const [resetKey, setResetKey] = useState(0);

  const resetAll = () => {
    // Clear app-specific localStorage (preserve auth and theme)
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cap:')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Remount Router to reset all component state
    setResetKey(prev => prev + 1);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ActiveJobProvider>
          <ResetContext.Provider value={{ resetAll }}>
            <TooltipProvider>
              <Toaster />
              <Router resetKey={resetKey} />
              <JobViewerModal />
            </TooltipProvider>
          </ResetContext.Provider>
        </ActiveJobProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
