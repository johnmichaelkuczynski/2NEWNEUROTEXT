import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { logLLMCall, summarizeText, countWords } from "./auditService";

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

const TARGET_CHUNK_SIZE = 1200;
const MAX_RETRIES = 2;

interface ChunkBoundary {
  text: string;
  wordCount: number;
}

interface RefinerResult {
  output: string;
  inputWords: number;
  outputWords: number;
  chunksProcessed: number;
  reductionPercent: number;
}

function smartChunk(text: string): ChunkBoundary[] {
  const totalWords = countWords(text);
  if (totalWords <= TARGET_CHUNK_SIZE) {
    return [{ text: text.trim(), wordCount: totalWords }];
  }

  const paragraphs = text.split(/\n\s*\n/);
  const chunks: ChunkBoundary[] = [];
  let currentChunk = "";
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const paraWords = countWords(trimmed);

    if (currentWordCount + paraWords > TARGET_CHUNK_SIZE && currentWordCount > 0) {
      chunks.push({ text: currentChunk.trim(), wordCount: currentWordCount });
      currentChunk = trimmed;
      currentWordCount = paraWords;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
      currentWordCount += paraWords;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({ text: currentChunk.trim(), wordCount: currentWordCount });
  }

  if (chunks.length === 1 && totalWords > TARGET_CHUNK_SIZE) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const sentenceChunks: ChunkBoundary[] = [];
    let sc = "";
    let swc = 0;
    for (const sentence of sentences) {
      const st = sentence.trim();
      if (!st) continue;
      const sw = countWords(st);
      if (swc + sw > TARGET_CHUNK_SIZE && swc > 0) {
        sentenceChunks.push({ text: sc.trim(), wordCount: swc });
        sc = st;
        swc = sw;
      } else {
        sc += (sc ? " " : "") + st;
        swc += sw;
      }
    }
    if (sc.trim()) {
      sentenceChunks.push({ text: sc.trim(), wordCount: swc });
    }
    return sentenceChunks;
  }

  return chunks;
}

async function extractDocumentStructure(text: string, provider: string): Promise<string> {
  const prompt = `Analyze this document and extract its core structure in a concise format. Identify:
1. CENTRAL THESIS (1-2 sentences)
2. KEY CLAIMS (numbered list, max 10)
3. RECURRING TERMS (terms that appear multiple times with specific meanings)
4. STRUCTURE PATTERN (e.g., "argument with examples", "claim-evidence-analysis", etc.)

Keep your response under 500 words. Be precise and factual.

DOCUMENT:
${text.substring(0, 8000)}`;

  try {
    if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      const response = await getAnthropic().messages.create({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.3,
      });
      const block = response.content[0];
      return block.type === 'text' ? block.text : '';
    } else if (process.env.OPENAI_API_KEY) {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.3,
      });
      return response.choices[0].message.content || '';
    }
    return '';
  } catch (error: any) {
    console.error('[SignalRefiner] Structure extraction failed:', error.message);
    return '';
  }
}

async function refineChunk(
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
  documentStructure: string,
  priorChunkSummary: string,
  customInstructions: string,
  provider: string
): Promise<string> {
  const inputWords = countWords(chunkText);
  const targetWords = Math.round(inputWords * 0.7);
  const minWords = Math.max(50, Math.round(targetWords * 0.6));
  const maxWords = Math.round(inputWords * 0.95);

  const priorContext = priorChunkSummary
    ? `\nPRIOR SECTIONS SUMMARY (maintain continuity):\n${priorChunkSummary}\n`
    : '';

  const customBlock = customInstructions.trim()
    ? `\nADDITIONAL INSTRUCTIONS FROM USER:\n${customInstructions.trim()}\n`
    : '';

  const prompt = `You are a precision editor performing SIGNAL REFINEMENT on chunk ${chunkIndex + 1} of ${totalChunks}.

PURPOSE: Maximize signal-to-noise ratio. Every word must earn its place. Your output should be SHORTER than the input while preserving ALL substantive content.

DOCUMENT STRUCTURE:
${documentStructure}
${priorContext}${customBlock}
REFINEMENT PROTOCOL:
1. ELIMINATE unnecessary repetitions - if an idea is stated twice, keep only the stronger formulation
2. TIGHTEN claims - remove hedging, qualifications, and throat-clearing that add no precision
3. CUT filler - remove decorative language, empty transitions, and padding that carries no information
4. PRESERVE all substantive claims, evidence, examples, and logical connections
5. PRESERVE the author's voice and argumentative structure
6. DO NOT add new content, examples, or claims
7. DO NOT change the meaning or weaken any argument
8. DO NOT remove important nuances or qualifications that genuinely add precision
9. Maintain paragraph structure where the original paragraphs serve distinct purposes
10. Output plain prose only - no markdown, no bullet points, no headers

LENGTH REQUIREMENT:
- Input: ${inputWords} words
- Target output: approximately ${targetWords} words (${minWords}-${maxWords} range)
- Your output should be SHORTER than the input
- Every cut must be justified by one of: repetition, filler, hedging, or redundancy

TEXT TO REFINE:
${chunkText}

Output ONLY the refined text. No commentary, no explanations, no preamble.`;

  let result = '';
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
        const response = await getAnthropic().messages.create({
          model: "claude-sonnet-4-20250514",
          messages: [{ role: "user", content: prompt }],
          max_tokens: Math.min(8000, Math.round(inputWords * 2)),
          temperature: 0.3,
        });
        const block = response.content[0];
        result = block.type === 'text' ? block.text : '';
      } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
        const response = await getOpenAI().chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          max_tokens: Math.min(8000, Math.round(inputWords * 2)),
          temperature: 0.3,
        });
        result = response.choices[0].message.content || '';
      } else if (provider === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [{ role: "user", content: prompt }],
            max_tokens: Math.min(8000, Math.round(inputWords * 2)),
            temperature: 0.3,
          }),
        });
        if (!response.ok) throw new Error(`DeepSeek API error: ${response.statusText}`);
        const data = await response.json();
        result = data.choices[0].message.content || '';
      } else if (provider === 'grok' && process.env.GROK_API_KEY) {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: "grok-3-latest",
            messages: [{ role: "user", content: prompt }],
            max_tokens: Math.min(8000, Math.round(inputWords * 2)),
            temperature: 0.3,
          }),
        });
        if (!response.ok) throw new Error(`Grok API error: ${response.statusText}`);
        const data = await response.json();
        result = data.choices[0].message.content || '';
      } else if (provider === 'perplexity' && process.env.PERPLEXITY_API_KEY) {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: "llama-3.1-sonar-small-128k-online",
            messages: [{ role: "user", content: prompt }],
            max_tokens: Math.min(8000, Math.round(inputWords * 2)),
            temperature: 0.3,
          }),
        });
        if (!response.ok) throw new Error(`Perplexity API error: ${response.statusText}`);
        const data = await response.json();
        result = data.choices[0].message.content || '';
      } else {
        throw new Error(`Provider ${provider} not configured`);
      }

      result = cleanMarkdown(result);

      const outputWords = countWords(result);
      if (outputWords >= minWords) {
        console.log(`[SignalRefiner] Chunk ${chunkIndex + 1}/${totalChunks}: ${inputWords} -> ${outputWords} words (${Math.round((1 - outputWords / inputWords) * 100)}% reduction)`);
        await logLLMCall({ provider, modelName: provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o', jobType: 'signal-refiner', inputTokens: Math.round(prompt.length / 4), outputTokens: Math.round(result.length / 4) });
        return result;
      }

      console.log(`[SignalRefiner] Chunk ${chunkIndex + 1} attempt ${attempt}: output too short (${outputWords} < ${minWords}), retrying...`);
    } catch (error: any) {
      console.error(`[SignalRefiner] Chunk ${chunkIndex + 1} attempt ${attempt} failed:`, error.message);
      if (attempt >= MAX_RETRIES) throw error;
    }
  }

  return result || chunkText;
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-z]*\n?/gi, '').replace(/```/g, ''))
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/>\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function refineSignal(
  text: string,
  provider: string,
  customInstructions: string = ''
): Promise<RefinerResult> {
  const inputWords = countWords(text);
  console.log(`[SignalRefiner] Starting refinement: ${inputWords} words, provider: ${provider}`);

  if (inputWords < 50) {
    throw new Error('Text too short for signal refinement (minimum 50 words)');
  }

  const documentStructure = await extractDocumentStructure(text, provider);
  console.log(`[SignalRefiner] Document structure extracted (${countWords(documentStructure)} words)`);

  const chunks = smartChunk(text);
  console.log(`[SignalRefiner] Text split into ${chunks.length} chunks`);

  const refinedChunks: string[] = [];
  let priorSummary = '';

  for (let i = 0; i < chunks.length; i++) {
    const refined = await refineChunk(
      chunks[i].text,
      i,
      chunks.length,
      documentStructure,
      priorSummary,
      customInstructions,
      provider
    );
    refinedChunks.push(refined);

    const lastWords = refined.split(/\s+/).slice(-100).join(' ');
    priorSummary = priorSummary
      ? `${priorSummary}\n[Chunk ${i + 1}]: ...${lastWords}`
      : `[Chunk ${i + 1}]: ...${lastWords}`;

    if (priorSummary.length > 2000) {
      const lines = priorSummary.split('\n');
      priorSummary = lines.slice(Math.max(0, lines.length - 3)).join('\n');
    }
  }

  const output = refinedChunks.join('\n\n');
  const outputWords = countWords(output);
  const reductionPercent = Math.round((1 - outputWords / inputWords) * 100);

  console.log(`[SignalRefiner] Complete: ${inputWords} -> ${outputWords} words (${reductionPercent}% reduction)`);

  return {
    output,
    inputWords,
    outputWords,
    chunksProcessed: chunks.length,
    reductionPercent
  };
}
