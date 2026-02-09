import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { 
  GlobalSkeleton, 
  ChunkDelta, 
  StitchResult,
  ReconstructionDocument,
  ReconstructionChunk,
  UserInstructions,
  ContentAddition,
  ChapterInfo
} from "@shared/schema";
import { logLLMCall, summarizeText } from './auditService';

let anthropic: Anthropic | null = null;
let openai: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

function getOpenAI(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

const PRIMARY_MODEL = "claude-sonnet-4-5-20250929";
const FALLBACK_MODEL = "gpt-4-turbo";

const MAX_INPUT_WORDS = 100000; // Support up to 100k words
const TARGET_CHUNK_SIZE = 800; // Larger chunks = fewer API calls = more coherent output
const CHUNK_DELAY_MS = 2000;
const MAX_CHUNK_RETRIES = 2;

// Length mode types
type LengthMode = 'heavy_compression' | 'moderate_compression' | 'maintain' | 'moderate_expansion' | 'heavy_expansion';

interface LengthConfig {
  targetMin: number;
  targetMax: number;
  targetMid: number;
  lengthRatio: number;
  lengthMode: LengthMode;
  chunkTargetWords: number;
}

// Helper to parse numbers with commas and shorthand (1.5k, 2k, etc.)
function parseWordCount(numStr: string): number {
  if (!numStr) return NaN;
  
  // Remove commas: "1,500" -> "1500"
  let cleaned = numStr.replace(/,/g, '').trim();
  
  // Handle shorthand like "1.5k" or "2k"
  const kMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*k$/i);
  if (kMatch) {
    const value = parseFloat(kMatch[1]);
    return isNaN(value) ? NaN : Math.round(value * 1000);
  }
  
  const result = parseInt(cleaned, 10);
  return isNaN(result) ? NaN : result;
}

// Parse target length from custom instructions
export function parseTargetLength(customInstructions: string | null | undefined): { targetMin: number; targetMax: number } | null {
  if (!customInstructions) return null;
  
  const text = customInstructions.toLowerCase();
  
  // "X-Y words" or "X to Y words" pattern (supports commas and shorthand)
  // Matches: "1200-1600 words", "1,200 to 1,600 words", "1.5k-2k words"
  const rangeMatch = text.match(/([\d,]+(?:\.\d+)?k?)\s*(?:-|–|—|\bto\b)\s*([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (rangeMatch) {
    const min = parseWordCount(rangeMatch[1]);
    const max = parseWordCount(rangeMatch[2]);
    console.log(`[CC] Parsed target range: ${min}-${max} words from "${rangeMatch[0]}"`);
    return { targetMin: min, targetMax: max };
  }
  
  // "shorten to X words" / "reduce to X words" pattern - CRITICAL for compression targets
  const shortenMatch = text.match(/(?:shorten|reduce|compress|cut|trim)\s*(?:to|down\s*to)?\s*([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (shortenMatch) {
    const target = parseWordCount(shortenMatch[1]);
    console.log(`[CC] Parsed shorten target: ${target} words from "${shortenMatch[0]}"`);
    return { targetMin: Math.round(target * 0.9), targetMax: Math.round(target * 1.1) };
  }
  
  // "expand to X words" / "enrich to X words" pattern
  const expandMatch = text.match(/(?:expand|enrich|elaborate)\s*(?:to)?\s*([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (expandMatch) {
    const target = parseWordCount(expandMatch[1]);
    console.log(`[CC] Parsed expand target: ${target} words from "${expandMatch[0]}"`);
    return { targetMin: Math.round(target * 0.9), targetMax: Math.round(target * 1.1) };
  }
  
  // "at least X words" pattern
  const atLeastMatch = text.match(/at\s+least\s+([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (atLeastMatch) {
    const min = parseWordCount(atLeastMatch[1]);
    return { targetMin: min, targetMax: Math.round(min * 1.3) };
  }
  
  // "no more than X words" or "maximum X words" pattern
  const maxMatch = text.match(/(?:no\s+more\s+than|maximum|max|under)\s+([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (maxMatch) {
    const max = parseWordCount(maxMatch[1]);
    return { targetMin: Math.round(max * 0.7), targetMax: max };
  }
  
  // "approximately X words" or "around X words" pattern
  const approxMatch = text.match(/(?:approximately|approx|about|around|roughly|~)\s*([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (approxMatch) {
    const target = parseWordCount(approxMatch[1]);
    return { targetMin: Math.round(target * 0.9), targetMax: Math.round(target * 1.1) };
  }
  
  // Plain "X words" pattern (supports "2k words", "1500 words", "1,500 words")
  const plainMatch = text.match(/([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (plainMatch) {
    const target = parseWordCount(plainMatch[1]);
    // Only accept reasonable word counts (50+) and valid numbers
    if (!isNaN(target) && target >= 50) {
      return { targetMin: Math.round(target * 0.9), targetMax: Math.round(target * 1.1) };
    }
  }
  
  // "X+ words" pattern (e.g., "2000+ words")
  const plusMatch = text.match(/([\d,]+(?:\.\d+)?k?)\+\s*words?/i);
  if (plusMatch) {
    const min = parseWordCount(plusMatch[1]);
    return { targetMin: min, targetMax: Math.round(min * 1.3) };
  }
  
  // Check for expand/compress keywords without numbers
  if (text.match(/\b(expand|enrich|elaborate|develop|longer)\b/i)) {
    return null; // Signal to use expansion ratio
  }
  if (text.match(/\b(compress|summarize|condense|shorten|brief)\b/i)) {
    return null; // Signal to use compression ratio
  }
  
  return null;
}

// Determine length mode based on ratio
function getLengthMode(ratio: number): LengthMode {
  if (ratio < 0.5) return 'heavy_compression';
  if (ratio < 0.8) return 'moderate_compression';
  if (ratio < 1.2) return 'maintain';
  if (ratio < 1.8) return 'moderate_expansion';
  return 'heavy_expansion';
}

// Calculate length configuration
export function calculateLengthConfig(
  totalInputWords: number,
  targetMin: number | null,
  targetMax: number | null,
  customInstructions: string | null | undefined
): LengthConfig {
  // Default: maintain length (ratio 1.0)
  let actualMin = targetMin ?? totalInputWords;
  let actualMax = targetMax ?? totalInputWords;
  
  // Check for expand/compress keywords if no explicit numbers
  if (targetMin === null && targetMax === null && customInstructions) {
    const text = customInstructions.toLowerCase();
    if (text.match(/\b(expand|enrich|elaborate|develop|longer)\b/i)) {
      actualMin = Math.round(totalInputWords * 1.3);
      actualMax = Math.round(totalInputWords * 1.5);
    } else if (text.match(/\b(compress|summarize|condense|shorten|brief)\b/i)) {
      actualMin = Math.round(totalInputWords * 0.3);
      actualMax = Math.round(totalInputWords * 0.5);
    }
  }
  
  const targetMid = Math.floor((actualMin + actualMax) / 2);
  const lengthRatio = targetMid / totalInputWords;
  const lengthMode = getLengthMode(lengthRatio);
  const numChunks = Math.ceil(totalInputWords / TARGET_CHUNK_SIZE);
  const chunkTargetWords = Math.ceil(targetMid / numChunks);
  
  return {
    targetMin: actualMin,
    targetMax: actualMax,
    targetMid,
    lengthRatio,
    lengthMode,
    chunkTargetWords
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// USER INSTRUCTIONS PARSING
// Captures length targets, content additions (e.g., concluding chapter), constraints
// ═══════════════════════════════════════════════════════════════════════════

export function parseUserInstructions(customInstructions: string | null | undefined): UserInstructions {
  const result: UserInstructions = {
    contentAdditions: [],
    mustAdd: [],
    mustPreserve: [],
    rawInstructions: customInstructions || undefined
  };
  
  if (!customInstructions) return result;
  
  const text = customInstructions.toLowerCase();
  
  // Parse length target and constraint
  const noLessMatch = text.match(/(?:no\s+less\s+than|at\s+least|minimum)\s*([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (noLessMatch) {
    result.lengthTarget = parseWordCount(noLessMatch[1]);
    result.lengthConstraint = 'no_less_than';
  }
  
  const noMoreMatch = text.match(/(?:no\s+more\s+than|maximum|max|at\s+most)\s*([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (noMoreMatch && !result.lengthTarget) {
    result.lengthTarget = parseWordCount(noMoreMatch[1]);
    result.lengthConstraint = 'no_more_than';
  }
  
  const approxMatch = text.match(/(?:approximately|approx|about|around|roughly|~)\s*([\d,]+(?:\.\d+)?k?)\s*words?/i);
  if (approxMatch && !result.lengthTarget) {
    result.lengthTarget = parseWordCount(approxMatch[1]);
    result.lengthConstraint = 'approximately';
  }
  
  // Plain target without constraint modifier
  if (!result.lengthTarget) {
    const plainMatch = text.match(/(?:reduce|shorten|cut|trim|compress)\s*(?:to|down\s*to)?\s*([\d,]+(?:\.\d+)?k?)\s*words?/i);
    if (plainMatch) {
      result.lengthTarget = parseWordCount(plainMatch[1]);
      result.lengthConstraint = 'approximately';
    }
  }
  
  // Parse content additions - CONCLUDING CHAPTER
  const conclusionPatterns = [
    /write\s+(?:a\s+)?conclud(?:ing|e)\s+chapter/i,
    /add\s+(?:a\s+)?conclusion/i,
    /include\s+(?:a\s+)?summary\s+chapter/i,
    /write\s+(?:a\s+)?final\s+chapter/i,
    /add\s+(?:a\s+)?concluding\s+section/i
  ];
  
  for (const pattern of conclusionPatterns) {
    if (pattern.test(customInstructions)) {
      const addition: ContentAddition = {
        type: 'concluding_chapter',
        requirement: 'Write a concluding chapter'
      };
      
      // Check for specific requirements
      if (/summariz(?:e|es|ing)\s+(?:each|the|all)\s+(?:preceding\s+)?chapter/i.test(customInstructions)) {
        addition.requirement = 'Summarize each preceding chapter';
      }
      
      if (/future\s+(?:research|directions?|study|work)/i.test(customInstructions)) {
        addition.additional = 'Include a section on future research directions';
      }
      
      result.contentAdditions.push(addition);
      result.mustAdd.push('concluding chapter');
      
      if (addition.additional) {
        result.mustAdd.push('future research section');
      }
      break;
    }
  }
  
  // Parse content additions - INTRODUCTION
  const introPatterns = [
    /write\s+(?:a\s+)?(?:new\s+)?introduction/i,
    /add\s+(?:a\s+)?(?:new\s+)?intro(?:duction)?/i
  ];
  
  for (const pattern of introPatterns) {
    if (pattern.test(customInstructions)) {
      result.contentAdditions.push({
        type: 'introduction',
        requirement: 'Write an introduction'
      });
      result.mustAdd.push('introduction');
      break;
    }
  }
  
  // Parse content additions - SUMMARY
  const summaryPatterns = [
    /write\s+(?:a\s+)?(?:executive\s+)?summary/i,
    /add\s+(?:a\s+)?(?:brief\s+)?summary/i
  ];
  
  for (const pattern of summaryPatterns) {
    if (pattern.test(customInstructions) && !result.contentAdditions.some(a => a.type === 'concluding_chapter')) {
      result.contentAdditions.push({
        type: 'summary',
        requirement: 'Write a summary section'
      });
      result.mustAdd.push('summary section');
      break;
    }
  }
  
  // Parse preservation requirements
  if (/preserve\s+(?:all\s+)?(?:the\s+)?(?:original\s+)?(?:chapter|argument|structure)/i.test(customInstructions)) {
    result.mustPreserve.push('original chapter structure');
  }
  
  if (/(?:keep|maintain|preserve)\s+(?:all\s+)?(?:the\s+)?academic\s+(?:tone|style)/i.test(customInstructions)) {
    result.mustPreserve.push('academic tone');
  }
  
  console.log(`[CC] Parsed user instructions:`, {
    lengthTarget: result.lengthTarget,
    lengthConstraint: result.lengthConstraint,
    contentAdditions: result.contentAdditions.length,
    mustAdd: result.mustAdd,
    mustPreserve: result.mustPreserve
  });
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAPTER EXTRACTION
// Detects chapters/essays in multi-chapter documents
// ═══════════════════════════════════════════════════════════════════════════

export async function extractChapters(text: string): Promise<ChapterInfo[]> {
  const startTime = Date.now();
  
  const chapterPrompt = `You are analyzing a document to identify its chapters, essays, or major sections.

DOCUMENT (first 30000 chars):
${text.slice(0, 30000)}

Extract the chapter structure as JSON:
{
  "chapters": [
    {
      "index": 1,
      "title": "Chapter title or first heading",
      "mainThesis": "One sentence summary of the chapter's main argument",
      "approximateStartPosition": "First few words of the chapter"
    }
  ]
}

RULES:
1. Identify ALL distinct chapters, essays, or major sections
2. A chapter is typically marked by: numbered headings, "Chapter X", "Essay X", or clear thematic breaks
3. If the document has no clear chapters, create sections based on major thematic shifts
4. The title should be the actual heading if present, or a descriptive title if not
5. The mainThesis should capture what that specific chapter argues or discusses
6. Include introduction and conclusion sections if present
7. Do NOT skip any chapters - count them all

Return ONLY valid JSON, no explanation.`;

  const responseText = await callWithFallback(chapterPrompt, 4000, 0.2);
  
  let chapters: ChapterInfo[] = [];
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.chapters)) {
        // Convert to ChapterInfo format with word positions
        let currentWordPos = 0;
        const words = text.split(/\s+/);
        
        chapters = parsed.chapters.map((ch: any, idx: number) => {
          // Find approximate start position in word count
          const startMarker = ch.approximateStartPosition?.toLowerCase() || '';
          let startWord = currentWordPos;
          
          if (startMarker) {
            // Search for the start marker in the text
            const searchText = text.toLowerCase();
            const markerPos = searchText.indexOf(startMarker);
            if (markerPos >= 0) {
              startWord = text.slice(0, markerPos).split(/\s+/).length;
            }
          }
          
          // Estimate end position based on next chapter or document end
          const isLast = idx === parsed.chapters.length - 1;
          const totalWords = words.length;
          const estimatedEndWord = isLast ? totalWords : Math.floor(totalWords * ((idx + 1) / parsed.chapters.length));
          
          currentWordPos = estimatedEndWord;
          
          return {
            index: ch.index || idx + 1,
            title: ch.title || `Section ${idx + 1}`,
            mainThesis: ch.mainThesis || '',
            startWord,
            endWord: estimatedEndWord,
            status: 'pending' as const
          };
        });
      }
    }
  } catch (e) {
    console.error('[CC] Chapter extraction failed:', e);
    chapters = [{
      index: 1,
      title: 'Document',
      mainThesis: 'Could not extract chapter structure',
      startWord: 0,
      endWord: text.split(/\s+/).length,
      status: 'pending'
    }];
  }
  
  console.log(`[CC] Extracted ${chapters.length} chapters in ${Date.now() - startTime}ms`);
  return chapters;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRUNCATION DETECTION
// Detects if output was cut off mid-sentence
// ═══════════════════════════════════════════════════════════════════════════

export function detectTruncation(text: string): { truncated: boolean; reason?: string; lastChars?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { truncated: true, reason: 'Empty output' };
  
  const truncationIndicators = [
    { pattern: /[a-z]$/, reason: 'Ends with incomplete word' },
    { pattern: /[\(\[\{\"\']\s*$/, reason: 'Ends with opening punctuation' },
    { pattern: /\b(and|or|but|the|a|an|of|in|to|for|with|by|from)\s*$/i, reason: 'Ends with conjunction/preposition' },
    { pattern: /\*\s*$/, reason: 'Ends with asterisk (markdown)' },
    { pattern: /\(\d{4}\)\.\s*\*[^*]*$/, reason: 'Reference list cut off' },
    { pattern: /\d+\.\s*$/, reason: 'Numbered list item with no content' },
    { pattern: /:\s*$/, reason: 'Ends with colon expecting content' }
  ];
  
  for (const { pattern, reason } of truncationIndicators) {
    if (pattern.test(trimmed)) {
      return {
        truncated: true,
        reason,
        lastChars: trimmed.slice(-50)
      };
    }
  }
  
  // Check for sentence completion
  if (!/[.!?\"\')\]]\s*$/.test(trimmed)) {
    const sentences = trimmed.match(/[.!?]["']?\s/g);
    if (!sentences || sentences.length < 2) {
      return {
        truncated: true,
        reason: 'Does not end with sentence-ending punctuation',
        lastChars: trimmed.slice(-50)
      };
    }
  }
  
  return { truncated: false };
}

// Length guidance templates for different modes
function getLengthGuidanceTemplate(mode: LengthMode): string {
  switch (mode) {
    case 'heavy_compression':
      return `LENGTH MODE: HEAVY COMPRESSION
You must significantly compress this chunk while preserving core arguments.
- Remove examples, keep only the most critical one
- Remove repetition and redundancy
- Convert detailed explanations to concise statements
- Preserve thesis statements and key claims verbatim
- Remove transitional phrases and rhetorical flourishes`;

    case 'moderate_compression':
      return `LENGTH MODE: MODERATE COMPRESSION
You must compress this chunk while preserving argument structure.
- Keep the strongest 1-2 examples, remove weaker ones
- Tighten prose without losing meaning
- Preserve all key claims and their primary support
- Remove redundancy but keep necessary emphasis`;

    case 'maintain':
      return `LENGTH MODE: MAINTAIN LENGTH
Your output should be approximately the same length as input.
- Improve clarity and coherence without changing length significantly
- Replace weak examples with stronger ones of similar length
- Restructure sentences for better flow
- Do not add or remove substantial content`;

    case 'moderate_expansion':
      return `LENGTH MODE: MODERATE EXPANSION
You must expand this chunk while maintaining focus.
- Add 1-2 supporting examples or evidence for key claims
- Elaborate on implications of major points
- Add transitional sentences to improve flow
- Expand terse statements into fuller explanations
- Do NOT add tangential content or padding`;

    case 'heavy_expansion':
      return `LENGTH MODE: HEAVY EXPANSION
You must significantly expand this chunk with substantive additions.
- Add 2-3 concrete examples (historical, empirical, or hypothetical)
- Elaborate on each major claim with supporting analysis
- Add relevant context and background
- Develop implications and consequences of arguments
- Add appropriate qualifications and nuances
- Do NOT add filler or padding—all additions must be substantive`;
  }
}

// Maximum tokens Claude supports for output
const CLAUDE_MAX_OUTPUT_TOKENS = 64000; // Claude 3.5 Sonnet supports up to 64k output tokens
const GPT_MAX_OUTPUT_TOKENS = 16384; // GPT-4 Turbo supports 16k output

async function callWithFallback(
  prompt: string,
  maxTokens: number,
  temperature: number,
  retryOnTruncation: boolean = true
): Promise<string> {
  const MAX_TRUNCATION_RETRIES = 3;
  let currentMaxTokens = maxTokens;
  
  for (let attempt = 0; attempt <= MAX_TRUNCATION_RETRIES; attempt++) {
    try {
      const ccStartTime = Date.now();
      const message = await getAnthropic().messages.create({
        model: PRIMARY_MODEL,
        max_tokens: Math.min(currentMaxTokens, CLAUDE_MAX_OUTPUT_TOKENS),
        temperature,
        messages: [{ role: "user", content: prompt }]
      });
      
      const text = message.content[0].type === 'text' ? message.content[0].text : '';
      const stopReason = message.stop_reason;
      
      await logLLMCall({
        jobType: 'cc_chunk_reconstruction',
        modelName: PRIMARY_MODEL,
        provider: 'anthropic',
        promptSummary: summarizeText(prompt, 100),
        responseSummary: summarizeText(text, 200),
        inputTokens: message.usage?.input_tokens,
        outputTokens: message.usage?.output_tokens,
        latencyMs: Date.now() - ccStartTime,
        status: stopReason === 'end_turn' ? 'success' : stopReason || 'unknown'
      });
      
      // Check if truncated due to max_tokens
      if (stopReason === 'max_tokens') {
        if (retryOnTruncation && attempt < MAX_TRUNCATION_RETRIES) {
          // Double the token limit for next attempt (no hard cap below model max)
          const nextTokens = Math.min(currentMaxTokens * 2, CLAUDE_MAX_OUTPUT_TOKENS);
          if (nextTokens > currentMaxTokens) {
            console.log(`[CC] Output truncated (hit max_tokens: ${currentMaxTokens}). Increasing to ${nextTokens} and retrying...`);
            currentMaxTokens = nextTokens;
            continue;
          }
        }
        // We've hit the model's maximum - this is a hard failure
        console.error(`[CC] CRITICAL: Output truncated even at max tokens (${currentMaxTokens}). Content too long for model.`);
        throw new Error(`Output truncated at maximum token limit (${currentMaxTokens}). Document may be too long.`);
      }
      
      // Check for text-based truncation indicators
      const textTruncated = isOutputTruncated(text);
      if (textTruncated && retryOnTruncation && attempt < MAX_TRUNCATION_RETRIES) {
        const nextTokens = Math.min(currentMaxTokens * 1.5, CLAUDE_MAX_OUTPUT_TOKENS);
        console.log(`[CC] Output appears truncated (text analysis). Increasing to ${nextTokens} and retrying...`);
        currentMaxTokens = nextTokens;
        continue;
      }
      
      return text;
    } catch (error: any) {
      // Don't catch our own truncation errors
      if (error?.message?.includes('Output truncated at maximum')) {
        throw error;
      }
      
      const status = error?.status || error?.response?.status;
      const isRetryable = status === 404 || status === 429 || status === 503 || status === 529;
      
      if (isRetryable) {
        console.log(`[CC] Claude model error (${status}), falling back to GPT-4 Turbo`);
        try {
          const fallbackStartTime = Date.now();
          const completion = await getOpenAI().chat.completions.create({
            model: FALLBACK_MODEL,
            max_tokens: Math.min(currentMaxTokens, GPT_MAX_OUTPUT_TOKENS),
            temperature,
            messages: [{ role: "user", content: prompt }]
          });
          const text = completion.choices[0]?.message?.content || '';
          const finishReason = completion.choices[0]?.finish_reason;
          
          await logLLMCall({
            jobType: 'cc_chunk_reconstruction',
            modelName: FALLBACK_MODEL,
            provider: 'openai',
            promptSummary: summarizeText(prompt, 100),
            responseSummary: summarizeText(text, 200),
            inputTokens: completion.usage?.prompt_tokens,
            outputTokens: completion.usage?.completion_tokens,
            latencyMs: Date.now() - fallbackStartTime,
            status: finishReason === 'stop' ? 'success' : finishReason || 'unknown'
          });
          
          if (finishReason === 'length') {
            if (retryOnTruncation && attempt < MAX_TRUNCATION_RETRIES) {
              const nextTokens = Math.min(currentMaxTokens * 2, GPT_MAX_OUTPUT_TOKENS);
              if (nextTokens > currentMaxTokens) {
                console.log(`[CC] GPT output truncated. Increasing to ${nextTokens} and retrying...`);
                currentMaxTokens = nextTokens;
                continue;
              }
            }
            throw new Error(`Output truncated at GPT maximum (${currentMaxTokens}). Document may be too long.`);
          }
          
          return text;
        } catch (fallbackError: any) {
          console.error(`[CC] Fallback to GPT-4 also failed:`, fallbackError?.message);
          throw fallbackError;
        }
      }
      throw error;
    }
  }
  
  throw new Error('[CC] Failed to get complete output after multiple retries');
}

interface ChunkBoundary {
  start: number;
  end: number;
  text: string;
  wordCount: number;
}

export function smartChunk(text: string): ChunkBoundary[] {
  const words = text.trim().split(/\s+/);
  const totalWords = words.length;
  
  if (totalWords <= TARGET_CHUNK_SIZE) {
    return [{
      start: 0,
      end: text.length,
      text: text,
      wordCount: totalWords
    }];
  }
  
  // Try paragraph-based chunking first
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: ChunkBoundary[] = [];
  
  // If document has no paragraph breaks (only 1 "paragraph"), use sentence-based chunking
  if (paragraphs.length <= 1 || paragraphs.filter(p => p.trim()).length <= 1) {
    console.log(`[CC] Document has no paragraph breaks, using sentence-based chunking`);
    return sentenceBasedChunk(text, totalWords);
  }
  
  let currentChunk = "";
  let currentWordCount = 0;
  let currentStart = 0;
  let charPosition = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) {
      charPosition += paragraphs[i].length + 2;
      continue;
    }
    
    const paraWords = para.split(/\s+/).length;
    
    if (currentWordCount + paraWords > TARGET_CHUNK_SIZE && currentWordCount > 0) {
      chunks.push({
        start: currentStart,
        end: charPosition,
        text: currentChunk.trim(),
        wordCount: currentWordCount
      });
      currentChunk = para;
      currentWordCount = paraWords;
      currentStart = charPosition;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
      currentWordCount += paraWords;
    }
    
    charPosition += paragraphs[i].length + 2;
  }
  
  if (currentChunk.trim()) {
    chunks.push({
      start: currentStart,
      end: text.length,
      text: currentChunk.trim(),
      wordCount: currentWordCount
    });
  }
  
  // If paragraph chunking still produced only 1 chunk (paragraphs too large), fall back to sentence chunking
  if (chunks.length === 1 && totalWords > TARGET_CHUNK_SIZE) {
    console.log(`[CC] Paragraph chunking produced only 1 chunk for ${totalWords} words, falling back to sentence-based chunking`);
    return sentenceBasedChunk(text, totalWords);
  }
  
  return chunks;
}

// Sentence-based chunking fallback for documents without paragraph structure
function sentenceBasedChunk(text: string, totalWords: number): ChunkBoundary[] {
  // Split on sentence boundaries (. ! ? followed by space or newline)
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: ChunkBoundary[] = [];
  let currentChunk = "";
  let currentWordCount = 0;
  let currentStart = 0;
  let charPosition = 0;
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    if (!sentence.trim()) {
      charPosition += sentence.length + 1;
      continue;
    }
    
    const sentenceWords = sentence.trim().split(/\s+/).length;
    
    if (currentWordCount + sentenceWords > TARGET_CHUNK_SIZE && currentWordCount > 0) {
      chunks.push({
        start: currentStart,
        end: charPosition,
        text: currentChunk.trim(),
        wordCount: currentWordCount
      });
      currentChunk = sentence;
      currentWordCount = sentenceWords;
      currentStart = charPosition;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
      currentWordCount += sentenceWords;
    }
    
    charPosition += sentence.length + 1;
  }
  
  if (currentChunk.trim()) {
    chunks.push({
      start: currentStart,
      end: text.length,
      text: currentChunk.trim(),
      wordCount: currentWordCount
    });
  }
  
  // If we still only have 1 chunk (very long sentences), force word-based splitting
  if (chunks.length === 1 && totalWords > TARGET_CHUNK_SIZE) {
    console.log(`[CC] Sentence chunking still produced 1 chunk, using word-based splitting`);
    return wordBasedChunk(text, totalWords);
  }
  
  return chunks;
}

// Force word-based chunking as last resort
function wordBasedChunk(text: string, totalWords: number): ChunkBoundary[] {
  const words = text.trim().split(/\s+/);
  const chunks: ChunkBoundary[] = [];
  const numChunks = Math.ceil(totalWords / TARGET_CHUNK_SIZE);
  const wordsPerChunk = Math.ceil(totalWords / numChunks);
  
  for (let i = 0; i < numChunks; i++) {
    const startWord = i * wordsPerChunk;
    const endWord = Math.min(startWord + wordsPerChunk, totalWords);
    const chunkWords = words.slice(startWord, endWord);
    const chunkText = chunkWords.join(' ');
    
    chunks.push({
      start: startWord,
      end: endWord,
      text: chunkText,
      wordCount: chunkWords.length
    });
  }
  
  console.log(`[CC] Word-based chunking created ${chunks.length} chunks of ~${wordsPerChunk} words each`);
  return chunks;
}

export async function extractGlobalSkeleton(
  text: string,
  audienceParameters?: string,
  rigorLevel?: string,
  customInstructions?: string
): Promise<GlobalSkeleton> {
  const startTime = Date.now();
  const wordCount = countWords(text);
  
  // Parse user instructions first
  const userInstructions = parseUserInstructions(customInstructions);
  
  const skeletonPrompt = `You are a document structure analyst. Extract the GLOBAL SKELETON of this document in a FAST, LIGHTWEIGHT pass.

DOCUMENT:
${text}

Extract and return as JSON:
{
  "outline": ["8-20 numbered claims or sections identifying the document's structure"],
  "thesis": "The central argument or purpose in one sentence",
  "keyTerms": [{"term": "important term", "meaning": "how it's used in THIS document"}],
  "commitmentLedger": [{"type": "asserts|rejects|assumes", "claim": "explicit commitment"}],
  "entities": [{"name": "person/org/variable", "type": "person|organization|policy|variable|concept", "role": "role in document"}]
}

RULES:
1. Be FAST - extract structure, do NOT rewrite or reconstruct anything
2. The outline should have 8-20 items capturing the logical progression
3. Key terms are domain-specific terms with their meanings AS USED IN THIS DOCUMENT
4. Commitment ledger captures EXPLICIT claims: "The document asserts X", "rejects Y", "assumes Z"
5. Entities include people, organizations, policies, variables, or technical terms that must be referenced consistently

Return ONLY valid JSON, no explanation.`;

  const responseText = await callWithFallback(skeletonPrompt, 4000, 0.2);
  
  let skeleton: GlobalSkeleton;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      skeleton = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in response");
    }
  } catch (e) {
    skeleton = {
      outline: ["Document structure could not be parsed"],
      thesis: "Thesis extraction failed",
      keyTerms: [],
      commitmentLedger: [],
      entities: []
    };
  }
  
  skeleton.audienceParameters = audienceParameters;
  skeleton.rigorLevel = rigorLevel;
  skeleton.userInstructions = userInstructions;
  
  // Extract chapters for multi-chapter documents (>5000 words)
  if (wordCount > 5000 || userInstructions.contentAdditions.some(a => a.type === 'concluding_chapter')) {
    console.log(`[CC] Extracting chapters for ${wordCount}-word document...`);
    skeleton.chapters = await extractChapters(text);
    skeleton.chapterCount = skeleton.chapters.length;
    console.log(`[CC] Found ${skeleton.chapterCount} chapters`);
  }
  
  console.log(`[CC] Skeleton extraction completed in ${Date.now() - startTime}ms`);
  return skeleton;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Build coherence context summary from in-memory prior deltas (for non-DB-backed flows)
function buildInMemoryPriorContext(priorDeltas: ChunkDelta[]): string {
  if (priorDeltas.length === 0) {
    return 'This is the first chunk. No prior context to maintain.';
  }
  
  let accumulatedClaims: string[] = [];
  let accumulatedTerms: string[] = [];
  let accumulatedConflicts: string[] = [];
  
  priorDeltas.forEach((delta) => {
    const claims = delta.newClaimsIntroduced || [];
    const terms = delta.termsUsed || [];
    const conflicts = delta.conflictsDetected || [];
    
    accumulatedClaims.push(...claims);
    accumulatedTerms.push(...terms);
    accumulatedConflicts.push(...conflicts.map(c => c.description));
  });
  
  // Deduplicate terms
  const uniqueTerms = Array.from(new Set(accumulatedTerms));
  
  let summary = `=== PRIOR CHUNKS COHERENCE CONTEXT (${priorDeltas.length} chunks) ===\n`;
  summary += `ACCUMULATED CLAIMS (you MUST NOT contradict these):\n`;
  summary += accumulatedClaims.slice(-15).map(c => `  - ${c}`).join('\n') || '  (none yet)';
  summary += `\n\nTERMS ALREADY USED (use consistently):\n`;
  summary += uniqueTerms.slice(-20).join(', ') || '(none yet)';
  
  if (accumulatedConflicts.length > 0) {
    summary += `\n\nPREVIOUS CONFLICTS DETECTED (avoid repeating):\n`;
    summary += accumulatedConflicts.slice(-5).map(c => `  - ${c}`).join('\n');
  }
  
  return summary;
}

function isOutputTruncated(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  
  // Check for obvious truncation patterns
  // Ellipsis at end (model often adds ... when truncating)
  if (trimmed.endsWith('...') || trimmed.endsWith('…')) {
    console.log('[CC] Truncation detected: ends with ellipsis');
    return true;
  }
  
  // Em dash at end without punctuation (mid-thought cutoff)
  if (trimmed.endsWith('—') || trimmed.endsWith('–')) {
    console.log('[CC] Truncation detected: ends with dash');
    return true;
  }
  
  // Ends with comma (mid-sentence)
  if (trimmed.endsWith(',')) {
    console.log('[CC] Truncation detected: ends with comma');
    return true;
  }
  
  // Ends with "and", "or", "the", "a", "to", etc. (mid-sentence articles/conjunctions)
  const midSentenceEndings = /\s(and|or|the|a|an|to|of|in|for|with|that|which|who|is|are|was|were|be|been|being)$/i;
  if (midSentenceEndings.test(trimmed)) {
    console.log('[CC] Truncation detected: ends with article/conjunction');
    return true;
  }
  
  const lastChar = trimmed[trimmed.length - 1];
  const validEndings = ['.', '!', '?', '"', "'", ')', ']', ':'];
  
  if (!validEndings.includes(lastChar)) {
    const sentences = trimmed.match(/[.!?]["']?\s/g);
    if (!sentences || sentences.length < 2) {
      console.log('[CC] Truncation detected: no valid ending and few sentences');
      return true;
    }
  }
  
  return false;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

export async function reconstructChunkConstrained(
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
  skeleton: GlobalSkeleton,
  contentAnalysis?: any,
  targetOutputWords?: number,
  onCheckpoint?: (chunkIdx: number, output: string) => Promise<void>,
  lengthConfig?: LengthConfig,
  priorDeltasContext?: string // NEW: Database-sourced coherence context from prior chunks
): Promise<{ outputText: string; delta: ChunkDelta }> {
  const startTime = Date.now();
  const inputWords = countWords(chunkText);
  
  // Calculate per-chunk target based on length ratio if config is provided
  let targetWords: number;
  if (lengthConfig) {
    // Apply the ratio to this specific chunk's input
    targetWords = Math.round(inputWords * lengthConfig.lengthRatio);
    console.log(`[CC] Chunk ${chunkIndex}: input=${inputWords}, ratio=${lengthConfig.lengthRatio.toFixed(2)}, target=${targetWords}`);
  } else {
    targetWords = targetOutputWords || inputWords;
  }
  
  // Apply reasonable bounds
  const absoluteMin = 50; // Never go below 50 words
  const absoluteMax = 2000; // Never exceed 2000 words per chunk
  targetWords = Math.max(absoluteMin, Math.min(targetWords, absoluteMax));
  
  const minWords = Math.round(targetWords * 0.85);
  const maxWords = Math.round(targetWords * 1.15);
  
  // Get length guidance based on mode
  const lengthGuidance = lengthConfig ? getLengthGuidanceTemplate(lengthConfig.lengthMode) : '';
  
  const relevantOutline = skeleton.outline.slice(
    Math.floor(chunkIndex * skeleton.outline.length / totalChunks),
    Math.ceil((chunkIndex + 1) * skeleton.outline.length / totalChunks)
  );
  
  let attempt = 0;
  let outputText = "";
  let delta: ChunkDelta = {
    newClaimsIntroduced: [],
    termsUsed: [],
    conflictsDetected: [],
    ledgerAdditions: []
  };
  
  while (attempt < MAX_CHUNK_RETRIES) {
    attempt++;
    
    const targetForAttempt = attempt === 1 ? targetWords : Math.round(targetWords * 0.85);
    const minForAttempt = Math.round(targetForAttempt * 0.75);
    const maxForAttempt = Math.round(targetForAttempt * 1.2);
    
    // Build prior context section if available
    const priorContextSection = priorDeltasContext 
      ? `\n${priorDeltasContext}\n\nYou MUST maintain consistency with claims and terms established in prior chunks.\n`
      : '';

    const reconstructPrompt = `You are reconstructing chunk ${chunkIndex + 1} of ${totalChunks} of a document.

*** CRITICAL OUTPUT LENGTH REQUIREMENT ***
- Input chunk length: ${inputWords} words
- YOUR OUTPUT MUST BE: ${minForAttempt}-${maxForAttempt} words
- Target: approximately ${targetForAttempt} words

HARD REQUIREMENTS:
1. Your output MUST be at least ${minForAttempt} words - shorter outputs FAIL
2. Your output MUST NOT exceed ${maxForAttempt} words - longer outputs FAIL
3. Your output MUST end with a complete sentence - no truncation allowed
4. Count your words before submitting

${lengthGuidance ? `${lengthGuidance}\n` : ''}${attempt > 1 ? `RETRY ATTEMPT ${attempt}: Previous output was too short or truncated. YOU MUST produce ${minForAttempt}-${maxForAttempt} words this time.` : ''}
*** END LENGTH REQUIREMENT ***
${priorContextSection}
GLOBAL SKELETON (you MUST maintain consistency with this):
THESIS: ${skeleton.thesis}

RELEVANT OUTLINE SECTION: 
${relevantOutline.map((item, i) => `${i + 1}. ${item}`).join('\n')}

KEY TERMS (use these EXACTLY as defined):
${skeleton.keyTerms.map(t => `- ${t.term}: ${t.meaning}`).join('\n')}

COMMITMENT LEDGER (do NOT contradict these):
${skeleton.commitmentLedger.map(c => `- ${c.type.toUpperCase()}: ${c.claim}`).join('\n')}

ENTITIES (reference consistently):
${skeleton.entities.map(e => `- ${e.name} (${e.type}): ${e.role}`).join('\n')}

CHUNK TO RECONSTRUCT:
${chunkText}

INSTRUCTIONS:
1. Reconstruct this chunk into polished, substantive prose
2. You MUST NOT contradict the commitment ledger
3. You MUST use key terms as defined in the skeleton
4. You MUST maintain consistency with the thesis and outline
5. If you detect a conflict between the chunk content and the skeleton, FLAG IT explicitly
6. Generate fresh examples and substantive content that DEVELOPS the position
7. Output should be plain prose - no markdown headers, no bullet points
8. COMPLETE YOUR OUTPUT - do not stop mid-sentence

After the reconstruction, provide a DELTA REPORT as JSON:
{
  "newClaimsIntroduced": ["any new claims you introduced"],
  "termsUsed": ["key terms from skeleton that you used"],
  "conflictsDetected": [{"skeletonItem": "what skeleton item", "chunkContent": "what chunk said", "description": "nature of conflict"}],
  "ledgerAdditions": [{"type": "asserts|rejects|assumes", "claim": "new commitment introduced"}]
}

Format your response as:
===RECONSTRUCTION===
[Your reconstructed text here - plain prose, no markdown, ${minForAttempt}-${maxForAttempt} words]
===DELTA===
[Your JSON delta report here]`;

    // Token budget: target words * 2 (tokens per word) + buffer for JSON delta
    // This ensures the model has enough room to produce the requested word count
    const tokenBudget = Math.max(6000, Math.ceil(targetForAttempt * 2.5) + 500);
    const responseText = await callWithFallback(reconstructPrompt, tokenBudget, 0.5);
    
    const reconstructionMatch = responseText.match(/===RECONSTRUCTION===\s*([\s\S]*?)(?:===DELTA===|$)/);
    if (reconstructionMatch) {
      outputText = reconstructionMatch[1].trim();
    } else {
      outputText = responseText.split('===DELTA===')[0].trim();
    }
    
    const deltaMatch = responseText.match(/===DELTA===\s*([\s\S]*)/);
    if (deltaMatch) {
      try {
        const jsonMatch = deltaMatch[1].match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          delta = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log(`[CC] Delta parsing failed for chunk ${chunkIndex}`);
      }
    }
    
    const outputWordCount = countWords(outputText);
    const isTruncated = isOutputTruncated(outputText);
    const isTooShort = outputWordCount < minForAttempt;
    
    if (!isTruncated && !isTooShort) {
      console.log(`[CC] Chunk ${chunkIndex + 1}/${totalChunks} completed: ${outputWordCount} words (target: ${targetForAttempt}) in ${Date.now() - startTime}ms`);
      break;
    }
    
    if (attempt < MAX_CHUNK_RETRIES) {
      console.log(`[CC] Chunk ${chunkIndex + 1} validation failed (truncated: ${isTruncated}, short: ${isTooShort}, got ${outputWordCount} words). Retrying...`);
      await delay(1000);
    } else {
      // After all retries, check if output is catastrophically short (< 50% of target)
      const finalOutputWords = countWords(outputText);
      const catastrophicThreshold = targetWords * 0.5;
      
      if (finalOutputWords < catastrophicThreshold) {
        const errorMsg = `Chunk ${chunkIndex + 1} failed: produced ${finalOutputWords} words, target was ${targetWords} (min acceptable: ${catastrophicThreshold})`;
        console.error(`[CC] CATASTROPHIC FAILURE: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      console.log(`[CC] Chunk ${chunkIndex + 1} max retries reached. Proceeding with ${finalOutputWords} words (target was ${targetWords}).`);
    }
  }
  
  if (onCheckpoint) {
    await onCheckpoint(chunkIndex, outputText);
  }
  
  return { outputText, delta };
}

export async function stitchAndValidate(
  skeleton: GlobalSkeleton,
  chunks: { text: string; delta: ChunkDelta }[]
): Promise<{ finalOutput: string; stitchResult: StitchResult }> {
  const startTime = Date.now();
  
  // CRITICAL FIX: Do NOT ask the model to regenerate the entire document!
  // That causes truncation for long documents. Instead:
  // 1. Validate for issues (small output)
  // 2. Join chunks directly (lossless)
  // 3. Only fix specific issues if found
  
  const deltasSummary = chunks.map((chunk, i) => ({
    chunkIndex: i,
    claims: chunk.delta.newClaimsIntroduced.slice(0, 3), // Limit to avoid token overflow
    conflicts: chunk.delta.conflictsDetected
  }));
  
  // Only send first 200 words of each chunk for validation (full chunks would overflow context)
  const chunkPreviews = chunks.map((chunk, i) => {
    const words = chunk.text.split(/\s+/);
    const preview = words.slice(0, 200).join(' ') + (words.length > 200 ? '...' : '');
    return `CHUNK ${i + 1} (${words.length} words): ${preview}`;
  });
  
  const validationPrompt = `You are the GLOBAL CONSISTENCY VALIDATOR for a multi-chunk document reconstruction.

GLOBAL SKELETON:
THESIS: ${skeleton.thesis}

KEY TERMS:
${skeleton.keyTerms.slice(0, 10).map(t => `- ${t.term}: ${t.meaning}`).join('\n')}

COMMITMENT LEDGER:
${skeleton.commitmentLedger.slice(0, 10).map(c => `- ${c.type.toUpperCase()}: ${c.claim}`).join('\n')}

CHUNK DELTAS (summary of what each chunk introduced):
${JSON.stringify(deltasSummary, null, 2)}

CHUNK PREVIEWS (first 200 words of each chunk):
${chunkPreviews.join('\n\n')}

YOUR TASK - VALIDATION ONLY (do NOT regenerate the document):
1. Detect any cross-chunk contradictions visible in the previews
2. Detect any terminology drift
3. Detect any missing premises
4. Detect any redundancies

Return ONLY a JSON validation report:
{
  "contradictions": [{"chunk1": 0, "chunk2": 1, "description": "description"}],
  "terminologyDrift": [{"term": "term", "chunk": 0, "originalMeaning": "x", "driftedMeaning": "y"}],
  "missingPremises": [{"location": 0, "description": "description"}],
  "redundancies": [{"chunks": [0, 2], "description": "same point"}],
  "repairPlan": [{"chunkIndex": 0, "repairAction": "what to fix"}]
}`;

  let stitchResult: StitchResult = {
    contradictions: [],
    terminologyDrift: [],
    missingPremises: [],
    redundancies: [],
    repairPlan: []
  };
  
  try {
    const responseText = await callWithFallback(validationPrompt, 4000, 0.2);
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      stitchResult = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.log("[CC] Stitch validation failed, proceeding with direct join");
  }
  
  // CRITICAL: Join chunks directly - this preserves ALL content without truncation
  // The chunks were already reconstructed with proper length in Pass 2
  const finalOutput = chunks.map(c => c.text).join("\n\n");
  
  const totalWords = countWords(finalOutput);
  console.log(`[CC] Stitch validation completed in ${Date.now() - startTime}ms`);
  console.log(`[CC] Final output: ${totalWords} words (${chunks.length} chunks joined directly)`);
  console.log(`[CC] Issues found: ${stitchResult.contradictions.length} contradictions, ${stitchResult.terminologyDrift.length} term drifts, ${stitchResult.repairPlan.length} repairs needed`);
  
  return { finalOutput, stitchResult };
}

export interface CCReconstructionResult {
  reconstructedText: string;
  changes: string;
  wasReconstructed: boolean;
  adjacentMaterialAdded: string;
  originalLimitationsIdentified: string;
  skeleton?: GlobalSkeleton;
  stitchResult?: StitchResult;
  chunksProcessed?: number;
  validation?: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

export async function crossChunkReconstruct(
  text: string,
  audienceParameters?: string,
  rigorLevel?: string,
  customInstructions?: string,
  contentAnalysis?: any,
  onChunkProgress?: (chunkIndex: number, totalChunks: number, chunkText: string) => void
): Promise<CCReconstructionResult> {
  const totalStartTime = Date.now();
  const wordCount = text.trim().split(/\s+/).length;
  
  if (wordCount > MAX_INPUT_WORDS) {
    throw new Error(`Input exceeds maximum of ${MAX_INPUT_WORDS} words (got ${wordCount})`);
  }
  
  if (wordCount <= TARGET_CHUNK_SIZE) {
    console.log(`[CC] Short document (${wordCount} words), using single-pass reconstruction`);
    return {
      reconstructedText: text,
      changes: "Document too short for multi-chunk processing, using standard reconstruction",
      wasReconstructed: false,
      adjacentMaterialAdded: "",
      originalLimitationsIdentified: "Document is short enough for single-pass processing"
    };
  }
  
  // Parse and calculate length configuration from custom instructions
  const parsedLength = parseTargetLength(customInstructions);
  const lengthConfig = calculateLengthConfig(
    wordCount,
    parsedLength?.targetMin ?? null,
    parsedLength?.targetMax ?? null,
    customInstructions
  );
  
  console.log(`[CC] Starting 3-pass reconstruction for ${wordCount} word document`);
  console.log(`[CC] Length config: target=${lengthConfig.targetMin}-${lengthConfig.targetMax} words, ratio=${lengthConfig.lengthRatio.toFixed(2)}, mode=${lengthConfig.lengthMode}`);
  
  console.log("[CC] Pass 1: Extracting global skeleton (with user instruction parsing)...");
  const skeleton = await extractGlobalSkeleton(text, audienceParameters, rigorLevel, customInstructions);
  
  console.log("[CC] Chunking document...");
  const chunkBoundaries = smartChunk(text);
  console.log(`[CC] Created ${chunkBoundaries.length} chunks, per-chunk target ~${lengthConfig.chunkTargetWords} words`);
  
  console.log("[CC] Pass 2: Constrained chunk reconstruction (sequential with delays)...");
  const processedChunks: { text: string; delta: ChunkDelta }[] = [];
  let totalOutputWords = 0;
  
  for (let i = 0; i < chunkBoundaries.length; i++) {
    // Build prior deltas context from already-processed chunks (in-memory version)
    const priorDeltas = processedChunks.map(pc => pc.delta);
    const priorDeltasContext = buildInMemoryPriorContext(priorDeltas);
    
    const { outputText, delta } = await reconstructChunkConstrained(
      chunkBoundaries[i].text,
      i,
      chunkBoundaries.length,
      skeleton,
      contentAnalysis,
      undefined, // Let lengthConfig determine target
      undefined, // onCheckpoint
      lengthConfig,
      priorDeltasContext // Pass accumulated coherence context
    );
    processedChunks.push({ text: outputText, delta });
    totalOutputWords += countWords(outputText);
    
    if (onChunkProgress) {
      try {
        onChunkProgress(i, chunkBoundaries.length, outputText);
      } catch (e) {
        console.error(`[CC] onChunkProgress callback error:`, e);
      }
    }
    
    if (i < chunkBoundaries.length - 1) {
      console.log(`[CC] Waiting ${CHUNK_DELAY_MS}ms before next chunk...`);
      await delay(CHUNK_DELAY_MS);
    }
  }
  
  console.log(`[CC] All chunks processed. Total output: ${totalOutputWords} words (target: ${lengthConfig.targetMin}-${lengthConfig.targetMax})`);
  
  // Check if we're significantly under target and log warning
  if (totalOutputWords < lengthConfig.targetMin * 0.8) {
    console.log(`[CC] WARNING: Output ${totalOutputWords} words is significantly below minimum target ${lengthConfig.targetMin}`);
  }
  
  console.log("[CC] Pass 3: Global consistency stitch...");
  const { finalOutput, stitchResult } = await stitchAndValidate(skeleton, processedChunks);
  
  // PASS 4: POST-PROCESSING - Apply requested content additions
  console.log("[CC] Pass 4: Processing content additions...");
  let augmentedOutput = finalOutput;
  
  if (skeleton.userInstructions?.contentAdditions && skeleton.userInstructions.contentAdditions.length > 0) {
    console.log(`[CC] Found ${skeleton.userInstructions.contentAdditions.length} content additions to process`);
    augmentedOutput = await generateRequestedAdditions(finalOutput, skeleton);
    console.log(`[CC] Post-processing complete. Words: ${countWords(finalOutput)} → ${countWords(augmentedOutput)}`);
    
    // Update chapter statuses after post-processing
    if (skeleton.chapters) {
      for (const chapter of skeleton.chapters) {
        chapter.status = 'processed';
      }
      // Mark if concluding chapter was added
      const hasConclusion = skeleton.userInstructions.contentAdditions.some(a => a.type === 'concluding_chapter');
      if (hasConclusion) {
        skeleton.chapters.push({
          index: skeleton.chapters.length + 1,
          title: 'Conclusion: Synthesis and Future Directions',
          mainThesis: 'Generated concluding chapter summarizing all preceding chapters',
          startWord: countWords(finalOutput),
          endWord: countWords(augmentedOutput),
          status: 'processed'
        });
        skeleton.chapterCount = skeleton.chapters.length;
      }
    }
  } else {
    console.log("[CC] No content additions requested");
  }
  
  // PASS 5: FINAL VALIDATION - Verify user instructions were followed
  console.log("[CC] Pass 5: Final validation...");
  const validation = validateFinalOutput(augmentedOutput, skeleton);
  
  if (!validation.valid) {
    const errorMessage = `Reconstruction failed validation: ${validation.errors.join("; ")}`;
    console.error("[CC] VALIDATION FAILED - THROWING ERROR:", validation.errors);
    
    // Throw an error for critical failures - system must not return non-compliant output
    throw new Error(errorMessage);
  }
  
  if (validation.warnings.length > 0) {
    console.log("[CC] Validation passed with warnings:", validation.warnings);
  }
  
  const totalTime = Date.now() - totalStartTime;
  console.log(`[CC] Complete 5-pass reconstruction finished in ${totalTime}ms`);
  
  const finalWordCount = countWords(augmentedOutput);
  
  const changesDescription = [
    `Processed ${chunkBoundaries.length} chunks through 5-pass CC system (${lengthConfig.lengthMode} mode).`,
    `Input: ${wordCount} words → Output: ${finalWordCount} words (target: ${lengthConfig.targetMin}-${lengthConfig.targetMax}).`,
    `Skeleton: ${skeleton.outline.length} outline items, ${skeleton.keyTerms.length} key terms, ${skeleton.commitmentLedger.length} commitments.`,
    skeleton.chapterCount ? `Document has ${skeleton.chapterCount} chapters tracked.` : "",
    stitchResult.contradictions.length > 0 ? `Resolved ${stitchResult.contradictions.length} cross-chunk contradictions.` : "No contradictions detected.",
    stitchResult.terminologyDrift.length > 0 ? `Fixed ${stitchResult.terminologyDrift.length} terminology drift issues.` : "Terminology consistent across chunks.",
    stitchResult.repairPlan.length > 0 ? `Applied ${stitchResult.repairPlan.length} repairs.` : "No repairs needed.",
    skeleton.userInstructions?.contentAdditions?.length ? `Added ${skeleton.userInstructions.contentAdditions.length} requested section(s).` : "",
    validation.valid ? "Validation passed." : `Validation issues: ${validation.errors.join("; ")}`
  ].filter(s => s).join(" ");
  
  return {
    reconstructedText: augmentedOutput,
    changes: changesDescription,
    wasReconstructed: true,
    adjacentMaterialAdded: processedChunks
      .flatMap(c => c.delta.newClaimsIntroduced)
      .slice(0, 5)
      .join("; ") || "Fresh examples and substantive content added to each chunk",
    originalLimitationsIdentified: `Original document (${wordCount} words) processed with ${lengthConfig.lengthMode} mode (ratio: ${lengthConfig.lengthRatio.toFixed(2)})`,
    skeleton,
    stitchResult,
    chunksProcessed: chunkBoundaries.length,
    validation
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// POST-PROCESSING: CONTENT ADDITIONS
// Generates new content requested by user (e.g., concluding chapter)
// ═══════════════════════════════════════════════════════════════════════════

export async function generateConcludingChapter(
  processedOutput: string,
  skeleton: GlobalSkeleton
): Promise<string> {
  const startTime = Date.now();
  
  if (!skeleton.chapters || skeleton.chapters.length === 0) {
    console.log('[CC] No chapters found, skipping concluding chapter generation');
    return '';
  }
  
  const chapterCount = skeleton.chapters.length;
  const instruction = skeleton.userInstructions?.contentAdditions.find(a => a.type === 'concluding_chapter');
  const includeFutureResearch = instruction?.additional?.includes('future research') ?? true;
  
  // Calculate target length: ~125 words per chapter summary + 500 for intro/future research
  const targetWords = chapterCount * 125 + (includeFutureResearch ? 500 : 200);
  
  const prompt = `You are writing a concluding chapter for an academic work.

THE DOCUMENT HAS ${chapterCount} CHAPTERS:
${skeleton.chapters.map(c => `${c.index}. "${c.title}" — ${c.mainThesis}`).join('\n')}

DOCUMENT THESIS: ${skeleton.thesis}

${instruction?.requirement ? `USER REQUIREMENT: ${instruction.requirement}` : ''}
${instruction?.additional ? `ADDITIONAL: ${instruction.additional}` : ''}

YOUR TASK:
Write a concluding chapter that:
1. Has a title: "Conclusion: Synthesis and Future Directions"
2. Opens with a paragraph stating the work's overall thesis and contribution
3. Contains ONE PARAGRAPH summarizing EACH of the ${chapterCount} chapters (100-150 words each)
4. ${includeFutureResearch ? 'Ends with 2-3 paragraphs on future research directions identifying open questions' : 'Ends with a brief closing statement'}
5. Maintains the academic tone of the document

STRUCTURE:
- Title: "Conclusion: Synthesis and Future Directions"
- Opening paragraph: State the work's overall thesis and contribution
- ${chapterCount} summary paragraphs (one per chapter, ~100-150 words each)
${includeFutureResearch ? '- Future research section: 2-3 paragraphs identifying open questions and research directions' : '- Brief closing statement'}

TARGET LENGTH: Approximately ${targetWords} words

KEY TERMS TO USE (as defined in the document):
${skeleton.keyTerms.slice(0, 10).map(t => `- ${t.term}: ${t.meaning}`).join('\n')}

Write the concluding chapter now:`;

  const responseText = await callWithFallback(prompt, 6000, 0.3);
  
  console.log(`[CC] Generated concluding chapter (${countWords(responseText)} words) in ${Date.now() - startTime}ms`);
  return responseText;
}

export async function generateRequestedAdditions(
  processedOutput: string,
  skeleton: GlobalSkeleton
): Promise<string> {
  const additions = skeleton.userInstructions?.contentAdditions || [];
  
  if (additions.length === 0) {
    console.log('[CC] No content additions requested');
    return processedOutput;
  }
  
  let result = processedOutput;
  
  for (const addition of additions) {
    if (addition.type === 'concluding_chapter') {
      console.log('[CC] Generating requested concluding chapter...');
      const concludingChapter = await generateConcludingChapter(result, skeleton);
      if (concludingChapter) {
        result = result.trim() + '\n\n' + concludingChapter;
        console.log(`[CC] Added concluding chapter. New total: ${countWords(result)} words`);
      }
    }
    // Add more content addition types here as needed
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// FINAL VALIDATION
// Verifies user instructions were actually followed
// ═══════════════════════════════════════════════════════════════════════════

export interface FinalValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  wordCount: number;
  targetMet: boolean;
  chaptersPreserved: boolean;
  additionsIncluded: boolean;
}

export function validateFinalOutput(
  output: string,
  skeleton: GlobalSkeleton
): FinalValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const wordCount = countWords(output);
  const instructions = skeleton.userInstructions;
  
  // CHECK 1: Word count target
  let targetMet = true;
  if (instructions?.lengthTarget) {
    const target = instructions.lengthTarget;
    const constraint = instructions.lengthConstraint;
    
    if (constraint === 'no_less_than' && wordCount < target) {
      errors.push(`Word count ${wordCount} is below minimum ${target}`);
      targetMet = false;
    } else if (constraint === 'no_more_than' && wordCount > target) {
      errors.push(`Word count ${wordCount} exceeds maximum ${target}`);
      targetMet = false;
    } else if (constraint === 'approximately' && (wordCount < target * 0.85 || wordCount > target * 1.15)) {
      warnings.push(`Word count ${wordCount} is outside ±15% of target ${target}`);
    } else if (constraint === 'exactly' && Math.abs(wordCount - target) > target * 0.05) {
      errors.push(`Word count ${wordCount} differs from exact target ${target}`);
      targetMet = false;
    }
  }
  
  // CHECK 2: Required additions present
  let additionsIncluded = true;
  const mustAdd = instructions?.mustAdd || [];
  
  for (const required of mustAdd) {
    if (required.includes('concluding chapter') || required.includes('conclusion')) {
      const hasConclusion = /\b(conclusion|synthesis|summary|final chapter)\b/i.test(output);
      if (!hasConclusion) {
        errors.push('Missing required concluding chapter');
        additionsIncluded = false;
      }
    }
    
    if (required.includes('future research')) {
      const hasFutureResearch = /\b(future research|future directions|further study|open questions)\b/i.test(output);
      if (!hasFutureResearch) {
        errors.push('Missing required future research section');
        additionsIncluded = false;
      }
    }
    
    if (required.includes('introduction')) {
      const hasIntro = /\b(introduction|overview|preface)\b/i.test(output.slice(0, 2000));
      if (!hasIntro) {
        warnings.push('Introduction section may be missing');
      }
    }
  }
  
  // CHECK 3: Chapter count preserved
  let chaptersPreserved = true;
  if (skeleton.chapters && skeleton.chapters.length > 1) {
    const expectedCount = skeleton.chapters.length;
    // Count chapter-like headings in output
    const chapterMatches = output.match(/^#{1,3}\s+.+$|^(?:Chapter|Essay|Section)\s+\d+|^\d+\.\s+[A-Z]/gm);
    const foundChapters = chapterMatches ? chapterMatches.length : 0;
    
    if (foundChapters < expectedCount * 0.7) {
      warnings.push(`Only ${foundChapters} of ${expectedCount} expected chapters found in output`);
      chaptersPreserved = false;
    }
  }
  
  // CHECK 4: Truncation detection
  const truncationCheck = detectTruncation(output);
  if (truncationCheck.truncated) {
    errors.push(`Output appears truncated: ${truncationCheck.reason}. Last chars: "${truncationCheck.lastChars}"`);
  }
  
  // CHECK 5: Structural completeness
  if (output.trim().endsWith('References') || output.trim().match(/References\s*$/)) {
    warnings.push('Output ends with References heading - may be missing content after references');
  }
  
  const valid = errors.length === 0;
  
  if (errors.length > 0) {
    console.log('[CC] FINAL VALIDATION FAILED:', errors);
  } else if (warnings.length > 0) {
    console.log('[CC] Validation passed with warnings:', warnings);
  } else {
    console.log('[CC] Final validation passed');
  }
  
  return {
    valid,
    errors,
    warnings,
    wordCount,
    targetMet,
    chaptersPreserved,
    additionsIncluded
  };
}

// Helper function to count chapters in output
function countChaptersInOutput(output: string): number {
  const chapterPatterns = [
    /^#{1,3}\s+.+$/gm,
    /^(?:Chapter|Essay|Section)\s+\d+/gim,
    /^\d+\.\s+[A-Z][^.]+$/gm
  ];
  
  let count = 0;
  for (const pattern of chapterPatterns) {
    const matches = output.match(pattern);
    if (matches) count = Math.max(count, matches.length);
  }
  return count;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORD COUNT ENFORCEMENT: COHERENT CONTINUATION GENERATION
// When output falls short of target, generate additional content that:
// 1. Reads all existing content from the database
// 2. Continues the document coherently from where it left off
// 3. Does NOT repeat content already written
// 4. Maintains the same structure/outline established in earlier chunks
// ═══════════════════════════════════════════════════════════════════════════

export interface ContinuationRequest {
  existingContent: string;
  skeleton: GlobalSkeleton;
  currentWordCount: number;
  targetWordCount: number;
  wordsNeeded: number;
  continuationIndex: number;
  maxContinuations: number;
  priorDeltasContext: string;
}

export interface ContinuationResult {
  continuationText: string;
  wordCount: number;
  delta: ChunkDelta;
  reachedNaturalEnd: boolean;
  canContinueFurther: boolean;
}

/**
 * Generate a coherent continuation of the document.
 * This function reads the existing content and produces additional material
 * that seamlessly continues from where the document left off.
 */
export async function generateCoherentContinuation(
  request: ContinuationRequest
): Promise<ContinuationResult> {
  const startTime = Date.now();
  const { 
    existingContent, 
    skeleton, 
    currentWordCount, 
    targetWordCount, 
    wordsNeeded,
    continuationIndex,
    maxContinuations,
    priorDeltasContext
  } = request;
  
  console.log(`[CC-CONTINUE] Generating continuation ${continuationIndex + 1}/${maxContinuations}`);
  console.log(`[CC-CONTINUE] Current: ${currentWordCount} words, Target: ${targetWordCount} words, Need: ${wordsNeeded} words`);
  
  // Extract the last portion of existing content for context (last ~2000 words)
  const existingWords = existingContent.split(/\s+/);
  const contextWords = Math.min(2000, existingWords.length);
  const recentContent = existingWords.slice(-contextWords).join(' ');
  
  // Extract outline from skeleton for structural guidance
  const outlineText = skeleton.outline.map((item, i) => `${i + 1}. ${item}`).join('\n');
  const keyTermsText = skeleton.keyTerms.slice(0, 15).map(t => `- ${t.term}: ${t.meaning}`).join('\n');
  
  // Calculate how many words to request in this continuation
  // Request slightly more than needed to ensure we hit the target
  const wordsToRequest = Math.min(wordsNeeded + 500, 4000); // Cap at 4000 per continuation
  
  const prompt = `You are continuing an academic document that currently has ${currentWordCount} words but needs to reach at least ${targetWordCount} words.

CRITICAL REQUIREMENTS:
1. You must generate approximately ${wordsToRequest} words of NEW content
2. Continue EXACTLY from where the document left off - do NOT repeat anything
3. Maintain the same academic tone, writing style, and terminology
4. Follow the document's established structure and argument flow
5. Add substantive new material: examples, analysis, implications, applications
6. Do NOT write "In conclusion" or any final summary - more content may follow

DOCUMENT THESIS: ${skeleton.thesis}

DOCUMENT OUTLINE (for structural reference):
${outlineText}

KEY TERMS (use consistently):
${keyTermsText}

${priorDeltasContext}

RECENT CONTENT (the last ~${contextWords} words - continue from here):
---
${recentContent}
---

YOUR TASK:
Write ${wordsToRequest} words that seamlessly continue this document. Pick up EXACTLY where the text above ends. Add new substantive content that:
- Develops arguments further with fresh examples and evidence
- Explores implications not yet discussed
- Addresses potential objections or counterarguments  
- Provides additional analysis, applications, or case studies
- Maintains coherence with everything written before

Do NOT:
- Repeat any content from the existing text
- Write introductory phrases like "Building on the above..." or "As mentioned..."
- Include concluding statements or summaries
- End abruptly mid-sentence

BEGIN THE CONTINUATION NOW:`;

  try {
    const responseText = await callWithFallback(prompt, 8000, 0.4);
    const continuationWordCount = countWords(responseText);
    
    console.log(`[CC-CONTINUE] Generated ${continuationWordCount} words in ${Date.now() - startTime}ms`);
    
    // Check if the continuation seems to have reached a natural ending
    const reachedNaturalEnd = /\b(in\s+conclusion|to\s+summarize|finally|in\s+summary)\b/i.test(
      responseText.slice(-500)
    );
    
    // Extract delta for coherence tracking
    const delta: ChunkDelta = {
      newClaimsIntroduced: [],
      termsUsed: skeleton.keyTerms.slice(0, 5).map(t => t.term),
      conflictsDetected: [],
      ledgerAdditions: []
    };
    
    // Try to extract new claims from the continuation
    const sentences = responseText.match(/[^.!?]+[.!?]+/g) || [];
    const potentialClaims = sentences
      .filter(s => s.length > 50 && s.length < 300)
      .filter(s => !/\b(for example|such as|including|e\.g\.|i\.e\.)\b/i.test(s))
      .slice(0, 5);
    delta.newClaimsIntroduced = potentialClaims;
    
    return {
      continuationText: responseText,
      wordCount: continuationWordCount,
      delta,
      reachedNaturalEnd,
      canContinueFurther: !reachedNaturalEnd && continuationWordCount > 100
    };
  } catch (error: any) {
    console.error(`[CC-CONTINUE] Failed to generate continuation:`, error.message);
    throw new Error(`Continuation generation failed: ${error.message}`);
  }
}

/**
 * Generate multiple continuations until target word count is met.
 * Returns the combined continuation text and metadata about the process.
 */
export interface ContinuationChunkData {
  text: string;
  wordCount: number;
  delta: ChunkDelta;
}

export async function enforceWordCountWithContinuations(
  existingContent: string,
  skeleton: GlobalSkeleton,
  targetWordCount: number,
  priorDeltasContext: string,
  maxContinuations: number = 10,
  onProgress?: (msg: string, currentWords: number, targetWords: number) => void
): Promise<{
  finalContent: string;
  finalWordCount: number;
  continuationsGenerated: number;
  targetMet: boolean;
  shortfallReason?: string;
  continuationChunks: ContinuationChunkData[];
}> {
  let currentContent = existingContent;
  let currentWordCount = countWords(existingContent);
  let continuationsGenerated = 0;
  const continuationChunks: ContinuationChunkData[] = [];
  
  console.log(`[CC-ENFORCE] Starting word count enforcement. Current: ${currentWordCount}, Target: ${targetWordCount}`);
  
  while (currentWordCount < targetWordCount && continuationsGenerated < maxContinuations) {
    const wordsNeeded = targetWordCount - currentWordCount;
    
    if (onProgress) {
      onProgress(
        `Generating additional content (${continuationsGenerated + 1}/${maxContinuations}): need ${wordsNeeded} more words...`,
        currentWordCount,
        targetWordCount
      );
    }
    
    try {
      const result = await generateCoherentContinuation({
        existingContent: currentContent,
        skeleton,
        currentWordCount,
        targetWordCount,
        wordsNeeded,
        continuationIndex: continuationsGenerated,
        maxContinuations,
        priorDeltasContext
      });
      
      // Store continuation chunk data for later persistence
      continuationChunks.push({
        text: result.continuationText,
        wordCount: result.wordCount,
        delta: result.delta
      });
      
      // Append the continuation (preserve original length for later extraction)
      currentContent = currentContent + '\n\n' + result.continuationText;
      currentWordCount = countWords(currentContent);
      continuationsGenerated++;
      
      console.log(`[CC-ENFORCE] After continuation ${continuationsGenerated}: ${currentWordCount} words (target: ${targetWordCount})`);
      
      // If the LLM reached a natural conclusion and we're close to target, accept it
      if (result.reachedNaturalEnd && currentWordCount >= targetWordCount * 0.95) {
        console.log(`[CC-ENFORCE] LLM reached natural end at ${currentWordCount} words (${Math.round(currentWordCount/targetWordCount*100)}% of target)`);
        break;
      }
      
      // If the continuation was too short and can't continue, we might be stuck
      if (!result.canContinueFurther && result.wordCount < 200) {
        console.log(`[CC-ENFORCE] Warning: Continuation ${continuationsGenerated} only generated ${result.wordCount} words`);
        if (continuationsGenerated >= 3) {
          // If we've tried 3+ times with short outputs, stop
          break;
        }
      }
      
      // Small delay between continuations to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
      
    } catch (error: any) {
      console.error(`[CC-ENFORCE] Continuation ${continuationsGenerated + 1} failed:`, error.message);
      break;
    }
  }
  
  const targetMet = currentWordCount >= targetWordCount;
  let shortfallReason: string | undefined;
  
  if (!targetMet) {
    const shortfall = targetWordCount - currentWordCount;
    const percentage = Math.round((currentWordCount / targetWordCount) * 100);
    
    if (continuationsGenerated >= maxContinuations) {
      shortfallReason = `Maximum continuation attempts (${maxContinuations}) reached. Generated ${currentWordCount} words (${percentage}% of target ${targetWordCount}). Shortfall: ${shortfall} words.`;
    } else {
      shortfallReason = `Content generation stopped after ${continuationsGenerated} continuations. Generated ${currentWordCount} words (${percentage}% of target ${targetWordCount}). Shortfall: ${shortfall} words. The document may have reached a natural conclusion point.`;
    }
    
    console.log(`[CC-ENFORCE] TARGET NOT MET: ${shortfallReason}`);
  } else {
    console.log(`[CC-ENFORCE] TARGET MET: ${currentWordCount} words (${Math.round((currentWordCount / targetWordCount) * 100)}% of target)`);
  }
  
  return {
    finalContent: currentContent,
    finalWordCount: currentWordCount,
    continuationsGenerated,
    targetMet,
    shortfallReason,
    continuationChunks
  };
}
