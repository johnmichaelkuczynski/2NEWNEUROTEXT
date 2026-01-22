import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BrainCircuit, Bot, Sparkles, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type LLMProvider = "zhi1" | "zhi2" | "zhi3" | "zhi4" | "zhi5" | "all";

interface ProviderSelectorProps {
  selectedProvider: LLMProvider;
  onProviderChange: (provider: LLMProvider) => void;
  className?: string;
  label?: string;
  smallSize?: boolean;
  apiStatus?: Record<string, boolean>;
  showTooltips?: boolean;
}

const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  selectedProvider,
  onProviderChange,
  className = "",
  label = "AI Provider",
  smallSize = false,
  apiStatus = { openai: true, anthropic: true, perplexity: true },
  showTooltips = true
}) => {
  return (
    <div className={`flex ${smallSize ? "flex-row items-center gap-2" : "flex-col gap-1.5"} ${className}`}>
      <div className="flex items-center gap-2">
        {label && <Label className={smallSize ? "min-w-24" : ""}>{label}</Label>}
        {showTooltips && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs p-3">
                <p className="font-medium mb-2">ZHI Model Guide</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <span><span className="font-semibold">ZHI 1</span> — General purpose, follows instructions best</span>
                    <span className="text-amber-500 flex-shrink-0">$$$</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span><span className="font-semibold">ZHI 2</span> — Complex writing, long documents</span>
                    <span className="text-amber-500 flex-shrink-0">$$$$</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span><span className="font-semibold">ZHI 3</span> — Math & logic</span>
                    <span className="text-green-500 flex-shrink-0">$</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span><span className="font-semibold">ZHI 4</span> — Factual lookup with sources</span>
                    <span className="text-amber-500 flex-shrink-0">$$$$</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span><span className="font-semibold">ZHI 5</span> — Casual, current events</span>
                    <span className="text-yellow-500 flex-shrink-0">$$</span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <Select value={selectedProvider} onValueChange={(value) => onProviderChange(value as LLMProvider)}>
        <SelectTrigger className={`${smallSize ? "h-8" : ""} min-w-[220px]`}>
          <SelectValue placeholder="Select AI provider" />
        </SelectTrigger>
        <SelectContent>
          {apiStatus.openai && (
            <SelectItem 
              value="zhi1" 
              className="flex items-center"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-green-600" />
                <span>ZHI 1</span>
              </div>
            </SelectItem>
          )}
          {apiStatus.anthropic && (
            <SelectItem 
              value="zhi2" 
              className="flex items-center"
            >
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-purple-600" />
                <span>ZHI 2</span>
              </div>
            </SelectItem>
          )}
          {apiStatus.deepseek && (
            <SelectItem 
              value="zhi3" 
              className="flex items-center"
            >
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-orange-600" />
                <span>ZHI 3</span>
              </div>
            </SelectItem>
          )}
          {apiStatus.perplexity && (
            <SelectItem 
              value="zhi4" 
              className="flex items-center"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal-600" />
                <span>ZHI 4</span>
              </div>
            </SelectItem>
          )}
          {apiStatus.grok && (
            <SelectItem 
              value="zhi5" 
              className="flex items-center"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <span>ZHI 5</span>
              </div>
            </SelectItem>
          )}
          {/* Compare Providers option temporarily removed */}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ProviderSelector;