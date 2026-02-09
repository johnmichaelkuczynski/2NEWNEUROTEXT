import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { TextStats } from "@/components/TextStats";
import { StreamingOutputModal } from "@/components/StreamingOutputModal";
import CopyButton from "@/components/CopyButton";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Trash2, Loader2, Upload, FileText, Download, RefreshCw, ArrowRight, X, Sparkles } from "lucide-react";

const stripMarkdown = (text: string): string => {
  if (!text) return text;
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, '').replace(/```/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

interface DwDocument {
  id: string;
  filename: string;
  content: string;
  wordCount: number;
  role: 'primary' | 'source';
}

const DissertationWizardPage: React.FC = () => {
  const { toast } = useToast();

  const [inputText, setInputText] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [targetWordCount, setTargetWordCount] = useState("");
  const [llmProvider, setLlmProvider] = useState("zhi1");
  const [fidelityLevel, setFidelityLevel] = useState<"conservative" | "aggressive">("aggressive");
  const [output, setOutput] = useState("");

  const [uploadedDocuments, setUploadedDocuments] = useState<DwDocument[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [libraryDragOver, setLibraryDragOver] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const [streamingModalOpen, setStreamingModalOpen] = useState(false);
  const [streamingStartNew, setStreamingStartNew] = useState(false);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const combineDocuments = (docs: Array<{ id: string; filename: string; content: string; wordCount: number }>) => {
    if (docs.length === 0) return "";
    if (docs.length === 1) return docs[0].content;
    return docs.map((doc, index) =>
      `=== DOCUMENT ${index + 1}: ${doc.filename} ===\n\n${doc.content}`
    ).join('\n\n---\n\n');
  };

  const handleFileUpload = async (file: File, setter: (content: string) => void) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/extract-text', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Failed to extract text from document');
      const data = await response.json();
      setter(data.content);
      toast({ title: "File Uploaded", description: `Successfully loaded ${file.name}` });
    } catch (error) {
      console.error('File upload error:', error);
      toast({ title: "Upload Failed", description: "Could not read the file. Please try a different format.", variant: "destructive" });
    }
  };

  const handleMultipleFileUpload = async (files: File[]) => {
    const maxDocs = 5;
    const remainingSlots = maxDocs - uploadedDocuments.length;
    if (remainingSlots <= 0) {
      toast({ title: "Library Full", description: "Maximum 5 documents allowed. Remove some to add more.", variant: "destructive" });
      return;
    }
    const filesToProcess = files.slice(0, remainingSlots);
    if (filesToProcess.length < files.length) {
      toast({ title: "Some Files Skipped", description: `Only ${filesToProcess.length} of ${files.length} files added (max 5 total)` });
    }
    try {
      const newDocs: DwDocument[] = [];
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
        newDocs.push({ id: docId, filename: file.name, content: data.content, wordCount: words.length, role: 'source' });
      }
      const allDocs = [...uploadedDocuments, ...newDocs];
      setUploadedDocuments(allDocs);
      setSelectedDocumentIds(prev => { const newSet = new Set(prev); newIds.forEach(id => newSet.add(id)); return newSet; });
      toast({ title: `${filesToProcess.length} Document${filesToProcess.length > 1 ? 's' : ''} Added`, description: `Library now has ${allDocs.length} document${allDocs.length > 1 ? 's' : ''}.` });
    } catch (error) {
      console.error('DW file upload error:', error);
      toast({ title: "Upload Failed", description: "Could not read one or more files.", variant: "destructive" });
    }
  };

  const toggleDocumentSelection = (docId: string) => {
    setSelectedDocumentIds(prev => { const newSet = new Set(prev); if (newSet.has(docId)) newSet.delete(docId); else newSet.add(docId); return newSet; });
  };

  const toggleDocumentRole = (docId: string) => {
    setUploadedDocuments(prev => prev.map(d => d.id === docId ? { ...d, role: d.role === 'primary' ? 'source' as const : 'primary' as const } : d));
  };

  const clearDocumentLibrary = () => {
    setUploadedDocuments([]);
    setSelectedDocumentIds(new Set());
    toast({ title: "Library Cleared", description: "All documents removed." });
  };

  const removeDocument = (docId: string) => {
    const newDocs = uploadedDocuments.filter(d => d.id !== docId);
    setUploadedDocuments(newDocs);
    setSelectedDocumentIds(prev => { const newSet = new Set(prev); newSet.delete(docId); return newSet; });
    toast({ title: "Document Removed", description: newDocs.length > 0 ? `${newDocs.length} document${newDocs.length > 1 ? 's' : ''} remaining` : "Library cleared" });
  };

  const handleDownloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const detectsAsInstructions = (text: string): boolean => {
    if (!text || text.trim().length === 0) return false;
    const instructionPatterns = [
      /^WRITE\s+/i, /^GENERATE\s+/i, /^CREATE\s+/i, /^EXPAND\s+/i,
      /^PRODUCE\s+/i, /^COMPOSE\s+/i, /^TURN\s+/i, /^MAKE\s+/i,
      /\d+\s*WORDS?\s*(?:ESSAY|PAPER|THESIS|DISSERTATION|DOCUMENT|ARTICLE)/i,
      /(?:ESSAY|PAPER|THESIS|DISSERTATION|ARTICLE)\s+ON\s+/i,
      /WRITE\s+(?:AN?\s+)?(?:ESSAY|PAPER|THESIS|DISSERTATION|ARTICLE)/i,
    ];
    return instructionPatterns.some(pattern => pattern.test(text));
  };

  const interpretInput = (mainText: string, instructionsText: string) => {
    const mainLooksLikeInstructions = detectsAsInstructions(mainText);
    const instructionsLooksLikeContent = instructionsText.trim().length > 0 &&
      !detectsAsInstructions(instructionsText) &&
      instructionsText.trim().split(/\s+/).length > 50;

    if (mainLooksLikeInstructions && instructionsLooksLikeContent) {
      return { effectiveText: instructionsText, effectiveInstructions: mainText, wasSwapped: true };
    }
    if (mainLooksLikeInstructions && !instructionsText.trim()) {
      return { effectiveText: '', effectiveInstructions: mainText, wasSwapped: false };
    }
    return { effectiveText: mainText, effectiveInstructions: instructionsText, wasSwapped: false };
  };

  const handleClear = () => {
    setInputText("");
    setOutput("");
    setCustomInstructions("");
    setTargetWordCount("");
  };

  const handleLoadSelectedDocuments = () => {
    const selectedDocs = uploadedDocuments.filter(d => selectedDocumentIds.has(d.id));
    const primaryDocs = selectedDocs.filter(d => d.role === 'primary');
    const sourceDocs = selectedDocs.filter(d => d.role === 'source');

    if (primaryDocs.length > 0 && sourceDocs.length > 0) {
      setInputText(combineDocuments(primaryDocs));
      const sourceBlock = `\n\n[SOURCE MATERIAL - USE AS REFERENCE]\n${combineDocuments(sourceDocs)}\n[END SOURCE MATERIAL]`;
      const existing = customInstructions.trim();
      const alreadyHasSource = existing.includes('[SOURCE MATERIAL');
      if (alreadyHasSource) {
        const cleaned = existing.replace(/\n*\[SOURCE MATERIAL[\s\S]*?\[END SOURCE MATERIAL\]/g, '').trim();
        setCustomInstructions(cleaned ? `${cleaned}${sourceBlock}` : sourceBlock.trim());
      } else {
        setCustomInstructions(existing ? `${existing}${sourceBlock}` : sourceBlock.trim());
      }
      toast({ title: "Documents Ready", description: `Primary text loaded. ${sourceDocs.length} source doc(s) attached as reference.` });
    } else if (primaryDocs.length > 0) {
      setInputText(combineDocuments(primaryDocs));
      toast({ title: "Primary Text Loaded", description: "Write your instructions below, then click DISSERTATE." });
    } else {
      setInputText(combineDocuments(selectedDocs));
      toast({ title: "Documents Loaded", description: `${selectedDocs.length} document(s) loaded. Tip: Mark one as PRIMARY TEXT.` });
    }
  };

  const handleDissertate = async () => {
    const hasInputText = inputText.trim().length > 0;
    const hasInstructions = customInstructions.trim().length > 0;

    if (!hasInputText && !hasInstructions) {
      toast({ title: "Input Required", description: "Please enter text OR instructions.", variant: "destructive" });
      return;
    }

    const interpretation = interpretInput(inputText, customInstructions);
    if (interpretation.wasSwapped) {
      toast({ title: "Inputs Interpreted", description: "Detected instructions in text box and content in instructions box - swapped automatically." });
    }

    const effectiveText = interpretation.effectiveText;
    let effectiveInstructions = interpretation.effectiveInstructions;

    const targetWC = parseInt(targetWordCount);
    if (targetWC && targetWC > 0) {
      const hasExpand = /expand\s*(to|into)?\s*\d+/i.test(effectiveInstructions);
      if (!hasExpand) {
        effectiveInstructions = `EXPAND TO ${targetWC} WORDS. ${effectiveInstructions}`;
      }
    }

    const effectiveInputText = effectiveText.trim().length > 0 ? effectiveText : effectiveInstructions;

    setProcessing(true);
    setProgress("Starting coherence-based reconstruction...");
    setOutput("");
    setStreamingStartNew(true);
    setStreamingModalOpen(true);

    try {
      const response = await fetch("/api/reconstruction/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: effectiveInputText,
          title: "Dissertation Wizard Job",
          targetWordCount: targetWC > 0 ? targetWC : undefined,
          customInstructions: effectiveInstructions,
          llmProvider: llmProvider,
          fidelityLevel: fidelityLevel,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to start reconstruction");
      }

      const project = await response.json();
      setProjectId(project.id);
      setProgress("Processing through coherence system...");

      if (pollRef.current) clearInterval(pollRef.current);

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/reconstruction/${project.id}`);
          if (!statusRes.ok) return;
          const updated = await statusRes.json();

          if (updated.status === 'completed') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setProcessing(false);
            setProgress("");
            setProjectId(null);
            const outputText = updated.reconstructedText || "";
            setOutput(stripMarkdown(outputText));
            const outputWords = outputText.trim().split(/\s+/).length;
            toast({ title: "Processing Complete", description: `Generated ${outputWords.toLocaleString()} words.` });
          } else if (updated.status === 'failed') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setProcessing(false);
            setProgress("");
            setProjectId(null);
            toast({ title: "Processing Failed", description: "An error occurred during processing.", variant: "destructive" });
          }
        } catch (e) {
          console.error("DW polling error:", e);
        }
      }, 5000);

    } catch (error: any) {
      setProcessing(false);
      setProgress("");
      toast({ title: "Error", description: error.message || "Failed to start coherence processing.", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-teal-50 dark:from-gray-900 dark:to-gray-900 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 mb-3 flex items-center justify-center gap-3">
            <BookOpen className="w-8 h-8 text-emerald-600" />
            DISSERTATION WIZARD
          </h1>
          <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">
            Intelligent text reconstruction - follows your instructions without limits
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Enter text to reconstruct, or just provide instructions to generate new content
          </p>
        </div>

        {/* Document Library */}
        <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 p-5 rounded-lg border-2 border-blue-200 dark:border-blue-700">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Document Library
              <Badge variant="secondary" className="ml-2">{uploadedDocuments.length}/5</Badge>
            </h3>
            {uploadedDocuments.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearDocumentLibrary}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                data-testid="button-clear-dw-library">
                <Trash2 className="w-4 h-4 mr-1" /> Clear All
              </Button>
            )}
          </div>

          <div
            className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-all ${
              libraryDragOver ? "border-blue-500 bg-blue-100 dark:bg-blue-800/30"
                : "border-blue-300 dark:border-blue-600 hover:border-blue-400"
            } ${uploadedDocuments.length >= 5 ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            onDragOver={(e) => { e.preventDefault(); if (uploadedDocuments.length < 5) setLibraryDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); if (uploadedDocuments.length < 5) setLibraryDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setLibraryDragOver(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setLibraryDragOver(false);
              if (uploadedDocuments.length >= 5) return;
              const files = Array.from(e.dataTransfer.files || []).filter(f =>
                f.type === 'application/pdf' || f.type === 'application/msword' ||
                f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                f.type === 'text/plain' || f.name.endsWith('.txt') || f.name.endsWith('.pdf') || f.name.endsWith('.doc') || f.name.endsWith('.docx')
              );
              if (files.length > 0) handleMultipleFileUpload(files);
            }}
            data-testid="dropzone-dw-library"
          >
            <input type="file" accept=".pdf,.doc,.docx,.txt" multiple
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={uploadedDocuments.length >= 5}
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) handleMultipleFileUpload(Array.from(files));
                e.target.value = '';
              }}
              data-testid="input-dw-library-upload"
            />
            <Upload className="w-8 h-8 mx-auto mb-2 text-blue-500" />
            <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
              {uploadedDocuments.length >= 5 ? "Library full - remove documents to add more" : "Drag & drop documents here or click to browse"}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              PDF, Word (.doc, .docx), TXT - Up to 5 documents
            </p>
          </div>

          {uploadedDocuments.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Select documents to use:</span>
                <Badge variant="outline" className="text-xs">
                  {selectedDocumentIds.size} selected ({uploadedDocuments.filter(d => selectedDocumentIds.has(d.id)).reduce((s, d) => s + d.wordCount, 0).toLocaleString()} words)
                </Badge>
              </div>
              <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-700">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-1">Assign a role to each document:</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">PRIMARY TEXT</span> = the text to be rewritten/expanded.{' '}
                  <span className="font-bold text-blue-700 dark:text-blue-400">SOURCE MATERIAL</span> = reference documents used to inform the rewrite.
                </p>
              </div>
              {uploadedDocuments.map((doc, index) => (
                <div key={doc.id}
                  className={`rounded-md border transition-all ${
                    selectedDocumentIds.has(doc.id)
                      ? doc.role === 'primary'
                        ? "bg-emerald-100 dark:bg-emerald-800/40 border-emerald-400 dark:border-emerald-500"
                        : "bg-blue-100 dark:bg-blue-800/40 border-blue-400 dark:border-blue-500"
                      : "bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-700"
                  }`}
                  data-testid={`dw-doc-item-${doc.id}`}
                >
                  <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => toggleDocumentSelection(doc.id)}>
                    <input type="checkbox" checked={selectedDocumentIds.has(doc.id)}
                      onChange={() => toggleDocumentSelection(doc.id)}
                      className="w-4 h-4 accent-blue-600"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`dw-checkbox-doc-${doc.id}`}
                    />
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-200 dark:bg-blue-700 px-2 py-0.5 rounded">{index + 1}</span>
                    <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate" title={doc.filename}>{doc.filename}</span>
                    <Badge variant="outline" className="text-xs flex-shrink-0">{doc.wordCount.toLocaleString()} words</Badge>
                    <Button variant="ghost" size="icon"
                      onClick={(e) => { e.stopPropagation(); removeDocument(doc.id); }}
                      data-testid={`button-remove-dw-doc-${doc.id}`}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 px-3 pb-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Role:</span>
                    <Badge
                      variant={doc.role === 'primary' ? 'default' : 'secondary'}
                      className={`cursor-pointer text-xs ${doc.role === 'primary' ? "bg-emerald-600 text-white" : ""}`}
                      onClick={() => toggleDocumentRole(doc.id)}
                      data-testid={`badge-role-dw-doc-${doc.id}`}
                    >
                      {doc.role === 'primary' ? 'PRIMARY TEXT' : 'SOURCE MATERIAL'}
                    </Badge>
                    <span className="text-xs text-gray-400 dark:text-gray-500">(click to change)</span>
                  </div>
                </div>
              ))}

              {selectedDocumentIds.size > 0 && (
                <div className="mt-4 space-y-3">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-md text-xs text-blue-700 dark:text-blue-300 space-y-1">
                    <p className="font-medium">How it works:</p>
                    <p>PRIMARY TEXT goes into the Input box below (this is what gets rewritten/expanded).</p>
                    <p>SOURCE MATERIAL gets attached as reference for the AI to borrow from.</p>
                    <p>Then write your instructions in the "Instructions" box below.</p>
                  </div>
                  <Button onClick={handleLoadSelectedDocuments}
                    className="w-full bg-blue-600 text-white"
                    data-testid="button-load-dw-selected">
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Load {selectedDocumentIds.size} Selected Document{selectedDocumentIds.size > 1 ? 's' : ''} into Input
                  </Button>
                  {(() => {
                    const selectedDocs = uploadedDocuments.filter(d => selectedDocumentIds.has(d.id));
                    const primaryCount = selectedDocs.filter(d => d.role === 'primary').length;
                    const sourceCount = selectedDocs.filter(d => d.role === 'source').length;
                    return (
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                        {primaryCount > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-medium">{primaryCount} primary text{primaryCount > 1 ? 's' : ''}</span>}
                        {primaryCount > 0 && sourceCount > 0 && ' + '}
                        {sourceCount > 0 && <span className="text-blue-600 dark:text-blue-400 font-medium">{sourceCount} source doc{sourceCount > 1 ? 's' : ''}</span>}
                        {primaryCount === 0 && sourceCount > 0 && ' (no primary text assigned - all will load as input)'}
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <label className="block text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              Input Text (up to 100,000 words)
            </label>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Word Count: {inputText.trim() ? inputText.trim().split(/\s+/).length.toLocaleString() : 0} / 100,000
              </span>
              <label className="cursor-pointer">
                <input type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file, setInputText); }}
                  data-testid="input-dw-upload"
                />
                <Button variant="outline" size="sm"
                  className="border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                  onClick={(e) => { e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }}
                  data-testid="button-dw-upload">
                  <Upload className="w-4 h-4 mr-2" /> Upload Document
                </Button>
              </label>
            </div>
          </div>
          <Textarea value={inputText} onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste complex, obscure, or muddled text here... or drag & drop a document (PDF, Word, TXT)"
            className="min-h-[200px] font-mono text-sm"
            data-testid="textarea-dw-input"
          />
          <TextStats text={inputText} showAiDetect={true} />
        </div>

        {/* Target Word Count */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border-2 border-violet-300 dark:border-violet-700 mt-6">
          <label className="block text-sm font-semibold text-violet-700 dark:text-violet-300 mb-2">
            Target Word Count (Required for expansion)
          </label>
          <div className="flex items-center gap-3">
            <input type="number" value={targetWordCount}
              onChange={(e) => setTargetWordCount(e.target.value)}
              placeholder="e.g., 5000, 25000, 100000"
              className="flex-1 px-4 py-3 text-lg font-semibold border-2 border-violet-300 dark:border-violet-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 dark:bg-gray-700 dark:text-white"
              min="100" max="300000"
              data-testid="input-dw-target-word-count"
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
            Instructions (Optional)
          </label>
          <Textarea value={customInstructions} onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="e.g., 'TURN INTO A PLAY' or 'WRITE AS A LEGAL DOCUMENT' or 'Focus on the logical structure'"
            className="min-h-[100px] text-sm"
            data-testid="textarea-dw-custom-instructions"
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
          <Select value={llmProvider} onValueChange={setLlmProvider}>
            <SelectTrigger data-testid="select-dw-llm" className="w-full">
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
              <div className="flex justify-between gap-2"><span><b>ZHI 1</b> — General purpose, follows instructions best</span><span className="text-amber-600 font-medium">5x</span></div>
              <div className="flex justify-between gap-2"><span><b>ZHI 2</b> — Complex writing, long documents</span><span className="text-red-500 font-medium">7x</span></div>
              <div className="flex justify-between gap-2"><span><b>ZHI 3</b> — Math & logic</span><span className="text-green-600 font-medium">1x</span></div>
              <div className="flex justify-between gap-2"><span><b>ZHI 4</b> — Factual lookup with sources</span><span className="text-red-500 font-medium">7x</span></div>
              <div className="flex justify-between gap-2"><span><b>ZHI 5</b> — Casual, current events</span><span className="text-yellow-600 font-medium">3x</span></div>
            </div>
          </div>
        </div>

        {/* DISSERTATE Button */}
        <div className="mb-6 mt-6">
          <Button onClick={handleDissertate}
            className={`flex flex-col items-center justify-center p-6 h-auto w-full ${
              processing ? "bg-emerald-600 text-white" : "bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-300"
            }`}
            disabled={processing}
            data-testid="button-dissertate">
            {processing ? (
              <>
                <Loader2 className="w-6 h-6 mb-2 animate-spin" />
                <span className="font-bold text-lg">PROCESSING...</span>
                <span className="text-xs mt-1 text-center opacity-80">Coherence system active</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-6 h-6 mb-2" />
                <span className="font-bold text-lg">DISSERTATE</span>
              </>
            )}
          </Button>

          {processing && progress && (
            <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-700">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span className="text-sm text-emerald-700 dark:text-emerald-300">{progress}</span>
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                Using multi-pass coherence system with skeleton extraction, chunked reconstruction, and cross-chunk stitching. This may take 1-5 minutes.
              </p>
            </div>
          )}

          {/* Mode Toggle */}
          <div className="flex items-center justify-center gap-4 mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700 flex-wrap">
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Mode:</span>
            <div className="flex gap-2">
              <Button size="sm"
                variant={fidelityLevel === "conservative" ? "default" : "outline"}
                onClick={() => setFidelityLevel("conservative")}
                className={fidelityLevel === "conservative"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "border-amber-300 text-amber-700 dark:text-amber-300"}
                data-testid="button-fidelity-conservative">
                Conservative
              </Button>
              <Button size="sm"
                variant={fidelityLevel === "aggressive" ? "default" : "outline"}
                onClick={() => setFidelityLevel("aggressive")}
                className={fidelityLevel === "aggressive"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "border-amber-300 text-amber-700 dark:text-amber-300"}
                data-testid="button-fidelity-aggressive">
                Aggressive
              </Button>
            </div>
          </div>
        </div>

        {/* Output Display */}
        {output && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border-2 border-emerald-300 dark:border-emerald-700">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                Reconstruction Result
              </h3>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm"
                  onClick={() => handleDownloadText(output, `reconstruction-output.txt`)}
                  data-testid="button-download-dw-output">
                  <Download className="w-4 h-4 mr-2" /> Download
                </Button>
                <CopyButton text={output} />
                <Button onClick={handleClear} variant="outline" size="sm" data-testid="button-clear-dw">
                  <Trash2 className="w-4 h-4 mr-1" /> Clear
                </Button>
              </div>
            </div>

            <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-sky-700 dark:text-sky-300">Input Words:</span>
                  <span className="text-lg font-bold text-sky-900 dark:text-sky-100">
                    {inputText.trim().split(/\s+/).filter((w: string) => w).length.toLocaleString()}
                  </span>
                </div>
                <span className="text-sky-400">|</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Output Words:</span>
                  <span className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                    {output.trim().split(/\s+/).filter((w: string) => w).length.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <TextStats text={output} showAiDetect={true} variant="prominent" targetWords={parseInt(targetWordCount) || undefined} />

            <Textarea value={output} readOnly className="min-h-[300px] font-mono text-sm mt-4"
              data-testid="textarea-dw-output"
            />
          </div>
        )}

        {/* Clear All */}
        <div className="mt-4 text-center">
          <Button onClick={handleClear} variant="outline"
            className="px-6 py-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 dark:hover:bg-red-900/20 flex items-center mx-auto"
            disabled={processing}
            data-testid="button-dw-clear-all">
            <Trash2 className="h-4 w-4 mr-2" />
            <span>New Analysis / Clear All</span>
          </Button>
        </div>
      </div>

      <StreamingOutputModal
        isOpen={streamingModalOpen}
        startNew={streamingStartNew}
        projectId={projectId}
        onClose={() => { setStreamingModalOpen(false); setStreamingStartNew(false); }}
        onComplete={(finalText: string) => { if (finalText) setOutput(stripMarkdown(finalText)); }}
      />
    </div>
  );
};

export default DissertationWizardPage;
