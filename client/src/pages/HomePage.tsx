import React, { useState, useEffect, useRef } from "react";
import ModeToggle from "@/components/ModeToggle";
import DocumentInput from "@/components/DocumentInput";
import DocumentResults from "@/components/DocumentResults";
import ComparativeResults from "@/components/ComparativeResults";
import AIDetectionModal from "@/components/AIDetectionModal";
import ProviderSelector, { LLMProvider } from "@/components/ProviderSelector";

import ChatDialog from "@/components/ChatDialog";
import SemanticDensityAnalyzer from "@/components/SemanticDensityAnalyzer";
import CaseAssessmentModal from "@/components/CaseAssessmentModal";
import { DocumentComparisonModal } from "@/components/DocumentComparisonModal";
import { FictionAssessmentModal } from "@/components/FictionAssessmentModal";
import { FictionAssessmentPopup } from "@/components/FictionAssessmentPopup";
import { FictionComparisonModal } from "@/components/FictionComparisonModal";
import { TextStats } from "@/components/TextStats";
import { CCStreamingUI } from "@/components/CCStreamingUI";
import { StreamingOutputModal } from "@/components/StreamingOutputModal";
import { FreemiumContent } from "@/components/FreemiumContent";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Brain, Trash2, FileEdit, Loader2, Zap, Clock, Sparkles, Download, Shield, ShieldCheck, RefreshCw, Upload, FileText, BookOpen, BarChart3, AlertCircle, FileCode, Search, Copy, CheckCircle, Target, ChevronUp, ChevronDown, MessageSquareWarning, Circle, ArrowRight, Settings, ScanText, X, Play, Eye, Film, Send } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { analyzeDocument, compareDocuments, checkForAI } from "@/lib/analysis";
import { AnalysisMode, DocumentInput as DocumentInputType, AIDetectionResult, DocumentAnalysis, DocumentComparison } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import CopyButton from "@/components/CopyButton";
import SendToButton from "@/components/SendToButton";
import { MathRenderer } from "@/components/MathRenderer";

// Utility function to strip markdown formatting from AI outputs
const stripMarkdown = (text: string): string => {
  if (!text) return text;
  return text
    // Remove headers (## or ###, etc.)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold (**text** or __text__)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // Remove italic (*text* or _text_) - be careful not to remove bullet points
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    // Remove code blocks (```...```)
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, '').replace(/```/g, ''))
    // Remove inline code (`code`)
    .replace(/`([^`]+)`/g, '$1')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Clean up excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const HomePage: React.FC = () => {
  const { toast } = useToast();
  
  // State for analysis mode
  const [mode, setMode] = useState<AnalysisMode>("single");
  
  // State for analysis type (quick vs comprehensive)
  const [analysisType, setAnalysisType] = useState<"quick" | "comprehensive">("quick");

  // State for document inputs
  const [documentA, setDocumentA] = useState<DocumentInputType>({ content: "" });
  const [documentB, setDocumentB] = useState<DocumentInputType>({ content: "" });

  // State for analysis results
  const [analysisA, setAnalysisA] = useState<DocumentAnalysis | null>(null);
  const [analysisB, setAnalysisB] = useState<DocumentAnalysis | null>(null);
  const [comparison, setComparison] = useState<DocumentComparison | null>(null);



  // State for loading indicators
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [isAICheckLoading, setIsAICheckLoading] = useState(false);

  // State for showing results section
  const [showResults, setShowResults] = useState(false);

  // State for AI detection
  const [aiDetectionModalOpen, setAIDetectionModalOpen] = useState(false);
  const [currentAICheckDocument, setCurrentAICheckDocument] = useState<"A" | "B">("A");
  const [aiDetectionResult, setAIDetectionResult] = useState<AIDetectionResult | undefined>(undefined);


  
  // State for case assessment
  const [caseAssessmentModalOpen, setCaseAssessmentModalOpen] = useState(false);
  const [caseAssessmentResult, setCaseAssessmentResult] = useState<any>(null);
  const [isCaseAssessmentLoading, setIsCaseAssessmentLoading] = useState(false);
  
  // State for document comparison
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<any>(null);
  const [isComparisonLoading, setIsComparisonLoading] = useState(false);
  
  // State for fiction assessment
  const [fictionAssessmentModalOpen, setFictionAssessmentModalOpen] = useState(false);
  const [fictionComparisonModalOpen, setFictionComparisonModalOpen] = useState(false);
  const [currentFictionDocument, setCurrentFictionDocument] = useState<"A" | "B">("A");
  const [isFictionAssessmentLoading, setIsFictionAssessmentLoading] = useState(false);
  const [fictionAssessmentResult, setFictionAssessmentResult] = useState<any>(null);
  
  // Standalone Fiction Assessment Popup State
  const [fictionPopupOpen, setFictionPopupOpen] = useState(false);

  // State for maximize intelligence feature
  const [maximizeIntelligenceModalOpen, setMaximizeIntelligenceModalOpen] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [useExternalKnowledge, setUseExternalKnowledge] = useState(false);
  const [isMaximizeIntelligenceLoading, setIsMaximizeIntelligenceLoading] = useState(false);
  const [rewriteResult, setRewriteResult] = useState<string>("");
  const [rewriteResultsModalOpen, setRewriteResultsModalOpen] = useState(false);
  const [rewriteResultData, setRewriteResultData] = useState<any>(null);
  
  
  // Streaming state for real-time analysis
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

  // Default instructions for maximize intelligence
  const defaultInstructions = `REWRITE IN SUCH THAT THE RESULTING DOCUMENT SCORES MAXIMALLY HIGH ON EACH OF THE FOLLOWING QUESTIONS (SO FAR AS THAT IS POSSIBLE WITHOUT TOTALLY CHANGING THE CONTENT), THE QUESTIONS IN QUESTION BEING:

IS IT INSIGHTFUL?
DOES IT DEVELOP POINTS? (OR, IF IT IS A SHORT EXCERPT, IS THERE EVIDENCE THAT IT WOULD DEVELOP POINTS IF EXTENDED)?
IS THE ORGANIZATION MERELY SEQUENTIAL (JUST ONE POINT AFTER ANOTHER, LITTLE OR NO LOGICAL SCAFFOLDING)? OR ARE THE IDEAS ARRANGED, NOT JUST SEQUENTIALLY BUT HIERARCHICALLY?
IF THE POINTS IT MAKES ARE NOT INSIGHTFUL, DOES IT OPERATE SKILLFULLY WITH CANONS OF LOGIC/REASONING.
ARE THE POINTS CLICHES? OR ARE THEY "FRESH"?
DOES IT USE TECHNICAL JARGON TO OBFUSCATE OR TO RENDER MORE PRECISE?
IS IT ORGANIC? DO POINTS DEVELOP IN AN ORGANIC, NATURAL WAY? DO THEY 'UNFOLD'? OR ARE THEY FORCED AND ARTIFICIAL?
DOES IT OPEN UP NEW DOMAINS? OR, ON THE CONTRARY, DOES IT SHUT OFF INQUIRY (BY CONDITIONALIZING FURTHER DISCUSSION OF THE MATTERS ON ACCEPTANCE OF ITS INTERNAL AND POSSIBLY VERY FAULTY LOGIC)?
IS IT ACTUALLY INTELLIGENT OR JUST THE WORK OF SOMEBODY WHO, JUDGING BY THE SUBJECT-MATTER, IS PRESUMED TO BE INTELLIGENT (BUT MAY NOT BE)?
IS IT REAL OR IS IT PHONY?
DO THE SENTENCES EXHIBIT COMPLEX AND COHERENT INTERNAL LOGIC?
IS THE PASSAGE GOVERNED BY A STRONG CONCEPT? OR IS THE ONLY ORGANIZATION DRIVEN PURELY BY EXPOSITORY (AS OPPOSED TO EPISTEMIC) NORMS?
IS THERE SYSTEM-LEVEL CONTROL OVER IDEAS? IN OTHER WORDS, DOES THE AUTHOR SEEM TO RECALL WHAT HE SAID EARLIER AND TO BE IN A POSITION TO INTEGRATE IT INTO POINTS HE HAS MADE SINCE THEN?
ARE THE POINTS 'REAL'? ARE THEY FRESH? OR IS SOME INSTITUTION OR SOME ACCEPTED VEIN OF PROPAGANDA OR ORTHODOXY JUST USING THE AUTHOR AS A MOUTH PIECE?
IS THE WRITING EVASIVE OR DIRECT?
ARE THE STATEMENTS AMBIGUOUS?
DOES THE PROGRESSION OF THE TEXT DEVELOP ACCORDING TO WHO SAID WHAT OR ACCORDING TO WHAT ENTAILS OR CONFIRMS WHAT?
DOES THE AUTHOR USE OTHER AUTHORS TO DEVELOP HIS IDEAS OR TO CLOAK HIS OWN LACK OF IDEAS?`;
  
  // State for LLM provider
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>("zhi1");

  // GPT Bypass Humanizer State - Following Exact Protocol
  const [boxA, setBoxA] = useState(""); // AI text to humanize
  const [boxB, setBoxB] = useState(""); // Human style sample  
  const [boxC, setBoxC] = useState(""); // Humanized output
  const [boxAScore, setBoxAScore] = useState<number | null>(null);
  const [boxBScore, setBoxBScore] = useState<number | null>(null);
  const [boxCScore, setBoxCScore] = useState<number | null>(null);
  const [humanizerCustomInstructions, setHumanizerCustomInstructions] = useState("");
  const [selectedStylePresets, setSelectedStylePresets] = useState<string[]>([]);
  const [selectedWritingSample, setSelectedWritingSample] = useState("Content-Neutral|Formal and Functional Relationships");
  const [humanizerProvider, setHumanizerProvider] = useState<LLMProvider>("zhi2"); // ZHI 2 default
  const [isHumanizerLoading, setIsHumanizerLoading] = useState(false);
  const [isReRewriteLoading, setIsReRewriteLoading] = useState(false);
  const [writingSamples, setWritingSamples] = useState<any>({});
  const [stylePresets, setStylePresets] = useState<any>({});
  const [chunks, setChunks] = useState<any[]>([]);
  const [selectedChunkIds, setSelectedChunkIds] = useState<string[]>([]);
  const [showChunkSelector, setShowChunkSelector] = useState(false);
  
  // Text Model Validator State
  const [validatorInputText, setValidatorInputText] = useState("");
  const [uploadedDocuments, setUploadedDocuments] = useState<Array<{id: string; filename: string; content: string; wordCount: number}>>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [libraryInstructions, setLibraryInstructions] = useState("");
  const [libraryDragOver, setLibraryDragOver] = useState(false);
  const [dwUploadedDocuments, setDwUploadedDocuments] = useState<Array<{id: string; filename: string; content: string; wordCount: number}>>([]);
  const [dwSelectedDocumentIds, setDwSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [dwLibraryInstructions, setDwLibraryInstructions] = useState("");
  const [dwLibraryDragOver, setDwLibraryDragOver] = useState(false);
  const [validatorMode, setValidatorMode] = useState<"reconstruction" | null>(null);
  const [validatorDragOver, setValidatorDragOver] = useState(false);
  const [validatorOutput, setValidatorOutput] = useState<string>("");
  const [validatorLoading, setValidatorLoading] = useState(false);
  const [validatorProgress, setValidatorProgress] = useState<string>(""); // Progress message for long docs
  // Multi-mode batch processing
  const [validatorMultiMode, setValidatorMultiMode] = useState(false);
  const [validatorSelectedModes, setValidatorSelectedModes] = useState<string[]>([]);
  const [validatorBatchResults, setValidatorBatchResults] = useState<Array<{mode: string; success: boolean; output?: string; error?: string}>>([]);
  const [validatorBatchLoading, setValidatorBatchLoading] = useState(false);
  const [validatorTargetDomain, setValidatorTargetDomain] = useState("");
  const [validatorFidelityLevel, setValidatorFidelityLevel] = useState<"conservative" | "aggressive">("aggressive");
  const [validatorMathFramework, setValidatorMathFramework] = useState("variational-inference");
  const [validatorConstraintType, setValidatorConstraintType] = useState<"pure-swap" | "true-statements" | "historical">("pure-swap");
  const [validatorRigorLevel, setValidatorRigorLevel] = useState<"sketch" | "semi-formal" | "proof-ready">("semi-formal");
  const [showValidatorCustomization, setShowValidatorCustomization] = useState(false);
  const [validatorCustomInstructions, setValidatorCustomInstructions] = useState("");
  const [showRedoModal, setShowRedoModal] = useState(false);
  const [redoCustomInstructions, setRedoCustomInstructions] = useState("");
  const [validatorTruthMapping, setValidatorTruthMapping] = useState<"false-to-true" | "true-to-true" | "true-to-false">("false-to-true");
  const [validatorMathTruthMapping, setValidatorMathTruthMapping] = useState<"make-true" | "keep-true" | "make-false">("make-true");
  const [validatorLiteralTruth, setValidatorLiteralTruth] = useState(false);
  const [validatorLLMProvider, setValidatorLLMProvider] = useState<string>("zhi1"); // Default to ZHI 1
  const [validatorTargetWordCount, setValidatorTargetWordCount] = useState<string>(""); // Dedicated word count input
  
  // Streaming Output Modal State (for real-time expansion preview)
  const [streamingModalOpen, setStreamingModalOpen] = useState(false);
  const [streamingStartNew, setStreamingStartNew] = useState(false);
  
  // Objections Function State (standalone)
  const [objectionsOutput, setObjectionsOutput] = useState("");
  const [objectionsLoading, setObjectionsLoading] = useState(false);
  const [objectionsProgress, setObjectionsProgress] = useState<string>(""); // Progress message for large docs
  const [objectionsCustomInstructions, setObjectionsCustomInstructions] = useState("");
  const [showObjectionsPanel, setShowObjectionsPanel] = useState(true); // Default to expanded for discoverability
  const [objectionsInputText, setObjectionsInputText] = useState(""); // Standalone input
  const [objectionsAudience, setObjectionsAudience] = useState(""); // Standalone audience
  const [objectionsObjective, setObjectionsObjective] = useState(""); // Standalone objective

  // Objection-Proof Rewrite State
  const [objectionProofOutput, setObjectionProofOutput] = useState("");
  const [objectionProofLoading, setObjectionProofLoading] = useState(false);
  const [objectionProofCustomInstructions, setObjectionProofCustomInstructions] = useState("");
  const [showObjectionProofPanel, setShowObjectionProofPanel] = useState(true);

  // FULL SUITE Pipeline State - runs Reconstruction → Objections → Objection-Proof in sequence
  const [fullSuiteLoading, setFullSuiteLoading] = useState(false);
  const [fullSuiteStage, setFullSuiteStage] = useState<"idle" | "batch" | "objections" | "objection-proof" | "complete" | "error">("idle");
  const [fullSuiteActiveTab, setFullSuiteActiveTab] = useState<string>("reconstruction");
  const [fullSuiteError, setFullSuiteError] = useState<string>("");
  const [showFullSuitePanel, setShowFullSuitePanel] = useState(true);
  const [fullSuiteAdditionalInfo, setFullSuiteAdditionalInfo] = useState("");
  const [fullSuiteObjectionProofOutput, setFullSuiteObjectionProofOutput] = useState("");
  const [fullSuitePopupOpen, setFullSuitePopupOpen] = useState(false);
  const [fullSuiteReconstructionPopupOpen, setFullSuiteReconstructionPopupOpen] = useState(false);
  const [fullSuiteObjectionsPopupOpen, setFullSuiteObjectionsPopupOpen] = useState(false);
  const [fullSuiteReconstructionOutput, setFullSuiteReconstructionOutput] = useState("");
  
  // Refine/Adjust Output State (word count + custom instructions)
  const [refineWordCount, setRefineWordCount] = useState<string>("");
  const [refineInstructions, setRefineInstructions] = useState<string>("");
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineFinalWordCount, setRefineFinalWordCount] = useState<string>("");
  
  // Test Strict Outline Generator State
  const [outlinePrompt, setOutlinePrompt] = useState("");
  const [outlineInputText, setOutlineInputText] = useState("");
  const [outlineOutput, setOutlineOutput] = useState("");
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineDragOver, setOutlineDragOver] = useState(false);
  const [outlineLLM, setOutlineLLM] = useState<"openai" | "anthropic" | "deepseek">("openai");
  
  // Full Document Generator State
  const [docGenPrompt, setDocGenPrompt] = useState("");
  const [docGenInputText, setDocGenInputText] = useState("");
  const [docGenOutput, setDocGenOutput] = useState("");
  const [docGenLoading, setDocGenLoading] = useState(false);
  const [docGenDragOver, setDocGenDragOver] = useState(false);
  const [docGenLLM, setDocGenLLM] = useState<"openai" | "anthropic" | "deepseek">("openai");
  const [refineFinalInstructions, setRefineFinalInstructions] = useState<string>("");
  const [refineFinalLoading, setRefineFinalLoading] = useState(false);
  
  // Refine Reconstruction output
  const [refineReconstructionWordCount, setRefineReconstructionWordCount] = useState<string>("");
  const [refineReconstructionInstructions, setRefineReconstructionInstructions] = useState<string>("");
  const [refineReconstructionLoading, setRefineReconstructionLoading] = useState(false);
  
  // Refine Coherence rewrite output
  const [refineCoherenceWordCount, setRefineCoherenceWordCount] = useState<string>("");
  const [refineCoherenceInstructions, setRefineCoherenceInstructions] = useState<string>("");
  const [refineCoherenceLoading, setRefineCoherenceLoading] = useState(false);
  
  // Objection-Proof Refine State (standalone section)
  const [objectionProofRefineWordCount, setObjectionProofRefineWordCount] = useState("");
  const [objectionProofRefineInstructions, setObjectionProofRefineInstructions] = useState("");
  const [objectionProofRefinedOutput, setObjectionProofRefinedOutput] = useState("");
  const [objectionProofRefineLoading, setObjectionProofRefineLoading] = useState(false);
  
  // Screenplay Generator State
  const [screenplayInputText, setScreenplayInputText] = useState("");
  const [screenplayTargetWords, setScreenplayTargetWords] = useState<string>("20000");
  const [screenplayCustomInstructions, setScreenplayCustomInstructions] = useState("");
  const [screenplayOutput, setScreenplayOutput] = useState("");
  const [screenplayLoading, setScreenplayLoading] = useState(false);
  const [screenplayDragOver, setScreenplayDragOver] = useState(false);
  const [screenplayWordCount, setScreenplayWordCount] = useState<number | null>(null);
  const [screenplayStructure, setScreenplayStructure] = useState<{actOneWords: number; actTwoWords: number; actThreeWords: number} | null>(null);
  const [screenplayProcessingTime, setScreenplayProcessingTime] = useState<number | null>(null);
  
  // Coherence Meter State
  const [coherenceInputText, setCoherenceInputText] = useState("");
  const [coherenceDragOver, setCoherenceDragOver] = useState(false);
  const [coherenceType, setCoherenceType] = useState<"logical-consistency" | "logical-cohesiveness" | "scientific-explanatory" | "thematic-psychological" | "instructional" | "motivational" | "mathematical" | "philosophical" | "auto-detect">("auto-detect");
  const [coherenceAnalysis, setCoherenceAnalysis] = useState<string>("");
  const [coherenceRewrite, setCoherenceRewrite] = useState<string>("");
  const [coherenceChanges, setCoherenceChanges] = useState<string>("");
  const [coherenceLoading, setCoherenceLoading] = useState(false);
  const [coherenceMode, setCoherenceMode] = useState<"analyze" | "rewrite" | "analyze-and-rewrite" | null>(null);
  const [coherenceScore, setCoherenceScore] = useState<number | null>(null);
  const [coherenceAssessment, setCoherenceAssessment] = useState<"PASS" | "WEAK" | "FAIL" | null>(null);
  const [coherenceAggressiveness, setCoherenceAggressiveness] = useState<"conservative" | "moderate" | "aggressive">("aggressive");
  const [coherenceIsScientific, setCoherenceIsScientific] = useState(false);
  const [coherenceLogicalScore, setCoherenceLogicalScore] = useState<{score: number; assessment: string; analysis: string} | null>(null);
  const [coherenceScientificScore, setCoherenceScientificScore] = useState<{score: number; assessment: string; analysis: string; inaccuracies: string[]} | null>(null);
  const [coherenceCorrectionsApplied, setCoherenceCorrectionsApplied] = useState<string[]>([]);
  const [coherenceRewriteAccuracyScore, setCoherenceRewriteAccuracyScore] = useState<number | null>(null);
  const [coherenceProcessingMode, setCoherenceProcessingMode] = useState<"simple" | "outline-guided">("outline-guided");
  const [mathProofCorrectedProof, setMathProofCorrectedProof] = useState<string>("");
  const [mathProofTheoremStatus, setMathProofTheoremStatus] = useState<"TRUE" | "FALSE" | "PARTIALLY_TRUE" | null>(null);
  const [mathProofOriginalTheorem, setMathProofOriginalTheorem] = useState<string>("");
  const [mathProofCorrectedTheorem, setMathProofCorrectedTheorem] = useState<string | null>(null);
  const [mathProofStrategy, setMathProofStrategy] = useState<string>("");
  const [mathProofKeyCorrections, setMathProofKeyCorrections] = useState<string[]>([]);
  const [mathProofValidityScore, setMathProofValidityScore] = useState<number | null>(null);
  const [mathProofIsCorrected, setMathProofIsCorrected] = useState(false);
  // Mathematical Proof Validity Analysis State (veridicality - is the proof actually true?)
  const [coherenceIsMathematical, setCoherenceIsMathematical] = useState(false);
  const [mathValidityAnalysis, setMathValidityAnalysis] = useState<string>("");
  const [mathValidityScore, setMathValidityScore] = useState<number | null>(null);
  const [mathValidityVerdict, setMathValidityVerdict] = useState<"VALID" | "FLAWED" | "INVALID" | null>(null);
  const [mathValiditySubscores, setMathValiditySubscores] = useState<{claimTruth: number; inferenceValidity: number; boundaryConditions: number; overallSoundness: number} | null>(null);
  const [mathValidityFlaws, setMathValidityFlaws] = useState<string[]>([]);
  const [mathValidityCounterexamples, setMathValidityCounterexamples] = useState<string[]>([]);
  const [coherenceChunks, setCoherenceChunks] = useState<Array<{id: string, text: string, preview: string}>>([]);
  const [selectedCoherenceChunks, setSelectedCoherenceChunks] = useState<string[]>([]);
  const [showCoherenceChunkSelector, setShowCoherenceChunkSelector] = useState(false);
  const [coherenceStageProgress, setCoherenceStageProgress] = useState<string>("");
  const [detectedCoherenceType, setDetectedCoherenceType] = useState<string | null>(null);
  const [coherenceUseStreaming, setCoherenceUseStreaming] = useState(false);
  const [coherenceStreamingActive, setCoherenceStreamingActive] = useState(false);
  const [resumeJobData, setResumeJobData] = useState<{
    documentId: string;
    coherenceMode: string;
    resumeFromChunk: number;
    globalState: any;
    existingChunks: number;
    originalText?: string;
    autoStart?: boolean;
  } | null>(null);
  const [autoStartTriggered, setAutoStartTriggered] = useState(false);
  
  // Check for resume job data on mount
  useEffect(() => {
    const storedResumeData = sessionStorage.getItem('resumeJob');
    if (storedResumeData) {
      try {
        const parsed = JSON.parse(storedResumeData);
        setResumeJobData(parsed);
        // Set coherence type from saved mode
        if (parsed.coherenceMode) {
          setCoherenceType(parsed.coherenceMode as any);
        }
        // If we have non-empty original text and autoStart flag, set up for auto-start
        if (parsed.originalText && parsed.originalText.trim().length > 0 && parsed.autoStart) {
          setCoherenceInputText(parsed.originalText);
          toast({
            title: "Auto-resuming Job",
            description: `Loading ${parsed.existingChunks} saved chunks and resuming processing...`,
          });
        } else if (parsed.autoStart && (!parsed.originalText || parsed.originalText.trim().length === 0)) {
          // Auto-start was requested but no original text available
          toast({
            title: "Cannot Auto-Resume",
            description: "Original text not available. Please paste your text and click Resume Job manually.",
            variant: "destructive",
          });
          // Clear the autoStart flag since we can't auto-start
          parsed.autoStart = false;
          setResumeJobData(parsed);
        } else {
          toast({
            title: "Resume Job Available",
            description: `Found interrupted job with ${parsed.existingChunks} chunks. Click "Resume Job" to continue.`,
          });
        }
      } catch (e) {
        console.error("Error parsing resume data:", e);
        sessionStorage.removeItem('resumeJob');
      }
    }
  }, []);
  
  // Auto-start processing when resume data is loaded with autoStart flag
  useEffect(() => {
    // Only auto-start if we have valid original text (non-empty)
    const hasValidText = resumeJobData?.originalText && resumeJobData.originalText.trim().length > 0;
    const inputTextReady = coherenceInputText && coherenceInputText.trim().length > 0;
    
    if (resumeJobData?.autoStart && hasValidText && inputTextReady && !autoStartTriggered && !coherenceLoading) {
      setAutoStartTriggered(true);
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        handleCoherenceRewrite();
        // Clear the autoStart flag after triggering
        sessionStorage.removeItem('resumeJob');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [resumeJobData, coherenceInputText, autoStartTriggered, coherenceLoading]);
  
  const dismissResumeJob = () => {
    sessionStorage.removeItem('resumeJob');
    setResumeJobData(null);
  };
  
  // Listen for "Open Progress Popup" button click from header (App.tsx)
  useEffect(() => {
    const handleOpenProgressPopup = () => {
      setStreamingModalOpen(true);
    };
    window.addEventListener('openProgressPopup', handleOpenProgressPopup);
    return () => window.removeEventListener('openProgressPopup', handleOpenProgressPopup);
  }, []);
  
  // Check for loadProject data from Job History (for resume/modify)
  // Uses an interval to check for sessionStorage changes since navigation may not trigger remount
  useEffect(() => {
    const checkForLoadProject = () => {
      const storedLoadProject = sessionStorage.getItem('loadProject');
      if (storedLoadProject) {
        try {
          const project = JSON.parse(storedLoadProject);
          sessionStorage.removeItem('loadProject');
          
          console.log('[LoadProject] Loading project:', project.documentId, 'outputText length:', project.outputText?.length || 0);
          
          // Populate NEUROTEXT form with the loaded project data
          if (project.outputText && project.outputText.trim().length > 0) {
            // For finished or interrupted projects with output, show in popup
            console.log('[LoadProject] Setting fullSuiteReconstructionOutput and opening popup');
            setFullSuiteReconstructionOutput(project.outputText);
            setFullSuiteStage('complete');
            setFullSuiteActiveTab('reconstruction');
            setFullSuitePopupOpen(true);  // CRITICAL: Open the popup to show content
            
            // Also set in validator output for reference
            setValidatorOutput(project.outputText);
          }
          
          if (project.originalText) {
            // Load the original text into the input
            setValidatorInputText(project.originalText);
          }
          
          // Restore custom instructions
          if (project.customInstructions) {
            setValidatorCustomInstructions(project.customInstructions);
            setShowValidatorCustomization(true);
          }
          
          // Show toast
          toast({
            title: project.isFinished ? "Project Loaded" : "Project Loaded for Resume",
            description: project.outputText 
              ? "Your generated content is shown in the popup." 
              : "Continue working on this project.",
          });
          
          // Scroll to NEUROTEXT section
          setTimeout(() => {
            const neurotextSection = document.getElementById('neurotext');
            if (neurotextSection) {
              neurotextSection.scrollIntoView({ behavior: 'smooth' });
            }
          }, 300);
        } catch (e) {
          console.error("Error parsing loadProject data:", e);
          sessionStorage.removeItem('loadProject');
        }
      }
    };
    
    // Check immediately on mount
    checkForLoadProject();
    
    // Also check periodically for 5 seconds in case of navigation timing issues
    const interval = setInterval(checkForLoadProject, 500);
    const timeout = setTimeout(() => clearInterval(interval), 5000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);
  
  // Reconstruction operations
  const [reconstructionInputText, setReconstructionInputText] = useState<string>("");
  const [reconstructionTargetWordCount, setReconstructionTargetWordCount] = useState<string>("500");
  const [reconstructionTitle, setReconstructionTitle] = useState<string>("");
  const [reconstructionLoading, setReconstructionLoading] = useState(false);
  const [reconstructionProject, setReconstructionProject] = useState<any>(null);
  const [showReconstructionResults, setShowReconstructionResults] = useState(false);
  const [reconstructionPolling, setReconstructionPolling] = useState(false);
  const reconstructionPollRef = useRef<NodeJS.Timeout | null>(null);
  
  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (reconstructionPollRef.current) {
        clearInterval(reconstructionPollRef.current);
      }
    };
  }, []);

  const startReconstruction = async () => {
    if (!reconstructionInputText.trim()) {
      toast({
        title: "Input required",
        description: "Please provide text to reconstruct.",
        variant: "destructive",
      });
      return;
    }

    setReconstructionLoading(true);
    try {
      const response = await fetch("/api/reconstruction/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: reconstructionInputText,
          title: reconstructionTitle || "Untitled Reconstruction",
          targetWordCount: parseInt(reconstructionTargetWordCount) || 500,
        }),
      });

      if (!response.ok) throw new Error("Failed to start reconstruction");
      
      const project = await response.json();
      setReconstructionProject(project);
      setShowReconstructionResults(true);
      
      toast({
        title: "Reconstruction Started",
        description: "Processing in background. Results will appear when complete.",
      });

      // Start polling for results
      setReconstructionPolling(true);
      if (reconstructionPollRef.current) {
        clearInterval(reconstructionPollRef.current);
      }
      reconstructionPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/reconstruction/${project.id}`);
          if (statusRes.ok) {
            const updatedProject = await statusRes.json();
            setReconstructionProject(updatedProject);
            if (updatedProject.status === 'completed' || updatedProject.status === 'failed') {
              if (reconstructionPollRef.current) {
                clearInterval(reconstructionPollRef.current);
                reconstructionPollRef.current = null;
              }
              setReconstructionPolling(false);
              if (updatedProject.status === 'completed') {
                toast({
                  title: "Reconstruction Complete",
                  description: `Generated ${updatedProject.reconstructedText?.split(/\s+/).length || 0} words.`,
                });
              } else {
                toast({
                  title: "Reconstruction Failed",
                  description: "An error occurred during processing.",
                  variant: "destructive",
                });
              }
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 5000); // Poll every 5 seconds
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setReconstructionLoading(false);
    }
  };

  // Content Analysis State
  const [contentAnalysisResult, setContentAnalysisResult] = useState<{
    richnessScore: number;
    richnessAssessment: "RICH" | "MODERATE" | "SPARSE";
    pivotalPoints?: {
      claims: string[];
      terminology: string[];
      relationships: string[];
      mustDevelop: string[];
    };
    substantivenessGap: {
      needsAddition: boolean;
      whatToAdd: string[];
      percentageGap: number;
    };
    salvageability: {
      status: "SALVAGEABLE" | "NEEDS_AUGMENTATION" | "NEEDS_REPLACEMENT";
      recommendation: string;
      salvageableElements: string[];
      problematicElements: string[];
    };
    breakdown: {
      concreteExamples: { count: number; quality: string };
      specificDetails: { count: number; quality: string };
      uniqueInsights: { count: number; quality: string };
      vagueness: { level: string; instances: string[] };
      repetition: { level: string; instances: string[] };
    };
    fullAnalysis: string;
  } | null>(null);
  const [contentAnalysisLoading, setContentAnalysisLoading] = useState(false);
  
  // Load writing samples and style presets on component mount
  useEffect(() => {
    const loadWritingSamples = async () => {
      try {
        const response = await fetch('/api/writing-samples');
        if (response.ok) {
          const data = await response.json();
          setWritingSamples(data.samples);
          // Set default to "Formal and Functional Relationships" (CONTENT-NEUTRAL default)
          if (data.samples["CONTENT-NEUTRAL"] && data.samples["CONTENT-NEUTRAL"]["Formal and Functional Relationships"]) {
            setBoxB(data.samples["CONTENT-NEUTRAL"]["Formal and Functional Relationships"]);
          }
        }
      } catch (error) {
        console.error('Failed to load writing samples:', error);
      }
    };

    const loadStylePresets = async () => {
      try {
        const response = await fetch('/api/style-presets');
        if (response.ok) {
          const data = await response.json();
          setStylePresets(data.presets);
        }
      } catch (error) {
        console.error('Failed to load style presets:', error);
      }
    };

    loadWritingSamples();
    loadStylePresets();
  }, []);

  // GPT Bypass Humanizer Functions - Following Exact Protocol
  
  // Debounce function for delayed execution
  const debounce = (func: Function, delay: number) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  };

  // Automatic GPTZero evaluation (no button push needed)
  const evaluateTextAI = async (text: string, setScore: (score: number) => void) => {
    if (!text.trim()) return;

    try {
      const response = await fetch('/api/evaluate-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Ensure we display the percentage correctly (not negative values)
          const humanPercentage = Math.max(0, Math.min(100, data.humanPercentage));
          setScore(humanPercentage);
        }
      }
    } catch (error) {
      console.error('AI evaluation error:', error);
    }
  };

  // Combine multiple documents into a single text
  const combineDocuments = (docs: Array<{id: string; filename: string; content: string; wordCount: number}>) => {
    if (docs.length === 0) return "";
    if (docs.length === 1) return docs[0].content;
    
    return docs.map((doc, index) => 
      `=== DOCUMENT ${index + 1}: ${doc.filename} ===\n\n${doc.content}`
    ).join('\n\n---\n\n');
  };

  // File upload handler for PDF/Word/Doc
  const handleFileUpload = async (file: File, setter: (content: string) => void) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/extract-text', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to extract text from document');
      }

      const data = await response.json();
      setter(data.content);
      toast({
        title: "File Uploaded",
        description: `Successfully loaded ${file.name}`,
      });
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: "Upload Failed", 
        description: "Could not read the file. Please try a different format.",
        variant: "destructive",
      });
    }
  };

  // Multi-file upload handler for Document Library (up to 5 docs)
  const handleMultipleFileUpload = async (files: File[]) => {
    const maxDocs = 5;
    const remainingSlots = maxDocs - uploadedDocuments.length;
    
    if (remainingSlots <= 0) {
      toast({
        title: "Library Full",
        description: "Maximum 5 documents allowed. Remove some to add more.",
        variant: "destructive",
      });
      return;
    }
    
    const filesToProcess = files.slice(0, remainingSlots);
    if (filesToProcess.length < files.length) {
      toast({
        title: "Some Files Skipped",
        description: `Only ${filesToProcess.length} of ${files.length} files added (max 5 total)`,
        variant: "default",
      });
    }
    
    try {
      const newDocs: Array<{id: string; filename: string; content: string; wordCount: number}> = [];
      const newIds: string[] = [];
      
      for (const file of filesToProcess) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/extract-text', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Failed to extract text from ${file.name}`);
        }

        const data = await response.json();
        const words = data.content.trim().split(/\s+/).filter(Boolean);
        const docId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        newIds.push(docId);
        newDocs.push({
          id: docId,
          filename: file.name,
          content: data.content,
          wordCount: words.length,
        });
      }
      
      const allDocs = [...uploadedDocuments, ...newDocs];
      setUploadedDocuments(allDocs);
      
      // Auto-select newly uploaded documents
      setSelectedDocumentIds(prev => {
        const newSet = new Set(prev);
        newIds.forEach(id => newSet.add(id));
        return newSet;
      });
      
      toast({
        title: `${filesToProcess.length} Document${filesToProcess.length > 1 ? 's' : ''} Added`,
        description: `Library now has ${allDocs.length} document${allDocs.length > 1 ? 's' : ''}. Select documents and add instructions.`,
      });
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: "Upload Failed", 
        description: "Could not read one or more files. Please try a different format.",
        variant: "destructive",
      });
    }
  };
  
  // Toggle document selection in the library
  const toggleDocumentSelection = (docId: string) => {
    setSelectedDocumentIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(docId)) {
        newSet.delete(docId);
      } else {
        newSet.add(docId);
      }
      return newSet;
    });
  };
  
  // Load selected documents into the input area
  const loadSelectedDocuments = () => {
    const selectedDocs = uploadedDocuments.filter(d => selectedDocumentIds.has(d.id));
    if (selectedDocs.length === 0) {
      toast({
        title: "No Documents Selected",
        description: "Please check at least one document to use.",
        variant: "destructive",
      });
      return;
    }
    
    const combinedContent = combineDocuments(selectedDocs);
    setValidatorInputText(combinedContent);
    
    toast({
      title: "Documents Loaded",
      description: `${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''} loaded into input (${selectedDocs.reduce((s, d) => s + d.wordCount, 0).toLocaleString()} words)`,
    });
  };
  
  // Clear the document library
  const clearDocumentLibrary = () => {
    setUploadedDocuments([]);
    setSelectedDocumentIds(new Set());
    toast({
      title: "Library Cleared",
      description: "All documents removed from library.",
    });
  };

  // Remove a document from the library
  const handleRemoveDocument = (docId: string) => {
    const newDocs = uploadedDocuments.filter(d => d.id !== docId);
    setUploadedDocuments(newDocs);
    
    // Also remove from selection
    setSelectedDocumentIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(docId);
      return newSet;
    });
    
    toast({
      title: "Document Removed",
      description: newDocs.length > 0 
        ? `${newDocs.length} document${newDocs.length > 1 ? 's' : ''} remaining in library`
        : "Library cleared",
    });
  };

  const handleDwMultipleFileUpload = async (files: File[]) => {
    const maxDocs = 5;
    const remainingSlots = maxDocs - dwUploadedDocuments.length;
    if (remainingSlots <= 0) {
      toast({ title: "Library Full", description: "Maximum 5 documents allowed. Remove some to add more.", variant: "destructive" });
      return;
    }
    const filesToProcess = files.slice(0, remainingSlots);
    if (filesToProcess.length < files.length) {
      toast({ title: "Some Files Skipped", description: `Only ${filesToProcess.length} of ${files.length} files added (max 5 total)`, variant: "default" });
    }
    try {
      const newDocs: Array<{id: string; filename: string; content: string; wordCount: number}> = [];
      const newIds: string[] = [];
      for (const file of filesToProcess) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/extract-text', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`Failed to extract text from ${file.name}`);
        const data = await response.json();
        const words = data.content.trim().split(/\s+/).filter(Boolean);
        const docId = `dw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        newIds.push(docId);
        newDocs.push({ id: docId, filename: file.name, content: data.content, wordCount: words.length });
      }
      const allDocs = [...dwUploadedDocuments, ...newDocs];
      setDwUploadedDocuments(allDocs);
      setDwSelectedDocumentIds(prev => { const newSet = new Set(prev); newIds.forEach(id => newSet.add(id)); return newSet; });
      toast({ title: `${filesToProcess.length} Document${filesToProcess.length > 1 ? 's' : ''} Added`, description: `Dissertation Wizard library now has ${allDocs.length} document${allDocs.length > 1 ? 's' : ''}.` });
    } catch (error) {
      console.error('DW file upload error:', error);
      toast({ title: "Upload Failed", description: "Could not read one or more files. Please try a different format.", variant: "destructive" });
    }
  };

  const toggleDwDocumentSelection = (docId: string) => {
    setDwSelectedDocumentIds(prev => { const newSet = new Set(prev); if (newSet.has(docId)) { newSet.delete(docId); } else { newSet.add(docId); } return newSet; });
  };

  const clearDwDocumentLibrary = () => {
    setDwUploadedDocuments([]);
    setDwSelectedDocumentIds(new Set());
    toast({ title: "Library Cleared", description: "All documents removed from Dissertation Wizard library." });
  };

  const handleDwRemoveDocument = (docId: string) => {
    const newDocs = dwUploadedDocuments.filter(d => d.id !== docId);
    setDwUploadedDocuments(newDocs);
    setDwSelectedDocumentIds(prev => { const newSet = new Set(prev); newSet.delete(docId); return newSet; });
    toast({ title: "Document Removed", description: newDocs.length > 0 ? `${newDocs.length} document${newDocs.length > 1 ? 's' : ''} remaining` : "Library cleared" });
  };

  // Download text as file
  const handleDownloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Download Started",
      description: `Downloading ${filename}`,
    });
  };

  // Text chunking for large documents (1000+ words)
  const handleChunkText = async (text: string) => {
    try {
      const response = await fetch('/api/chunk-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, maxWords: 500 }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setChunks(data.chunks);
          setShowChunkSelector(true);
          toast({
            title: "Text Chunked",
            description: `Document divided into ${data.chunks.length} chunks of ~1000 words each with global coherence preservation.`,
          });
        }
      }
    } catch (error) {
      console.error('Text chunking error:', error);
    }
  };

  // Main humanization function with surgical precision
  const handleHumanize = async () => {
    if (!boxA.trim() || !boxB.trim()) {
      toast({
        title: "Missing Input",
        description: "Both Box A (AI text) and Box B (human style sample) are required.",
        variant: "destructive",
      });
      return;
    }

    setIsHumanizerLoading(true);
    setBoxC("");
    setBoxCScore(null);

    try {
      const response = await fetch('/api/gpt-bypass-humanizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boxA,
          boxB,
          stylePresets: selectedStylePresets,
          provider: humanizerProvider,
          customInstructions: humanizerCustomInstructions,
          selectedChunkIds: selectedChunkIds.length > 0 ? selectedChunkIds : undefined,
          chunks: chunks.length > 0 ? chunks : undefined
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Humanization failed');
      }

      const data = await response.json();
      if (data.success && data.result) {
        setBoxC(data.result.humanizedText);
        
        // Automatically evaluate humanized text
        setTimeout(() => {
          evaluateTextAI(data.result.humanizedText, setBoxCScore);
        }, 1000);
        
        toast({
          title: "Humanization Complete!",
          description: `Text humanized with surgical precision. Original: ${data.result.originalScore || 'N/A'}% → Humanized: ${data.result.humanizedScore || 'Evaluating...'}% Human.`,
        });
      }
    } catch (error: any) {
      console.error('Humanization error:', error);
      toast({
        title: "Humanization Failed",
        description: error.message || "An error occurred during humanization.",
        variant: "destructive",
      });
    } finally {
      setIsHumanizerLoading(false);
    }
  };

  // Re-rewrite function for recursive rewriting
  const handleReRewrite = async () => {
    if (!boxC.trim() || !boxB.trim()) {
      toast({
        title: "Missing Input",
        description: "Both output text and style sample are required for re-rewrite.",
        variant: "destructive",
      });
      return;
    }

    setIsReRewriteLoading(true);

    try {
      const response = await fetch('/api/gpt-bypass-humanizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boxA: boxC, // Use current output as new input
          boxB,
          stylePresets: selectedStylePresets,
          provider: humanizerProvider,
          customInstructions: humanizerCustomInstructions + " [RECURSIVE REWRITE] Further improve human-like qualities and reduce AI detection."
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Re-rewrite failed');
      }

      const data = await response.json();
      if (data.success && data.result) {
        setBoxC(data.result.humanizedText);
        
        // Automatically evaluate re-rewritten text
        setTimeout(() => {
          evaluateTextAI(data.result.humanizedText, setBoxCScore);
        }, 1000);
        
        toast({
          title: "Re-rewrite Complete!",
          description: `Text re-rewritten recursively. New score: ${data.result.humanizedScore || 'Evaluating...'}% Human.`,
        });
      }
    } catch (error: any) {
      console.error('Re-rewrite error:', error);
      toast({
        title: "Re-rewrite Failed",
        description: error.message || "An error occurred during re-rewrite.",
        variant: "destructive",
      });
    } finally {
      setIsReRewriteLoading(false);
    }
  };

  // Download function for PDF/TXT/Word
  const downloadHumanizerResult = (format: 'pdf' | 'txt' | 'docx') => {
    if (!boxC.trim()) return;

    const filename = `humanized-text.${format}`;
    const blob = new Blob([boxC], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Download Complete",
      description: `Humanized text saved as ${filename}`,
    });
  };

  // Send functionality handlers
  const handleSendToHumanizer = (text: string) => {
    setBoxA(text);
    toast({
      title: "Text sent to Humanizer",
      description: "Text has been placed in Box A for humanization"
    });
  };

  const handleSendToIntelligence = (text: string) => {
    setDocumentA({ ...documentA, content: text });
    toast({
      title: "Text sent to Intelligence Analysis",
      description: "Text has been placed in the intelligence analysis input"
    });
  };

  const handleSendToChat = (text: string) => {
    // This will be handled by the ChatDialog component
    // For now, we can show a notification that the text will be available to chat
    toast({
      title: "Text available to Chat",
      description: "The text is now available as context for AI chat"
    });
  };

  // Screenplay Generator Handler
  const handleGenerateScreenplay = async () => {
    console.log("[Screenplay] Button clicked, input length:", screenplayInputText.length);
    
    if (!screenplayInputText.trim()) {
      console.log("[Screenplay] No input text - showing error toast");
      toast({
        title: "Error",
        description: "Please provide source material for the screenplay",
        variant: "destructive"
      });
      return;
    }
    
    console.log("[Screenplay] Starting generation with", screenplayInputText.trim().split(/\s+/).length, "words");
    
    setScreenplayLoading(true);
    setScreenplayOutput("");
    setScreenplayWordCount(null);
    setScreenplayStructure(null);
    setScreenplayProcessingTime(null);
    
    // Open streaming modal to show progress
    setStreamingStartNew(true);
    setStreamingModalOpen(true);
    
    try {
      let targetWords = 20000;
      if (screenplayTargetWords && screenplayTargetWords.trim()) {
        const parsed = parseInt(screenplayTargetWords);
        if (!isNaN(parsed) && parsed > 0) {
          targetWords = parsed;
        }
      }
      
      const response = await fetch('/api/screenplay-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: screenplayInputText,
          targetWordCount: targetWords,
          customInstructions: screenplayCustomInstructions || undefined
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Screenplay generation failed');
      }
      
      const data = await response.json();
      if (data.success) {
        setScreenplayOutput(data.screenplay);
        setScreenplayWordCount(data.wordCount);
        setScreenplayStructure(data.structure);
        setScreenplayProcessingTime(data.processingTimeMs);
        toast({
          title: "Screenplay Generated!",
          description: `Complete screenplay with ${data.wordCount.toLocaleString()} words - scroll down to see it`
        });
        // Auto-scroll to the output
        setTimeout(() => {
          const outputEl = document.querySelector('[data-testid="textarea-screenplay-output"]');
          if (outputEl) {
            outputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      } else {
        throw new Error(data.message || 'Screenplay generation failed');
      }
    } catch (error: any) {
      console.error("[Screenplay] Generation error:", error);
      console.error("[Screenplay] Error details:", error.message, error.stack);
      toast({
        title: "Error",
        description: error.message || "Failed to generate screenplay",
        variant: "destructive"
      });
    } finally {
      setScreenplayLoading(false);
    }
  };

  const handleClearScreenplay = () => {
    setScreenplayInputText("");
    setScreenplayTargetWords("20000");
    setScreenplayCustomInstructions("");
    setScreenplayOutput("");
    setScreenplayWordCount(null);
    setScreenplayStructure(null);
    setScreenplayProcessingTime(null);
  };

  // Test Strict Outline Generator Handler
  const handleGenerateOutline = async () => {
    if (!outlineInputText.trim()) {
      toast({
        title: "Error",
        description: "Please provide a source document",
        variant: "destructive"
      });
      return;
    }
    
    // If no instructions provided, default to summarize with analysis
    const effectivePrompt = outlinePrompt.trim() 
      ? outlinePrompt 
      : "Provide a concise and clear summary of this document, followed by a detailed analysis section covering key themes, insights, and implications.";
    
    setOutlineLoading(true);
    setOutlineOutput("");
    
    try {
      const response = await fetch('/api/generate-strict-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: effectivePrompt,
          inputText: outlineInputText,
          provider: outlineLLM
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Outline generation failed');
      }
      
      const data = await response.json();
      if (data.success) {
        setOutlineOutput(data.output);
        toast({
          title: "Outline Generated",
          description: "Strict outline has been generated successfully"
        });
      }
    } catch (error: any) {
      console.error('Outline error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate outline",
        variant: "destructive"
      });
    } finally {
      setOutlineLoading(false);
    }
  };

  // Full Document Generator Handler
  const handleGenerateDocument = async () => {
    if (!docGenInputText.trim()) {
      toast({
        title: "Error",
        description: "Please provide a source document",
        variant: "destructive"
      });
      return;
    }
    
    // If no instructions provided, default to summarize with analysis
    const effectivePrompt = docGenPrompt.trim() 
      ? docGenPrompt 
      : "Provide a concise and clear summary of this document, followed by a detailed analysis section covering key themes, insights, and implications.";
    
    setDocGenLoading(true);
    setDocGenOutput("");
    
    try {
      const response = await fetch('/api/generate-full-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: effectivePrompt,
          inputText: docGenInputText,
          provider: docGenLLM
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Document generation failed');
      }
      
      const data = await response.json();
      if (data.success) {
        setDocGenOutput(data.output);
        toast({
          title: "Document Generated",
          description: "Full document has been generated successfully"
        });
      }
    } catch (error: any) {
      console.error('Document generation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate document",
        variant: "destructive"
      });
    } finally {
      setDocGenLoading(false);
    }
  };

  // Clear All for Outline Generator
  const handleClearOutline = () => {
    setOutlinePrompt("");
    setOutlineInputText("");
    setOutlineOutput("");
  };

  // Clear All for Document Generator
  const handleClearDocGen = () => {
    setDocGenPrompt("");
    setDocGenInputText("");
    setDocGenOutput("");
  };

  // GLOBAL CLEAR ALL - Clears every input/output box on the page
  const handleGlobalClearAll = () => {
    // Documents
    setDocumentA({ content: "" });
    setDocumentB({ content: "" });
    
    // Analysis results
    setAnalysisA(null);
    setAnalysisB(null);
    setComparison(null);
    setShowResults(false);
    
    // Humanizer boxes
    setBoxA("");
    setBoxB("");
    setBoxC("");
    setBoxAScore(null);
    setBoxBScore(null);
    setBoxCScore(null);
    setHumanizerCustomInstructions("");
    
    // Validator/Reconstruction
    setValidatorInputText("");
    setValidatorCustomInstructions("");
    setValidatorOutput("");
    setValidatorBatchResults([]);
    
    // Objections
    setObjectionsInputText("");
    setObjectionsCustomInstructions("");
    setObjectionsOutput("");
    
    // Full Suite
    setFullSuiteReconstructionOutput("");
    setFullSuiteObjectionProofOutput("");
    setFullSuiteAdditionalInfo("");
    
    // Coherence
    setCoherenceInputText("");
    setCoherenceAnalysis("");
    setCoherenceRewrite("");
    setCoherenceChanges("");
    setCoherenceScore(null);
    setCoherenceAssessment(null);
    
    // Screenplay
    setScreenplayInputText("");
    setScreenplayOutput("");
    setScreenplayCustomInstructions("");
    setScreenplayWordCount(null);
    setScreenplayStructure(null);
    
    // Outline Generator
    setOutlinePrompt("");
    setOutlineInputText("");
    setOutlineOutput("");
    
    // Document Generator
    setDocGenPrompt("");
    setDocGenInputText("");
    setDocGenOutput("");
    
    // Document Library
    setUploadedDocuments([]);
    setLibraryInstructions("");
    setSelectedDocumentIds(new Set());
    
    // Rewrite results
    setRewriteResult("");
    setCustomInstructions("");
    
    toast({
      title: "All Cleared",
      description: "All input and output fields have been reset.",
    });
  };

  // File upload handler for generators
  const handleGeneratorFileUpload = async (file: File, setter: (text: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setter(text);
    };
    reader.readAsText(file);
  };

  // Helper to detect expansion instructions (mirrors backend logic)
  const hasExpansionInstructions = (instructions: string): boolean => {
    if (!instructions) return false;
    const expansionKeywords = [
      /EXPAND\s*TO/i,
      /TURN\s*(?:THIS\s*)?INTO\s*(?:A\s*)?\d/i,
      /\d+\s*WORD\s*(?:THESIS|DISSERTATION|ESSAY)/i,
      /MASTER'?S?\s*THESIS/i,
      /DOCTORAL\s*(?:THESIS|DISSERTATION)/i,
      /PHD\s*(?:THESIS|DISSERTATION)/i,
      /WRITE\s*(?:A\s*)?\d+\s*WORDS?/i,
      /([\d,]+(?:\.\d+)?)\s*(?:K)?\s*WORDS?\s*(?:THESIS|DISSERTATION|ESSAY|DOCUMENT|LENGTH)/i,
    ];
    return expansionKeywords.some(pattern => pattern.test(instructions));
  };
  
  // NEUROTEXT REQUIREMENT: Intelligent input interpretation
  // Detects if the main text box contains instructions rather than content
  const detectsAsInstructions = (text: string): boolean => {
    if (!text || text.trim().length === 0) return false;
    const upperText = text.toUpperCase();
    const instructionPatterns = [
      /^WRITE\s+/i,
      /^GENERATE\s+/i,
      /^CREATE\s+/i,
      /^EXPAND\s+/i,
      /^PRODUCE\s+/i,
      /^COMPOSE\s+/i,
      /^TURN\s+/i,
      /^MAKE\s+/i,
      /\d+\s*WORDS?\s*(?:ESSAY|PAPER|THESIS|DISSERTATION|DOCUMENT|ARTICLE)/i,
      /(?:ESSAY|PAPER|THESIS|DISSERTATION|ARTICLE)\s+ON\s+/i,
      /WRITE\s+(?:AN?\s+)?(?:ESSAY|PAPER|THESIS|DISSERTATION|ARTICLE)/i,
    ];
    return instructionPatterns.some(pattern => pattern.test(text));
  };
  
  // Intelligently interpret user input - swap boxes if main text looks like instructions
  const interpretInput = (mainText: string, instructionsText: string): { effectiveText: string; effectiveInstructions: string; wasSwapped: boolean } => {
    const mainLooksLikeInstructions = detectsAsInstructions(mainText);
    const instructionsLooksLikeContent = instructionsText.trim().length > 0 && 
      !detectsAsInstructions(instructionsText) && 
      instructionsText.trim().split(/\s+/).length > 50; // Long text in instructions box
    
    // If main text looks like instructions AND instructions box has content that doesn't look like instructions
    if (mainLooksLikeInstructions && instructionsLooksLikeContent) {
      return {
        effectiveText: instructionsText,
        effectiveInstructions: mainText,
        wasSwapped: true
      };
    }
    
    // If only main text exists and it looks like instructions, use it as instructions
    if (mainLooksLikeInstructions && !instructionsText.trim()) {
      return {
        effectiveText: '',
        effectiveInstructions: mainText,
        wasSwapped: false
      };
    }
    
    return {
      effectiveText: mainText,
      effectiveInstructions: instructionsText,
      wasSwapped: false
    };
  };

  // Text Model Validator Handler
  // NEUROTEXT REQUIREMENT: Allow instructions-only mode - no input text validation
  // NEUROTEXT REQUIREMENT: Intelligent input interpretation
  const handleValidatorProcess = async (mode: "reconstruction") => {
    // Allow operation if EITHER input text OR custom instructions are provided
    const hasInputText = validatorInputText.trim().length > 0;
    const hasInstructions = validatorCustomInstructions.trim().length > 0;
    
    if (!hasInputText && !hasInstructions) {
      toast({
        title: "Input Required",
        description: "Please enter text OR instructions. You can use instructions alone to generate content.",
        variant: "destructive"
      });
      return;
    }
    
    // INTELLIGENT INPUT INTERPRETATION
    // If user puts instructions in the main text box, detect and interpret correctly
    const interpretation = interpretInput(validatorInputText, validatorCustomInstructions);
    
    // Notify user if we detected and swapped inputs
    if (interpretation.wasSwapped) {
      toast({
        title: "Inputs Interpreted",
        description: "Detected instructions in text box and content in instructions box - they've been swapped automatically.",
      });
    }
    
    // Use interpreted values
    const effectiveText = interpretation.effectiveText;
    let effectiveInstructions = interpretation.effectiveInstructions;
    
    // DEDICATED WORD COUNT FIELD: If user specified a target word count, prepend it to instructions
    const targetWC = parseInt(validatorTargetWordCount);
    if (targetWC && targetWC > 0) {
      const wordCountInstruction = `EXPAND TO ${targetWC} WORDS.`;
      if (effectiveInstructions.trim()) {
        effectiveInstructions = `${wordCountInstruction} ${effectiveInstructions}`;
      } else {
        effectiveInstructions = `${wordCountInstruction} Write a maximally coherent scholarly version. NO PUFFERY. NO HEDGING. Every word must carry meaning.`;
      }
      toast({
        title: "Target Word Count Set",
        description: `Output will be expanded to ${targetWC.toLocaleString()} words.`,
      });
    } else {
      // AUTO-EXPAND: If no word count specified and user provides small text with NO instructions, auto-expand to 5000 words
      const inputWordCount = effectiveText.trim().split(/\s+/).filter(w => w).length;
      const hasNoInstructions = effectiveInstructions.trim().length === 0;
      const isSmallInput = inputWordCount > 0 && inputWordCount < 1000;
      
      if (isSmallInput && hasNoInstructions) {
        effectiveInstructions = "EXPAND TO 5000 WORDS. Write a maximum coherence scholarly paper expanding on this input.";
        toast({
          title: "Auto-Expansion Enabled",
          description: "Small input detected with no instructions - auto-expanding to 5000 word coherent paper.",
        });
      }
    }
    
    // If only instructions provided (no effective text), use instructions as the "input" for processing
    const effectiveInputText = effectiveText.trim().length > 0 ? effectiveText : effectiveInstructions;

    setValidatorMode(mode);
    setValidatorLoading(true);
    setValidatorOutput("");
    
    // Check word count for progress messaging - use effectiveInputText
    const wordCount = effectiveInputText.trim().split(/\s+/).filter(w => w).length;
    
    // Detect if this is an expansion request for streaming (check both original and interpreted instructions)
    const isExpansionRequest = hasExpansionInstructions(effectiveInstructions);
    const isInstructionsOnly = effectiveText.trim().length === 0;
    
    // For instructions-only mode, show appropriate message
    if (isInstructionsOnly) {
      setValidatorProgress("Generating content from instructions...");
    } else if (isExpansionRequest) {
      // Open streaming modal for real-time preview - signal new generation
      setStreamingStartNew(true);
      setStreamingModalOpen(true);
      setValidatorProgress("Streaming output in real-time...");
    } else if (wordCount >= 1200 && wordCount <= 25000) {
      setValidatorProgress("Extracting document structure (outline-first mode)...");
    } else if (wordCount > 25000) {
      setValidatorProgress("Processing large document (cross-chunk mode)...");
    } else {
      setValidatorProgress("");
    }

    try {
      // Add stream=true query param for expansion requests
      const endpoint = isExpansionRequest 
        ? '/api/text-model-validator?stream=true'
        : '/api/text-model-validator';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: effectiveInputText,  // Use effective input (text or instructions)
          mode,
          targetDomain: validatorTargetDomain,
          fidelityLevel: validatorFidelityLevel,
          mathFramework: validatorMathFramework,
          constraintType: validatorConstraintType,
          rigorLevel: validatorRigorLevel,
          customInstructions: effectiveInstructions,  // Use interpreted instructions
          truthMapping: validatorTruthMapping,
          mathTruthMapping: validatorMathTruthMapping,
          literalTruth: validatorLiteralTruth,
          llmProvider: validatorLLMProvider,
          instructionsOnly: isInstructionsOnly,  // Signal instructions-only mode
          targetWordCount: validatorTargetWordCount,  // Pass UI target word count
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Validation failed');
      }

      const data = await response.json();
      if (data.success && data.output) {
        setValidatorOutput(stripMarkdown(data.output));
        setObjectionsInputText(stripMarkdown(data.output));
        toast({
          title: "Validation Complete!",
          description: `Text validated using ${mode} mode. Reconstructed text has been loaded into the Objections input.`,
        });
      }
    } catch (error: any) {
      console.error('Validator error:', error);
      toast({
        title: "Validation Failed",
        description: error.message || "An error occurred during validation.",
        variant: "destructive",
      });
    } finally {
      setValidatorLoading(false);
      setValidatorProgress("");
    }
  };

  const handleValidatorClear = () => {
    setValidatorInputText("");
    setValidatorOutput("");
    setValidatorMode(null);
    setShowValidatorCustomization(false);
    setValidatorCustomInstructions("");
    setValidatorBatchResults([]);
    setValidatorSelectedModes([]);
    setObjectionsOutput("");
    setObjectionsInputText("");
    setObjectionsCustomInstructions("");
    setFullSuiteObjectionProofOutput("");
    setFullSuiteError("");
    setFullSuiteStage("idle");
  };

  // Refine reconstruction with word count and/or custom instructions
  const handleRefineReconstruction = async () => {
    if (!validatorOutput.trim()) {
      toast({ title: "No text to refine", variant: "destructive" });
      return;
    }
    
    setRefineLoading(true);
    try {
      const response = await fetch("/api/refine-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: validatorOutput,
          targetWordCount: refineWordCount ? parseInt(refineWordCount) : null,
          customInstructions: refineInstructions || null,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Refinement failed");
      }
      
      const data = await response.json();
      if (data.success && data.output) {
        setValidatorOutput(stripMarkdown(data.output));
        setRefineWordCount("");
        setRefineInstructions("");
        toast({ title: "Reconstruction refined successfully!" });
      }
    } catch (error: any) {
      toast({ title: "Refinement failed", description: error.message, variant: "destructive" });
    } finally {
      setRefineLoading(false);
    }
  };

  // Refine final objection-proof version with word count and/or custom instructions
  const handleRefineFinalVersion = async () => {
    if (!fullSuiteObjectionProofOutput.trim()) {
      toast({ title: "No final version to refine", variant: "destructive" });
      return;
    }
    
    setRefineFinalLoading(true);
    try {
      const response = await fetch("/api/refine-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: fullSuiteObjectionProofOutput,
          targetWordCount: refineFinalWordCount ? parseInt(refineFinalWordCount) : null,
          customInstructions: refineFinalInstructions || null,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Refinement failed");
      }
      
      const data = await response.json();
      if (data.success && data.output) {
        setFullSuiteObjectionProofOutput(stripMarkdown(data.output));
        setRefineFinalWordCount("");
        setRefineFinalInstructions("");
        toast({ title: "Final version refined successfully!" });
      }
    } catch (error: any) {
      toast({ title: "Refinement failed", description: error.message, variant: "destructive" });
    } finally {
      setRefineFinalLoading(false);
    }
  };

  // Refine standalone objection-proof output with word count and/or custom instructions
  const handleRefineObjectionProof = async () => {
    if (!objectionProofOutput.trim()) {
      toast({ title: "No objection-proof text to refine", variant: "destructive" });
      return;
    }
    
    setObjectionProofRefineLoading(true);
    try {
      const response = await fetch("/api/refine-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: objectionProofOutput,
          targetWordCount: objectionProofRefineWordCount ? parseInt(objectionProofRefineWordCount) : null,
          customInstructions: objectionProofRefineInstructions || null,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Refinement failed");
      }
      
      const data = await response.json();
      if (data.success && data.output) {
        setObjectionProofRefinedOutput(stripMarkdown(data.output));
        toast({ title: "Refined version generated!" });
      }
    } catch (error: any) {
      toast({ title: "Refinement failed", description: error.message, variant: "destructive" });
    } finally {
      setObjectionProofRefineLoading(false);
    }
  };

  // Refine Full Suite Reconstruction output with word count and/or custom instructions
  const handleRefineReconstructionBatch = async () => {
    const reconstructionOutput = validatorBatchResults.filter(r => r.success)[0]?.output;
    if (!reconstructionOutput?.trim()) {
      toast({ title: "No reconstruction output to refine", variant: "destructive" });
      return;
    }
    
    setRefineReconstructionLoading(true);
    try {
      const response = await fetch("/api/refine-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: reconstructionOutput,
          targetWordCount: refineReconstructionWordCount ? parseInt(refineReconstructionWordCount) : null,
          customInstructions: refineReconstructionInstructions || null,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Refinement failed");
      }
      
      const data = await response.json();
      if (data.success && data.output) {
        // Update the batch results with the refined output
        setValidatorBatchResults(prev => prev.map(r => 
          r.success && r.mode === "reconstruction" 
            ? { ...r, output: stripMarkdown(data.output) }
            : r
        ));
        setRefineReconstructionWordCount("");
        setRefineReconstructionInstructions("");
        toast({ title: "Reconstruction refined successfully!" });
      }
    } catch (error: any) {
      toast({ title: "Refinement failed", description: error.message, variant: "destructive" });
    } finally {
      setRefineReconstructionLoading(false);
    }
  };

  // Refine Coherence rewrite output with word count and/or custom instructions
  const handleRefineCoherence = async () => {
    if (!coherenceRewrite?.trim()) {
      toast({ title: "No coherence output to refine", variant: "destructive" });
      return;
    }
    
    setRefineCoherenceLoading(true);
    try {
      const response = await fetch("/api/refine-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: coherenceRewrite,
          targetWordCount: refineCoherenceWordCount ? parseInt(refineCoherenceWordCount) : null,
          customInstructions: refineCoherenceInstructions || null,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Refinement failed");
      }
      
      const data = await response.json();
      if (data.success && data.output) {
        // Update the coherence rewrite with refined output
        setCoherenceRewrite(stripMarkdown(data.output));
        setRefineCoherenceWordCount("");
        setRefineCoherenceInstructions("");
        toast({ title: "Coherence output refined successfully!" });
      }
    } catch (error: any) {
      toast({ title: "Refinement failed", description: error.message, variant: "destructive" });
    } finally {
      setRefineCoherenceLoading(false);
    }
  };

  // Toggle mode selection for batch processing
  const toggleValidatorModeSelection = (mode: string) => {
    setValidatorSelectedModes(prev => 
      prev.includes(mode) 
        ? prev.filter(m => m !== mode) 
        : [...prev, mode]
    );
  };

  // Batch process multiple modes at once
  // NEUROTEXT REQUIREMENT: Allow instructions-only mode
  const handleValidatorBatchProcess = async () => {
    const hasInputText = validatorInputText.trim().length > 0;
    const hasInstructions = validatorCustomInstructions.trim().length > 0;
    
    if (!hasInputText && !hasInstructions) {
      toast({
        title: "Input Required",
        description: "Please enter text OR instructions to process.",
        variant: "destructive"
      });
      return;
    }

    if (validatorSelectedModes.length === 0) {
      toast({
        title: "No Modes Selected",
        description: "Please select at least one mode to run",
        variant: "destructive"
      });
      return;
    }

    // INTELLIGENT INPUT INTERPRETATION
    const interpretation = interpretInput(validatorInputText, validatorCustomInstructions);
    
    if (interpretation.wasSwapped) {
      toast({
        title: "Inputs Interpreted",
        description: "Detected instructions in text box and content in instructions box - they've been swapped automatically.",
      });
    }
    
    const effectiveText = interpretation.effectiveText;
    const effectiveInstructions = interpretation.effectiveInstructions;
    const effectiveInputText = effectiveText.trim().length > 0 ? effectiveText : effectiveInstructions;

    setValidatorBatchLoading(true);
    setValidatorBatchResults([]);
    setValidatorOutput("");

    try {
      // In batch mode: use aggressive settings, same domain, maximal formalization, maximal truth
      const response = await fetch('/api/text-model-validator/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: effectiveInputText,
          modes: validatorSelectedModes,
          targetDomain: "", // Same as original domain
          fidelityLevel: "aggressive", // Always aggressive in batch mode
          mathFramework: "axiomatic-set-theory", // Maximal formalization
          constraintType: "true-statements", // Maximal truth objective
          rigorLevel: "maximal", // Maximal rigor
          customInstructions: effectiveInstructions,
          truthMapping: "maximal-truth", // Maximal truth mapping
          mathTruthMapping: "maximal-truth", // Maximal math truth mapping
          literalTruth: true, // Enable literal truth mode
          llmProvider: validatorLLMProvider,
          instructionsOnly: effectiveText.trim().length === 0,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Batch validation failed');
      }

      const data = await response.json();
      console.log('Batch validation response:', data);
      if (data.success && data.results) {
        console.log('Setting batch results:', data.results.length, 'items');
        // Strip markdown from all outputs
        const cleanedResults = data.results.map((r: any) => ({
          ...r,
          output: r.output ? stripMarkdown(r.output) : r.output
        }));
        setValidatorBatchResults(cleanedResults);
        toast({
          title: "Batch Validation Complete!",
          description: `Processed ${data.successfulModes}/${data.totalModes} modes successfully`,
        });
      } else {
        console.error('Batch validation response missing results:', data);
      }
    } catch (error: any) {
      console.error('Batch validator error:', error);
      toast({
        title: "Batch Validation Failed",
        description: error.message || "An error occurred during batch validation.",
        variant: "destructive",
      });
    } finally {
      setValidatorBatchLoading(false);
    }
  };

  // Objections Function Handler - generates 25 objections and counter-objections
  const handleObjections = async () => {
    if (!objectionsInputText.trim()) {
      toast({
        title: "No Input Provided",
        description: "Please enter text to analyze for objections.",
        variant: "destructive"
      });
      return;
    }

    setObjectionsLoading(true);
    setObjectionsOutput("");
    
    // Calculate word count to show appropriate progress message
    const wordCount = objectionsInputText.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount >= 1200) {
      setObjectionsProgress("Extracting argument structure (outline-first mode)...");
    } else {
      setObjectionsProgress("Generating objections...");
    }

    try {
      const response = await fetch('/api/text-model-validator/objections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bottomlineOutput: objectionsInputText,
          audience: objectionsAudience,
          objective: objectionsObjective,
          idea: "",
          tone: "professional",
          emphasis: "",
          customInstructions: objectionsCustomInstructions,
          llmProvider: validatorLLMProvider,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Objections generation failed');
      }

      const data = await response.json();
      if (data.success && data.output) {
        setObjectionsOutput(stripMarkdown(data.output));
        const methodDesc = data.method === 'outline-first' ? ' (outline-first analysis)' : '';
        toast({
          title: "Objections Generated!",
          description: `25 likely objections and responses have been generated${methodDesc}.`,
        });
      }
    } catch (error: any) {
      console.error('Objections error:', error);
      toast({
        title: "Objections Generation Failed",
        description: error.message || "An error occurred during objections generation.",
        variant: "destructive",
      });
    } finally {
      setObjectionsLoading(false);
      setObjectionsProgress("");
    }
  };

  // FULL SUITE Handler - Runs Reconstruction → Objections in sequence
  // NEUROTEXT REQUIREMENT: Allow instructions-only mode
  // NEUROTEXT REQUIREMENT: Intelligent input interpretation
  const handleRunFullSuite = async () => {
    // Allow operation if EITHER input text OR custom instructions are provided
    const hasInputText = validatorInputText.trim().length > 0;
    const hasInstructions = validatorCustomInstructions.trim().length > 0;
    
    if (!hasInputText && !hasInstructions) {
      toast({
        title: "Input Required",
        description: "Please enter text OR instructions to run the Full Suite.",
        variant: "destructive"
      });
      return;
    }
    
    // INTELLIGENT INPUT INTERPRETATION - same logic as reconstruction handler
    const interpretation = interpretInput(validatorInputText, validatorCustomInstructions);
    
    // Notify user if we detected and swapped inputs
    if (interpretation.wasSwapped) {
      toast({
        title: "Inputs Interpreted",
        description: "Detected instructions in text box and content in instructions box - they've been swapped automatically.",
      });
    }
    
    // Use interpreted values
    const effectiveText = interpretation.effectiveText;
    let effectiveInstructions = interpretation.effectiveInstructions;
    
    // DEDICATED WORD COUNT FIELD: If user specified a target word count, prepend it to instructions
    const targetWC = parseInt(validatorTargetWordCount);
    if (targetWC && targetWC > 0) {
      const wordCountInstruction = `EXPAND TO ${targetWC} WORDS.`;
      if (effectiveInstructions.trim()) {
        effectiveInstructions = `${wordCountInstruction} ${effectiveInstructions}`;
      } else {
        effectiveInstructions = `${wordCountInstruction} Write a maximally coherent scholarly version. NO PUFFERY. NO HEDGING. Every word must carry meaning.`;
      }
      toast({
        title: "Target Word Count Set",
        description: `Output will be expanded to ${targetWC.toLocaleString()} words.`,
      });
    } else {
      // AUTO-EXPAND: If no word count specified and user provides small text with NO instructions, auto-expand to 5000 words
      const inputWordCount = effectiveText.trim().split(/\s+/).filter(w => w).length;
      const hasNoInstructions = effectiveInstructions.trim().length === 0;
      const isSmallInput = inputWordCount > 0 && inputWordCount < 1000;
      
      if (isSmallInput && hasNoInstructions) {
        effectiveInstructions = "EXPAND TO 5000 WORDS. Write a maximum coherence scholarly paper expanding on this input.";
        toast({
          title: "Auto-Expansion Enabled",
          description: "Small input detected with no instructions - auto-expanding to 5000 word coherent paper.",
        });
      }
    }
    
    const isInstructionsOnly = effectiveText.trim().length === 0;
    
    // Use effective input for processing (text or instructions if text is empty)
    const effectiveInputText = effectiveText.trim().length > 0 ? effectiveText : effectiveInstructions;

    // Initialize pipeline
    setFullSuiteLoading(true);
    setFullSuiteStage("batch");
    setFullSuiteError("");
    
    // Clear previous outputs
    setValidatorBatchResults([]);
    setObjectionsOutput("");
    setFullSuiteObjectionProofOutput("");
    setFullSuiteReconstructionOutput("");
    // Close other popups but OPEN the unified Full Suite popup immediately
    setFullSuiteReconstructionPopupOpen(false);
    setFullSuiteObjectionsPopupOpen(false);
    
    // ============ OPEN UNIFIED POPUP IMMEDIATELY ============
    // Show the popup from the start so user can see progress
    setFullSuitePopupOpen(true);
    setFullSuiteActiveTab("reconstruction");
    
    // NOTE: Do NOT open StreamingOutputModal here - Full Suite uses HTTP requests,
    // not WebSocket streaming. The StreamingOutputModal expects WebSocket messages.

    const allModes = ["reconstruction"];
    
    // Detect if this is an expansion request (using interpreted instructions)
    const isExpansionRequest = hasExpansionInstructions(effectiveInstructions);

    try {
      
      // ============ STAGE 1: RECONSTRUCTION ============
      console.log("[FULL SUITE] Stage 1: Running reconstruction...");
      
      const batchResults: Array<{mode: string; success: boolean; output?: string; error?: string}> = [];
      
      for (const mode of allModes) {
        try {
          const response = await fetch("/api/text-model-validator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: effectiveInputText,  // Use interpreted effective input
              mode: mode,
              targetDomain: validatorTargetDomain || undefined,
              fidelityLevel: "aggressive",
              mathFramework: "axiomatic-set-theory",
              constraintType: "true-statements",
              rigorLevel: "proof-ready",
              literalTruth: true,
              llmProvider: validatorLLMProvider,
              customInstructions: effectiveInstructions || undefined,  // Use interpreted instructions
              instructionsOnly: isInstructionsOnly,  // Signal instructions-only mode
              targetWordCount: validatorTargetWordCount,  // Pass UI target word count
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            batchResults.push({ mode, success: false, error: errorData.message || "Processing failed" });
          } else {
            const data = await response.json();
            if (data.success && data.output) {
              batchResults.push({ mode, success: true, output: stripMarkdown(data.output) });
            } else {
              batchResults.push({ mode, success: false, error: data.message || "No output returned" });
            }
          }
        } catch (error: any) {
          batchResults.push({ mode, success: false, error: error.message || "Network error" });
        }
      }

      setValidatorBatchResults(batchResults);

      // Check if we have at least some successful results
      const successfulResults = batchResults.filter(r => r.success);
      if (successfulResults.length === 0) {
        throw new Error("Reconstruction failed. Cannot proceed to Objections.");
      }

      console.log(`[FULL SUITE] Stage 1 complete: Reconstruction succeeded`);

      // Use the reconstruction output for objections
      const reconstructionOutput = successfulResults[0]?.output || validatorInputText;
      
      // Store reconstruction output (popup already open)
      setFullSuiteReconstructionOutput(reconstructionOutput);

      // ============ STAGE 2: OBJECTIONS ============
      setFullSuiteStage("objections");
      setFullSuiteActiveTab("objections");
      console.log("[FULL SUITE] Stage 2: Running Objections generation...");

      const objectionsResponse = await fetch('/api/text-model-validator/objections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bottomlineOutput: reconstructionOutput,
          audience: objectionsAudience,
          objective: objectionsObjective,
          idea: "",
          tone: "professional",
          emphasis: "",
          customInstructions: objectionsCustomInstructions || effectiveInstructions,  // Use interpreted instructions as fallback
          llmProvider: validatorLLMProvider,
        }),
      });

      if (!objectionsResponse.ok) {
        const errorData = await objectionsResponse.json();
        throw new Error(errorData.message || 'Objections generation failed');
      }

      const objectionsData = await objectionsResponse.json();
      if (!objectionsData.success || !objectionsData.output) {
        throw new Error('Objections returned no output');
      }

      setObjectionsOutput(stripMarkdown(objectionsData.output));
      // Also set the objections input text so it can be used in objection-proof
      setObjectionsInputText(reconstructionOutput);
      console.log("[FULL SUITE] Stage 2 complete: Objections generated");
      
      // Objections output is now stored - popup already open and will show it

      // ============ STAGE 3: OBJECTION-PROOF VERSION ============
      setFullSuiteStage("objection-proof");
      setFullSuiteActiveTab("final");
      console.log("[FULL SUITE] Stage 3: Generating objection-proof version...");

      const objectionProofResponse = await fetch('/api/objection-proof-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: reconstructionOutput,
          objectionsOutput: objectionsData.output,
          customInstructions: effectiveInstructions || "",  // Use interpreted instructions
          finalVersionOnly: true,
        }),
      });

      if (!objectionProofResponse.ok) {
        const errorData = await objectionProofResponse.json();
        throw new Error(errorData.message || 'Objection-proof generation failed');
      }

      const objectionProofData = await objectionProofResponse.json();
      if (!objectionProofData.success || !objectionProofData.output) {
        throw new Error('Objection-proof returned no output');
      }

      setFullSuiteObjectionProofOutput(stripMarkdown(objectionProofData.output));
      setObjectionProofOutput(stripMarkdown(objectionProofData.output)); // Also set standalone state
      console.log("[FULL SUITE] Stage 3 complete: Objection-proof version generated");

      // ============ COMPLETE ============
      setFullSuiteStage("complete");
      // Popup already open - final output now stored and will be displayed
      toast({
        title: "Full Suite Complete!",
        description: "Pipeline finished: Reconstruction + Objections + Objection-Proof Version",
      });

    } catch (error: any) {
      console.error("[FULL SUITE] Pipeline error:", error);
      setFullSuiteStage("error");
      setFullSuiteError(error.message || "An error occurred during pipeline execution");
      toast({
        title: "Full Suite Failed",
        description: error.message || "Pipeline execution failed",
        variant: "destructive",
      });
    } finally {
      setFullSuiteLoading(false);
    }
  };

  // Coherence Meter Handlers
  const createCoherenceChunks = (text: string) => {
    const words = text.trim().split(/\s+/);
    const chunkSize = 400; // ~400 words per chunk
    const chunks: Array<{id: string, text: string, preview: string}> = [];
    
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunkWords = words.slice(i, i + chunkSize);
      const chunkText = chunkWords.join(' ');
      const preview = chunkWords.slice(0, 20).join(' ') + (chunkWords.length > 20 ? '...' : '');
      
      chunks.push({
        id: `chunk-${i / chunkSize + 1}`,
        text: chunkText,
        preview: preview
      });
    }
    
    return chunks;
  };

  const handleCoherenceAnalyze = async () => {
    const wordCount = coherenceInputText.trim().split(/\s+/).length;
    
    if (!coherenceInputText.trim()) {
      toast({
        title: "No Input Text",
        description: "Please enter text to analyze for coherence",
        variant: "destructive"
      });
      return;
    }
    
    // Check word limit (50000 words max for Coherence Meter)
    if (wordCount > 50000) {
      toast({
        title: "Text Too Long",
        description: `Your text has ${wordCount.toLocaleString()} words. Maximum is 50,000 words for Coherence Meter.`,
        variant: "destructive"
      });
      return;
    }

    setCoherenceLoading(true);
    setCoherenceMode("analyze");
    setCoherenceAnalysis("");
    setCoherenceScore(null);
    setCoherenceAssessment(null);
    setDetectedCoherenceType(null);

    try {
      // Use global coherence endpoint for long texts (>1000 words)
      const isLongText = wordCount > 1000;
      const endpoint = isLongText ? '/api/coherence-global' : '/api/coherence-meter';
      
      if (isLongText) {
        toast({
          title: "Processing Long Text",
          description: `Analyzing ${wordCount} words with Global Coherence Preservation Protocol...`,
        });
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: coherenceInputText,
          coherenceType,
          mode: "analyze"
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Analysis failed');
      }

      const data = await response.json();
      if (data.success) {
        setCoherenceAnalysis(stripMarkdown(data.analysis));
        setCoherenceScore(data.score);
        setCoherenceAssessment(data.assessment);
        
        // Handle mathematical proof dual assessment (coherence + validity)
        if (data.isMathematical) {
          setCoherenceIsMathematical(true);
          setCoherenceIsScientific(false);
          setCoherenceLogicalScore(null);
          setCoherenceScientificScore(null);
          // Set validity analysis data
          setMathValidityAnalysis(data.validityAnalysis);
          setMathValidityScore(data.validityScore);
          setMathValidityVerdict(data.validityVerdict);
          setMathValiditySubscores(data.validitySubscores);
          setMathValidityFlaws(data.flaws || []);
          setMathValidityCounterexamples(data.counterexamples || []);
          toast({
            title: "Mathematical Proof Analysis Complete!",
            description: `Coherence: ${data.coherenceScore}/10 | Validity: ${data.validityScore}/10 (${data.validityVerdict})`,
          });
        } else if (data.isScientificExplanatory) {
          // Handle scientific-explanatory dual assessment
          setCoherenceIsMathematical(false);
          setCoherenceIsScientific(true);
          setCoherenceLogicalScore(data.logicalConsistency);
          setCoherenceScientificScore(data.scientificAccuracy);
          // Clear validity data
          setMathValidityAnalysis("");
          setMathValidityScore(null);
          setMathValidityVerdict(null);
          setMathValiditySubscores(null);
          setMathValidityFlaws([]);
          setMathValidityCounterexamples([]);
          
          // Capture detected coherence type if auto-detected
          if (data.wasAutoDetected && data.detectedCoherenceType) {
            setDetectedCoherenceType(data.detectedCoherenceType);
          }
          
          const autoDetectMsg = data.wasAutoDetected ? ' (Auto-Detected: Scientific-Explanatory)' : '';
          toast({
            title: "Scientific-Explanatory Analysis Complete!",
            description: `Overall: ${data.score}/10 | Logical: ${data.logicalConsistency.score}/10 | Scientific: ${data.scientificAccuracy.score}/10${autoDetectMsg}`,
          });
        } else {
          setCoherenceIsMathematical(false);
          setCoherenceIsScientific(false);
          setCoherenceLogicalScore(null);
          setCoherenceScientificScore(null);
          // Clear validity data
          setMathValidityAnalysis("");
          setMathValidityScore(null);
          setMathValidityVerdict(null);
          setMathValiditySubscores(null);
          setMathValidityFlaws([]);
          setMathValidityCounterexamples([]);
          
          // Capture detected coherence type if auto-detected
          if (data.wasAutoDetected && data.detectedCoherenceType) {
            setDetectedCoherenceType(data.detectedCoherenceType);
          }
          
          const autoDetectMsg = data.wasAutoDetected && data.detectedCoherenceType 
            ? ` (Applied: ${data.detectedCoherenceType.replace(/-/g, ' ')})` 
            : '';
          toast({
            title: "Coherence Analysis Complete!",
            description: `Score: ${data.score}/10 - ${data.assessment}${autoDetectMsg}`,
          });
        }
      }
    } catch (error: any) {
      console.error('Coherence analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error.message || "An error occurred during coherence analysis.",
        variant: "destructive",
      });
    } finally {
      setCoherenceLoading(false);
    }
  };

  const handleCoherenceRewrite = async () => {
    const wordCount = coherenceInputText.trim().split(/\s+/).length;
    
    if (!coherenceInputText.trim()) {
      toast({
        title: "No Input Text",
        description: "Please enter text to rewrite for coherence",
        variant: "destructive"
      });
      return;
    }
    
    // Check word limit (50000 words max for Coherence Meter)
    if (wordCount > 50000) {
      toast({
        title: "Text Too Long",
        description: `Your text has ${wordCount.toLocaleString()} words. Maximum is 50,000 words.`,
        variant: "destructive"
      });
      return;
    }

    setCoherenceLoading(true);
    setCoherenceMode("rewrite");
    setCoherenceRewrite("");
    setCoherenceChanges("");
    setCoherenceCorrectionsApplied([]);
    setCoherenceRewriteAccuracyScore(null);
    setDetectedCoherenceType(null);

    try {
      // Use global coherence endpoint for long texts (>1000 words)
      const isLongText = wordCount > 1000;
      const endpoint = isLongText ? '/api/coherence-global' : '/api/coherence-meter';
      
      if (isLongText) {
        toast({
          title: "Processing Long Text",
          description: `Rewriting ${wordCount} words with Global Coherence Preservation Protocol...`,
        });
      }
      
      // Include resume data if available
      const requestBody: any = {
        text: coherenceInputText,
        coherenceType,
        mode: "rewrite",
        aggressiveness: coherenceAggressiveness
      };
      
      // If resuming, pass the resume parameters
      if (resumeJobData) {
        requestBody.documentId = resumeJobData.documentId;
        requestBody.resumeFromChunk = resumeJobData.resumeFromChunk;
        requestBody.globalState = resumeJobData.globalState;
        requestBody.existingChunks = resumeJobData.existingChunks;
        console.log(`[Resume] Resuming job ${resumeJobData.documentId} from chunk ${resumeJobData.resumeFromChunk}`);
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Rewrite failed');
      }

      const data = await response.json();
      if (data.success) {
        setCoherenceRewrite(stripMarkdown(data.rewrite));
        setCoherenceChanges(data.changes);
        
        // Capture detected coherence type if auto-detected
        if (data.wasAutoDetected && data.detectedCoherenceType) {
          setDetectedCoherenceType(data.detectedCoherenceType);
        }
        
        // Handle scientific-explanatory specific data
        if (data.isScientificExplanatory) {
          setCoherenceIsScientific(true);
          setCoherenceCorrectionsApplied(data.correctionsApplied || []);
          setCoherenceRewriteAccuracyScore(data.scientificAccuracyScore || null);
        }
        
        const appliedType = data.wasAutoDetected && data.detectedCoherenceType 
          ? data.detectedCoherenceType.replace(/-/g, ' ')
          : coherenceType.replace(/-/g, ' ');
        
        toast({
          title: data.isScientificExplanatory ? "Scientific Accuracy Rewrite Complete!" : "Coherence Rewrite Complete!",
          description: data.isScientificExplanatory 
            ? `Text rewritten for scientific accuracy (Score: ${data.scientificAccuracyScore}/10)${data.wasAutoDetected ? ' (Auto-Detected)' : ''}`
            : `Text rewritten to maximize ${appliedType} coherence${data.wasAutoDetected ? ' (Auto-Detected)' : ''}`,
        });
      }
    } catch (error: any) {
      console.error('Coherence rewrite error:', error);
      toast({
        title: "Rewrite Failed",
        description: error.message || "An error occurred during coherence rewriting.",
        variant: "destructive",
      });
    } finally {
      setCoherenceLoading(false);
    }
  };

  // Combined: Analyze + Rewrite in sequence
  const handleCoherenceAnalyzeAndRewrite = async () => {
    const wordCount = coherenceInputText.trim().split(/\s+/).length;
    
    if (!coherenceInputText.trim()) {
      toast({
        title: "No Input Text",
        description: "Please enter text to analyze and rewrite",
        variant: "destructive"
      });
      return;
    }
    
    if (wordCount > 50000) {
      toast({
        title: "Text Too Long",
        description: `Your text has ${wordCount.toLocaleString()} words. Maximum is 50,000 words.`,
        variant: "destructive"
      });
      return;
    }

    setCoherenceLoading(true);
    setCoherenceMode("analyze-and-rewrite");
    setCoherenceAnalysis("");
    setCoherenceScore(null);
    setCoherenceAssessment(null);
    setDetectedCoherenceType(null);
    setCoherenceRewrite("");
    setCoherenceChanges("");
    setCoherenceCorrectionsApplied([]);
    setCoherenceRewriteAccuracyScore(null);

    try {
      const isLongText = wordCount > 1000;
      const endpoint = isLongText ? '/api/coherence-global' : '/api/coherence-meter';
      
      // STEP 1: Run Analysis
      setCoherenceStageProgress("Stage 1/2: Analyzing coherence...");
      toast({
        title: "Step 1: Analyzing Coherence",
        description: isLongText ? `Analyzing ${wordCount} words with Global Coherence Preservation...` : "Running coherence analysis...",
      });
      
      const analyzeResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: coherenceInputText,
          coherenceType,
          mode: "analyze"
        }),
      });

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json();
        throw new Error(errorData.message || 'Analysis failed');
      }

      const analyzeData = await analyzeResponse.json();
      if (analyzeData.success) {
        setCoherenceAnalysis(stripMarkdown(analyzeData.analysis));
        setCoherenceScore(analyzeData.score);
        setCoherenceAssessment(analyzeData.assessment);
        
        if (analyzeData.isScientificExplanatory) {
          setCoherenceIsScientific(true);
          setCoherenceIsMathematical(false);
          setCoherenceLogicalScore(analyzeData.logicalConsistency);
          setCoherenceScientificScore(analyzeData.scientificAccuracy);
        } else if (analyzeData.isMathematical) {
          setCoherenceIsMathematical(true);
          setCoherenceIsScientific(false);
          setMathValidityAnalysis(analyzeData.validityAnalysis);
          setMathValidityScore(analyzeData.validityScore);
          setMathValidityVerdict(analyzeData.validityVerdict);
        } else {
          setCoherenceIsMathematical(false);
          setCoherenceIsScientific(false);
        }
        
        if (analyzeData.wasAutoDetected && analyzeData.detectedCoherenceType) {
          setDetectedCoherenceType(analyzeData.detectedCoherenceType);
        }
      }

      // STEP 2: Run Rewrite
      setCoherenceStageProgress("Stage 2/2: Rewriting to maximize coherence...");
      toast({
        title: "Step 2: Rewriting",
        description: "Generating improved version...",
      });
      
      const rewriteResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: coherenceInputText,
          coherenceType,
          mode: "rewrite",
          aggressiveness: coherenceAggressiveness
        }),
      });

      if (!rewriteResponse.ok) {
        const errorData = await rewriteResponse.json();
        throw new Error(errorData.message || 'Rewrite failed');
      }

      const rewriteData = await rewriteResponse.json();
      if (rewriteData.success) {
        setCoherenceRewrite(stripMarkdown(rewriteData.rewrite));
        setCoherenceChanges(rewriteData.changes);
        
        if (rewriteData.isScientificExplanatory) {
          setCoherenceCorrectionsApplied(rewriteData.correctionsApplied || []);
          setCoherenceRewriteAccuracyScore(rewriteData.scientificAccuracyScore || null);
        }
      }

      setCoherenceStageProgress("");
      toast({
        title: "Analysis + Rewrite Complete!",
        description: `Score: ${analyzeData.score}/10. Both analysis and improved version are ready.`,
      });
      
    } catch (error: any) {
      console.error('Analyze and rewrite error:', error);
      toast({
        title: "Operation Failed",
        description: error.message || "An error occurred during analyze and rewrite.",
        variant: "destructive",
      });
    } finally {
      setCoherenceLoading(false);
      setCoherenceStageProgress("");
    }
  };

  // REWRITE TO MAX COHERENCE - aggressive rewrite aiming for 9-10/10
  const handleCoherenceRewriteMax = async () => {
    const wordCount = coherenceInputText.trim().split(/\s+/).length;
    
    if (!coherenceInputText.trim()) {
      toast({ title: "No Input Text", description: "Please enter text to rewrite", variant: "destructive" });
      return;
    }
    if (wordCount > 50000) {
      toast({ title: "Text Too Long", description: `Your text has ${wordCount.toLocaleString()} words. Maximum is 50,000 words.`, variant: "destructive" });
      return;
    }

    setCoherenceLoading(true);
    setCoherenceMode("rewrite");
    setCoherenceRewrite("");
    setCoherenceChanges("");

    try {
      const isLongText = wordCount > 1000;
      // Both endpoints support aggressive mode - use it for max coherence
      const endpoint = isLongText ? '/api/coherence-global' : '/api/coherence-meter';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: coherenceInputText,
          coherenceType,
          mode: "rewrite",
          aggressiveness: "aggressive"  // Always aggressive for max coherence
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Rewrite failed');
      }

      const data = await response.json();
      if (data.success) {
        setCoherenceRewrite(stripMarkdown(data.rewrite));
        setCoherenceChanges(data.changes);
        toast({ title: "Max Coherence Rewrite Complete!", description: "Text has been aggressively rewritten for maximum coherence." });
      }
    } catch (error: any) {
      toast({ title: "Rewrite Failed", description: error.message || "An error occurred.", variant: "destructive" });
    } finally {
      setCoherenceLoading(false);
    }
  };

  // RECONSTRUCT TO MAX COHERENCE - adds thematically adjacent material if needed
  const handleCoherenceReconstruct = async () => {
    const wordCount = coherenceInputText.trim().split(/\s+/).length;
    
    if (!coherenceInputText.trim()) {
      toast({ title: "No Input Text", description: "Please enter text to reconstruct", variant: "destructive" });
      return;
    }
    if (wordCount > 50000) {
      toast({ title: "Text Too Long", description: `Your text has ${wordCount.toLocaleString()} words. Maximum is 50,000 words.`, variant: "destructive" });
      return;
    }

    setCoherenceLoading(true);
    setCoherenceMode("rewrite");
    setCoherenceRewrite("");
    setCoherenceChanges("");

    try {
      toast({ title: "Reconstructing...", description: "Finding thematically-adjacent material if needed..." });
      
      const response = await fetch('/api/coherence-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: coherenceInputText,
          coherenceType,
          mode: "reconstruct"
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Reconstruction failed');
      }

      const data = await response.json();
      if (data.success) {
        setCoherenceRewrite(stripMarkdown(data.rewrite));
        setCoherenceChanges(data.changes);
        const reconstructionMsg = data.wasReconstructed 
          ? "Text reconstructed with thematically-adjacent material." 
          : "Original permitted max coherence; no reconstruction needed.";
        toast({ title: "Reconstruction Complete!", description: reconstructionMsg });
      }
    } catch (error: any) {
      toast({ title: "Reconstruction Failed", description: error.message || "An error occurred.", variant: "destructive" });
    } finally {
      setCoherenceLoading(false);
    }
  };

  // ANALYZE + REWRITE TO MAX - analyze then aggressive rewrite
  const handleCoherenceAnalyzeAndRewriteMax = async () => {
    const wordCount = coherenceInputText.trim().split(/\s+/).length;
    
    if (!coherenceInputText.trim()) {
      toast({ title: "No Input Text", description: "Please enter text to analyze and rewrite", variant: "destructive" });
      return;
    }
    if (wordCount > 50000) {
      toast({ title: "Text Too Long", description: `Your text has ${wordCount.toLocaleString()} words. Maximum is 50,000 words.`, variant: "destructive" });
      return;
    }

    setCoherenceLoading(true);
    setCoherenceMode("analyze-and-rewrite");
    setCoherenceAnalysis("");
    setCoherenceScore(null);
    setCoherenceAssessment(null);
    setCoherenceRewrite("");
    setCoherenceChanges("");
    setCoherenceStageProgress("Stage 1/2: Analyzing coherence...");

    try {
      const isLongText = wordCount > 1000;
      const endpoint = isLongText ? '/api/coherence-global' : '/api/coherence-meter';
      
      // Step 1: Analyze
      const analyzeResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: coherenceInputText, coherenceType, mode: "analyze" }),
      });
      
      if (!analyzeResponse.ok) throw new Error('Analysis failed');
      const analyzeData = await analyzeResponse.json();
      
      if (analyzeData.success) {
        setCoherenceAnalysis(stripMarkdown(analyzeData.analysis));
        setCoherenceScore(analyzeData.score);
        setCoherenceAssessment(analyzeData.assessment);
      }

      // Step 2: Rewrite Max - always use aggressive mode for maximum coherence
      setCoherenceStageProgress("Stage 2/2: Rewriting to maximum coherence...");
      const rewriteResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: coherenceInputText, coherenceType, mode: "rewrite", aggressiveness: "aggressive" }),
      });

      if (!rewriteResponse.ok) throw new Error('Rewrite failed');
      const rewriteData = await rewriteResponse.json();
      
      if (rewriteData.success) {
        setCoherenceRewrite(stripMarkdown(rewriteData.rewrite));
        setCoherenceChanges(rewriteData.changes);
      }

      toast({ title: "Analysis + Max Rewrite Complete!", description: `Score: ${analyzeData.score}/10. Both analysis and maximally coherent version ready.` });
    } catch (error: any) {
      toast({ title: "Operation Failed", description: error.message || "An error occurred.", variant: "destructive" });
    } finally {
      setCoherenceLoading(false);
      setCoherenceStageProgress("");
    }
  };

  // ANALYZE + RECONSTRUCT TO MAX - analyze then reconstruct with adjacent material
  const handleCoherenceAnalyzeAndReconstruct = async () => {
    const wordCount = coherenceInputText.trim().split(/\s+/).length;
    
    if (!coherenceInputText.trim()) {
      toast({ title: "No Input Text", description: "Please enter text to analyze and reconstruct", variant: "destructive" });
      return;
    }
    if (wordCount > 50000) {
      toast({ title: "Text Too Long", description: `Your text has ${wordCount.toLocaleString()} words. Maximum is 50,000 words.`, variant: "destructive" });
      return;
    }

    setCoherenceLoading(true);
    setCoherenceMode("analyze-and-rewrite");
    setCoherenceAnalysis("");
    setCoherenceScore(null);
    setCoherenceAssessment(null);
    setCoherenceRewrite("");
    setCoherenceChanges("");
    setCoherenceStageProgress("Stage 1/2: Analyzing coherence...");

    try {
      const isLongText = wordCount > 1000;
      const analyzeEndpoint = isLongText ? '/api/coherence-global' : '/api/coherence-meter';
      
      // Step 1: Analyze
      const analyzeResponse = await fetch(analyzeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: coherenceInputText, coherenceType, mode: "analyze" }),
      });
      
      if (!analyzeResponse.ok) throw new Error('Analysis failed');
      const analyzeData = await analyzeResponse.json();
      
      if (analyzeData.success) {
        setCoherenceAnalysis(stripMarkdown(analyzeData.analysis));
        setCoherenceScore(analyzeData.score);
        setCoherenceAssessment(analyzeData.assessment);
      }

      // Step 2: Reconstruct
      setCoherenceStageProgress("Stage 2/2: Reconstructing to maximum coherence...");
      toast({ title: "Reconstructing...", description: "Finding thematically-adjacent material if needed..." });
      
      const reconstructResponse = await fetch('/api/coherence-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: coherenceInputText, coherenceType, mode: "reconstruct" }),
      });

      if (!reconstructResponse.ok) throw new Error('Reconstruction failed');
      const reconstructData = await reconstructResponse.json();
      
      if (reconstructData.success) {
        setCoherenceRewrite(stripMarkdown(reconstructData.rewrite));
        setCoherenceChanges(reconstructData.changes);
      }

      const reconstructionMsg = reconstructData.wasReconstructed 
        ? "Reconstructed with thematically-adjacent material." 
        : "No reconstruction needed.";
      toast({ title: "Analysis + Reconstruction Complete!", description: `Score: ${analyzeData.score}/10. ${reconstructionMsg}` });
    } catch (error: any) {
      toast({ title: "Operation Failed", description: error.message || "An error occurred.", variant: "destructive" });
    } finally {
      setCoherenceLoading(false);
      setCoherenceStageProgress("");
    }
  };

  // MATH COHERENCE - analyze structural coherence only
  const handleMathCoherence = async () => {
    if (!coherenceInputText.trim()) {
      toast({ title: "No Input Text", description: "Please enter a mathematical proof to analyze", variant: "destructive" });
      return;
    }
    setCoherenceLoading(true);
    setCoherenceMode("analyze");
    setCoherenceIsMathematical(true);
    setCoherenceAnalysis("");
    setCoherenceScore(null);
    setCoherenceAssessment(null);

    try {
      const response = await fetch('/api/coherence-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: coherenceInputText, mode: "math-coherence" }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Analysis failed');
      }
      const data = await response.json();
      if (data.success) {
        setCoherenceAnalysis(data.analysis);
        setCoherenceScore(data.score);
        setCoherenceAssessment(data.assessment);
        // Clear cogency data when doing coherence analysis
        setMathValidityAnalysis("");
        setMathValidityScore(null);
        setMathValidityVerdict(null);
        setMathValiditySubscores(null);
        setMathValidityFlaws([]);
        setMathValidityCounterexamples([]);
        toast({ title: "Math Coherence Analysis Complete!", description: `Score: ${data.score}/10 - ${data.assessment}` });
      }
    } catch (error: any) {
      console.error('Math coherence error:', error);
      toast({ title: "Analysis Failed", description: error.message || "An error occurred.", variant: "destructive" });
    } finally {
      setCoherenceLoading(false);
    }
  };

  // MATH COGENCY - analyze if theorem is true and proof valid
  const handleMathCogency = async () => {
    if (!coherenceInputText.trim()) {
      toast({ title: "No Input Text", description: "Please enter a mathematical proof to analyze", variant: "destructive" });
      return;
    }
    setCoherenceLoading(true);
    setCoherenceMode("analyze");
    setCoherenceIsMathematical(true);

    try {
      const response = await fetch('/api/coherence-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: coherenceInputText, mode: "math-cogency" }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Analysis failed');
      }
      const data = await response.json();
      if (data.success) {
        setMathValidityAnalysis(data.analysis);
        setMathValidityScore(data.score);
        setMathValidityVerdict(data.verdict);
        setMathValiditySubscores(data.subscores);
        setMathValidityFlaws(data.flaws || []);
        setMathValidityCounterexamples(data.counterexamples || []);
        toast({ 
          title: "Math Cogency Analysis Complete!", 
          description: `Score: ${data.score}/10 - ${data.verdict}` 
        });
      }
    } catch (error: any) {
      console.error('Math cogency error:', error);
      toast({ title: "Analysis Failed", description: error.message || "An error occurred.", variant: "destructive" });
    } finally {
      setCoherenceLoading(false);
    }
  };

  // MATH MAX COHERENCE - rewrite to maximize structural coherence
  const handleMathMaxCoherence = async () => {
    if (!coherenceInputText.trim()) {
      toast({ title: "No Input Text", description: "Please enter a mathematical proof to rewrite", variant: "destructive" });
      return;
    }
    setCoherenceLoading(true);
    setCoherenceMode("rewrite");
    setCoherenceRewrite("");
    setCoherenceChanges("");

    try {
      const response = await fetch('/api/coherence-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: coherenceInputText, 
          mode: "math-max-coherence",
          aggressiveness: coherenceAggressiveness 
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Rewrite failed');
      }
      const data = await response.json();
      if (data.success) {
        setCoherenceRewrite(stripMarkdown(data.rewrite));
        setCoherenceChanges(data.changes);
        setCoherenceRewriteAccuracyScore(data.coherenceScore);
        toast({ title: "Max Coherence Rewrite Complete!", description: `Coherence Score: ${data.coherenceScore}/10` });
      }
    } catch (error: any) {
      console.error('Math max coherence error:', error);
      toast({ title: "Rewrite Failed", description: error.message || "An error occurred.", variant: "destructive" });
    } finally {
      setCoherenceLoading(false);
    }
  };

  // MATH MAXIMIZE TRUTH - correct proofs or find adjacent truths
  const handleMathMaximizeTruth = async () => {
    if (!coherenceInputText.trim()) {
      toast({ title: "No Input Text", description: "Please enter a mathematical proof to correct", variant: "destructive" });
      return;
    }
    setCoherenceLoading(true);
    setCoherenceMode("rewrite");
    setMathProofCorrectedProof("");
    setMathProofTheoremStatus(null);
    setMathProofOriginalTheorem("");
    setMathProofCorrectedTheorem(null);
    setMathProofStrategy("");
    setMathProofKeyCorrections([]);
    setMathProofValidityScore(null);
    setMathProofIsCorrected(false);

    try {
      const response = await fetch('/api/coherence-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: coherenceInputText, mode: "math-maximize-truth" }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Math proof correction failed');
      }
      const data = await response.json();
      if (data.success) {
        setMathProofCorrectedProof(data.correctedProof);
        setMathProofTheoremStatus(data.theoremStatus);
        setMathProofOriginalTheorem(data.originalTheorem);
        setMathProofCorrectedTheorem(data.correctedTheorem);
        setMathProofStrategy(data.proofStrategy);
        setMathProofKeyCorrections(data.keyCorrections || []);
        setMathProofValidityScore(data.validityScore);
        setMathProofIsCorrected(true);
        
        const statusMessage = data.theoremStatus === "TRUE" 
          ? "Theorem is TRUE - Proof corrected"
          : data.theoremStatus === "FALSE"
          ? "Theorem is FALSE - Similar true theorem proved instead"
          : "Theorem is PARTIALLY TRUE - Corrected with proper conditions";
        
        toast({ title: "Math Proof Correction Complete!", description: `${statusMessage} (Validity: ${data.validityScore}/10)` });
      }
    } catch (error: any) {
      console.error('Math maximize truth error:', error);
      toast({ title: "Proof Correction Failed", description: error.message || "An error occurred.", variant: "destructive" });
    } finally {
      setCoherenceLoading(false);
    }
  };

  const handleProcessSelectedChunks = async (mode: "analyze" | "rewrite") => {
    if (selectedCoherenceChunks.length === 0) {
      toast({
        title: "No Sections Selected",
        description: "Please select at least one section to process",
        variant: "destructive"
      });
      return;
    }

    const selectedChunkObjects = coherenceChunks.filter(c => selectedCoherenceChunks.includes(c.id));
    
    setCoherenceLoading(true);
    setCoherenceMode(mode);
    setShowCoherenceChunkSelector(false);
    
    if (mode === "analyze") {
      setCoherenceAnalysis("");
      setCoherenceScore(null);
      setCoherenceAssessment(null);
    } else {
      setCoherenceRewrite("");
      setCoherenceChanges("");
    }

    // Check if outline-guided mode is selected
    if (coherenceProcessingMode === "outline-guided") {
      // Use outline-guided endpoint for full text
      const fullText = selectedChunkObjects.map(c => c.text).join('\n\n');
      
      setCoherenceStageProgress("STAGE 1: Generating document outline...\nThis may take a moment...");
      
      try {
        const response = await fetch('/api/coherence-outline-guided', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: fullText,
            coherenceType,
            mode,
            aggressiveness: coherenceAggressiveness
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Outline-guided ${mode} failed`);
        }

        const data = await response.json();
        if (data.success) {
          if (mode === "analyze") {
            setCoherenceAnalysis(stripMarkdown(data.analysis));
          } else {
            setCoherenceRewrite(stripMarkdown(data.rewrite));
            setCoherenceChanges(data.changes);
          }
          
          toast({
            title: "Outline-Guided Processing Complete!",
            description: `Successfully processed using two-stage approach`,
          });
        }
      } catch (error: any) {
        console.error(`Outline-guided ${mode} error:`, error);
        toast({
          title: `${mode.charAt(0).toUpperCase() + mode.slice(1)} Failed`,
          description: error.message || `An error occurred during outline-guided ${mode}.`,
          variant: "destructive",
        });
      } finally {
        setCoherenceLoading(false);
        setCoherenceStageProgress("");
      }
    } else {
      // Use simple chunking mode - process each chunk independently
      let combinedAnalysis = "";
      let combinedRewrite = "";
      let combinedChanges = "";

      try {
        for (let i = 0; i < selectedChunkObjects.length; i++) {
          const chunk = selectedChunkObjects[i];
          
          toast({
            title: `Processing Section ${i + 1}/${selectedChunkObjects.length}`,
            description: `Analyzing: "${chunk.preview}"`,
          });

          const response = await fetch('/api/coherence-meter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: chunk.text,
              coherenceType,
              mode,
              aggressiveness: coherenceAggressiveness
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `${mode} failed for section ${i + 1}`);
          }

          const data = await response.json();
          if (data.success) {
            if (mode === "analyze") {
              combinedAnalysis += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSECTION ${i + 1} of ${selectedChunkObjects.length}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${data.analysis}`;
            } else {
              combinedRewrite += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSECTION ${i + 1} of ${selectedChunkObjects.length}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${data.rewrite}`;
              combinedChanges += `\n\n━━━━ SECTION ${i + 1} ━━━━\n${data.changes}`;
            }
          }
        }

        if (mode === "analyze") {
          setCoherenceAnalysis(stripMarkdown(combinedAnalysis.trim()));
          toast({
            title: "All Sections Analyzed!",
            description: `Processed ${selectedChunkObjects.length} sections successfully`,
          });
        } else {
          setCoherenceRewrite(stripMarkdown(combinedRewrite.trim()));
          setCoherenceChanges(combinedChanges.trim());
          toast({
            title: "All Sections Rewritten!",
            description: `Processed ${selectedChunkObjects.length} sections successfully`,
          });
        }
      } catch (error: any) {
        console.error(`Coherence ${mode} error:`, error);
        toast({
          title: `${mode.charAt(0).toUpperCase() + mode.slice(1)} Failed`,
          description: error.message || `An error occurred during coherence ${mode}.`,
          variant: "destructive",
        });
      } finally {
        setCoherenceLoading(false);
      }
    }
  };

  const handleCoherenceClear = () => {
    setCoherenceInputText("");
    setCoherenceAnalysis("");
    setCoherenceRewrite("");
    setCoherenceChanges("");
    setCoherenceMode(null);
    setCoherenceScore(null);
    setCoherenceAssessment(null);
    setCoherenceChunks([]);
    setSelectedCoherenceChunks([]);
    setShowCoherenceChunkSelector(false);
    setCoherenceIsScientific(false);
    setCoherenceLogicalScore(null);
    setCoherenceScientificScore(null);
    setCoherenceCorrectionsApplied([]);
    setCoherenceRewriteAccuracyScore(null);
    setMathProofCorrectedProof("");
    setMathProofTheoremStatus(null);
    setMathProofOriginalTheorem("");
    setMathProofCorrectedTheorem(null);
    setMathProofStrategy("");
    setMathProofKeyCorrections([]);
    setMathProofValidityScore(null);
    setMathProofIsCorrected(false);
    setContentAnalysisResult(null);
  };

  // Content Analysis Handler - Evaluates richness, substantiveness, salvageability
  const handleContentAnalysis = async () => {
    if (!coherenceInputText.trim()) {
      toast({
        title: "Input Required",
        description: "Please enter text to analyze.",
        variant: "destructive",
      });
      return;
    }

    setContentAnalysisLoading(true);
    setContentAnalysisResult(null);

    try {
      const response = await fetch('/api/content-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: coherenceInputText }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Content analysis failed");
      }

      setContentAnalysisResult({
        richnessScore: data.richnessScore,
        richnessAssessment: data.richnessAssessment,
        substantivenessGap: data.substantivenessGap,
        salvageability: data.salvageability,
        breakdown: data.breakdown,
        fullAnalysis: data.fullAnalysis,
      });

      toast({
        title: "Content Analysis Complete!",
        description: `Richness: ${data.richnessScore}/10 (${data.richnessAssessment}) | ${data.salvageability.status}`,
      });

    } catch (error: any) {
      console.error("Content Analysis error:", error);
      toast({
        title: "Content Analysis Failed",
        description: error.message || "An error occurred during content analysis.",
        variant: "destructive",
      });
    } finally {
      setContentAnalysisLoading(false);
    }
  };


  // FIXED streaming function
  const startStreaming = async (text: string, provider: string) => {
    console.log('startStreaming called with:', { text: text.slice(0, 50), provider });
    
    try {
      console.log('Making fetch request to /api/stream-analysis...');
      
      const response = await fetch('/api/stream-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, provider }),
      });

      console.log('Response received:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      console.log('Starting to read stream...');
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('Stream ended');
          setIsStreaming(false);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.log('Received chunk:', chunk);
        
        if (chunk) {
          setStreamingContent(prev => {
            const newContent = prev + chunk;
            console.log('Updated content length:', newContent.length);
            return newContent;
          });
        }
      }
      
    } catch (error) {
      console.error('Streaming error:', error);
      setStreamingContent('ERROR: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setIsStreaming(false);
    }
  };
  const [apiStatus, setApiStatus] = useState<{
    openai: boolean;
    anthropic: boolean;
    perplexity: boolean;
    deepseek: boolean;
    grok: boolean;
  }>({
    openai: false,
    anthropic: false,
    perplexity: false,
    deepseek: false,
    grok: false
  });
  
  // Check API status when component mounts
  useEffect(() => {
    async function checkApiStatus() {
      try {
        const response = await fetch("/api/check-api");
        const data = await response.json();
        
        if (data.api_keys) {
          setApiStatus({
            openai: data.api_keys.openai === "configured",
            anthropic: data.api_keys.anthropic === "configured",
            perplexity: data.api_keys.perplexity === "configured",
            deepseek: data.api_keys.deepseek === "configured",
            grok: data.api_keys.grok === "configured"
          });
          
          console.log("API Status:", data.api_keys);
        }
      } catch (error) {
        console.error("Error checking API status:", error);
      }
    }
    
    checkApiStatus();
  }, []);

  // Handler for checking if a document is AI-generated
  const handleCheckAI = async (documentId: "A" | "B") => {
    const document = documentId === "A" ? documentA : documentB;
    
    if (!document.content.trim()) {
      alert("Please enter some text before checking for AI.");
      return;
    }

    setCurrentAICheckDocument(documentId);
    setAIDetectionModalOpen(true);
    setIsAICheckLoading(true);
    setAIDetectionResult(undefined);

    try {
      const result = await checkForAI(document);
      setAIDetectionResult(result);
      
      // Update the document analysis with AI detection results if it exists
      if (documentId === "A" && analysisA) {
        setAnalysisA({
          ...analysisA,
          aiDetection: result
        });
      } else if (documentId === "B" && analysisB) {
        setAnalysisB({
          ...analysisB,
          aiDetection: result
        });
      }
    } catch (error) {
      console.error("Error checking for AI:", error);
    } finally {
      setIsAICheckLoading(false);
    }
  };

  // Handler for case assessment - REAL-TIME STREAMING
  const handleCaseAssessment = async () => {
    if (!documentA.content.trim()) {
      alert("Please enter some text to assess how well it makes its case.");
      return;
    }

    // Check if the selected provider is available (map ZHI names to original API names)
    const apiKeyMapping: Record<string, string> = {
      'zhi1': 'openai',
      'zhi2': 'anthropic', 
      'zhi3': 'deepseek',
      'zhi4': 'perplexity',
      'zhi5': 'grok'
    };
    const actualApiKey = apiKeyMapping[selectedProvider] || selectedProvider;
    if (selectedProvider !== "all" && !apiStatus[actualApiKey as keyof typeof apiStatus]) {
      alert(`The ${selectedProvider} API key is not configured or is invalid. Please select a different provider or ensure the API key is properly set.`);
      return;
    }

    // Reset any previous streaming state and clear previous analysis results
    setIsStreaming(false);
    setStreamingContent('');
    setAnalysisA(null); // Clear previous intelligence analysis
    setShowResults(true); // Ensure results section is visible
    
    // Start REAL-TIME streaming for case assessment
    setIsStreaming(true);
    setIsCaseAssessmentLoading(true);
    setCaseAssessmentResult(null);

    try {
      const provider = selectedProvider === "all" ? "zhi1" : selectedProvider;
      
      const response = await fetch('/api/case-assessment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: documentA.content,
          provider: provider,
          context: documentA.context
        }),
      });

      if (!response.ok) {
        throw new Error(`Case assessment failed: ${response.statusText}`);
      }

      // REAL-TIME STREAMING: Read response token by token
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        setStreamingContent(fullResponse); // Show each token as it arrives
      }

      // Parse the case assessment response to extract scores
      const parseScores = (text: string) => {
        const extractScore = (pattern: string): number => {
          // Try multiple patterns to extract scores
          const patterns = [
            new RegExp(`${pattern}[:\\s]*(\\d+)(?:/100)?`, 'i'),
            new RegExp(`${pattern}.*?(\\d+)/100`, 'i'),
            new RegExp(`${pattern}.*?Score[:\\s]*(\\d+)`, 'i'),
            new RegExp(`${pattern}.*?(\\d+)`, 'i')
          ];
          
          for (const regex of patterns) {
            const match = text.match(regex);
            if (match && match[1]) {
              const score = parseInt(match[1]);
              if (score >= 0 && score <= 100) {
                return score;
              }
            }
          }
          
          // Fallback: compute score based on text analysis
          return computeFallbackScore(pattern, text);
        };

        // Fallback scoring based on text analysis
        const computeFallbackScore = (category: string, fullText: string): number => {
          const text = fullText.toLowerCase();
          let score = 50; // Base score
          
          // Look for positive indicators
          const positiveWords = ['strong', 'effective', 'clear', 'compelling', 'convincing', 'well-structured', 'logical', 'coherent'];
          const negativeWords = ['weak', 'unclear', 'confusing', 'illogical', 'lacks', 'missing', 'problematic'];
          
          positiveWords.forEach(word => {
            if (text.includes(word)) score += 8;
          });
          
          negativeWords.forEach(word => {
            if (text.includes(word)) score -= 8;
          });
          
          // Category-specific adjustments
          if (category.includes('PROOF') && text.includes('evidence')) score += 10;
          if (category.includes('CREDIBILITY') && text.includes('reliable')) score += 10;
          if (category.includes('WRITING') && text.includes('readable')) score += 10;
          
          return Math.max(0, Math.min(100, score));
        };

        return {
          proofEffectiveness: extractScore('PROOF EFFECTIVENESS'),
          claimCredibility: extractScore('CLAIM CREDIBILITY'),
          nonTriviality: extractScore('NON-TRIVIALITY'),
          proofQuality: extractScore('PROOF QUALITY'),
          functionalWriting: extractScore('FUNCTIONAL WRITING'),
          overallCaseScore: extractScore('OVERALL CASE SCORE'),
          detailedAssessment: fullResponse
        };
      };

      console.log('FULL AI RESPONSE FOR DEBUGGING:', fullResponse);
      const caseAssessmentData = parseScores(fullResponse);
      console.log('PARSED SCORES:', caseAssessmentData);
      setCaseAssessmentResult(caseAssessmentData);
      
      // CREATE CASE ASSESSMENT ONLY RESULT - NOT INTELLIGENCE ASSESSMENT  
      setAnalysisA({
        id: Date.now(),
        formattedReport: "", // Empty so it doesn't show in intelligence section
        overallScore: undefined, // No intelligence score
        provider: provider,
        analysis: "",
        summary: "",
        caseAssessment: caseAssessmentData,
        analysisType: "case_assessment", // Flag to identify this as case assessment
      });
      
      // NO POPUP - Results are now in main report only
      
    } catch (error) {
      console.error("Error performing case assessment:", error);
      alert("Failed to assess document case. Please try again.");
    } finally {
      setIsCaseAssessmentLoading(false);
      setIsStreaming(false);
    }
  };

  // Handler for document comparison
  const handleDocumentComparison = async () => {
    if (!documentA.content.trim() || !documentB.content.trim()) {
      alert("Please enter text in both documents to compare them.");
      return;
    }

    // Check if the selected provider is available (map ZHI names to original API names)
    const apiKeyMapping: Record<string, string> = {
      'zhi1': 'openai',
      'zhi2': 'anthropic', 
      'zhi3': 'deepseek',
      'zhi4': 'perplexity',
      'zhi5': 'grok'
    };
    const actualApiKey = apiKeyMapping[selectedProvider] || selectedProvider;
    if (selectedProvider !== "all" && !apiStatus[actualApiKey as keyof typeof apiStatus]) {
      alert(`The ${selectedProvider} API key is not configured or is invalid. Please select a different provider or ensure the API key is properly set.`);
      return;
    }

    setIsComparisonLoading(true);
    setComparisonResult(null);

    try {
      const provider = selectedProvider === "all" ? "zhi1" : selectedProvider;
      
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentA: documentA.content,
          documentB: documentB.content,
          provider: provider
        }),
      });

      if (!response.ok) {
        throw new Error(`Document comparison failed: ${response.statusText}`);
      }

      const data = await response.json();
      setComparisonResult(data);
      setComparisonModalOpen(true);
      
    } catch (error) {
      console.error("Error comparing documents:", error);
      alert(`Document comparison failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsComparisonLoading(false);
    }
  };

  // Handler for fiction assessment - REAL-TIME STREAMING
  const handleFictionAssessment = async (documentId: "A" | "B") => {
    const document = documentId === "A" ? documentA : documentB;
    if (!document.content.trim()) {
      alert(`Please enter some text in Document ${documentId}.`);
      return;
    }

    // Check if the selected provider is available (map ZHI names to original API names)
    const apiKeyMapping: Record<string, string> = {
      'zhi1': 'openai',
      'zhi2': 'anthropic', 
      'zhi3': 'deepseek',
      'zhi4': 'perplexity',
      'zhi5': 'grok'
    };
    const actualApiKey = apiKeyMapping[selectedProvider] || selectedProvider;
    if (selectedProvider !== "all" && !apiStatus[actualApiKey as keyof typeof apiStatus]) {
      alert(`The ${selectedProvider} API key is not configured or is invalid. Please select a different provider or ensure the API key is properly set.`);
      return;
    }

    // Reset any previous streaming state
    setIsStreaming(false);
    setStreamingContent('');
    
    // Start REAL-TIME streaming for fiction assessment
    setIsStreaming(true);
    setIsFictionAssessmentLoading(true);
    setFictionAssessmentResult(null);

    try {
      const provider = selectedProvider === "all" ? "zhi1" : selectedProvider;
      
      const response = await fetch('/api/fiction-assessment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: document.content,
          provider: provider
        }),
      });

      if (!response.ok) {
        throw new Error(`Fiction assessment failed: ${response.statusText}`);
      }

      // REAL-TIME STREAMING: Read response token by token
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        setStreamingContent(fullResponse); // Show each token as it arrives
      }

      // Parse the fiction assessment response to extract scores
      const parseFictionScores = (text: string) => {
        const extractScore = (pattern: string): number => {
          const regex = new RegExp(`${pattern}[:\\s]*(\\d+)(?:/100)?`, 'i');
          const match = text.match(regex);
          return match ? parseInt(match[1]) : 0;
        };

        return {
          worldCoherence: extractScore('WORLD COHERENCE'),
          emotionalPlausibility: extractScore('EMOTIONAL PLAUSIBILITY'),
          thematicDepth: extractScore('THEMATIC DEPTH'),
          narrativeStructure: extractScore('NARRATIVE STRUCTURE'),
          proseControl: extractScore('PROSE CONTROL'),
          overallFictionScore: extractScore('OVERALL FICTION SCORE'),
          detailedAssessment: fullResponse
        };
      };

      const fictionAssessmentData = parseFictionScores(fullResponse);
      setFictionAssessmentResult(fictionAssessmentData);
      setCurrentFictionDocument(documentId);
      
      // CREATE FICTION ASSESSMENT ONLY RESULT - NOT INTELLIGENCE ASSESSMENT  
      setAnalysisA({
        id: Date.now(),
        formattedReport: "", // Empty so it doesn't show in intelligence section
        overallScore: undefined, // No intelligence score
        provider: provider,
        analysis: "",
        summary: "",
        fictionAssessment: fictionAssessmentData,
        analysisType: "fiction_assessment", // Flag to identify this as fiction assessment
      });
      
      // NO POPUP - Results are now in main report only
      
    } catch (error) {
      console.error("Error performing fiction assessment:", error);
      alert(`Fiction assessment with ${selectedProvider} failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsFictionAssessmentLoading(false);
      setIsStreaming(false);
      setStreamingContent(''); // Clean up streaming content
    }
  };

  // Handler for fiction comparison
  const handleFictionComparison = () => {
    if (!documentA.content.trim() || !documentB.content.trim()) {
      alert("Please enter text in both documents to compare them.");
      return;
    }

    setFictionComparisonModalOpen(true);
  };

  // Handler for maximize intelligence
  const handleMaximizeIntelligence = async () => {
    if (!documentA.content.trim()) {
      alert("Please provide document content first.");
      return;
    }

    setIsMaximizeIntelligenceLoading(true);
    try {
      const instructionsToUse = customInstructions.trim() || defaultInstructions;
      
      const response = await fetch('/api/intelligent-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: documentA.content,
          customInstructions: instructionsToUse,
          provider: selectedProvider === "all" ? "zhi1" : selectedProvider,
          useExternalKnowledge: useExternalKnowledge
        }),
      });

      if (!response.ok) {
        throw new Error(`Rewrite failed: ${response.statusText}`);
      }

      const data = await response.json();
      setRewriteResult(data.result?.rewrittenText || data.rewrittenText || "No rewrite result returned");
      
      // Store the complete result data and show results modal
      setRewriteResultData(data.result);
      setRewriteResultsModalOpen(true);
      
    } catch (error) {
      console.error('Maximize intelligence error:', error);
      alert(error instanceof Error ? error.message : "Failed to maximize intelligence. Please try again.");
    } finally {
      setIsMaximizeIntelligenceLoading(false);
      setMaximizeIntelligenceModalOpen(false);
    }
  };


  // Handler for downloading rewrite results

  const handleDownloadRewrite = () => {
    if (!rewriteResultData) return;
    
    const content = `INTELLIGENT REWRITE RESULTS
${"=".repeat(50)}

ORIGINAL TEXT:
${rewriteResultData.originalText}

REWRITTEN TEXT:
${rewriteResultData.rewrittenText}

SCORE IMPROVEMENT:
Original Score: ${rewriteResultData.originalScore}/100
Rewritten Score: ${rewriteResultData.rewrittenScore}/100
Improvement: ${rewriteResultData.rewrittenScore - rewriteResultData.originalScore} points

REWRITE REPORT:
${rewriteResultData.rewriteReport || "No detailed report available"}

Provider: ${rewriteResultData.provider}
Instructions: ${rewriteResultData.instructions}

Generated on: ${new Date().toLocaleString()}`;
    
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `intelligent-rewrite-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUseRewrittenText = () => {
    if (rewriteResultData?.rewrittenText) {
      setDocumentA(prev => ({ ...prev, content: rewriteResultData.rewrittenText }));
      setRewriteResultsModalOpen(false);
    }
  };

  const handleKeepOriginalText = () => {
    setRewriteResultsModalOpen(false);
  };

  // Handler for sending rewritten text to intelligence analysis
  const handleSendToIntelligenceAnalysis = () => {
    if (rewriteResultData?.rewrittenText) {
      setDocumentA(prev => ({ ...prev, content: rewriteResultData.rewrittenText }));
      setRewriteResultsModalOpen(false);
      // Optional: Auto-trigger intelligence analysis
      // setTimeout(() => handleCognitiveQuick(), 100);
    }
  };

  // Handler for analyzing documents - FIXED MAIN ANALYSIS
  // Helper function to get content for analysis based on chunk selection
  const getContentForAnalysis = (document: DocumentInputType): string => {
    // If no chunks or no chunks selected, use full content
    if (!document.chunks || !document.selectedChunkIds || document.selectedChunkIds.length === 0) {
      return document.content;
    }
    
    // Combine selected chunks
    const selectedChunks = document.chunks.filter(chunk => 
      document.selectedChunkIds!.includes(chunk.id)
    );
    
    return selectedChunks.map(chunk => chunk.content).join('\n\n');
  };

  const handleAnalyze = async () => {
    const contentA = getContentForAnalysis(documentA);
    const contentB = getContentForAnalysis(documentB);
    
    if (!contentA.trim()) {
      const message = documentA.chunks && documentA.chunks.length > 1 
        ? "Please select at least one chunk to analyze from Document A."
        : "Please enter some text in Document A.";
      alert(message);
      return;
    }

    if (mode === "compare" && !contentB.trim()) {
      const message = documentB.chunks && documentB.chunks.length > 1 
        ? "Please select at least one chunk to analyze from Document B."
        : "Please enter some text in Document B for comparison.";
      alert(message);
      return;
    }
    
    // Check if the selected provider is available (map ZHI names to original API names)
    const apiKeyMapping: Record<string, string> = {
      'zhi1': 'openai',
      'zhi2': 'anthropic', 
      'zhi3': 'deepseek',
      'zhi4': 'perplexity',
      'zhi5': 'grok'
    };
    const actualApiKey = apiKeyMapping[selectedProvider] || selectedProvider;
    if (selectedProvider !== "all" && !apiStatus[actualApiKey as keyof typeof apiStatus]) {
      alert(`The ${selectedProvider} API key is not configured or is invalid. Please select a different provider or ensure the API key is properly set.`);
      return;
    }

    // FIXED: Use proper analysis for single document mode
    if (mode === "single") {
      setShowResults(true);
      setIsAnalysisLoading(true);
      
      try {
        const provider = selectedProvider === "all" ? "zhi1" : selectedProvider;
        if (analysisType === "quick") {
          // Quick analysis - regular API call
          const response = await fetch('/api/cognitive-quick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: contentA, provider: provider }),
          });

          if (!response.ok) {
            throw new Error(`Analysis failed: ${response.statusText}`);
          }

          const data = await response.json();
          setAnalysisA(data.analysis || data.result);
        } else {
          // Reset any previous streaming state
          setIsStreaming(false);
          setStreamingContent('');
          
          // Comprehensive analysis - streaming
          setIsStreaming(true);
          
          const response = await fetch('/api/stream-comprehensive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: contentA, provider: provider }),
          });

          if (!response.ok) {
            throw new Error(`Streaming failed: ${response.statusText}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              fullContent += chunk;
              setStreamingContent(fullContent);
            }
            
            // Extract actual score from streamed content
            const scoreMatch = fullContent.match(/FINAL SCORE:\s*(\d+)\/100/i) || 
                              fullContent.match(/Final Score:\s*(\d+)\/100/i) ||
                              fullContent.match(/Score:\s*(\d+)\/100/i);
            const actualScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;
            
            // Convert streaming content to analysis format
            setAnalysisA({
              id: Date.now(),
              formattedReport: fullContent,
              overallScore: actualScore, // Use actual AI-generated score
              provider: provider
            });
          }
          
          setIsStreaming(false);
          setStreamingContent(''); // Clean up streaming content
        }
        
      } catch (error) {
        console.error("Error analyzing document:", error);
        alert(`Analysis with ${selectedProvider} failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      } finally {
        setIsAnalysisLoading(false);
      }
      return;
    }
    
    // Regular analysis logic for comparison mode
    setShowResults(true);
    setIsAnalysisLoading(true);
    
    try {
      // Two-document mode: use existing comparison logic for now
      if (analysisType === "quick") {
        const provider = selectedProvider === "all" ? "zhi1" : selectedProvider;
        
        const response = await fetch('/api/quick-compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentA: contentA,
            documentB: contentB,
            provider: provider
          }),
        });

        if (!response.ok) {
          throw new Error(`Quick comparison failed: ${response.statusText}`);
        }

        const data = await response.json();
        setAnalysisA(data.analysisA);
        setAnalysisB(data.analysisB);
        setComparison(data.comparison);
      } else {
        // Use the comprehensive comparison (existing logic)
        console.log(`Comparing with ${selectedProvider}...`);
        // Create temporary documents with the selected content for comparison
        const tempDocA = { ...documentA, content: contentA };
        const tempDocB = { ...documentB, content: contentB };
        const results = await compareDocuments(tempDocA, tempDocB, selectedProvider);
        setAnalysisA(results.analysisA);
        setAnalysisB(results.analysisB);
        setComparison(results.comparison);
      }
    } catch (error) {
      console.error("Error comparing documents:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      alert(`Comparison with ${selectedProvider} failed: ${errorMessage}\n\nPlease verify that the ${selectedProvider} API key is correctly configured.`);
    } finally {
      setIsAnalysisLoading(false);
    }
  };
  

  
  // Handler for resetting the entire analysis
  const handleReset = () => {
    // Clear document inputs
    setDocumentA({ content: "" });
    setDocumentB({ content: "" });
    
    // Clear analysis results
    setAnalysisA(null);
    setAnalysisB(null);
    setComparison(null);
    
    // Clear streaming content
    setIsStreaming(false);
    setStreamingContent('');
    
    // Reset UI states
    setShowResults(false);
    setIsAnalysisLoading(false);
    setIsAICheckLoading(false);
    setAIDetectionResult(undefined);
    
    // Reset to single mode
    setMode("single");
    
    // Scroll to top
    window.scrollTo(0, 0);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* External Knowledge Toggle - HIDDEN BY USER REQUEST */}

      {/* INTELLIGENCE ANALYSIS TOOL - HIDDEN BY USER REQUEST */}
      <div className="hidden">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Intelligence Analysis Tool</h1>
            <p className="text-gray-600">Analyze, compare, and enhance writing samples with AI-powered intelligence evaluation</p>
          </div>
        </div>
      </header>

      {/* Analysis Mode Selector */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Analysis Settings</h2>
        <div className="flex flex-wrap gap-8 items-center">
          <ModeToggle mode={mode} setMode={setMode} />
          
          {/* Fiction Assessment Button */}
          <div className="border p-4 rounded-lg bg-white shadow-sm">
            <h3 className="text-lg font-medium text-gray-800 mb-3">Fiction Analysis</h3>
            <Button
              onClick={() => setFictionPopupOpen(true)}
              variant="outline"
              className="flex items-center gap-2 bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700"
              data-testid="button-fiction-assessment"
            >
              <BookOpen className="w-4 h-4" />
              Assess Fiction
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              Analyze literary fiction with specialized assessment criteria
            </p>
          </div>
          
          {/* Analysis Mode Toggle */}
          <div className="border p-4 rounded-lg bg-white shadow-sm">
            <h3 className="text-lg font-medium text-gray-800 mb-3">Analysis Mode</h3>
            <div className="flex gap-3">
              <Button
                onClick={() => setAnalysisType("quick")}
                variant={analysisType === "quick" ? "default" : "outline"}
                className="flex items-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Quick Analysis
              </Button>
              <Button
                onClick={() => setAnalysisType("comprehensive")}
                variant={analysisType === "comprehensive" ? "default" : "outline"}
                className="flex items-center gap-2"
              >
                <Clock className="h-4 w-4" />
                Comprehensive
                <Badge variant="secondary" className="ml-1 text-xs">
                  ~3 min
                </Badge>
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {analysisType === "quick" 
                ? "Fast assessment focusing on core intelligence indicators"
                : "In-depth 4-phase evaluation protocol (takes up to 3 minutes)"
              }
            </p>
          </div>
          
          <div className="border p-4 rounded-lg bg-white shadow-sm mt-2 md:mt-0">
            <h3 className="text-lg font-medium text-gray-800 mb-3">Choose Your AI Provider</h3>
            <ProviderSelector 
              selectedProvider={selectedProvider}
              onProviderChange={setSelectedProvider}
              label="AI Provider"
              apiStatus={apiStatus}
              showTooltips={false}
              className="mb-3"
            />
            
            {/* ZHI Model Guide */}
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
              <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Model Guide (cost per token)</h4>
              <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                <div className="flex justify-between"><span><b>ZHI 1</b> — General purpose, follows instructions best</span><span className="text-amber-600 font-medium">5x</span></div>
                <div className="flex justify-between"><span><b>ZHI 2</b> — Complex writing, long documents</span><span className="text-red-500 font-medium">7x</span></div>
                <div className="flex justify-between"><span><b>ZHI 3</b> — Math & logic</span><span className="text-green-600 font-medium">1x</span></div>
                <div className="flex justify-between"><span><b>ZHI 4</b> — Factual lookup with sources</span><span className="text-red-500 font-medium">7x</span></div>
                <div className="flex justify-between"><span><b>ZHI 5</b> — Casual, current events</span><span className="text-yellow-600 font-medium">3x</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Document Input Section */}
      <div className="mb-8">
        {/* Document A */}
        <DocumentInput
          id="A"
          document={documentA}
          setDocument={setDocumentA}
          onCheckAI={() => handleCheckAI("A")}
        />

        {/* Document B (shown only in compare mode) */}
        {mode === "compare" && (
          <DocumentInput
            id="B"
            document={documentB}
            setDocument={setDocumentB}
            onCheckAI={() => handleCheckAI("B")}
          />
        )}

        {/* Analysis Options */}
        {mode === "single" ? (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3 text-center">Choose Analysis Type</h3>
            <p className="text-sm text-gray-600 mb-4 text-center">Run any or all analyses on your document - no need to re-upload text</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Intelligence Analysis */}
              <div className="text-center">
                <Button
                  onClick={handleAnalyze}
                  className="w-full px-4 py-6 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 flex flex-col items-center min-h-[100px]"
                  disabled={isAnalysisLoading || !documentA.content.trim()}
                >
                  <Brain className="h-6 w-6 mb-2" />
                  <span className="text-sm">
                    {isAnalysisLoading ? "Analyzing..." : "Intelligence Analysis"}
                  </span>
                </Button>
                <p className="text-xs text-gray-500 mt-2">Assess cognitive abilities and intelligence</p>
              </div>

              {/* Case Assessment */}
              <div className="text-center">
                <Button
                  onClick={handleCaseAssessment}
                  className="w-full px-4 py-6 bg-purple-600 text-white rounded-md font-semibold hover:bg-purple-700 flex flex-col items-center min-h-[100px]"
                  disabled={isCaseAssessmentLoading || !documentA.content.trim()}
                >
                  <FileEdit className="h-6 w-6 mb-2" />
                  <span className="text-sm text-center leading-tight">
                    {isCaseAssessmentLoading ? "Assessing..." : "Case Assessment"}
                  </span>
                </Button>
                <p className="text-xs text-gray-500 mt-2">How well does it make its case?</p>
              </div>

              {/* Fiction Assessment */}
              <div className="text-center">
                <Button
                  onClick={() => handleFictionAssessment("A")}
                  className="w-full px-4 py-6 bg-orange-600 text-white rounded-md font-semibold hover:bg-orange-700 flex flex-col items-center min-h-[100px]"
                  disabled={!documentA.content.trim() || isFictionAssessmentLoading}
                >
                  {isFictionAssessmentLoading ? (
                    <Loader2 className="h-6 w-6 mb-2 animate-spin" />
                  ) : (
                    <FileEdit className="h-6 w-6 mb-2" />
                  )}
                  <span className="text-sm">
                    {isFictionAssessmentLoading ? "Assessing..." : "Fiction Analysis"}
                  </span>
                </Button>
                <p className="text-xs text-gray-500 mt-2">Evaluate creative writing quality</p>
              </div>

              {/* Maximize Intelligence */}
              <div className="text-center">
                <Button
                  onClick={() => setMaximizeIntelligenceModalOpen(true)}
                  className="w-full px-4 py-6 bg-emerald-600 text-white rounded-md font-semibold hover:bg-emerald-700 flex flex-col items-center min-h-[100px]"
                  disabled={!documentA.content.trim()}
                  data-testid="button-maximize-intelligence"
                >
                  <Sparkles className="h-6 w-6 mb-2" />
                  <span className="text-sm">Maximize Intelligence</span>
                </Button>
                <p className="text-xs text-gray-500 mt-2">Rewrite to boost intelligence score</p>
              </div>
            </div>
            
            {/* Clear All Button */}
            <div className="mt-6 text-center">
              <Button
                onClick={handleReset}
                variant="outline"
                className="px-6 py-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 flex items-center mx-auto"
                disabled={isAnalysisLoading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                <span>New Analysis / Clear All</span>
              </Button>
            </div>
          </div>
        ) : (
          /* Comparison Mode Buttons */
          <div className="flex justify-center gap-4 flex-wrap">
            <Button
              onClick={handleAnalyze}
              className="px-6 py-3 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 flex items-center"
              disabled={isAnalysisLoading}
            >
              <Brain className="h-5 w-5 mr-2" />
              <span>
                {isAnalysisLoading ? "Analyzing..." : "Analyze Both Documents"}
              </span>
            </Button>
            
            <Button
              onClick={handleDocumentComparison}
              className="px-6 py-3 bg-purple-600 text-white rounded-md font-semibold hover:bg-purple-700 flex items-center"
              disabled={!documentA.content.trim() || !documentB.content.trim() || isComparisonLoading}
            >
              <FileEdit className="h-5 w-5 mr-2" />
              <span>
                {isComparisonLoading ? "Comparing..." : "Which One Makes Its Case Better?"}
              </span>
            </Button>
            
            <Button
              onClick={handleFictionComparison}
              className="px-6 py-3 bg-amber-600 text-white rounded-md font-semibold hover:bg-amber-700 flex items-center"
              disabled={!documentA.content.trim() || !documentB.content.trim()}
            >
              <FileEdit className="h-5 w-5 mr-2" />
              <span>Compare Fiction</span>
            </Button>            
            <Button
              onClick={handleReset}
              className="px-6 py-3 bg-red-600 text-white rounded-md font-semibold hover:bg-red-700 flex items-center"
              disabled={isAnalysisLoading}
            >
              <Trash2 className="h-5 w-5 mr-2" />
              <span>New Analysis / Clear All</span>
            </Button>
          </div>
        )}
      </div>

      {/* AI Detection Modal */}
      <AIDetectionModal
        isOpen={aiDetectionModalOpen}
        onClose={() => setAIDetectionModalOpen(false)}
        result={aiDetectionResult}
        isLoading={isAICheckLoading}
      />

      {/* Results Section */}
      {showResults && (
        <div id="resultsSection">
          {/* Loading Indicator */}
          {isAnalysisLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mb-4"></div>
              <p className="text-gray-600">Analyzing document content...</p>
            </div>
          ) : (
            <div>
              {/* Document A Results */}
              {analysisA && <DocumentResults id="A" analysis={analysisA} originalDocument={documentA} analysisMode={analysisType} onSendToHumanizer={handleSendToHumanizer} onSendToIntelligence={handleSendToIntelligence} onSendToChat={handleSendToChat} />}

              {/* Document B Results (only in compare mode) */}
              {mode === "compare" && analysisB && (
                <DocumentResults id="B" analysis={analysisB} originalDocument={documentB} analysisMode={analysisType} onSendToHumanizer={handleSendToHumanizer} onSendToIntelligence={handleSendToIntelligence} onSendToChat={handleSendToChat} />
              )}

              {/* Comparative Results (only in compare mode) */}
              {mode === "compare" && comparison && analysisA && analysisB && (
                <ComparativeResults
                  analysisA={analysisA}
                  analysisB={analysisB}
                  comparison={comparison}
                  onSendToHumanizer={handleSendToHumanizer}
                  onSendToIntelligence={handleSendToIntelligence}
                  onSendToChat={handleSendToChat}
                  documentAText={documentA?.content}
                  documentBText={documentB?.content}
                />
              )}
              

              
              {/* Semantic Density Analysis - always shown when there's text */}
              {mode === "single" && documentA.content.trim() && (
                <div className="bg-white rounded-lg shadow-md p-6 mb-8 mt-8">
                  <SemanticDensityAnalyzer text={documentA.content} />
                </div>
              )}
            </div>
          )}
        </div>
      )}



      {/* Case Assessment Modal - REMOVED: Results now show in main report only */}

      {/* Document Comparison Modal */}
      <DocumentComparisonModal
        isOpen={comparisonModalOpen}
        onClose={() => setComparisonModalOpen(false)}
        result={comparisonResult}
        isLoading={isComparisonLoading}
      />

      {/* AI Detection Modal */}
      <AIDetectionModal
        isOpen={aiDetectionModalOpen}
        onClose={() => setAIDetectionModalOpen(false)}
        result={aiDetectionResult}
        isLoading={isAICheckLoading}
      />

      {/* Fiction Assessment Modal - REMOVED: Results now show in main report only */}

      {/* Fiction Comparison Modal */}
      <FictionComparisonModal
        isOpen={fictionComparisonModalOpen}
        onClose={() => setFictionComparisonModalOpen(false)}
        documentA={{
          content: documentA.content,
          title: documentA.filename || "Document A"
        }}
        documentB={{
          content: documentB.content,
          title: documentB.filename || "Document B"
        }}
      />



      {/* Inline Streaming Results Area */}
      {(isStreaming || streamingContent) && (
        <div className="mx-4 mb-6">
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-blue-900">
                🎯 Intelligence Analysis
                {isStreaming && <span className="ml-2 text-sm font-normal text-blue-600">Streaming...</span>}
              </h3>
            </div>
            <div className="bg-white rounded-md p-4 border border-blue-100 min-h-[200px]">
              <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {streamingContent}
                {isStreaming && <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1">|</span>}
              </div>
            </div>
            {streamingContent && !isStreaming && (
              <div className="mt-4 flex justify-end">
                <Button 
                  onClick={() => setStreamingContent('')}
                  variant="outline"
                  size="sm"
                  className="text-gray-600 hover:text-gray-800"
                >
                  New Analysis
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Maximize Intelligence Modal */}
      <Dialog open={maximizeIntelligenceModalOpen} onOpenChange={setMaximizeIntelligenceModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              Maximize Intelligence
            </DialogTitle>
            <DialogDescription>
              Customize rewrite instructions to maximize intelligence scores, or use our default optimization criteria.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* External Knowledge Toggle - HIDDEN BY USER REQUEST */}

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Custom Instructions (optional)
              </label>
              <Textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Enter custom rewrite instructions here. If left empty, default optimization criteria will be used."
                className="min-h-[120px]"
                data-testid="textarea-custom-instructions"
              />
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Default Instructions (used if custom field is empty):</h4>
              <div className="text-xs text-gray-600 max-h-40 overflow-y-auto whitespace-pre-wrap">
                {defaultInstructions}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMaximizeIntelligenceModalOpen(false)}
              data-testid="button-cancel-maximize"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMaximizeIntelligence}
              disabled={isMaximizeIntelligenceLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-confirm-maximize"
            >
              {isMaximizeIntelligenceLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rewriting...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Maximize Intelligence
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Intelligent Rewrite Results Modal */}
      <Dialog open={rewriteResultsModalOpen} onOpenChange={setRewriteResultsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-emerald-600" />
              Intelligent Rewrite Results
            </DialogTitle>
            <DialogDescription>
              Your text has been optimized for maximum intelligence scoring. Review the results below.
            </DialogDescription>
          </DialogHeader>
          
          {rewriteResultData && (
            <div className="space-y-6">
              {/* Score Improvement */}
              <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-emerald-800 dark:text-emerald-200 mb-2">Score Improvement</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">{rewriteResultData.originalScore}/100</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Original</div>
                  </div>
                  <div className="text-center">
                    <div className="text-emerald-600 dark:text-emerald-400">
                      {rewriteResultData.rewrittenScore > rewriteResultData.originalScore ? "+" : ""}
                      {rewriteResultData.rewrittenScore - rewriteResultData.originalScore}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Change</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{rewriteResultData.rewrittenScore}/100</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Rewritten</div>
                  </div>
                </div>
              </div>

              {/* Rewritten Text */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Rewritten Text</h3>
                  <SendToButton
                    text={rewriteResultData.rewrittenText}
                    onSendToValidator={(text) => setValidatorInputText(text)}
                    size="sm"
                  />
                </div>
                <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800 max-h-60 overflow-y-auto">
                  <p className="whitespace-pre-wrap">{rewriteResultData.rewrittenText}</p>
                </div>
                
                {/* Refine Coherence Output Section */}
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                  <h4 className="text-xs font-semibold text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-1">
                    <FileEdit className="w-3 h-3" />
                    Re-Rewrite (Adjust Word Count / Modify)
                  </h4>
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="flex-1 min-w-[100px] max-w-[140px]">
                      <label className="block text-xs text-blue-700 dark:text-blue-300 mb-1">
                        Target Words
                      </label>
                      <input
                        type="number"
                        value={refineCoherenceWordCount}
                        onChange={(e) => setRefineCoherenceWordCount(e.target.value)}
                        placeholder="e.g., 500"
                        className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                        data-testid="input-refine-coherence-word-count"
                      />
                    </div>
                    <div className="flex-[2] min-w-[150px]">
                      <label className="block text-xs text-blue-700 dark:text-blue-300 mb-1">
                        Custom Instructions
                      </label>
                      <input
                        type="text"
                        value={refineCoherenceInstructions}
                        onChange={(e) => setRefineCoherenceInstructions(e.target.value)}
                        placeholder="e.g., Simpler language, more examples"
                        className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                        data-testid="input-refine-coherence-instructions"
                      />
                    </div>
                    <Button
                      onClick={handleRefineCoherence}
                      disabled={refineCoherenceLoading || (!refineCoherenceWordCount && !refineCoherenceInstructions)}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                      data-testid="button-refine-coherence"
                    >
                      {refineCoherenceLoading ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Re-Rewriting...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Re-Rewrite
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Current: ~{rewriteResultData.rewrittenText?.trim().split(/\s+/).length || 0} words
                  </p>
                </div>
              </div>

              {/* Original Text for comparison */}
              <div>
                <h3 className="font-semibold mb-2">Original Text</h3>
                <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800 max-h-40 overflow-y-auto">
                  <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{rewriteResultData.originalText}</p>
                </div>
              </div>

              {/* Rewrite Report if available */}
              {rewriteResultData.rewriteReport && (
                <div>
                  <h3 className="font-semibold mb-2">Rewrite Analysis Report</h3>
                  <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800 max-h-40 overflow-y-auto">
                    <p className="whitespace-pre-wrap text-sm">{rewriteResultData.rewriteReport}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter className="flex flex-col sm:flex-row gap-3">
            <Button 
              variant="outline" 
              onClick={handleDownloadRewrite}
              className="flex items-center gap-2"
              data-testid="button-download-rewrite"
            >
              <Download className="w-4 h-4" />
              Download Results
            </Button>
            <Button 
              variant="outline" 
              onClick={handleKeepOriginalText}
              data-testid="button-keep-original"
            >
              Keep Original
            </Button>
            <Button 
              onClick={handleSendToIntelligenceAnalysis}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-send-to-intelligence"
            >
              <Brain className="w-4 h-4 mr-2" />
              Send to Intelligence Analysis
            </Button>
            <Button 
              onClick={() => {
                if (rewriteResultData?.rewrittenText) {
                  setBoxA(rewriteResultData.rewrittenText);
                  setRewriteResultsModalOpen(false);
                  toast({
                    title: "Text sent to Humanizer",
                    description: "Rewritten text has been sent to the Humanizer input box"
                  });
                }
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              data-testid="button-send-to-humanizer"
            >
              <Shield className="w-4 h-4 mr-2" />
              Send to Humanizer
            </Button>
            <Button 
              onClick={handleUseRewrittenText}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-use-rewritten"
            >
              Use Rewritten Text
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
      {/* END OF HIDDEN INTELLIGENCE ANALYSIS TOOL */}


      {/* NEUROTEXT - Main Reconstruction Tool */}
      <div id="neurotext" className="mt-16 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 p-8 rounded-lg border-2 border-emerald-200 dark:border-emerald-700">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 mb-3 flex items-center justify-center gap-3">
              <BookOpen className="w-8 h-8 text-emerald-600" />
              NEUROTEXT
            </h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">
              Intelligent text reconstruction - follows your instructions without limits
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Enter text to reconstruct, or just provide instructions to generate new content
            </p>
          </div>

          {/* Document Library - Multi-Document Upload Section */}
          <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 p-5 rounded-lg border-2 border-blue-200 dark:border-blue-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Document Library
                <Badge variant="secondary" className="ml-2">{uploadedDocuments.length}/5</Badge>
              </h3>
              {uploadedDocuments.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDocumentLibrary}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  data-testid="button-clear-library"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
            
            {/* Upload Drop Zone */}
            <div
              className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                libraryDragOver 
                  ? "border-blue-500 bg-blue-100 dark:bg-blue-800/30" 
                  : "border-blue-300 dark:border-blue-600 hover:border-blue-400"
              } ${uploadedDocuments.length >= 5 ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (uploadedDocuments.length < 5) setLibraryDragOver(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                if (uploadedDocuments.length < 5) setLibraryDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setLibraryDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setLibraryDragOver(false);
                if (uploadedDocuments.length >= 5) return;
                const files = Array.from(e.dataTransfer.files || []).filter(f => 
                  f.type === 'application/pdf' || 
                  f.type === 'application/msword' || 
                  f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                  f.type === 'text/plain' ||
                  f.name.endsWith('.txt') || f.name.endsWith('.pdf') || f.name.endsWith('.doc') || f.name.endsWith('.docx')
                );
                if (files.length > 0) handleMultipleFileUpload(files);
              }}
              data-testid="dropzone-library"
            >
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                multiple
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={uploadedDocuments.length >= 5}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) handleMultipleFileUpload(Array.from(files));
                  e.target.value = '';
                }}
                data-testid="input-library-upload"
              />
              <Upload className="w-8 h-8 mx-auto mb-2 text-blue-500" />
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                {uploadedDocuments.length >= 5 
                  ? "Library full - remove documents to add more" 
                  : "Drag & drop documents here or click to browse"}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                PDF, Word (.doc, .docx), TXT - Up to 5 documents
              </p>
            </div>
            
            {/* Uploaded Documents List with Checkboxes */}
            {uploadedDocuments.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Select documents to use:
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {selectedDocumentIds.size} selected ({uploadedDocuments.filter(d => selectedDocumentIds.has(d.id)).reduce((s, d) => s + d.wordCount, 0).toLocaleString()} words)
                  </Badge>
                </div>
                {uploadedDocuments.map((doc, index) => (
                  <div 
                    key={doc.id}
                    className={`flex items-center gap-3 p-3 rounded-md border transition-all cursor-pointer ${
                      selectedDocumentIds.has(doc.id)
                        ? "bg-blue-100 dark:bg-blue-800/40 border-blue-400 dark:border-blue-500"
                        : "bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-700 hover:border-blue-300"
                    }`}
                    onClick={() => toggleDocumentSelection(doc.id)}
                    data-testid={`doc-item-${doc.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocumentIds.has(doc.id)}
                      onChange={() => toggleDocumentSelection(doc.id)}
                      className="w-4 h-4 accent-blue-600"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`checkbox-doc-${doc.id}`}
                    />
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-200 dark:bg-blue-700 px-2 py-0.5 rounded">
                      {index + 1}
                    </span>
                    <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate" title={doc.filename}>
                      {doc.filename}
                    </span>
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {doc.wordCount.toLocaleString()} words
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveDocument(doc.id);
                      }}
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                      data-testid={`button-remove-doc-${doc.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                
                {/* Instructions for selected documents */}
                {selectedDocumentIds.size > 0 && (
                  <div className="mt-4 space-y-3">
                    <label className="block text-sm font-medium text-blue-800 dark:text-blue-200">
                      Instructions for selected documents:
                    </label>
                    <Textarea
                      value={libraryInstructions}
                      onChange={(e) => setLibraryInstructions(e.target.value)}
                      placeholder="e.g., COMBINE THESE INTO A SINGLE COHESIVE WORK ON SYSTEMS SCIENCE&#10;or: EXTRACT THE KEY ARGUMENTS FROM EACH AND SYNTHESIZE&#10;or: COMPARE AND CONTRAST THE MAIN THEMES"
                      className="min-h-[80px] text-sm"
                      data-testid="textarea-library-instructions"
                    />
                    <Button
                      onClick={() => {
                        const selectedDocs = uploadedDocuments.filter(d => selectedDocumentIds.has(d.id));
                        const combinedContent = combineDocuments(selectedDocs);
                        setValidatorInputText(combinedContent);
                        if (libraryInstructions.trim()) {
                          setValidatorCustomInstructions(libraryInstructions);
                        }
                        toast({
                          title: "Documents Loaded",
                          description: `${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''} loaded. ${libraryInstructions ? 'Instructions applied.' : 'Add instructions below or run operations.'}`,
                        });
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      data-testid="button-load-selected"
                    >
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Load {selectedDocumentIds.size} Selected Document{selectedDocumentIds.size > 1 ? 's' : ''} into Input
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input Area with Drag & Drop */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                Input Text (up to 100,000 words)
              </label>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Word Count: {validatorInputText.trim() ? validatorInputText.trim().split(/\s+/).length.toLocaleString() : 0} / 100,000
                </span>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, setValidatorInputText);
                    }}
                    data-testid="input-validator-upload"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                    onClick={(e) => {
                      e.preventDefault();
                      (e.currentTarget.previousElementSibling as HTMLInputElement)?.click();
                    }}
                    data-testid="button-validator-upload"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Document
                  </Button>
                </label>
              </div>
            </div>
            <div
              className={`relative transition-all duration-200 ${
                validatorDragOver 
                  ? "ring-2 ring-emerald-500 ring-offset-2 rounded-md" 
                  : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setValidatorDragOver(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setValidatorDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setValidatorDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setValidatorDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file && (file.type === 'application/pdf' || 
                    file.type === 'application/msword' || 
                    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                    file.type === 'text/plain' ||
                    file.name.endsWith('.txt') ||
                    file.name.endsWith('.pdf') ||
                    file.name.endsWith('.doc') ||
                    file.name.endsWith('.docx'))) {
                  handleFileUpload(file, setValidatorInputText);
                } else if (file) {
                  toast({
                    title: "Unsupported File Type",
                    description: "Please upload a PDF, Word document (.doc, .docx), or text file (.txt)",
                    variant: "destructive",
                  });
                }
              }}
              data-testid="dropzone-validator"
            >
              {validatorDragOver && (
                <div className="absolute inset-0 bg-emerald-100/80 dark:bg-emerald-900/80 rounded-md flex items-center justify-center z-10 pointer-events-none">
                  <div className="flex flex-col items-center gap-2 text-emerald-700 dark:text-emerald-300">
                    <Upload className="w-10 h-10" />
                    <span className="font-semibold">Drop document here</span>
                    <span className="text-sm">PDF, Word, or TXT file</span>
                  </div>
                </div>
              )}
              <Textarea
                value={validatorInputText}
                onChange={(e) => setValidatorInputText(e.target.value)}
                placeholder="Paste complex, obscure, or muddled text here... or drag & drop a document (PDF, Word, TXT)"
                className="min-h-[200px] font-mono text-sm"
                data-testid="textarea-validator-input"
              />
            </div>
            <TextStats text={validatorInputText} showAiDetect={true} />
          </div>

          {/* FULL SUITE - Run All Functions in Sequence */}
          <div className="mb-6 bg-gradient-to-r from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 p-6 rounded-lg border-2 border-violet-300 dark:border-violet-700">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowFullSuitePanel(!showFullSuitePanel)}
            >
              <h3 className="text-xl font-bold text-violet-900 dark:text-violet-100 flex items-center gap-2">
                <Zap className="w-6 h-6 text-violet-600" />
                Run Full Suite
                <Badge variant="outline" className="ml-2 bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200">
                  Complete Pipeline
                </Badge>
              </h3>
              <Button variant="ghost" size="icon" data-testid="button-toggle-full-suite">
                {showFullSuitePanel ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </Button>
            </div>
            <p className="text-sm text-violet-700 dark:text-violet-300 mt-2">
              Run the complete pipeline: Reconstruction, 25 Objections with responses, and an Objection-Proof final version - all in one click.
            </p>

            {showFullSuitePanel && (
              <div className="mt-4 space-y-4">
                {/* Progress Tracker */}
                {fullSuiteLoading && (
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-violet-200 dark:border-violet-700">
                    <div className="flex items-center gap-4 justify-center flex-wrap">
                      {/* Stage 1: Reconstruction */}
                      <div className={`flex items-center gap-2 ${
                        ["batch"].includes(fullSuiteStage) ? "text-violet-600 font-semibold" : 
                        ["objections", "objection-proof", "complete"].includes(fullSuiteStage) ? "text-green-600" : "text-gray-400"
                      }`}>
                        {["batch"].includes(fullSuiteStage) ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : ["objections", "objection-proof", "complete"].includes(fullSuiteStage) ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                        <span>1. Reconstruction</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      {/* Stage 2: Objections */}
                      <div className={`flex items-center gap-2 ${
                        ["objections"].includes(fullSuiteStage) ? "text-violet-600 font-semibold" : 
                        ["objection-proof", "complete"].includes(fullSuiteStage) ? "text-green-600" : "text-gray-400"
                      }`}>
                        {["objections"].includes(fullSuiteStage) ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : ["objection-proof", "complete"].includes(fullSuiteStage) ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                        <span>2. Objections</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      {/* Stage 3: Objection-Proof */}
                      <div className={`flex items-center gap-2 ${
                        ["objection-proof"].includes(fullSuiteStage) ? "text-violet-600 font-semibold" : 
                        ["complete"].includes(fullSuiteStage) ? "text-green-600" : "text-gray-400"
                      }`}>
                        {["objection-proof"].includes(fullSuiteStage) ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : ["complete"].includes(fullSuiteStage) ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                        <span>3. Final Version</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {fullSuiteStage === "error" && fullSuiteError && (
                  <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-700">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">Pipeline Error:</span>
                      <span>{fullSuiteError}</span>
                    </div>
                  </div>
                )}

                {/* Run Button */}
                <Button
                  onClick={handleRunFullSuite}
                  disabled={fullSuiteLoading || (!validatorInputText.trim() && !validatorCustomInstructions.trim())}
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white py-6 text-lg font-semibold"
                  data-testid="button-run-full-suite"
                >
                  {fullSuiteLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Running Full Suite... ({fullSuiteStage === "batch" ? "Reconstruction" : fullSuiteStage === "objections" ? "Generating Objections" : fullSuiteStage === "objection-proof" ? "Creating Final Version" : fullSuiteStage})
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5 mr-2" />
                      Run Full Suite (Complete Pipeline)
                    </>
                  )}
                </Button>

                {/* OPEN PROGRESS POPUP - Always visible button to re-open streaming modal */}
                <Button
                  onClick={() => setStreamingModalOpen(true)}
                  variant="outline"
                  className="w-full border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 py-4 text-base font-medium"
                  data-testid="button-open-progress-popup"
                >
                  <Eye className="w-5 h-5 mr-2" />
                  Open Progress Popup
                </Button>
                
                {/* View Results Button - Reopens popup when there's content */}
                {(fullSuiteReconstructionOutput || objectionsOutput || fullSuiteObjectionProofOutput) && !fullSuitePopupOpen && (
                  <Button
                    onClick={() => setFullSuitePopupOpen(true)}
                    variant="outline"
                    className="w-full border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/30"
                    data-testid="button-view-full-suite-results"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Full Suite Results
                  </Button>
                )}

                {fullSuiteStage === "complete" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Full Suite completed!</span>
                    </div>
                    
                    {/* Results Display - Expandable Sections */}
                    <div className="space-y-3">
                      {/* Section 1: Reconstruction */}
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between p-3 border-b border-emerald-200 dark:border-emerald-700">
                          <div className="flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-emerald-600" />
                            <span className="font-medium text-emerald-800 dark:text-emerald-200">1. Reconstruction</span>
                            <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-400">
                              {(validatorBatchResults.filter(r => r.success)[0]?.output || '').trim().split(/\s+/).filter(w => w).length.toLocaleString()} words
                            </Badge>
                          </div>
                          <Button
                            onClick={() => {
                              navigator.clipboard.writeText(validatorBatchResults.filter(r => r.success)[0]?.output || "");
                              toast({ title: "Copied!", description: "Reconstruction copied to clipboard." });
                            }}
                            size="sm"
                            variant="outline"
                            className="bg-emerald-100 dark:bg-emerald-800 border-emerald-300 dark:border-emerald-600"
                            data-testid="button-copy-reconstruction"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                        {validatorBatchResults.filter(r => r.success)[0]?.output && (
                          <div className="px-3 pt-3">
                            <TextStats 
                              text={validatorBatchResults.filter(r => r.success)[0]?.output || ''} 
                              showAiDetect={true} 
                              variant="prominent"
                              targetWords={parseInt(refineReconstructionWordCount) || undefined}
                            />
                          </div>
                        )}
                        <div className="p-3 max-h-64 overflow-auto">
                          <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                            {validatorBatchResults.filter(r => r.success)[0]?.output || "(No reconstruction output)"}
                          </pre>
                        </div>
                        
                        {/* Refine Reconstruction Section */}
                        {validatorBatchResults.filter(r => r.success)[0]?.output && (
                          <div className="m-3 p-3 bg-emerald-100 dark:bg-emerald-800/30 rounded-lg border border-emerald-300 dark:border-emerald-600">
                            <h4 className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 mb-2 flex items-center gap-1">
                              <FileEdit className="w-3 h-3" />
                              Re-Rewrite (Adjust Word Count / Modify)
                            </h4>
                            <div className="flex flex-wrap gap-2 items-end">
                              <div className="flex-1 min-w-[100px] max-w-[140px]">
                                <label className="block text-xs text-emerald-700 dark:text-emerald-300 mb-1">
                                  Target Words
                                </label>
                                <input
                                  type="number"
                                  value={refineReconstructionWordCount}
                                  onChange={(e) => setRefineReconstructionWordCount(e.target.value)}
                                  placeholder="e.g., 800"
                                  className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                                  data-testid="input-refine-reconstruction-word-count"
                                />
                              </div>
                              <div className="flex-[2] min-w-[150px]">
                                <label className="block text-xs text-emerald-700 dark:text-emerald-300 mb-1">
                                  Custom Instructions
                                </label>
                                <input
                                  type="text"
                                  value={refineReconstructionInstructions}
                                  onChange={(e) => setRefineReconstructionInstructions(e.target.value)}
                                  placeholder="e.g., More examples, shorter sentences"
                                  className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                                  data-testid="input-refine-reconstruction-instructions"
                                />
                              </div>
                              <Button
                                onClick={handleRefineReconstructionBatch}
                                disabled={refineReconstructionLoading || (!refineReconstructionWordCount && !refineReconstructionInstructions)}
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                                data-testid="button-refine-reconstruction"
                              >
                                {refineReconstructionLoading ? (
                                  <>
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    Re-Rewriting...
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-3 h-3 mr-1" />
                                    Re-Rewrite
                                  </>
                                )}
                              </Button>
                            </div>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                              Current: ~{(validatorBatchResults.filter(r => r.success)[0]?.output || "").trim().split(/\s+/).length} words
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Section 2: Objections */}
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between p-3 border-b border-amber-200 dark:border-amber-700">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600" />
                            <span className="font-medium text-amber-800 dark:text-amber-200">2. Objections & Counter-Arguments (25)</span>
                          </div>
                          <Button
                            onClick={() => {
                              navigator.clipboard.writeText(objectionsOutput || "");
                              toast({ title: "Copied!", description: "All 25 objections copied to clipboard." });
                            }}
                            size="sm"
                            variant="outline"
                            className="bg-amber-100 dark:bg-amber-800 border-amber-300 dark:border-amber-600"
                            data-testid="button-copy-objections"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy All Objections
                          </Button>
                        </div>
                        <div className="p-3 max-h-64 overflow-auto">
                          <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                            {objectionsOutput || "(No objections output)"}
                          </pre>
                        </div>
                        {objectionsOutput && (
                          <div className="px-3 pb-2">
                            <TextStats text={objectionsOutput} showAiDetect={true} variant="compact" />
                          </div>
                        )}
                      </div>

                      {/* Section 3: Objection-Proof Final Version */}
                      <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between p-3 border-b border-rose-200 dark:border-rose-700">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-rose-600" />
                            <span className="font-medium text-rose-800 dark:text-rose-200">3. Objection-Proof Final Version</span>
                            <Badge variant="outline" className="bg-rose-100 dark:bg-rose-800 text-rose-700 dark:text-rose-300 text-xs">
                              Recommended
                            </Badge>
                          </div>
                          <Button
                            onClick={() => {
                              navigator.clipboard.writeText(fullSuiteObjectionProofOutput || "");
                              toast({ title: "Copied!", description: "Objection-proof version copied to clipboard." });
                            }}
                            size="sm"
                            variant="outline"
                            className="bg-rose-100 dark:bg-rose-800 border-rose-300 dark:border-rose-600"
                            data-testid="button-copy-objection-proof"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy Final Version
                          </Button>
                        </div>
                        {fullSuiteObjectionProofOutput && (
                          <div className="px-3 pt-3">
                            <TextStats 
                              text={fullSuiteObjectionProofOutput} 
                              showAiDetect={true} 
                              variant="prominent"
                              targetWords={parseInt(refineReconstructionWordCount) || undefined}
                            />
                          </div>
                        )}
                        <div className="p-3 max-h-96 overflow-auto">
                          <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                            {fullSuiteObjectionProofOutput || "(No objection-proof output)"}
                          </pre>
                        </div>
                        {fullSuiteObjectionProofOutput && (
                          <div className="px-3 pb-2 hidden">
                            <TextStats text={fullSuiteObjectionProofOutput} showAiDetect={true} variant="compact" />
                          </div>
                        )}
                        
                        {/* Refine Final Version Section */}
                        {fullSuiteObjectionProofOutput && (
                          <div className="m-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                            <h4 className="text-xs font-semibold text-purple-800 dark:text-purple-200 mb-2 flex items-center gap-1">
                              <FileEdit className="w-3 h-3" />
                              Refine Final Version (Adjust Word Count / Modify)
                            </h4>
                            <div className="flex flex-wrap gap-2 items-end">
                              <div className="flex-1 min-w-[100px] max-w-[140px]">
                                <label className="block text-xs text-purple-700 dark:text-purple-300 mb-1">
                                  Target Words
                                </label>
                                <input
                                  type="number"
                                  value={refineFinalWordCount}
                                  onChange={(e) => setRefineFinalWordCount(e.target.value)}
                                  placeholder="e.g., 400"
                                  className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                                  data-testid="input-refine-final-word-count"
                                />
                              </div>
                              <div className="flex-[2] min-w-[150px]">
                                <label className="block text-xs text-purple-700 dark:text-purple-300 mb-1">
                                  Custom Instructions
                                </label>
                                <input
                                  type="text"
                                  value={refineFinalInstructions}
                                  onChange={(e) => setRefineFinalInstructions(e.target.value)}
                                  placeholder="e.g., Add a Plato quote"
                                  className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                                  data-testid="input-refine-final-instructions"
                                />
                              </div>
                              <Button
                                onClick={handleRefineFinalVersion}
                                disabled={refineFinalLoading || (!refineFinalWordCount && !refineFinalInstructions)}
                                size="sm"
                                className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
                                data-testid="button-refine-final"
                              >
                                {refineFinalLoading ? (
                                  <>
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    Refining...
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-3 h-3 mr-1" />
                                    Refine
                                  </>
                                )}
                              </Button>
                            </div>
                            <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                              Current: ~{fullSuiteObjectionProofOutput.trim().split(/\s+/).length} words
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Copy All Button */}
                    <Button
                      onClick={() => {
                        const allOutput = [
                          "═══════════════════════════════════════════════════════════════",
                          "                    FULL SUITE ANALYSIS RESULTS",
                          "═══════════════════════════════════════════════════════════════",
                          "",
                          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                          "                         1. RECONSTRUCTION",
                          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                          "",
                          validatorBatchResults.filter(r => r.success)[0]?.output || "(No reconstruction output)",
                          "",
                          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                          "                    2. OBJECTIONS & COUNTER-ARGUMENTS",
                          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                          "",
                          objectionsOutput || "(No Objections output)",
                          "",
                          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                          "                    3. OBJECTION-PROOF FINAL VERSION",
                          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                          "",
                          fullSuiteObjectionProofOutput || "(No objection-proof output)",
                          "",
                          "═══════════════════════════════════════════════════════════════",
                          "                         END OF REPORT",
                          "═══════════════════════════════════════════════════════════════"
                        ].join("\n");
                        navigator.clipboard.writeText(allOutput);
                        toast({
                          title: "All Results Copied!",
                          description: "Complete Full Suite output copied to clipboard.",
                        });
                      }}
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white"
                      data-testid="button-copy-all-fullsuite"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Complete Report (All 3 Sections)
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Reconstruction Button */}
          <div className="mb-6">
            <Button
              onClick={() => {
                handleValidatorProcess("reconstruction");
              }}
              className={`flex flex-col items-center justify-center p-6 h-auto w-full ${
                validatorMode === "reconstruction" 
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                  : "bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-300"
              }`}
              disabled={validatorLoading || validatorBatchLoading}
              data-testid="button-reconstruction"
            >
              {validatorLoading ? (
                <>
                  <Loader2 className="w-6 h-6 mb-2 animate-spin" />
                  <span className="font-bold text-lg">PROCESSING...</span>
                  <span className="text-xs mt-1 text-center opacity-80">
                    {validatorProgress || "Reconstructing text..."}
                  </span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-6 h-6 mb-2" />
                  <span className="font-bold text-lg">RECONSTRUCTION</span>
                  <span className="text-xs mt-1 text-center opacity-80">Clean up logic</span>
                </>
              )}
            </Button>
            
            {/* Progress indicator for long documents */}
            {validatorLoading && validatorProgress && (
              <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-700">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  <span className="text-sm text-emerald-700 dark:text-emerald-300">{validatorProgress}</span>
                </div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  Long documents use outline-first mode for better coherence. This may take 1-3 minutes.
                </p>
              </div>
            )}
            
            {/* Aggressive Toggle - Always Visible */}
            <div className="flex items-center justify-center gap-4 mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
              <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Mode:</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={validatorFidelityLevel === "conservative" ? "default" : "outline"}
                  onClick={() => setValidatorFidelityLevel("conservative")}
                  className={validatorFidelityLevel === "conservative" 
                    ? "bg-amber-600 hover:bg-amber-700 text-white" 
                    : "border-amber-300 text-amber-700 dark:text-amber-300"}
                  data-testid="button-fidelity-conservative"
                >
                  Conservative
                </Button>
                <Button
                  size="sm"
                  variant={validatorFidelityLevel === "aggressive" ? "default" : "outline"}
                  onClick={() => setValidatorFidelityLevel("aggressive")}
                  className={validatorFidelityLevel === "aggressive" 
                    ? "bg-red-600 hover:bg-red-700 text-white" 
                    : "border-amber-300 text-amber-700 dark:text-amber-300"}
                  data-testid="button-fidelity-aggressive"
                >
                  Aggressive
                </Button>
              </div>
            </div>
          </div>

          {/* Clear All Button */}
          <div className="mt-4 text-center">
            <Button
              onClick={handleValidatorClear}
              variant="outline"
              className="px-6 py-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 dark:hover:bg-red-900/20 flex items-center mx-auto"
              disabled={validatorLoading}
              data-testid="button-validator-clear-all"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              <span>New Analysis / Clear All</span>
            </Button>
          </div>

          {/* Target Word Count Input - DEDICATED FIELD */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border-2 border-violet-300 dark:border-violet-700 mt-6">
            <label className="block text-sm font-semibold text-violet-700 dark:text-violet-300 mb-2">
              Target Word Count (Required for expansion)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={validatorTargetWordCount}
                onChange={(e) => setValidatorTargetWordCount(e.target.value)}
                placeholder="e.g., 5000, 25000, 100000"
                className="flex-1 px-4 py-3 text-lg font-semibold border-2 border-violet-300 dark:border-violet-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 dark:bg-gray-700 dark:text-white"
                min="100"
                max="300000"
                data-testid="input-target-word-count"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">words</span>
            </div>
            <p className="text-xs text-violet-600 dark:text-violet-400 mt-2 font-medium">
              Enter desired output length. Leave empty to auto-expand (small input → 5000 words, large input → 1.5x).
            </p>
          </div>

          {/* Optional Custom Instructions Box */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 mt-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Custom Instructions (Optional)
            </label>
            <Textarea
              value={validatorCustomInstructions}
              onChange={(e) => setValidatorCustomInstructions(e.target.value)}
              placeholder="e.g., 'TURN INTO A PLAY' or 'WRITE AS A LEGAL DOCUMENT' or 'Focus on the logical structure'"
              className="min-h-[100px] text-sm"
              data-testid="textarea-validator-custom-instructions"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Provide specific guidance about format or content. The app will follow your instructions exactly.
            </p>
          </div>

          {/* LLM Provider Selector */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 mt-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              AI Model Selection
            </label>
            <Select value={validatorLLMProvider} onValueChange={setValidatorLLMProvider}>
              <SelectTrigger data-testid="select-validator-llm" className="w-full">
                <SelectValue placeholder="Select AI Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zhi5">ZHI 5 - Default</SelectItem>
                <SelectItem value="zhi1">ZHI 1</SelectItem>
                <SelectItem value="zhi2">ZHI 2</SelectItem>
                <SelectItem value="zhi3">ZHI 3</SelectItem>
                <SelectItem value="zhi4">ZHI 4</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Model Guide with Cost Multipliers */}
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-600 text-xs">
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Model Guide (cost per token)</div>
              <div className="space-y-1 text-gray-600 dark:text-gray-400">
                <div className="flex justify-between"><span><b>ZHI 1</b> — General purpose, follows instructions best</span><span className="text-amber-600 font-medium">5x</span></div>
                <div className="flex justify-between"><span><b>ZHI 2</b> — Complex writing, long documents</span><span className="text-red-500 font-medium">7x</span></div>
                <div className="flex justify-between"><span><b>ZHI 3</b> — Math & logic</span><span className="text-green-600 font-medium">1x</span></div>
                <div className="flex justify-between"><span><b>ZHI 4</b> — Factual lookup with sources</span><span className="text-red-500 font-medium">7x</span></div>
                <div className="flex justify-between"><span><b>ZHI 5</b> — Casual, current events</span><span className="text-yellow-600 font-medium">3x</span></div>
              </div>
            </div>
          </div>


          {/* Output Display */}
          {validatorOutput && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border-2 border-emerald-300 dark:border-emerald-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                  Validation Result ({validatorMode?.toUpperCase()})
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadText(validatorOutput, `validator-output-${validatorMode}.txt`)}
                    data-testid="button-download-validator-output"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <SendToButton
                    text={validatorOutput}
                    onSendToIntelligence={(text) => setDocumentA({ content: text })}
                    onSendToHumanizer={(text) => setBoxA(text)}
                    onSendToChat={(text) => {
                      const chatInput = document.querySelector('[data-testid="chat-input"]') as HTMLTextAreaElement;
                      if (chatInput) {
                        chatInput.value = text;
                        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                      }
                    }}
                    onSendToObjections={(text) => {
                      setObjectionsInputText(text);
                      setShowObjectionsPanel(true);
                      setTimeout(() => {
                        const objSection = document.getElementById('objections-section');
                        if (objSection) {
                          objSection.scrollIntoView({ behavior: 'smooth' });
                        }
                      }, 100);
                    }}
                  />
                  <CopyButton text={validatorOutput} />
                  <Button
                    onClick={() => {
                      setRedoCustomInstructions("");
                      setShowRedoModal(true);
                    }}
                    variant="outline"
                    size="sm"
                    className="bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300"
                    data-testid="button-redo-validator"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Redo
                  </Button>
                  <Button
                    onClick={handleValidatorClear}
                    variant="outline"
                    size="sm"
                    data-testid="button-clear-validator"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                </div>
              </div>
              
              {/* Prominent Output Word Count Display */}
              <div 
                className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 rounded-lg p-3 mb-4"
                data-testid="output-word-count-display"
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-sky-700 dark:text-sky-300">Input Words:</span>
                      <span className="text-lg font-bold text-sky-900 dark:text-sky-100">
                        {validatorInputText.trim().split(/\s+/).filter((w: string) => w).length.toLocaleString()}
                      </span>
                    </div>
                    <span className="text-sky-400">|</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Output Words:</span>
                      <span className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                        {validatorOutput.trim().split(/\s+/).filter((w: string) => w).length.toLocaleString()}
                      </span>
                    </div>
                    {refineWordCount && (
                      <>
                        <span className="text-sky-400">|</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Target:</span>
                          <span className={`text-lg font-bold flex items-center gap-1 ${
                            validatorOutput.trim().split(/\s+/).filter((w: string) => w).length >= parseInt(refineWordCount)
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {parseInt(refineWordCount).toLocaleString()}
                            {validatorOutput.trim().split(/\s+/).filter((w: string) => w).length >= parseInt(refineWordCount) ? (
                              <CheckCircle className="w-4 h-4" />
                            ) : (
                              <AlertCircle className="w-4 h-4" />
                            )}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  <TextStats text={validatorOutput} showAiDetect={true} variant="compact" />
                </div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700 max-h-[600px] overflow-y-auto">
                <FreemiumContent content={validatorOutput} />
              </div>
              
              {/* Refine Reconstruction Section */}
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-3 flex items-center gap-2">
                  <FileEdit className="w-4 h-4" />
                  Refine Output (Adjust Word Count / Add Instructions)
                </h4>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[120px] max-w-[180px]">
                    <label className="block text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                      Target Word Count
                    </label>
                    <input
                      type="number"
                      value={refineWordCount}
                      onChange={(e) => setRefineWordCount(e.target.value)}
                      placeholder="e.g., 400"
                      className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                      data-testid="input-refine-word-count"
                    />
                  </div>
                  <div className="flex-[2] min-w-[200px]">
                    <label className="block text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                      Custom Instructions (Optional)
                    </label>
                    <input
                      type="text"
                      value={refineInstructions}
                      onChange={(e) => setRefineInstructions(e.target.value)}
                      placeholder="e.g., Add a Plato quote, emphasize the conclusion"
                      className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                      data-testid="input-refine-instructions"
                    />
                  </div>
                  <Button
                    onClick={handleRefineReconstruction}
                    disabled={refineLoading || (!refineWordCount && !refineInstructions)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    data-testid="button-refine-reconstruction"
                  >
                    {refineLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Refining...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refine
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  Current word count: ~{validatorOutput.trim().split(/\s+/).length} words
                </p>
              </div>
            </div>
          )}

          {/* Loading State */}
          {validatorLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Processing text validation...</p>
            </div>
          )}

          {/* Batch Loading State */}
          {validatorBatchLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Processing {validatorSelectedModes.length} functions...</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">This may take a few minutes</p>
            </div>
          )}

          {/* Batch Results Display */}
          {validatorBatchResults.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-emerald-600" />
                  Batch Validation Results ({validatorBatchResults.filter(r => r.success).length}/{validatorBatchResults.length} successful)
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const allResults = validatorBatchResults
                        .map(r => r.success ? r.output : `[ERROR: ${r.error}]`)
                        .join('\n\n' + '═'.repeat(80) + '\n\n');
                      handleDownloadText(allResults, 'batch-validator-results.txt');
                    }}
                    data-testid="button-download-all-batch"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download All
                  </Button>
                  <CopyButton 
                    text={validatorBatchResults
                      .map(r => r.success ? r.output : `[ERROR: ${r.error}]`)
                      .join('\n\n' + '═'.repeat(80) + '\n\n')} 
                  />
                  <Button
                    onClick={handleValidatorClear}
                    variant="outline"
                    size="sm"
                    data-testid="button-clear-batch"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear All
                  </Button>
                </div>
              </div>

              {validatorBatchResults.map((result, index) => {
                const modeLabels: Record<string, string> = {
                  'reconstruction': 'Reconstruction'
                };
                const modeBorderClasses: Record<string, string> = {
                  'reconstruction': 'border-emerald-300 dark:border-emerald-700'
                };
                const modeBadgeClasses: Record<string, string> = {
                  'reconstruction': 'bg-emerald-600'
                };

                return (
                  <div 
                    key={result.mode}
                    className={`bg-white dark:bg-gray-800 p-6 rounded-lg border-2 ${modeBorderClasses[result.mode] || 'border-gray-300 dark:border-gray-700'}`}
                    data-testid={`batch-result-${result.mode}`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Badge className={`${modeBadgeClasses[result.mode] || 'bg-gray-600'} text-white`}>
                          {modeLabels[result.mode] || result.mode.toUpperCase()}
                        </Badge>
                        {result.success ? (
                          <>
                            <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-400">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Success
                            </Badge>
                            <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-400">
                              {(result.output || '').trim().split(/\s+/).filter(w => w).length.toLocaleString()} words
                            </Badge>
                          </>
                        ) : (
                          <Badge variant="outline" className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-400">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                      </div>
                      {result.success && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadText(result.output || '', `validator-${result.mode}.txt`)}
                            data-testid={`button-download-${result.mode}`}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <CopyButton text={result.output || ''} />
                        </div>
                      )}
                    </div>
                    
                    {result.success ? (
                      <>
                        <TextStats 
                          text={result.output || ''} 
                          showAiDetect={true} 
                          variant="prominent"
                          targetWords={parseInt(refineReconstructionWordCount) || undefined}
                        />
                        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700 max-h-[400px] overflow-y-auto">
                          <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-200">
                            {result.output}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded border border-red-200 dark:border-red-700">
                        <p className="text-red-700 dark:text-red-300">
                          Error: {result.error}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Objections Output Display */}
          {objectionsOutput && (
            <div className="mt-6 bg-white dark:bg-gray-800 p-6 rounded-lg border-2 border-orange-300 dark:border-orange-700">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-orange-900 dark:text-orange-100 flex items-center gap-2">
                  <MessageSquareWarning className="w-5 h-5 text-orange-600" />
                  Objections & Counter-Arguments
                  <Badge variant="outline" className="ml-2 bg-orange-100 dark:bg-orange-900/30">
                    25 Items
                  </Badge>
                </h4>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadText(objectionsOutput, 'objections-responses.txt')}
                    data-testid="button-download-objections"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <CopyButton text={objectionsOutput} />
                </div>
              </div>
              <TextStats 
                text={objectionsOutput} 
                showAiDetect={true} 
                variant="prominent"
              />
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700 max-h-[700px] overflow-y-auto">
                <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-200">
                  {objectionsOutput}
                </pre>
              </div>
              
              {/* Quick action to proceed to Objection-Proof */}
              <div className="mt-4 p-4 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-700">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-rose-600" />
                    <span className="font-medium text-rose-800 dark:text-rose-200">
                      Ready to create objection-proof version
                    </span>
                  </div>
                  <Button
                    onClick={() => {
                      const wordCount = objectionsInputText.split(/\s+/).length;
                      const objectionCount = (objectionsOutput.match(/\d+\.\s/g) || []).length;
                      setShowObjectionProofPanel(true);
                      setTimeout(() => {
                        const section = document.getElementById('objection-proof-section');
                        if (section) {
                          section.scrollIntoView({ behavior: 'smooth' });
                        }
                      }, 100);
                      toast({
                        title: "Data Transferred",
                        description: `${wordCount} words of source text and ${objectionCount} objections sent to Objection-Proof section.`,
                      });
                    }}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                    data-testid="button-go-to-objection-proof"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Send to Objection-Proof Section
                  </Button>
                </div>
                <p className="text-sm text-rose-700 dark:text-rose-300 mt-2">
                  Your source text and objections are ready. Click to proceed to create an invulnerable version.
                </p>
              </div>
            </div>
          )}

          {/* STANDALONE OBJECTIONS FUNCTION - Always visible */}
          <div id="objections-section" className="mt-8 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 p-6 rounded-lg border border-orange-200 dark:border-orange-800">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowObjectionsPanel(!showObjectionsPanel)}
            >
              <h3 className="text-xl font-semibold text-orange-900 dark:text-orange-100 flex items-center gap-2">
                <MessageSquareWarning className="w-6 h-6 text-orange-600" />
                Objections Function (Standalone)
                <Badge variant="outline" className="ml-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                  25 Objections + Responses
                </Badge>
              </h3>
              <Button variant="ghost" size="icon" data-testid="button-toggle-standalone-objections">
                {showObjectionsPanel ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </Button>
            </div>
            <p className="text-sm text-orange-700 dark:text-orange-300 mt-2 mb-4">
              Generate 25 likely objections and compelling counter-arguments for any text.
            </p>

            {showObjectionsPanel && (
              <div className="space-y-4">
                {/* Input Text */}
                <div>
                  <Label className="text-sm font-medium text-orange-800 dark:text-orange-200">
                    Text to Analyze
                  </Label>
                  <Textarea
                    value={objectionsInputText}
                    onChange={(e) => setObjectionsInputText(e.target.value)}
                    placeholder="Paste your text here - this can be any argument, proposal, pitch, essay, or content you want to anticipate objections for..."
                    className="min-h-[150px] mt-2"
                    data-testid="textarea-objections-input"
                  />
                </div>

                {/* Audience & Objective */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-orange-800 dark:text-orange-200">
                      Target Audience (optional)
                    </Label>
                    <Input
                      value={objectionsAudience}
                      onChange={(e) => setObjectionsAudience(e.target.value)}
                      placeholder="e.g., 'Investors', 'Academic reviewers', 'Skeptical customers'"
                      className="mt-1"
                      data-testid="input-objections-audience"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-orange-800 dark:text-orange-200">
                      Objective (optional)
                    </Label>
                    <Input
                      value={objectionsObjective}
                      onChange={(e) => setObjectionsObjective(e.target.value)}
                      placeholder="e.g., 'Convince them to invest', 'Get paper accepted'"
                      className="mt-1"
                      data-testid="input-objections-objective"
                    />
                  </div>
                </div>

                {/* Custom Instructions */}
                <div>
                  <Label className="text-sm font-medium text-orange-800 dark:text-orange-200">
                    Custom Instructions (optional)
                  </Label>
                  <Textarea
                    value={objectionsCustomInstructions}
                    onChange={(e) => setObjectionsCustomInstructions(e.target.value)}
                    placeholder="e.g., 'Focus on financial objections' or 'Include legal/regulatory concerns' or 'Consider skeptics who distrust AI'"
                    className="min-h-[80px] mt-1"
                    data-testid="textarea-objections-custom-instructions"
                  />
                </div>

                {/* Generate Button */}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleObjections()}
                      disabled={objectionsLoading || !objectionsInputText.trim()}
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                      data-testid="button-generate-objections-standalone"
                    >
                      {objectionsLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating Objections...
                        </>
                      ) : (
                        <>
                          <MessageSquareWarning className="w-4 h-4 mr-2" />
                          Generate 25 Objections
                        </>
                      )}
                    </Button>
                    {objectionsInputText && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setObjectionsInputText("");
                          setObjectionsAudience("");
                          setObjectionsObjective("");
                          setObjectionsCustomInstructions("");
                        }}
                        data-testid="button-clear-objections-form"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Clear Form
                      </Button>
                    )}
                  </div>
                  {objectionsLoading && objectionsProgress && (
                    <p className="text-sm text-orange-700 dark:text-orange-300 flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {objectionsProgress}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Redo Modal with Custom Instructions */}
          <Dialog open={showRedoModal} onOpenChange={setShowRedoModal}>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-amber-600" />
                  Redo with Custom Instructions
                </DialogTitle>
                <DialogDescription>
                  Enter specific instructions to guide the reconstruction. Leave blank for default behavior.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Textarea
                  value={redoCustomInstructions}
                  onChange={(e) => setRedoCustomInstructions(e.target.value)}
                  placeholder="e.g., 'Focus on the economic arguments' or 'Make the thesis about evolutionary biology' or 'Add specific scientific studies as evidence' or 'Make it more concise - half the length'"
                  className="min-h-[150px] text-sm"
                  data-testid="textarea-redo-custom-instructions"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Examples: "Add real statistics" / "Focus only on the strongest argument" / "Make it half as long" / "Frame it as a philosophical argument"
                </p>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowRedoModal(false)}
                  data-testid="button-cancel-redo"
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    setShowRedoModal(false);
                    setValidatorCustomInstructions(redoCustomInstructions);
                    setValidatorLoading(true);
                    try {
                      const response = await fetch("/api/text-model-validator", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          text: validatorInputText,
                          mode: validatorMode,
                          targetDomain: validatorTargetDomain,
                          fidelityLevel: validatorFidelityLevel,
                          mathFramework: validatorMathFramework,
                          constraintType: validatorConstraintType,
                          rigorLevel: validatorRigorLevel,
                          customInstructions: redoCustomInstructions,
                          truthMapping: validatorTruthMapping,
                          mathTruthMapping: validatorMathTruthMapping,
                          literalTruth: validatorLiteralTruth,
                          llmProvider: validatorLLMProvider,
                        }),
                      });
                      const data = await response.json();
                      if (data.success) {
                        setValidatorOutput(stripMarkdown(data.output));
                        toast({
                          title: "Reconstruction Complete",
                          description: redoCustomInstructions ? "Regenerated with your custom instructions" : "Regenerated with default settings",
                        });
                      } else {
                        toast({
                          title: "Error",
                          description: data.message || "Failed to process",
                          variant: "destructive",
                        });
                      }
                    } catch (error: any) {
                      toast({
                        title: "Error",
                        description: error.message || "Failed to process",
                        variant: "destructive",
                      });
                    } finally {
                      setValidatorLoading(false);
                    }
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  data-testid="button-confirm-redo"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* OBJECTION-PROOF VERSION - Rewrite text to pre-empt identified objections */}
      <div id="objection-proof-section" className="mt-16 bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-900/10 dark:to-pink-900/10 p-8 rounded-lg border-2 border-rose-200 dark:border-rose-700">
        <div className="max-w-7xl mx-auto">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowObjectionProofPanel(!showObjectionProofPanel)}
          >
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold text-rose-900 dark:text-rose-100 flex items-center gap-3">
                <ShieldCheck className="w-8 h-8 text-rose-600" />
                Generate Objection-Proof Version
              </h2>
              <Badge variant="outline" className="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">
                Invulnerable Rewrite
              </Badge>
            </div>
            <Button variant="ghost" size="icon" data-testid="button-toggle-objection-proof-panel">
              {showObjectionProofPanel ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </Button>
          </div>
          <p className="text-lg text-gray-700 dark:text-gray-300 mt-2 mb-4">
            Rewrite your text to be invulnerable to the objections identified by the Objections Function
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            For devastating objections, content will be substantially revised. For forceful objections, language is added to remove even their apparent force.
          </p>

          {showObjectionProofPanel && (
            <div className="space-y-6">
              {/* Check if prerequisites are met */}
              {!objectionsInputText && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">No source text available</span>
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    First, enter text in the Objections Function panel above, then generate objections before using this feature.
                  </p>
                </div>
              )}

              {!objectionsOutput && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">No objections generated yet</span>
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Run the Objections Function first to generate 25 objections and counter-arguments, then return here to create an objection-proof version.
                  </p>
                </div>
              )}

              {/* Show source info when we have prerequisites */}
              {objectionsInputText && objectionsOutput && (
                <>
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-rose-200 dark:border-rose-700">
                    <h4 className="font-medium text-rose-900 dark:text-rose-100 mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Source Text
                    </h4>
                    <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700 max-h-[200px] overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                        {objectionsInputText.substring(0, 500)}
                        {objectionsInputText.length > 500 && '...'}
                      </pre>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {objectionsInputText.split(/\s+/).length} words total
                    </p>
                  </div>

                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-rose-200 dark:border-rose-700">
                    <h4 className="font-medium text-rose-900 dark:text-rose-100 mb-2 flex items-center gap-2">
                      <MessageSquareWarning className="w-4 h-4" />
                      Objections to Address
                    </h4>
                    <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700 max-h-[200px] overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                        {objectionsOutput.substring(0, 800)}
                        {objectionsOutput.length > 800 && '...'}
                      </pre>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Full objections output will be used for rewriting
                    </p>
                  </div>

                  {/* Custom Instructions - Auto-imported from Reconstruction */}
                  <div>
                    <Label className="text-sm font-medium text-rose-800 dark:text-rose-200">
                      Custom Instructions (Auto-imported from Reconstruction)
                    </Label>
                    {validatorCustomInstructions && (
                      <div className="mt-2 p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded-md">
                        <p className="text-xs text-rose-600 dark:text-rose-400 font-medium mb-1">
                          Original Instructions (from Reconstruction):
                        </p>
                        <pre className="text-sm text-rose-800 dark:text-rose-200 whitespace-pre-wrap">
                          {validatorCustomInstructions}
                        </pre>
                      </div>
                    )}
                    <Textarea
                      value={objectionProofCustomInstructions}
                      onChange={(e) => setObjectionProofCustomInstructions(e.target.value)}
                      placeholder="Additional instructions for bulletproof rewrite (the original instructions above will always be applied)"
                      className="min-h-[80px] mt-2"
                      data-testid="textarea-objection-proof-instructions"
                    />
                  </div>

                  {/* Generate Button */}
                  <Button
                    onClick={async () => {
                      setObjectionProofLoading(true);
                      try {
                        // ALWAYS use reconstruction instructions as the base, add additional if provided
                        let combinedInstructions = validatorCustomInstructions || '';
                        if (objectionProofCustomInstructions) {
                          combinedInstructions = combinedInstructions 
                            ? `${combinedInstructions}\n\nADDITIONAL INSTRUCTIONS FOR BULLETPROOF REWRITE:\n${objectionProofCustomInstructions}`
                            : objectionProofCustomInstructions;
                        }
                        
                        const response = await fetch('/api/objection-proof-rewrite', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            originalText: objectionsInputText,
                            objectionsOutput: objectionsOutput,
                            customInstructions: combinedInstructions,
                          }),
                        });
                        const data = await response.json();
                        if (data.success) {
                          setObjectionProofOutput(stripMarkdown(data.output));
                          const isLargeDoc = data.method === 'outline-first';
                          toast({
                            title: "Objection-Proof Version Generated",
                            description: isLargeDoc 
                              ? `Processed ${data.sectionsProcessed} sections, addressed ${data.objectionsAddressed} objections`
                              : "Your text has been rewritten to pre-empt identified objections",
                          });
                        } else {
                          toast({
                            title: "Error",
                            description: data.message || "Failed to generate objection-proof version",
                            variant: "destructive",
                          });
                        }
                      } catch (error: any) {
                        toast({
                          title: "Error",
                          description: error.message || "Failed to generate objection-proof version",
                          variant: "destructive",
                        });
                      } finally {
                        setObjectionProofLoading(false);
                      }
                    }}
                    disabled={objectionProofLoading || !objectionsOutput}
                    className="w-full bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white py-3"
                    data-testid="button-generate-objection-proof"
                  >
                    {objectionProofLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        {objectionsInputText.split(/\s+/).length >= 1200 
                          ? "Processing large document (multi-section)..." 
                          : "Generating Objection-Proof Version..."}
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-5 h-5 mr-2" />
                        Generate Objection-Proof Version
                        {objectionsInputText.split(/\s+/).length >= 1200 && (
                          <Badge variant="outline" className="ml-2 text-xs">Large Doc Mode</Badge>
                        )}
                      </>
                    )}
                  </Button>
                </>
              )}

              {/* Output Display */}
              {objectionProofOutput && (
                <div className="mt-6 bg-white dark:bg-gray-800 p-6 rounded-lg border-2 border-rose-300 dark:border-rose-700">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-rose-900 dark:text-rose-100 flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-rose-600" />
                      Objection-Proof Version
                      <Badge variant="outline" className="ml-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                        Complete
                      </Badge>
                    </h4>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadText(objectionProofOutput, 'objection-proof-version.txt')}
                        data-testid="button-download-objection-proof"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <CopyButton text={objectionProofOutput} />
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700 max-h-[700px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-200">
                      {objectionProofOutput}
                    </pre>
                  </div>
                  <TextStats text={objectionProofOutput} showAiDetect={true} variant="compact" />
                </div>
              )}

              {/* Refine Objection-Proof Output Box */}
              {objectionProofOutput && (
                <div className="mt-6 bg-gradient-to-r from-purple-50 to-fuchsia-50 dark:from-purple-900/20 dark:to-fuchsia-900/20 p-6 rounded-lg border-2 border-purple-300 dark:border-purple-700">
                  <h4 className="text-lg font-semibold text-purple-900 dark:text-purple-100 mb-4 flex items-center gap-2">
                    <FileEdit className="w-5 h-5 text-purple-600" />
                    Refine Objection-Proof Version
                  </h4>
                  <p className="text-sm text-purple-700 dark:text-purple-300 mb-4">
                    Adjust word count and/or add custom instructions to modify the output above. The refined version will appear in a new box below.
                  </p>
                  
                  <div className="flex flex-wrap gap-4 items-end mb-4">
                    <div className="flex-1 min-w-[140px] max-w-[200px]">
                      <label className="block text-sm font-medium text-purple-800 dark:text-purple-200 mb-1">
                        Target Word Count
                      </label>
                      <input
                        type="number"
                        value={objectionProofRefineWordCount}
                        onChange={(e) => setObjectionProofRefineWordCount(e.target.value)}
                        placeholder="e.g., 500"
                        className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                        data-testid="input-objection-proof-refine-word-count"
                      />
                    </div>
                    <div className="flex-[2] min-w-[250px]">
                      <label className="block text-sm font-medium text-purple-800 dark:text-purple-200 mb-1">
                        Custom Instructions (Optional)
                      </label>
                      <input
                        type="text"
                        value={objectionProofRefineInstructions}
                        onChange={(e) => setObjectionProofRefineInstructions(e.target.value)}
                        placeholder="e.g., Add a Plato quote, emphasize the conclusion, make more formal"
                        className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                        data-testid="input-objection-proof-refine-instructions"
                      />
                    </div>
                    <Button
                      onClick={handleRefineObjectionProof}
                      disabled={objectionProofRefineLoading || (!objectionProofRefineWordCount && !objectionProofRefineInstructions)}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                      data-testid="button-refine-objection-proof"
                    >
                      {objectionProofRefineLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Refining...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Generate Refined Version
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Refined Output Display */}
                  {objectionProofRefinedOutput && (
                    <div className="mt-4 bg-white dark:bg-gray-800 p-4 rounded-lg border-2 border-purple-400 dark:border-purple-600">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-md font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-purple-600" />
                          Refined Version
                          <Badge variant="outline" className="ml-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                            {objectionProofRefinedOutput.trim().split(/\s+/).length} words
                          </Badge>
                        </h5>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadText(objectionProofRefinedOutput, 'refined-objection-proof.txt')}
                            data-testid="button-download-refined-objection-proof"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <CopyButton text={objectionProofRefinedOutput} />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setObjectionProofRefinedOutput("");
                              setObjectionProofRefineWordCount("");
                              setObjectionProofRefineInstructions("");
                            }}
                            data-testid="button-clear-refined-objection-proof"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700 max-h-[600px] overflow-y-auto">
                        <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-200">
                          {objectionProofRefinedOutput}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CONSERVATIVE RECONSTRUCTION - Charitable Interpretation System */}
      <div className="mt-16 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/10 dark:to-purple-900/10 p-8 rounded-lg border-2 border-violet-200 dark:border-violet-700">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-violet-900 dark:text-violet-100 mb-3 flex items-center justify-center gap-3">
              <Brain className="w-8 h-8 text-violet-600" />
              Conservative Reconstruction
            </h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">
              Generate coherent essays articulating a text's unified argument through charitable interpretation
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Advanced outline-first and cross-chunk strategies for medium and long documents
            </p>
          </div>

          {/* Project Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-violet-800 dark:text-violet-200">Project Title</Label>
              <Input 
                placeholder="Enter a title for this reconstruction project..." 
                value={reconstructionTitle}
                onChange={(e) => setReconstructionTitle(e.target.value)}
                className="border-violet-200 dark:border-violet-700 focus:border-violet-400"
                data-testid="input-reconstruction-title"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-violet-800 dark:text-violet-200">Target Word Count</Label>
              <Input 
                type="number" 
                value={reconstructionTargetWordCount}
                onChange={(e) => setReconstructionTargetWordCount(e.target.value)}
                placeholder="500"
                className="border-violet-200 dark:border-violet-700 focus:border-violet-400"
                data-testid="input-reconstruction-word-count"
              />
            </div>
          </div>

          {/* Input Text Area */}
          <div className="mb-6">
            <Label className="block text-sm font-semibold text-violet-800 dark:text-violet-200 mb-2">
              Source Text for Reconstruction
            </Label>
            <Textarea
              value={reconstructionInputText}
              onChange={(e) => setReconstructionInputText(e.target.value)}
              placeholder="Paste your text here for conservative reconstruction. The system will generate a coherent essay that articulates the unified argument through charitable interpretation..."
              className="min-h-[200px] border-violet-200 dark:border-violet-700 focus:border-violet-400"
              data-testid="textarea-reconstruction-input"
            />
            {reconstructionInputText && (
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                {reconstructionInputText.split(/\s+/).filter(w => w).length} words
              </p>
            )}
          </div>

          {/* Action Button */}
          <Button 
            onClick={startReconstruction} 
            className="w-full py-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold text-lg"
            disabled={reconstructionLoading || reconstructionPolling || !reconstructionInputText.trim()}
            data-testid="button-start-reconstruction"
          >
            {reconstructionLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Processing Conservative Reconstruction...
              </>
            ) : (
              <>
                <Brain className="w-5 h-5 mr-2" />
                Start Conservative Reconstruction
              </>
            )}
          </Button>

          {/* Results Display */}
          {showReconstructionResults && reconstructionProject && (
            <div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg border-2 border-violet-300 dark:border-violet-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-violet-900 dark:text-violet-100 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-violet-600" />
                  Reconstruction Project: {reconstructionProject.title}
                </h3>
                <Badge variant="outline" className={`${
                  reconstructionProject.status === 'completed' ? 'bg-green-100 text-green-700 border-green-300' :
                  reconstructionProject.status === 'processing' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                  'bg-gray-100 text-gray-700 border-gray-300'
                }`}>
                  {reconstructionProject.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <div>
                  <span className="font-medium">Target Word Count:</span> {reconstructionProject.targetWordCount}
                </div>
                <div>
                  <span className="font-medium">Project ID:</span> {reconstructionProject.id}
                </div>
              </div>
              {reconstructionProject.status === 'processing' && (
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>The reconstruction is being processed. Results will appear here when complete.</span>
                </div>
              )}
              {reconstructionProject.reconstructedText && (
                <div className="mt-4">
                  <Label className="block text-sm font-semibold text-violet-800 dark:text-violet-200 mb-2">
                    Reconstructed Output
                  </Label>
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700 max-h-[400px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-200">
                      {reconstructionProject.reconstructedText}
                    </pre>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <CopyButton text={reconstructionProject.reconstructedText} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadText(reconstructionProject.reconstructedText, `reconstruction-${reconstructionProject.id}.txt`)}
                      data-testid="button-download-reconstruction"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* COHERENCE METER - Analyze and Improve Text Coherence */}
      <div className="mt-16 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/10 dark:to-blue-900/10 p-8 rounded-lg border-2 border-indigo-200 dark:border-indigo-700">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="w-24"></div>
              <h2 className="text-3xl font-bold text-indigo-900 dark:text-indigo-100 flex items-center justify-center gap-3">
                <BarChart3 className="w-8 h-8 text-indigo-600" />
                Coherence Meter
              </h2>
              <Button
                onClick={handleCoherenceClear}
                variant="outline"
                size="sm"
                className="border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                data-testid="button-clear-coherence-top"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </Button>
            </div>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">
              Analyze and improve text coherence across multiple dimensions
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Evaluate logical, scientific, thematic, instructional, or motivational coherence - then get rewrites that maximize it
            </p>
          </div>

          {/* Resume Job Banner */}
          {resumeJobData && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-lg" id="coherence-meter">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 text-amber-600" />
                  <div>
                    <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                      Interrupted Job Found
                    </h3>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Mode: {resumeJobData.coherenceMode?.replace(/-/g, ' ')} | 
                      Chunks saved: {resumeJobData.existingChunks} | 
                      Resume from chunk: {resumeJobData.resumeFromChunk + 1}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={dismissResumeJob}
                    className="border-amber-400"
                    data-testid="button-dismiss-resume"
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => {
                      toast({
                        title: "Resume Ready",
                        description: "Paste your original text and click Analyze/Rewrite. The system will continue from the saved state.",
                      });
                    }}
                    data-testid="button-resume-ready"
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Resume Job
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-indigo-800 dark:text-indigo-200">
                Input Text (50,000 word limit)
              </label>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Word Count: {coherenceInputText.trim() ? coherenceInputText.trim().split(/\s+/).length.toLocaleString() : 0} / 50,000
                </span>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, setCoherenceInputText);
                    }}
                    data-testid="input-coherence-upload"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                    onClick={(e) => {
                      e.preventDefault();
                      (e.currentTarget.previousElementSibling as HTMLInputElement)?.click();
                    }}
                    data-testid="button-coherence-upload"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Document
                  </Button>
                </label>
              </div>
            </div>
            <div
              className={`relative transition-all duration-200 ${
                coherenceDragOver 
                  ? "ring-2 ring-indigo-500 ring-offset-2 rounded-md" 
                  : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCoherenceDragOver(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCoherenceDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCoherenceDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCoherenceDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file && (file.type === 'application/pdf' || 
                    file.type === 'application/msword' || 
                    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                    file.type === 'text/plain' ||
                    file.name.endsWith('.txt') ||
                    file.name.endsWith('.pdf') ||
                    file.name.endsWith('.doc') ||
                    file.name.endsWith('.docx'))) {
                  handleFileUpload(file, setCoherenceInputText);
                } else if (file) {
                  toast({
                    title: "Unsupported File Type",
                    description: "Please upload a PDF, Word document (.doc, .docx), or text file (.txt)",
                    variant: "destructive",
                  });
                }
              }}
              data-testid="dropzone-coherence"
            >
              {coherenceDragOver && (
                <div className="absolute inset-0 bg-indigo-100/80 dark:bg-indigo-900/80 rounded-md flex items-center justify-center z-10 pointer-events-none">
                  <div className="flex flex-col items-center gap-2 text-indigo-700 dark:text-indigo-300">
                    <Upload className="w-10 h-10" />
                    <span className="font-semibold">Drop document here</span>
                    <span className="text-sm">PDF, Word, or TXT files</span>
                  </div>
                </div>
              )}
              <Textarea
                value={coherenceInputText}
                onChange={(e) => setCoherenceInputText(e.target.value)}
                placeholder="Paste your text here to analyze coherence... or drag & drop a document (PDF, Word, TXT)"
                className="min-h-[200px] font-mono text-sm"
                data-testid="textarea-coherence-input"
              />
            </div>
            <TextStats text={coherenceInputText} showAiDetect={true} />
          </div>

          {/* Chunk Selector - appears when text > 1000 words */}
          {showCoherenceChunkSelector && coherenceChunks.length > 0 && (
            <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 p-6 rounded-lg border-2 border-yellow-400 dark:border-yellow-600">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Text Too Long - Select Sections to Process
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedCoherenceChunks.length === coherenceChunks.length) {
                      setSelectedCoherenceChunks([]);
                    } else {
                      setSelectedCoherenceChunks(coherenceChunks.map(c => c.id));
                    }
                  }}
                  data-testid="button-toggle-all-chunks"
                >
                  {selectedCoherenceChunks.length === coherenceChunks.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
              
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-4">
                Your text has been divided into {coherenceChunks.length} sections (~400 words each). Select which sections you want to analyze or rewrite:
              </p>

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {coherenceChunks.map((chunk, index) => (
                  <label
                    key={chunk.id}
                    className={`flex items-start gap-3 p-3 rounded border-2 cursor-pointer transition ${
                      selectedCoherenceChunks.includes(chunk.id)
                        ? "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-500"
                        : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCoherenceChunks.includes(chunk.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCoherenceChunks([...selectedCoherenceChunks, chunk.id]);
                        } else {
                          setSelectedCoherenceChunks(selectedCoherenceChunks.filter(id => id !== chunk.id));
                        }
                      }}
                      className="w-5 h-5 mt-1"
                      data-testid={`checkbox-${chunk.id}`}
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                        Section {index + 1}
                        <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                          (~{chunk.text.split(/\s+/).length} words)
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 italic">
                        "{chunk.preview}"
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-4 flex gap-3">
                <Button
                  onClick={() => handleProcessSelectedChunks("analyze")}
                  disabled={coherenceLoading || selectedCoherenceChunks.length === 0}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  data-testid="button-analyze-selected-chunks"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Analyze Selected Sections ({selectedCoherenceChunks.length})
                </Button>

                <Button
                  onClick={() => handleProcessSelectedChunks("rewrite")}
                  disabled={coherenceLoading || selectedCoherenceChunks.length === 0}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  data-testid="button-rewrite-selected-chunks"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Rewrite Selected Sections ({selectedCoherenceChunks.length})
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCoherenceChunkSelector(false);
                    setCoherenceChunks([]);
                    setSelectedCoherenceChunks([]);
                  }}
                  data-testid="button-cancel-chunks"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Coherence Type Selection */}
          <div className="mb-6 bg-white dark:bg-gray-800 p-6 rounded-lg border border-indigo-200 dark:border-indigo-700">
            <label className="block text-sm font-semibold text-indigo-800 dark:text-indigo-200 mb-4">
              Select Coherence Type:
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-3 rounded transition">
                <input
                  type="radio"
                  name="coherence-type"
                  value="logical-consistency"
                  checked={coherenceType === "logical-consistency"}
                  onChange={(e) => setCoherenceType(e.target.value as any)}
                  className="w-4 h-4 text-indigo-600"
                  data-testid="radio-logical-consistency"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Logical Consistency</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">- Non-contradiction only</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-3 rounded transition">
                <input
                  type="radio"
                  name="coherence-type"
                  value="logical-cohesiveness"
                  checked={coherenceType === "logical-cohesiveness"}
                  onChange={(e) => setCoherenceType(e.target.value as any)}
                  className="w-4 h-4 text-indigo-600"
                  data-testid="radio-logical-cohesiveness"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Logical Cohesiveness</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">- Argumentative structure</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-3 rounded transition">
                <input
                  type="radio"
                  name="coherence-type"
                  value="scientific-explanatory"
                  checked={coherenceType === "scientific-explanatory"}
                  onChange={(e) => setCoherenceType(e.target.value as any)}
                  className="w-4 h-4 text-indigo-600"
                  data-testid="radio-scientific-explanatory"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Scientific/Explanatory</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">- Aligns with natural law</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-3 rounded transition">
                <input
                  type="radio"
                  name="coherence-type"
                  value="thematic-psychological"
                  checked={coherenceType === "thematic-psychological"}
                  onChange={(e) => setCoherenceType(e.target.value as any)}
                  className="w-4 h-4 text-indigo-600"
                  data-testid="radio-thematic-psychological"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Thematic/Psychological</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">- Emotional & mood flow</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-3 rounded transition">
                <input
                  type="radio"
                  name="coherence-type"
                  value="instructional"
                  checked={coherenceType === "instructional"}
                  onChange={(e) => setCoherenceType(e.target.value as any)}
                  className="w-4 h-4 text-indigo-600"
                  data-testid="radio-instructional"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Instructional</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">- Clear, actionable message</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-3 rounded transition">
                <input
                  type="radio"
                  name="coherence-type"
                  value="motivational"
                  checked={coherenceType === "motivational"}
                  onChange={(e) => setCoherenceType(e.target.value as any)}
                  className="w-4 h-4 text-indigo-600"
                  data-testid="radio-motivational"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Motivational</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">- Consistent emotional direction</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-3 rounded transition">
                <input
                  type="radio"
                  name="coherence-type"
                  value="mathematical"
                  checked={coherenceType === "mathematical"}
                  onChange={(e) => setCoherenceType(e.target.value as any)}
                  className="w-4 h-4 text-indigo-600"
                  data-testid="radio-mathematical"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Mathematical (Proof Validity)</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">- Rigorous proof checking</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-3 rounded transition">
                <input
                  type="radio"
                  name="coherence-type"
                  value="philosophical"
                  checked={coherenceType === "philosophical"}
                  onChange={(e) => setCoherenceType(e.target.value as any)}
                  className="w-4 h-4 text-indigo-600"
                  data-testid="radio-philosophical"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Philosophical (Conceptual Rigor)</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">- Conceptual consistency and dialectical engagement</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-3 rounded transition">
                <input
                  type="radio"
                  name="coherence-type"
                  value="auto-detect"
                  checked={coherenceType === "auto-detect"}
                  onChange={(e) => setCoherenceType(e.target.value as any)}
                  className="w-4 h-4 text-indigo-600"
                  data-testid="radio-auto-detect"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">Auto-Detect</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">- Let AI determine type</span>
                </div>
              </label>
            </div>
          </div>

          {/* Processing Mode Selection */}
          <div className="mb-6 bg-white dark:bg-gray-800 p-6 rounded-lg border border-indigo-200 dark:border-indigo-700">
            <label className="block text-sm font-semibold text-indigo-800 dark:text-indigo-200 mb-4">
              Processing Mode for Long Texts (&gt;1000 words):
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label 
                className={`flex items-start gap-3 cursor-pointer p-5 rounded border-2 transition ${
                  coherenceProcessingMode === "simple" 
                    ? "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-500" 
                    : "bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                }`}
              >
                <input
                  type="radio"
                  name="coherence-processing-mode"
                  value="simple"
                  checked={coherenceProcessingMode === "simple"}
                  onChange={(e) => setCoherenceProcessingMode(e.target.value as any)}
                  className="w-5 h-5 text-indigo-600 mt-1"
                  data-testid="radio-mode-simple"
                />
                <div className="flex-1">
                  <span className="font-semibold text-gray-900 dark:text-gray-100 block mb-2 text-lg">⚡ Simple Chunking</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300 block mb-2">Process sections independently for speed</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">• Faster processing<br/>• Good for quick analysis<br/>• Each section processed separately</span>
                </div>
              </label>

              <label 
                className={`flex items-start gap-3 cursor-pointer p-5 rounded border-2 transition ${
                  coherenceProcessingMode === "outline-guided" 
                    ? "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-500" 
                    : "bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                }`}
              >
                <input
                  type="radio"
                  name="coherence-processing-mode"
                  value="outline-guided"
                  checked={coherenceProcessingMode === "outline-guided"}
                  onChange={(e) => setCoherenceProcessingMode(e.target.value as any)}
                  className="w-5 h-5 text-indigo-600 mt-1"
                  data-testid="radio-mode-outline"
                />
                <div className="flex-1">
                  <span className="font-semibold text-gray-900 dark:text-gray-100 block mb-2 text-lg">🎯 Outline-Guided (Recommended)</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300 block mb-2">Two-stage process for maximum global coherence</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">• Creates coherent outline first<br/>• Rewrites sections to align with outline<br/>• Better consistency across entire document</span>
                </div>
              </label>
            </div>
          </div>

          {/* Rewrite Aggressiveness Selection */}
          <div className="mb-6 bg-white dark:bg-gray-800 p-6 rounded-lg border border-purple-200 dark:border-purple-700">
            <label className="block text-sm font-semibold text-purple-800 dark:text-purple-200 mb-4">
              Rewrite Aggressiveness (for "Rewrite to Max Coherence"):
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label 
                className={`flex items-start gap-3 cursor-pointer p-4 rounded border-2 transition ${
                  coherenceAggressiveness === "conservative" 
                    ? "bg-purple-100 dark:bg-purple-900/40 border-purple-500" 
                    : "bg-white dark:bg-gray-800 border-purple-200 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                }`}
              >
                <input
                  type="radio"
                  name="coherence-aggressiveness"
                  value="conservative"
                  checked={coherenceAggressiveness === "conservative"}
                  onChange={(e) => setCoherenceAggressiveness(e.target.value as any)}
                  className="w-4 h-4 text-purple-600 mt-1"
                  data-testid="radio-aggressiveness-conservative"
                />
                <div className="flex-1">
                  <span className="font-semibold text-gray-900 dark:text-gray-100 block mb-1">Conservative</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">Minimal changes - preserve original structure and wording as much as possible</span>
                </div>
              </label>

              <label 
                className={`flex items-start gap-3 cursor-pointer p-4 rounded border-2 transition ${
                  coherenceAggressiveness === "moderate" 
                    ? "bg-purple-100 dark:bg-purple-900/40 border-purple-500" 
                    : "bg-white dark:bg-gray-800 border-purple-200 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                }`}
              >
                <input
                  type="radio"
                  name="coherence-aggressiveness"
                  value="moderate"
                  checked={coherenceAggressiveness === "moderate"}
                  onChange={(e) => setCoherenceAggressiveness(e.target.value as any)}
                  className="w-4 h-4 text-purple-600 mt-1"
                  data-testid="radio-aggressiveness-moderate"
                />
                <div className="flex-1">
                  <span className="font-semibold text-gray-900 dark:text-gray-100 block mb-1">Moderate</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">Fix major issues - add missing arguments and clarify key points</span>
                </div>
              </label>

              <label 
                className={`flex items-start gap-3 cursor-pointer p-4 rounded border-2 transition ${
                  coherenceAggressiveness === "aggressive" 
                    ? "bg-purple-100 dark:bg-purple-900/40 border-purple-500" 
                    : "bg-white dark:bg-gray-800 border-purple-200 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                }`}
              >
                <input
                  type="radio"
                  name="coherence-aggressiveness"
                  value="aggressive"
                  checked={coherenceAggressiveness === "aggressive"}
                  onChange={(e) => setCoherenceAggressiveness(e.target.value as any)}
                  className="w-4 h-4 text-purple-600 mt-1"
                  data-testid="radio-aggressiveness-aggressive"
                />
                <div className="flex-1">
                  <span className="font-semibold text-gray-900 dark:text-gray-100 block mb-1">Aggressive ⚡</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">Maximize coherence - expand significantly, restructure completely, add extensive context for 9-10/10 score</span>
                </div>
              </label>
            </div>
          </div>

          {/* Action Buttons - Different layout for mathematical vs other types */}
          {coherenceType === "mathematical" ? (
            /* FOUR BUTTONS FOR MATHEMATICAL PROOFS */
            <div className="space-y-4 mb-6">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Analysis Functions:</div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleMathCoherence}
                  disabled={coherenceLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-5 flex-1 min-w-[180px]"
                  data-testid="button-math-coherence"
                >
                  {coherenceLoading && coherenceMode === "analyze" ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing...</>
                  ) : (
                    <><BarChart3 className="w-4 h-4 mr-2" />COHERENCE</>
                  )}
                </Button>
                <Button
                  onClick={handleMathCogency}
                  disabled={coherenceLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-5 flex-1 min-w-[180px]"
                  data-testid="button-math-cogency"
                >
                  {coherenceLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing...</>
                  ) : (
                    <><CheckCircle className="w-4 h-4 mr-2" />COGENCY</>
                  )}
                </Button>
              </div>
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 mt-4">Rewrite Functions:</div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleMathMaxCoherence}
                  disabled={coherenceLoading}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-5 flex-1 min-w-[180px]"
                  data-testid="button-math-max-coherence"
                >
                  {coherenceLoading && coherenceMode === "rewrite" ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Rewriting...</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" />MAX COHERENCE</>
                  )}
                </Button>
                <Button
                  onClick={handleMathMaximizeTruth}
                  disabled={coherenceLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-5 flex-1 min-w-[180px]"
                  data-testid="button-math-maximize-truth"
                >
                  {coherenceLoading && mathProofIsCorrected === false ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Correcting...</>
                  ) : (
                    <><Target className="w-4 h-4 mr-2" />MAXIMIZE TRUTH</>
                  )}
                </Button>
              </div>
              <div className="flex justify-end mt-2">
                <Button
                  onClick={handleCoherenceClear}
                  variant="outline"
                  className="border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  data-testid="button-clear-coherence"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All
                </Button>
              </div>
              {/* Math Mode Explanations */}
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-xs text-gray-600 dark:text-gray-400 space-y-2">
                <p><strong>COHERENCE:</strong> Evaluates structural coherence only (logical flow, notation, organization) - NOT whether the theorem is true.</p>
                <p><strong>COGENCY:</strong> Evaluates whether the theorem is TRUE and whether the proof is mathematically valid.</p>
                <p><strong>MAX COHERENCE:</strong> Rewrites to improve structural coherence without changing the mathematical claims.</p>
                <p><strong>MAXIMIZE TRUTH:</strong> Corrects defective proofs OR replaces proofs of falsehoods with proofs of similar true theorems.</p>
              </div>
            </div>
          ) : (
            /* STANDARD BUTTONS FOR NON-MATHEMATICAL TYPES - 7 BUTTONS */
            <>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="streaming-mode"
                  checked={coherenceUseStreaming}
                  onCheckedChange={(checked) => {
                    setCoherenceUseStreaming(checked);
                    if (!checked) setCoherenceStreamingActive(false);
                  }}
                  data-testid="switch-streaming-mode"
                />
                <Label htmlFor="streaming-mode" className="text-sm text-gray-600 dark:text-gray-400">
                  Streaming Mode (see chunks one-by-one)
                </Label>
              </div>
              {coherenceUseStreaming && (
                <Badge variant="outline" className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                  WebSocket Streaming
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mb-6">
              {/* 1. ANALYZE */}
              <Button
                onClick={handleCoherenceAnalyze}
                disabled={coherenceLoading}
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                data-testid="button-analyze-coherence"
              >
                {coherenceLoading && coherenceMode === "analyze" ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />...</>
                ) : (
                  <><BarChart3 className="w-3 h-3 mr-1" />ANALYZE</>
                )}
              </Button>

              {/* 2. REWRITE */}
              <Button
                onClick={handleCoherenceRewrite}
                disabled={coherenceLoading}
                size="sm"
                className="bg-purple-500 hover:bg-purple-600 text-white text-xs"
                data-testid="button-rewrite-coherence"
              >
                {coherenceLoading && coherenceMode === "rewrite" ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />...</>
                ) : (
                  <><Sparkles className="w-3 h-3 mr-1" />REWRITE</>
                )}
              </Button>

              {/* 3. REWRITE TO MAX */}
              <Button
                onClick={handleCoherenceRewriteMax}
                disabled={coherenceLoading}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
                data-testid="button-rewrite-max-coherence"
              >
                {coherenceLoading ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />...</>
                ) : (
                  <><Sparkles className="w-3 h-3 mr-1" />REWRITE TO MAX</>
                )}
              </Button>

              {/* 4. RECONSTRUCT TO MAX */}
              <Button
                onClick={handleCoherenceReconstruct}
                disabled={coherenceLoading}
                size="sm"
                className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs"
                data-testid="button-reconstruct-coherence"
              >
                {coherenceLoading ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />...</>
                ) : (
                  <><Zap className="w-3 h-3 mr-1" />RECONSTRUCT TO MAX</>
                )}
              </Button>

              {/* 5. ANALYZE + REWRITE */}
              <Button
                onClick={handleCoherenceAnalyzeAndRewrite}
                disabled={coherenceLoading}
                size="sm"
                className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-xs"
                data-testid="button-analyze-and-rewrite-coherence"
              >
                {coherenceLoading && coherenceMode === "analyze-and-rewrite" ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />...</>
                ) : (
                  <><Zap className="w-3 h-3 mr-1" />ANALYZE + REWRITE</>
                )}
              </Button>

              {/* 6. ANALYZE + REWRITE TO MAX */}
              <Button
                onClick={handleCoherenceAnalyzeAndRewriteMax}
                disabled={coherenceLoading}
                size="sm"
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs"
                data-testid="button-analyze-and-rewrite-max-coherence"
              >
                {coherenceLoading ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />...</>
                ) : (
                  <><Zap className="w-3 h-3 mr-1" />ANALYZE + REWRITE MAX</>
                )}
              </Button>

              {/* 7. ANALYZE + RECONSTRUCT TO MAX */}
              <Button
                onClick={handleCoherenceAnalyzeAndReconstruct}
                disabled={coherenceLoading}
                size="sm"
                className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-700 hover:to-fuchsia-700 text-white text-xs"
                data-testid="button-analyze-and-reconstruct-coherence"
              >
                {coherenceLoading ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />...</>
                ) : (
                  <><Zap className="w-3 h-3 mr-1" />ANALYZE + RECONSTRUCT MAX</>
                )}
              </Button>

              {/* 8. CONTENT ANALYSIS - Evaluates richness, substantiveness, salvageability */}
              <Button
                onClick={handleContentAnalysis}
                disabled={contentAnalysisLoading || coherenceLoading}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
                data-testid="button-content-analysis"
              >
                {contentAnalysisLoading ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />...</>
                ) : (
                  <><ScanText className="w-3 h-3 mr-1" />CONTENT ANALYSIS</>
                )}
              </Button>

              {/* CLEAR BUTTON */}
              <Button
                onClick={handleCoherenceClear}
                variant="outline"
                size="sm"
                className="border-gray-300 text-xs"
                data-testid="button-clear-coherence"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear
              </Button>
              
              {/* STREAMING REWRITE BUTTON - only shown when streaming mode is enabled */}
              {coherenceUseStreaming && (
                <Button
                  onClick={() => setCoherenceStreamingActive(true)}
                  disabled={coherenceLoading || !coherenceInputText.trim() || coherenceStreamingActive}
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs border-2 border-indigo-400"
                  data-testid="button-streaming-rewrite"
                >
                  <Zap className="w-3 h-3 mr-1" />
                  STREAM REWRITE (LIVE)
                </Button>
              )}
            </div>
            
            {/* CC Streaming UI - shows chunks one by one */}
            {coherenceStreamingActive && coherenceUseStreaming && (
              <div className="mb-6">
                <CCStreamingUI
                  text={coherenceInputText}
                  customInstructions={undefined}
                  onComplete={(finalOutput, stats) => {
                    setCoherenceRewrite(finalOutput);
                    setCoherenceStreamingActive(false);
                    toast({
                      title: "Streaming Complete",
                      description: `Processed ${stats.totalChunks} chunks: ${stats.inputWords.toLocaleString()} → ${stats.outputWords.toLocaleString()} words (${stats.lengthMode})`
                    });
                  }}
                  onError={(error) => {
                    setCoherenceStreamingActive(false);
                    toast({
                      title: "Streaming Failed",
                      description: error,
                      variant: "destructive"
                    });
                  }}
                />
              </div>
            )}
            </>
          )}

          {/* Stage Progress Indicator */}
          {coherenceLoading && coherenceStageProgress && (
            <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg border-2 border-blue-400 dark:border-blue-600">
              <div className="flex items-center gap-3 mb-4">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100">Processing Long Document...</h3>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded border border-blue-300 dark:border-blue-700">
                <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-200">
                  {coherenceStageProgress}
                </pre>
              </div>
            </div>
          )}

          {/* Content Analysis Results */}
          {contentAnalysisResult && (
            <div className="mt-8 bg-amber-50 dark:bg-amber-900/20 p-6 rounded-lg border border-amber-300 dark:border-amber-700">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-xl font-bold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                  <ScanText className="w-5 h-5" />
                  Content Analysis
                </h3>
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge className={`text-sm px-3 py-1 ${
                    contentAnalysisResult.richnessAssessment === "RICH" ? "bg-emerald-600" :
                    contentAnalysisResult.richnessAssessment === "MODERATE" ? "bg-amber-500" :
                    "bg-red-500"
                  }`}>
                    Richness: {contentAnalysisResult.richnessScore}/10 ({contentAnalysisResult.richnessAssessment})
                  </Badge>
                  <Badge className={`text-sm px-3 py-1 ${
                    contentAnalysisResult.salvageability.status === "SALVAGEABLE" ? "bg-emerald-600" :
                    contentAnalysisResult.salvageability.status === "NEEDS_AUGMENTATION" ? "bg-amber-500" :
                    "bg-red-500"
                  }`}>
                    {contentAnalysisResult.salvageability.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Content Breakdown */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded border border-amber-200 dark:border-amber-700">
                  <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-3">Content Breakdown</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Concrete Examples:</span>
                      <span className={`font-medium ${
                        contentAnalysisResult.breakdown.concreteExamples.quality === "HIGH" ? "text-emerald-600" :
                        contentAnalysisResult.breakdown.concreteExamples.quality === "MEDIUM" ? "text-amber-600" :
                        contentAnalysisResult.breakdown.concreteExamples.quality === "LOW" ? "text-orange-600" :
                        "text-red-600"
                      }`}>
                        {contentAnalysisResult.breakdown.concreteExamples.count} ({contentAnalysisResult.breakdown.concreteExamples.quality})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Specific Details:</span>
                      <span className={`font-medium ${
                        contentAnalysisResult.breakdown.specificDetails.quality === "HIGH" ? "text-emerald-600" :
                        contentAnalysisResult.breakdown.specificDetails.quality === "MEDIUM" ? "text-amber-600" :
                        contentAnalysisResult.breakdown.specificDetails.quality === "LOW" ? "text-orange-600" :
                        "text-red-600"
                      }`}>
                        {contentAnalysisResult.breakdown.specificDetails.count} ({contentAnalysisResult.breakdown.specificDetails.quality})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Unique Insights:</span>
                      <span className={`font-medium ${
                        contentAnalysisResult.breakdown.uniqueInsights.quality === "HIGH" ? "text-emerald-600" :
                        contentAnalysisResult.breakdown.uniqueInsights.quality === "MEDIUM" ? "text-amber-600" :
                        contentAnalysisResult.breakdown.uniqueInsights.quality === "LOW" ? "text-orange-600" :
                        "text-red-600"
                      }`}>
                        {contentAnalysisResult.breakdown.uniqueInsights.count} ({contentAnalysisResult.breakdown.uniqueInsights.quality})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Vagueness Level:</span>
                      <span className={`font-medium ${
                        contentAnalysisResult.breakdown.vagueness.level === "LOW" ? "text-emerald-600" :
                        contentAnalysisResult.breakdown.vagueness.level === "MEDIUM" ? "text-amber-600" :
                        "text-red-600"
                      }`}>
                        {contentAnalysisResult.breakdown.vagueness.level}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Repetition Level:</span>
                      <span className={`font-medium ${
                        contentAnalysisResult.breakdown.repetition.level === "LOW" ? "text-emerald-600" :
                        contentAnalysisResult.breakdown.repetition.level === "MEDIUM" ? "text-amber-600" :
                        "text-red-600"
                      }`}>
                        {contentAnalysisResult.breakdown.repetition.level}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Substantiveness Gap */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded border border-amber-200 dark:border-amber-700">
                  <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-3">Substantiveness Gap</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span>Needs Content Addition:</span>
                      <Badge className={contentAnalysisResult.substantivenessGap.needsAddition ? "bg-amber-500" : "bg-emerald-600"}>
                        {contentAnalysisResult.substantivenessGap.needsAddition ? "YES" : "NO"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Gap Percentage:</span>
                      <span className={`font-bold ${
                        contentAnalysisResult.substantivenessGap.percentageGap <= 25 ? "text-emerald-600" :
                        contentAnalysisResult.substantivenessGap.percentageGap <= 50 ? "text-amber-600" :
                        "text-red-600"
                      }`}>
                        {contentAnalysisResult.substantivenessGap.percentageGap}%
                      </span>
                    </div>
                    {contentAnalysisResult.substantivenessGap.whatToAdd.length > 0 && (
                      <div>
                        <p className="font-medium mb-1">What to Add:</p>
                        <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-1">
                          {contentAnalysisResult.substantivenessGap.whatToAdd.slice(0, 4).map((item, i) => (
                            <li key={i} className="text-xs">{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Salvageability Details */}
              <div className="bg-white dark:bg-gray-800 p-4 rounded border border-amber-200 dark:border-amber-700 mb-4">
                <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-3">Salvageability Assessment</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {contentAnalysisResult.salvageability.salvageableElements.length > 0 && (
                    <div>
                      <p className="font-medium text-emerald-700 dark:text-emerald-400 mb-1 text-sm">Salvageable Elements:</p>
                      <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-1">
                        {contentAnalysisResult.salvageability.salvageableElements.slice(0, 3).map((item, i) => (
                          <li key={i} className="text-xs">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {contentAnalysisResult.salvageability.problematicElements.length > 0 && (
                    <div>
                      <p className="font-medium text-red-700 dark:text-red-400 mb-1 text-sm">Problematic Elements:</p>
                      <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-1">
                        {contentAnalysisResult.salvageability.problematicElements.slice(0, 3).map((item, i) => (
                          <li key={i} className="text-xs">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="mt-3 p-3 bg-amber-100 dark:bg-amber-900/30 rounded">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Recommendation:</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">{contentAnalysisResult.salvageability.recommendation}</p>
                </div>
              </div>

              {/* PIVOTAL POINTS - Crown Jewels That Must Be Preserved */}
              {contentAnalysisResult.pivotalPoints && (
                contentAnalysisResult.pivotalPoints.claims.length > 0 || 
                contentAnalysisResult.pivotalPoints.terminology.length > 0 ||
                contentAnalysisResult.pivotalPoints.relationships.length > 0 ||
                contentAnalysisResult.pivotalPoints.mustDevelop.length > 0
              ) && (
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded border-2 border-purple-400 dark:border-purple-600 mb-4">
                  <h4 className="font-bold text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
                    <span className="text-lg">PIVOTAL POINTS</span>
                    <Badge className="bg-purple-600 text-xs">DO NOT EXCLUDE</Badge>
                  </h4>
                  <p className="text-sm text-purple-700 dark:text-purple-300 mb-4 italic">
                    These are the crown jewels of this text. Any reconstruction MUST preserve and develop these.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {contentAnalysisResult.pivotalPoints.claims.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 p-3 rounded border border-purple-300 dark:border-purple-700">
                        <p className="font-semibold text-purple-800 dark:text-purple-200 mb-2 text-sm">Pivotal Claims (Preserve Verbatim):</p>
                        <ul className="space-y-1">
                          {contentAnalysisResult.pivotalPoints.claims.map((claim, i) => (
                            <li key={i} className="text-xs text-gray-700 dark:text-gray-300 bg-purple-100 dark:bg-purple-900/30 p-2 rounded">
                              "{claim}"
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {contentAnalysisResult.pivotalPoints.terminology.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 p-3 rounded border border-purple-300 dark:border-purple-700">
                        <p className="font-semibold text-purple-800 dark:text-purple-200 mb-2 text-sm">Pivotal Terminology (Must Use):</p>
                        <div className="flex flex-wrap gap-1">
                          {contentAnalysisResult.pivotalPoints.terminology.map((term, i) => (
                            <Badge key={i} className="bg-purple-500 text-xs">{term}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {contentAnalysisResult.pivotalPoints.relationships.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 p-3 rounded border border-purple-300 dark:border-purple-700">
                        <p className="font-semibold text-purple-800 dark:text-purple-200 mb-2 text-sm">Pivotal Relationships (Must Explain):</p>
                        <ul className="space-y-1">
                          {contentAnalysisResult.pivotalPoints.relationships.map((rel, i) => (
                            <li key={i} className="text-xs text-gray-700 dark:text-gray-300">- {rel}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {contentAnalysisResult.pivotalPoints.mustDevelop.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 p-3 rounded border border-purple-300 dark:border-purple-700">
                        <p className="font-semibold text-purple-800 dark:text-purple-200 mb-2 text-sm">Must Develop in Output:</p>
                        <ul className="space-y-1">
                          {contentAnalysisResult.pivotalPoints.mustDevelop.map((dev, i) => (
                            <li key={i} className="text-xs text-gray-700 dark:text-gray-300">- {dev}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Expandable Full Analysis */}
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200">
                  View Full Analysis
                </summary>
                <div className="mt-3 bg-white dark:bg-gray-900 p-4 rounded border border-amber-200 dark:border-amber-700 max-h-64 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-sans">
                    {contentAnalysisResult.fullAnalysis}
                  </pre>
                </div>
              </details>
            </div>
          )}

          {/* Analysis Output - show for coherenceAnalysis OR mathValidityAnalysis (cogency mode) */}
          {(coherenceMode === "analyze" || coherenceMode === "analyze-and-rewrite") && (coherenceAnalysis || mathValidityAnalysis) && (
            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-xl font-bold text-indigo-900 dark:text-indigo-100">
                  {coherenceIsScientific ? "Scientific-Explanatory Analysis" : 
                   coherenceIsMathematical ? (mathValidityAnalysis && !coherenceAnalysis ? "Mathematical Cogency Analysis" : "Mathematical Proof Analysis") : "Coherence Analysis"}
                </h3>
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Mathematical dual scores: Coherence + Validity */}
                  {coherenceIsMathematical && coherenceScore !== null && mathValidityScore !== null && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Coherence:</span>
                        <Badge className={`px-2 py-1 ${
                          coherenceAssessment === "PASS" ? "bg-blue-600" :
                          coherenceAssessment === "WEAK" ? "bg-blue-400" :
                          "bg-blue-800"
                        }`}>
                          {coherenceScore}/10
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Validity:</span>
                        <Badge className={`px-2 py-1 ${
                          mathValidityVerdict === "VALID" ? "bg-emerald-600" :
                          mathValidityVerdict === "FLAWED" ? "bg-yellow-500" :
                          "bg-red-600"
                        }`}>
                          {mathValidityScore}/10
                        </Badge>
                      </div>
                    </div>
                  )}
                  {/* Cogency-only score display (when no coherence analysis) */}
                  {coherenceIsMathematical && mathValidityScore !== null && coherenceScore === null && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Cogency Score:</span>
                      <Badge className={`text-lg px-3 py-1 ${
                        mathValidityVerdict === "VALID" ? "bg-green-600" :
                        mathValidityVerdict === "FLAWED" ? "bg-yellow-600" :
                        "bg-red-600"
                      }`}>
                        {mathValidityScore}/10 - {mathValidityVerdict}
                      </Badge>
                    </div>
                  )}
                  {/* Coherence-only score display (when no validity analysis) */}
                  {coherenceIsMathematical && coherenceScore !== null && mathValidityScore === null && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Coherence Score:</span>
                      <Badge className={`text-lg px-3 py-1 ${
                        coherenceAssessment === "PASS" ? "bg-green-600" :
                        coherenceAssessment === "WEAK" ? "bg-yellow-600" :
                        "bg-red-600"
                      }`}>
                        {coherenceScore}/10 - {coherenceAssessment}
                      </Badge>
                    </div>
                  )}
                  {coherenceScore !== null && !coherenceIsScientific && !coherenceIsMathematical && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">Score:</span>
                      <Badge className={`text-lg px-3 py-1 ${
                        coherenceAssessment === "PASS" ? "bg-green-600" :
                        coherenceAssessment === "WEAK" ? "bg-yellow-600" :
                        "bg-red-600"
                      }`}>
                        {coherenceScore}/10 - {coherenceAssessment}
                      </Badge>
                      {detectedCoherenceType && (
                        <Badge variant="outline" className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-400">
                          Auto-Detected: {detectedCoherenceType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </Badge>
                      )}
                    </div>
                  )}
                  {coherenceIsScientific && coherenceLogicalScore && coherenceScientificScore && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Overall:</span>
                        <Badge className={`px-2 py-1 ${
                          coherenceAssessment === "PASS" ? "bg-green-600" :
                          coherenceAssessment === "WEAK" ? "bg-yellow-600" :
                          "bg-red-600"
                        }`}>
                          {coherenceScore}/10
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Logical:</span>
                        <Badge className={`px-2 py-1 ${
                          coherenceLogicalScore.assessment === "PASS" ? "bg-blue-600" :
                          coherenceLogicalScore.assessment === "WEAK" ? "bg-blue-400" :
                          "bg-blue-800"
                        }`}>
                          {coherenceLogicalScore.score}/10
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Scientific:</span>
                        <Badge className={`px-2 py-1 ${
                          coherenceScientificScore.assessment === "PASS" ? "bg-purple-600" :
                          coherenceScientificScore.assessment === "WEAK" ? "bg-purple-400" :
                          "bg-purple-800"
                        }`}>
                          {coherenceScientificScore.score}/10
                        </Badge>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadText(coherenceAnalysis, `coherence-analysis-${coherenceType}.txt`)}
                      data-testid="button-download-coherence-analysis"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                    <CopyButton text={coherenceAnalysis} />
                    <SendToButton
                      text={coherenceAnalysis}
                      onSendToIntelligence={(text) => {
                        setDocumentA({ ...documentA, content: text });
                        toast({
                          title: "Analysis sent to Intelligence Analysis",
                          description: "Coherence analysis has been sent to the intelligence analysis input"
                        });
                      }}
                      onSendToHumanizer={(text) => {
                        setBoxA(text);
                        toast({
                          title: "Analysis sent to Humanizer",
                          description: "Coherence analysis has been sent to the Humanizer input box"
                        });
                      }}
                      onSendToChat={(text) => {
                        toast({
                          title: "Analysis available to Chat",
                          description: "The coherence analysis is now available as context for AI chat"
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
              {/* Show coherence analysis text only if there is coherence analysis */}
              {coherenceAnalysis && (
                <div className="space-y-2">
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-indigo-200 dark:border-indigo-700">
                    <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 dark:text-gray-200">
                      {coherenceAnalysis}
                    </pre>
                  </div>
                  <TextStats text={coherenceAnalysis} showAiDetect={true} variant="compact" />
                </div>
              )}
              
              {/* Scientific Inaccuracies Section */}
              {coherenceIsScientific && coherenceScientificScore && coherenceScientificScore.inaccuracies.length > 0 && (
                <div className="mt-6 bg-red-50 dark:bg-red-900/20 p-6 rounded-lg border-2 border-red-300 dark:border-red-700">
                  <h4 className="text-lg font-bold text-red-900 dark:text-red-100 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Scientific Inaccuracies Found ({coherenceScientificScore.inaccuracies.length})
                  </h4>
                  <ul className="space-y-2">
                    {coherenceScientificScore.inaccuracies.map((inaccuracy, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-red-800 dark:text-red-200">
                        <span className="font-bold text-red-600 dark:text-red-400">{idx + 1}.</span>
                        <span>{inaccuracy}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Mathematical Proof Veridicality Analysis Section */}
              {coherenceIsMathematical && mathValidityAnalysis && (
                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100">
                      Proof Veridicality Analysis (Is the theorem actually TRUE?)
                    </h3>
                    <div className="flex items-center gap-4 flex-wrap">
                      {mathValidityScore !== null && mathValidityVerdict && (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Validity Score:</span>
                            <Badge className={`text-lg px-3 py-1 ${
                              mathValidityVerdict === "VALID" ? "bg-green-600" :
                              mathValidityVerdict === "FLAWED" ? "bg-yellow-600" :
                              "bg-red-600"
                            }`}>
                              {mathValidityScore}/10 - {mathValidityVerdict}
                            </Badge>
                          </div>
                        </div>
                      )}
                      {/* Copy All Cogency Results Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const fullOutput = [
                            `MATHEMATICAL COGENCY ANALYSIS`,
                            `=============================`,
                            ``,
                            `COGENCY SCORE: ${mathValidityScore}/10 - ${mathValidityVerdict}`,
                            ``,
                            mathValiditySubscores ? `SUBSCORES:` : '',
                            mathValiditySubscores ? `- Claim Truth: ${mathValiditySubscores.claimTruth}/10` : '',
                            mathValiditySubscores ? `- Inference Validity: ${mathValiditySubscores.inferenceValidity}/10` : '',
                            mathValiditySubscores ? `- Boundary Conditions: ${mathValiditySubscores.boundaryConditions}/10` : '',
                            mathValiditySubscores ? `- Overall Soundness: ${mathValiditySubscores.overallSoundness}/10` : '',
                            ``,
                            mathValidityCounterexamples.length > 0 ? `COUNTEREXAMPLES FOUND (${mathValidityCounterexamples.length}):` : '',
                            ...mathValidityCounterexamples.map((ce, idx) => `${idx + 1}. ${ce}`),
                            ``,
                            mathValidityFlaws.length > 0 ? `MATHEMATICAL FLAWS IDENTIFIED (${mathValidityFlaws.length}):` : '',
                            ...mathValidityFlaws.map((flaw, idx) => `${idx + 1}. ${flaw}`),
                            ``,
                            `DETAILED ANALYSIS:`,
                            `------------------`,
                            mathValidityAnalysis
                          ].filter(line => line !== '').join('\n');
                          
                          navigator.clipboard.writeText(fullOutput);
                          toast({
                            title: "Copied!",
                            description: "Full cogency analysis copied to clipboard"
                          });
                        }}
                        className="bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-800/50 border-emerald-300"
                        data-testid="button-copy-all-cogency"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy All Results
                      </Button>
                    </div>
                  </div>
                  
                  {/* Validity Subscores */}
                  {mathValiditySubscores && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg border border-emerald-200 dark:border-emerald-700">
                      <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-100 mb-3">Veridicality Subscores:</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-muted-foreground">Claim Truth</span>
                          <Badge className={`${
                            mathValiditySubscores.claimTruth >= 7 ? "bg-green-500" :
                            mathValiditySubscores.claimTruth >= 4 ? "bg-yellow-500" :
                            "bg-red-500"
                          }`}>
                            {mathValiditySubscores.claimTruth}/10
                          </Badge>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-muted-foreground">Inference Validity</span>
                          <Badge className={`${
                            mathValiditySubscores.inferenceValidity >= 7 ? "bg-green-500" :
                            mathValiditySubscores.inferenceValidity >= 4 ? "bg-yellow-500" :
                            "bg-red-500"
                          }`}>
                            {mathValiditySubscores.inferenceValidity}/10
                          </Badge>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-muted-foreground">Boundary Conditions</span>
                          <Badge className={`${
                            mathValiditySubscores.boundaryConditions >= 7 ? "bg-green-500" :
                            mathValiditySubscores.boundaryConditions >= 4 ? "bg-yellow-500" :
                            "bg-red-500"
                          }`}>
                            {mathValiditySubscores.boundaryConditions}/10
                          </Badge>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-muted-foreground">Overall Soundness</span>
                          <Badge className={`${
                            mathValiditySubscores.overallSoundness >= 7 ? "bg-green-500" :
                            mathValiditySubscores.overallSoundness >= 4 ? "bg-yellow-500" :
                            "bg-red-500"
                          }`}>
                            {mathValiditySubscores.overallSoundness}/10
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Counterexamples Found */}
                  {mathValidityCounterexamples.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border-2 border-red-300 dark:border-red-700">
                      <h4 className="text-md font-bold text-red-900 dark:text-red-100 mb-3 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        Counterexamples Found ({mathValidityCounterexamples.length})
                      </h4>
                      <ul className="space-y-2">
                        {mathValidityCounterexamples.map((ce, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-red-800 dark:text-red-200">
                            <span className="font-bold text-red-600 dark:text-red-400">{idx + 1}.</span>
                            <span>{ce}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* Mathematical Flaws */}
                  {mathValidityFlaws.length > 0 && (
                    <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border-2 border-orange-300 dark:border-orange-700">
                      <h4 className="text-md font-bold text-orange-900 dark:text-orange-100 mb-3 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        Mathematical Flaws Identified ({mathValidityFlaws.length})
                      </h4>
                      <ul className="space-y-2">
                        {mathValidityFlaws.map((flaw, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-orange-800 dark:text-orange-200">
                            <span className="font-bold text-orange-600 dark:text-orange-400">{idx + 1}.</span>
                            <span>{flaw}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* Full Validity Analysis */}
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-emerald-200 dark:border-emerald-700">
                    <h4 className="text-md font-bold text-emerald-900 dark:text-emerald-100 mb-3">Detailed Veridicality Analysis:</h4>
                    <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 dark:text-gray-200 max-h-96 overflow-y-auto">
                      {mathValidityAnalysis}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rewrite Output */}
          {(coherenceMode === "rewrite" || coherenceMode === "analyze-and-rewrite") && coherenceRewrite && (
            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-xl font-bold text-indigo-900 dark:text-indigo-100">
                    {coherenceIsScientific ? "Scientifically Corrected Version" : "Rewritten Version"}
                  </h3>
                  {coherenceRewriteAccuracyScore !== null && (
                    <Badge 
                      className={`text-sm ${
                        coherenceRewriteAccuracyScore >= 8 ? 'bg-green-500 hover:bg-green-600' :
                        coherenceRewriteAccuracyScore >= 5 ? 'bg-yellow-500 hover:bg-yellow-600' :
                        'bg-red-500 hover:bg-red-600'
                      } text-white`}
                    >
                      Scientific Accuracy: {coherenceRewriteAccuracyScore}/10
                    </Badge>
                  )}
                  {detectedCoherenceType && (
                    <Badge variant="outline" className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-400">
                      Auto-Detected: {detectedCoherenceType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadText(coherenceRewrite, `coherence-rewrite-${coherenceType}.txt`)}
                    data-testid="button-download-coherence-rewrite"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <CopyButton text={coherenceRewrite} />
                  <SendToButton
                    text={coherenceRewrite}
                    onSendToIntelligence={(text) => {
                      setDocumentA({ ...documentA, content: text });
                      toast({
                        title: "Text sent to Intelligence Analysis",
                        description: "Rewritten text has been sent to the intelligence analysis input"
                      });
                    }}
                    onSendToHumanizer={(text) => {
                      setBoxA(text);
                      toast({
                        title: "Text sent to Humanizer",
                        description: "Rewritten text has been sent to the Humanizer input box"
                      });
                    }}
                    onSendToChat={(text) => {
                      toast({
                        title: "Text available to Chat",
                        description: "The rewritten text is now available as context for AI chat"
                      });
                    }}
                  />
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-indigo-200 dark:border-indigo-700 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 dark:text-gray-200">
                  {coherenceRewrite}
                </pre>
              </div>
              <TextStats text={coherenceRewrite} showAiDetect={true} variant="compact" />

              {/* Refine Coherence Rewrite Section */}
              <div className="mt-4 p-4 bg-indigo-100 dark:bg-indigo-800/30 rounded-lg border border-indigo-300 dark:border-indigo-600">
                <h4 className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 mb-3 flex items-center gap-2">
                  <FileEdit className="w-4 h-4" />
                  Refine Output (Adjust Word Count / Modify)
                </h4>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[120px] max-w-[160px]">
                    <label className="block text-xs text-indigo-700 dark:text-indigo-300 mb-1">
                      Target Words
                    </label>
                    <input
                      type="number"
                      value={refineCoherenceWordCount}
                      onChange={(e) => setRefineCoherenceWordCount(e.target.value)}
                      placeholder="e.g., 800"
                      className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                      data-testid="input-refine-coherence-word-count"
                    />
                  </div>
                  <div className="flex-[2] min-w-[200px]">
                    <label className="block text-xs text-indigo-700 dark:text-indigo-300 mb-1">
                      Custom Instructions
                    </label>
                    <input
                      type="text"
                      value={refineCoherenceInstructions}
                      onChange={(e) => setRefineCoherenceInstructions(e.target.value)}
                      placeholder="e.g., More examples, shorter sentences, add a quote from Aristotle"
                      className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                      data-testid="input-refine-coherence-instructions"
                    />
                  </div>
                  <Button
                    onClick={handleRefineCoherence}
                    disabled={refineCoherenceLoading || (!refineCoherenceWordCount && !refineCoherenceInstructions)}
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    data-testid="button-refine-coherence"
                  >
                    {refineCoherenceLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        Refining...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Refine
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2">
                  Current: ~{coherenceRewrite.trim().split(/\s+/).length} words
                </p>
              </div>

              {/* Scientific Corrections Applied */}
              {coherenceIsScientific && coherenceCorrectionsApplied.length > 0 && (
                <div className="mt-6 bg-green-50 dark:bg-green-900/20 p-6 rounded-lg border-2 border-green-300 dark:border-green-700">
                  <h4 className="text-lg font-bold text-green-900 dark:text-green-100 mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Scientific Corrections Applied ({coherenceCorrectionsApplied.length})
                  </h4>
                  <ul className="space-y-2">
                    {coherenceCorrectionsApplied.map((correction, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-green-800 dark:text-green-200">
                        <span className="font-bold text-green-600 dark:text-green-400">{idx + 1}.</span>
                        <span>{correction}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Changes Made */}
              {coherenceChanges && (
                <div className="mt-6">
                  <h4 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-3">
                    {coherenceIsScientific ? "Scientific Accuracy Changes" : "Changes Made"}
                  </h4>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-lg border border-indigo-200 dark:border-indigo-700">
                    <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 dark:text-gray-200">
                      {coherenceChanges}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Math Proof Correction Output */}
          {mathProofIsCorrected && mathProofCorrectedProof && (
            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100">
                    Corrected Mathematical Proof
                  </h3>
                  <Badge 
                    className={`text-sm ${
                      mathProofTheoremStatus === "TRUE" ? 'bg-green-500 hover:bg-green-600' :
                      mathProofTheoremStatus === "PARTIALLY_TRUE" ? 'bg-yellow-500 hover:bg-yellow-600' :
                      'bg-orange-500 hover:bg-orange-600'
                    } text-white`}
                  >
                    Theorem: {mathProofTheoremStatus === "TRUE" ? "TRUE" : 
                              mathProofTheoremStatus === "PARTIALLY_TRUE" ? "PARTIALLY TRUE" : 
                              "FALSE (Corrected)"}
                  </Badge>
                  {mathProofValidityScore !== null && (
                    <Badge 
                      className={`text-sm ${
                        mathProofValidityScore >= 8 ? 'bg-green-500 hover:bg-green-600' :
                        mathProofValidityScore >= 5 ? 'bg-yellow-500 hover:bg-yellow-600' :
                        'bg-red-500 hover:bg-red-600'
                      } text-white`}
                    >
                      Proof Validity: {mathProofValidityScore}/10
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadText(mathProofCorrectedProof, `corrected-math-proof.txt`)}
                    data-testid="button-download-math-proof"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <CopyButton text={mathProofCorrectedProof} />
                </div>
              </div>

              {/* Original Theorem */}
              {mathProofOriginalTheorem && (
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Original Theorem:</h4>
                  <p className="text-sm text-gray-800 dark:text-gray-200 font-mono">{mathProofOriginalTheorem}</p>
                </div>
              )}

              {/* Corrected Theorem (if theorem was false) */}
              {mathProofCorrectedTheorem && (
                <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border-2 border-orange-300 dark:border-orange-700">
                  <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-300 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Corrected Theorem (Original was FALSE):
                  </h4>
                  <p className="text-sm text-orange-800 dark:text-orange-200 font-mono">{mathProofCorrectedTheorem}</p>
                </div>
              )}

              {/* Proof Strategy */}
              {mathProofStrategy && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
                  <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">Proof Strategy:</h4>
                  <p className="text-sm text-blue-800 dark:text-blue-200">{mathProofStrategy}</p>
                </div>
              )}

              {/* The Corrected Proof */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border-2 border-emerald-300 dark:border-emerald-700">
                <h4 className="text-lg font-bold text-emerald-900 dark:text-emerald-100 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  Rigorous Proof
                </h4>
                <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-200 overflow-x-auto">
                  {mathProofCorrectedProof}
                </pre>
              </div>

              {/* Key Corrections */}
              {mathProofKeyCorrections.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-lg border-2 border-amber-300 dark:border-amber-700">
                  <h4 className="text-lg font-bold text-amber-900 dark:text-amber-100 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Key Corrections Made ({mathProofKeyCorrections.length})
                  </h4>
                  <ul className="space-y-2">
                    {mathProofKeyCorrections.map((correction, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                        <span className="font-bold text-amber-600 dark:text-amber-400">{idx + 1}.</span>
                        <span>{correction}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Loading State */}
          {coherenceLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                {coherenceMode === "analyze" ? "Analyzing text coherence..." : "Rewriting text for maximum coherence..."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* GPT BYPASS HUMANIZER - Following Exact Protocol - HIDDEN BY USER REQUEST */}
      <div className="hidden mt-16 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/10 dark:to-purple-900/10 p-8 rounded-lg border-2 border-blue-200 dark:border-blue-700">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-blue-900 dark:text-blue-100 mb-3 flex items-center justify-center gap-3">
              <Shield className="w-8 h-8 text-blue-600" />
              GPT Bypass Humanizer
            </h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">
              Transform AI text into undetectable human writing with surgical precision
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Box A: AI Text → Box B: Human Style Sample → Box C: Humanized Output
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-4">
            {/* Left Column - Writing Samples & Style Presets */}
            <div className="lg:col-span-1 space-y-6">
              {/* Writing Samples Dropdown */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-blue-800 dark:text-blue-200">
                  Writing Samples
                </label>
                <Select value={selectedWritingSample} onValueChange={(value) => {
                  setSelectedWritingSample(value);
                  const [category, sample] = value.split('|');
                  if (writingSamples[category] && writingSamples[category][sample]) {
                    setBoxB(writingSamples[category][sample]);
                  }
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose writing sample...">
                      {selectedWritingSample ? selectedWritingSample.split('|')[1] : "Choose writing sample..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {Object.entries(writingSamples).map(([category, samples]) => (
                      <div key={category}>
                        <div className="px-2 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 uppercase bg-gray-100 dark:bg-gray-800">
                          {category.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        {Object.keys(samples as object).map((sampleName) => (
                          <SelectItem key={`${category}|${sampleName}`} value={`${category}|${sampleName}`}>
                            {sampleName}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Style Presets */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-blue-800 dark:text-blue-200">
                  Style Presets
                </label>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-blue-200 dark:border-blue-700 max-h-96 overflow-y-auto">
                  {/* Most Important (1-8) */}
                  <div className="mb-4">
                    <h4 className="text-xs font-bold text-green-700 dark:text-green-300 mb-2 uppercase bg-green-50 dark:bg-green-900/20 p-2 rounded">
                      ⭐ Most Important for Humanizing (1-8)
                    </h4>
                    <div className="space-y-2">
                      {[
                        "Mixed cadence + clause sprawl",
                        "Asymmetric emphasis", 
                        "One aside",
                        "Hedge twice",
                        "Local disfluency",
                        "Analogy injection",
                        "Topic snap",
                        "Friction detail"
                      ].map((preset) => (
                        <label key={preset} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/10 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={selectedStylePresets.includes(preset)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStylePresets([...selectedStylePresets, preset]);
                              } else {
                                setSelectedStylePresets(selectedStylePresets.filter(p => p !== preset));
                              }
                            }}
                            className="mt-0.5"
                          />
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">{preset}</div>
                            <div className="text-gray-600 dark:text-gray-400">{stylePresets[preset]}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Other Style Techniques */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase">Additional Techniques</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {Object.entries(stylePresets).filter(([preset]) => ![
                        "Mixed cadence + clause sprawl",
                        "Asymmetric emphasis", 
                        "One aside",
                        "Hedge twice",
                        "Local disfluency",
                        "Analogy injection",
                        "Topic snap",
                        "Friction detail"
                      ].includes(preset)).map(([preset, description]) => (
                        <label key={preset} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={selectedStylePresets.includes(preset)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStylePresets([...selectedStylePresets, preset]);
                              } else {
                                setSelectedStylePresets(selectedStylePresets.filter(p => p !== preset));
                              }
                            }}
                            className="mt-0.5"
                          />
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">{preset}</div>
                            <div className="text-gray-600 dark:text-gray-400">{String(description)}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* LLM Provider Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-blue-800 dark:text-blue-200">
                  AI Provider
                </label>
                <Select value={humanizerProvider} onValueChange={(value) => setHumanizerProvider(value as LLMProvider)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zhi2">ZHI 2 - Default</SelectItem>
                    <SelectItem value="zhi1">ZHI 1</SelectItem>
                    <SelectItem value="zhi3">ZHI 3</SelectItem>
                    <SelectItem value="zhi4">ZHI 4</SelectItem>
                    <SelectItem value="zhi5">ZHI 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Center & Right Columns - Main Boxes */}
            <div className="lg:col-span-3 space-y-6">
              {/* Top Row - Box A and Box B */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Box A - AI Text Input */}
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-blue-800 dark:text-blue-200">
                    Box A - AI-Generated Text to Humanize
                    {boxAScore !== null && (
                      <span className={`ml-2 px-3 py-1 text-sm rounded font-bold ${
                        boxAScore >= 70 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 
                        boxAScore >= 50 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : 
                        'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}>
                        {boxAScore}% HUMAN
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <Textarea
                      value={boxA}
                      onChange={(e) => {
                        setBoxA(e.target.value);
                        if (e.target.value.length > 100) {
                          debounce(() => evaluateTextAI(e.target.value, setBoxAScore), 2000)();
                        }
                      }}
                      placeholder="Paste or upload AI-generated text here that needs to be humanized..."
                      className="min-h-[300px] border-blue-200 dark:border-blue-700 focus:border-blue-500 dark:focus:border-blue-400 pr-12"
                      data-testid="textarea-box-a"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 hover:bg-blue-100 dark:hover:bg-blue-800"
                      onClick={() => {
                        document.getElementById('file-upload-a')?.click();
                      }}
                      data-testid="button-upload-box-a"
                    >
                      <Upload className="w-4 h-4" />
                    </Button>
                    <input
                      id="file-upload-a"
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, setBoxA);
                      }}
                    />
                  </div>
                  
                  {/* Chunk Text Button for Large Documents */}
                  {boxA.length > 3000 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleChunkText(boxA)}
                      className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                      data-testid="button-chunk-box-a"
                    >
                      <FileText className="w-3 h-3 mr-1" />
                      Chunk Large Text (1000 words)
                    </Button>
                  )}
                </div>

                {/* Box B - Human Style Sample */}
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-blue-800 dark:text-blue-200">
                    Box B - Human Writing Style Sample
                    {boxBScore !== null && (
                      <span className={`ml-2 px-3 py-1 text-sm rounded font-bold ${
                        boxBScore >= 70 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 
                        boxBScore >= 50 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : 
                        'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}>
                        {boxBScore}% HUMAN
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <Textarea
                      value={boxB}
                      onChange={(e) => {
                        setBoxB(e.target.value);
                        if (e.target.value.length > 100) {
                          debounce(() => evaluateTextAI(e.target.value, setBoxBScore), 2000)();
                        }
                      }}
                      placeholder="Paste or upload human-written text whose style you want to mimic..."
                      className="min-h-[300px] border-blue-200 dark:border-blue-700 focus:border-blue-500 dark:focus:border-blue-400 pr-12"
                      data-testid="textarea-box-b"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 hover:bg-blue-100 dark:hover:bg-blue-800"
                      onClick={() => {
                        document.getElementById('file-upload-b')?.click();
                      }}
                      data-testid="button-upload-box-b"
                    >
                      <Upload className="w-4 h-4" />
                    </Button>
                    <input
                      id="file-upload-b"
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, setBoxB);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Custom Instructions Box - Under Box A */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-blue-800 dark:text-blue-200">
                  Custom Instructions (Optional)
                </label>
                <Textarea
                  value={humanizerCustomInstructions}
                  onChange={(e) => setHumanizerCustomInstructions(e.target.value)}
                  placeholder="Enter specific instructions for the rewrite (e.g., 'maintain technical terminology', 'use more casual tone', 'preserve all statistics')..."
                  className="min-h-[120px] border-blue-200 dark:border-blue-700 focus:border-blue-500 dark:focus:border-blue-400"
                  rows={4}
                  data-testid="textarea-custom-instructions"
                />
              </div>

              {/* Action Button */}
              <div className="flex justify-center">
                <Button
                  onClick={handleHumanize}
                  disabled={isHumanizerLoading || !boxA.trim() || !boxB.trim()}
                  className="px-12 py-4 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 text-lg font-semibold"
                  data-testid="button-humanize"
                >
                  {isHumanizerLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                      Humanizing with Surgical Precision...
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5 mr-3" />
                      Humanize Text
                    </>
                  )}
                </Button>
              </div>

              {/* Box C - Large Output */}
              {boxC && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="block text-sm font-semibold text-blue-800 dark:text-blue-200">
                      Box C - Humanized Output
                      {boxCScore !== null && (
                        <span className={`ml-2 px-3 py-1 text-sm rounded font-bold ${
                          boxCScore >= 70 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 
                          boxCScore >= 50 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : 
                          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {boxCScore}% HUMAN
                        </span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <CopyButton text={boxC} />
                      <SendToButton 
                        text={boxC}
                        onSendToIntelligence={handleSendToIntelligence}
                        onSendToChat={handleSendToChat}
                      />
                    </div>
                  </div>
                  <Textarea
                    value={boxC}
                    onChange={(e) => setBoxC(e.target.value)}
                    className="min-h-[500px] border-green-200 dark:border-green-700 focus:border-green-500 dark:focus:border-green-400 bg-green-50/50 dark:bg-green-900/10"
                    data-testid="textarea-box-c"
                    readOnly
                  />
                  
                  {/* Re-rewrite Function & Download Options - Under Box C */}
                  <div className="flex flex-wrap gap-3 justify-between items-center bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                    <div className="flex gap-3">
                      <Button
                        onClick={handleReRewrite}
                        disabled={isReRewriteLoading || !boxC.trim()}
                        variant="outline"
                        className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-300"
                        data-testid="button-re-rewrite"
                      >
                        {isReRewriteLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Re-rewriting...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Re-rewrite (Recursive)
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => {
                          setBoxA("");
                          setBoxB("");
                          setBoxC("");
                          setBoxAScore(null);
                          setBoxBScore(null);
                          setBoxCScore(null);
                          setHumanizerCustomInstructions("");
                          setSelectedStylePresets([]);
                        }}
                        variant="outline"
                        className="border-gray-300 text-gray-700 hover:bg-gray-50"
                        data-testid="button-clear-all"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Clear All
                      </Button>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        onClick={() => downloadHumanizerResult('txt')}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        data-testid="button-download-txt"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        TXT
                      </Button>
                      <Button
                        onClick={() => downloadHumanizerResult('pdf')}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        data-testid="button-download-pdf"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        PDF
                      </Button>
                      <Button
                        onClick={() => downloadHumanizerResult('docx')}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        data-testid="button-download-docx"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Word
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Screenplay Generator Section */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-purple-200 dark:border-purple-800 p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <Film className="w-6 h-6 text-purple-600" />
            <h2 className="text-xl font-bold text-purple-800 dark:text-purple-200">Screenplay Generator</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearScreenplay}
            className="text-gray-500 hover:text-gray-700"
            data-testid="button-clear-screenplay"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Clear All
          </Button>
        </div>
        
        <p className="text-sm text-purple-600 dark:text-purple-400 mb-4">
          Convert source material into a properly formatted screenplay with three-act structure, scene headings, action lines, and dialogue.
        </p>
        
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-purple-700 dark:text-purple-300">
                Source Material (story concept, notes, outline, or any content)
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => document.getElementById('screenplay-file-upload')?.click()}
                className="text-purple-600 hover:text-purple-700"
                data-testid="button-upload-screenplay"
              >
                <Upload className="w-4 h-4 mr-1" />
                Upload document
              </Button>
              <input
                id="screenplay-file-upload"
                type="file"
                accept=".txt,.doc,.docx,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleGeneratorFileUpload(file, setScreenplayInputText);
                }}
              />
            </div>
            <div
              className={`relative ${screenplayDragOver ? 'ring-2 ring-purple-400 bg-purple-50 dark:bg-purple-900/20' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setScreenplayDragOver(true); }}
              onDragLeave={() => setScreenplayDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setScreenplayDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleGeneratorFileUpload(file, setScreenplayInputText);
              }}
            >
              <Textarea
                value={screenplayInputText}
                onChange={(e) => setScreenplayInputText(e.target.value)}
                placeholder="Paste or upload your source material here (story concept, notes, outline, character sketches, etc.)..."
                className="min-h-[120px] border-purple-300 dark:border-purple-700 focus:border-purple-500"
                data-testid="textarea-screenplay-input"
              />
            </div>
            {screenplayInputText && (
              <p className="text-xs text-purple-500 mt-1">
                Source: {screenplayInputText.trim().split(/\s+/).length.toLocaleString()} words
              </p>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-purple-700 dark:text-purple-300 mb-2">
                Target Word Count
              </label>
              <Input
                type="number"
                value={screenplayTargetWords}
                onChange={(e) => setScreenplayTargetWords(e.target.value)}
                placeholder="20000"
                className="border-purple-300 dark:border-purple-700"
                data-testid="input-screenplay-target-words"
              />
              <p className="text-xs text-purple-500 mt-1">Default: 20,000 words. Structural beats scale proportionally.</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-purple-700 dark:text-purple-300 mb-2">
                Custom Instructions (optional)
              </label>
              <Input
                value={screenplayCustomInstructions}
                onChange={(e) => setScreenplayCustomInstructions(e.target.value)}
                placeholder="e.g., dark thriller tone, focus on protagonist's internal conflict..."
                className="border-purple-300 dark:border-purple-700"
                data-testid="input-screenplay-instructions"
              />
            </div>
          </div>
          
          <Button
            onClick={handleGenerateScreenplay}
            disabled={screenplayLoading || !screenplayInputText.trim()}
            className="w-full"
            data-testid="button-generate-screenplay"
          >
            {screenplayLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Screenplay...
              </>
            ) : (
              <>
                <Film className="w-4 h-4 mr-2" />
                Generate Screenplay
              </>
            )}
          </Button>
          
          {screenplayOutput && (
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-semibold text-purple-700 dark:text-purple-300">
                  Generated Screenplay
                </label>
                <div className="flex items-center gap-2 text-xs text-purple-600">
                  {screenplayWordCount && (
                    <span>{screenplayWordCount.toLocaleString()} words</span>
                  )}
                  {screenplayProcessingTime && (
                    <span>({Math.round(screenplayProcessingTime / 1000)}s)</span>
                  )}
                </div>
              </div>
              
              {screenplayStructure && (
                <div className="flex gap-4 mb-2 text-xs text-purple-600 dark:text-purple-400">
                  <span>Act I: ~{screenplayStructure.actOneWords.toLocaleString()} words (25%)</span>
                  <span>Act II: ~{screenplayStructure.actTwoWords.toLocaleString()} words (50%)</span>
                  <span>Act III: ~{screenplayStructure.actThreeWords.toLocaleString()} words (25%)</span>
                </div>
              )}
              
              <Textarea
                value={screenplayOutput}
                readOnly
                className="min-h-[400px] font-mono text-sm border-purple-300 dark:border-purple-700 bg-gray-50 dark:bg-gray-800"
                data-testid="textarea-screenplay-output"
              />
              
              <div className="flex gap-2 mt-2">
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(screenplayOutput);
                    toast({ title: "Copied", description: "Screenplay copied to clipboard" });
                  }}
                  variant="outline"
                  size="sm"
                  data-testid="button-copy-screenplay"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </Button>
                <Button
                  onClick={() => handleSendToHumanizer(screenplayOutput)}
                  variant="outline"
                  size="sm"
                  data-testid="button-send-screenplay-humanizer"
                >
                  <Send className="w-3 h-3 mr-1" />
                  To Humanizer
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Test Strict Outline Generator Section */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-amber-200 dark:border-amber-800 p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-amber-600" />
            <h2 className="text-xl font-bold text-amber-800 dark:text-amber-200">Test Strict Outline Generator</h2>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300">Debug Tool</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={outlineLLM} onValueChange={(v) => setOutlineLLM(v as "openai" | "anthropic" | "deepseek")}>
              <SelectTrigger className="w-[140px] h-9 border-amber-300" data-testid="select-outline-llm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">GPT-4o</SelectItem>
                <SelectItem value="anthropic">Claude</SelectItem>
                <SelectItem value="deepseek">DeepSeek</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearOutline}
              className="text-gray-500 hover:text-gray-700"
              data-testid="button-clear-outline"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-amber-700 dark:text-amber-300">
                Source Document (drag & drop text file here)
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => document.getElementById('outline-file-upload')?.click()}
                className="text-amber-600 hover:text-amber-700"
                data-testid="button-upload-outline"
              >
                <Upload className="w-4 h-4 mr-1" />
                Upload document
              </Button>
              <input
                id="outline-file-upload"
                type="file"
                accept=".txt,.doc,.docx,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleGeneratorFileUpload(file, setOutlineInputText);
                }}
              />
            </div>
            <div
              className={`relative ${outlineDragOver ? 'ring-2 ring-amber-400 bg-amber-50 dark:bg-amber-900/20' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOutlineDragOver(true); }}
              onDragLeave={() => setOutlineDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOutlineDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleGeneratorFileUpload(file, setOutlineInputText);
              }}
            >
              <Textarea
                value={outlineInputText}
                onChange={(e) => setOutlineInputText(e.target.value)}
                placeholder="Paste or upload your source document here..."
                className="min-h-[120px] border-amber-200 dark:border-amber-700 focus:border-amber-400"
                data-testid="textarea-outline-input"
              />
            </div>
            {outlineInputText && (
              <div className="text-xs text-gray-500 mt-1">
                {outlineInputText.length} characters
              </div>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">
              Optional Instructions (leave empty for auto-summary with analysis)
            </label>
            <Textarea
              value={outlinePrompt}
              onChange={(e) => setOutlinePrompt(e.target.value)}
              placeholder="Optional: e.g., 'Create a strict outline' - leave empty for automatic summary with analysis"
              className="min-h-[80px] border-amber-200 dark:border-amber-700 focus:border-amber-400"
              data-testid="textarea-outline-prompt"
            />
          </div>
          
          <Button
            onClick={handleGenerateOutline}
            disabled={outlineLoading || !outlineInputText.trim()}
            className="w-full py-6 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-lg"
            data-testid="button-generate-outline"
          >
            {outlineLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Generating Strict Outline...
              </>
            ) : (
              <>
                <FileText className="w-5 h-5 mr-2" />
                Generate Strict Outline
              </>
            )}
          </Button>
          
          {outlineOutput && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-semibold text-amber-700 dark:text-amber-300">
                  Generated Outline
                </label>
                <CopyButton text={outlineOutput} />
              </div>
              <Textarea
                value={outlineOutput}
                readOnly
                className="min-h-[300px] bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-700"
                data-testid="textarea-outline-output"
              />
            </div>
          )}
        </div>
      </div>

      {/* Full Document Generator Section */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-blue-200 dark:border-blue-800 p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-blue-800 dark:text-blue-200">Full Document Generator</h2>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300">Pipeline Test</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={docGenLLM} onValueChange={(v) => setDocGenLLM(v as "openai" | "anthropic" | "deepseek")}>
              <SelectTrigger className="w-[140px] h-9 border-blue-300" data-testid="select-docgen-llm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">GPT-4o</SelectItem>
                <SelectItem value="anthropic">Claude</SelectItem>
                <SelectItem value="deepseek">DeepSeek</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearDocGen}
              className="text-gray-500 hover:text-gray-700"
              data-testid="button-clear-docgen"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-blue-700 dark:text-blue-300">
                Source Document (drag & drop text file here)
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => document.getElementById('docgen-file-upload')?.click()}
                className="text-blue-600 hover:text-blue-700"
                data-testid="button-upload-docgen"
              >
                <Upload className="w-4 h-4 mr-1" />
                Upload document
              </Button>
              <input
                id="docgen-file-upload"
                type="file"
                accept=".txt,.doc,.docx,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleGeneratorFileUpload(file, setDocGenInputText);
                }}
              />
            </div>
            <div
              className={`relative ${docGenDragOver ? 'ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-900/20' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDocGenDragOver(true); }}
              onDragLeave={() => setDocGenDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDocGenDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleGeneratorFileUpload(file, setDocGenInputText);
              }}
            >
              <Textarea
                value={docGenInputText}
                onChange={(e) => setDocGenInputText(e.target.value)}
                placeholder="Paste or upload your source document here..."
                className="min-h-[180px] border-blue-200 dark:border-blue-700 focus:border-blue-400"
                data-testid="textarea-docgen-input"
              />
            </div>
            {docGenInputText && (
              <div className="text-xs text-blue-600 mt-1">
                {docGenInputText.length} characters
              </div>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">
              Optional Instructions (leave empty for auto-summary with analysis)
            </label>
            <Textarea
              value={docGenPrompt}
              onChange={(e) => setDocGenPrompt(e.target.value)}
              placeholder="Optional: e.g., 'Turn this into a 7000 word essay' - leave empty for automatic summary with analysis"
              className="min-h-[80px] border-blue-200 dark:border-blue-700 focus:border-blue-400"
              data-testid="textarea-docgen-prompt"
            />
          </div>
          
          <Button
            onClick={handleGenerateDocument}
            disabled={docGenLoading || !docGenInputText.trim()}
            className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg"
            data-testid="button-generate-document"
          >
            {docGenLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Generating Full Document...
              </>
            ) : (
              <>
                <BookOpen className="w-5 h-5 mr-2" />
                Generate Full Document
              </>
            )}
          </Button>
          
          {docGenOutput && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-semibold text-blue-700 dark:text-blue-300">
                  Generated Document
                </label>
                <div className="flex gap-2">
                  <CopyButton text={docGenOutput} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const blob = new Blob([docGenOutput], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'generated-document.txt';
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    data-testid="button-download-docgen"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
              <Textarea
                value={docGenOutput}
                readOnly
                className="min-h-[400px] bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-700"
                data-testid="textarea-docgen-output"
              />
              <div className="text-sm text-blue-600">
                {docGenOutput.split(/\s+/).filter(w => w).length} words
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DISSERTATION WIZARD - Bottom Copy of Reconstruction Tool */}
      <div id="dissertation-wizard" className="mt-16 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 p-8 rounded-lg border-2 border-emerald-200 dark:border-emerald-700">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 mb-3 flex items-center justify-center gap-3">
              <BookOpen className="w-8 h-8 text-emerald-600" />
              DISSERTATION WIZARD
            </h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">
              Intelligent text reconstruction - follows your instructions without limits
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Enter text to reconstruct, or just provide instructions to generate new content
            </p>
          </div>

          {/* Document Library - Multi-Document Upload Section */}
          <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 p-5 rounded-lg border-2 border-blue-200 dark:border-blue-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Document Library
                <Badge variant="secondary" className="ml-2">{dwUploadedDocuments.length}/5</Badge>
              </h3>
              {dwUploadedDocuments.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDwDocumentLibrary}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  data-testid="button-clear-dw-library"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
            
            <div
              className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                dwLibraryDragOver 
                  ? "border-blue-500 bg-blue-100 dark:bg-blue-800/30" 
                  : "border-blue-300 dark:border-blue-600 hover:border-blue-400"
              } ${dwUploadedDocuments.length >= 5 ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              onDragOver={(e) => { e.preventDefault(); if (dwUploadedDocuments.length < 5) setDwLibraryDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); if (dwUploadedDocuments.length < 5) setDwLibraryDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDwLibraryDragOver(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setDwLibraryDragOver(false);
                if (dwUploadedDocuments.length >= 5) return;
                const files = Array.from(e.dataTransfer.files || []).filter(f => 
                  f.type === 'application/pdf' || 
                  f.type === 'application/msword' || 
                  f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                  f.type === 'text/plain' ||
                  f.name.endsWith('.txt') || f.name.endsWith('.pdf') || f.name.endsWith('.doc') || f.name.endsWith('.docx')
                );
                if (files.length > 0) handleDwMultipleFileUpload(files);
              }}
              data-testid="dropzone-dw-library"
            >
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                multiple
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={dwUploadedDocuments.length >= 5}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) handleDwMultipleFileUpload(Array.from(files));
                  e.target.value = '';
                }}
                data-testid="input-dw-library-upload"
              />
              <Upload className="w-8 h-8 mx-auto mb-2 text-blue-500" />
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                {dwUploadedDocuments.length >= 5 
                  ? "Library full - remove documents to add more" 
                  : "Drag & drop documents here or click to browse"}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                PDF, Word (.doc, .docx), TXT - Up to 5 documents
              </p>
            </div>
            
            {dwUploadedDocuments.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Select documents to use:
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {dwSelectedDocumentIds.size} selected ({dwUploadedDocuments.filter(d => dwSelectedDocumentIds.has(d.id)).reduce((s, d) => s + d.wordCount, 0).toLocaleString()} words)
                  </Badge>
                </div>
                {dwUploadedDocuments.map((doc, index) => (
                  <div 
                    key={doc.id}
                    className={`flex items-center gap-3 p-3 rounded-md border transition-all cursor-pointer ${
                      dwSelectedDocumentIds.has(doc.id)
                        ? "bg-blue-100 dark:bg-blue-800/40 border-blue-400 dark:border-blue-500"
                        : "bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-700 hover:border-blue-300"
                    }`}
                    onClick={() => toggleDwDocumentSelection(doc.id)}
                    data-testid={`dw-doc-item-${doc.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={dwSelectedDocumentIds.has(doc.id)}
                      onChange={() => toggleDwDocumentSelection(doc.id)}
                      className="w-4 h-4 accent-blue-600"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`dw-checkbox-doc-${doc.id}`}
                    />
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-200 dark:bg-blue-700 px-2 py-0.5 rounded">
                      {index + 1}
                    </span>
                    <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate" title={doc.filename}>
                      {doc.filename}
                    </span>
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {doc.wordCount.toLocaleString()} words
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleDwRemoveDocument(doc.id); }}
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                      data-testid={`button-remove-dw-doc-${doc.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                
                {dwSelectedDocumentIds.size > 0 && (
                  <div className="mt-4 space-y-3">
                    <label className="block text-sm font-medium text-blue-800 dark:text-blue-200">
                      Instructions for selected documents:
                    </label>
                    <Textarea
                      value={dwLibraryInstructions}
                      onChange={(e) => setDwLibraryInstructions(e.target.value)}
                      placeholder="e.g., COMBINE THESE INTO A SINGLE COHESIVE WORK&#10;or: EXTRACT THE KEY ARGUMENTS FROM EACH AND SYNTHESIZE&#10;or: COMPARE AND CONTRAST THE MAIN THEMES"
                      className="min-h-[80px] text-sm"
                      data-testid="textarea-dw-library-instructions"
                    />
                    <Button
                      onClick={() => {
                        const selectedDocs = dwUploadedDocuments.filter(d => dwSelectedDocumentIds.has(d.id));
                        const combinedContent = combineDocuments(selectedDocs);
                        setValidatorInputText(combinedContent);
                        if (dwLibraryInstructions.trim()) {
                          setValidatorCustomInstructions(dwLibraryInstructions);
                        }
                        toast({
                          title: "Documents Loaded",
                          description: `${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''} loaded. ${dwLibraryInstructions ? 'Instructions applied.' : 'Add instructions below or run operations.'}`,
                        });
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      data-testid="button-load-dw-selected"
                    >
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Load {dwSelectedDocumentIds.size} Selected Document{dwSelectedDocumentIds.size > 1 ? 's' : ''} into Input
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                Input Text (up to 100,000 words)
              </label>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Word Count: {validatorInputText.trim() ? validatorInputText.trim().split(/\s+/).length.toLocaleString() : 0} / 100,000
                </span>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, setValidatorInputText);
                    }}
                    data-testid="input-validator-upload-bottom"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                    onClick={(e) => {
                      e.preventDefault();
                      (e.currentTarget.previousElementSibling as HTMLInputElement)?.click();
                    }}
                    data-testid="button-validator-upload-bottom"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Document
                  </Button>
                </label>
              </div>
            </div>
            <Textarea
              value={validatorInputText}
              onChange={(e) => setValidatorInputText(e.target.value)}
              placeholder="Paste complex, obscure, or muddled text here... or drag & drop a document (PDF, Word, TXT)"
              className="min-h-[200px] font-mono text-sm"
              data-testid="textarea-validator-input-bottom"
            />
            <TextStats text={validatorInputText} showAiDetect={true} />
          </div>

          {/* Target Word Count */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border-2 border-violet-300 dark:border-violet-700 mt-6">
            <label className="block text-sm font-semibold text-violet-700 dark:text-violet-300 mb-2">
              Target Word Count (Required for expansion)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={validatorTargetWordCount}
                onChange={(e) => setValidatorTargetWordCount(e.target.value)}
                placeholder="e.g., 5000, 25000, 100000"
                className="flex-1 px-4 py-3 text-lg font-semibold border-2 border-violet-300 dark:border-violet-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 dark:bg-gray-700 dark:text-white"
                min="100"
                max="300000"
                data-testid="input-target-word-count-bottom"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">words</span>
            </div>
            <p className="text-xs text-violet-600 dark:text-violet-400 mt-2 font-medium">
              Enter desired output length. Leave empty to auto-expand (small input → 5000 words, large input → 1.5x).
            </p>
          </div>

          {/* Custom Instructions */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 mt-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Custom Instructions (Optional)
            </label>
            <Textarea
              value={validatorCustomInstructions}
              onChange={(e) => setValidatorCustomInstructions(e.target.value)}
              placeholder="e.g., 'TURN INTO A PLAY' or 'WRITE AS A LEGAL DOCUMENT' or 'Focus on the logical structure'"
              className="min-h-[100px] text-sm"
              data-testid="textarea-validator-custom-instructions-bottom"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Provide specific guidance about format or content. The app will follow your instructions exactly.
            </p>
          </div>

          {/* LLM Provider Selector */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 mt-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              AI Model Selection
            </label>
            <Select value={validatorLLMProvider} onValueChange={setValidatorLLMProvider}>
              <SelectTrigger data-testid="select-validator-llm-bottom" className="w-full">
                <SelectValue placeholder="Select AI Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zhi5">ZHI 5 - Default</SelectItem>
                <SelectItem value="zhi1">ZHI 1</SelectItem>
                <SelectItem value="zhi2">ZHI 2</SelectItem>
                <SelectItem value="zhi3">ZHI 3</SelectItem>
                <SelectItem value="zhi4">ZHI 4</SelectItem>
              </SelectContent>
            </Select>
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-600 text-xs">
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Model Guide (cost per token)</div>
              <div className="space-y-1 text-gray-600 dark:text-gray-400">
                <div className="flex justify-between"><span><b>ZHI 1</b> — General purpose, follows instructions best</span><span className="text-amber-600 font-medium">5x</span></div>
                <div className="flex justify-between"><span><b>ZHI 2</b> — Complex writing, long documents</span><span className="text-red-500 font-medium">7x</span></div>
                <div className="flex justify-between"><span><b>ZHI 3</b> — Math & logic</span><span className="text-green-600 font-medium">1x</span></div>
                <div className="flex justify-between"><span><b>ZHI 4</b> — Factual lookup with sources</span><span className="text-red-500 font-medium">7x</span></div>
                <div className="flex justify-between"><span><b>ZHI 5</b> — Casual, current events</span><span className="text-yellow-600 font-medium">3x</span></div>
              </div>
            </div>
          </div>

          {/* Reconstruction Button */}
          <div className="mb-6 mt-6">
            <Button
              onClick={() => {
                handleValidatorProcess("reconstruction");
              }}
              className={`flex flex-col items-center justify-center p-6 h-auto w-full ${
                validatorMode === "reconstruction" 
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                  : "bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-300"
              }`}
              disabled={validatorLoading || validatorBatchLoading}
              data-testid="button-reconstruction-bottom"
            >
              {validatorLoading ? (
                <>
                  <Loader2 className="w-6 h-6 mb-2 animate-spin" />
                  <span className="font-bold text-lg">PROCESSING...</span>
                  <span className="text-xs mt-1 text-center opacity-80">
                    {validatorProgress || "Reconstructing text..."}
                  </span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-6 h-6 mb-2" />
                  <span className="font-bold text-lg">DISSERTATE</span>
                </>
              )}
            </Button>
            
            {validatorLoading && validatorProgress && (
              <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-700">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  <span className="text-sm text-emerald-700 dark:text-emerald-300">{validatorProgress}</span>
                </div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  Long documents use outline-first mode for better coherence. This may take 1-3 minutes.
                </p>
              </div>
            )}
            
            {/* Mode Toggle */}
            <div className="flex items-center justify-center gap-4 mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
              <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Mode:</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={validatorFidelityLevel === "conservative" ? "default" : "outline"}
                  onClick={() => setValidatorFidelityLevel("conservative")}
                  className={validatorFidelityLevel === "conservative" 
                    ? "bg-amber-600 hover:bg-amber-700 text-white" 
                    : "border-amber-300 text-amber-700 dark:text-amber-300"}
                  data-testid="button-fidelity-conservative-bottom"
                >
                  Conservative
                </Button>
                <Button
                  size="sm"
                  variant={validatorFidelityLevel === "aggressive" ? "default" : "outline"}
                  onClick={() => setValidatorFidelityLevel("aggressive")}
                  className={validatorFidelityLevel === "aggressive" 
                    ? "bg-red-600 hover:bg-red-700 text-white" 
                    : "border-amber-300 text-amber-700 dark:text-amber-300"}
                  data-testid="button-fidelity-aggressive-bottom"
                >
                  Aggressive
                </Button>
              </div>
            </div>
          </div>

          {/* Output Display */}
          {validatorOutput && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border-2 border-emerald-300 dark:border-emerald-700">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                  Reconstruction Result
                </h3>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadText(validatorOutput, `reconstruction-output.txt`)}
                    data-testid="button-download-validator-output-bottom"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <CopyButton text={validatorOutput} />
                  <Button
                    onClick={handleValidatorClear}
                    variant="outline"
                    size="sm"
                    data-testid="button-clear-validator-bottom"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                </div>
              </div>
              
              <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-sky-700 dark:text-sky-300">Input Words:</span>
                    <span className="text-lg font-bold text-sky-900 dark:text-sky-100">
                      {validatorInputText.trim().split(/\s+/).filter((w: string) => w).length.toLocaleString()}
                    </span>
                  </div>
                  <span className="text-sky-400">|</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Output Words:</span>
                    <span className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                      {validatorOutput.trim().split(/\s+/).filter((w: string) => w).length.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              
              <TextStats text={validatorOutput} showAiDetect={true} variant="prominent" targetWords={parseInt(validatorTargetWordCount) || undefined} />
              
              <Textarea
                value={validatorOutput}
                readOnly
                className="min-h-[300px] font-mono text-sm mt-4"
                data-testid="textarea-validator-output-bottom"
              />
            </div>
          )}

          {/* Clear All */}
          <div className="mt-4 text-center">
            <Button
              onClick={handleValidatorClear}
              variant="outline"
              className="px-6 py-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 dark:hover:bg-red-900/20 flex items-center mx-auto"
              disabled={validatorLoading}
              data-testid="button-validator-clear-all-bottom"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              <span>New Analysis / Clear All</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Chat Dialog - Always visible below everything */}
      <ChatDialog 
        currentDocument={documentA.content}
        analysisResults={mode === "single" ? analysisA : comparison}
        onSendToInput={(content: string) => {
          setDocumentA({ ...documentA, content: content });
        }}
        onSendToHumanizer={handleSendToHumanizer}
        onSendToIntelligence={handleSendToIntelligence}
        onSendToChat={handleSendToChat}
        onSendToValidator={(text: string) => setValidatorInputText(text)}
      />

      {/* Fiction Assessment Popup */}
      <FictionAssessmentPopup 
        isOpen={fictionPopupOpen}
        onClose={() => setFictionPopupOpen(false)}
      />

      {/* Streaming Output Modal for real-time expansion preview */}
      <StreamingOutputModal
        isOpen={streamingModalOpen}
        startNew={streamingStartNew}
        onClose={() => {
          setStreamingModalOpen(false);
          setStreamingStartNew(false);
        }}
        onComplete={(finalText: string) => {
          if (finalText) {
            setValidatorOutput(stripMarkdown(finalText));
            setObjectionsInputText(stripMarkdown(finalText));
          }
        }}
      />

      {/* Full Suite RECONSTRUCTION Popup Modal */}
      {fullSuiteReconstructionPopupOpen && fullSuiteReconstructionOutput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" data-testid="full-suite-reconstruction-popup-overlay">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl border-2 border-blue-400 dark:border-blue-600 max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
            {/* Popup Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/30 rounded-t-lg">
              <div className="flex items-center gap-3 flex-wrap">
                {fullSuiteReconstructionOutput.startsWith("Generating expanded document") ? (
                  <Badge className="bg-blue-600 text-white text-sm px-3 py-1 animate-pulse">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Stage 1: Generating Reconstruction...
                  </Badge>
                ) : (
                  <>
                    <Badge className="bg-blue-600 text-white text-sm px-3 py-1">
                      Stage 1: Reconstruction Complete
                    </Badge>
                    <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      {fullSuiteReconstructionOutput.trim().split(/\s+/).length.toLocaleString()} words
                    </Badge>
                  </>
                )}
                {fullSuiteLoading && fullSuiteStage === "objections" && (
                  <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 animate-pulse">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Processing Objections...
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(fullSuiteReconstructionOutput);
                    toast({ title: "Copied!", description: "Reconstruction output copied to clipboard" });
                  }}
                  className="border-blue-300 dark:border-blue-600"
                  data-testid="button-copy-reconstruction"
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setFullSuiteReconstructionPopupOpen(false)}
                  data-testid="button-close-reconstruction-popup"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {/* Popup Content */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                {fullSuiteReconstructionOutput}
              </pre>
            </div>
            {/* Popup Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-lg">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <TextStats text={fullSuiteReconstructionOutput} showAiDetect={true} variant="compact" />
                <Button
                  onClick={() => setFullSuiteReconstructionPopupOpen(false)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-done-reconstruction"
                >
                  Continue
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Suite OBJECTIONS Popup Modal */}
      {fullSuiteObjectionsPopupOpen && objectionsOutput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" data-testid="full-suite-objections-popup-overlay">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl border-2 border-amber-400 dark:border-amber-600 max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
            {/* Popup Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/30 rounded-t-lg">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className="bg-amber-600 text-white text-sm px-3 py-1">
                  Stage 2: Objections Complete
                </Badge>
                <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  {objectionsOutput.trim().split(/\s+/).length.toLocaleString()} words
                </Badge>
                {fullSuiteLoading && (
                  <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 animate-pulse">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Creating Objection-Proof Version...
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(objectionsOutput);
                    toast({ title: "Copied!", description: "Objections output copied to clipboard" });
                  }}
                  className="border-amber-300 dark:border-amber-600"
                  data-testid="button-copy-objections"
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setFullSuiteObjectionsPopupOpen(false)}
                  data-testid="button-close-objections-popup"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {/* Popup Content */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                {objectionsOutput}
              </pre>
            </div>
            {/* Popup Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-lg">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <TextStats text={objectionsOutput} showAiDetect={true} variant="compact" />
                <Button
                  onClick={() => setFullSuiteObjectionsPopupOpen(false)}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  data-testid="button-done-objections"
                >
                  Continue
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Suite UNIFIED Popup Modal - Shows all phases */}
      {fullSuitePopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" data-testid="full-suite-popup-overlay">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl border-2 border-violet-400 dark:border-violet-600 max-w-5xl w-full mx-4 max-h-[90vh] flex flex-col">
            {/* Popup Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 via-amber-50 to-violet-50 dark:from-blue-900/30 dark:via-amber-900/30 dark:to-violet-900/30 rounded-t-lg">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className={`text-white text-sm px-3 py-1 ${
                  fullSuiteStage === 'complete' ? 'bg-green-600' :
                  fullSuiteStage === 'error' ? 'bg-red-600' :
                  'bg-violet-600 animate-pulse'
                }`}>
                  {fullSuiteStage === 'complete' ? 'Full Suite Complete' :
                   fullSuiteStage === 'error' ? 'Error' :
                   fullSuiteStage === 'batch' ? 'Stage 1: Reconstruction...' :
                   fullSuiteStage === 'objections' ? 'Stage 2: Objections...' :
                   fullSuiteStage === 'objection-proof' ? 'Stage 3: Final Version...' :
                   'Processing...'}
                </Badge>
                {fullSuiteLoading && (
                  <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 animate-pulse">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Processing...
                  </Badge>
                )}
                {/* Stage indicators */}
                <div className="flex items-center gap-1">
                  <div className={`w-3 h-3 rounded-full ${fullSuiteReconstructionOutput ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} title="Reconstruction" />
                  <div className={`w-3 h-3 rounded-full ${objectionsOutput ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`} title="Objections" />
                  <div className={`w-3 h-3 rounded-full ${fullSuiteObjectionProofOutput ? 'bg-violet-500' : 'bg-gray-300 dark:bg-gray-600'}`} title="Final Version" />
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setFullSuitePopupOpen(false)}
                data-testid="button-close-full-suite-popup"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            {/* Popup Content - Tabbed view of all phases */}
            <div className="flex-1 overflow-hidden p-4">
              <Tabs value={fullSuiteActiveTab} onValueChange={setFullSuiteActiveTab} className="h-full flex flex-col">
                <TabsList className="grid w-full grid-cols-3 mb-4">
                  <TabsTrigger value="reconstruction" className="relative">
                    Reconstruction
                    {fullSuiteReconstructionOutput && <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />}
                  </TabsTrigger>
                  <TabsTrigger value="objections" className="relative">
                    Objections
                    {objectionsOutput && <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />}
                  </TabsTrigger>
                  <TabsTrigger value="final" className="relative">
                    Final Version
                    {fullSuiteObjectionProofOutput && <span className="absolute -top-1 -right-1 w-2 h-2 bg-violet-500 rounded-full" />}
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="reconstruction" className="flex-1 overflow-hidden flex flex-col mt-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {fullSuiteReconstructionOutput ? (
                        <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          {fullSuiteReconstructionOutput.trim().split(/\s+/).length.toLocaleString()} words
                        </Badge>
                      ) : fullSuiteStage === 'batch' ? (
                        <Badge variant="outline" className="animate-pulse">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Generating...
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Waiting...</Badge>
                      )}
                    </div>
                    {fullSuiteReconstructionOutput && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => {
                          navigator.clipboard.writeText(fullSuiteReconstructionOutput);
                          toast({ title: "Copied!", description: "Reconstruction copied" });
                        }} data-testid="button-copy-reconstruction">
                          <Copy className="w-4 h-4 mr-1" />Copy
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          const blob = new Blob([fullSuiteReconstructionOutput], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `reconstruction-${new Date().toISOString().split('T')[0]}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                          toast({ title: "Downloaded!" });
                        }} data-testid="button-download-reconstruction">
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <ScrollArea className="flex-1 border rounded-md">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed p-4 text-gray-800 dark:text-gray-200">
                      {fullSuiteReconstructionOutput || (fullSuiteStage === 'batch' ? 'Generating reconstruction...' : 'Waiting to start...')}
                    </pre>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="objections" className="flex-1 overflow-hidden flex flex-col mt-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {objectionsOutput ? (
                        <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          {objectionsOutput.trim().split(/\s+/).length.toLocaleString()} words
                        </Badge>
                      ) : fullSuiteStage === 'objections' ? (
                        <Badge variant="outline" className="animate-pulse">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Generating...
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Waiting...</Badge>
                      )}
                    </div>
                    {objectionsOutput && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => {
                          navigator.clipboard.writeText(objectionsOutput);
                          toast({ title: "Copied!", description: "Objections copied" });
                        }} data-testid="button-copy-objections">
                          <Copy className="w-4 h-4 mr-1" />Copy
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          const blob = new Blob([objectionsOutput], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `objections-${new Date().toISOString().split('T')[0]}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                          toast({ title: "Downloaded!" });
                        }} data-testid="button-download-objections">
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <ScrollArea className="flex-1 border rounded-md">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed p-4 text-gray-800 dark:text-gray-200">
                      {objectionsOutput || (fullSuiteStage === 'objections' ? 'Generating objections...' : 'Waiting for reconstruction to complete...')}
                    </pre>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="final" className="flex-1 overflow-hidden flex flex-col mt-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {fullSuiteObjectionProofOutput ? (
                        <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          {fullSuiteObjectionProofOutput.trim().split(/\s+/).length.toLocaleString()} words
                        </Badge>
                      ) : fullSuiteStage === 'objection-proof' ? (
                        <Badge variant="outline" className="animate-pulse">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Generating...
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Waiting...</Badge>
                      )}
                    </div>
                    {fullSuiteObjectionProofOutput && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => {
                          navigator.clipboard.writeText(fullSuiteObjectionProofOutput);
                          toast({ title: "Copied!", description: "Final version copied" });
                        }} data-testid="button-copy-final">
                          <Copy className="w-4 h-4 mr-1" />Copy
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          const blob = new Blob([fullSuiteObjectionProofOutput], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `final-version-${new Date().toISOString().split('T')[0]}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                          toast({ title: "Downloaded!" });
                        }} data-testid="button-download-final">
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <ScrollArea className="flex-1 border rounded-md">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed p-4 text-gray-800 dark:text-gray-200">
                      {fullSuiteObjectionProofOutput || (fullSuiteStage === 'objection-proof' ? 'Generating final objection-proof version...' : 'Waiting for objections to complete...')}
                    </pre>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
            
            {/* Popup Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-lg">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {fullSuiteStage === 'complete' && fullSuiteObjectionProofOutput && (
                  <TextStats text={fullSuiteObjectionProofOutput} showAiDetect={true} variant="compact" />
                )}
                {fullSuiteStage === 'error' && fullSuiteError && (
                  <span className="text-red-600 text-sm">{fullSuiteError}</span>
                )}
                {fullSuiteLoading && (
                  <span className="text-muted-foreground text-sm">Processing pipeline...</span>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  {fullSuiteStage === 'complete' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const allContent = `=== RECONSTRUCTION ===\n\n${fullSuiteReconstructionOutput}\n\n=== OBJECTIONS ===\n\n${objectionsOutput}\n\n=== FINAL VERSION ===\n\n${fullSuiteObjectionProofOutput}`;
                        const blob = new Blob([allContent], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `full-suite-all-${new Date().toISOString().split('T')[0]}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast({ title: "Downloaded!", description: "All phases saved" });
                      }}
                      data-testid="button-download-all"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download All
                    </Button>
                  )}
                  <Button
                    onClick={() => setFullSuitePopupOpen(false)}
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                    data-testid="button-close-full-suite"
                  >
                    {fullSuiteStage === 'complete' ? 'Done' : 'Close'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Global Clear All - Floating Button */}
      <button
        onClick={handleGlobalClearAll}
        className="fixed right-4 bottom-4 z-50 p-2 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 shadow-sm hover-elevate opacity-40 hover:opacity-100 transition-opacity"
        title="Clear All Fields"
        data-testid="button-global-clear"
      >
        <Trash2 className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
};

export default HomePage;
