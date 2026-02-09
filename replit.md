# NEUROTEXT

## Overview
NEUROTEXT is designed to analyze written text using multi-model AI evaluation to assess authors' intelligence and cognitive fingerprints. It provides deep insights into cognitive abilities and thought processes from written content. Key capabilities include document analysis, AI detection, multi-language translation, comprehensive cognitive profiling, and intelligent text rewriting with advanced features for maximizing intelligence scores. Its business vision is to offer unparalleled textual analysis, catering to diverse market needs from academic research to professional content creation, aiming to become the leading platform for advanced cognitive text evaluation.

## User Preferences
Preferred communication style: Simple, everyday language.
Page count conversion: 1 page = 600 words (e.g., "5 page paper" = 3000 words).

## System Architecture
The application employs a monorepo structure, separating client and server components.

**UI/UX Decisions:**
- Frontend uses React with TypeScript, TailwindCSS, and shadcn/ui for a modern and responsive user interface.
- Data visualization is handled by Chart.js.
- Detailed card-based layouts are used for analysis reports.
- Supports PDF/text downloads, document upload, and output downloads.

**Technical Implementations & Feature Specifications:**
- **Frontend**: React, TypeScript, TailwindCSS, shadcn/ui, wouter, React Query, Chart.js.
- **Backend**: Express.js with TypeScript, integrating multiple LLMs, document processing, speech-to-text, and email services.
- **Database**: PostgreSQL with Drizzle ORM for user, document, analysis, and cognitive profile data.
- **Core Services**:
    - **Multi-Model Intelligence Evaluation**: A 4-phase system assessing 17 cognitive dimensions, supporting genre-aware analysis.
    - **Intelligent Rewrite Function (MAXINTEL)**: Recursively optimizes text for intelligence scores, with custom instructions and external knowledge integration.
    - **GPT Bypass Humanizer**: Transforms AI-generated text to bypass AI detection.
    - **Coherence Meter**: Supports up to 5000-word inputs with Global Coherence Preservation Protocol. Includes specialized modes:
        - **Mathematical Proof System** (COHERENCE, COGENCY, MAX COHERENCE, MAXIMIZE TRUTH).
        - **Scientific-Explanatory Coherence Type**: Dual assessment of logical consistency and scientific accuracy, with rewrite function to correct pseudoscientific claims.
    - **Screenplay Generator** (Jan 2026): Converts source material into properly formatted screenplays with:
        - **Three-act structure**: 25% Act One, 50% Act Two, 25% Act Three
        - **Beat placement**: Inciting incident (10%), midpoint reversal (50%), all-is-lost (75%), climax (90%)
        - **Proper screenplay formatting**: FADE IN/OUT, scene headings (INT./EXT. LOCATION - DAY/NIGHT), action lines, character names in capitals, dialogue, parentheticals, transitions
        - **Large-text chunking**: Handles any target word count (default 20,000 words) through chunked generation
        - **Custom instructions**: Supports tone, genre, character focus, and creative direction customization
        - **Visual storytelling only**: No internal thoughts, no camera directions, present tense throughout
    - **Text Model Validator**: Exclusively focused on the RECONSTRUCTION function for conservative charitable interpretation.
    - **AI Chat Assistant**: Provides conversation history and context from the Zhi Database.
    - **Conservative Reconstruction**: "Charitable Interpretation" mode for generating coherent essays articulating a text's unified argument, with advanced outline-first and cross-chunk strategies for medium and long documents. Features:
        - **Database-backed projects**: Stores reconstruction projects with status tracking (processing, completed, failed)
        - **Async processing**: Uses crossChunkReconstruct service with Anthropic Claude for background processing
        - **Real-time polling**: Frontend polls every 5 seconds for status updates with proper cleanup on unmount
        - **Supports up to 100,000 words**: Handles large documents through chunked processing
    - **Universal Expansion Service** (Jan 2026): Protocol-based reconstruction that obeys ALL user instructions exactly, regardless of input length. Key features:
        - **THREE-PASS CROSS-CHUNK COHERENCE (CC) ARCHITECTURE** (Feb 2026):
            - **PASS 1 - SKELETON EXTRACTION**: Before any generation, extracts document DNA: THESIS, ARGUMENT ARC (8-20 claims), KEY_TERMS (with exact definitions), COMMITMENT_LEDGER (asserts/rejects/assumes), ENTITIES (~2000 tokens)
            - **PASS 2 - CONSTRAINED CHUNK PROCESSING**: Skeleton injected into EVERY section prompt (initial + continuation). After each section, delta report collected (new claims, terms used, conflicts detected). Delta reports saved to database with chunks.
            - **PASS 3 - STITCH PASS**: After all sections generated, reviews all delta reports. If conflicts/violations detected, executes micro-repairs (find-and-replace). Logs terminology drift and redundancies.
            - **Skeleton Constraint**: Every section must use terms exactly as defined, not contradict assertions, not affirm rejections, reference entities consistently
            - **Delta Reports**: Track what each section adds (new claims, terms used, conflict detection with COMPLIANT/VIOLATION status)
        - **No thresholds**: Input length is irrelevant; user instructions are ALWAYS followed
        - **Target word count parsing**: Detects "expand to X words" instructions and delivers exact output
        - **Structure parsing**: Detects chapter/section specifications with word counts (e.g., "CHAPTER 1: Introduction (3,500 words)")
        - **Citation support**: Parses requests for academic citations and philosopher references
        - **Constraint handling**: Respects academic register, no bullet points, subsection requirements
        - **Section-by-section generation**: Creates outline first, then generates each section with coherence context
        - Example: 165-word input + "EXPAND TO 20,000 WORDS" → produces full 20,000-word thesis with specified structure
        - **Word Count Enforcement with Coherent Continuations** (Jan 2026): Ensures documents ALWAYS meet target word counts:
            - After initial chunk processing, checks if cumulative word count < targetMinWords
            - If shortfall detected, reads all existing content from database for context
            - Generates coherent continuation chunks (up to 15 attempts, ~4000 words each)
            - Each continuation reads last ~2000 words for seamless continuation
            - Continuations saved as database chunks with proper delta/coherence tracking
            - System accepts 95%+ of target if LLM reaches natural conclusion
            - Completion message includes: targetMet status, percentage, shortfall amount, failure reasons
    - **Full Suite Pipeline**: One-click execution of Reconstruction, Objections, and Objection-Proof Final Version.
    - **Objections Function**: Generates 25 likely objections with compelling counter-arguments. For large documents (1,200+ words), uses outline-first approach that extracts argument structure first, then generates categorized objections (logical, evidential, practical, audience-specific, methodological) with severity ratings.
    - **Generate Objection-Proof Version (Bullet-Proof Rewrite)**: Rewrites text to preemptively address identified objections. Enhanced with:
        - **Claim-aware sectioning**: Detects claim-based structure (Claim 1:, Claim 2:, etc.) and preserves each claim with its paragraphs as a unit
        - **Header preservation**: Extracts and validates original claim headers, auto-prepends if missing
        - **Paragraph count enforcement**: Requires exact match, retries with stricter prompt if count differs
        - **Hedging detector**: Scans for 15 forbidden hedging phrases, retries if excessive hedging found
        - **Retry mechanism**: Up to 2 retries with progressively stricter instructions for structural compliance
        - **Anti-hedging guidance**: Produces confident prose that integrates objection-responses as assertions, not qualifications
        - **Two-Tier Format Preservation System** (Dec 2025):
            - **Custom Instruction Format Detection**: Detects glossary, numbered list, and non-paragraph formats from user instructions
            - **Input Format Detection**: Detects when reconstruction output is already in numbered format (e.g., "1. 'Claim...' Defense paragraphs")
            - **Format-Preserving Rewrite**: When numbered format detected in input, enforces EXACT item count and preserves quoted claims verbatim
            - **Direct Format Rewrite**: Bypasses section-based processing for special formats (glossaries, lists) to respect exact formatting requirements
    - **Global Coherence State (GCS) System**: Architectural overhaul for coherence tracking across chunks, with mode-specific state dimensions for 8 coherence types.
    - **TextStats Component with AI Detection**: Displays word/character counts and GPTZero-powered AI detection results.
    - **Job History System** (Jan 2026): Persistent tracking and viewing of processing jobs. Features:
        - **Database-backed job storage**: Jobs stored in reconstruction_projects, coherence_documents, coherence_chunks tables
        - **Job History Page**: Accessible from navigation, shows all jobs with status (completed, in-progress, interrupted)
        - **Persistent Job Viewer Modal**: Content always accessible during and after processing via shared modal
        - **Active Job Context**: Tracks current processing job with sessionStorage persistence
        - **View Current Job Button**: Appears in header during active processing
        - **Resume Functionality**: Interrupted jobs can be resumed from where they stopped
        - **Auto-refresh**: Viewer polls every 3 seconds for in-progress jobs
        - **Copy/Download**: Always available for generated content in the viewer
    - **Intelligent Input Interpretation System** (Jan 2026): Smart detection and handling of user inputs across all functions:
        - **Instructions-Only Mode**: Allows users to generate content without source text (e.g., "Write a 50,000 word essay on Freud")
        - **Automatic Swap Detection**: If user places instructions in the text box and content in instructions box, system detects and swaps automatically
        - **Expansion Keyword Detection**: Recognizes keywords like "expand", "write", "generate", "produce", etc.
        - **Full Suite Integration**: All three stages (Reconstruction, Objections, Objection-Proof) use interpreted inputs
        - **Toast Notification**: Users are notified when inputs are automatically interpreted/swapped
    - **NEUROTEXT Core Behavior Rules** (Jan 2026): The app ALWAYS follows user instructions exactly:
        - **Custom Instructions Override**: When user provides instructions (e.g., "TURN INTO ONE MAN PLAY"), the app produces exactly that format, not an academic outline
        - **Auto-Expand Without Instructions**: Small input (<1000 words) + no instructions → auto-expand to 5000 word scholarly version. Large input → expand by 1.5x with real content
        - **Instructions-Only Mode**: User can enter only instructions (e.g., "WRITE A 200K DISSERTATION ON BOTANY") with no source text → app complies
        - **NO PUFFERY Rule**: Every word must carry substantive meaning. No filler or decorative language
        - **NO HEDGING Rule**: Never use hedging language like "may", "might", "perhaps", "arguably"
        - **ZHI 1 Default**: Default LLM provider is now ZHI 1 (OpenAI)
    - **Credit System** (Jan 2026): Token-based credit deduction with provider multipliers:
        - **$100 Package**: 1000 credits via Stripe (STRIPE_PRICE_ID_100)
        - **Token Multipliers** (credits = tokens generated × multiplier):
            - DeepSeek (ZHI 3): 1x
            - Grok (ZHI 5): 3x
            - ChatGPT/OpenAI (ZHI 1): 5x
            - Claude/Anthropic (ZHI 2): 7x
            - Perplexity (ZHI 4): 7x
        - **Real-time Balance**: Updates every 3 seconds in header
        - **Credit Deduction**: Calculated after each LLM response based on tokens generated

## ZHI Provider Mapping
- **ZHI 1**: OpenAI (GPT-4)
- **ZHI 2**: Anthropic (Claude)
- **ZHI 3**: DeepSeek
- **ZHI 4**: Perplexity
- **ZHI 5**: Grok (xAI)

## Verified Milestones & Restore Points

### 100,000 Word Generation - VERIFIED (Jan 11, 2026)
**Commit: 171f8767958362824b719ddbf9456c79c2270461**
- **Test Result**: 99,518 words generated (99.5% of 100k target)
- **Generation Time**: 55 minutes
- **Sections**: 15 complete chapters with proper structure
- **Sample Output**: `100k_dissertation_FULL.txt` (763 KB)
- **Database Storage**: All chunks saved to `coherence_chunks` table with document_id pattern `ue-{timestamp}-%`
- **Key Fix**: Section allocation now sums exactly to 100% of target word count
- **Extraction Method**: Query database by document_id prefix, join by chunk_index

### 50,000 Word Generation - VERIFIED (Jan 2026)
- **Test Results**: 49,319-50,471 words (98-101% accuracy)
- **WebSocket Streaming**: Real-time progress updates via `/ws/cc-stream`

## External Dependencies
- **AI Service Providers**: OpenAI API (GPT-4), Anthropic API (Claude), DeepSeek API, Perplexity AI, Grok API (xAI).
- **Supporting Services**: Mathpix OCR, AssemblyAI, SendGrid, Google Custom Search, Stripe (for credit purchases), AnalyticPhilosophy.net Zhi API.
- **Database & Infrastructure**: Neon/PostgreSQL, Drizzle ORM, Replit.