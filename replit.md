# NEUROTEXT

## Overview
NEUROTEXT is a multi-model AI evaluation platform designed to analyze written text to assess authors' intelligence and cognitive fingerprints. It offers deep insights into cognitive abilities and thought processes. Key capabilities include comprehensive document analysis, AI detection, multi-language translation, cognitive profiling, and intelligent text rewriting with advanced features for maximizing intelligence scores. The project aims to become a leading platform for advanced cognitive text evaluation, serving diverse markets from academic research to professional content creation.

## User Preferences
Preferred communication style: Simple, everyday language.
Page count conversion: 1 page = 600 words (e.g., "5 page paper" = 3000 words).

## System Architecture
The application uses a monorepo structure, separating client and server components.

**UI/UX Decisions:**
The frontend is built with React, TypeScript, TailwindCSS, and shadcn/ui, providing a modern and responsive user interface. Data visualization is powered by Chart.js, and analysis reports are presented using detailed card-based layouts. The system supports various input/output options including PDF/text downloads, document uploads, and output downloads.

**Technical Implementations & Feature Specifications:**
- **Frontend**: React, TypeScript, TailwindCSS, shadcn/ui, wouter, React Query, Chart.js.
- **Backend**: Express.js with TypeScript, integrating multiple LLMs, document processing, speech-to-text, and email services.
- **Database**: PostgreSQL with Drizzle ORM for managing user, document, analysis, and cognitive profile data.
- **Core Services**:
    - **Multi-Model Intelligence Evaluation**: A 4-phase system assessing 17 cognitive dimensions with genre-aware analysis.
    - **Intelligent Rewrite Function (MAXINTEL)**: Recursively optimizes text for intelligence scores, supporting custom instructions and external knowledge.
    - **GPT Bypass Humanizer**: Transforms AI-generated text to evade AI detection.
    - **Coherence Meter**: Supports inputs up to 5000 words with Global Coherence Preservation Protocol, including specialized modes for mathematical proofs and scientific-explanatory coherence.
    - **Screenplay Generator**: Converts source material into properly formatted screenplays following a three-act structure, with beat placement and proper formatting. It handles large text chunks and custom instructions for tone, genre, and character focus, emphasizing visual storytelling.
    - **Signal Refiner**: A post-processing function designed to maximize signal-to-noise ratio in large generated texts by eliminating repetitions, tightening claims, and cutting bloat. It uses a chunked processing architecture with document structure extraction and supports multiple LLM providers.
    - **Text Model Validator**: Focuses on the RECONSTRUCTION function for conservative charitable interpretation.
    - **AI Chat Assistant**: Provides conversation history and context from the Zhi Database.
    - **Conservative Reconstruction**: Generates coherent essays articulating a text's unified argument, using outline-first and cross-chunk strategies for medium to long documents, with asynchronous processing and real-time polling for status updates. It supports documents up to 100,000 words.
    - **Universal Expansion Service**: A protocol-based reconstruction service that strictly adheres to user instructions regardless of input length. It features a **THREE-PASS CROSS-CHUNK COHERENCE (CC) ARCHITECTURE** for robust coherence tracking across document sections (Skeleton Extraction, Constrained Chunk Processing, Stitch Pass). It precisely handles target word counts, structural specifications, citation requests, and constraint handling, ensuring coherent continuations for exact word count enforcement.
    - **Full Suite Pipeline**: One-click execution of Reconstruction, Objections, and Objection-Proof Final Version.
    - **Objections Function**: Generates 25 likely objections with compelling counter-arguments, using an outline-first approach for large documents.
    - **Generate Objection-Proof Version (Bullet-Proof Rewrite)**: Rewrites text to preemptively address objections. It includes claim-aware sectioning, header preservation, paragraph count enforcement, hedging detection, and a two-tier format preservation system for maintaining specific text formats.
    - **Global Coherence State (GCS) System**: An architectural overhaul for tracking coherence across chunks, with mode-specific state dimensions for 8 coherence types.
    - **TextStats Component with AI Detection**: Displays word/character counts and GPTZero-powered AI detection results.
    - **Job History System**: Provides persistent tracking and viewing of processing jobs, including a Job History Page, a Persistent Job Viewer Modal, active job context, and resume functionality for interrupted jobs.
    - **Intelligent Input Interpretation System**: Smartly detects and handles user inputs across all functions, including instructions-only mode, automatic swap detection, and expansion keyword detection, with full suite integration and user notifications.
    - **NEUROTEXT Core Behavior Rules**: The application consistently follows user instructions. This includes overriding default formats with custom instructions, auto-expanding texts without instructions (to 5000 words for small inputs, 1.5x for large inputs), and supporting instructions-only mode. It enforces "NO PUFFERY" and "NO HEDGING" rules, ensuring substantive and confident prose. ZHI 1 (OpenAI) is the default LLM provider.
    - **Credit System**: A token-based credit deduction system with provider-specific multipliers for different LLM services, integrated with Stripe for purchases and real-time balance updates.
- **ZHI Provider Mapping**:
    - **ZHI 1**: OpenAI (GPT-4)
    - **ZHI 2**: Anthropic (Claude)
    - **ZHI 3**: DeepSeek
    - **ZHI 4**: Perplexity
    - **ZHI 5**: Grok (xAI)

## External Dependencies
- **AI Service Providers**: OpenAI API (GPT-4), Anthropic API (Claude), DeepSeek API, Perplexity AI, Grok API (xAI).
- **Supporting Services**: Mathpix OCR, AssemblyAI, SendGrid, Google Custom Search, Stripe (for credit purchases), AnalyticPhilosophy.net Zhi API.
- **Database & Infrastructure**: Neon/PostgreSQL, Drizzle ORM, Replit.