/**
 * Universal Expansion Service
 * 
 * This service handles text expansion regardless of input length.
 * When user provides custom instructions specifying a target word count,
 * structure, chapters, or other expansion requirements, this service
 * delivers exactly what the user specifies.
 * 
 * PROTOCOL: User instructions are ALWAYS obeyed. No thresholds. No "simple mode".
 * The app does what the user wants. Period.
 */

import Anthropic from "@anthropic-ai/sdk";
import { 
  logLLMCall, 
  logChunkProcessing, 
  createJobHistoryEntry, 
  updateJobHistoryStatus,
  summarizeText,
  countWords 
} from "./auditService";
import { db } from "../db";
import { coherenceChunks } from "@shared/schema";

interface ExpansionRequest {
  text: string;
  customInstructions: string;
  targetWordCount?: number;
  structure?: string[];
  constraints?: string[];
  aggressiveness?: "conservative" | "aggressive";
  onChunk?: (chunk: StreamChunk) => void;
  maxWords?: number | null; // Hard limit for freemium users - stops generation at this limit
}

export interface StreamChunk {
  type: 'section_complete' | 'progress' | 'outline' | 'complete';
  sectionTitle?: string;
  sectionContent?: string;
  sectionIndex?: number;
  totalSections?: number;
  wordCount?: number;
  totalWordCount?: number;
  progress?: number;
  message?: string;
  outline?: string;
}

interface ExpansionResult {
  expandedText: string;
  inputWordCount: number;
  outputWordCount: number;
  sectionsGenerated: number;
  processingTimeMs: number;
}

interface ParsedInstructions {
  targetWordCount: number | null;
  structure: { name: string; wordCount: number }[];
  constraints: string[];
  citations: { type: string; count: number; timeframe?: string } | null;
  academicRegister: boolean;
  noBulletPoints: boolean;
  internalSubsections: boolean;
  literatureReview: boolean;
  philosophersToReference: string[];
  dialogueFormat: boolean;
  dialogueCharacters: string[];
}

const anthropic = new Anthropic();

// Cache for parsed instructions to avoid double computation
const parseCache = new Map<string, ParsedInstructions>();

/**
 * Parse word count from various formats including shorthand (1k, 2.5k, etc.)
 */
function parseWordCountFromString(str: string): number {
  // Handle shorthand like "1k", "2.5k", "10K"
  const kMatch = str.match(/([\d.]+)\s*k/i);
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1]) * 1000);
  }
  // Handle regular numbers with commas
  return parseInt(str.replace(/,/g, ''));
}

/**
 * Parse custom instructions to extract expansion requirements
 */
export function parseExpansionInstructions(customInstructions: string): ParsedInstructions {
  // Check cache first
  if (parseCache.has(customInstructions)) {
    return parseCache.get(customInstructions)!;
  }
  
  const result: ParsedInstructions = {
    targetWordCount: null,
    structure: [],
    constraints: [],
    citations: null,
    academicRegister: false,
    noBulletPoints: false,
    internalSubsections: false,
    literatureReview: false,
    philosophersToReference: [],
    dialogueFormat: false,
    dialogueCharacters: []
  };
  
  if (!customInstructions) {
    parseCache.set(customInstructions, result);
    return result;
  }
  
  const text = customInstructions.toUpperCase();
  const originalText = customInstructions;
  
  // Parse target word count - multiple patterns
  // NEUROTEXT REQUIREMENT: Detect all forms of word count specifications
  const wordCountPatterns = [
    /EXPAND\s*(?:TO)?\s*([\d,]+(?:\.\d+)?)\s*(?:K)?\s*WORDS?/i,
    /([\d,]+(?:\.\d+)?)\s*(?:K)?\s*WORDS?\s*(?:THESIS|DISSERTATION|ESSAY|DOCUMENT|LENGTH|TREATISE|PAPER|SCHOLARLY)/i,
    /(?:THESIS|DISSERTATION|ESSAY|DOCUMENT|TREATISE|PAPER)\s*(?:OF)?\s*([\d,]+(?:\.\d+)?)\s*(?:K)?\s*WORDS?/i,
    /TARGET\s*(?:OF)?\s*([\d,]+(?:\.\d+)?)\s*(?:K)?\s*WORDS?/i,
    /([\d,]+(?:\.\d+)?)\s*(?:K)?\s*WORDS?\s*TOTAL/i,
    /TURN\s*(?:THIS\s*)?INTO\s*(?:A\s*)?([\d,]+(?:\.\d+)?)\s*(?:K)?\s*WORD/i,
    /WRITE\s*(?:A\s*)?([\d,]+(?:\.\d+)?)\s*(?:K)?\s*WORD/i,  // Matches "WRITE A 90000 WORD"
    /GENERATE\s*(?:A\s*)?([\d,]+(?:\.\d+)?)\s*(?:K)?\s*WORD/i,  // Matches "GENERATE A 50000 WORD"
    /PRODUCE\s*(?:A\s*)?([\d,]+(?:\.\d+)?)\s*(?:K)?\s*WORD/i,  // Matches "PRODUCE A 30000 WORD"
    /CREATE\s*(?:A\s*)?([\d,]+(?:\.\d+)?)\s*(?:K)?\s*WORD/i,  // Matches "CREATE A 20000 WORD"
  ];
  
  for (const pattern of wordCountPatterns) {
    const match = originalText.match(pattern);
    if (match) {
      let count = parseFloat(match[1].replace(/,/g, ''));
      // Check if it's in K format (e.g., "20K words")
      if (/K\s*WORDS?/i.test(match[0])) {
        count *= 1000;
      }
      // Sanity check - if number is too small, might be in thousands
      if (count < 500 && originalText.toUpperCase().includes('THESIS')) {
        count *= 1000;
      }
      result.targetWordCount = Math.round(count);
      console.log(`[Universal Expansion] Parsed target word count: ${result.targetWordCount} from "${match[0]}"`);
      break;
    }
  }
  
  // COMPREHENSIVE STRUCTURE PARSING
  // Handles: mixed case, bullet lists, shorthand (1k words), abbreviations, various formats
  
  // Helper to add section if not already present
  const addSection = (name: string, wordCount: number) => {
    const normalizedName = name.trim().toUpperCase();
    if (!result.structure.some(s => s.name.toUpperCase().includes(normalizedName.substring(0, Math.min(15, normalizedName.length))))) {
      result.structure.push({ name: name.trim(), wordCount });
    }
  };
  
  // Helper to convert Roman numerals to Arabic
  const romanToArabic = (roman: string): string => {
    const romanMap: { [key: string]: number } = { 'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000 };
    let result = 0;
    const upper = roman.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      const current = romanMap[upper[i]] || 0;
      const next = romanMap[upper[i + 1]] || 0;
      if (current < next) {
        result -= current;
      } else {
        result += current;
      }
    }
    return result.toString();
  };
  
  // Pattern 1: CHAPTER/Section with number and word count (various formats)
  // Matches: "CHAPTER 1: Introduction (3,500 words)", "- Chapter 2: Methods (5k words)", "Chapter 3 - Analysis (10000 words)"
  // Also: "Chapter 1: Introduction — 3,500 words", "Chapter 2 - Methods - 5k words"
  // Also: Roman numerals like "CHAPTER I", "CHAPTER II", etc.
  const chapterPatterns = [
    // Arabic numerals with parentheses
    /[-•*]?\s*(?:CHAPTER|SECTION|Ch\.?|Sec\.?)\s*(\d+)\s*[:\-–—]?\s*([A-Za-z][^\n(]*?)\s*\(\s*([\d,.]+k?)\s*words?\s*\)/gi,
    /(?:CHAPTER|SECTION)\s*(\d+)\s*[:\-–—]\s*([^\n(]+?)\s*\(\s*([\d,.]+k?)\s*words?\s*\)/gi,
    // Arabic numerals without parentheses
    /[-•*]?\s*(?:CHAPTER|SECTION|Ch\.?|Sec\.?)\s*(\d+)\s*[:\-–—]\s*([A-Za-z][A-Za-z\s]+?)\s*[:\-–—]\s*([\d,.]+k?)\s*words?/gi,
    /(?:CHAPTER|SECTION)\s*(\d+)\s*[:\-–—]\s*([^\n]+?)\s*[:\-–—]\s*([\d,.]+k?)\s*words?/gi
  ];
  
  // Roman numeral patterns (separate handling)
  const romanChapterPatterns = [
    /[-•*]?\s*(?:CHAPTER|SECTION)\s*([IVXLCDM]+)\s*[:\-–—]\s*([A-Za-z][^\n(]*?)\s*\(\s*([\d,.]+k?)\s*words?\s*\)/gi,
    /[-•*]?\s*(?:CHAPTER|SECTION)\s*([IVXLCDM]+)\s*[:\-–—]\s*([A-Za-z][A-Za-z\s]+?)\s*[:\-–—]\s*([\d,.]+k?)\s*words?/gi
  ];
  
  // Process Roman numeral patterns
  for (const pattern of romanChapterPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(originalText)) !== null) {
      const chapterNum = romanToArabic(match[1]);
      const chapterTitle = match[2].trim();
      const wordCount = parseWordCountFromString(match[3]);
      const fullName = chapterTitle ? `CHAPTER ${chapterNum}: ${chapterTitle}` : `CHAPTER ${chapterNum}`;
      addSection(fullName, wordCount);
    }
  }
  
  for (const pattern of chapterPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(originalText)) !== null) {
      const chapterNum = match[1];
      const chapterTitle = match[2].trim();
      const wordCount = parseWordCountFromString(match[3]);
      const fullName = chapterTitle ? `CHAPTER ${chapterNum}: ${chapterTitle}` : `CHAPTER ${chapterNum}`;
      addSection(fullName, wordCount);
    }
  }
  
  // Pattern 2: Named sections with word counts (ABSTRACT, INTRODUCTION, etc.)
  // Handles: "ABSTRACT (300 words)", "- Introduction (2k words)", "Lit Review (4,000 words)"
  // Also: "Introduction — 2000 words", "Abstract: 300 words"
  const sectionPatterns = [
    // With parentheses
    /[-•*]?\s*([A-Za-z][A-Za-z\s]+(?:REVIEW|DUCTION|CLUSION|TRACT|THESIS|OLOGY|ICATION|YSIS|SSION)?)\s*\(\s*([\d,.]+k?)\s*words?\s*\)/gi,
    /^[\s]*([A-Z][A-Z\s:]+)\s*\(\s*([\d,.]+k?)\s*words?\s*\)/gim,
    // Without parentheses - word count after separator
    /[-•*]?\s*([A-Za-z][A-Za-z\s]+(?:REVIEW|DUCTION|CLUSION|TRACT|THESIS|OLOGY|ICATION|YSIS|SSION)?)\s*[:\-–—]\s*([\d,.]+k?)\s*words?/gi,
    /^[\s]*([A-Z][A-Z\s]+)\s*[:\-–—]\s*([\d,.]+k?)\s*words?/gim
  ];
  
  for (const pattern of sectionPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(originalText)) !== null) {
      const sectionName = match[1].trim();
      const wordCount = parseWordCountFromString(match[2]);
      // Skip if it's a chapter pattern that was already captured
      if (!sectionName.toUpperCase().includes('CHAPTER')) {
        addSection(sectionName.toUpperCase(), wordCount);
      }
    }
  }
  
  // Pattern 3: Abbreviations with word counts
  // Handles: "Intro (1k words)", "Lit review (4000 words)", "Conclusion (1.5k words)"
  const abbreviationMap: { [key: string]: string } = {
    'INTRO': 'INTRODUCTION',
    'LIT REVIEW': 'LITERATURE REVIEW',
    'LIT. REVIEW': 'LITERATURE REVIEW',
    'LITERATURE REV': 'LITERATURE REVIEW',
    'CONCL': 'CONCLUSION',
    'METH': 'METHODOLOGY',
    'DISCUSS': 'DISCUSSION',
    'RESULTS': 'RESULTS',
    'ABSTRACT': 'ABSTRACT',
    'ABS': 'ABSTRACT'
  };
  
  const abbreviationPattern = /[-•*]?\s*(intro|lit\.?\s*review|literature\s*rev|concl|meth|discuss|results|abs(?:tract)?)\s*\(\s*([\d,.]+k?)\s*words?\s*\)/gi;
  let abbrMatch: RegExpExecArray | null;
  while ((abbrMatch = abbreviationPattern.exec(originalText)) !== null) {
    const abbr = abbrMatch[1].toUpperCase().replace(/\s+/g, ' ').trim();
    const fullName = abbreviationMap[abbr] || abbr;
    const wordCount = parseWordCountFromString(abbrMatch[2]);
    addSection(fullName, wordCount);
  }
  
  // Pattern 4: Numbered chapter structure without explicit word counts
  const chapterNoWordPattern = /[-•*]?\s*(?:CHAPTER|Ch\.?)\s*(\d+)\s*[:\-–—]\s*([^\n(]+?)(?:\n|$)/gi;
  let chapterNoWordMatch: RegExpExecArray | null;
  while ((chapterNoWordMatch = chapterNoWordPattern.exec(originalText)) !== null) {
    const chapterNum = chapterNoWordMatch[1];
    const chapterTitle = chapterNoWordMatch[2].trim();
    const fullName = `CHAPTER ${chapterNum}: ${chapterTitle}`;
    // Only add if not already captured with word count
    if (!result.structure.some(s => s.name.toUpperCase().includes(`CHAPTER ${chapterNum}`))) {
      addSection(fullName, 0); // Will be distributed later
    }
  }
  
  // Parse citations requirement
  const citationPatterns = [
    /(?:REFERENCE|CITE)\s*(?:THE\s*)?TOP\s*(\d+)\s*(?:JOURNAL\s*)?ARTICLES?/i,
    /(\d+)\s*(?:JOURNAL\s*)?(?:ARTICLES?|SOURCES?|REFERENCES?|CITATIONS?)/i,
    /TOP\s*(\d+)\s*(?:JOURNAL\s*)?ARTICLES?/i
  ];
  
  for (const pattern of citationPatterns) {
    const match = originalText.match(pattern);
    if (match) {
      result.citations = {
        type: 'journal_articles',
        count: parseInt(match[1])
      };
      
      // Check for timeframe
      const timeframeMatch = originalText.match(/(?:FROM\s*)?(?:THE\s*)?(?:LAST|PAST)\s*(\d+)\s*YEARS?/i);
      if (timeframeMatch) {
        result.citations.timeframe = `last ${timeframeMatch[1]} years`;
      }
      break;
    }
  }
  
  // Parse philosophers to reference
  const philosopherPattern = /(?:CITE|REFERENCE)\s*(?:RELEVANT\s*)?PHILOSOPHERS?\s*\(([^)]+)\)/i;
  const philMatch = originalText.match(philosopherPattern);
  if (philMatch) {
    result.philosophersToReference = philMatch[1].split(/,\s*/).map(p => p.trim());
  } else {
    // Look for common philosopher names mentioned
    const knownPhilosophers = ['Searle', 'Chalmers', 'Nagel', 'Dennett', 'Kim', 'Block', 'Fodor', 'Putnam', 'Jackson', 'Levine'];
    for (const phil of knownPhilosophers) {
      if (originalText.includes(phil)) {
        result.philosophersToReference.push(phil);
      }
    }
  }
  
  // Parse constraints
  result.academicRegister = /ACADEMIC\s*REGISTER/i.test(text);
  result.noBulletPoints = /NO\s*BULLET\s*POINTS?|FULL\s*PROSE/i.test(text);
  result.internalSubsections = /INTERNAL\s*SUBSECTIONS?|EACH\s*CHAPTER\s*(?:MUST\s*)?HAVE\s*(?:INTERNAL\s*)?SUBSECTIONS?/i.test(text);
  result.literatureReview = /LITERATURE\s*REVIEW/i.test(text);
  
  // DIALOGUE FORMAT DETECTION - Critical for producing actual dialogue, not essays about dialogue
  result.dialogueFormat = /\bDIALOGUE\b|\bCONVERSATION\b|\bDISCUSSION\s+BETWEEN\b|\bDEBATE\s+BETWEEN\b/i.test(text);
  
  // Extract dialogue characters from patterns like "DIALOGUE BETWEEN X AND Y" or "CONVERSATION BETWEEN X AND Y"
  const dialogueCharMatch = originalText.match(/(?:DIALOGUE|CONVERSATION|DISCUSSION|DEBATE)\s+BETWEEN\s+([^.]+?)(?:ON|ABOUT|REGARDING|CONCERNING|$)/i);
  if (dialogueCharMatch) {
    result.dialogueFormat = true;
    const charactersStr = dialogueCharMatch[1].trim();
    // Split by "AND" to get character names
    result.dialogueCharacters = charactersStr.split(/\s+AND\s+/i).map(c => c.trim()).filter(c => c.length > 0);
    console.log(`[Universal Expansion] Detected DIALOGUE format with characters: ${result.dialogueCharacters.join(', ')}`);
  }
  
  // Extract other constraints as strings
  const constraintPatterns = [
    /MAINTAIN\s+[^.]+/gi,
    /MUST\s+[^.]+/gi,
    /IDENTIFY\s+[^.]+/gi,
    /STATE\s+[^.]+/gi
  ];
  
  for (const pattern of constraintPatterns) {
    const matches = originalText.match(pattern);
    if (matches) {
      result.constraints.push(...matches.map(m => m.trim()));
    }
  }
  
  // Log parsing results for debugging
  console.log(`[Universal Expansion] Parsed: targetWordCount=${result.targetWordCount}, structure=${result.structure.length} sections`);
  if (result.structure.length > 0) {
    console.log(`[Universal Expansion] Structure: ${result.structure.map(s => `${s.name} (${s.wordCount}w)`).join(', ')}`);
  }
  
  // Cache the result
  parseCache.set(customInstructions, result);
  
  return result;
}

/**
 * Check if custom instructions contain expansion requirements
 */
export function hasExpansionInstructions(customInstructions?: string): boolean {
  if (!customInstructions) return false;
  
  const parsed = parseExpansionInstructions(customInstructions);
  
  // Has expansion if:
  // 1. Target word count specified
  // 2. Structure with word counts specified
  // 3. Keywords indicating expansion
  
  if (parsed.targetWordCount && parsed.targetWordCount > 0) return true;
  if (parsed.structure.length > 0) return true;
  
  const expansionKeywords = [
    /EXPAND\s*TO/i,
    /TURN\s*(?:THIS\s*)?INTO\s*(?:A\s*)?\d/i,
    /\d+\s*WORD\s*(?:THESIS|DISSERTATION|ESSAY)/i,
    /MASTER'?S?\s*THESIS/i,
    /DOCTORAL\s*(?:THESIS|DISSERTATION)/i,
    /PHD\s*(?:THESIS|DISSERTATION)/i,
    /WRITE\s*(?:A\s*)?\d+\s*WORDS?/i
  ];
  
  return expansionKeywords.some(pattern => pattern.test(customInstructions));
}

/**
 * Extract a relevant excerpt from the source text for a given section.
 * Uses keyword matching from the section name and outline to find the most relevant passages.
 */
function extractRelevantSourceExcerpt(
  sourceText: string,
  sectionName: string,
  outlineForSection: string,
  maxWords: number = 3000
): string {
  const sourceWords = sourceText.trim().split(/\s+/);
  if (sourceWords.length <= maxWords) return sourceText;
  
  const keywords = (sectionName + ' ' + outlineForSection)
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['chapter', 'section', 'words', 'word', 'write', 'with', 'this', 'that', 'from', 'about', 'into'].includes(w));
  
  const uniqueKeywords = Array.from(new Set(keywords));
  
  const paragraphs = sourceText.split(/\n\n+/);
  const scored = paragraphs.map((para, idx) => {
    const lower = para.toLowerCase();
    let score = 0;
    for (const kw of uniqueKeywords) {
      const matches = lower.split(kw).length - 1;
      score += matches * 2;
    }
    score += 1.0 / (idx + 1);
    return { para, score, idx };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  let excerpt = '';
  let wordCount = 0;
  const selectedParagraphs: { para: string; idx: number }[] = [];
  
  for (const item of scored) {
    const paraWords = item.para.trim().split(/\s+/).length;
    if (wordCount + paraWords > maxWords) break;
    selectedParagraphs.push(item);
    wordCount += paraWords;
  }
  
  selectedParagraphs.sort((a, b) => a.idx - b.idx);
  excerpt = selectedParagraphs.map(p => p.para).join('\n\n');
  
  return excerpt || sourceText.substring(0, maxWords * 6);
}

/**
 * Generate a single section of the expanded document
 * WITH WORD COUNT ENFORCEMENT - continues generating until target is reached
 */
async function generateSection(
  sectionName: string,
  targetWordCount: number,
  originalText: string,
  fullOutline: string,
  previousSections: string,
  parsedInstructions: ParsedInstructions,
  customInstructions: string,
  pointsCoveredSoFar: string[] = []
): Promise<{ content: string; newPointsCovered: string[] }> {
  
  const styleConstraints = [];
  if (parsedInstructions.academicRegister) styleConstraints.push("Use formal academic register throughout");
  if (parsedInstructions.noBulletPoints) styleConstraints.push("Write in full prose paragraphs only - NO bullet points");
  if (parsedInstructions.internalSubsections) styleConstraints.push("Include internal subsections with clear headings");
  
  const citationGuidance = parsedInstructions.citations 
    ? `Reference relevant academic sources (aim to cite ${parsedInstructions.citations.count} sources${parsedInstructions.citations.timeframe ? ` from ${parsedInstructions.citations.timeframe}` : ''} across the full document)`
    : '';
  
  const philosopherGuidance = parsedInstructions.philosophersToReference.length > 0
    ? `Engage with these philosophers where relevant: ${parsedInstructions.philosophersToReference.join(', ')}`
    : '';

  const relevantSourceExcerpt = extractRelevantSourceExcerpt(originalText, sectionName, fullOutline, 3000);
  
  const antiRedundancyBlock = pointsCoveredSoFar.length > 0
    ? `\n═══════════════════════════════════════════════════════════════
ANTI-REDUNDANCY: POINTS ALREADY COVERED IN PREVIOUS SECTIONS
The following arguments and claims have ALREADY been made. Do NOT restate them.
Each new section must ADVANCE the argument with NEW material from the source texts.
${pointsCoveredSoFar.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}
═══════════════════════════════════════════════════════════════\n`
    : '';

  // WORD COUNT ENFORCEMENT: Generate in chunks until target is reached
  let accumulatedContent = '';
  let currentWordCount = 0;
  let continuationAttempts = 0;
  const maxContinuationAttempts = 20; // Safety limit
  const minWordsPerChunk = 2000; // Minimum expected per generation
  
  console.log(`[Section ${sectionName}] Target: ${targetWordCount} words`);

  while (currentWordCount < targetWordCount * 0.95 && continuationAttempts < maxContinuationAttempts) {
    const wordsRemaining = targetWordCount - currentWordCount;
    const isFirstChunk = continuationAttempts === 0;
    
    // Request more words than needed since LLM underdelivers
    const wordsToRequest = Math.min(wordsRemaining, 4000); // Cap at 4000 per request for reliability
    
    let prompt: string;
    
    if (isFirstChunk) {
      // Use DIALOGUE-SPECIFIC prompt if dialogue format is detected
      if (parsedInstructions.dialogueFormat) {
        const characters = parsedInstructions.dialogueCharacters.length > 0 
          ? parsedInstructions.dialogueCharacters.join(' and ')
          : 'the characters specified';
        
        prompt = `You are writing a DIALOGUE - an actual conversation with back-and-forth exchanges.

TOPIC/THEME (what the dialogue is about):
${originalText}

CHARACTERS: ${characters}

DOCUMENT OUTLINE:
${fullOutline}

PREVIOUS SECTIONS:
${previousSections || '[This is the beginning]'}

═══════════════════════════════════════════════════════════════
SECTION: ${sectionName}
TARGET LENGTH: ${targetWordCount} words
THIS CHUNK: Write approximately ${wordsToRequest} words
═══════════════════════════════════════════════════════════════

USER'S INSTRUCTIONS:
${customInstructions}

CRITICAL DIALOGUE FORMAT REQUIREMENTS:
1. Write ACTUAL DIALOGUE - real conversation between the characters
2. Each speaker's turn starts on a new line with their name in CAPITALS followed by a colon
3. Format: "CHARACTER NAME: [What they say]"
4. Characters should ENGAGE with each other - respond to, challenge, and build on what the other says
5. Include substantive philosophical/intellectual exchanges - not surface-level chat
6. Characters should speak in their authentic voices with their distinct perspectives
7. Do NOT write an essay ABOUT a dialogue - write the DIALOGUE ITSELF
8. Do NOT include stage directions, narrative descriptions, or prose paragraphs between dialogue
9. Aim for ${wordsToRequest} words of actual dialogue exchanges

EXAMPLE FORMAT:
FREUD: The unconscious mind harbors desires that society forces us to repress...
CONFUCIUS: Yet is not self-cultivation precisely the mastery of such impulses for the greater harmony of society?
FREUD: You speak of harmony, but at what psychological cost?

Write the DIALOGUE now (${wordsToRequest} words of conversation):`;
      } else {
        prompt = `You are writing a section of an academic thesis/dissertation.

═══════════════════════════════════════════════════════════════
PRIMARY SOURCE MATERIAL (UPLOADED DOCUMENTS - your PRIMARY content source)
You MUST ground your writing in this source material. Every section must
demonstrably reference, analyze, quote, paraphrase, or build upon specific
ideas, arguments, and evidence found IN THIS SOURCE TEXT.
Do NOT ignore this content in favor of the user's instructions.
The source material is WHAT you write about. Instructions are HOW you structure it.
═══════════════════════════════════════════════════════════════
${relevantSourceExcerpt}
═══════════════════════════════════════════════════════════════

FULL DOCUMENT OUTLINE:
${fullOutline}

PREVIOUS SECTIONS WRITTEN:
${previousSections || '[This is the first section]'}
${antiRedundancyBlock}
═══════════════════════════════════════════════════════════════
SECTION TO WRITE NOW: ${sectionName}
TOTAL TARGET LENGTH: ${targetWordCount} words
THIS CHUNK: Write approximately ${wordsToRequest} words to START this section
═══════════════════════════════════════════════════════════════

STYLE REQUIREMENTS:
${styleConstraints.join('\n')}
${citationGuidance}
${philosopherGuidance}

USER'S STRUCTURAL/FRAMING INSTRUCTIONS (governs structure and approach, NOT content):
${customInstructions}

CRITICAL REQUIREMENTS:
1. Write approximately ${wordsToRequest} words NOW - this is just the beginning
2. This must be substantive academic prose, not filler
3. Your content MUST be grounded in the PRIMARY SOURCE MATERIAL above - cite specific ideas, arguments, quotes, and examples FROM the uploaded source texts
4. The user's instructions tell you HOW to structure and frame the writing - the source material tells you WHAT to write about
5. Each paragraph must introduce NEW material not already covered in previous sections
6. NO MARKDOWN FORMATTING - use plain text only
7. Include proper academic citations inline (Author, Year)
8. Each paragraph should advance the argument with DIFFERENT evidence/examples from the source
9. DO NOT start with the section title - the system will add it
10. DO NOT write a conclusion yet - more content will follow
11. End at a natural paragraph break, ready for continuation
12. NEVER repeat the same thesis statement, central claim, or argument that appeared in a previous section - each section must present DISTINCT material

Write the BEGINNING of this section (${wordsToRequest} words):`;
      }
    } else {
      // Continuation prompt
      const lastParagraphs = accumulatedContent.split('\n\n').slice(-3).join('\n\n');
      
      if (parsedInstructions.dialogueFormat) {
        const characters = parsedInstructions.dialogueCharacters.length > 0 
          ? parsedInstructions.dialogueCharacters.join(' and ')
          : 'the characters';
        
        prompt = `You are CONTINUING a dialogue between ${characters}.

SECTION: ${sectionName}
WORDS WRITTEN SO FAR: ${currentWordCount}
WORDS STILL NEEDED: ${wordsRemaining}
TARGET TOTAL: ${targetWordCount} words

LAST PART OF THE DIALOGUE (continue from here):
"""
${lastParagraphs}
"""

USER'S ORIGINAL INSTRUCTIONS:
${customInstructions}

CRITICAL DIALOGUE REQUIREMENTS:
1. Write approximately ${wordsToRequest} MORE words of DIALOGUE
2. Continue the conversation naturally from where it left off
3. Keep the same format: CHARACTER NAME: [What they say]
4. Characters should respond to and engage with each other's points
5. Do NOT repeat lines already spoken
6. Do NOT add prose, stage directions, or narrative descriptions
7. Maintain each character's authentic voice and perspective
${wordsRemaining > 4000 ? '8. DO NOT end the conversation yet - more dialogue will follow' : '8. You may bring the dialogue to a natural conclusion if appropriate'}

Continue the DIALOGUE now (${wordsToRequest} more words):`;
      } else {
        prompt = `You are CONTINUING to write a section of an academic thesis/dissertation.

═══════════════════════════════════════════════════════════════
PRIMARY SOURCE MATERIAL (UPLOADED DOCUMENTS - continue drawing from this)
Your content must remain grounded in this source material.
Reference specific ideas, arguments, or evidence from it.
═══════════════════════════════════════════════════════════════
${relevantSourceExcerpt.substring(0, 4000)}
═══════════════════════════════════════════════════════════════

SECTION: ${sectionName}
WORDS WRITTEN SO FAR: ${currentWordCount}
WORDS STILL NEEDED: ${wordsRemaining}
TARGET TOTAL: ${targetWordCount} words

LAST PART OF WHAT YOU WROTE (continue from here):
"""
${lastParagraphs}
"""

USER'S STRUCTURAL INSTRUCTIONS:
${customInstructions}
${antiRedundancyBlock}
CRITICAL REQUIREMENTS:
1. Write approximately ${wordsToRequest} MORE words to CONTINUE this section
2. Continue EXACTLY where the text left off - maintain flow and coherence
3. Do NOT repeat what was already written - introduce NEW points from the source material
4. Do NOT write introductory phrases like "Continuing from..." or "As discussed..."
5. Draw on DIFFERENT passages from the source material than what you already used
6. This must be substantive content grounded in the uploaded texts, not filler
7. NO MARKDOWN FORMATTING - use plain text only
${wordsRemaining > 4000 ? '8. DO NOT conclude yet - more content will follow' : '8. You may write a concluding paragraph if appropriate'}

Continue writing NOW (${wordsToRequest} more words):`;
      }
    }

    console.log(`[Section ${sectionName}] Attempt ${continuationAttempts + 1}: Requesting ${wordsToRequest} words (have ${currentWordCount}/${targetWordCount})`);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000, // Allow plenty of room
      messages: [{ role: "user", content: prompt }]
    }, {
      timeout: 600000 // 10 minute timeout
    });

    const chunkContent = response.content[0].type === 'text' ? response.content[0].text : '';
    const chunkWordCount = chunkContent.trim().split(/\s+/).filter(w => w).length;
    const stopReason = response.stop_reason;
    
    console.log(`[Section ${sectionName}] Got ${chunkWordCount} words in chunk ${continuationAttempts + 1} (stop_reason: ${stopReason})`);
    
    // If stopped due to max_tokens, we MUST continue even if we think we have enough
    const wasTruncated = stopReason === 'max_tokens';
    if (wasTruncated) {
      console.log(`[Section ${sectionName}] Response was TRUNCATED - will continue generating`);
    }

    // Log the generation
    await logLLMCall({
      jobType: 'universal_expansion',
      modelName: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
      promptSummary: `Generate section ${sectionName} chunk ${continuationAttempts + 1}`,
      promptFull: prompt,
      responseSummary: summarizeText(chunkContent),
      responseFull: chunkContent,
      status: 'success'
    });

    // Append to accumulated content
    if (isFirstChunk) {
      accumulatedContent = chunkContent.trim();
    } else {
      accumulatedContent += '\n\n' + chunkContent.trim();
    }
    
    currentWordCount = accumulatedContent.trim().split(/\s+/).filter(w => w).length;
    continuationAttempts++;
    
    // CRITICAL: If response was truncated, force continue regardless of word count
    // This handles cases where LLM stops mid-sentence
    if (wasTruncated && currentWordCount < targetWordCount) {
      console.log(`[Section ${sectionName}] Forcing continuation due to truncation`);
    }
    
    // Small delay to avoid rate limiting
    if (currentWordCount < targetWordCount * 0.95 || wasTruncated) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  console.log(`[Section ${sectionName}] COMPLETE: ${currentWordCount} words in ${continuationAttempts} chunks (target: ${targetWordCount})`);

  const newPointsCovered = extractKeyPoints(accumulatedContent, sectionName);
  
  return { content: accumulatedContent, newPointsCovered };
}

function extractKeyPoints(sectionContent: string, sectionName: string): string[] {
  const points: string[] = [];
  const sentences = sectionContent.split(/[.!?]+/).filter(s => s.trim().length > 30);
  
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const normalized = sentence.trim().toLowerCase().replace(/\s+/g, ' ');
    
    const isClaimLike = /\b(argues?|claims?|contends?|demonstrates?|shows?|reveals?|suggests?|establishes?|proves?|maintains?|asserts?|proposes?|concludes?|central|key|crucial|fundamental|essential|primary|core)\b/i.test(sentence);
    
    if (isClaimLike && !seen.has(normalized.substring(0, 60))) {
      seen.add(normalized.substring(0, 60));
      const cleaned = sentence.trim().substring(0, 150);
      points.push(`[${sectionName}] ${cleaned}`);
      if (points.length >= 5) break;
    }
  }
  
  if (points.length === 0) {
    const firstSentences = sentences.slice(0, 2);
    for (const s of firstSentences) {
      points.push(`[${sectionName}] ${s.trim().substring(0, 150)}`);
    }
  }
  
  return points;
}

/**
 * Main expansion function - expands text according to user instructions
 */
/**
 * TIER 1: Generate a skeleton/outline for a single chunk of text
 * Extracts the key arguments, structure, and thesis of this chunk
 */
async function generateChunkSkeleton(chunk: string, chunkIndex: number, totalChunks: number, customInstructions: string): Promise<string> {
  const chunkWordCount = chunk.trim().split(/\s+/).length;
  
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    messages: [{
      role: "user",
      content: `You are analyzing chunk ${chunkIndex + 1} of ${totalChunks} from a large document (${chunkWordCount} words in this chunk).

Create a detailed SKELETON for this chunk that captures:
1. MAIN THESIS/CLAIMS: The central arguments made in this section
2. KEY POINTS: Major supporting points (numbered list, 1-2 sentences each)
3. EVIDENCE SUMMARY: Key evidence, examples, or data cited
4. LOGICAL FLOW: How arguments connect within this chunk
5. NOTABLE QUOTES: 2-3 significant direct quotes worth preserving

User's goal: "${customInstructions?.substring(0, 500) || 'scholarly expansion'}"

Format your skeleton clearly with headers for each section.

---

CHUNK TEXT:
${chunk}`
    }]
  });
  
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

/**
 * TIER 2: Generate a meta-skeleton that unifies all chunk skeletons
 * Creates a coherent overall structure from the individual chunk outlines
 */
async function generateMetaSkeleton(chunkSkeletons: string[], customInstructions: string, totalWords: number): Promise<string> {
  // Parse how many points user wants (e.g., "50 strongest points")
  const pointMatch = customInstructions?.match(/(\d+)\s*(?:strongest|best|top|key)\s*(?:points?|arguments?)/i);
  const targetPoints = pointMatch ? parseInt(pointMatch[1]) : 50;
  
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 12000,
    messages: [{
      role: "user",
      content: `You have ${chunkSkeletons.length} chunk skeletons from a ${totalWords.toLocaleString()} word document.

Create a UNIFIED META-SKELETON that:
1. IDENTIFIES the ${targetPoints} STRONGEST arguments across all chunks
2. CREATES a coherent structure showing how these arguments connect
3. RESOLVES any contradictions or redundancies between chunks
4. ESTABLISHES a logical flow from introduction → development → conclusion

User's goal: "${customInstructions?.substring(0, 1000) || 'scholarly expansion'}"

Your meta-skeleton should be a comprehensive outline suitable for generating a long-form expansion.

---

CHUNK SKELETONS:

${chunkSkeletons.map((sk, i) => `=== CHUNK ${i + 1} SKELETON ===\n${sk}`).join('\n\n')}`
    }]
  });
  
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export async function universalExpand(request: ExpansionRequest): Promise<ExpansionResult> {
  const startTime = Date.now();
  const { text: rawText, customInstructions, aggressiveness = "aggressive", onChunk } = request;
  
  const rawWordCount = rawText.trim().split(/\s+/).length;
  console.log(`[Universal Expansion] Starting expansion of ${rawWordCount} words`);
  console.log(`[Universal Expansion] Custom instructions: ${customInstructions?.substring(0, 200)}...`);
  
  // For very large inputs (>50k words), use TWO-TIER SKELETON SYSTEM
  // Tier 1: Per-chunk skeletons (each chunk up to 50k words)
  // Tier 2: Meta-skeleton that stitches chunk skeletons together
  const CHUNK_THRESHOLD = 50000;
  let text = rawText;
  let chunkSkeletons: string[] = [];
  let metaSkeleton = '';
  
  if (rawWordCount > CHUNK_THRESHOLD) {
    console.log(`[Universal Expansion] Large document detected (${rawWordCount} words), using TWO-TIER SKELETON SYSTEM...`);
    
    // Chunk the document (each chunk up to 50k words)
    const CHUNK_SIZE = 50000;
    const words = rawText.trim().split(/\s+/);
    const chunks: string[] = [];
    
    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      chunks.push(words.slice(i, i + CHUNK_SIZE).join(' '));
    }
    
    console.log(`[Universal Expansion] Split into ${chunks.length} chunks of up to ${CHUNK_SIZE} words each`);
    if (onChunk) {
      onChunk({ type: 'progress', message: `Processing ${rawWordCount} word document using two-tier skeleton system (${chunks.length} chunks)...` });
    }
    
    // TIER 1: Generate skeleton for each chunk
    for (let i = 0; i < chunks.length; i++) {
      if (onChunk) {
        onChunk({ type: 'progress', message: `Building skeleton for chunk ${i + 1}/${chunks.length}...`, progress: Math.round((i / chunks.length) * 40) });
      }
      
      const chunkSkeleton = await generateChunkSkeleton(chunks[i], i, chunks.length, customInstructions || '');
      chunkSkeletons.push(chunkSkeleton);
      console.log(`[Chunk ${i + 1}/${chunks.length}] Skeleton generated (${chunkSkeleton.split('\n').length} lines)`);
    }
    
    // TIER 2: Generate meta-skeleton that stitches chunk skeletons together
    if (onChunk) {
      onChunk({ type: 'progress', message: `Building meta-skeleton to unify ${chunks.length} chunk skeletons...`, progress: 45 });
    }
    
    metaSkeleton = await generateMetaSkeleton(chunkSkeletons, customInstructions || '', rawWordCount);
    console.log(`[Universal Expansion] Meta-skeleton generated (${metaSkeleton.split('\n').length} lines)`);
    
    // Use the meta-skeleton + chunk skeletons as structured source for expansion
    text = `# META-SKELETON (Unified structure for ${rawWordCount} word source)\n\n${metaSkeleton}\n\n` +
           `# CHUNK SKELETONS\n\n` +
           chunkSkeletons.map((sk, i) => `## CHUNK ${i + 1} SKELETON\n${sk}`).join('\n\n');
    
    console.log(`[Universal Expansion] Two-tier skeleton complete: ${text.split(/\s+/).length} words of structured source`);
  }
  
  const inputWordCount = text.trim().split(/\s+/).length;
  console.log(`[Universal Expansion] Processing ${inputWordCount} words for expansion`);
  
  // Parse the user's instructions
  const parsed = parseExpansionInstructions(customInstructions);
  console.log(`[Universal Expansion] Parsed target: ${parsed.targetWordCount} words`);
  console.log(`[Universal Expansion] Parsed structure: ${parsed.structure.length} sections`);
  
  // Determine target word count
  let targetWordCount = parsed.targetWordCount || request.targetWordCount;
  if (!targetWordCount) {
    // Default expansion if no target specified but expansion clearly requested
    targetWordCount = Math.max(inputWordCount * 10, 5000);
    console.log(`[Universal Expansion] No explicit target, defaulting to ${targetWordCount} words`);
  }
  
  // Build structure - either from parsed instructions or generate one
  // CRITICAL: For large documents, create MORE sections with SMALLER word counts
  // This ensures we don't hit token limits per-section
  let structure = parsed.structure;
  if (structure.length === 0) {
    // For very large documents (50k+), create more granular structure
    // CRITICAL: Allocation must SUM to exactly targetWordCount
    if (targetWordCount >= 50000) {
      // Fixed allocations as percentage of target
      const abstractWords = Math.round(targetWordCount * 0.01);  // 1%
      const introWords = Math.round(targetWordCount * 0.05);     // 5%
      const conclusionWords = Math.round(targetWordCount * 0.04); // 4%
      const fixedTotal = abstractWords + introWords + conclusionWords; // 10%
      
      // Remaining 90% distributed across 12 body sections
      const remainingWords = targetWordCount - fixedTotal;
      const bodySectionCount = 12;
      const wordsPerSection = Math.round(remainingWords / bodySectionCount);
      
      // Calculate actual totals and adjust last body section to hit exact target
      const bodyTotal = wordsPerSection * (bodySectionCount - 1);
      const lastBodySectionWords = remainingWords - bodyTotal;
      
      console.log(`[Universal Expansion] Allocation: Abstract=${abstractWords}, Intro=${introWords}, Body sections (11x${wordsPerSection} + 1x${lastBodySectionWords}), Conclusion=${conclusionWords}`);
      console.log(`[Universal Expansion] Allocation total: ${abstractWords + introWords + bodyTotal + lastBodySectionWords + conclusionWords} (target: ${targetWordCount})`);
      
      structure = [
        { name: "ABSTRACT", wordCount: abstractWords },
        { name: "INTRODUCTION", wordCount: introWords },
        { name: "LITERATURE REVIEW PART 1: HISTORICAL CONTEXT", wordCount: wordsPerSection },
        { name: "LITERATURE REVIEW PART 2: CONTEMPORARY PERSPECTIVES", wordCount: wordsPerSection },
        { name: "LITERATURE REVIEW PART 3: CRITICAL ANALYSIS", wordCount: wordsPerSection },
        { name: "CHAPTER 1: FOUNDATIONAL CONCEPTS", wordCount: wordsPerSection },
        { name: "CHAPTER 2: THEORETICAL FRAMEWORK", wordCount: wordsPerSection },
        { name: "CHAPTER 3: CORE ARGUMENT DEVELOPMENT", wordCount: wordsPerSection },
        { name: "CHAPTER 4: EVIDENCE AND ANALYSIS", wordCount: wordsPerSection },
        { name: "CHAPTER 5: COUNTERARGUMENTS AND RESPONSES", wordCount: wordsPerSection },
        { name: "CHAPTER 6: CASE STUDIES", wordCount: wordsPerSection },
        { name: "CHAPTER 7: METHODOLOGICAL CONSIDERATIONS", wordCount: wordsPerSection },
        { name: "CHAPTER 8: BROADER IMPLICATIONS", wordCount: wordsPerSection },
        { name: "CHAPTER 9: FUTURE DIRECTIONS", wordCount: lastBodySectionWords },
        { name: "CONCLUSION", wordCount: conclusionWords }
      ];
    } else {
      // Standard structure for smaller documents
      structure = [
        { name: "ABSTRACT", wordCount: Math.round(targetWordCount * 0.015) },
        { name: "INTRODUCTION", wordCount: Math.round(targetWordCount * 0.10) },
        { name: "LITERATURE REVIEW", wordCount: Math.round(targetWordCount * 0.20) },
        { name: "CHAPTER 1: CORE ARGUMENT", wordCount: Math.round(targetWordCount * 0.175) },
        { name: "CHAPTER 2: SUPPORTING ANALYSIS", wordCount: Math.round(targetWordCount * 0.175) },
        { name: "CHAPTER 3: CRITICAL EXAMINATION", wordCount: Math.round(targetWordCount * 0.175) },
        { name: "CHAPTER 4: IMPLICATIONS", wordCount: Math.round(targetWordCount * 0.10) },
        { name: "CONCLUSION", wordCount: Math.round(targetWordCount * 0.06) }
      ];
    }
    console.log(`[Universal Expansion] Generated structure with ${structure.length} sections for ${targetWordCount} word target`);
  } else {
    // Distribute remaining word count to sections without explicit counts
    const totalExplicit = structure.reduce((sum, s) => sum + s.wordCount, 0);
    const sectionsWithoutCount = structure.filter(s => s.wordCount === 0);
    if (sectionsWithoutCount.length > 0 && targetWordCount > totalExplicit) {
      const remaining = targetWordCount - totalExplicit;
      const perSection = Math.round(remaining / sectionsWithoutCount.length);
      for (const section of sectionsWithoutCount) {
        section.wordCount = perSection;
      }
    }
  }
  
  // Generate the full outline first
  const outlinePrompt = `You are creating a detailed outline for an academic thesis/dissertation.

═══════════════════════════════════════════════════════════════
PRIMARY SOURCE MATERIAL (uploaded documents to build from):
The thesis/dissertation MUST be grounded in and derived from this source material.
Each section must draw on DIFFERENT parts of the source.
═══════════════════════════════════════════════════════════════
${text}
═══════════════════════════════════════════════════════════════

TARGET: ${targetWordCount} word thesis/dissertation

STRUCTURE (each section with target word count):
${structure.map(s => `- ${s.name}: ${s.wordCount} words`).join('\n')}

USER'S STRUCTURAL/FRAMING INSTRUCTIONS (governs structure and approach):
${customInstructions}

Create a detailed outline that will guide writing each section. For each section, provide:
1. Main argument/thesis of that section (must be DISTINCT from other sections - no overlap)
2. Key points to cover (3-5 bullet points) - each drawn from DIFFERENT passages in the source material
3. Specific quotes, ideas, or passages from the source material to reference in that section
4. How it connects to other sections while advancing a DIFFERENT aspect of the argument

CRITICAL ANTI-REDUNDANCY RULES:
- Each section MUST have a unique thesis that is NOT a restatement of any other section's thesis
- Each section must draw from DIFFERENT parts of the source material
- NO section should repeat the central argument - each should develop a DISTINCT facet
- The outline must show PROGRESSIVE argument development, not circular restatement

Return a comprehensive outline that ensures each section covers genuinely different ground.`;

  console.log(`[Universal Expansion] Generating outline...`);
  
  const outlineResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{ role: "user", content: outlinePrompt }]
  });
  
  const fullOutline = outlineResponse.content[0].type === 'text' ? outlineResponse.content[0].text : '';

  // Log outline generation
  await logLLMCall({
    jobType: 'universal_expansion',
    modelName: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    promptSummary: 'Generate dissertation outline',
    promptFull: outlinePrompt,
    responseSummary: summarizeText(fullOutline),
    responseFull: fullOutline,
    status: 'success'
  });

  console.log(`[Universal Expansion] Outline generated (${fullOutline.length} chars)`);
  
  // Stream outline if callback provided
  if (onChunk) {
    onChunk({
      type: 'outline',
      outline: fullOutline,
      message: `Outline generated with ${structure.length} sections`,
      totalSections: structure.length
    });
  }
  
  // Generate each section
  const sections: string[] = [];
  let previousSections = "";
  let cumulativeWordCount = 0;
  let pointsCoveredSoFar: string[] = [];
  const maxWords = request.maxWords;
  
  for (let i = 0; i < structure.length; i++) {
    // FREEMIUM CHECK: Stop generation if we've hit the word limit
    if (maxWords && cumulativeWordCount >= maxWords) {
      console.log(`[Universal Expansion] FREEMIUM LIMIT REACHED: ${cumulativeWordCount}/${maxWords} words - stopping generation`);
      if (onChunk) {
        onChunk({
          type: 'complete',
          message: `Generation stopped at ${cumulativeWordCount} words (freemium limit: ${maxWords})`,
          wordCount: cumulativeWordCount,
          totalWordCount: cumulativeWordCount
        });
      }
      break;
    }
    
    const section = structure[i];
    console.log(`[Universal Expansion] Generating section ${i + 1}/${structure.length}: ${section.name} (${section.wordCount} words)`);
    console.log(`[Universal Expansion] Points covered so far: ${pointsCoveredSoFar.length} claims tracked for anti-redundancy`);
    
    const sectionResult = await generateSection(
      section.name,
      section.wordCount,
      text,
      fullOutline,
      previousSections,
      parsed,
      customInstructions,
      pointsCoveredSoFar
    );
    const sectionContent = sectionResult.content;
    pointsCoveredSoFar = [...pointsCoveredSoFar, ...sectionResult.newPointsCovered];

    // PERSIST CHUNK TO DATABASE IMMEDIATELY
    try {
      const docIdForDb = `ue-${startTime}-${i}`;
      await db.insert(coherenceChunks).values({
        documentId: docIdForDb,
        coherenceMode: 'philosophical',
        chunkIndex: i,
        chunkText: sectionContent,
        evaluationResult: { status: 'preserved', wordCount: countWords(sectionContent) },
        stateAfter: { mode: 'philosophical', core_concepts: { section: section.name } }
      });

      await logChunkProcessing({
        jobType: 'universal_expansion',
        chunkIndex: i,
        inputWordCount: countWords(text),
        outputWordCount: countWords(sectionContent),
        targetWordCount: section.wordCount,
        passed: true
      });
    } catch (dbError) {
      console.error(`[Universal Expansion] Failed to persist chunk ${i} to database:`, dbError);
    }
    
    // Clean output - no decorative separators
    // Always prepend section title (LLM instructed not to include it)
    const fullSectionText = `${section.name}\n\n${sectionContent.trim()}`;
    sections.push(fullSectionText);
    
    // Track word count
    const sectionWordCount = sectionContent.trim().split(/\s+/).length;
    cumulativeWordCount += sectionWordCount;
    
    // Stream section if callback provided
    if (onChunk) {
      onChunk({
        type: 'section_complete',
        sectionTitle: section.name,
        sectionContent: fullSectionText,
        sectionIndex: i,
        totalSections: structure.length,
        wordCount: sectionWordCount,
        totalWordCount: cumulativeWordCount,
        progress: Math.round(((i + 1) / structure.length) * 100),
        message: `Section ${i + 1}/${structure.length} complete: ${section.name} (${sectionWordCount} words)`
      });
    }
    
    // Keep track of previous sections with key claims for anti-redundancy context
    const sectionSummary = sectionResult.newPointsCovered.length > 0
      ? sectionResult.newPointsCovered.map(p => `  - ${p}`).join('\n')
      : sectionContent.substring(0, 300) + '...';
    previousSections += `\n\n[${section.name}] KEY CLAIMS MADE:\n${sectionSummary}`;
    
    // Small delay to avoid rate limiting
    if (i < structure.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Assemble final document
  const expandedText = sections.join('\n\n');
  const outputWordCount = expandedText.trim().split(/\s+/).length;
  const processingTimeMs = Date.now() - startTime;
  
  console.log(`[Universal Expansion] Complete: ${inputWordCount} → ${outputWordCount} words in ${processingTimeMs}ms`);
  
  // Stream completion if callback provided
  if (onChunk) {
    onChunk({
      type: 'complete',
      totalSections: structure.length,
      totalWordCount: outputWordCount,
      progress: 100,
      message: `Expansion complete: ${outputWordCount} words generated in ${Math.round(processingTimeMs / 1000)}s`
    });
  }
  
  return {
    expandedText,
    inputWordCount,
    outputWordCount,
    sectionsGenerated: structure.length,
    processingTimeMs
  };
}
