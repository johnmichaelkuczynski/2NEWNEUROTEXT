import React from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Send, ArrowRight, MessageSquare, Zap, Brain, FileEdit, MessageSquareWarning, ShieldCheck, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SendToButtonProps {
  text: string;
  onSendToHumanizer?: (text: string) => void;
  onSendToIntelligence?: (text: string) => void;
  onSendToChat?: (text: string) => void;
  onSendToValidator?: (text: string) => void;
  onSendToObjections?: (text: string) => void;
  onSendToObjectionProof?: (text: string) => void;
  onSendToRefiner?: (text: string) => void;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export const SendToButton: React.FC<SendToButtonProps> = ({ 
  text, 
  onSendToHumanizer,
  onSendToIntelligence,
  onSendToChat,
  onSendToValidator,
  onSendToObjections,
  onSendToObjectionProof,
  onSendToRefiner,
  variant = "outline", 
  size = "sm",
  className = ""
}) => {
  const { toast } = useToast();

  const handleSendTo = (destination: string, callback?: (text: string) => void) => {
    if (callback) {
      callback(text);
      toast({
        title: `Sent to ${destination}`,
        description: `Text has been sent to ${destination} successfully`
      });
    }
  };

  const destinations = [
    { 
      label: "Humanizer", 
      icon: Zap, 
      callback: onSendToHumanizer,
      available: !!onSendToHumanizer 
    },
    { 
      label: "Intelligence Analysis", 
      icon: Brain, 
      callback: onSendToIntelligence,
      available: !!onSendToIntelligence 
    },
    { 
      label: "AI Chat", 
      icon: MessageSquare, 
      callback: onSendToChat,
      available: !!onSendToChat 
    },
    { 
      label: "NEUROTEXT", 
      icon: FileEdit, 
      callback: onSendToValidator,
      available: !!onSendToValidator 
    },
    { 
      label: "Objections Function", 
      icon: MessageSquareWarning, 
      callback: onSendToObjections,
      available: !!onSendToObjections 
    },
    { 
      label: "Objection-Proof Version", 
      icon: ShieldCheck, 
      callback: onSendToObjectionProof,
      available: !!onSendToObjectionProof 
    },
    { 
      label: "Signal Refiner", 
      icon: Filter, 
      callback: onSendToRefiner,
      available: !!onSendToRefiner 
    }
  ].filter(dest => dest.available);

  if (destinations.length === 0) {
    return null;
  }

  if (destinations.length === 1) {
    const dest = destinations[0];
    return (
      <Button
        variant={variant}
        size={size}
        onClick={() => handleSendTo(dest.label, dest.callback)}
        className={`gap-2 ${className}`}
      >
        <dest.icon className="h-4 w-4" />
        Send to {dest.label}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={`gap-2 ${className}`} data-testid="button-send-to-menu">
          <Send className="h-4 w-4" />
          Send To
          <ArrowRight className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {destinations.map((dest) => (
          <DropdownMenuItem
            key={dest.label}
            onClick={() => handleSendTo(dest.label, dest.callback)}
            className="cursor-pointer"
            data-testid={`menuitem-send-to-${dest.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <dest.icon className="h-4 w-4 mr-2" />
            {dest.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SendToButton;
