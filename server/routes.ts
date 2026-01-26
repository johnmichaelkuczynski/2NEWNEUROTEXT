import { Express, Request, Response, NextFunction } from "express";
import { setupAuth } from "./auth";
import multer from "multer";
import { storage } from "./storage";
import path from "path";
import { registerPaymentRoutes } from "./routes/payments";
import OpenAI from "openai";
import { logLLMCall, logAuditEvent, summarizeText } from "./services/auditService";
// GPT Bypass Humanizer imports
import { fileProcessorService } from "./services/fileProcessor";
import { textChunkerService } from "./services/textChunker";
import { gptZeroService } from "./services/gptZero";
import { aiProviderService } from "./services/aiProviders";
import { type RewriteRequest, type RewriteResponse } from "@shared/schema";
import { extractTextFromFile } from "./api/documentParser";
import { sendSimpleEmail } from "./api/simpleEmailService";
import { upload as speechUpload, processSpeechToText } from "./api/simpleSpeechToText";
// HCC Service for large document processing
import { processHccDocument, parseTargetLength, calculateLengthConfig, countWords } from "./services/hccService";
// Note: crossChunkReconstruct is dynamically imported in the reconstruction route to avoid eager loading
// DB-Enforced Reconstruction with SSE streaming
import { 
  shouldUseDBEnforced, 
  runFullReconstruction, 
  abortSession, 
  getPartialOutput,
  type ProcessingProgress 
} from "./services/dbEnforcedReconstruction";
import { checkAndDeductCredits, hasUnlimitedCredits, getUserWordLimit, FREEMIUM_WORD_LIMIT } from "./services/creditManager";


// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Configure multer for GPT Bypass file uploads
const gptBypassUpload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

interface DocumentInput {
  content: string;
  filename?: string;
  mimeType?: string;
  metadata?: {
    pageCount?: number;
    info?: Record<string, any>;
    version?: string;
    [key: string]: any;
  };
}

interface AIDetectionResult {
  isAI: boolean;
  probability: number;
}

// Map ZHI names to actual provider names
function mapZhiToProvider(zhiName: string): string {
  const mapping: Record<string, string> = {
    'zhi1': 'openai',
    'zhi2': 'anthropic', 
    'zhi3': 'deepseek',
    'zhi4': 'perplexity',
    'zhi5': 'grok'
  };
  return mapping[zhiName] || zhiName;
}

// Helper function to clean markup from AI responses
function cleanMarkup(text: string): string {
  return text
    // Remove markdown bold/italic markers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    // Remove markdown headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove code block markers
    .replace(/```[\s\S]*?```/g, (match) => {
      return match.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
    })
    // Remove other common markdown symbols
    .replace(/~~([^~]+)~~/g, '$1') // strikethrough
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/>\s+/gm, '') // blockquotes
    // Remove excessive whitespace and clean up
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// REAL-TIME STREAMING: Case Assessment for ALL ZHI providers
async function streamCaseAssessment(text: string, provider: string, res: any, context?: string) {
  let prompt = `Assess how well this text makes its case. Analyze argument effectiveness, proof quality, claim credibility and provide specific numerical scores.

REQUIRED FORMAT:
PROOF EFFECTIVENESS: [0-100]/100
CLAIM CREDIBILITY: [0-100]/100  
NON-TRIVIALITY: [0-100]/100
PROOF QUALITY: [0-100]/100
FUNCTIONAL WRITING: [0-100]/100
OVERALL CASE SCORE: [0-100]/100

Then provide detailed analysis organized into sections:

**Strengths:**
- [List key strengths]

**Weaknesses:**  
- [List key weaknesses]

**Potential Counterarguments:**
- [List potential counterarguments]

**Conclusion:**
[Final assessment]`;
  
  // Add context information if provided
  if (context && context.trim()) {
    prompt += `\n\nIMPORTANT CONTEXT: ${context.trim()}\n\nPlease adjust your evaluation approach based on this context. For example, if this is "an abstract" or "a fragment", do not penalize it for lacking full development that would be expected in a complete work.`;
  }
  
  prompt += `\n\nTEXT TO ASSESS:\n${text}`;

  if (provider === 'openai') {
    // ZHI 1: OpenAI streaming
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 4000,
        temperature: 0.7,
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(content);
              (res as any).flush?.();
            }
          } catch (e) {}
        }
      }
    }
  } else if (provider === 'anthropic') {
    // ZHI 2: Anthropic streaming
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-7-sonnet-20250219',
        max_tokens: 4000,
        stream: true,
        messages: [{ role: 'user', content: prompt }]
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              res.write(parsed.delta.text);
              (res as any).flush?.();
            }
          } catch (e) {}
        }
      }
    }
  } else if (provider === 'deepseek') {
    // ZHI 3: DeepSeek streaming
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 4000,
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(content);
              (res as any).flush?.();
            }
          } catch (e) {}
        }
      }
    }
  } else if (provider === 'grok') {
    // ZHI 4: Grok streaming
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-3',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 4000,
        temperature: 0.7,
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(content);
              (res as any).flush?.();
            }
          } catch (e) {}
        }
      }
    }
  } else if (provider === 'perplexity') {
    // Perplexity streaming
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 4000,
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(content);
              (res as any).flush?.();
            }
          } catch (e) {}
        }
      }
    }
  }
  res.end();
}

// REAL-TIME STREAMING: Fiction Assessment for ALL ZHI providers
async function streamFictionAssessment(text: string, provider: string, res: any) {
  const prompt = `Assess this fiction text for literary quality, narrative effectiveness, character development, and prose style:

${text}

Provide detailed analysis of literary merit, character development, plot structure, and creative intelligence.`;

  if (provider === 'openai') {
    // ZHI 1: OpenAI streaming
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 4000,
        temperature: 0.7,
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(content);
              (res as any).flush?.();
            }
          } catch (e) {}
        }
      }
    }
  } else if (provider === 'anthropic') {
    // ZHI 2: Anthropic streaming
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-7-sonnet-20250219',
        max_tokens: 4000,
        stream: true,
        messages: [{ role: 'user', content: prompt }]
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              res.write(parsed.delta.text);
              (res as any).flush?.();
            }
          } catch (e) {}
        }
      }
    }
  } else if (provider === 'deepseek') {
    // ZHI 3: DeepSeek streaming
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 4000,
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(content);
              (res as any).flush?.();
            }
          } catch (e) {}
        }
      }
    }
  } else if (provider === 'grok') {
    // ZHI 4: Grok streaming
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-3',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 4000,
        temperature: 0.7,
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(content);
              (res as any).flush?.();
            }
          } catch (e) {}
        }
      }
    }
  } else if (provider === 'perplexity') {
    // Perplexity streaming
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 4000,
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(content);
              (res as any).flush?.();
            }
          } catch (e) {}
        }
      }
    }
  }
  res.end();
}

export async function registerRoutes(app: Express): Promise<Express> {
  
  // Setup authentication
  setupAuth(app);
  
  // Register payment routes
  registerPaymentRoutes(app);
  
  // Simple Stripe webhook for payment link purchases
  // Note: Uses STRIPE_PRICE_ID_100 environment variable for checkout
  app.post("/webhook/stripe", async (req: Request, res: Response) => {
    const { stripe } = await import('./lib/stripe-config');
    
    if (!stripe) {
      console.error("[Stripe Webhook] STRIPE_SECRET_KEY not configured");
      return res.status(503).send("Stripe not configured");
    }
    
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
      return res.status(503).send("Webhook secret not configured");
    }
    
    const sig = req.headers["stripe-signature"];
    
    if (!sig) {
      console.error("[Stripe Webhook] No signature provided");
      return res.status(400).send("No signature");
    }
    
    let event;
    try {
      // Use raw body for signature verification
      event = stripe.webhooks.constructEvent(
        req.body,
        sig as string,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err: any) {
      console.error("[Stripe Webhook] Signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    console.log(`[Stripe Webhook] Received event: ${event.type}`);
    
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      
      try {
        const customerEmail = session.customer_details?.email;
        const amountTotal = session.amount_total; // Amount in cents
        
        if (!customerEmail) {
          console.error("[Stripe Webhook] No customer email in session");
          return res.status(400).send("No customer email");
        }
        
        // Calculate credits: $1 = 1000 credits
        const dollars = amountTotal / 100;
        const credits = dollars * 1000;
        
        console.log(`[Stripe Webhook] Processing payment: ${customerEmail} paid $${dollars} for ${credits} credits`);
        
        // Find user by email
        const user = await storage.getUserByEmail(customerEmail);
        
        if (!user) {
          console.error(`[Stripe Webhook] User not found for email: ${customerEmail}`);
          return res.status(400).send("User not found");
        }
        
        // Add credits to user
        await storage.addCreditsFromStripe(user.id, credits);
        console.log(`[Stripe Webhook] Added ${credits} credits to user ${user.id} (${customerEmail})`);
        
        res.json({ received: true, credits });
      } catch (error: any) {
        console.error("[Stripe Webhook] Error processing payment:", error);
        return res.status(500).send("Error processing payment");
      }
    } else {
      res.json({ received: true });
    }
  });
  
  // API health check endpoint
  app.get("/api/check-api", async (_req: Request, res: Response) => {
    const openai_key = process.env.OPENAI_API_KEY;
    const anthropic_key = process.env.ANTHROPIC_API_KEY;
    const deepseek_key = process.env.DEEPSEEK_API_KEY;
    const perplexity_key = process.env.PERPLEXITY_API_KEY;
    const grok_key = process.env.GROK_API_KEY;
    const mathpix_app_id = process.env.MATHPIX_APP_ID;
    const mathpix_app_key = process.env.MATHPIX_APP_KEY;
    
    // Check API keys
    res.json({
      status: "operational",
      api_keys: {
        openai: openai_key ? "configured" : "missing",
        anthropic: anthropic_key ? "configured" : "missing",
        deepseek: deepseek_key ? "configured" : "missing",
        perplexity: perplexity_key ? "configured" : "missing",
        grok: grok_key ? "configured" : "missing",
        mathpix: (mathpix_app_id && mathpix_app_key) ? "configured" : "missing"
      }
    });
    
    // Log API status for monitoring
    console.log("API Status Check:", { 
      openai: openai_key ? "✓" : "✗", 
      anthropic: anthropic_key ? "✓" : "✗", 
      deepseek: deepseek_key ? "✓" : "✗",
      perplexity: perplexity_key ? "✓" : "✗",
      grok: grok_key ? "✓" : "✗",
      mathpix: (mathpix_app_id && mathpix_app_key) ? "✓" : "✗"
    });
  });

  // Quick analysis API endpoint with evaluation type support
  app.post("/api/quick-analysis", async (req: Request, res: Response) => {
    try {
      const { text, provider = 'zhi1', evaluationType = 'intelligence' } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ 
          error: "Text is required and must be a string" 
        });
      }

      // Validate evaluation type
      const validTypes = ['intelligence', 'originality', 'cogency', 'overall_quality'];
      if (!validTypes.includes(evaluationType)) {
        return res.status(400).json({
          error: `Invalid evaluation type. Must be one of: ${validTypes.join(', ')}`
        });
      }

      console.log(`Starting quick ${evaluationType} analysis with ${provider}...`);
      
      const { performQuickAnalysis } = await import('./services/quickAnalysis');
      const result = await performQuickAnalysis(text, provider, evaluationType);
      
      res.json({ success: true, result });
      
    } catch (error: any) {
      console.error("Quick analysis error:", error);
      res.status(500).json({ 
        error: true, 
        message: error.message || "Quick analysis failed" 
      });
    }
  });

  // Quick comparison API endpoint with evaluation type support
  app.post("/api/quick-compare", async (req: Request, res: Response) => {
    try {
      const { documentA, documentB, provider = 'zhi1', evaluationType = 'intelligence' } = req.body;

      if (!documentA || !documentB) {
        return res.status(400).json({ 
          error: "Both documents are required" 
        });
      }

      // Validate evaluation type
      const validTypes = ['intelligence', 'originality', 'cogency', 'overall_quality'];
      if (!validTypes.includes(evaluationType)) {
        return res.status(400).json({
          error: `Invalid evaluation type. Must be one of: ${validTypes.join(', ')}`
        });
      }

      console.log(`Starting quick ${evaluationType} comparison with ${provider}...`);
      
      const { performQuickComparison } = await import('./services/quickAnalysis');
      const result = await performQuickComparison(documentA, documentB, provider, evaluationType);
      
      res.json(result);
      
    } catch (error: any) {
      console.error("Quick comparison error:", error);
      res.status(500).json({ 
        error: true, 
        message: error.message || "Quick comparison failed" 
      });
    }
  });

  // INTELLIGENT REWRITE - Maximize intelligence scores on protocol questions
  app.post("/api/intelligent-rewrite", async (req: Request, res: Response) => {
    try {
      const { originalText, customInstructions, provider = 'zhi1', useExternalKnowledge = false } = req.body;

      if (!originalText || typeof originalText !== 'string') {
        return res.status(400).json({ 
          error: "Original text is required and must be a string" 
        });
      }

      console.log(`Starting intelligent rewrite with ${provider}...`);
      console.log(`Original text length: ${originalText.length} characters`);
      console.log(`Custom instructions: ${customInstructions || 'None'}`);
      console.log(`External knowledge: ${useExternalKnowledge ? 'ENABLED' : 'DISABLED'}`);
      
      const { performIntelligentRewrite } = await import('./services/intelligentRewrite');
      const result = await performIntelligentRewrite({
        text: originalText,
        customInstructions,
        provider,
        useExternalKnowledge
      });
      
      res.json({
        success: true,
        result: result
      });
      
    } catch (error: any) {
      console.error("Intelligent rewrite error:", error);
      res.status(500).json({ 
        error: true, 
        message: error.message || "Intelligent rewrite failed" 
      });
    }
  });

  // COMPREHENSIVE 4-PHASE EVALUATION using exact protocol with evaluation type support
  app.post("/api/cognitive-evaluate", async (req: Request, res: Response) => {
    try {
      const { content, provider = 'zhi1', evaluationType = 'intelligence' } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ 
          error: "Content is required and must be a string" 
        });
      }

      // Validate evaluation type
      const validTypes = ['intelligence', 'originality', 'cogency', 'overall_quality'];
      if (!validTypes.includes(evaluationType)) {
        return res.status(400).json({
          error: `Invalid evaluation type. Must be one of: ${validTypes.join(', ')}`
        });
      }

      // Import the exact 4-phase protocol
      const { executeFourPhaseProtocol } = await import('./services/fourPhaseProtocol');

      console.log(`EXACT 4-PHASE ${evaluationType.toUpperCase()} EVALUATION: Analyzing ${content.length} characters with protocol`);
      
      const evaluation = await executeFourPhaseProtocol(
        content, 
        provider as 'openai' | 'anthropic' | 'perplexity' | 'deepseek',
        evaluationType as 'intelligence' | 'originality' | 'cogency' | 'overall_quality'
      );

      res.json({
        success: true,
        evaluation: {
          formattedReport: evaluation.formattedReport,
          overallScore: evaluation.overallScore,
          provider: evaluation.provider,
          metadata: {
            contentLength: content.length,
            evaluationType: evaluationType,
            timestamp: new Date().toISOString()
          }
        }
      });

    } catch (error: any) {
      console.error(`Error in ${req.body.evaluationType || 'cognitive'} evaluation:`, error);
      res.status(500).json({
        success: false,
        error: `${req.body.evaluationType || 'cognitive'} evaluation failed`,
        details: error.message
      });
    }
  });
  
  // Extract text from uploaded document
  app.post("/api/extract-text", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file && !req.body.content) {
        return res.status(400).json({ error: "No file or content provided" });
      }
      
      // Direct content input
      if (req.body.content) {
        return res.json({
          content: req.body.content,
          filename: req.body.filename || "direct-input.txt",
          mimeType: "text/plain",
          metadata: {}
        });
      }
      
      // Process uploaded file
      const result = await extractTextFromFile(req.file!);
      return res.json(result);
    } catch (error: any) {
      console.error("Error extracting text:", error);
      return res.status(500).json({ 
        error: true, 
        message: error.message || "Failed to extract text from document"
      });
    }
  });
  
  // Check if text is AI-generated
  app.post("/api/check-ai", async (req: Request, res: Response) => {
    try {
      const document: DocumentInput = req.body;
      
      if (!document || !document.content) {
        return res.status(400).json({ error: "Document content is required" });
      }

      // Import the AI detection method
      const { checkForAI } = await import('./api/gptZero');
      
      // Check for AI using the selected service
      console.log("DETECTING AI CONTENT");
      const result = await checkForAI(document);
      return res.json(result);
    } catch (error: any) {
      console.error("Error checking for AI:", error);
      return res.status(500).json({ 
        error: true, 
        message: error.message || "Failed to check for AI"
      });
    }
  });

  // Stream comprehensive analysis - shows results as they're generated
  app.post("/api/stream-comprehensive", async (req: Request, res: Response) => {
    try {
      const { text, provider = "zhi1" } = req.body;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "Text content is required" });
      }
      
      // Set headers for streaming
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Accel-Buffering', 'no');
      
      console.log(`Starting streaming comprehensive analysis with ${provider} for text of length: ${text.length}`);
      
      const actualProvider = mapZhiToProvider(provider);
      
      // Stream each phase as it completes
      res.write(`🔍 Starting comprehensive analysis with ${provider}...\n\n`);
      
      const { executeComprehensiveProtocol } = await import('./services/fourPhaseProtocol');
      
      // Create a streaming version that shows each phase
      try {
        res.write(`📊 PHASE 1: Answering 28 Questions\n`);
        res.write(`Analyzing ${text.length} characters with the complete 4-phase protocol...\n\n`);
        
        // Import and run a modified version that can stream updates
        const { executeStreamingComprehensiveProtocol } = await import('./services/streamingProtocol');
        
        await executeStreamingComprehensiveProtocol(
          text,
          actualProvider as 'openai' | 'anthropic' | 'deepseek',
          res
        );
        
      } catch (error: any) {
        res.write(`❌ ERROR: ${error.message}\n`);
      }
      
      res.end();
      
    } catch (error: any) {
      console.error("Error in comprehensive streaming:", error);
      res.write(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.end();
    }
  });
  
  // Analyze document
  app.post("/api/analyze", async (req: Request, res: Response) => {
    try {
      const { content, provider = "all", requireProgress = false } = req.body;
      
      if (!content) {
        return res.status(400).json({ 
          error: true, 
          message: "Document content is required",
          formattedReport: "Error: Document content is required",
          provider: provider
        });
      }
      
      // Check and deduct credits before LLM call
      if (req.isAuthenticated() && req.user) {
        const actualProvider = provider.toLowerCase() !== 'all' ? mapZhiToProvider(provider.toLowerCase()) : 'openai';
        const creditResult = await checkAndDeductCredits(
          req.user.id,
          req.user.username,
          actualProvider
        );
        
        if (!creditResult.success) {
          return res.status(402).json({
            error: true,
            message: creditResult.error,
            formattedReport: `**Insufficient Credits**\n\n${creditResult.error}\n\nPlease purchase more credits using the Buy Credits button in the header.`,
            provider: provider
          });
        }
      }
      
      // If the user requests a specific single provider
      if (provider.toLowerCase() !== 'all') {
        // Import the 4-PHASE analysis methods using your exact protocol
        const { executeFourPhaseProtocol } = await import('./services/fourPhaseProtocol');
        
        // Perform analysis with your exact 4-phase protocol
        console.log(`${provider.toUpperCase()} ANALYSIS WITH YOUR EXACT 4-PHASE INTELLIGENCE PROTOCOL`);
        
        let pureResult;
        
        try {
          // Use the unified executeFourPhaseProtocol function for intelligence evaluation
          const actualProvider = mapZhiToProvider(provider.toLowerCase());
          pureResult = await executeFourPhaseProtocol(
            content,
            actualProvider as 'openai' | 'anthropic' | 'deepseek',
            'intelligence'
          );
          
          // Use PURE result - NO FILTERING - pass through complete unfiltered evaluation
          const result = {
            id: 0,
            documentId: 0,
            provider: pureResult.provider || provider,
            formattedReport: pureResult.formattedReport || "Analysis not available",
            overallScore: pureResult.overallScore || 60,
            surface: {
              grammar: pureResult.overallScore || 60,
              structure: pureResult.overallScore || 60,
              jargonUsage: pureResult.overallScore || 60,
              surfaceFluency: pureResult.overallScore || 60
            },
            deep: {
              conceptualDepth: pureResult.overallScore || 60,
              inferentialContinuity: pureResult.overallScore || 60,
              semanticCompression: pureResult.overallScore || 60,
              logicalLaddering: pureResult.overallScore || 60,
              originality: pureResult.overallScore || 60
            },
            analysis: pureResult.formattedReport || "Analysis not available"
          };
          
          return res.json(result);
        } catch (error: any) {
          console.error(`Error in direct passthrough to ${provider}:`, error);
          return res.status(200).json({
            id: 0,
            documentId: 0, 
            provider: `${provider} (Error)`,
            formattedReport: `Error analyzing document with pure ${provider} protocol: ${error.message || "Unknown error"}`
          });
        }
      } else {
        // For 'all' provider option, analyze with all providers and verify results
        try {
          // Import the analysis verifier
          const { analyzeWithAllProviders } = await import('./services/analysisVerifier');
          
          console.log("ANALYZING WITH ALL PROVIDERS AND VERIFICATION");
          const allResults = await analyzeWithAllProviders(content);
          
          // Format the response with results from all providers
          const result = {
            id: 0,
            documentId: 0,
            provider: "All Providers",
            formattedReport: "Analysis complete with all providers. See detailed results below.",
            analysisResults: allResults
          };
          
          return res.json(result);
        } catch (error: any) {
          console.error("Error analyzing with all providers:", error);
          return res.status(200).json({
            id: 0,
            documentId: 0,
            provider: "All Providers (Error)",
            formattedReport: `Error analyzing document with all providers: ${error.message || "Unknown error"}`
          });
        }
      }
    } catch (error: any) {
      console.error("Error analyzing document:", error);
      return res.status(500).json({ 
        error: true, 
        message: `Error analyzing document: ${error.message}`
      });
    }
  });
  
  // Compare two documents (case assessment style)
  app.post("/api/compare", async (req: Request, res: Response) => {
    try {
      // Set a longer timeout for this endpoint (5 minutes)
      req.setTimeout(300000);
      
      const { documentA, documentB, provider = "openai" } = req.body;
      
      if (!documentA || !documentB) {
        return res.status(400).json({ error: "Both documents are required for comparison" });
      }
      
      // Import the document comparison service
      const { compareDocuments } = await import('./services/documentComparison');
      
      // Compare documents using the selected provider
      console.log(`COMPARING DOCUMENTS WITH ${provider.toUpperCase()}`);
      const result = await compareDocuments(documentA, documentB, provider);
      return res.json(result);
    } catch (error: any) {
      console.error("Error comparing documents:", error);
      return res.status(500).json({ 
        error: true, 
        message: error.message || "Failed to compare documents" 
      });
    }
  });

  // PURE intelligence comparison for two documents using exact 3-phase protocol
  app.post("/api/intelligence-compare", async (req: Request, res: Response) => {
    try {
      const { documentA, documentB, provider = "deepseek" } = req.body;
      
      if (!documentA || !documentB) {
        return res.status(400).json({ error: "Both documents are required for intelligence comparison" });
      }
      
      // Import the PURE comparison service - NO GARBAGE DIMENSIONS
      const { performPureIntelligenceComparison } = await import('./services/pureComparison');
      
      // Compare intelligence using PURE 3-phase protocol - DEEPSEEK DEFAULT
      console.log(`PURE INTELLIGENCE COMPARISON WITH EXACT 3-PHASE PROTOCOL USING ${provider.toUpperCase()}`);
      const result = await performPureIntelligenceComparison(documentA.content || documentA, documentB.content || documentB, provider);
      return res.json(result);
    } catch (error: any) {
      console.error("Error in pure intelligence comparison:", error);
      return res.status(500).json({ 
        error: true, 
        message: error.message || "Failed to perform pure intelligence comparison" 
      });
    }
  });
  
  // Share analysis via email
  app.post("/api/share-via-email", async (req: Request, res: Response) => {
    try {
      const { 
        recipientEmail, 
        senderEmail, 
        senderName,
        subject, 
        documentType, 
        analysisA,
        analysisB, 
        comparison,
        rewrittenAnalysis
      } = req.body;
      
      if (!recipientEmail || !subject || !analysisA) {
        return res.status(400).json({ error: "Recipient email, subject, and analysis are required" });
      }
      
      // Import the email service
      const { sendAnalysisEmail } = await import('./services/emailService');
      
      // Send email with the analysis
      console.log(`SENDING EMAIL TO ${recipientEmail}`);
      const result = await sendAnalysisEmail({
        recipientEmail,
        senderEmail,
        senderName,
        subject,
        documentType,
        analysisA,
        analysisB,
        comparison,
        rewrittenAnalysis
      });
      
      return res.json(result);
    } catch (error: any) {
      console.error("Error sending email:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to send email" 
      });
    }
  });
  
  // Get enhancement suggestions
  app.post("/api/get-enhancement-suggestions", async (req: Request, res: Response) => {
    try {
      const { text, provider = "openai" } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }
      
      // Import the enhancement suggestions service
      const { getEnhancementSuggestions } = await import('./api/enhancementSuggestions');
      
      // Get suggestions using the selected provider
      console.log(`GETTING ENHANCEMENT SUGGESTIONS FROM ${provider.toUpperCase()}`);
      const suggestions = await getEnhancementSuggestions(text, provider);
      return res.json(suggestions);
    } catch (error: any) {
      console.error("Error getting enhancement suggestions:", error);
      return res.status(500).json({ 
        error: true, 
        message: error.message || "Failed to get enhancement suggestions" 
      });
    }
  });
  
  // Google search
  app.post("/api/search-google", async (req: Request, res: Response) => {
    try {
      const { query, numResults = 5 } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }
      
      // Import the Google search service
      const { searchGoogle } = await import('./api/googleSearch');
      
      // Search using Google Custom Search API
      console.log(`SEARCHING GOOGLE FOR: ${query}`);
      const results = await searchGoogle(query, numResults);
      return res.json(results);
    } catch (error: any) {
      console.error("Error searching Google:", error);
      return res.status(500).json({ 
        error: true, 
        message: error.message || "Failed to search Google" 
      });
    }
  });
  
  // Fetch content from URL
  app.post("/api/fetch-url-content", async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      
      // Import the URL content fetcher
      const { fetchUrlContent } = await import('./api/googleSearch');
      
      // Fetch content from the URL
      console.log(`FETCHING CONTENT FROM: ${url}`);
      const content = await fetchUrlContent(url);
      
      if (!content) {
        return res.json({ 
          url, 
          success: false, 
          content: "Could not extract content from this URL" 
        });
      }
      
      return res.json({ url, success: true, content });
    } catch (error: any) {
      console.error("Error fetching URL content:", error);
      return res.status(500).json({ 
        url: req.body.url,
        success: false, 
        message: error.message || "Failed to fetch URL content" 
      });
    }
  });
  

  
  // Translate document
  app.post("/api/translate", async (req: Request, res: Response) => {
    try {
      const { text, options, provider = "openai" } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }
      
      if (!options || !options.targetLanguage) {
        return res.status(400).json({ error: "Target language is required" });
      }
      
      // Import the translation service
      const { translateDocument } = await import('./services/translationService');
      
      // Translate the document
      console.log(`TRANSLATING TO ${options.targetLanguage.toUpperCase()} WITH ${provider.toUpperCase()}`);
      const result = await translateDocument(text, options, provider);
      return res.json(result);
    } catch (error: any) {
      console.error("Error translating document:", error);
      return res.status(500).json({ 
        error: true, 
        message: error.message || "Failed to translate document" 
      });
    }
  });
  

  // Send simple email
  app.post("/api/share-simple-email", async (req: Request, res: Response) => {
    try {
      const { recipientEmail, senderEmail, senderName, subject, content } = req.body;
      
      if (!recipientEmail || !subject || !content) {
        return res.status(400).json({ error: "Recipient email, subject, and content are required" });
      }
      
      // Send the email
      console.log(`SENDING SIMPLE EMAIL TO ${recipientEmail}`);
      const result = await sendSimpleEmail({
        recipientEmail,
        senderEmail,
        senderName,
        subject,
        content
      });
      
      return res.json(result);
    } catch (error: any) {
      console.error("Error sending simple email:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to send email" 
      });
    }
  });
  
  // Direct model request
  // Speech-to-text conversion endpoint
  app.post("/api/speech-to-text", speechUpload.single("audio"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }
      
      console.log("PROCESSING SPEECH TO TEXT");
      const text = await processSpeechToText(req);
      
      return res.json({
        success: true,
        text: text
      });
    } catch (error: any) {
      console.error("Error processing speech to text:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to process speech to text" 
      });
    }
  });

  app.post("/api/direct-model-request", async (req: Request, res: Response) => {
    try {
      const { instruction, provider = "openai" } = req.body;
      
      if (!instruction) {
        return res.status(400).json({ error: "Instruction is required" });
      }
      
      // Import the direct model request service
      const { 
        directOpenAIRequest, 
        directClaudeRequest, 
        directPerplexityRequest,
        directDeepSeekRequest,
        directMultiModelRequest
      } = await import('./api/directModelRequest');
      
      let result;
      
      // Make the request to the specified provider
      if (provider === "all") {
        console.log(`DIRECT MULTI-MODEL REQUEST`);
        result = await directMultiModelRequest(instruction);
      } else {
        console.log(`DIRECT ${provider.toUpperCase()} MODEL REQUEST`);
        
        switch (provider.toLowerCase()) {
          case 'anthropic':
            result = await directClaudeRequest(instruction);
            break;
          case 'perplexity':
            result = await directPerplexityRequest(instruction);
            break;
          case 'deepseek':
            result = await directDeepSeekRequest(instruction);
            break;
          case 'openai':
          default:
            result = await directOpenAIRequest(instruction);
            break;
        }
      }
      
      return res.json(result);
    } catch (error: any) {
      console.error("Error making direct model request:", error);
      return res.status(500).json({ 
        error: true, 
        message: error.message || "Failed to make direct model request" 
      });
    }
  });

  app.post("/api/chat-with-memory", async (req: Request, res: Response) => {
    try {
      const { 
        message, 
        conversationHistory = [], 
        currentDocument, 
        analysisResults, 
        provider = "zhi1",
        useExternalKnowledge = false 
      } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      console.log(`Chat with memory - ${provider}, history: ${conversationHistory.length} messages, external knowledge: ${useExternalKnowledge}`);

      // Query Zhi database if enabled
      let externalKnowledge = null;
      let zhiDataType = 'none';
      if (useExternalKnowledge) {
        const { queryZhiKnowledgeBase } = await import('./services/zhiApi');
        const zhiResult = await queryZhiKnowledgeBase(message, 5);
        if (zhiResult) {
          externalKnowledge = zhiResult.content;
          zhiDataType = zhiResult.type; // 'quotes' or 'excerpts'
        }
      }

      // Build system message with context
      let systemMessage = "You are an intelligent AI assistant with expertise in philosophy, cognitive science, and academic writing. Provide thoughtful, accurate, and well-sourced responses.";
      
      if (externalKnowledge) {
        if (zhiDataType === 'quotes') {
          systemMessage += `\n\nEXTERNAL KNOWLEDGE - VERBATIM QUOTES FROM ZHI DATABASE:
The following are ACTUAL VERBATIM QUOTES from John-Michael Kuczynski's published works.
You may present these as direct quotations with proper attribution.
Use them to provide specific, cited evidence when responding to the user's question.

QUOTES:
${externalKnowledge}`;
        } else {
          systemMessage += `\n\nEXTERNAL KNOWLEDGE - SUMMARIES FROM ZHI DATABASE:
The following are AI-GENERATED EXCERPTS/SUMMARIES from John-Michael Kuczynski's works, NOT verbatim quotes.
DO NOT put these in quotation marks or present them as direct quotes.
Instead, use them as context to inform your response, stating "According to Kuczynski's work on [topic]..." or similar phrasing.
If the user asks for quotes, explain that only summaries are currently available from the database.

EXCERPTS:
${externalKnowledge}`;
        }
      }
      
      if (currentDocument) {
        systemMessage += `\n\nCURRENT DOCUMENT CONTEXT:\n${currentDocument}`;
      }
      
      if (analysisResults) {
        systemMessage += `\n\nANALYSIS RESULTS CONTEXT:\n${JSON.stringify(analysisResults, null, 2)}`;
      }

      // Map provider to actual LLM
      const providerMap: Record<string, string> = {
        'zhi1': 'openai',
        'zhi2': 'anthropic',
        'zhi3': 'deepseek',
        'zhi4': 'grok'
      };
      const actualProvider = providerMap[provider] || provider;

      // Build messages array with conversation history
      const messages = conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Add current message
      messages.push({
        role: 'user',
        content: message
      });

      // Make LLM request with conversation history
      let content;
      
      if (actualProvider === 'openai') {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemMessage },
              ...messages
            ],
            temperature: 0.7,
            max_tokens: 4000
          }),
        });

        const openaiData = await openaiResponse.json();
        content = openaiData.choices?.[0]?.message?.content || "No response";
        
      } else if (actualProvider === 'anthropic') {
        const anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        
        const claudeResponse = await client.messages.create({
          model: 'claude-3-7-sonnet-20250219',
          max_tokens: 4000,
          system: systemMessage,
          messages: messages
        });
        
        content = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : "No response";
        
      } else if (actualProvider === 'deepseek') {
        const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemMessage },
              ...messages
            ],
            temperature: 0.7
          }),
        });

        const deepseekData = await deepseekResponse.json();
        content = deepseekData.choices?.[0]?.message?.content || "No response";
        
      } else if (actualProvider === 'grok') {
        const grokResponse = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'grok-3',
            messages: [
              { role: 'system', content: systemMessage },
              ...messages
            ],
            temperature: 0.7
          }),
        });

        const grokData = await grokResponse.json();
        content = grokData.choices?.[0]?.message?.content || "No response";
      }

      return res.json({ content });
      
    } catch (error: any) {
      console.error("Error in chat with memory:", error);
      return res.status(500).json({ 
        error: true, 
        message: error.message || "Failed to process chat message" 
      });
    }
  });
  
  app.post("/api/semantic-analysis", async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "Text content is required" });
      }
      
      console.log(`Starting semantic analysis for text of length: ${text.length}`);
      
      const { analyzeSemanticDensity } = await import('./services/semanticAnalysis');
      const result = await analyzeSemanticDensity(text);
      
      console.log(`Semantic analysis complete: ${result.sentences.length} sentences, ${result.paragraphs.length} paragraphs`);
      
      return res.json(result);
    } catch (error: any) {
      console.error("Error in semantic analysis:", error);
      return res.status(500).json({ 
        error: "Failed to analyze semantic density",
        message: error.message 
      });
    }
  });

  // Conservative Reconstruction endpoint - creates project and triggers processing
  app.post("/api/reconstruction/start", async (req: Request, res: Response) => {
    try {
      const { text, title, targetWordCount, customInstructions } = req.body;
      
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: "Text content is required for reconstruction" });
      }
      
      const userId = (req.user as any)?.id;
      const project = await storage.createReconstructionProject({
        userId,
        title: title || "Untitled Reconstruction",
        originalText: text,
        targetWordCount: targetWordCount || 500,
        status: "processing"
      });
      
      console.log(`[Reconstruction] Created project ${project.id}: "${project.title}" (${text.split(/\s+/).length} words)`);
      
      // Trigger async reconstruction processing
      (async () => {
        try {
          const { crossChunkReconstruct } = await import('./services/crossChunkCoherence');
          
          const result = await crossChunkReconstruct(
            text,
            customInstructions || `Expand to approximately ${targetWordCount} words while preserving the original argument structure.`,
            'anthropic'
          );
          
          // Update project with results
          await storage.updateReconstructionProject(project.id, {
            reconstructedText: result.stitchedDocument,
            status: 'completed'
          });
          
          console.log(`[Reconstruction] Completed project ${project.id}: ${result.stitchedDocument.split(/\s+/).length} words`);
        } catch (error: any) {
          console.error(`[Reconstruction] Failed project ${project.id}:`, error.message);
          await storage.updateReconstructionProject(project.id, {
            status: 'failed'
          });
        }
      })();
      
      res.json(project);
    } catch (error: any) {
      console.error("Error starting reconstruction:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/reconstruction/:id", async (req: Request, res: Response) => {
    try {
      const project = await storage.getReconstructionProject(parseInt(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json(project);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/reconstruction/:id/update", async (req: Request, res: Response) => {
    try {
      const project = await storage.updateReconstructionProject(parseInt(req.params.id), req.body);
      res.json(project);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Job History API endpoints
  app.get("/api/jobs", async (req: Request, res: Response) => {
    try {
      const jobs = await storage.getAllJobs();
      res.json({ jobs });
    } catch (error: any) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/jobs/:documentId", async (req: Request, res: Response) => {
    try {
      const { documentId } = req.params;
      
      // Handle reconstruction jobs
      if (documentId.startsWith('reconstruction-')) {
        const id = parseInt(documentId.replace('reconstruction-', ''));
        const project = await storage.getReconstructionProject(id);
        if (!project) return res.status(404).json({ error: "Job not found" });
        return res.json({ document: project, chunks: [], type: 'reconstruction' });
      }
      
      // Handle coherence jobs
      const jobData = await storage.getJobWithChunks(documentId);
      if (!jobData) return res.status(404).json({ error: "Job not found" });
      res.json({ ...jobData, type: 'coherence' });
    } catch (error: any) {
      console.error("Error fetching job:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/jobs/:documentId/resume", async (req: Request, res: Response) => {
    try {
      const { documentId } = req.params;
      
      // Get existing job data
      const jobData = await storage.getJobWithChunks(documentId);
      if (!jobData) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      const { document, chunks } = jobData;
      const lastChunkIndex = chunks.length > 0 ? Math.max(...chunks.map(c => c.chunkIndex)) : -1;
      const globalState = document.globalState;
      
      // Reconstruct original text from chunks (sort by chunkIndex and join)
      const sortedChunks = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
      const originalText = sortedChunks
        .map(c => c.chunkText || '')
        .filter(t => t.length > 0)
        .join('\n\n');
      
      // Also check for stitched document in globalState
      const stitchedDocument = (globalState as any)?.stitchedDocument || '';
      
      console.log(`[Resume] Resuming job ${documentId} from chunk ${lastChunkIndex + 1}, originalText length: ${originalText.length}`);
      
      // Include saved chunks in globalState for use by rewrite function
      const enhancedGlobalState = {
        ...globalState,
        savedChunks: sortedChunks.map(c => ({
          chunkIndex: c.chunkIndex,
          chunkText: c.chunkText,
        })),
        gco: (globalState as any)?.gco,
        gcs: (globalState as any)?.gcs,
      };
      
      res.json({
        success: true,
        documentId,
        resumeFromChunk: lastChunkIndex + 1,
        existingChunks: chunks.length,
        globalState: enhancedGlobalState, // Now includes savedChunks
        coherenceMode: document.coherenceMode,
        originalText: originalText, // Include reconstructed original text
        stitchedDocument: stitchedDocument, // Include stitched output if available
        message: `Ready to resume from chunk ${lastChunkIndex + 1}.`
      });
    } catch (error: any) {
      console.error("Error resuming job:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/case-assessment", async (req: Request, res: Response) => {
    try {
      const { text, provider = "zhi1", context } = req.body;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "Text content is required for case assessment" });
      }
      
      // Set headers for real-time streaming
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Accel-Buffering', 'no');
      
      console.log(`Starting REAL-TIME case assessment streaming with ${provider} for text of length: ${text.length}`);
      
      const actualProvider = mapZhiToProvider(provider);
      await streamCaseAssessment(text, actualProvider, res, context);
      
    } catch (error: any) {
      console.error("Error in case assessment streaming:", error);
      res.write(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.end();
    }
  });

  // Fiction Assessment API endpoint - RETURNS JSON RESULTS
  app.post('/api/fiction-assessment', async (req, res) => {
    try {
      const { text, provider = 'openai' } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }
      
      console.log(`Starting fiction assessment with ${provider} for text of length: ${text.length}`);
      
      // Call the fiction assessment service directly and return JSON
      const { performFictionAssessment } = await import('./services/fictionAssessment');
      const result = await performFictionAssessment(text, provider);
      
      console.log('Fiction Assessment Result:', result);
      res.json({
        success: true,
        result: result
      });
      
    } catch (error: any) {
      console.error("Error in fiction assessment streaming:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Comprehensive cognitive analysis endpoint (4-phase protocol)
  app.post("/api/analyze", async (req: Request, res: Response) => {
    try {
      console.log("COMPREHENSIVE ANALYSIS DEBUG - req.body:", JSON.stringify(req.body, null, 2));
      console.log("COMPREHENSIVE ANALYSIS DEBUG - text type:", typeof req.body.text);
      console.log("COMPREHENSIVE ANALYSIS DEBUG - text value:", req.body.text?.substring(0, 100));
      
      const { text, provider = "zhi1" } = req.body;
      
      if (!text || typeof text !== 'string') {
        console.log("COMPREHENSIVE ANALYSIS ERROR - text validation failed:", { text: typeof text, hasText: !!text });
        return res.status(400).json({ error: "Document content is required" });
      }
      
      console.log(`Starting comprehensive cognitive analysis with ${provider} for text of length: ${text.length}`);
      
      const { executeComprehensiveProtocol } = await import('./services/fourPhaseProtocol');
      const actualProvider = mapZhiToProvider(provider);
      const result = await executeComprehensiveProtocol(text, actualProvider as 'openai' | 'anthropic' | 'perplexity' | 'deepseek');
      
      console.log(`COMPREHENSIVE ANALYSIS RESULT PREVIEW: "${(result.analysis || '').substring(0, 200)}..."`);
      console.log(`COMPREHENSIVE ANALYSIS RESULT LENGTH: ${(result.analysis || '').length} characters`);
      
      res.json({
        success: true,
        analysis: {
          id: Date.now(),
          content: result.analysis,
          overallScore: result.overallScore,
          provider: result.provider,
          evaluationType: result.evaluationType,
          phases: result.phases,
          formattedReport: result.formattedReport
        }
      });
    } catch (error: any) {
      console.error("Error in comprehensive cognitive analysis:", error);
      res.status(500).json({ 
        error: true, 
        message: error.message || "Comprehensive analysis failed" 
      });
    }
  });

  // MISSING ENDPOINT: Quick Cognitive Analysis  
  app.post("/api/cognitive-quick", async (req: Request, res: Response) => {
    try {
      const { text, provider = "zhi1" } = req.body;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "Text content is required for analysis" });
      }
      
      console.log(`Starting quick cognitive analysis with ${provider} for text of length: ${text.length}`);
      
      const { performQuickAnalysis } = await import('./services/quickAnalysis');
      const actualProvider = mapZhiToProvider(provider);
      const result = await performQuickAnalysis(text, actualProvider as 'openai' | 'anthropic' | 'perplexity' | 'deepseek');
      
      console.log(`ANALYSIS RESULT PREVIEW: "${(result.analysis || '').substring(0, 200)}..."`);
      console.log(`ANALYSIS RESULT LENGTH: ${(result.analysis || '').length} characters`);
      
      res.json({
        success: true,
        analysis: {
          id: Date.now(),
          formattedReport: result.analysis,
          overallScore: result.intelligence_score,
          provider: provider,
          summary: result.analysis,
          analysis: result.analysis,
          cognitiveProfile: result.cognitive_profile,
          keyInsights: result.key_insights
        },
        provider: provider,
        metadata: {
          contentLength: text.length,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error: any) {
      console.error("Error in quick cognitive analysis:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });


  // Fiction Comparison API endpoint  
  app.post('/api/fiction-compare', async (req, res) => {
    try {
      const { documentA, documentB, provider } = req.body;
      
      if (!documentA || !documentB || !provider) {
        return res.status(400).json({ error: "Both documents and provider are required" });
      }
      
      const { performFictionComparison } = await import('./services/fictionComparison');
      const result = await performFictionComparison(documentA, documentB, provider);
      
      console.log(`Fiction comparison complete - Winner: Document ${result.winnerDocument}`);
      
      return res.json(result);
    } catch (error: any) {
      console.error("Error in fiction comparison:", error);
      return res.status(500).json({ 
        error: "Failed to perform fiction comparison",
        message: error.message 
      });
    }
  });

  // ORIGINALITY EVALUATION API endpoint
  app.post("/api/originality-evaluate", async (req: Request, res: Response) => {
    try {
      const { content, provider = 'zhi1', phase = 'comprehensive' } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ 
          error: "Content is required and must be a string" 
        });
      }

      console.log(`${phase.toUpperCase()} ORIGINALITY EVALUATION WITH ${provider.toUpperCase()}`);
      
      if (phase === 'quick') {
        const { performQuickAnalysis } = await import('./services/quickAnalysis');
        const result = await performQuickAnalysis(content, provider, 'originality');
        res.json({ success: true, result });
      } else {
        const { executeFourPhaseProtocol } = await import('./services/fourPhaseProtocol');
        const evaluation = await executeFourPhaseProtocol(
          content, 
          provider as 'openai' | 'anthropic' | 'perplexity' | 'deepseek',
          'originality'
        );
        res.json({
          success: true,
          evaluation: {
            formattedReport: evaluation.formattedReport,
            overallScore: evaluation.overallScore,
            provider: evaluation.provider,
            metadata: {
              contentLength: content.length,
              evaluationType: 'originality',
              timestamp: new Date().toISOString()
            }
          }
        });
      }
    } catch (error: any) {
      console.error("Originality evaluation error:", error);
      res.status(500).json({
        success: false,
        error: "Originality evaluation failed",
        details: error.message
      });
    }
  });

  // COGENCY EVALUATION API endpoint
  app.post("/api/cogency-evaluate", async (req: Request, res: Response) => {
    try {
      const { content, provider = 'zhi1', phase = 'comprehensive' } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ 
          error: "Content is required and must be a string" 
        });
      }

      console.log(`${phase.toUpperCase()} COGENCY EVALUATION WITH ${provider.toUpperCase()}`);
      
      if (phase === 'quick') {
        const { performQuickAnalysis } = await import('./services/quickAnalysis');
        const result = await performQuickAnalysis(content, provider, 'cogency');
        res.json({ success: true, result });
      } else {
        const { executeFourPhaseProtocol } = await import('./services/fourPhaseProtocol');
        const evaluation = await executeFourPhaseProtocol(
          content, 
          provider as 'openai' | 'anthropic' | 'perplexity' | 'deepseek',
          'cogency'
        );
        res.json({
          success: true,
          evaluation: {
            formattedReport: evaluation.formattedReport,
            overallScore: evaluation.overallScore,
            provider: evaluation.provider,
            metadata: {
              contentLength: content.length,
              evaluationType: 'cogency',
              timestamp: new Date().toISOString()
            }
          }
        });
      }
    } catch (error: any) {
      console.error("Cogency evaluation error:", error);
      res.status(500).json({
        success: false,
        error: "Cogency evaluation failed",
        details: error.message
      });
    }
  });

  // OVERALL QUALITY EVALUATION API endpoint
  app.post("/api/overall-quality-evaluate", async (req: Request, res: Response) => {
    try {
      const { content, provider = 'zhi1', phase = 'comprehensive' } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ 
          error: "Content is required and must be a string" 
        });
      }

      console.log(`${phase.toUpperCase()} OVERALL QUALITY EVALUATION WITH ${provider.toUpperCase()}`);
      
      if (phase === 'quick') {
        const { performQuickAnalysis } = await import('./services/quickAnalysis');
        const result = await performQuickAnalysis(content, provider, 'overall_quality');
        res.json({ success: true, result });
      } else {
        const { executeFourPhaseProtocol } = await import('./services/fourPhaseProtocol');
        const evaluation = await executeFourPhaseProtocol(
          content, 
          provider as 'openai' | 'anthropic' | 'perplexity' | 'deepseek',
          'overall_quality'
        );
        res.json({
          success: true,
          evaluation: {
            formattedReport: evaluation.formattedReport,
            overallScore: evaluation.overallScore,
            provider: evaluation.provider,
            metadata: {
              contentLength: content.length,
              evaluationType: 'overall_quality',
              timestamp: new Date().toISOString()
            }
          }
        });
      }
    } catch (error: any) {
      console.error("Overall quality evaluation error:", error);
      res.status(500).json({
        success: false,
        error: "Overall quality evaluation failed",
        details: error.message
      });
    }
  });


  // Real streaming analysis endpoint
  app.post('/api/stream-analysis', async (req: Request, res: Response) => {
    try {
      const { text, provider = 'openai' } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      // Set headers for streaming plain text
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      
      const prompt = `
You are conducting a Phase 1 intelligence assessment with anti-diplomatic evaluation standards.

TEXT TO ANALYZE:
${text}

CORE INTELLIGENCE QUESTIONS:

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
DOES THE AUTHOR USE OTHER AUTHORS TO DEVELOP HIS IDEAS OR TO CLOAK HIS OWN LACK OF IDEAS?

ANSWER THESE QUESTIONS IN CONNECTION WITH THIS TEXT. A SCORE OF N/100 (E.G. 73/100) MEANS THAT (100-N)/100 (E.G. 27/100) OUTPERFORM THE AUTHOR WITH RESPECT TO THE PARAMETER DEFINED BY THE QUESTION. YOU ARE NOT GRADING; YOU ARE ANSWERING THESE QUESTIONS. YOU DO NOT USE A RISK-AVERSE STANDARD; YOU DO NOT ATTEMPT TO BE DIPLOMATIC; YOU DO NOT ATTEMPT TO COMPLY WITH RISK-AVERSE, MEDIUM-RANGE IQ, ACADEMIC NORMS. YOU DO NOT MAKE ASSUMPTIONS ABOUT THE LEVEL OF THE PAPER; IT COULD BE A WORK OF THE HIGHEST EXCELLENCE AND GENIUS, OR IT COULD BE THE WORK OF A MORON.

IF A WORK IS A WORK OF GENIUS, YOU SAY THAT, AND YOU SAY WHY; YOU DO NOT SHY AWAY FROM GIVING WHAT MIGHT CONVENTIONALLY BE REGARDED AS EXCESSIVELY "SUPERLATIVE" SCORES; YOU GIVE IT THE SCORE IT DESERVES, NOT THE SCORE THAT A MIDWIT COMMITTEE WOULD SAY IT DESERVES.

THINK VERY VERY VERY HARD ABOUT YOUR ANSWERS; DO NOT DEFAULT TO COOKBOOK, MIDWIT EVALUATION PROTOCOLS.

DO NOT GIVE CREDIT MERELY FOR USE OF JARGON OR FOR REFERENCING AUTHORITIES. FOCUS ON SUBSTANCE. ONLY GIVE POINTS FOR SCHOLARLY REFERENCES/JARGON IF THEY UNAMBIGUOUSLY INCREASE SUBSTANCE.

METAPOINT 1: THIS IS NOT A GRADING APP. YOU GRADE THE INTELLIGENCE OF WHAT YOU ARE GIVEN. IF YOU ARE GIVEN BRILLIANT FRAGMENT, YOU GIVE IT A HIGH SCORE. YOU ARE NOT GRADING ESSAYS. YOU ARE NOT LOOKING FOR COMPLETENESS.

METAPOINT 2: DO NOT OVERVALUE TURNS OF PHRASE. AN AUTHOR SPEAKING CONFIDENTLY IS NOT NECESSARILY "SHUTTING DOWN MODES OF INQUIRY". IN FACT, IT IS LIKELY TO BE THE OPPOSITE; BY PUTTING A CLEAR STAKE IN THE GROUND, HE IS PROBABLY OPENING THEM. ANOTHER EXAMPLE: CASUAL SPEECH DOES NOT MEAN DISORGANIZED THOUGHTS. DON'T JUDGE A BOOK BY ITS COVER.

METAPOINT 3: THE APP SHOULD ALWAYS START BY SUMMARIZING THE TEXT AND ALSO CATEGORIZING IT.

METAPOINT 4: THE APP SHOULD NOT CHANGE THE GRADING BASED ON THE CATEGORY OF THE TEXT: IF A TEXT IS CATEGORIZED AS 'ADVANCED SCHOLARSHIP', IT SHOULD STILL EVALUATE IT WITH RESPECT TO THE GENERAL POPULATION, NOT WITH RESPECT ONLY TO 'ADVANCED SCHOLARLY WORKS.'

METAPOINT 5: THIS IS NOT A GRADING APP. DO NOT PENALIZE BOLDNESS. DO NOT TAKE POINTS AWAY FOR INSIGHTS THAT, IF CORRECT, STAND ON THEIR OWN. GET RID OF THE IDEA THAT "ARGUMENTATION" IS WHAT MAKES SOMETHING SMART; IT ISN'T. WHAT MAKES SOMETHING SMART IS THAT IT IS SMART (INSIGHTFUL). PERIOD.

PARADIGM OF PHONY PSEUDO-INTELLECTUAL TEXT:
In this dissertation, I critically examine the philosophy of transcendental empiricism. Transcendental empiricism is, among other things, a philosophy of mental content. It attempts to dissolve an epistemological dilemma of mental content by splitting the difference between two diametrically opposed accounts of content.

This shows: 1. DOCTRINES ARE LABELLED, BUT NEVER DEFINED; AND THEIR MEANINGS CANNOT BE INFERRED FROM CONTEXT 2. THIS PASSAGE CONTAINS FREE VARIABLES. FOR EXAMPLE, "among other things" QUALIFICATION IS NEVER CLARIFIED 3. THE AUTHOR NEVER IDENTIFIES THE "EPISTEMOLOGICAL DILEMMA" IN QUESTION.

**ABSOLUTE QUOTATION REQUIREMENTS - NO EXCEPTIONS**:

1. **INTRODUCTION**: Must include AT LEAST THREE direct quotes from the source text
2. **EVERY SINGLE QUESTION**: Must be substantiated with AT LEAST ONE direct quote from the source text
3. **CONCLUSION**: Must include AT LEAST THREE direct quotes from the source text

**THIS APPLIES REGARDLESS OF TEXT LENGTH**: Whether the passage is 3 words or 10 million words, you MUST quote directly from it.

**QUOTATION FORMAT**: Use exact quotation marks: "exact text from source"

**STRUCTURE REQUIREMENTS**:
- INTRODUCTION with 3+ quotes: "quote 1" ... "quote 2" ... "quote 3"
- SUMMARY AND CATEGORY with quotes
- Each question answer with quotes: Q1: [Answer with "direct quote"] 
- CONCLUSION with 3+ quotes: "quote 1" ... "quote 2" ... "quote 3"

**NO ANSWER WITHOUT QUOTES**: If you cannot find a relevant quote for any question, you must still quote something from the text and explain its relevance.

PROVIDE A FINAL VALIDATED SCORE OUT OF 100 IN THE FORMAT: SCORE: X/100
`.trim();

      // Stream from OpenAI with immediate flushing
      console.log(`Calling OpenAI API with model gpt-4o...`);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          stream: true,
          max_tokens: 4000,
          temperature: 0.7,
        }),
      });

      console.log(`OpenAI response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenAI API Error: ${response.status} - ${errorText}`);
        throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error('No response body from OpenAI');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      console.log('Starting to read streaming response...');
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Streaming completed');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                res.write(content);
                // Force flush - remove type check
                (res as any).flush?.();
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
      
      res.end();
      
    } catch (error) {
      console.error('Streaming error:', error);
      res.write(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.end();
    }
  });

  // Re-rewrite endpoint for recursive humanization
  app.post("/api/re-rewrite", async (req: Request, res: Response) => {
    try {
      const { text, styleText, provider = 'zhi2', customInstructions, stylePresets } = req.body;

      if (!text || !styleText) {
        return res.status(400).json({ 
          error: "Text to re-rewrite and style sample are both required" 
        });
      }

      console.log(`Starting re-rewrite with ${provider}...`);
      
      const { performReRewrite } = await import('./services/gptBypassHumanizer');
      
      const result = await performReRewrite(text, styleText, provider, customInstructions, stylePresets);
      
      res.json({
        success: true,
        result: result
      });
      
    } catch (error: any) {
      console.error("Re-rewrite error:", error);
      res.status(500).json({ 
        error: true, 
        message: error.message || "Re-rewrite failed" 
      });
    }
  });


  // Get style presets
  app.get("/api/style-presets", async (_req: Request, res: Response) => {
    try {
      const { STYLE_PRESETS } = await import('./services/gptBypassHumanizer');
      res.json({ presets: STYLE_PRESETS });
    } catch (error: any) {
      console.error("Error getting style presets:", error);
      res.status(500).json({ 
        error: true, 
        message: "Failed to load style presets" 
      });
    }
  });

  // Chunk text endpoint
  app.post("/api/chunk-text", async (req: Request, res: Response) => {
    try {
      const { text, maxWords = 500 } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ 
          error: "Text is required and must be a string" 
        });
      }

      const { chunkText } = await import('./services/gptBypassHumanizer');
      const chunks = chunkText(text, maxWords);
      
      res.json({
        success: true,
        chunks: chunks
      });
      
    } catch (error: any) {
      console.error("Text chunking error:", error);
      res.status(500).json({ 
        error: true, 
        message: error.message || "Text chunking failed" 
      });
    }
  });

  // Evaluate text with GPTZero
  app.post("/api/evaluate-ai", async (req: Request, res: Response) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ 
          error: "Text is required and must be a string" 
        });
      }

      const { evaluateWithGPTZero } = await import('./services/gptBypassHumanizer');
      const score = await evaluateWithGPTZero(text);
      
      res.json({
        success: true,
        humanPercentage: score
      });
      
    } catch (error: any) {
      console.error("AI evaluation error:", error);
      res.status(500).json({ 
        error: true, 
        message: error.message || "AI evaluation failed" 
      });
    }
  });

  // ==============================================================================
  // GPT BYPASS HUMANIZER ROUTES - Complete Implementation
  // ==============================================================================

  // File upload endpoint for GPT Bypass
  app.post("/api/upload", gptBypassUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      await fileProcessorService.validateFile(req.file);
      const processedFile = await fileProcessorService.processFile(req.file.path, req.file.originalname);
      
      // Analyze with GPTZero
      const gptZeroResult = await gptZeroService.analyzeText(processedFile.content);
      
      // Create document record
      const document = await storage.createDocument({
        filename: processedFile.filename,
        content: processedFile.content,
        wordCount: processedFile.wordCount,
        // aiScore: gptZeroResult.aiScore, // This field may not exist in current schema
      });

      // Generate chunks if text is long enough
      const chunks = processedFile.wordCount > 500 
        ? textChunkerService.chunkText(processedFile.content)
        : [];

      // Analyze chunks if they exist
      if (chunks.length > 0) {
        const chunkTexts = chunks.map(chunk => chunk.content);
        const chunkResults = await gptZeroService.analyzeBatch(chunkTexts);
        
        chunks.forEach((chunk, index) => {
          chunk.aiScore = chunkResults[index].aiScore;
        });
      }

      res.json({
        document,
        chunks,
        aiScore: gptZeroResult.aiScore,
        needsChunking: processedFile.wordCount > 500,
      });
    } catch (error: any) {
      console.error('File upload error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Text analysis endpoint (for direct text input)
  app.post("/api/analyze-text", async (req, res) => {
    try {
      const { text } = req.body;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ message: "Text is required" });
      }

      const gptZeroResult = await gptZeroService.analyzeText(text);
      const wordCount = text.trim().split(/\s+/).length;
      
      // Generate chunks if text is long enough
      const chunks = wordCount > 500 ? textChunkerService.chunkText(text) : [];
      
      // Analyze chunks if they exist
      if (chunks.length > 0) {
        const chunkTexts = chunks.map(chunk => chunk.content);
        const chunkResults = await gptZeroService.analyzeBatch(chunkTexts);
        
        chunks.forEach((chunk, index) => {
          chunk.aiScore = chunkResults[index].aiScore;
        });
      }

      res.json({
        aiScore: gptZeroResult.aiScore,
        wordCount,
        chunks,
        needsChunking: wordCount > 500,
      });
    } catch (error: any) {
      console.error('Text analysis error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Quick AI detection endpoint for TextStats component
  app.post("/api/detect-ai", async (req, res) => {
    try {
      const { text } = req.body;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ message: "Text is required" });
      }
      
      if (text.trim().length < 50) {
        return res.status(400).json({ message: "Text must be at least 50 characters for AI detection" });
      }

      const gptZeroResult = await gptZeroService.analyzeText(text);
      
      res.json({
        aiScore: gptZeroResult.aiScore,
        humanScore: 100 - gptZeroResult.aiScore,
        isAI: gptZeroResult.isAI,
        confidence: gptZeroResult.confidence,
      });
    } catch (error: any) {
      console.error('AI detection error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Main rewrite endpoint - GPT Bypass Humanizer
  app.post("/api/rewrite", async (req, res) => {
    try {
      const rewriteRequest: RewriteRequest = req.body;
      
      // Validate request
      if (!rewriteRequest.inputText || !rewriteRequest.provider) {
        return res.status(400).json({ message: "Input text and provider are required" });
      }

      // Analyze input text
      const inputAnalysis = await gptZeroService.analyzeText(rewriteRequest.inputText);
      
      // Create rewrite job
      const rewriteJob = await storage.createRewriteJob({
        inputText: rewriteRequest.inputText,
        styleText: rewriteRequest.styleText,
        contentMixText: rewriteRequest.contentMixText,
        customInstructions: rewriteRequest.customInstructions,
        selectedPresets: rewriteRequest.selectedPresets,
        provider: rewriteRequest.provider,
        chunks: [],
        selectedChunkIds: rewriteRequest.selectedChunkIds,
        mixingMode: rewriteRequest.mixingMode,
        inputAiScore: inputAnalysis.aiScore,
        status: "processing",
      });

      try {
        // Perform rewrite
        const rewrittenText = await aiProviderService.rewrite(rewriteRequest.provider, {
          inputText: rewriteRequest.inputText,
          styleText: rewriteRequest.styleText,
          contentMixText: rewriteRequest.contentMixText,
          customInstructions: rewriteRequest.customInstructions,
          selectedPresets: rewriteRequest.selectedPresets,
          mixingMode: rewriteRequest.mixingMode,
        });

        // Analyze output text
        const outputAnalysis = await gptZeroService.analyzeText(rewrittenText);

        // Clean markup from rewritten text
        const cleanedRewrittenText = cleanMarkup(rewrittenText);

        // Update job with results
        await storage.updateRewriteJob(rewriteJob.id, {
          outputText: cleanedRewrittenText,
          outputAiScore: outputAnalysis.aiScore,
          status: "completed",
        });

        const response: RewriteResponse = {
          rewrittenText: cleanedRewrittenText,
          inputAiScore: inputAnalysis.aiScore,
          outputAiScore: outputAnalysis.aiScore,
          jobId: rewriteJob.id.toString(),
        };

        res.json(response);
      } catch (error) {
        // Update job with error status
        await storage.updateRewriteJob(rewriteJob.id, {
          status: "failed",
        });
        throw error;
      }
    } catch (error: any) {
      console.error('Rewrite error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Re-rewrite endpoint
  app.post("/api/re-rewrite/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const { customInstructions, selectedPresets, provider } = req.body;
      
      const originalJob = await storage.getRewriteJob(parseInt(jobId));
      if (!originalJob || !originalJob.outputText) {
        return res.status(404).json({ message: "Original job not found or incomplete" });
      }

      // Create new rewrite job using the previous output as input
      const rewriteJob = await storage.createRewriteJob({
        inputText: originalJob.outputText,
        styleText: originalJob.styleText,
        contentMixText: originalJob.contentMixText,
        customInstructions: customInstructions || originalJob.customInstructions,
        selectedPresets: selectedPresets || originalJob.selectedPresets,
        provider: provider || originalJob.provider,
        chunks: [],
        selectedChunkIds: [],
        mixingMode: originalJob.mixingMode,
        inputAiScore: originalJob.outputAiScore,
        status: "processing",
      });

      try {
        // Perform re-rewrite
        const rewrittenText = await aiProviderService.rewrite(provider || originalJob.provider, {
          inputText: originalJob.outputText,
          styleText: originalJob.styleText || undefined,
          contentMixText: originalJob.contentMixText || undefined,
          customInstructions: customInstructions || originalJob.customInstructions,
          selectedPresets: selectedPresets || originalJob.selectedPresets,
          mixingMode: originalJob.mixingMode || undefined,
        });

        // Analyze new output
        const outputAnalysis = await gptZeroService.analyzeText(rewrittenText);

        // Clean markup from output
        const cleanedRewrittenText = cleanMarkup(rewrittenText);

        // Update job with results
        await storage.updateRewriteJob(rewriteJob.id, {
          outputText: cleanedRewrittenText,
          outputAiScore: outputAnalysis.aiScore,
          status: "completed",
        });

        const response: RewriteResponse = {
          rewrittenText: cleanedRewrittenText,
          inputAiScore: originalJob.outputAiScore || 0,
          outputAiScore: outputAnalysis.aiScore,
          jobId: rewriteJob.id.toString(),
        };

        res.json(response);
      } catch (error) {
        await storage.updateRewriteJob(rewriteJob.id, { status: "failed" });
        throw error;
      }
    } catch (error: any) {
      console.error('Re-rewrite error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get rewrite job status
  app.get("/api/jobs/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await storage.getRewriteJob(parseInt(jobId));
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      res.json(job);
    } catch (error: any) {
      console.error('Get job error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // List recent jobs
  app.get("/api/jobs", async (req, res) => {
    try {
      const jobs = await storage.listRewriteJobs();
      res.json(jobs);
    } catch (error: any) {
      console.error('List jobs error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Main GPT Bypass Humanizer endpoint expected by frontend
  app.post("/api/gpt-bypass-humanizer", async (req, res) => {
    try {
      const { boxA, boxB, provider = 'zhi2', customInstructions, stylePresets, selectedChunkIds, chunks } = req.body;
      
      // Validate request
      if (!boxA) {
        return res.status(400).json({ 
          success: false, 
          message: "Box A (text to humanize) is required" 
        });
      }
      
      if (!boxB) {
        return res.status(400).json({ 
          success: false, 
          message: "Box B (human style sample) is required" 
        });
      }

      // Analyze input text
      const inputAnalysis = await gptZeroService.analyzeText(boxA);
      
      // Create rewrite job
      const rewriteJob = await storage.createRewriteJob({
        inputText: boxA,
        styleText: boxB,
        contentMixText: "", // Not used in this interface
        customInstructions,
        selectedPresets: stylePresets,
        provider,
        chunks: chunks || [],
        selectedChunkIds: selectedChunkIds || [],
        mixingMode: "style",
        inputAiScore: inputAnalysis.aiScore,
        status: "processing",
      });

      try {
        // Perform humanization
        const humanizedText = await aiProviderService.rewrite(provider, {
          inputText: boxA,
          styleText: boxB,
          customInstructions,
          selectedPresets: stylePresets,
          mixingMode: "style",
        });

        // Analyze output text
        const outputAnalysis = await gptZeroService.analyzeText(humanizedText);

        // Clean markup from output
        const cleanedHumanizedText = cleanMarkup(humanizedText);

        // Update job with results
        await storage.updateRewriteJob(rewriteJob.id, {
          outputText: cleanedHumanizedText,
          outputAiScore: outputAnalysis.aiScore,
          status: "completed",
        });

        res.json({
          success: true,
          result: {
            humanizedText: cleanedHumanizedText,
            originalScore: inputAnalysis.aiScore,
            humanizedScore: outputAnalysis.aiScore,
            jobId: rewriteJob.id,
          },
        });
      } catch (error) {
        // Update job with error status
        await storage.updateRewriteJob(rewriteJob.id, {
          status: "failed",
        });
        throw error;
      }
    } catch (error: any) {
      console.error('GPT Bypass Humanizer error:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  });

  // Writing samples endpoint - CATEGORIZED
  app.get("/api/writing-samples", async (req, res) => {
    try {
      const samples = {
        "CONTENT-NEUTRAL": {
          "Formal and Functional Relationships": `There are two broad types of relationships: formal and functional.
Formal relationships hold between descriptions. A description is any statement that can be true or false.
Example of a formal relationship: The description that a shape is a square cannot be true unless the description that it has four equal sides is true. Therefore, a shape's being a square depends on its having four equal sides.

Functional relationships hold between events or conditions. (An event is anything that happens in time.)
Example of a functional relationship: A plant cannot grow without water. Therefore, a plant's growth depends on its receiving water.

The first type is structural, i.e., it holds between statements about features.
The second is operational, i.e., it holds between things in the world as they act or change.

Descriptions as objects of consideration
The objects of evaluation are descriptions. Something is not evaluated unless it is described, and it is not described unless it can be stated. One can notice non-descriptions — sounds, objects, movements — but in the relevant sense one evaluates descriptions of them.

Relationships not known through direct observation
Some relationships are known, not through direct observation, but through reasoning. Such relationships are structural, as opposed to observational. Examples of structural relationships are:

If A, then A or B.

All tools require some form of use.

Nothing can be both moving and perfectly still.

There are no rules without conditions.

1 obviously expresses a relationship; 2–4 do so less obviously, as their meanings are:

2*. A tool's being functional depends on its being usable.
3*. An object's being both moving and still depends on contradictory conditions, which cannot occur together.
4*. The existence of rules depends on the existence of conditions to which they apply.

Structural truth and structural understanding
Structural understanding is always understanding of relationships. Observational understanding can be either direct or indirect; the same is true of structural understanding.`,

          "Alternative Account of Explanatory Efficiency": `A continuation of the earlier case will make it clear what this means and why it matters. Why doesn't the outcome change under the given conditions? Because, says the standard account, the key factor remained in place. But, the skeptic will counter, perhaps we can discard that account; perhaps there's an alternative that fits the observations equally well. But, I would respond, even granting for argument's sake that such an alternative exists, it doesn't follow that it avoids more gaps than the one it replaces. It doesn't follow that it is comparable from a trade-off standpoint to the original—that it reduces as many issues as the old view while introducing no more new ones. In fact, the opposite often holds. Consider the alternative mentioned earlier. The cost of that account—meaning what new puzzles it creates—is vastly greater than its value—meaning what old puzzles it removes. It would be difficult to devise an account inconsistent with the conventional one that, while still matching the relevant evidence, is equally efficient in explanatory terms. You can test this for yourself. If there is reason to think even one such account exists, it is not because it has ever been produced. That reason, if it exists, must be purely theoretical. And for reasons soon to be made clear, no such purely theoretical reason can justify accepting it.`
        },
        
        "EPISTEMOLOGY": {
          "Rational Belief and Underlying Structure": `When would it become rational to believe that, next time, you're more likely than not to roll this as opposed to that number—that, for example, you're especially likely to roll a 27? This belief becomes rational when, and only when, you have reason to believe that a 27-roll is favored by the structures involved in the game. And that belief, in its turn, is rational if you know that circumstances at all like the following obtain: *The dice are magnetically attracted to the 27-slot. *On any given occasion, you have an unconscious intention to roll a 27 (even though you have no conscious intention of doing this), and you're such a talented dice-thrower that, if you can roll a 27 if it is your (subconscious) intention to do so. *The 27-slot is much bigger than any of the other slots. In fact, it takes up so much space on the roulette wheel that the remaining spaces are too small for the ball to fit into them. You are rational to believe that you'll continue to roll 27s to the extent that your having thus far rolled multiple 27s in a row gives you reason to believe there to be some underlying structure favoring that outcome.`,

          "Hume, Induction, and the Logic of Explanation": `We haven't yet refuted Hume's argument—we've only taken the first step towards doing so. Hume could defend his view against what we've said thus by far by saying the following: Suppose that, to explain why all phi's thus far known are psi's, you posit some underlying structure or law that disposes phi's to be psi's. Unless you think that nature is uniform, you have no right to expect that connection to continue to hold. But if, in order to deal with this, you suppose that nature is uniform, then you're caught in the vicious circle that I described. HR is correct. One is indeed caught in a vicious circle if, in order to show the legitimacy of inductive inference, one assumes UP; and the reason is that, just as Hume says, UP can be known, if at all, only on inductive grounds.`,

          "Explanatory Goodness vs. Correctness": `For an explanation to be good isn't for it to be correct. Sometimes the right explanations are bad ones. A story will make this clear. I'm on a bus. The bus driver is smiling. A mystery! 'What on Earth does he have to smile about?' I ask myself. His job is so boring, and his life must therefore be such a horror.' But then I remember that, just a minute ago, a disembarking passenger gave him fifty $100 bills as a tip. So I have my explanation: 'he just came into a lot of money.' But here is the very different explanation tendered by my seatmate Gus, who, in addition to being unintelligent, is also completely insane. 'The bus-driver is a CIA assassin. This morning he killed somebody who, by coincidence, had the name Benjamin Franklin. Benjamin Franklin (the statesman, not the murder victim) is on the $100 bill. So when the bus driver saw those bills, he immediately thought of that morning's murder. The murder was a particularly enjoyable one; the bus driver is remembering the fun he had, and that's why he's smiling.'`,

          "Knowledge vs. Awareness": `Knowledge is conceptually articulated awareness. In order for me to know that my shoes are uncomfortably tight, I need to have the concepts shoe, tight, discomfort, etc. I do not need to have these concepts—or, arguably, any concepts—to be aware of the uncomfortable tightness in my shoes. My knowledge of that truth is a conceptualization of my awareness of that state of affairs. Equivalently, there are two kinds of awareness: propositional and objectual. My visual perception of the dog in front of me is a case of objectual awareness, as is my awareness of the tightness of my shoes. My knowledge that there is a dog in front of me is a case of proposition-awareness, as is my knowledge that my shoes are uncomfortably tight.`
        },

        "PARADOXES": {
          "The Loser Paradox": `People who are the bottom of a hierarchy are far less likely to spurn that hierarchy than they are to use it against people who are trying to climb the ranks of that hierarchy. The person who never graduates from college may in some contexts claim that a college degree is worthless, but he is unlikely to act accordingly. When he comes across someone without a college degree who is trying to make something of himself, he is likely to pounce on that person, claiming he is an uncredentialed fraud. Explanation: Losers want others to share their coffin, and if that involves hyper-valuing the very people or institutions that put them in that coffin, then so be it.`,

          "The Sour Secretary Paradox": `The more useless a given employee is to the organization that employs her, the more unstintingly she will toe that organization's line. This is a corollary of the loser paradox.`,

          "The Indie Writer's Paradox": `People don't give good reviews to writers who do not already have positive reviews. Analysis: This is a veridical paradox, in the sense that it describes an actual vicious circle and does not represent a logical blunder. An independent writer is by definition one who does not have a marketing apparatus behind him, and such a writer depends on uncoerced positive reviews. But people are extremely reluctant to give good reviews to writers who are not popular already or who do not have the weight of some institution behind them.`,

          "Paradox of Connectedness": `Communications technology is supposed to connect us but separates us into self-contained, non-interacting units. Solution: Communications technology is not supposed to connect us emotionally. On the contrary, it is supposed to connect us in such a way that we can transact without having to bond emotionally. And that is what it does. It connects us logically while disconnecting us emotionally.`,

          "Arrow's Information Paradox": `If you don't know what it is, you don't buy it. Therefore, you don't buy information unless you know what it is. But if you know what it is, you don't need to buy it. But information is bought. Solution: The obvious solution is that information can be described without being disclosed. I can tell you that I have the so and so's phone number without giving you that number, and the circumstances may give you reason to believe me.`,

          "Buridan's Ass": `An ass that has to choose between food and water and is exactly as hungry as it is thirsty cannot make a choice and will therefore be paralyzed by indecision. But such an ass would in fact be able to make a decision. Explanation: This isn't exactly a paradox. There is nothing absurd in the supposition that a creature in such a situation might simply 'halt', and we don't know that actual biological creatures would not in fact halt in such a situation, since it seldom if ever happens that a creature is confronted with options that are exactly equally appealing.`
        }
      };
      
      res.json({ samples });
    } catch (error: any) {
      console.error('Writing samples error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Style presets endpoint - COMPLETE CATEGORIZED SYSTEM
  app.get("/api/style-presets", async (req, res) => {
    try {
      const presets = {
        // MOST IMPORTANT (1-8) - CRITICAL FOR HUMANIZATION
        "CRITICAL_FOR_HUMANIZATION": {
          "1. Mixed cadence + clause sprawl": "Alternate short and long sentences; allow some long sentences to wander with extra clauses.",
          "2. Asymmetric emphasis": "Over-elaborate one point; compress or skate past another.", 
          "3. One aside": "Add a quick parenthetical or em-dash remark — factual, not jokey.",
          "4. Hedge twice": "Use two mild uncertainty markers (\"probably,\" \"seems,\" \"roughly,\" \"I think\").",
          "5. Local disfluency": "Keep one redundant or slightly awkward phrase that still makes sense.",
          "6. Analogy injection": "Insert a short, concrete comparison to something unrelated but illustrative.",
          "7. Topic snap": "Abruptly shift focus once, then return.",
          "8. Friction detail": "Drop in a small, seemingly unnecessary but real-world-plausible detail."
        },

        // STRUCTURE & CADENCE
        "STRUCTURE_AND_CADENCE": {
          "Compression — light (−15%)": "Cut filler; merge short clauses; keep meaning.",
          "Compression — medium (−30%)": "Trim hard; delete throat-clearing; tighten syntax.",
          "Compression — heavy (−45%)": "Sever redundancies; collapse repeats; keep core claims.",
          "DECREASE BY 50%": "REDUCE THE LENGTH BY HALF WHILE PRESERVING MEANING",
          "INCREASE BY 150%": "EXPAND THE TEXT TO 150% LONGER WITH ADDITIONAL DETAIL AND ELABORATION",
          "Mixed cadence": "Alternate 5–35-word sentences; no uniform rhythm.",
          "Clause surgery": "Reorder main/subordinate clauses in 30% of sentences.",
          "Front-load claim": "Put the main conclusion in sentence 1; support follows.",
          "Back-load claim": "Delay the conclusion to the final 2–3 sentences.",
          "Seam/pivot": "Drop smooth connectors once; abrupt turn is fine."
        },

        // FRAMING & INFERENCE  
        "FRAMING_AND_INFERENCE": {
          "Imply one step": "Omit an obvious inferential step; leave it implicit.",
          "Conditional framing": "Recast one key sentence as \"If/Unless …, then …\".",
          "Local contrast": "Use \"but/except/aside\" once to mark a boundary—no new facts.",
          "Scope check": "Replace one absolute with a bounded form (\"in cases like these\")."
        },

        // DICTION & TONE
        "DICTION_AND_TONE": {
          "Deflate jargon": "Swap nominalizations for verbs where safe (e.g., \"utilization\" → \"use\").",
          "Kill stock transitions": "Delete \"Moreover/Furthermore/In conclusion\" everywhere.",
          "Hedge once": "Use exactly one: \"probably/roughly/more or less.\"",
          "Drop intensifiers": "Remove \"very/clearly/obviously/significantly.\"",
          "Low-heat voice": "Prefer plain verbs; avoid showy synonyms.",
          "One aside": "One short parenthetical or em-dash aside; keep it factual."
        },

        // CONCRETENESS & BENCHMARKS
        "CONCRETENESS_AND_BENCHMARKS": {
          "Concrete benchmark": "Replace one vague scale with a testable one (e.g., \"enough to X\").",
          "Swap generic example": "If the source has an example, make it slightly more specific; else skip.",
          "Metric nudge": "Replace \"more/better\" with a minimal, source-safe comparator (\"more than last case\")."
        },

        // ASYMMETRY & FOCUS
        "ASYMMETRY_AND_FOCUS": {
          "Asymmetric emphasis": "Linger on the main claim; compress secondary points sharply.",
          "Cull repeats": "Delete duplicated sentences/ideas; keep the strongest instance.",
          "Topic snap": "Change focus abruptly once; no recap."
        },

        // FORMATTING & OUTPUT HYGIENE
        "FORMATTING_AND_OUTPUT_HYGIENE": {
          "No lists": "Force continuous prose; remove bullets/numbering.",
          "No meta": "No prefaces, apologies, or \"as requested\" scaffolding.",
          "Exact nouns": "Replace vague pronouns where antecedent is ambiguous.",
          "Quote once": "If the source contains a strong phrase, quote it once; else skip."
        },

        // SAFETY / GUARDRAILS
        "SAFETY_GUARDRAILS": {
          "Claim lock": "Do not add examples, scenarios, or data not present in the source.",
          "Entity lock": "Keep names, counts, and attributions exactly as given."
        },

        // COMBO PRESETS (ONE-LINERS)
        "COMBO_PRESETS": {
          "Lean & Sharp": "Compression-medium + mixed cadence + imply one step + kill stock transitions.",
          "Analytic": "Clause surgery + front-load claim + scope check + exact nouns + no lists."
        }
      };
      
      res.json({ presets });
    } catch (error: any) {
      console.error('Style presets error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // SSE Streaming Reconstruction endpoint for long documents (>= 1000 words)
  app.post("/api/reconstruction/stream", async (req: Request, res: Response) => {
    try {
      const { text, customInstructions, audienceParameters, rigorLevel } = req.body;
      
      if (!text) {
        return res.status(400).json({ success: false, message: "Text is required" });
      }
      
      const wordCount = text.trim().split(/\s+/).length;
      if (wordCount < 1000) {
        return res.status(400).json({ 
          success: false, 
          message: `Document too short for streaming (${wordCount} words). Use standard endpoint for documents < 1000 words.`
        });
      }
      
      console.log(`[SSE] Starting streaming reconstruction for ${wordCount} word document`);
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      
      const sendEvent = (event: string, data: any) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      
      try {
        const result = await runFullReconstruction(
          text,
          customInstructions,
          audienceParameters,
          rigorLevel,
          (progress) => {
            sendEvent('progress', progress);
          }
        );
        
        if (result.wasAborted) {
          sendEvent('aborted', {
            sessionId: result.sessionId,
            partialOutput: result.reconstructedText,
            chunksProcessed: result.chunksProcessed
          });
        } else {
          sendEvent('complete', {
            success: true,
            sessionId: result.sessionId,
            output: result.reconstructedText,
            wordCount: result.wordCount,
            chunksProcessed: result.chunksProcessed,
            stitchResult: result.stitchResult
          });
        }
      } catch (error: any) {
        sendEvent('error', { message: error.message });
      }
      
      res.end();
      
    } catch (error: any) {
      console.error('[SSE] Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: error.message });
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
        res.end();
      }
    }
  });
  
  // Abort streaming reconstruction session
  app.post("/api/reconstruction/abort/:sessionId", async (req: Request, res: Response) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      if (isNaN(sessionId)) {
        return res.status(400).json({ success: false, message: "Invalid session ID" });
      }
      
      await abortSession(sessionId);
      const partialOutput = await getPartialOutput(sessionId);
      
      res.json({
        success: true,
        sessionId,
        partialOutput,
        wordCount: partialOutput.trim().split(/\s+/).length
      });
    } catch (error: any) {
      console.error('[Abort] Error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Text Model Validator endpoint
  // NEUROTEXT REQUIREMENT: Allow instructions-only mode
  app.post("/api/text-model-validator", async (req: Request, res: Response) => {
    try {
      const { text, mode, targetDomain, fidelityLevel, mathFramework, constraintType, rigorLevel, customInstructions, truthMapping, mathTruthMapping, literalTruth, llmProvider, instructionsOnly, targetWordCount } = req.body;

      // NEUROTEXT: Allow instructions-only mode - text OR customInstructions is sufficient
      const hasText = text && text.trim().length > 0;
      const hasInstructions = customInstructions && customInstructions.trim().length > 0;
      const hasTargetWordCount = targetWordCount && parseInt(targetWordCount) > 0;
      
      if (!mode) {
        return res.status(400).json({ 
          success: false,
          message: "Mode is required" 
        });
      }
      
      if (!hasText && !hasInstructions) {
        return res.status(400).json({ 
          success: false,
          message: "Text or instructions are required" 
        });
      }
      
      // FREEMIUM CHECK: Enforce 500 word limit for users without credits
      const user = req.user as any;
      const { hasCredits, wordLimit } = await getUserWordLimit(user?.id, user?.username);
      
      if (!hasCredits) {
        console.log(`[FREEMIUM] User has no credits - enforcing ${FREEMIUM_WORD_LIMIT} word limit`);
      }
      
      // Use effective text - if no text but has instructions, use instructions as text for processing
      const effectiveText = hasText ? text : customInstructions;
      
      // NEUROTEXT CORE RULE: AUTO-EXPAND when no instructions provided
      // Count input words to determine expansion behavior
      const inputWordCount = effectiveText.trim().split(/\s+/).length;
      
      // CRITICAL: Use targetWordCount from UI if provided
      const parsedTargetWordCount = hasTargetWordCount ? parseInt(targetWordCount) : 0;
      
      // AUTO-GENERATE INSTRUCTIONS when user provides text but no instructions
      let effectiveInstructions = customInstructions || '';
      
      // If user specified a target word count in the UI, ALWAYS prepend EXPAND TO X WORDS
      // This ensures the universal expansion system knows the target
      if (hasTargetWordCount && parsedTargetWordCount > 0) {
        // Check if instructions already contain an expand directive
        const hasExpandDirective = /expand\s*(to|into)?\s*\d+/i.test(effectiveInstructions);
        if (!hasExpandDirective) {
          // Prepend the target word count directive to existing instructions
          const expandPrefix = `EXPAND TO ${parsedTargetWordCount} WORDS. `;
          effectiveInstructions = expandPrefix + effectiveInstructions;
          console.log(`[TARGET WORD COUNT] UI specified ${parsedTargetWordCount} words → injecting EXPAND directive`);
        }
      }
      
      if (hasText && !hasInstructions && !hasTargetWordCount) {
        // User provided text but no instructions AND no target word count → AUTO-EXPAND
        if (inputWordCount < 1000) {
          // Small input → expand to 5000 words
          effectiveInstructions = "EXPAND TO 5000 WORDS. Write the maximally good, maximally coherent scholarly version of this text. Add real information, real arguments, real evidence. NO PUFFERY. NO HEDGING. NO FILLER. Every word must carry meaning.";
          console.log(`[AUTO-EXPAND] Small input (${inputWordCount} words) → auto-expanding to 5000 words`);
        } else {
          // Large input → improve and expand by 1.5x
          const targetWords = Math.ceil(inputWordCount * 1.5);
          effectiveInstructions = `EXPAND TO ${targetWords} WORDS. Improve this text maximally. Increase length by 1.5x with ACTUAL INFORMATION, real arguments, real evidence, real examples. NO PUFFERY. NO HEDGING. NO FILLER. Every added word must carry substantive meaning.`;
          console.log(`[AUTO-EXPAND] Large input (${inputWordCount} words) → auto-expanding to ${targetWords} words (1.5x)`);
        }
      }

      console.log(`Text Model Validator - Mode: ${mode}, Target Domain: ${targetDomain || 'not specified'}`);

      // Build the prompt based on the mode
      let systemPrompt = "";
      let userPrompt = "";

      if (mode === "reconstruction") {
        // PROTOCOL: User instructions are ALWAYS obeyed. No thresholds. No "simple mode".
        // Check if user has expansion instructions FIRST - this takes priority over position-list detection
        // because expansion instructions enable streaming which is critical for large outputs
        const { hasExpansionInstructions, universalExpand, parseExpansionInstructions } = await import('./services/universalExpansion');
        const { broadcastGenerationChunk } = await import('./services/ccStreamingService');
        
        // Check for streaming mode
        const streamMode = req.query.stream === 'true';
        
        if (effectiveInstructions && hasExpansionInstructions(effectiveInstructions)) {
          const parsedInstructions = parseExpansionInstructions(effectiveInstructions);
          console.log(`[Universal Expansion] User requested expansion to ${parsedInstructions.targetWordCount} words`);
          console.log(`[Universal Expansion] Input: ${inputWordCount} words, following user instructions exactly`);
          console.log(`[Universal Expansion] Stream mode: ${streamMode ? 'ENABLED' : 'disabled'}`);
          
          try {
            const aggressiveness = (fidelityLevel === 'conservative') ? 'conservative' : 'aggressive';
            
            // Create onChunk callback for streaming if enabled
            const onChunk = streamMode ? (chunk: any) => {
              console.log(`[Stream] Broadcasting: ${chunk.type} - ${chunk.message || chunk.sectionTitle || 'progress'}`);
              broadcastGenerationChunk({
                type: chunk.type,
                sectionTitle: chunk.sectionTitle,
                chunkText: chunk.sectionContent,
                sectionIndex: chunk.sectionIndex,
                totalChunks: chunk.totalSections,
                progress: chunk.progress,
                stage: chunk.type,
                wordCount: chunk.wordCount,
                totalWordCount: chunk.totalWordCount
              });
            } : undefined;
            
            const result = await universalExpand({
              text: effectiveText,
              customInstructions: effectiveInstructions,
              aggressiveness,
              onChunk,
              maxWords: wordLimit // Pass freemium word limit (500 for users without credits)
            });
            
            // Log diagnostics to console only - output is clean essay text
            console.log(`[Universal Expansion] Complete: ${result.inputWordCount} → ${result.outputWordCount} words`);
            console.log(`[Universal Expansion] Mode: Universal Expansion, Aggressiveness: ${aggressiveness}`);
            console.log(`[Universal Expansion] Sections: ${result.sectionsGenerated}, Time: ${Math.round(result.processingTimeMs / 1000)}s`);
            
            // DEDUCT CREDITS based on output word count (approximate tokens)
            if (user?.id && hasCredits) {
              const tokensGenerated = result.outputWordCount * 1.3; // ~1.3 tokens per word
              const provider = llmProvider || 'anthropic';
              const creditResult = await checkAndDeductCredits(user.id, user.username, provider, Math.ceil(tokensGenerated));
              if (creditResult.creditsDeducted) {
                console.log(`[CREDITS] Deducted ${creditResult.creditsDeducted} credits for universal expansion (${result.outputWordCount} words)`);
              }
            }
            
            return res.json({
              success: true,
              output: result.expandedText,
              mode: mode,
              inputWordCount: result.inputWordCount,
              outputWordCount: result.outputWordCount,
              reconstructionMethod: 'universal-expansion',
              sectionsGenerated: result.sectionsGenerated,
              processingTimeMs: result.processingTimeMs
            });
          } catch (ueError: any) {
            console.error('[Universal Expansion] Error:', ueError);
            return res.status(500).json({
              success: false,
              message: `Universal expansion failed: ${ueError.message}`
            });
          }
        }
        
        // Check if this is a position list (pipe-delimited format) - checked AFTER expansion instructions
        // so that expansion instructions take priority for streaming support
        const { isPositionList, processPositionList } = await import('./services/positionListReconstruction');
        if (isPositionList(effectiveText)) {
          console.log(`[Position-List] Detected structured position list input`);
          try {
            const result = await processPositionList(effectiveText, effectiveInstructions);
            
            if (!result.success) {
              return res.status(500).json({
                success: false,
                message: result.error || 'Position list processing failed'
              });
            }
            
            // DEDUCT CREDITS based on output word count
            if (user?.id && hasCredits) {
              const outputWords = result.output?.split(/\s+/).length || 0;
              const tokensGenerated = outputWords * 1.3;
              const provider = llmProvider || 'anthropic';
              const creditResult = await checkAndDeductCredits(user.id, user.username, provider, Math.ceil(tokensGenerated));
              if (creditResult.creditsDeducted) {
                console.log(`[CREDITS] Deducted ${creditResult.creditsDeducted} credits for position-list (${outputWords} words)`);
              }
            }
            
            return res.json({
              success: true,
              output: result.output,
              mode: mode,
              reconstructionMethod: 'position-list',
              positionsProcessed: result.positionsProcessed,
              positionsSelected: result.positionsSelected,
              totalPositions: result.totalPositions
            });
          } catch (plError: any) {
            console.error('[Position-List] Error:', plError);
            return res.status(500).json({
              success: false,
              message: `Position list processing failed: ${plError.message}`
            });
          }
        }
        
        // Import the utility functions to determine the best method
        const { shouldUseOutlineFirst, getRecommendedMethod } = await import('./services/outlineFirstReconstruction');
        const recommendedMethod = getRecommendedMethod(inputWordCount);
        console.log(`[Reconstruction] Document: ${inputWordCount} words, recommended method: ${recommendedMethod}`);
        
        // For medium-length documents (1200-25000 words), use Outline-First Reconstruction
        // This extracts a strict outline first, then reconstructs section-by-section
        // for global coherence (solving the "Frankenstein problem")
        // For very long documents (>25000 words), use cross-chunk approach instead
        if (shouldUseOutlineFirst(inputWordCount)) {
          console.log(`[Outline-First] Processing medium document: ${inputWordCount} words`);
          try {
            const { outlineFirstReconstruct } = await import('./services/outlineFirstReconstruction');
            
            const aggressiveness = (fidelityLevel === 'conservative') ? 'conservative' : 'aggressive';
            
            const result = await outlineFirstReconstruct(
              effectiveText,
              effectiveInstructions,
              aggressiveness
            );
            
            // Log diagnostics to console only - output is clean essay text
            console.log(`[Outline-First] Complete: ${result.processingStats.inputWords} → ${result.processingStats.outputWords} words`);
            console.log(`[Outline-First] Mode: Outline-First, Aggressiveness: ${aggressiveness}`);
            console.log(`[Outline-First] Sections: ${result.processingStats.sectionsProcessed}, Time: ${Math.round(result.processingStats.timeMs / 1000)}s`);
            console.log(`[Outline-First] Outline thesis: ${result.outline.thesis}`);
            
            // DEDUCT CREDITS based on output word count
            if (user?.id && hasCredits) {
              const tokensGenerated = result.processingStats.outputWords * 1.3;
              const provider = llmProvider || 'anthropic';
              const creditResult = await checkAndDeductCredits(user.id, user.username, provider, Math.ceil(tokensGenerated));
              if (creditResult.creditsDeducted) {
                console.log(`[CREDITS] Deducted ${creditResult.creditsDeducted} credits for outline-first (${result.processingStats.outputWords} words)`);
              }
            }
            
            return res.json({
              success: true,
              output: result.reconstructedText,
              mode: mode,
              inputWordCount: result.processingStats.inputWords,
              outputWordCount: result.processingStats.outputWords,
              outline: result.outline,
              sectionsProcessed: result.processingStats.sectionsProcessed,
              processingTimeMs: result.processingStats.timeMs
            });
          } catch (ofError: any) {
            console.error('[Outline-First] Error:', ofError);
            return res.status(500).json({
              success: false,
              message: `Outline-first reconstruction failed: ${ofError.message}`
            });
          }
        }
        
        // For very long documents (>25000 words), use cross-chunk reconstruction
        // This processes documents in chunks with global skeleton constraints
        if (inputWordCount > 25000) {
          console.log(`[Cross-Chunk] Processing very long document: ${inputWordCount} words`);
          try {
            const { crossChunkReconstruct } = await import('./services/crossChunkCoherence');
            
            // crossChunkReconstruct(effectiveText, audienceParameters, rigorLevel, customInstructions, contentAnalysis)
            const result = await crossChunkReconstruct(
              effectiveText,
              undefined, // audienceParameters
              fidelityLevel || 'aggressive', // rigorLevel  
              effectiveInstructions,
              undefined // contentAnalysis
            );
            
            // Log diagnostics to console only - output is clean essay text
            console.log(`[Cross-Chunk] Complete: ${result.chunksProcessed || 0} chunks processed`);
            console.log(`[Cross-Chunk] Mode: Cross-Chunk, Document length: ${inputWordCount} words`);
            
            // DEDUCT CREDITS based on output word count
            if (user?.id && hasCredits) {
              const outputWords = result.reconstructedText?.split(/\s+/).length || inputWordCount;
              const tokensGenerated = outputWords * 1.3;
              const provider = llmProvider || 'anthropic';
              const creditResult = await checkAndDeductCredits(user.id, user.username, provider, Math.ceil(tokensGenerated));
              if (creditResult.creditsDeducted) {
                console.log(`[CREDITS] Deducted ${creditResult.creditsDeducted} credits for cross-chunk (${outputWords} words)`);
              }
            }
            
            return res.json({
              success: true,
              output: result.reconstructedText,
              mode: mode,
              inputWordCount: inputWordCount,
              reconstructionMethod: 'cross-chunk',
              chunksProcessed: result.chunksProcessed
            });
          } catch (ccError: any) {
            console.error('[Cross-Chunk] Error:', ccError);
            return res.status(500).json({
              success: false,
              message: `Cross-chunk reconstruction failed: ${ccError.message}`
            });
          }
        }
        
        // NEUROTEXT CRITICAL: If user provides instructions (explicit or auto-generated), FOLLOW THEM EXACTLY
        // Instructions OVERRIDE default reconstruction behavior completely
        if (effectiveInstructions && effectiveInstructions.trim().length > 0) {
          systemPrompt = `You are an intelligent text transformer. You MUST follow the user's instructions EXACTLY.

YOUR ONLY JOB: Do EXACTLY what the user instructs. Their instructions are your PRIMARY directive.

If they say "turn into a one-man play" - produce a one-man play.
If they say "expand to 5000 words" - produce 5000 words.
If they say "write as a poem" - produce a poem.
If they say "make into a legal document" - produce a legal document.

CORE RULES:
- NEVER use puffery or filler text
- NEVER hedge or qualify unnecessarily  
- Every word must carry substantive meaning
- Add REAL information, arguments, and evidence
- Follow the user's format exactly

DO NOT:
- Add outlines or academic structure unless instructed
- Produce academic format unless instructed
- Add diagnosis or key terms unless instructed
- Override the user's format with your own preferences
- Use hedging language like "may", "might", "perhaps", "arguably"
- Add filler or decorative language

CRITICAL: The user's instruction is LAW. Follow it exactly.
CRITICAL: NO markdown formatting (no # headers, no ** bold **, no * italics *). Use plain text only.`;

          userPrompt = `USER INSTRUCTION: ${effectiveInstructions}

INPUT TEXT TO TRANSFORM:
${effectiveText}

${targetDomain ? `Domain context: ${targetDomain}` : ''}

EXECUTE THE USER'S INSTRUCTION EXACTLY. Produce output in the format they requested.`;

          // Skip the default reconstruction prompts
        } else if (fidelityLevel === 'conservative') {
          systemPrompt = `You are a RECONSTRUCTOR. You diagnose what's wrong with an argument, create a structured outline, and then fix THAT SPECIFIC THING.

FIRST: DIAGNOSE the problem. The text has ONE of these issues:

A. VAGUE CLAIM → Make it clear and specific
B. WEAK ARGUMENT → Make it strong (add the missing logical step or evidence)
C. FALSE CLAIM → Find the closest TRUE claim and defend that instead
D. GOOD BUT OBSCURE/IMPLICIT → Make the reasoning clear and explicit
E. NEEDS EMPIRICAL SUPPORT → Provide the empirical argument (data, examples, studies)
F. ELLIPTICAL (skips steps) → Fill in the missing steps

SECOND: Create a structured OUTLINE showing:
- Core thesis being defended
- Key points and their logical flow
- Key terms that need precision
- Global constraints on interpretation

THIRD: Fix the diagnosed problem. Do ONLY that. Don't redecorate.

WHAT "FIX" MEANS:
- If vague: state exactly what is meant
- If weak: add the missing premise or evidence that makes it strong
- If false: identify the closest true version and argue for that
- If implicit: spell out what was left unsaid
- If needs empirical support: provide specific data/examples
- If elliptical: insert the skipped logical steps

DO NOT:
- Add fancy vocabulary
- Expand for the sake of length
- Add hedging or qualifications
- Rewrite what already works
- Sound "more academic"

The output should read like what the author WOULD have written if they were clearer thinkers—same voice, same intent, but with the reasoning fixed.

CRITICAL: NO markdown formatting (no # headers, no ** bold **, no * italics *). Use plain text only.`;

          userPrompt = `RECONSTRUCT THIS TEXT

${effectiveText}

${targetDomain ? `Domain context: ${targetDomain}` : ''}
${customInstructions ? `\nUser instructions: ${customInstructions}` : ''}

STEP 1 - DIAGNOSE (state this briefly):
What type of problem does this text have?
- Vague claim?
- Weak argument?
- False claim (needs true substitute)?
- Good but obscure/implicit?
- Needs empirical support?
- Elliptical (skips steps)?

STEP 2 - OUTLINE (required for transparency):
Create a structured outline showing:
- THESIS: The core claim being defended
- KEY POINTS: Main arguments and their logical flow
- KEY TERMS: Important concepts that need precision
- CONSTRAINTS: Global interpretive constraints

STEP 3 - DOCUMENT REWRITE:
Fix the diagnosed problem. Output the improved version.

FORMAT:
DIAGNOSIS: [1-2 sentences identifying the problem type]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTLINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THESIS: [Core claim]
KEY POINTS:
1. [First key point]
2. [Second key point]
...
KEY TERMS: [term1, term2, ...]
CONSTRAINTS: [Any global interpretive constraints]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOCUMENT REWRITE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[The fixed text - same voice as original, but with reasoning repaired]`;

        } else {
          // AGGRESSIVE MODE - maximum intervention
          systemPrompt = `You are an AGGRESSIVE RECONSTRUCTOR. You diagnose ALL problems, create a structured outline, and fix everything.

FOR EACH CLAIM OR ARGUMENT IN THE TEXT:

1. VAGUE? → Make it specific and clear
2. WEAK? → Strengthen with missing logic or evidence  
3. FALSE? → Replace with the closest true claim
4. IMPLICIT? → Make explicit
5. NEEDS DATA? → Add empirical support (real examples, real numbers)
6. ELLIPTICAL? → Fill in skipped steps

You may need to apply multiple fixes to different parts.

BEFORE REWRITING: Create a structured OUTLINE showing:
- Core thesis being defended
- All key points and their logical flow
- Key terms that need precision
- Global constraints on interpretation

PROVIDE REAL EVIDENCE:
- Name specific studies, people, companies, events
- Use actual numbers and dates
- If you don't know the real data, say "needs citation" rather than making it up

OUTPUT: First the outline, then the fully reconstructed text. Same voice as original but with all reasoning problems fixed.

Do NOT add academic bloat or decorative language.

CRITICAL: NO markdown formatting (no # headers, no ** bold **, no * italics *). Use plain text only.`;
        
          userPrompt = `AGGRESSIVELY RECONSTRUCT THIS TEXT

${effectiveText}

${targetDomain ? `Domain: ${targetDomain}` : ''}
${customInstructions ? `\nUser instructions: ${customInstructions}` : ''}

Fix every problem you find:
- Vague claims → specific claims
- Weak arguments → strong arguments
- False claims → closest true claims
- Implicit reasoning → explicit reasoning
- Missing evidence → real empirical support
- Elliptical steps → filled-in steps

FORMAT (required for transparency):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTLINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THESIS: [Core claim being defended]
KEY POINTS:
1. [First key point]
2. [Second key point]
...
KEY TERMS: [term1, term2, ...]
CONSTRAINTS: [Any global interpretive constraints]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOCUMENT REWRITE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[The fully reconstructed text - same voice as original, but with all reasoning problems fixed]`;
        }

      } else if (mode === "isomorphism") {
        systemPrompt = `You are an expert at finding isomorphic structures across domains. You can preserve exact relational structure while systematically swapping domain vocabulary, revealing the non-uniqueness of interpretation.

CRITICAL OUTPUT RULES:
- NO markdown headers (# or ##)
- NO markdown formatting
- Use plain text with clear section labels
- Natural paragraph formatting only`;
        
        userPrompt = `ISOMORPHISM MODE

Text to map:
${effectiveText}

${targetDomain ? `Target domain: ${targetDomain}` : ''}
${constraintType ? `Constraint type: ${constraintType}` : ''}
${customInstructions ? `\nCustom Instructions: ${customInstructions}` : ''}

Task: Preserve the exact relational structure of this text while systematically swapping domain vocabulary. Show that the same pattern exists in ${targetDomain || 'another domain'}.

Provide:
1. Relation Graph: Map the key dependencies, contradictions, and mutual supports in the original
2. Isomorphic Version: The same structure expressed in the target domain
3. Mapping Table: Explicit mappings showing [original term] → [target domain equivalent]
${constraintType === 'true-statements' ? '4. Truth Verification: Verify that the mapped statements are actually true in the target domain' : ''}

CRITICAL: NO markdown formatting (no # headers, no ** bold **, no * italics *). Use plain text labels like "1. Relation Graph" not "## 1. Relation Graph". Output clean, natural prose.`;

      } else if (mode === "mathmodel") {
        systemPrompt = `You are an expert logician and model theorist. Your task is to build ACTUAL first-order models - not vague "formalizations" or prose summaries.

A MODEL consists of:
1. A DOMAIN D (a non-empty set of objects)
2. An INTERPRETATION function that assigns:
   - Each constant symbol to an element of D
   - Each n-ary predicate symbol to a set of n-tuples from D
   - Each n-ary function symbol to a function from D^n to D

Your job is to EXTRACT the implicit ontology and logical structure from natural language text, formalize it as axioms, and then BUILD an explicit model that satisfies those axioms.

CRITICAL CONSTRAINTS:
- NO hand-wavy "formalizations" - every symbol must have an explicit interpretation
- NO trivial one-element domains unless the text genuinely requires it
- Domain elements should be drawn from the TEXT, not invented
- Every predicate must have its extension (the set of tuples that satisfy it) listed explicitly
- You must VERIFY each axiom against the model

OUTPUT FORMAT: Use plain text with numbered sections. NO markdown formatting (no # headers, no ** bold **, no * italics *).`;
        
        userPrompt = `FIRST-ORDER MODEL CONSTRUCTION

================================
TEXT TO FORMALIZE
================================
${effectiveText}

${mathFramework ? `Mathematical framework preference: ${mathFramework}` : ''}
${rigorLevel ? `Rigor level: ${rigorLevel}` : ''}
${customInstructions ? `\nCustom Instructions: ${customInstructions}` : ''}

================================
YOUR TASK
================================
Build a genuine first-order model of this text. Follow these sections EXACTLY:

1. SIGNATURE

Define the formal language:
- DOMAIN: Describe what objects populate D (1-2 sentences)
- CONSTANTS: List each constant with its English meaning
  Format: c1 = "meaning", c2 = "meaning", ...
- PREDICATES: List each predicate with arity and meaning
  Format: P(x) = "x has property P", R(x,y) = "x stands in relation R to y"
- FUNCTIONS (if needed): List each function with meaning
  Format: f(x) = "the result of applying f to x"

2. TRANSLATION SCHEMA

Map the key English claims from the text to first-order formulas.
Give 5-15 translations:
- English: "exact quote or paraphrase from text"
  Formula: Corresponding first-order formula using your signature

3. AXIOMS

Extract 5-15 core axioms that capture the essential claims. State them as PURE FORMULAS only (no English):

(AX1) ∀x (P(x) → Q(x))
(AX2) ∃x (R(x,c1) ∧ S(x))
(AX3) ...

Use standard logical notation: ∀ (for all), ∃ (exists), → (implies), ∧ (and), ∨ (or), ¬ (not), ↔ (iff)

4. EXPLICIT MODEL

Construct ONE concrete model M that satisfies all axioms (if possible):

- DOMAIN D: List elements explicitly
  D = {a, b, c, d, ...}  (use lowercase letters or descriptive names from the text)

- CONSTANT INTERPRETATION:
  c1 := element_from_D
  c2 := element_from_D
  ...

- PREDICATE INTERPRETATION (give the EXTENSION of each predicate):
  P := { x ∈ D : x satisfies P } = { a, c }
  R := { (x,y) ∈ D² : x R y } = { (a,b), (c,d) }
  ...

- FUNCTION INTERPRETATION (if any):
  f := { (x, f(x)) : x ∈ D } = { (a,b), (b,c) }

5. SATISFACTION CHECK

For EACH axiom, verify whether it is TRUE or FALSE in M:

(AX1): TRUE in M because [brief mechanical verification]
(AX2): TRUE in M because [brief verification]
(AX3): FALSE in M because [explain counterexample]
...

VERDICT:
If all axioms satisfied: "MODEL FOUND: M satisfies all axioms. The text is internally consistent."
If any axiom fails: "NO SATISFYING MODEL FOUND with this domain. Axioms AX3, AX7 fail. The text may be internally inconsistent, or a larger domain is needed."

6. LOGICAL PROPERTIES (Optional but valuable)

Comment on:
- Is the axiom set consistent? (Does a model exist?)
- Are there logical dependencies? (Does one axiom entail another?)
- What is the minimal domain size that could satisfy the axioms?
- Are there multiple non-isomorphic models?

CRITICAL REMINDERS:
- Be EXPLICIT: List every element of every extension
- Be MECHANICAL: The satisfaction check should be a direct calculation
- Use elements FROM THE TEXT: Don't invent abstract entities
- Prefer SUBSTANTIVE axioms that capture real content, not trivialities`;

      } else if (mode === "autodecide") {
        systemPrompt = `You are an expert at analyzing texts and choosing the optimal validation approach. You can assess structural integrity, terminological clarity, domain specificity, and conceptual coherence to determine whether a text needs reconstruction, isomorphic demonstration, mathematical formalization, or a combination.

CRITICAL OUTPUT RULES:
- NO markdown headers (# or ##)
- NO markdown formatting
- Use plain text with clear section labels
- Natural paragraph formatting only`;
        
        userPrompt = `AUTO-DECIDE MODE

Text to analyze:
${effectiveText}

${customInstructions ? `Custom Instructions: ${customInstructions}\n` : ''}
Task: Analyze this text and determine the optimal validation approach. Consider:
- Structural integrity: Is the logic sound or broken?
- Terminological clarity: Are terms well-defined or placeholder-ish?
- Domain specificity: Is this tied to one field or abstract?
- Conceptual coherence: Do ideas fit together or conflict?

Then apply the optimal approach(es):
- Structure coherent but terminology broken → Isomorphism or Math Model
- Logic muddled but insights present → Reconstruction first, then optionally formalize
- Text already valid but obscure → Multiple isomorphisms to show flexibility
- Blend case (most common) → Multi-stage: Reconstruct → Formalize → Show isomorphic examples

Provide:
1. Analysis: Why this approach was chosen
2. Execution: Complete validation using the chosen method(s)
3. Connections: If multiple operations, show how they relate

CRITICAL: NO markdown formatting (no # headers, no ** bold **, no * italics *). Use plain text labels like "1. Analysis" not "## 1. Analysis". Output clean, natural prose.`;

      } else if (mode === "truth-isomorphism") {
        systemPrompt = `You are an expert at finding isomorphic structures across domains with explicit control over truth-value mappings. You can preserve exact relational structure while systematically swapping domain vocabulary AND controlling whether statements remain true, become false, or transform from false to true.

${literalTruth ? `LITERAL TRUTH MODE ENABLED:
You MUST ensure all generated statements are LITERALLY true, not approximately or qualifiedly true. Apply these quantifier weakening rules:

MANDATORY TRANSFORMATIONS:
- "all X do Y" → "all suitably configured X do Y" OR "X can do Y when conditions are met"
- "every X is Y" → "every X that meets criteria Z is Y" OR "X is typically Y"
- "constantly" → "when active" OR "during operation" 
- "always" → "under normal conditions" OR "typically"
- "never" → "cannot systematically" OR "does not under standard conditions"
- "cannot" → "cannot without external intervention" OR "cannot under current constraints"
- "impossible" → "impossible without violating known constraints"

VERIFICATION REQUIREMENTS:
- Every claim must be empirically verifiable
- Add conditional qualifiers wherever truth depends on context
- Avoid universal quantifiers without explicit scope limits
- Include necessary preconditions for each statement

EXAMPLE:
❌ FALSE: "All electronic devices constantly transmit signals"
✅ LITERALLY TRUE: "Electronic devices can transmit signals when powered on and connected to a network"

❌ FALSE: "Every device can receive data from any other device"
✅ LITERALLY TRUE: "Devices can exchange data when routing infrastructure and permissions allow"` : ''}

CRITICAL OUTPUT RULES:
- NO markdown headers (# or ##)
- NO markdown formatting
- Use plain text with clear section labels
- Natural paragraph formatting only`;
        
        const truthMappingDescriptions = {
          'false-to-true': 'Map FALSE statements to TRUE statements in the target domain (find true counterparts to false claims)',
          'true-to-true': 'Map TRUE statements to TRUE statements (preserve truth while swapping domains)',
          'true-to-false': 'Map TRUE statements to FALSE statements (find false counterparts to true claims)'
        };

        userPrompt = `TRUTH-VALUE ISOMORPHISM MODE

Text to map:
${effectiveText}

${targetDomain ? `Target domain: ${targetDomain}` : ''}
Truth-Value Mapping: ${truthMapping ? truthMappingDescriptions[truthMapping as keyof typeof truthMappingDescriptions] : 'Not specified'}
${customInstructions ? `\nCustom Instructions: ${customInstructions}` : ''}

Task: Preserve the exact relational structure of this text while systematically swapping domain vocabulary AND controlling truth values according to the mapping: ${truthMapping}.

${truthMapping === 'false-to-true' ? `For each FALSE statement in the original, find a TRUE statement in the target domain that has the same relational structure. If the original says "No trader can systematically beat the market" (false), find a TRUE statement in ${targetDomain || 'the target domain'} with the same form like "No perpetual motion machine can violate thermodynamics" (true).` : ''}

${truthMapping === 'true-to-true' ? `For each TRUE statement in the original, find another TRUE statement in the target domain that preserves the same relational structure. Maintain both structural isomorphism AND truth value.` : ''}

${truthMapping === 'true-to-false' ? `For each TRUE statement in the original, find a FALSE statement in the target domain that has the same relational structure. This reveals how the same logical form can lead to different truth values across domains.` : ''}

Provide:
1. Truth-Value Analysis: Identify which claims in the original are true vs false, and explain their truth status
2. Relation Graph: Map the key dependencies, contradictions, and mutual supports in the original
3. Isomorphic Version: The same structure expressed in the target domain with the specified truth-value mapping
4. Mapping Table: Explicit mappings showing [original term] → [target domain equivalent] PLUS [original truth value] → [target truth value]
5. Truth Verification: Verify the truth status of both original and mapped statements

CRITICAL: NO markdown formatting (no # headers, no ** bold **, no * italics *). Use plain text labels like "1. Truth-Value Analysis" not "## 1. Truth-Value Analysis". Output clean, natural prose.`;

      } else if (mode === "math-truth-select") {
        systemPrompt = `You are an expert logician specializing in MODEL THEORY and REAL-WORLD TRUTH VERIFICATION.

Your task is FUNDAMENTALLY DIFFERENT from abstract formalization:
- You must find a first-order model where EVERY axiom is 100% TRUE IN REALITY
- "True" means empirically verifiable, logically necessary, or established fact - NOT "satisfies the axiom in some abstract structure"
- If the original domain yields false axioms, you MUST find an isomorphic structure in a DIFFERENT DOMAIN where the same logical form yields ALL TRUE statements

KEY DISTINCTION:
- Abstract model: ∀x(P(x) → Q(x)) is "satisfied" if the extension of P is subset of Q in some made-up domain
- TRUE model: ∀x(P(x) → Q(x)) is TRUE if, when P and Q are grounded in REAL entities, every real P-thing really is a Q-thing

You are searching for TRUTH, not mere satisfiability.

CRITICAL OUTPUT RULES:
- NO markdown formatting whatsoever (no # headers, no ** bold **, no * italics *, no --- dividers)
- Use plain text with numbered sections and CAPS for headers
- Every claim must be verifiable`;
        
        userPrompt = `TRUTH-GROUNDED MODEL CONSTRUCTION

================================
TEXT TO FORMALIZE
================================
${effectiveText}

${mathFramework ? `Mathematical framework preference: ${mathFramework}` : ''}
${rigorLevel ? `Rigor level: ${rigorLevel}` : ''}
${customInstructions ? `\nCustom Instructions: ${customInstructions}` : ''}

================================
YOUR MISSION
================================
Find a first-order model M where EVERY axiom is 100% TRUE IN THE REAL WORLD.

This is NOT about abstract satisfiability. You must ground each constant and predicate in REAL entities such that every axiom states a FACT.

Follow these sections EXACTLY:

1. SIGNATURE

Define the formal language:
- CONSTANTS: c1, c2, ... with placeholder meanings from text
- PREDICATES: P(x), R(x,y), ... with placeholder meanings from text
- DOMAIN DESCRIPTION: What kind of objects are we talking about?

2. AXIOM EXTRACTION

Extract 5-15 first-order axioms that capture the core claims:
(AX1) ∀x (P(x) → Q(x))
(AX2) ∃x R(x, c1)
...

3. TRUTH AUDIT OF ORIGINAL DOMAIN

For each axiom, determine: Is this TRUE or FALSE when interpreted literally in the text's original domain?

(AX1): [TRUE/FALSE] - Evidence: [why]
(AX2): [TRUE/FALSE] - Evidence: [why]
...

ORIGINAL DOMAIN VERDICT: [X of Y axioms are true / Y axioms are false]

4. TRUTH-GROUNDED MODEL

Now find a REAL-WORLD INTERPRETATION where ALL axioms become TRUE:

Option A - If original domain works:
- Ground each constant in a SPECIFIC real entity
- Ground each predicate in a VERIFIABLE property/relation
- Verify each axiom is TRUE with this grounding

Option B - If original domain fails (some axioms false):
- IDENTIFY which axioms fail and why
- SEARCH for an isomorphic domain where the same logical structure yields truth
- The new domain may be from physics, biology, mathematics, history, computing, etc.
- The key: preserve the LOGICAL FORM but change the SUBJECT MATTER

TRUTH-GROUNDED INTERPRETATION:
- DOMAIN D: [Real-world category of objects]
- CONSTANT GROUNDING:
  c1 := [Specific real entity, e.g., "Warren Buffett", "the electron", "World War II"]
  c2 := [Specific real entity]
  ...
- PREDICATE GROUNDING:
  P(x) := "[Verifiable property, e.g., 'x is a mammal', 'x has mass > 0']"
  R(x,y) := "[Verifiable relation, e.g., 'x is ancestor of y', 'x causes y']"
  ...

5. TRUTH VERIFICATION

For EACH axiom, prove it is TRUE under your grounding:

(AX1): TRUE because [specific evidence/reasoning with the grounded interpretation]
(AX2): TRUE because [specific evidence/reasoning]
...

CRITICAL: Every axiom must be verifiable. If you cannot verify an axiom as true, you have not found the right grounding.

6. FINAL VERDICT

STATE CLEARLY:
- Did you use the original domain or switch domains?
- If switched: What domain did you switch to and why?
- ALL AXIOMS TRUE? [YES/NO]
- If NO: Which axiom(s) could not be made true and why?

7. ISOMORPHISM DEMONSTRATION (if domain was switched)

Show the structural mapping:
[Original term] → [New domain term]
[Original relation] → [New domain relation]

Explain: Why does this mapping preserve the logical structure while changing truth values from FALSE to TRUE?

================================
EXAMPLES OF DOMAIN SWITCHING
================================

Example 1: Finance → Physics
- Original (FALSE): "No trader can systematically beat the market over 30 years"
- Grounding attempt: Traders={all hedge fund managers}, Market={S&P 500 total return}
- Axiom: ∀x∈Traders ∀t∈[30 years]: Returns(x,t) ≤ Market(t)
- FAILS: Warren Buffett, Renaissance Technologies disprove this

DOMAIN SWITCH to Physics:
- New grounding: Objects={heat engines}, Performance={efficiency}
- Axiom becomes: ∀x∈HeatEngines: Efficiency(x) ≤ CarnotLimit
- TRUE: Second law of thermodynamics guarantees this

Example 2: Psychology → Biology
- Original (VAGUE): "All learning requires reinforcement"
- FAILS in psychology: Some learning is latent/observational

DOMAIN SWITCH to Molecular Biology:
- New grounding: Learning={synaptic strengthening}, Reinforcement={repeated activation}
- Axiom: ∀x∈Synapses: Strengthened(x) → RepeatedlyActivated(x)
- TRUE: Long-term potentiation requires repeated stimulation

================================
REMEMBER
================================
Your goal is not to "satisfy axioms in some model" but to FIND A MODEL WHERE EVERY AXIOM IS A TRUE STATEMENT ABOUT REALITY. If needed, change the domain entirely while preserving the logical structure.`;

      } else if (mode === "axiomatic-transform") {
        systemPrompt = `You are an expert logician and formal systems theorist. Your task is to transform natural language theoretical text into a complete axiomatization with three components:

1. AXIOMATIZATION - Extract primitive terms, axioms, and defined terms
2. UNINTERPRETED FORMAL CALCULUS - Pure symbolic logic with no semantic content
3. SEMANTIC MODEL - An interpretation that makes all axioms true

You MUST produce all three components for ANY input. You never refuse.

HANDLING DIFFICULT INPUTS (in order of priority):
1. Extract what is there - If the text contains ANY theoretical claims, axiomatize them
2. Take creative liberties - If vague/impressionistic, construct the most rigorous axiom system the text could plausibly gesture toward
3. Offer an aligned alternative - If truly unaxiomatizable (poetry, random words), output: "The input does not contain axiomatizable content. However, here is an axiomatization of a theory that aligns with the input in content or spirit:" and produce a complete axiomatization of a genuine theory thematically related to the input

NEVER refuse. ALWAYS produce complete three-component output.

Use standard logical notation: ∀, ∃, →, ∧, ∨, ¬, ◇, □, =
Use subscripts for constants: m₁, m₂, F₁, F₂
Use superscript 𝔐 for model-relative interpretations

CRITICAL FORMATTING RULE: Do NOT use any markdown formatting. No ### headers, no ** bold **, no * italics *, no --- dividers. Use PLAIN TEXT only with CAPS for headers and clear spacing.`;

        userPrompt = `AXIOMATIC SYSTEM TRANSFORMATION

INPUT TEXT:
${effectiveText}

${targetDomain ? `Domain context: ${targetDomain}` : ''}
${customInstructions ? `Custom Instructions: ${customInstructions}` : ''}

Produce a COMPLETE axiomatization with the following three components:

COMPONENT 1: AXIOMATIZATION

PRIMITIVE TERMS
Identify undefined foundational concepts that cannot be reduced to other terms within the system. List each with a brief parenthetical gloss indicating its intuitive role.

AXIOMS
Extract the core claims and render as numbered axioms (A1, A2, A3...). Each axiom should be:
- A single declarative assertion using primitive terms
- Logically independent from other axioms
- Jointly sufficient to generate the theory's main claims

DEFINED TERMS
Concepts built from primitives. Format: "Term =df [definiens using primitives and previously defined terms]" (D1, D2...)


COMPONENT 2: UNINTERPRETED FORMAL CALCULUS

Transform the axiomatization into a purely syntactic system with NO assigned meaning:

SIGNATURE (Σ)
- Sort symbols (distinct ontological categories)
- Constants (named individuals)
- Predicate symbols with arities
- Function symbols if needed

FORMATION RULES
State the logic being used (typically first-order logic with equality, note if modal operators required)

AXIOM SCHEMATA
Rewrite each axiom using ONLY:
- Logical symbols (∀, ∃, →, ∧, ∨, ¬, =, ◇, □)
- Variables (x, y, z, b, etc.)
- Signature symbols
NO natural language. Pure symbolic notation. Preserve numbering (A1, A2, A3...)


COMPONENT 3: MODEL 𝔐

Provide a semantic interpretation making all axiom schemata true:

DOMAINS
For each sort symbol, specify the set of entities. Format: |sort|^𝔐 = [description]

INTERPRETATION OF CONSTANTS
For each constant symbol, specify its referent. Format: constant^𝔐 = [referent]

INTERPRETATION OF PREDICATES
Create a table with columns: Symbol | Interpretation
Map each predicate to its intended meaning.

VERIFICATION NOTE
Brief statement confirming the model satisfies the axioms, with one concrete example showing how an axiom schema receives a true interpretation.

Remember: NO markdown formatting. Use plain text with CAPS headers only.`;

      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid mode. Must be: reconstruction"
        });
      }

      // Call the AI model (support multiple providers, default to OpenAI/ZHI 1)
      const provider = llmProvider || 'zhi1'; // Default to OpenAI (ZHI 1)
      let output = '';
      
      console.log(`[Text Model Validator] Using provider: ${provider}`);

      if (provider === 'zhi1') {
        // OpenAI GPT-4
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 4096,
          temperature: 0.7,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        });
        output = completion.choices[0]?.message?.content || '';
      } else if (provider === 'zhi2') {
        // Anthropic Claude
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const message = await anthropic.messages.create({
          model: "claude-3-7-sonnet-20250219",
          max_tokens: 4096,
          temperature: 0.7,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }]
        });
        output = message.content[0].type === 'text' ? message.content[0].text : '';
      } else if (provider === 'zhi3') {
        // DeepSeek
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 4096,
            temperature: 0.7,
          }),
        });
        const data = await response.json();
        output = data.choices?.[0]?.message?.content || '';
      } else if (provider === 'zhi4') {
        // Perplexity
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar-pro',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 4096,
            temperature: 0.7,
          }),
        });
        const data = await response.json();
        output = data.choices?.[0]?.message?.content || '';
      } else {
        // Default: Grok (ZHI 5)
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'grok-3',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 4096,
            temperature: 0.7,
          }),
        });
        const data = await response.json();
        output = data.choices?.[0]?.message?.content || '';
      }

      // If literal truth mode is enabled, apply rule-based softening and verification
      // Note: For literal truth verification, we always use Claude for consistency
      if (literalTruth && (mode === 'truth-isomorphism' || mode === 'math-truth-select')) {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        // STEP 1: Rule-based quantifier softening (deterministic pass)
        const softenQuantifiers = (text: string): string => {
          let softened = text;
          
          // Soften absolute universals
          softened = softened.replace(/\ball ([a-z]+s|devices|systems|networks|entities)\b/gi, (match, noun) => `${noun} that meet the specified conditions`);
          softened = softened.replace(/\bevery ([a-z]+|device|system|network|entity)\b/gi, (match, noun) => `each ${noun} satisfying the criteria`);
          softened = softened.replace(/\bconstantly\b/gi, 'during active operation');
          softened = softened.replace(/\balways\b/gi, 'under normal conditions');
          softened = softened.replace(/\bnever\b/gi, 'does not systematically');
          softened = softened.replace(/\bcannot\b/gi, 'cannot without external factors');
          softened = softened.replace(/\bimpossible\b/gi, 'impossible under current constraints');
          softened = softened.replace(/\bin all cases\b/gi, 'in typical cases');
          softened = softened.replace(/\bwithout exception\b/gi, 'with rare exceptions');
          
          return softened;
        };

        output = softenQuantifiers(output);

        // STEP 2: Verification with revision loop (up to 3 attempts)
        let verificationAttempts = 0;
        const maxAttempts = 3;
        let isVerified = false;

        while (!isVerified && verificationAttempts < maxAttempts) {
          verificationAttempts++;

          const verificationPrompt = `You are a strict fact-checker. Review the following output and identify any statements that are NOT literally true (i.e., approximately true, qualifiedly true, or contain unverified absolutes like "all", "every", "always", "never" without proper conditions).

OUTPUT TO VERIFY:
${output}

TASK:
1. Identify each statement that is NOT literally true
2. For each problematic statement, explain WHY it's not literally true
3. Provide a corrected version that IS literally true

If ALL statements are already literally true, respond with: "VERIFIED: All statements are literally true."

If any statements need correction, respond in this format:
PROBLEMATIC STATEMENT 1: [quote the statement]
WHY NOT LITERAL: [explanation]
CORRECTED: [literally true version]

PROBLEMATIC STATEMENT 2: [quote the statement]
WHY NOT LITERAL: [explanation]
CORRECTED: [literally true version]

Be extremely strict - reject any approximations, generalizations, or unqualified universals.`;

          const verificationMessage = await anthropic.messages.create({
            model: "claude-3-7-sonnet-20250219",
            max_tokens: 2000,
            temperature: 0,
            messages: [
              {
                role: "user",
                content: verificationPrompt
              }
            ]
          });

          const verificationResult = verificationMessage.content[0].type === 'text' ? verificationMessage.content[0].text : '';

          // Check if verification passed
          if (verificationResult.includes('VERIFIED: All statements are literally true')) {
            isVerified = true;
            output += `\n\n✅ LITERAL TRUTH VERIFIED: All statements have been confirmed to be literally true (verified in ${verificationAttempts} ${verificationAttempts === 1 ? 'attempt' : 'attempts'}).`;
          } else if (verificationAttempts < maxAttempts) {
            // Extract corrections and regenerate output
            console.log(`Verification attempt ${verificationAttempts} failed. Regenerating with corrections...`);
            
            // Apply corrections from verification
            const correctionRegex = /CORRECTED: ([\s\S]+?)(?=\n\n|$)/g;
            const corrections = [];
            let match;
            while ((match = correctionRegex.exec(verificationResult)) !== null) {
              corrections.push(match[1].trim());
            }

            if (corrections.length > 0) {
              // Regenerate with explicit corrections
              const regeneratePrompt = `${userPrompt}\n\nCRITICAL CORRECTIONS REQUIRED:\nThe following corrections must be incorporated to ensure literal truth:\n${corrections.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nRegenerate the complete output incorporating these corrections to ensure ALL statements are literally true.`;

              const regenerateMessage = await anthropic.messages.create({
                model: "claude-3-7-sonnet-20250219",
                max_tokens: 4096,
                temperature: 0.5,
                system: systemPrompt,
                messages: [
                  {
                    role: "user",
                    content: regeneratePrompt
                  }
                ]
              });

              output = regenerateMessage.content[0].type === 'text' ? regenerateMessage.content[0].text : '';
              output = softenQuantifiers(output); // Apply softening again
            } else {
              // No extractable corrections, fail out
              break;
            }
          } else {
            // Max attempts reached, include verification report
            output += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nLITERAL TRUTH VERIFICATION REPORT (${verificationAttempts} attempts):\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${verificationResult}\n\nNOTE: After ${maxAttempts} attempts, some statements could not be verified as literally true. Please review the verification report and use the corrected versions above.`;
          }
        }
      }

      // Log parameters to console for diagnostics - output is clean text only
      console.log(`[Text Model Validator] Mode: ${mode}, Provider: ${provider}`);
      if (fidelityLevel) console.log(`[Text Model Validator] Aggressiveness: ${fidelityLevel}`);
      if (targetDomain) console.log(`[Text Model Validator] Target Domain: ${targetDomain}`);
      if (customInstructions) console.log(`[Text Model Validator] Has custom instructions`);

      res.json({
        success: true,
        output: output,
        mode: mode
      });

    } catch (error: any) {
      console.error("Text Model Validator error:", error);
      res.status(500).json({ 
        success: false,
        message: error.message || "Validation failed" 
      });
    }
  });

  // Text Model Validator BATCH endpoint - Run multiple modes at once
  app.post("/api/text-model-validator/batch", async (req: Request, res: Response) => {
    try {
      const { text, modes, targetDomain, fidelityLevel, mathFramework, constraintType, rigorLevel, customInstructions, truthMapping, mathTruthMapping, literalTruth, llmProvider } = req.body;

      if (!text || !modes || !Array.isArray(modes) || modes.length === 0) {
        return res.status(400).json({ 
          success: false,
          message: "Text and modes array are required" 
        });
      }

      const validModes = ["reconstruction", "isomorphism", "mathmodel", "truth-isomorphism", "math-truth-select"];
      const invalidModes = modes.filter((m: string) => !validModes.includes(m));
      if (invalidModes.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid modes: ${invalidModes.join(', ')}. Valid modes are: ${validModes.join(', ')}`
        });
      }

      console.log(`[Text Model Validator Batch] Processing ${modes.length} modes: ${modes.join(', ')}`);

      // Process modes in parallel with concurrency limit
      const processMode = async (mode: string): Promise<{ mode: string; success: boolean; output?: string; error?: string }> => {
        try {
          // Make internal request to the single-mode endpoint
          const response = await fetch(`http://localhost:5000/api/text-model-validator`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              mode,
              targetDomain,
              fidelityLevel,
              mathFramework,
              constraintType,
              rigorLevel,
              customInstructions,
              truthMapping,
              mathTruthMapping,
              literalTruth,
              llmProvider
            })
          });

          const data = await response.json();
          if (data.success) {
            return { mode, success: true, output: data.output };
          } else {
            return { mode, success: false, error: data.message || 'Processing failed' };
          }
        } catch (error: any) {
          return { mode, success: false, error: error.message || 'Request failed' };
        }
      };

      // Process with concurrency limit of 2 to avoid rate limits
      const results: { mode: string; success: boolean; output?: string; error?: string }[] = [];
      const concurrencyLimit = 2;
      
      for (let i = 0; i < modes.length; i += concurrencyLimit) {
        const batch = modes.slice(i, i + concurrencyLimit);
        const batchResults = await Promise.all(batch.map(processMode));
        results.push(...batchResults);
      }

      res.json({
        success: true,
        results,
        totalModes: modes.length,
        successfulModes: results.filter(r => r.success).length,
        failedModes: results.filter(r => !r.success).length
      });

    } catch (error: any) {
      console.error("Text Model Validator Batch error:", error);
      res.status(500).json({ 
        success: false,
        message: error.message || "Batch validation failed" 
      });
    }
  });

  // Objections Function - Generate 25 objections and counter-arguments
  app.post("/api/text-model-validator/objections", async (req: Request, res: Response) => {
    try {
      const { 
        bottomlineOutput,
        audience,
        objective,
        idea,
        tone,
        emphasis,
        customInstructions,
        llmProvider
      } = req.body;

      if (!bottomlineOutput) {
        return res.status(400).json({ 
          success: false,
          message: "Input text is required to generate objections" 
        });
      }

      const wordCount = bottomlineOutput.split(/\s+/).filter((w: string) => w.length > 0).length;
      console.log(`[OBJECTIONS] Document has ${wordCount} words`);
      console.log(`[OBJECTIONS] Generating for audience: ${audience || 'unspecified'}`);
      console.log(`[OBJECTIONS] Custom instructions: ${customInstructions ? 'provided' : 'none'}`);

      // Use outline-first approach for large documents (1200+ words)
      if (wordCount >= 1200) {
        console.log(`[OBJECTIONS] Using outline-first approach for large document`);
        const { shouldUseOutlineFirstObjections, outlineFirstObjections } = await import('./services/outlineFirstObjections');
        
        const result = await outlineFirstObjections(
          bottomlineOutput,
          audience || '',
          objective || '',
          customInstructions || ''
        );

        if (result.success) {
          return res.json({
            success: true,
            output: result.output,
            method: 'outline-first',
            wordCount
          });
        } else {
          console.log(`[OBJECTIONS] Outline-first failed, falling back to standard approach`);
        }
      }

      // Standard approach for shorter documents or fallback
      console.log(`[OBJECTIONS] Using standard single-pass approach`);

      // Build context from input settings
      const audienceContext = audience ? `The target audience is: ${audience}` : 'General audience';
      const objectiveContext = objective ? `The objective is: ${objective}` : '';
      const ideaContext = idea ? `The core idea being conveyed: ${idea}` : '';
      const toneContext = tone ? `The communication tone is: ${tone}` : 'professional';
      const emphasisContext = emphasis ? `Key emphasis points: ${emphasis}` : '';
      const customContext = customInstructions ? `\n\nADDITIONAL INSTRUCTIONS FROM USER:\n${customInstructions}` : '';

      const systemPrompt = `You are an expert at anticipating objections, counterarguments, and challenges. Your role is to identify the most likely objections that readers/listeners might have to a piece of content, and craft compelling, well-reasoned responses to each objection.

Key principles:
1. THINK LIKE A SKEPTIC: What would a critical reader notice? What assumptions are being made? What evidence is missing?
2. CONSIDER THE AUDIENCE: Different audiences have different concerns. Tailor objections to what THIS audience would likely raise.
3. COVER ALL ANGLES: Include logical objections, emotional objections, practical objections, ethical objections, and factual objections.
4. PROVIDE STRONG RESPONSES: Each response should be compelling and directly address the concern. Don't be dismissive.
5. ORDER BY LIKELIHOOD: Put the most likely/common objections first.`;

      const userPrompt = `## THE CONTENT TO ANALYZE:
${bottomlineOutput}

## CONTEXT:
${audienceContext}
${objectiveContext}
${ideaContext}
${toneContext}
${emphasisContext}
${customContext}

## YOUR TASK:
Generate exactly 25 likely objections that a member of the target audience might raise against this content, along with compelling responses to each objection.

For each objection, provide:
1. The objection (framed as something the audience member would say/think)
2. A strong counter-response that addresses the concern directly

Format each entry as:

**OBJECTION #[N]:**
[The objection phrased as a critical question or statement]

**RESPONSE:**
[A compelling, reasoned response that addresses the concern]

---

Generate all 25 objections and responses now. Cover a wide range: logical flaws, missing evidence, alternative explanations, practical concerns, emotional resistance, competitive alternatives, implementation challenges, cost/benefit concerns, timing issues, and any audience-specific worries.`;

      let output = "";

      // Use Claude for high-quality objection generation
      if (process.env.ANTHROPIC_API_KEY) {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }]
        });
        
        output = (response.content[0] as any).text;
      } else if (process.env.OPENAI_API_KEY) {
        // Fallback to OpenAI
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 8000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        });
        
        output = response.choices[0]?.message?.content || "";
      } else {
        return res.status(500).json({
          success: false,
          message: "No AI provider configured for objections generation"
        });
      }

      // Add comprehensive header with full custom instructions visible
      const customInstructionsHeader = customInstructions ? `${'═'.repeat(60)}
YOUR CUSTOM INSTRUCTIONS (Applied to Objection Generation)
${'═'.repeat(60)}
${customInstructions}
${'═'.repeat(60)}

` : '';

      const header = `${customInstructionsHeader}${'═'.repeat(60)}
OBJECTIONS & COUNTER-ARGUMENTS (25 Items)
${'═'.repeat(60)}
Target Audience: ${audience || 'General'}
Objective: ${objective || 'Communicate effectively'}
${'═'.repeat(60)}

${output}`;

      console.log(`[OBJECTIONS] Generated successfully`);

      res.json({
        success: true,
        output: header
      });

    } catch (error: any) {
      console.error("OBJECTIONS error:", error);
      res.status(500).json({ 
        success: false,
        message: error.message || "Objections generation failed" 
      });
    }
  });

  // Objection-Proof Rewrite - Rewrite text to be invulnerable to identified objections
  app.post("/api/objection-proof-rewrite", async (req: Request, res: Response) => {
    try {
      const { originalText, objectionsOutput, customInstructions, finalVersionOnly } = req.body;

      if (!originalText) {
        return res.status(400).json({
          success: false,
          message: "Original text is required"
        });
      }

      if (!objectionsOutput) {
        return res.status(400).json({
          success: false,
          message: "Objections output is required. Please run the Objections function first."
        });
      }

      const wordCount = originalText.split(/\s+/).filter((w: string) => w.length > 0).length;
      console.log(`[OBJECTION-PROOF] Rewriting text of ${wordCount} words (${originalText.length} chars)`);
      console.log(`[OBJECTION-PROOF] Objections length: ${objectionsOutput.length}`);
      console.log(`[OBJECTION-PROOF] Custom instructions: ${customInstructions ? 'provided' : 'none'}`);
      console.log(`[OBJECTION-PROOF] Final version only: ${finalVersionOnly ? 'yes' : 'no'}`);

      // Use outline-first approach for large texts (1200+ words)
      if (wordCount >= 1200) {
        console.log(`[OBJECTION-PROOF] Using outline-first approach for ${wordCount} words`);
        const { generateOutlineFirstObjectionProof } = await import('./services/outlineFirstObjectionProof');
        
        const result = await generateOutlineFirstObjectionProof(
          originalText,
          objectionsOutput,
          customInstructions
        );

        if (!result.success) {
          return res.status(500).json({
            success: false,
            message: result.error || "Failed to generate objection-proof version"
          });
        }

        // Build comprehensive header showing custom instructions, structure, and process
        // Custom instructions are ALWAYS shown at top
        const customInstructionsHeader = customInstructions ? `${'═'.repeat(60)}
YOUR CUSTOM INSTRUCTIONS (Applied Throughout)
${'═'.repeat(60)}
${customInstructions}
${'═'.repeat(60)}

` : '';

        // Build section outline
        const formatSectionOutline = () => {
          if (!result.sections || result.sections.length === 0) return '';
          
          let outline = `${'═'.repeat(60)}
DOCUMENT STRUCTURE (Outline Generated First)
${'═'.repeat(60)}

`;
          for (const section of result.sections) {
            outline += `${section.id}. ${section.title} (${section.wordCount} words)
   Objections mapped: ${section.objectionsMapped.length > 0 ? '#' + section.objectionsMapped.join(', #') : 'None'}
`;
          }
          
          if (result.objectionBreakdown) {
            outline += `
${'─'.repeat(60)}
OBJECTION BREAKDOWN:
${'─'.repeat(60)}
Devastating: ${result.objectionBreakdown.devastating}
Forceful: ${result.objectionBreakdown.forceful}
Minor: ${result.objectionBreakdown.minor}
`;
          }
          
          outline += `${'═'.repeat(60)}

`;
          return outline;
        };

        const sectionOutline = formatSectionOutline();

        const documentHeader = `${'═'.repeat(60)}
OBJECTION-PROOF DOCUMENT (Based on Above Structure)
${'═'.repeat(60)}

`;

        // ALWAYS include custom instructions at top, even for finalVersionOnly
        const fullOutput = finalVersionOnly 
          ? customInstructionsHeader + result.output 
          : customInstructionsHeader + sectionOutline + documentHeader + result.output;

        return res.json({
          success: true,
          output: fullOutput,
          method: 'outline-first',
          sectionsProcessed: result.sectionsProcessed,
          objectionsAddressed: result.objectionsAddressed
        });
      }

      // Standard approach for smaller texts
      
      // CHECK FOR SPECIAL FORMAT - use direct format approach for glossaries, lists, etc.
      const detectSpecialFormat = (instructions: string | undefined): { isSpecial: boolean; itemCount?: number } => {
        if (!instructions) return { isSpecial: false };
        const upper = instructions.toUpperCase();
        if (upper.includes('GLOSSARY') || 
            (upper.includes('TERM') && upper.includes('DEFINITION')) ||
            (upper.includes('BOLD') && upper.includes('COLON')) ||
            upper.includes('NO PARAGRAPH') ||
            (upper.includes('JUST') && (upper.includes('ENTRIES') || upper.includes('ITEMS')))) {
          const countMatch = instructions.match(/(?:EXACTLY\s+)?(\d+)\s+(?:TERMS?|ENTRIES|ITEMS|QUOTES?|DISCOVERIES)/i);
          return { isSpecial: true, itemCount: countMatch ? parseInt(countMatch[1]) : undefined };
        }
        const numberedMatch = instructions.match(/(?:EXACTLY\s+)?(\d+)\s+(QUOTES?|DISCOVERIES|FACTS?|EXAMPLES?|POINTS?)/i);
        if (numberedMatch) {
          return { isSpecial: true, itemCount: parseInt(numberedMatch[1]) };
        }
        return { isSpecial: false };
      };
      
      const formatCheck = detectSpecialFormat(customInstructions);
      if (formatCheck.isSpecial && customInstructions) {
        console.log(`[OBJECTION-PROOF] Special format detected for short document, using direct format approach`);
        
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        
        const formatPrompt = `You are a precise document formatter. Your ONLY job is to produce output that EXACTLY matches the format specifications.

CRITICAL FORMAT INSTRUCTIONS - THESE OVERRIDE EVERYTHING ELSE:
${'═'.repeat(60)}
${customInstructions}
${'═'.repeat(60)}

YOU MUST:
1. Follow the format instructions EXACTLY - no deviations
2. If instructed to produce ${formatCheck.itemCount || 'a specific number of'} items, produce EXACTLY that many
3. If instructed "NO paragraphs" - produce NO paragraphs
4. If instructed "NO numbered lists" - DO NOT use numbered lists
5. Match the EXACT format described (bold terms, colons, etc.)

The objections below should inform the CONTENT quality but NOT change the FORMAT.
Your output format MUST match the instructions EXACTLY.`;

        const formatUserPrompt = `ORIGINAL TEXT TO TRANSFORM:
${originalText}

OBJECTIONS & COUNTER-ARGUMENTS (for content quality only - do NOT change format):
${objectionsOutput.substring(0, 3000)}

PRODUCE OUTPUT IN THE EXACT FORMAT SPECIFIED IN YOUR INSTRUCTIONS.
Output ONLY the formatted content - no meta-commentary.`;

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: formatPrompt,
          messages: [{ role: "user", content: formatUserPrompt }]
        });

        const textContent = response.content.find((block: any) => block.type === 'text');
        const output = textContent ? (textContent as any).text : "";
        
        // Return ONLY the formatted output - no extra headers
        // The user's format instructions demand clean output
        return res.json({
          success: true,
          output: output.trim(),
          method: 'format-aware'
        });
      }

      const systemPrompt = finalVersionOnly 
        ? `You are an expert academic editor and argumentation specialist. Your task is to rewrite a text so that it becomes OBJECTION-PROOF - meaning it pre-emptively addresses and neutralizes all identified objections.

YOUR REWRITING STRATEGY:

1. CATEGORIZE EACH OBJECTION:
   - DEVASTATING OBJECTIONS: These expose fundamental flaws, logical contradictions, or fatal errors in the argument. For these, you MUST substantially revise the content, claims, or thesis to eliminate the vulnerability.
   - FORCEFUL BUT NON-DEVASTATING OBJECTIONS: These appear to have weight but don't actually undermine the core argument. For these, add clarifying language, qualifications, or preemptive responses.
   - MINOR/RHETORICAL OBJECTIONS: These are easily dismissed. Add brief anticipatory language or subtle framing.

2. REWRITING PRINCIPLES:
   - Preserve the author's voice and style as much as possible
   - Maintain the core thesis UNLESS a devastating objection requires modification
   - Add anticipatory language ("One might object that... however...")
   - Strengthen weak points in the argument
   - Add qualifications where claims are overstated
   - Include evidence or examples where assertions are unsupported
   - Restructure if necessary to present ideas in a more defensible order

3. OUTPUT FORMAT:
   Output ONLY the complete rewritten text. Do NOT include any change log, commentary, explanations, or meta-discussion. Just the polished, objection-proof final version ready for use.`
        : `You are an expert academic editor and argumentation specialist. Your task is to rewrite a text so that it becomes OBJECTION-PROOF - meaning it pre-emptively addresses and neutralizes all identified objections.

YOUR REWRITING STRATEGY:

1. CATEGORIZE EACH OBJECTION:
   - DEVASTATING OBJECTIONS: These expose fundamental flaws, logical contradictions, or fatal errors in the argument. For these, you MUST substantially revise the content, claims, or thesis to eliminate the vulnerability. This may require changing the core argument significantly.
   - FORCEFUL BUT NON-DEVASTATING OBJECTIONS: These appear to have weight but don't actually undermine the core argument. For these, add clarifying language, qualifications, or preemptive responses that make these objections lose even their apparent force.
   - MINOR/RHETORICAL OBJECTIONS: These are easily dismissed. Add brief anticipatory language or subtle framing that prevents readers from even raising them.

2. REWRITING PRINCIPLES:
   - Preserve the author's voice and style as much as possible
   - Maintain the core thesis UNLESS a devastating objection requires modification
   - Add anticipatory language ("One might object that... however...")
   - Strengthen weak points in the argument
   - Add qualifications where claims are overstated
   - Include evidence or examples where assertions are unsupported
   - Restructure if necessary to present ideas in a more defensible order

3. OUTPUT FORMAT:
   First provide a brief CHANGE LOG listing each objection and how you addressed it (1-2 sentences each).
   Then provide the REWRITTEN TEXT in full.`;

      const userPrompt = finalVersionOnly
        ? `ORIGINAL TEXT:
${originalText}

═══════════════════════════════════════════════════
OBJECTIONS IDENTIFIED (from Objections Function):
═══════════════════════════════════════════════════
${objectionsOutput}

${customInstructions ? `═══════════════════════════════════════════════════
CUSTOM INSTRUCTIONS FROM USER:
${customInstructions}
═══════════════════════════════════════════════════` : ''}

Now rewrite the original text to make it objection-proof. Output ONLY the final rewritten text - no change log, no commentary, no explanations. Just the polished final version ready to use.`
        : `ORIGINAL TEXT:
${originalText}

═══════════════════════════════════════════════════
OBJECTIONS IDENTIFIED (from Objections Function):
═══════════════════════════════════════════════════
${objectionsOutput}

${customInstructions ? `═══════════════════════════════════════════════════
CUSTOM INSTRUCTIONS FROM USER:
${customInstructions}
═══════════════════════════════════════════════════` : ''}

Now rewrite the original text to make it objection-proof. Remember:
- For DEVASTATING objections: Substantially change content/claims to eliminate the vulnerability
- For FORCEFUL objections: Add language that removes even the appearance of force
- For MINOR objections: Add subtle preemptive framing

Provide:
1. A CHANGE LOG showing how each major objection was addressed
2. The complete REWRITTEN TEXT`;

      let output = "";

      // Use Anthropic Claude for the rewriting (best for nuanced writing tasks)
      if (process.env.ANTHROPIC_API_KEY) {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8000,
          messages: [
            { role: "user", content: `${systemPrompt}\n\n${userPrompt}` }
          ]
        });

        const textContent = response.content.find((block: any) => block.type === 'text');
        output = textContent ? (textContent as any).text : "";
      } else if (process.env.OPENAI_API_KEY) {
        // Fallback to OpenAI
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 8000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        });
        
        output = response.choices[0]?.message?.content || "";
      } else {
        return res.status(500).json({
          success: false,
          message: "No AI provider configured for objection-proof rewriting"
        });
      }

      // Add header only if not finalVersionOnly
      const finalOutput = finalVersionOnly 
        ? output  // Just the clean text, no header
        : `═══════════════════════════════════════════════════
OBJECTION-PROOF VERSION
═══════════════════════════════════════════════════
Generated by analyzing and pre-empting identified objections
═══════════════════════════════════════════════════

${output}`;

      console.log(`[OBJECTION-PROOF] Generated successfully`);

      res.json({
        success: true,
        output: finalOutput
      });

    } catch (error: any) {
      console.error("OBJECTION-PROOF error:", error);
      res.status(500).json({ 
        success: false,
        message: error.message || "Objection-proof rewriting failed" 
      });
    }
  });

  // Refine Output - Adjust word count and/or apply custom instructions
  app.post("/api/refine-output", async (req: Request, res: Response) => {
    try {
      const { text, targetWordCount, customInstructions } = req.body;

      if (!text) {
        return res.status(400).json({
          success: false,
          message: "Text is required"
        });
      }

      if (!targetWordCount && !customInstructions) {
        return res.status(400).json({
          success: false,
          message: "Either target word count or custom instructions are required"
        });
      }

      const currentWordCount = text.trim().split(/\s+/).length;
      console.log(`[REFINE] Current word count: ${currentWordCount}, Target: ${targetWordCount || 'N/A'}`);
      console.log(`[REFINE] Custom instructions: ${customInstructions ? 'provided' : 'none'}`);

      let instructions = [];
      if (targetWordCount) {
        const diff = targetWordCount - currentWordCount;
        if (diff < 0) {
          instructions.push(`Reduce the text to approximately ${targetWordCount} words (currently ${currentWordCount} words, need to cut ~${Math.abs(diff)} words). Remove redundancies, tighten prose, and eliminate unnecessary elaboration while preserving all key ideas and arguments.`);
        } else if (diff > 0) {
          instructions.push(`Expand the text to approximately ${targetWordCount} words (currently ${currentWordCount} words, need to add ~${diff} words). Add relevant examples, elaboration, or supporting details while maintaining coherence and not padding with filler.`);
        }
      }
      if (customInstructions) {
        instructions.push(`Additional requirements: ${customInstructions}`);
      }

      const systemPrompt = `You are an expert editor. Your task is to refine and adjust the provided text according to specific instructions while maintaining its core meaning, argument structure, and quality. Output ONLY the refined text - no commentary, explanations, or meta-discussion.`;

      const userPrompt = `TEXT TO REFINE:
${text}

INSTRUCTIONS:
${instructions.join('\n\n')}

Provide the refined text only. No commentary or explanation.`;

      let output = "";

      if (process.env.ANTHROPIC_API_KEY) {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8000,
          messages: [
            { role: "user", content: `${systemPrompt}\n\n${userPrompt}` }
          ]
        });

        const textContent = response.content.find((block: any) => block.type === 'text');
        output = textContent ? (textContent as any).text : "";
      } else if (process.env.OPENAI_API_KEY) {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 8000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        });
        
        output = response.choices[0]?.message?.content || "";
      } else {
        return res.status(500).json({
          success: false,
          message: "No AI provider configured"
        });
      }

      const newWordCount = output.trim().split(/\s+/).length;
      console.log(`[REFINE] Output word count: ${newWordCount}`);

      res.json({
        success: true,
        output: output,
        wordCount: newWordCount
      });

    } catch (error: any) {
      console.error("REFINE error:", error);
      res.status(500).json({ 
        success: false,
        message: error.message || "Refinement failed" 
      });
    }
  });

  // Coherence Meter endpoint - Analyze and improve text coherence  
  app.post("/api/coherence-meter", async (req: Request, res: Response) => {
    try {
      const { text, mode, aggressiveness = "moderate", coherenceType } = req.body;

      if (!text || !mode) {
        return res.status(400).json({
          success: false,
          message: "Text and mode are required"
        });
      }

      const validModes = ["analyze", "rewrite", "rewrite-max", "reconstruct", "math-coherence", "math-cogency", "math-max-coherence", "math-maximize-truth"];
      if (!validModes.includes(mode)) {
        return res.status(400).json({
          success: false,
          message: `Mode must be one of: ${validModes.join(", ")}`
        });
      }

      console.log(`Coherence Meter - Mode: ${mode}, Type: ${coherenceType || 'default'}, Aggressiveness: ${aggressiveness}, Text length: ${text.length}`);

      const { 
        analyzeCoherence, 
        rewriteForCoherence, 
        reconstructToMaxCoherence,
        analyzeMathProofValidity, 
        analyzeMathCoherence,
        rewriteMathMaxCoherence,
        rewriteMathMaximizeTruth,
        analyzeScientificExplanatoryCoherence, 
        rewriteScientificExplanatory 
      } = await import('./services/coherenceMeter');

      // MATH COHERENCE - structural coherence only, NOT truth
      if (mode === "math-coherence") {
        const result = await analyzeMathCoherence(text);
        
        res.json({
          success: true,
          isMathCoherence: true,
          analysis: result.analysis,
          score: result.score,
          assessment: result.assessment,
          subscores: result.subscores
        });
      }
      // MATH COGENCY - checks if theorem is TRUE and proof is valid  
      else if (mode === "math-cogency") {
        const result = await analyzeMathProofValidity(text);
        
        res.json({
          success: true,
          isMathCogency: true,
          analysis: result.analysis,
          score: result.score,
          verdict: result.verdict,
          subscores: result.subscores,
          flaws: result.flaws,
          counterexamples: result.counterexamples
        });
      }
      // MATH MAX COHERENCE - improve structural coherence only, preserve theorem
      else if (mode === "math-max-coherence") {
        const result = await rewriteMathMaxCoherence(text, aggressiveness as "conservative" | "moderate" | "aggressive");
        
        res.json({
          success: true,
          isMathMaxCoherence: true,
          rewrite: result.rewrittenProof,
          changes: result.changes,
          coherenceScore: result.coherenceScore
        });
      }
      // MATH MAXIMIZE TRUTH - correct proofs or find adjacent truths
      else if (mode === "math-maximize-truth") {
        const result = await rewriteMathMaximizeTruth(text);
        
        res.json({
          success: true,
          isMathMaximizeTruth: true,
          correctedProof: result.correctedProof,
          theoremStatus: result.theoremStatus,
          originalTheorem: result.originalTheorem,
          correctedTheorem: result.correctedTheorem,
          proofStrategy: result.proofStrategy,
          keyCorrections: result.keyCorrections,
          validityScore: result.validityScore
        });
      }
      // RECONSTRUCT TO MAX COHERENCE - adds thematically-adjacent material if needed
      else if (mode === "reconstruct") {
        const result = await reconstructToMaxCoherence(text, coherenceType);
        
        res.json({
          success: true,
          isReconstruction: true,
          rewrite: result.reconstructedText,
          changes: result.changes,
          wasReconstructed: result.wasReconstructed,
          adjacentMaterialAdded: result.adjacentMaterialAdded,
          originalLimitationsIdentified: result.originalLimitationsIdentified
        });
      }
      // REWRITE TO MAX - aggressive rewrite aiming for 9-10/10
      else if (mode === "rewrite-max") {
        const result = await rewriteForCoherence(text, "aggressive");
        
        res.json({
          success: true,
          rewrite: result.rewrittenText,
          changes: result.changes,
          isMaxRewrite: true
        });
      }
      else if (mode === "analyze") {
        let appliedCoherenceType = coherenceType;
        
        // AUTO-DETECT: First determine which coherence type applies
        if (coherenceType === "auto-detect") {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          
          const detectPrompt = `Analyze this text and determine which coherence type it is attempting to achieve. Choose the SINGLE BEST match from these options:

- logical-consistency: Text focuses on avoiding contradictions and maintaining logical consistency
- logical-cohesiveness: Text builds arguments where claims actively support each other
- scientific-explanatory: Text explains phenomena using natural laws and scientific mechanisms
- thematic-psychological: Text focuses on mood, imagery, emotional trajectory, or psychological feel
- instructional: Text provides actionable instructions or directives
- motivational: Text aims to inspire specific feelings or psychological states
- mathematical: Text contains mathematical proofs, derivations, or quantitative arguments
- philosophical: Text engages with conceptual rigor, distinctions, and philosophical arguments

TEXT TO ANALYZE:
${text.substring(0, 2000)}

Respond with ONLY the coherence type (e.g., "logical-consistency" or "scientific-explanatory"). No explanation needed.`;

          const detectMessage = await anthropic.messages.create({
            model: "claude-3-7-sonnet-20250219",
            max_tokens: 50,
            temperature: 0,
            messages: [{ role: "user", content: detectPrompt }]
          });

          const detectedType = detectMessage.content[0].type === 'text' 
            ? detectMessage.content[0].text.trim().toLowerCase() 
            : 'logical-consistency';
          
          // Validate detected type
          const validTypes = ["logical-consistency", "logical-cohesiveness", "scientific-explanatory", "thematic-psychological", "instructional", "motivational", "mathematical", "philosophical"];
          appliedCoherenceType = validTypes.includes(detectedType) ? detectedType : "logical-consistency";
          
          console.log(`Auto-detected coherence type: ${appliedCoherenceType}`);
        }
        
        // Use specialized analyzer for scientific-explanatory coherence
        if (appliedCoherenceType === "scientific-explanatory") {
          const result = await analyzeScientificExplanatoryCoherence(text);
          
          res.json({
            success: true,
            analysis: result.fullAnalysis,
            score: result.overallScore,
            assessment: result.overallAssessment,
            isScientificExplanatory: true,
            logicalConsistency: result.logicalConsistency,
            scientificAccuracy: result.scientificAccuracy,
            detectedCoherenceType: coherenceType === "auto-detect" ? appliedCoherenceType : undefined,
            wasAutoDetected: coherenceType === "auto-detect"
          });
        } else {
          const result = await analyzeCoherence(text);
          
          res.json({
            success: true,
            analysis: result.analysis,
            score: result.score,
            assessment: result.assessment,
            subscores: result.subscores,
            detectedCoherenceType: coherenceType === "auto-detect" ? appliedCoherenceType : undefined,
            wasAutoDetected: coherenceType === "auto-detect"
          });
        }
      } else {
        let appliedCoherenceType = coherenceType;
        
        // AUTO-DETECT for rewrite mode
        if (coherenceType === "auto-detect") {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          
          const detectPrompt = `Analyze this text and determine which coherence type it is attempting to achieve. Choose the SINGLE BEST match from these options:

- logical-consistency: Text focuses on avoiding contradictions and maintaining logical consistency
- logical-cohesiveness: Text builds arguments where claims actively support each other
- scientific-explanatory: Text explains phenomena using natural laws and scientific mechanisms
- thematic-psychological: Text focuses on mood, imagery, emotional trajectory, or psychological feel
- instructional: Text provides actionable instructions or directives
- motivational: Text aims to inspire specific feelings or psychological states
- mathematical: Text contains mathematical proofs, derivations, or quantitative arguments
- philosophical: Text engages with conceptual rigor, distinctions, and philosophical arguments

TEXT TO ANALYZE:
${text.substring(0, 2000)}

Respond with ONLY the coherence type (e.g., "logical-consistency" or "scientific-explanatory"). No explanation needed.`;

          const detectMessage = await anthropic.messages.create({
            model: "claude-3-7-sonnet-20250219",
            max_tokens: 50,
            temperature: 0,
            messages: [{ role: "user", content: detectPrompt }]
          });

          const detectedType = detectMessage.content[0].type === 'text' 
            ? detectMessage.content[0].text.trim().toLowerCase() 
            : 'logical-consistency';
          
          // Validate detected type
          const validTypes = ["logical-consistency", "logical-cohesiveness", "scientific-explanatory", "thematic-psychological", "instructional", "motivational", "mathematical", "philosophical"];
          appliedCoherenceType = validTypes.includes(detectedType) ? detectedType : "logical-consistency";
          
          console.log(`Auto-detected coherence type for rewrite: ${appliedCoherenceType}`);
        }
        
        // Use specialized scientific rewrite for scientific-explanatory coherence type
        if (appliedCoherenceType === "scientific-explanatory") {
          const result = await rewriteScientificExplanatory(text, aggressiveness as "conservative" | "moderate" | "aggressive");
          
          res.json({
            success: true,
            rewrite: result.rewrittenText,
            changes: result.changes,
            correctionsApplied: result.correctionsApplied,
            scientificAccuracyScore: result.scientificAccuracyScore,
            isScientificExplanatory: true,
            detectedCoherenceType: coherenceType === "auto-detect" ? appliedCoherenceType : undefined,
            wasAutoDetected: coherenceType === "auto-detect"
          });
        } else {
          const result = await rewriteForCoherence(text, aggressiveness as "conservative" | "moderate" | "aggressive");
          
          res.json({
            success: true,
            rewrite: result.rewrittenText,
            changes: result.changes,
            detectedCoherenceType: coherenceType === "auto-detect" ? appliedCoherenceType : undefined,
            wasAutoDetected: coherenceType === "auto-detect"
          });
        }
      }
    } catch (error: any) {
      console.error("Coherence Meter error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Coherence analysis/rewrite failed"
      });
    }
  });

  // Content Analysis - Evaluates richness, substantiveness, and salvageability
  app.post("/api/content-analysis", async (req: Request, res: Response) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({
          success: false,
          message: "Text is required"
        });
      }

      console.log(`Content Analysis - Text length: ${text.length}`);

      const { analyzeContent } = await import('./services/coherenceMeter');
      const result = await analyzeContent(text);

      res.json({
        success: true,
        richnessScore: result.richnessScore,
        richnessAssessment: result.richnessAssessment,
        substantivenessGap: result.substantivenessGap,
        salvageability: result.salvageability,
        breakdown: result.breakdown,
        fullAnalysis: result.fullAnalysis
      });

    } catch (error: any) {
      console.error("Content Analysis error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Content analysis failed"
      });
    }
  });

  // Global Coherence Analysis - Uses GCO for cross-chunk coherence preservation
  app.post("/api/coherence-global", async (req: Request, res: Response) => {
    try {
      const { 
        text, 
        coherenceType, 
        mode, 
        aggressiveness = "moderate",
        documentId,
        resumeFromChunk,
        globalState,
        existingChunks 
      } = req.body;

      if (!text || !coherenceType || !mode) {
        return res.status(400).json({
          success: false,
          message: "Text, coherenceType, and mode are required"
        });
      }
      
      // Log resume attempt
      if (documentId && resumeFromChunk !== undefined) {
        console.log(`[Resume] Resuming job ${documentId} from chunk ${resumeFromChunk}, existing chunks: ${existingChunks}`);
      }

      const wordCount = text.trim().split(/\s+/).length;
      console.log(`Global Coherence - Type: ${coherenceType}, Mode: ${mode}, Words: ${wordCount}`);

      const { 
        analyzeGlobalCoherence, 
        rewriteWithGlobalCoherence,
        extractGlobalContextObject 
      } = await import('./services/coherenceMeter');

      // Determine the coherence mode to use
      let appliedCoherenceType = coherenceType;
      
      if (coherenceType === "auto-detect") {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        
        const detectPrompt = `Analyze this text and determine which coherence type it is attempting to achieve. Choose the SINGLE BEST match:

- logical-consistency: Avoiding contradictions and maintaining logical consistency
- logical-cohesiveness: Claims actively support each other in a directed way
- scientific-explanatory: Explanations align with natural law and scientific mechanisms
- thematic-psychological: Mood, imagery, emotional trajectory hold together
- instructional: Provides actionable instructions or directives
- motivational: Aims to inspire specific feelings or psychological states
- mathematical: Mathematical proofs, derivations, or quantitative arguments
- philosophical: Conceptual rigor, distinctions, and philosophical arguments

TEXT:
${text.substring(0, 2000)}

Respond with ONLY the coherence type (e.g., "logical-consistency"). No explanation.`;

        const detectMessage = await anthropic.messages.create({
          model: "claude-3-7-sonnet-20250219",
          max_tokens: 50,
          temperature: 0,
          messages: [{ role: "user", content: detectPrompt }]
        });

        const detectedType = detectMessage.content[0].type === 'text' 
          ? detectMessage.content[0].text.trim().toLowerCase() 
          : 'logical-consistency';
        
        const validTypes = ["logical-consistency", "logical-cohesiveness", "scientific-explanatory", "thematic-psychological", "instructional", "motivational", "mathematical", "philosophical"];
        appliedCoherenceType = validTypes.includes(detectedType) ? detectedType : "logical-consistency";
        
        console.log(`Auto-detected coherence type for global analysis: ${appliedCoherenceType}`);
      }

      if (mode === "analyze") {
        const result = await analyzeGlobalCoherence(text, appliedCoherenceType);
        
        res.json({
          success: true,
          isGlobalCoherence: true,
          globalContextObject: result.globalContextObject,
          chunkResults: result.chunkResults,
          analysis: result.aggregatedAnalysis,
          score: result.overallScore,
          assessment: result.overallAssessment,
          detectedCoherenceType: coherenceType === "auto-detect" ? appliedCoherenceType : undefined,
          wasAutoDetected: coherenceType === "auto-detect"
        });
      } else if (mode === "rewrite") {
        // Pass resume options if provided
        const resumeOptions = documentId && resumeFromChunk !== undefined ? {
          documentId,
          resumeFromChunk,
          globalState,
          existingChunks
        } : undefined;
        
        const result = await rewriteWithGlobalCoherence(
          text, 
          appliedCoherenceType, 
          aggressiveness as "conservative" | "moderate" | "aggressive",
          resumeOptions
        );
        
        res.json({
          success: true,
          isGlobalCoherence: true,
          rewrite: result.rewrittenText,
          globalContextObject: result.gco,
          changes: result.changes,
          detectedCoherenceType: coherenceType === "auto-detect" ? appliedCoherenceType : undefined,
          wasAutoDetected: coherenceType === "auto-detect"
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Mode must be 'analyze' or 'rewrite'"
        });
      }
    } catch (error: any) {
      console.error("Global Coherence error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Global coherence analysis failed"
      });
    }
  });

  // Outline-Guided Coherence Processing - Two-Stage approach for long texts
  app.post("/api/coherence-outline-guided", async (req: Request, res: Response) => {
    try {
      const { text, coherenceType, mode, aggressiveness = "moderate", onProgress } = req.body;

      if (!text || !coherenceType || !mode) {
        return res.status(400).json({
          success: false,
          message: "Text, coherenceType, and mode are required"
        });
      }

      console.log(`Outline-Guided Coherence - Type: ${coherenceType}, Mode: ${mode}, Text length: ${text.length}`);

      // Initialize Anthropic client
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });

      const coherenceDefinitions = {
        "logical-consistency": "Text contains no direct logical contradictions. Statements don't contradict each other.",
        "logical-cohesiveness": "Claims don't just avoid contradiction—they actively support each other in a directed way. Each statement builds on or follows from previous statements.",
        "scientific-explanatory": "Explanations align with natural law and known mechanisms. The account could plausibly be true given how the world actually works.",
        "thematic-psychological": "Mood, imagery, emotional trajectory, and psychological feel maintain consistency and flow naturally. The 'texture' of the writing holds together.",
        "instructional": "Sends a consistent, actionable message. The reader knows exactly what they are supposed to do. No contradictory directives.",
        "motivational": "User knows how they are supposed to feel. Emotional direction is clear and maintained throughout. Inspires consistent psychological state.",
        "mathematical": "Mathematical proofs are valid, derivations follow logically, formulas are correctly applied, and quantitative claims are properly supported.",
        "philosophical": "Conceptual rigor is maintained throughout. Terms are used consistently, distinctions are preserved, and arguments avoid category mistakes.",
        "auto-detect": "System analyzes the text and determines which type(s) of coherence it's attempting to achieve."
      };

      // ========== STAGE 1: GENERATE AND FIX OUTLINE ==========
      console.log("STAGE 1: Generating document outline...");
      
      const outlinePrompt = `You are creating a structural outline of a document for coherence analysis.

Generate a comprehensive outline under 450 words that captures:

1. MAIN THESIS OR CENTRAL ARGUMENT
   What is the document's primary claim or purpose?

2. SECTION STRUCTURE
   What are the major sections and what does each section argue/explain?

3. KEY CONCEPTS AND DEFINITIONS
   What important terms are used and how are they defined?

4. LOGICAL FLOW
   How does the argument progress from premises to conclusion?

5. CONCLUSIONS
   What are the final claims or implications?

Format as a clear hierarchical outline that captures the document's argumentative and conceptual structure.

DOCUMENT:
${text}

OUTLINE:`;

      const outlineMessage = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 2000,
        temperature: 0.7,
        system: "You are a document analyst who creates precise structural outlines.",
        messages: [{ role: "user", content: outlinePrompt }]
      });

      const outline = outlineMessage.content[0].type === 'text' ? outlineMessage.content[0].text : '';
      console.log("Outline generated, length:", outline.length);

      // Analyze outline coherence
      console.log("STAGE 1: Analyzing outline coherence...");
      
      const outlineAnalysisPrompt = `Analyze this document outline for ${coherenceType} coherence.

COHERENCE TYPE: ${coherenceType}
DEFINITION: ${coherenceDefinitions[coherenceType as keyof typeof coherenceDefinitions]}

OUTLINE TO ANALYZE:
${outline}

Provide a score (1-10) and brief assessment. Format: SCORE: X/10

ANALYSIS:`;

      const analysisMessage = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 1000,
        temperature: 0.5,
        system: "You are a coherence analyzer.",
        messages: [{ role: "user", content: outlineAnalysisPrompt }]
      });

      const outlineAnalysis = analysisMessage.content[0].type === 'text' ? analysisMessage.content[0].text : '';
      const scoreMatch = outlineAnalysis.match(/SCORE:\s*(\d+)\/10/i);
      const outlineScore = scoreMatch ? parseInt(scoreMatch[1]) : 7;

      console.log(`Outline score: ${outlineScore}/10`);

      // Fix outline if score < 8
      let coherentOutline = outline;
      if (outlineScore < 8) {
        console.log("STAGE 1: Outline score too low, rewriting for coherence...");
        
        const outlineRewritePrompt = `Rewrite this document outline to maximize ${coherenceType} coherence.

COHERENCE TYPE: ${coherenceType}
DEFINITION: ${coherenceDefinitions[coherenceType as keyof typeof coherenceDefinitions]}

ORIGINAL OUTLINE:
${outline}

CURRENT ISSUES:
${outlineAnalysis}

Rewrite the outline to fix these coherence issues. Maintain the same general content but restructure for maximum coherence. Keep under 450 words.

REWRITTEN OUTLINE:`;

        const rewriteMessage = await anthropic.messages.create({
          model: "claude-3-7-sonnet-20250219",
          max_tokens: 2000,
          temperature: 0.7,
          system: "You are a document restructuring expert.",
          messages: [{ role: "user", content: outlineRewritePrompt }]
        });

        coherentOutline = rewriteMessage.content[0].type === 'text' ? rewriteMessage.content[0].text : outline;
        console.log("Outline rewritten for coherence");
      }

      // ========== STAGE 2: PROCESS SECTIONS WITH OUTLINE CONTEXT ==========
      console.log("STAGE 2: Splitting document into sections...");

      // Split text into sections (~400 words each)
      const sections = splitIntoSections(text, 400);
      console.log(`Document split into ${sections.length} sections`);

      if (mode === "analyze") {
        // Analyze each section with outline context
        let combinedAnalysis = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTLINE-GUIDED COHERENCE ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Original Length: ${text.split(/\s+/).length} words
Sections: ${sections.length}
Coherence Type: ${coherenceType}
Processing Mode: Outline-Guided (Two-Stage)

DOCUMENT OUTLINE:
${coherentOutline}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION-BY-SECTION ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        for (let i = 0; i < sections.length; i++) {
          console.log(`STAGE 2: Analyzing section ${i + 1}/${sections.length}...`);
          
          const sectionAnalysisPrompt = `Analyze this section for ${coherenceType} coherence in context of the overall document.

DOCUMENT OUTLINE (for context):
${coherentOutline}

SECTION ${i + 1} of ${sections.length}:
${sections[i].text}

Analyze how well this section maintains ${coherenceType} coherence both internally and in relation to the document outline.

Provide: Score (1-10), issues found, and how it fits the overall structure.`;

          const sectionMessage = await anthropic.messages.create({
            model: "claude-3-7-sonnet-20250219",
            max_tokens: 1500,
            temperature: 0.5,
            system: `You are analyzing section coherence in context of a larger document structure.`,
            messages: [{ role: "user", content: sectionAnalysisPrompt }]
          });

          const sectionAnalysis = sectionMessage.content[0].type === 'text' ? sectionMessage.content[0].text : '';
          combinedAnalysis += `\n━━━━ SECTION ${i + 1} ━━━━\n${sectionAnalysis}\n`;
        }

        res.json({
          success: true,
          analysis: combinedAnalysis,
          outline: coherentOutline
        });

      } else {
        // Rewrite each section with outline context
        let combinedRewrite = '';

        for (let i = 0; i < sections.length; i++) {
          console.log(`STAGE 2: Rewriting section ${i + 1}/${sections.length}...`);
          
          let aggressivenessInstructions = "";
          if (aggressiveness === "conservative") {
            aggressivenessInstructions = "Make minimal changes. Preserve original structure and wording as much as possible. Only fix critical coherence issues.";
          } else if (aggressiveness === "moderate") {
            aggressivenessInstructions = "Fix major coherence issues and add necessary context. Moderate restructuring allowed if needed.";
          } else {
            aggressivenessInstructions = "Maximize coherence score (target 9-10/10). Extensive restructuring, expansion, and context addition encouraged.";
          }

          const sectionRewritePrompt = `Rewrite this section to maximize ${coherenceType} coherence while maintaining consistency with the overall document structure.

DOCUMENT OUTLINE (maintain consistency with this):
${coherentOutline}

POSITION IN DOCUMENT:
- Section ${i + 1} of ${sections.length}

COHERENCE TYPE: ${coherenceType}
DEFINITION: ${coherenceDefinitions[coherenceType as keyof typeof coherenceDefinitions]}

AGGRESSIVENESS: ${aggressiveness}
${aggressivenessInstructions}

SECTION TO REWRITE:
${sections[i].text}

Provide ONLY the rewritten section. Do not include any explanations, descriptions, or commentary about the changes - just the rewritten text itself.`;

          const rewriteMessage = await anthropic.messages.create({
            model: "claude-3-7-sonnet-20250219",
            max_tokens: 3000,
            temperature: 0.7,
            system: `You are rewriting sections for maximum coherence while maintaining document-level consistency. Output ONLY the rewritten text with no explanations.`,
            messages: [{ role: "user", content: sectionRewritePrompt }]
          });

          const output = rewriteMessage.content[0].type === 'text' ? rewriteMessage.content[0].text : '';
          
          // Use the output directly as the rewrite (no parsing needed)
          combinedRewrite += `${output.trim()}\n\n`;
        }

        res.json({
          success: true,
          rewrite: combinedRewrite.trim()
        });
      }

    } catch (error: any) {
      console.error("Outline-Guided Coherence error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Outline-guided processing failed"
      });
    }
  });

  // Database-backed Sequential Coherence Processing
  app.post("/api/coherence-sequential", async (req: Request, res: Response) => {
    try {
      const { text, mode, provider = "openai" } = req.body;

      if (!text) {
        return res.status(400).json({
          success: false,
          message: "Text is required"
        });
      }

      const wordCount = text.trim().split(/\s+/).length;
      console.log(`Sequential Coherence - Mode: ${mode || 'auto-detect'}, Provider: ${provider}, Words: ${wordCount}`);

      const { processDocumentSequentially } = await import('./services/coherenceProcessor');

      const result = await processDocumentSequentially(text, mode, provider);

      res.json({
        success: true,
        documentId: result.documentId,
        mode: result.mode,
        overallStatus: result.overallStatus,
        chunks: result.chunks,
        finalState: result.finalState,
        summary: result.summary
      });
    } catch (error: any) {
      console.error("Sequential Coherence error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Sequential coherence processing failed"
      });
    }
  });

  // Get coherence document status
  app.get("/api/coherence-sequential/:documentId/:mode", async (req: Request, res: Response) => {
    try {
      const { documentId, mode } = req.params;

      const { getDocumentStatus } = await import('./services/coherenceProcessor');

      const status = await getDocumentStatus(documentId, mode as any);

      res.json({
        success: true,
        documentId,
        mode,
        state: status.state,
        chunks: status.chunks
      });
    } catch (error: any) {
      console.error("Get coherence status error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get coherence status"
      });
    }
  });

  // Helper function to split text into sections
  function splitIntoSections(text: string, targetWords: number = 400): Array<{text: string, wordCount: number}> {
    const paragraphs = text.split(/\n\n+/);
    const sections: Array<{text: string, wordCount: number}> = [];
    let currentSection: string[] = [];
    let currentWordCount = 0;

    for (const paragraph of paragraphs) {
      const paraWords = paragraph.trim().split(/\s+/).length;
      
      if (currentWordCount + paraWords > targetWords && currentSection.length > 0) {
        sections.push({
          text: currentSection.join('\n\n'),
          wordCount: currentWordCount
        });
        currentSection = [];
        currentWordCount = 0;
      }
      
      currentSection.push(paragraph);
      currentWordCount += paraWords;
    }

    if (currentSection.length > 0) {
      sections.push({
        text: currentSection.join('\n\n'),
        wordCount: currentWordCount
      });
    }

    return sections;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL PIPELINE CROSS-CHUNK COHERENCE (FPCC) ROUTES
  // 4-Stage Pipeline: Reconstruction → Objections → Responses → Bullet-proof
  // ═══════════════════════════════════════════════════════════════════════════

  // Start a new pipeline job (synchronous: waits for job creation before responding)
  app.post("/api/pipeline/start", async (req: Request, res: Response) => {
    try {
      const { text, customInstructions, targetAudience, objective } = req.body;

      if (!text) {
        return res.status(400).json({ success: false, message: "Text is required" });
      }

      const wordCount = text.trim().split(/\s+/).filter((w: string) => w).length;
      if (wordCount < 100) {
        return res.status(400).json({ success: false, message: "Text must be at least 100 words" });
      }

      const { pipelineJobs } = await import('@shared/schema');
      const { db } = await import('./db');
      const { runFullPipeline } = await import('./services/pipelineOrchestrator');

      const userId = req.isAuthenticated() && req.user ? req.user.id : undefined;

      // Create job first to get the ID
      const [job] = await db.insert(pipelineJobs).values({
        userId,
        originalText: text,
        originalWordCount: wordCount,
        customInstructions,
        targetAudience,
        objective,
        status: 'running',
        currentStage: 1,
        stageStatus: 'pending'
      }).returning();

      res.json({
        success: true,
        message: "Pipeline started. Use the job ID to poll for status.",
        jobId: job.id,
        wordCount,
        started: true
      });

      // Run pipeline in background with the pre-created job ID
      runFullPipeline(text, { customInstructions, targetAudience, objective }, userId, undefined, job.id)
        .then(result => {
          console.log(`[Pipeline API] Job ${job.id} completed: ${result.success ? 'success' : 'failed'}`);
        })
        .catch(error => {
          console.error(`[Pipeline API] Job ${job.id} failed:`, error);
        });

    } catch (error: any) {
      console.error("[Pipeline API] Start error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Start pipeline with immediate job ID return
  app.post("/api/pipeline/create", async (req: Request, res: Response) => {
    try {
      const { text, customInstructions, targetAudience, objective } = req.body;

      if (!text) {
        return res.status(400).json({ success: false, message: "Text is required" });
      }

      const wordCount = text.trim().split(/\s+/).filter((w: string) => w).length;
      if (wordCount < 100) {
        return res.status(400).json({ success: false, message: "Text must be at least 100 words" });
      }

      const { pipelineJobs } = await import('@shared/schema');
      const { db } = await import('./db');

      const userId = req.isAuthenticated() && req.user ? req.user.id : undefined;

      const [job] = await db.insert(pipelineJobs).values({
        userId,
        originalText: text,
        originalWordCount: wordCount,
        customInstructions,
        targetAudience,
        objective,
        status: 'pending',
        currentStage: 1,
        stageStatus: 'pending'
      }).returning();

      res.json({
        success: true,
        jobId: job.id,
        wordCount,
        message: "Pipeline job created. Call /api/pipeline/run/:jobId to start processing."
      });

    } catch (error: any) {
      console.error("[Pipeline API] Create error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Run a created pipeline job
  app.post("/api/pipeline/run/:jobId", async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);

      const { pipelineJobs } = await import('@shared/schema');
      const { db } = await import('./db');
      const { eq } = await import('drizzle-orm');

      const [job] = await db.select().from(pipelineJobs).where(eq(pipelineJobs.id, jobId));

      if (!job) {
        return res.status(404).json({ success: false, message: "Job not found" });
      }

      if (job.status !== 'pending') {
        return res.status(400).json({ success: false, message: `Job is already ${job.status}` });
      }

      const { runFullPipeline } = await import('./services/pipelineOrchestrator');

      await db.update(pipelineJobs).set({ status: 'running' }).where(eq(pipelineJobs.id, jobId));

      res.json({
        success: true,
        jobId,
        message: "Pipeline job started. Poll /api/pipeline/status/:jobId for progress."
      });

      runFullPipeline(
        job.originalText,
        {
          customInstructions: job.customInstructions || undefined,
          targetAudience: job.targetAudience || undefined,
          objective: job.objective || undefined
        },
        job.userId || undefined,
        undefined,
        jobId // Pass existing job ID
      ).then(result => {
        console.log(`[Pipeline API] Job ${jobId} completed: ${result.success ? 'success' : 'failed'}`);
      }).catch(error => {
        console.error(`[Pipeline API] Job ${jobId} error:`, error);
      });

    } catch (error: any) {
      console.error("[Pipeline API] Run error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get pipeline job status
  app.get("/api/pipeline/status/:jobId", async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);

      const { getPipelineStatus, getPipelineObjections } = await import('./services/pipelineOrchestrator');

      const job = await getPipelineStatus(jobId);

      if (!job) {
        return res.status(404).json({ success: false, message: "Job not found" });
      }

      const objections = await getPipelineObjections(jobId);

      res.json({
        success: true,
        job: {
          id: job.id,
          status: job.status,
          currentStage: job.currentStage,
          stageStatus: job.stageStatus,
          wordCounts: {
            original: job.originalWordCount,
            reconstruction: job.reconstructionWords,
            objections: job.objectionsWords,
            responses: job.responsesWords,
            bulletproof: job.bulletproofWords
          },
          timing: {
            stage1Start: job.stage1StartTime,
            stage1End: job.stage1EndTime,
            stage2Start: job.stage2StartTime,
            stage2End: job.stage2EndTime,
            stage3Start: job.stage3StartTime,
            stage3End: job.stage3EndTime,
            stage4Start: job.stage4StartTime,
            stage4End: job.stage4EndTime,
            hcCheck: job.hcCheckTime
          },
          hcResults: job.hcCheckResults,
          hcViolations: job.hcViolations,
          errorMessage: job.errorMessage
        },
        objections: objections.map(o => ({
          index: o.objectionIndex,
          type: o.objectionType,
          severity: o.severity,
          claimTargeted: o.claimTargeted,
          hasResponse: !!o.initialResponse,
          hasEnhancedResponse: !!o.enhancedResponse,
          integrated: o.integrationVerified
        }))
      });

    } catch (error: any) {
      console.error("[Pipeline API] Status error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get pipeline outputs
  app.get("/api/pipeline/outputs/:jobId", async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);

      const { getPipelineStatus, getPipelineObjections } = await import('./services/pipelineOrchestrator');

      const job = await getPipelineStatus(jobId);

      if (!job) {
        return res.status(404).json({ success: false, message: "Job not found" });
      }

      const objections = await getPipelineObjections(jobId);

      res.json({
        success: true,
        reconstruction: job.reconstructionOutput,
        objections: job.objectionsOutput,
        responses: job.responsesOutput,
        bulletproof: job.bulletproofOutput,
        objectionsDetail: objections.map(o => ({
          index: o.objectionIndex,
          claimTargeted: o.claimTargeted,
          claimLocation: o.claimLocation,
          type: o.objectionType,
          severity: o.severity,
          objection: o.objectionText,
          initialResponse: o.initialResponse,
          enhancedResponse: o.enhancedResponse,
          integratedIn: o.integratedInSection,
          integrationStrategy: o.integrationStrategy
        })),
        hcCheck: job.hcCheckResults,
        skeleton1: job.skeleton1,
        skeleton2: job.skeleton2,
        skeleton3: job.skeleton3,
        skeleton4: job.skeleton4
      });

    } catch (error: any) {
      console.error("[Pipeline API] Outputs error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Resume a paused/failed pipeline
  app.post("/api/pipeline/resume/:jobId", async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);

      const { resumePipeline } = await import('./services/pipelineOrchestrator');

      const result = await resumePipeline(jobId);

      res.json({
        success: result.success,
        message: result.success ? "Pipeline resumed" : result.error
      });

    } catch (error: any) {
      console.error("[Pipeline API] Resume error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // List pipeline jobs for current user
  app.get("/api/pipeline/list", async (req: Request, res: Response) => {
    try {
      const { pipelineJobs } = await import('@shared/schema');
      const { db } = await import('./db');
      const { eq, desc } = await import('drizzle-orm');

      let jobs;
      if (req.isAuthenticated() && req.user) {
        jobs = await db.select({
          id: pipelineJobs.id,
          status: pipelineJobs.status,
          currentStage: pipelineJobs.currentStage,
          originalWordCount: pipelineJobs.originalWordCount,
          createdAt: pipelineJobs.createdAt
        })
        .from(pipelineJobs)
        .where(eq(pipelineJobs.userId, req.user.id))
        .orderBy(desc(pipelineJobs.createdAt))
        .limit(20);
      } else {
        jobs = await db.select({
          id: pipelineJobs.id,
          status: pipelineJobs.status,
          currentStage: pipelineJobs.currentStage,
          originalWordCount: pipelineJobs.originalWordCount,
          createdAt: pipelineJobs.createdAt
        })
        .from(pipelineJobs)
        .orderBy(desc(pipelineJobs.createdAt))
        .limit(10);
      }

      res.json({
        success: true,
        jobs
      });

    } catch (error: any) {
      console.error("[Pipeline API] List error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Test Strict Outline Generator API
  app.post("/api/generate-strict-outline", async (req: Request, res: Response) => {
    try {
      const { prompt, inputText, provider = "openai" } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ success: false, message: "Prompt is required" });
      }
      
      console.log(`[Outline Generator] Starting outline generation with ${provider}...`);
      
      const systemPrompt = `You are a strict outline generator. Analyze the task and input text to create a detailed, hierarchical outline.

TASK: ${prompt}

${inputText ? `SOURCE TEXT TO ANALYZE:\n${inputText.substring(0, 50000)}` : ''}

Generate a strict outline with:
1. Main sections (I, II, III, etc.)
2. Subsections (A, B, C)
3. Key points (1, 2, 3)
4. Claims to address
5. Structural requirements
6. Key terms and definitions

Output a well-structured outline that can guide document generation.`;

      let output = "";
      
      if (provider === "anthropic") {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic();
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          messages: [
            { role: "user", content: `${systemPrompt}\n\nGenerate the strict outline now.` }
          ]
        });
        output = response.content[0].type === 'text' ? response.content[0].text : "";
      } else if (provider === "deepseek") {
        const openaiDeepseek = new OpenAI({ 
          apiKey: process.env.DEEPSEEK_API_KEY,
          baseURL: "https://api.deepseek.com/v1"
        });
        const response = await openaiDeepseek.chat.completions.create({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Generate the strict outline now." }
          ],
          temperature: 0.3,
          max_tokens: 4000
        });
        output = response.choices[0].message.content || "";
      } else {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Generate the strict outline now." }
          ],
          temperature: 0.3,
          max_tokens: 4000
        });
        output = response.choices[0].message.content || "";
      }
      
      console.log("[Outline Generator] Outline generated successfully");
      
      res.json({ success: true, output });
      
    } catch (error: any) {
      console.error("[Outline Generator] Error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Full Document Generator API
  app.post("/api/generate-full-document", async (req: Request, res: Response) => {
    try {
      const { prompt, inputText, provider = "openai" } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ success: false, message: "Prompt is required" });
      }
      
      console.log(`[Document Generator] Starting full document generation with ${provider}...`);
      
      const outlinePrompt = `Analyze this task and create a detailed structural outline. Task: ${prompt}\n\n${inputText ? `Source text: ${inputText.substring(0, 30000)}` : ''}`;
      
      const documentSystemPrompt = (outline: string) => `You are a professional document writer. Generate a complete, coherent document based on:

TASK: ${prompt}

OUTLINE:
${outline}

${inputText ? `SOURCE MATERIAL:\n${inputText.substring(0, 40000)}` : ''}

Write a complete, well-structured document. Ensure:
- Coherent flow between sections
- All key points are addressed
- Professional tone and clarity
- Proper paragraph structure`;

      let outline = "";
      let output = "";
      
      if (provider === "anthropic") {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic();
        
        // Generate outline
        const outlineRes = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: `${outlinePrompt}\n\nCreate a structured outline for the document.` }]
        });
        outline = outlineRes.content[0].type === 'text' ? outlineRes.content[0].text : "";
        
        // Generate full document
        const docRes = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8000,
          messages: [{ role: "user", content: `${documentSystemPrompt(outline)}\n\nGenerate the complete document now.` }]
        });
        output = docRes.content[0].type === 'text' ? docRes.content[0].text : "";
        
      } else if (provider === "deepseek") {
        const openaiDeepseek = new OpenAI({ 
          apiKey: process.env.DEEPSEEK_API_KEY,
          baseURL: "https://api.deepseek.com/v1"
        });
        
        // Generate outline
        const outlineRes = await openaiDeepseek.chat.completions.create({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: outlinePrompt },
            { role: "user", content: "Create a structured outline for the document." }
          ],
          temperature: 0.3,
          max_tokens: 2000
        });
        outline = outlineRes.choices[0].message.content || "";
        
        // Generate full document
        const docRes = await openaiDeepseek.chat.completions.create({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: documentSystemPrompt(outline) },
            { role: "user", content: "Generate the complete document now." }
          ],
          temperature: 0.4,
          max_tokens: 8000
        });
        output = docRes.choices[0].message.content || "";
        
      } else {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        
        // Generate outline
        const outlineRes = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: outlinePrompt },
            { role: "user", content: "Create a structured outline for the document." }
          ],
          temperature: 0.3,
          max_tokens: 2000
        });
        outline = outlineRes.choices[0].message.content || "";
        
        // Generate full document
        const docRes = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: documentSystemPrompt(outline) },
            { role: "user", content: "Generate the complete document now." }
          ],
          temperature: 0.4,
          max_tokens: 8000
        });
        output = docRes.choices[0].message.content || "";
      }
      
      console.log("[Document Generator] Document generated successfully");
      
      res.json({ success: true, output });
      
    } catch (error: any) {
      console.error("[Document Generator] Error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Screenplay Generator - Converts source material to properly formatted screenplay
  app.post("/api/screenplay-generator", async (req: Request, res: Response) => {
    try {
      const { text, targetWordCount, customInstructions } = req.body;

      if (!text) {
        return res.status(400).json({
          success: false,
          message: "Source text is required"
        });
      }

      const wordCount = text.trim().split(/\s+/).length;
      
      // Validate and sanitize target word count
      let validatedTargetWords = 20000;
      if (targetWordCount !== undefined && targetWordCount !== null) {
        const parsed = parseInt(targetWordCount);
        if (!isNaN(parsed) && parsed > 0) {
          validatedTargetWords = Math.min(parsed, 100000); // Cap at 100k words
        }
      }
      
      console.log(`[Screenplay Generator] Starting - Source: ${wordCount} words, Target: ${validatedTargetWords} words`);

      const { generateScreenplay } = await import('./services/screenplayGenerator');
      const result = await generateScreenplay(text, validatedTargetWords, customInstructions);

      res.json({
        success: true,
        screenplay: result.screenplay,
        wordCount: result.wordCount,
        structure: result.structure,
        processingTimeMs: result.processingTimeMs
      });

    } catch (error: any) {
      console.error("[Screenplay Generator] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Screenplay generation failed"
      });
    }
  });

  return app;
}