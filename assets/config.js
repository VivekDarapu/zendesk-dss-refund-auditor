/* config.js - Configuration for Auto-Trigger Refund Auditor */

// ⚠️ SECURITY WARNING: Never commit real API keys to Git!
// This file shows the structure. Use environment variables or secure storage in production.

const CONFIG = {
  // Tag trigger configuration
  triggers: {
    tagPattern: /refund/i, // Case-insensitive match for "refund" in tags
    autoRun: true // Enable automatic audit execution
  },

  // LLM API Configuration (Primary: Google Gemini, Fallback: Hugging Face)
  llmApis: {
    primary: {
      provider: 'google_gemini',
      apiKey: '', // Set via environment variable: GOOGLE_GEMINI_API_KEY
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      model: 'gemini-pro',
      maxTokens: 2048,
      temperature: 0.1, // Low temperature for consistent compliance analysis
      timeout: 30000 // 30 second timeout
    },
    fallback: {
      provider: 'huggingface',
      apiKey: '', // Set via environment variable: HUGGINGFACE_API_KEY
      endpoint: 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
      maxTokens: 2048,
      temperature: 0.1,
      timeout: 30000
    }
  },

  // Google Sheets Configuration
  googleSheets: {
    spreadsheetId: '1xG_fPoVsWBVwDCaDzhlyTtsqD0O7oS2qtIwMfy4IdeQ',
    sheetName: 'Refund Audits',
    apiEndpoint: 'https://sheets.googleapis.com/v4/spreadsheets',
    // Service account credentials (use secure storage)
    serviceAccountEmail: '', // Set via environment variable
    serviceAccountKey: '', // Set via environment variable (JSON key file)
    columns: [
      'Timestamp',
      'Ticket ID',
      'Tag Added',
      'Customer Name',
      'Order ID',
      'Product Type',
      'Reason Category',
      'Refund Amount',
      'DSS Decision',
      'Conversation Summary',
      'Compliance Status',
      'Compliance Details',
      'Agent Name',
      'Audit Duration (ms)'
    ]
  },

  // Conversation analysis prompts
  analysisPrompts: {
    complianceCheck: `You are a refund compliance auditor. Analyze this support ticket conversation and determine if the refund decision was compliant with the provided DSS decision.

DSS Decision: {dssDecision}
Refund Amount: {refundAmount}
Customer Reason: {reason}

Conversation:
{conversation}

Provide:
1. COMPLIANT or NON-COMPLIANT
2. Brief explanation (2-3 sentences)
3. Key evidence from conversation

Format your response as JSON:
{
  "status": "COMPLIANT" or "NON-COMPLIANT",
  "explanation": "...",
  "evidence": "..."
}`,
    
    conversationSummary: `Summarize this support ticket conversation in 2-3 sentences, focusing on:
- Customer's issue/complaint
- Agent's response and resolution
- Any commitments made

Conversation:
{conversation}`
  },

  // Error handling
  errorHandling: {
    maxRetries: 3,
    retryDelay: 2000, // 2 seconds
    fallbackOnPrimaryFailure: true,
    logErrors: true
  },

  // Performance settings
  performance: {
    cacheConversations: true,
    cacheDuration: 300000, // 5 minutes
    batchSheetWrites: false // Write immediately for real-time updates
  }
};

// Environment variable loader (for Zendesk secure settings)
function loadConfig() {
  const config = { ...CONFIG };
  
  // Try to load from Zendesk secure settings
  if (typeof client !== 'undefined') {
    return client.metadata().then(metadata => {
      config.llmApis.primary.apiKey = metadata.settings.googleGeminiApiKey || '';
      config.llmApis.fallback.apiKey = metadata.settings.huggingfaceApiKey || '';
      config.googleSheets.serviceAccountEmail = metadata.settings.serviceAccountEmail || '';
      config.googleSheets.serviceAccountKey = metadata.settings.serviceAccountKey || '';
      return config;
    });
  }
  
  return Promise.resolve(config);
}

// Validate configuration
function validateConfig(config) {
  const errors = [];
  
  if (!config.llmApis.primary.apiKey) {
    errors.push('Missing Google Gemini API key');
  }
  
  if (!config.llmApis.fallback.apiKey) {
    errors.push('Missing Hugging Face API key');
  }
  
  if (!config.googleSheets.serviceAccountEmail || !config.googleSheets.serviceAccountKey) {
    errors.push('Missing Google Sheets service account credentials');
  }
  
  if (errors.length > 0) {
    console.error('Configuration errors:', errors);
    return { valid: false, errors };
  }
  
  return { valid: true, errors: [] };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, loadConfig, validateConfig };
}
