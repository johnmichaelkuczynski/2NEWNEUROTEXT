import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Download, X, Loader2, CheckCircle2, GripHorizontal, Minimize2, Maximize2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/use-credits";
import { getFreemiumPreview } from "@/lib/freemiumPreview";
import { PaywallOverlay } from "./PaywallOverlay";

interface StreamChunk {
  type: 'section_complete' | 'progress' | 'outline' | 'complete' | 'error';
  projectId?: number;
  sectionTitle?: string;
  chunkText?: string;
  sectionIndex?: number;
  totalChunks?: number;
  progress?: number;
  stage?: string;
  wordCount?: number;
  totalWordCount?: number;
  message?: string;
}

interface StreamingOutputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (finalText: string) => void;
  startNew?: boolean;
  projectId?: number | null;
}

export function StreamingOutputModal({ isOpen, onClose, onComplete, startNew = false, projectId }: StreamingOutputModalProps) {
  const [content, setContent] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [currentSection, setCurrentSection] = useState<string>('');
  const [sectionsCompleted, setSectionsCompleted] = useState(0);
  const [totalSections, setTotalSections] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<string>('');
  const hasStartedRef = useRef(false);
  const wordCountRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const projectIdRef = useRef<number | null>(null);
  const pollFallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsConnectedRef = useRef(false);
  const receivedAnyDataRef = useRef(false);
  const isCompleteRef = useRef(false);
  const { toast } = useToast();
  const toastRef = useRef(toast);
  const { hasCredits } = useCredits();
  const onCompleteRef = useRef(onComplete);
  const scrollToBottomRef = useRef<() => void>(() => {});

  useEffect(() => { toastRef.current = toast; }, [toast]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    projectIdRef.current = projectId ?? null;
  }, [projectId]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (panelRef.current) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y))
      });
    }
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => { scrollToBottomRef.current = scrollToBottom; }, [scrollToBottom]);

  const clearContent = useCallback(() => {
    setContent('');
    contentRef.current = '';
    wordCountRef.current = 0;
    setProgress(0);
    setCurrentSection('Connecting...');
    setSectionsCompleted(0);
    setTotalSections(0);
    setWordCount(0);
    setIsComplete(false);
    isCompleteRef.current = false;
    setCopied(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (isCompleteRef.current) return;

    if (startNew && !hasStartedRef.current) {
      clearContent();
      hasStartedRef.current = true;
    }
    
    setCurrentSection('Connecting...');
    wsConnectedRef.current = false;
    receivedAnyDataRef.current = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/cc-stream`;
    
    console.log('[StreamingModal] Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const stopPolling = () => {
      if (pollFallbackRef.current) {
        clearInterval(pollFallbackRef.current);
        pollFallbackRef.current = null;
      }
    };

    const markFailed = (errorMsg: string) => {
      isCompleteRef.current = true;
      setIsComplete(true);
      setProgress(0);
      setCurrentSection(`Error: ${errorMsg}`);
      stopPolling();
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      toastRef.current({
        title: "Processing Failed",
        description: errorMsg,
        variant: "destructive",
      });
    };

    const markComplete = (totalWords?: number) => {
      isCompleteRef.current = true;
      setIsComplete(true);
      setProgress(100);
      setCurrentSection('Generation complete!');
      stopPolling();
      const wc = totalWords || wordCountRef.current;
      if (totalWords !== undefined) {
        wordCountRef.current = totalWords;
        setWordCount(totalWords);
      }
      if (onCompleteRef.current && contentRef.current) {
        onCompleteRef.current(contentRef.current);
      }
      toastRef.current({
        title: "Generation Complete",
        description: `${wc.toLocaleString()} words generated successfully.`,
      });
    };

    const startPollingFallback = () => {
      if (pollFallbackRef.current || isCompleteRef.current) return;
      console.log('[StreamingModal] Starting polling fallback');
      pollFallbackRef.current = setInterval(async () => {
        if (isCompleteRef.current) { stopPolling(); return; }
        const pid = projectIdRef.current;
        if (!pid) return;
        try {
          const res = await fetch(`/api/reconstruction/${pid}`);
          if (!res.ok) return;
          const proj = await res.json();
          if (proj.status === 'completed' && proj.reconstructedText) {
            const wc = proj.reconstructedText.trim().split(/\s+/).length;
            wordCountRef.current = wc;
            setWordCount(wc);
            if (!contentRef.current) {
              contentRef.current = proj.reconstructedText;
              setContent(proj.reconstructedText);
            }
            markComplete(wc);
          } else if (proj.status === 'failed') {
            markFailed('Generation failed. Please try with a shorter document or fewer supporting files.');
          } else if (proj.status === 'processing' && proj.reconstructedText) {
            const wc = proj.reconstructedText.trim().split(/\s+/).length;
            wordCountRef.current = wc;
            setWordCount(wc);
            setCurrentSection(`Processing... ${wc.toLocaleString()} words generated so far`);
            if (!contentRef.current || contentRef.current.length < proj.reconstructedText.length) {
              contentRef.current = proj.reconstructedText;
              setContent(proj.reconstructedText);
            }
          } else {
            setCurrentSection('Processing... (waiting for streaming data)');
            setProgress(prev => Math.min(prev + 2, 15));
          }
        } catch (e) {
          console.error('[StreamingModal] Polling fallback error:', e);
        }
      }, 4000);
    };

    ws.onopen = () => {
      console.log('[StreamingModal] WebSocket connected');
      wsConnectedRef.current = true;
      if (!isCompleteRef.current) {
        setCurrentSection('Waiting for generation to start...');
      }
      setTimeout(() => {
        startPollingFallback();
      }, 3000);
    };

    ws.onerror = () => {
      console.warn('[StreamingModal] WebSocket error, starting polling fallback');
      if (!isCompleteRef.current) {
        startPollingFallback();
      }
    };

    ws.onclose = () => {
      wsConnectedRef.current = false;
    };

    ws.onmessage = (event) => {
      try {
        if (isCompleteRef.current) return;
        const data: StreamChunk = JSON.parse(event.data);
        
        if (data.projectId && projectIdRef.current && data.projectId !== projectIdRef.current) {
          return;
        }
        
        receivedAnyDataRef.current = true;
        console.log('[StreamingModal] Received:', data.type);

        switch (data.type) {
          case 'progress':
            if (data.sectionTitle) {
              setCurrentSection(data.sectionTitle);
            }
            if (data.progress !== undefined) {
              setProgress(data.progress);
            }
            break;
            
          case 'outline':
            setCurrentSection('Skeleton/outline generated, starting sections...');
            if (data.totalChunks) {
              setTotalSections(data.totalChunks);
            }
            if (data.chunkText) {
              setContent(prev => {
                const outlineHeader = '=== DOCUMENT SKELETON ===\n\n';
                const newContent = outlineHeader + data.chunkText + '\n\n=== GENERATING SECTIONS ===\n';
                contentRef.current = newContent;
                return newContent;
              });
              setTimeout(() => scrollToBottomRef.current(), 100);
            }
            break;

          case 'section_complete':
            if (data.chunkText) {
              setContent(prev => {
                const newContent = prev ? prev + '\n\n' + data.chunkText : data.chunkText || '';
                contentRef.current = newContent;
                return newContent;
              });
            }
            if (data.sectionTitle) {
              setCurrentSection(`Completed: ${data.sectionTitle}`);
            }
            if (data.sectionIndex !== undefined) {
              setSectionsCompleted(data.sectionIndex + 1);
            }
            if (data.totalChunks) {
              setTotalSections(data.totalChunks);
            }
            if (data.progress !== undefined) {
              setProgress(data.progress);
            }
            if (data.totalWordCount !== undefined) {
              wordCountRef.current = data.totalWordCount;
              setWordCount(data.totalWordCount);
            }
            setTimeout(() => scrollToBottomRef.current(), 100);
            break;

          case 'complete':
            markComplete(data.totalWordCount);
            break;

          case 'error':
            markFailed(data.sectionTitle || data.message || 'Generation failed');
            break;
        }
      } catch (err) {
        console.error('[StreamingModal] Parse error:', err);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;
      stopPolling();
    };
  }, [isOpen, startNew, clearContent]);

  useEffect(() => {
    if (!startNew) {
      hasStartedRef.current = false;
    }
  }, [startNew]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Content copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleSave = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neurotext-output-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Saved!",
      description: "File downloaded successfully.",
    });
  };

  const handleClose = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    if (isComplete && content && onComplete) {
      onComplete(content);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bg-background border rounded-lg shadow-xl flex flex-col"
      style={{
        left: position.x,
        top: position.y,
        width: isMinimized ? '350px' : '800px',
        height: isMinimized ? 'auto' : '500px',
        maxWidth: 'calc(100vw - 40px)',
        maxHeight: 'calc(100vh - 40px)',
      }}
      data-testid="streaming-output-panel"
    >
      {/* Draggable header */}
      <div
        className="flex items-center justify-between gap-2 p-3 border-b cursor-move select-none bg-muted/50 rounded-t-lg"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GripHorizontal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          {isComplete && currentSection.startsWith('Error:') ? (
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
          ) : isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
          )}
          <span className="font-medium text-sm truncate">
            {isComplete && currentSection.startsWith('Error:') ? 'Failed' : isComplete ? 'Complete' : 'Generating...'}
          </span>
          {!isMinimized && (
            <span className="text-xs text-muted-foreground">
              {sectionsCompleted}/{totalSections} sections
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
            disabled={!content}
            data-testid="button-copy-stream"
          >
            {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleSave}
            disabled={!content}
            data-testid="button-save-stream"
          >
            <Download className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsMinimized(!isMinimized)}
            data-testid="button-minimize-stream"
          >
            {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleClose}
            data-testid="button-close-stream"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div className="flex flex-col gap-2 p-3 border-b">
            <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
              <span className="truncate">{currentSection}</span>
              <span className="flex-shrink-0">
                {wordCount > 0 && `${wordCount.toLocaleString()} words`}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <ScrollArea className="flex-1 p-4">
            <div ref={scrollRef} className="whitespace-pre-wrap font-mono text-sm">
              {content ? (
                <>
                  {(() => {
                    const preview = getFreemiumPreview(content, hasCredits);
                    return (
                      <>
                        {preview.visibleContent}
                        {preview.isTruncated && isComplete && (
                          <PaywallOverlay
                            totalWords={preview.totalWords}
                            visibleWords={preview.visibleWords}
                            percentageShown={preview.percentageShown}
                          />
                        )}
                      </>
                    );
                  })()}
                </>
              ) : (
                <span className={`italic ${currentSection.startsWith('Error:') ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {currentSection.startsWith('Error:') 
                    ? currentSection
                    : 'Waiting for content... The document will appear here section by section as it is generated.'}
                </span>
              )}
            </div>
          </ScrollArea>
        </>
      )}

      {isMinimized && (
        <div className="p-2 text-xs text-muted-foreground">
          <Progress value={progress} className="h-1 mb-1" />
          {wordCount > 0 && `${wordCount.toLocaleString()} words`}
        </div>
      )}
    </div>
  );
}
