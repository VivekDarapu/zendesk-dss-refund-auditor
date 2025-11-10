/* conversation-analyzer.js - LLM-based Conversation Analysis for Compliance Auditing */

// Conversation Analyzer Class
class ConversationAnalyzer {
  constructor(config) {
    this.config = config;
    this.primaryApi = config.llmApis.primary;
    this.fallbackApi = config.llmApis.fallback;
    this.retryConfig = config.errorHandling;
  }

  // Main entry point: Analyze conversation for compliance
  async analyzeCompliance(conversationText, dssDecision, auditContext) {
    const startTime = Date.now();
    
    try {
      // Try primary API (Google Gemini)
      console.log('Analyzing with primary API (Google Gemini)...');
      const result = await this.callPrimaryApi(conversationText, dssDecision, auditContext);
      result.duration = Date.now() - startTime;
      result.apiUsed = 'google_gemini';
      return result;
    } catch (primaryError) {
      console.error('Primary API failed:', primaryError);
      
      // Try fallback API (Hugging Face) if enabled
      if (this.retryConfig.fallbackOnPrimaryFailure) {
        try {
          console.log('Trying fallback API (Hugging Face)...');
          const result = await this.callFallbackApi(conversationText, dssDecision, auditContext);
          result.duration = Date.now() - startTime;
          result.apiUsed = 'huggingface';
          return result;
        } catch (fallbackError) {
          console.error('Fallback API also failed:', fallbackError);
          throw new Error('Both primary and fallback APIs failed');
        }
      } else {
        throw primaryError;
      }
    }
  }

  // Call Google Gemini API
  async callPrimaryApi(conversationText, dssDecision, auditContext) {
    const apiKey = this.primaryApi.apiKey;
    if (!apiKey) {
      throw new Error('Google Gemini API key not configured');
    }

    // Build prompt
    const prompt = this.buildCompliancePrompt(conversationText, dssDecision, auditContext);
    
    // Gemini API request format
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: this.primaryApi.temperature,
        maxOutputTokens: this.primaryApi.maxTokens
      }
    };

    // Make API call with retry logic
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await Promise.race([
          fetch(`${this.primaryApi.endpoint}?key=${apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), this.primaryApi.timeout)
          )
        ]);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        return this.parseGeminiResponse(data);
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        if (attempt < this.retryConfig.maxRetries) {
          await this.sleep(this.retryConfig.retryDelay * attempt);
        } else {
          throw error;
        }
      }
    }
  }

  // Call Hugging Face API (fallback)
  async callFallbackApi(conversationText, dssDecision, auditContext) {
    const apiKey = this.fallbackApi.apiKey;
    if (!apiKey) {
      throw new Error('Hugging Face API key not configured');
    }

    // Build prompt
    const prompt = this.buildCompliancePrompt(conversationText, dssDecision, auditContext);
    
    // Hugging Face API request format
    const requestBody = {
      inputs: prompt,
      parameters: {
        temperature: this.fallbackApi.temperature,
        max_new_tokens: this.fallbackApi.maxTokens,
        return_full_text: false
      }
    };

    // Make API call with retry logic
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await Promise.race([
          fetch(this.fallbackApi.endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), this.fallbackApi.timeout)
          )
        ]);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Hugging Face API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        return this.parseHuggingFaceResponse(data);
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        if (attempt < this.retryConfig.maxRetries) {
          await this.sleep(this.retryConfig.retryDelay * attempt);
        } else {
          throw error;
        }
      }
    }
  }

  // Build compliance analysis prompt
  buildCompliancePrompt(conversationText, dssDecision, auditContext) {
    const template = this.config.analysisPrompts.complianceCheck;
    
    return template
      .replace('{dssDecision}', dssDecision || 'Not specified')
      .replace('{refundAmount}', auditContext.refundAmount || 'Unknown')
      .replace('{reason}', auditContext.reason || 'Not provided')
      .replace('{conversation}', conversationText);
  }

  // Build conversation summary prompt
  buildSummaryPrompt(conversationText) {
    const template = this.config.analysisPrompts.conversationSummary;
    return template.replace('{conversation}', conversationText);
  }

  // Parse Gemini API response
  parseGeminiResponse(data) {
    try {
      // Extract text from Gemini response structure
      const text = data.candidates[0].content.parts[0].text;
      
      // Try to parse as JSON (if LLM returned JSON format)
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            status: parsed.status || 'UNKNOWN',
            explanation: parsed.explanation || text,
            evidence: parsed.evidence || '',
            rawResponse: text
          };
        }
      } catch (jsonError) {
        // If not JSON, parse as text
      }
      
      // Fallback: Extract compliance status from text
      const status = this.extractComplianceStatus(text);
      return {
        status: status,
        explanation: text,
        evidence: '',
        rawResponse: text
      };
    } catch (error) {
      console.error('Error parsing Gemini response:', error);
      throw new Error('Failed to parse Gemini response');
    }
  }

  // Parse Hugging Face API response
  parseHuggingFaceResponse(data) {
    try {
      // Hugging Face returns array of generated text
      const text = data[0].generated_text;
      
      // Try to parse as JSON
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            status: parsed.status || 'UNKNOWN',
            explanation: parsed.explanation || text,
            evidence: parsed.evidence || '',
            rawResponse: text
          };
        }
      } catch (jsonError) {
        // If not JSON, parse as text
      }
      
      // Fallback: Extract compliance status from text
      const status = this.extractComplianceStatus(text);
      return {
        status: status,
        explanation: text,
        evidence: '',
        rawResponse: text
      };
    } catch (error) {
      console.error('Error parsing Hugging Face response:', error);
      throw new Error('Failed to parse Hugging Face response');
    }
  }

  // Extract compliance status from text response
  extractComplianceStatus(text) {
    const upperText = text.toUpperCase();
    
    // Look for explicit status indicators
    if (upperText.includes('STATUS') && upperText.includes('COMPLIANT')) {
      if (upperText.includes('NON-COMPLIANT') || upperText.includes('NOT COMPLIANT')) {
        return 'NON-COMPLIANT';
      } else {
        return 'COMPLIANT';
      }
    }
    
    // Look for direct mentions
    if (upperText.includes('NON-COMPLIANT') || upperText.includes('NOT COMPLIANT')) {
      return 'NON-COMPLIANT';
    }
    if (upperText.includes('COMPLIANT')) {
      return 'COMPLIANT';
    }
    
    // Look for negative indicators
    if (upperText.includes('VIOLATION') || upperText.includes('INCORRECT') || 
        upperText.includes('DOES NOT MATCH') || upperText.includes('FAILED')) {
      return 'NON-COMPLIANT';
    }
    
    // Look for positive indicators
    if (upperText.includes('CORRECT') || upperText.includes('MATCHES') || 
        upperText.includes('APPROPRIATE') || upperText.includes('PASSED')) {
      return 'COMPLIANT';
    }
    
    // Default to unknown if can't determine
    return 'UNKNOWN';
  }

  // Get conversation summary
  async getSummary(conversationText) {
    try {
      const prompt = this.buildSummaryPrompt(conversationText);
      
      // Use primary API for summary
      const apiKey = this.primaryApi.apiKey;
      const requestBody = {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 256
        }
      };

      const response = await fetch(`${this.primaryApi.endpoint}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        return 'Summary unavailable';
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error('Error getting summary:', error);
      return 'Summary generation failed';
    }
  }

  // Utility: Sleep function for retry delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ConversationAnalyzer };
}
