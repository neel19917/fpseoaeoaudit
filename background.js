/**
 * Background service worker for SEO & AEO Auditor.
 * Handles Claude API calls for audits.
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.3;

// Verbose logging utility
let verboseLoggingEnabled = false;

// Load verbose logging setting
chrome.storage.sync.get(['verboseLogging'], (result) => {
  verboseLoggingEnabled = result.verboseLogging || false;
  if (verboseLoggingEnabled) {
    console.log('[SEO Auditor] Verbose logging enabled');
  }
});

// Listen for changes to verbose logging setting
chrome.storage.onChanged.addListener((changes, area) => {
  if (changes.verboseLogging) {
    verboseLoggingEnabled = changes.verboseLogging.newValue || false;
    console.log('[SEO Auditor] Verbose logging', verboseLoggingEnabled ? 'enabled' : 'disabled');
  }
});

/**
 * Logs a message if verbose logging is enabled
 */
function vlog(...args) {
  if (verboseLoggingEnabled) {
    console.log('[SEO Auditor VERBOSE]', ...args);
  }
}

/**
 * Builds the prompt sent to Claude based on collected signals.
 */
function buildPrompt(signals) {
  const prompt = `Analyze this page for SEO and AEO (Answer Engine Optimization). Be concise, practical, and prioritize high-impact fixes.

URL: ${signals.url}
Title: ${signals.title || '(missing)'}
Meta Description: ${signals.metaDescription || '(missing)'}
Canonical: ${signals.canonical || '(none specified)'}
Robots: ${signals.robots || '(none specified)'}
Language: ${signals.lang || '(not specified)'}
Word Count (approx): ${signals.wordCount}

HEADINGS (H1-H6, showing top ${signals.headings.length}):
${signals.headings.map(h => `H${h.level}: ${h.text}`).join('\n')}

LINK COUNTS:
- Internal: ${signals.linkCounts?.internal || 0}
- External: ${signals.linkCounts?.external || 0}
- Total: ${signals.linkCounts?.total || 0}

TOP INTERNAL LINKS (examples):
${signals.internalLinks.map(l => `- ${l.text || '(no text)'} → ${l.href}`).join('\n')}

TOP EXTERNAL LINKS (examples):
${signals.externalLinks.map(l => `- ${l.text || '(no text)'} → ${l.href}`).join('\n')}

IMAGE STATS:
- Total images: ${signals.imageStats?.total || 0}
- With alt text: ${signals.imageStats?.withAlt || 0}
- Missing alt: ${signals.imageStats?.withoutAlt || 0}

${signals.imageStats?.missingAltExamples?.length > 0 ? `Examples missing alt:\n${signals.imageStats.missingAltExamples.map(img => `- ${img.src}`).join('\n')}` : ''}

STRUCTURED DATA TYPES FOUND:
${signals.structuredData.length > 0 ? signals.structuredData.map(sd => `- ${sd.type || 'unknown'}`).join('\n') : '(none found)'}
${signals.structuredData.length > 0 ? `\nFirst JSON-LD block (truncated):\n${signals.structuredData[0].raw}` : ''}

OPEN GRAPH TAGS:
${Object.keys(signals.ogTags).length > 0 ? Object.entries(signals.ogTags).map(([k, v]) => `${k}: ${v}`).join('\n') : '(none found)'}

TWITTER TAGS:
${Object.keys(signals.twitterTags).length > 0 ? Object.entries(signals.twitterTags).map(([k, v]) => `${k}: ${v}`).join('\n') : '(none found)'}

BODY TEXT SAMPLE (first ~3000 chars):
${signals.bodyTextSample || '(no text content found)'}

---

Provide your analysis in this structured format:

## TOP 5 PRIORITIZED FIXES
For each fix, provide:
1. Issue: [Brief description]
2. Why: [Why it matters for SEO/AEO]
3. How: [Specific actionable steps]

## FEATURED SNIPPET / AI OVERVIEW READINESS
- Can this page answer a question clearly? [Yes/No/Partial]
- Suggested canonical answer paragraph (if applicable): [2-3 sentences]
- Potential query intent matches: [List 2-3 search queries this page could answer]

## SCHEMA RECOMMENDATIONS
List recommended schema types with minimal JSON-LD examples. Focus on:
- Article/WebPage/Product/etc. as appropriate
- FAQPage if questions are present
- Organization/BreadcrumbList if relevant

## ON-PAGE SIGNAL FLAGS
List any critical missing elements or issues:
- Title length/quality
- Meta description length/quality
- Heading structure
- Internal linking opportunities
- Image optimization needs

## EEAT WINS
- Expertise signals present: [List them]
- Authoritativeness indicators: [List them]
- Trustworthiness markers: [List them]

## LIGHT TECHNICAL CHECKS
- Mobile-friendliness indicators (from markup)
- Page speed considerations (if observable)
- Core Web Vitals hints

## SCORES
- SEO Score (0-100): [Number]
- AEO Score (0-100): [Number]

Be concise but actionable. Prioritize fixes that will have the biggest impact.`;

  return prompt;
}

/**
 * Calls the Claude API with the given prompt.
 */
async function callClaudeAPI(apiKey, model, prompt) {
  // Ensure API key is trimmed and valid
  const cleanApiKey = apiKey.trim();
  
  if (!cleanApiKey || cleanApiKey.length < 20) {
    throw new Error('API key appears to be invalid (too short)');
  }

  console.log('[SEO Auditor] Calling Claude API with key length:', cleanApiKey.length, 'model:', model);
  vlog('Calling Claude API...');
  vlog('Model:', model);
  vlog('Prompt length:', prompt.length, 'characters');
  vlog('Max tokens:', DEFAULT_MAX_TOKENS);
  vlog('Temperature:', DEFAULT_TEMPERATURE);
  
  const startTime = Date.now();
  
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cleanApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      system: 'You are an expert SEO + AEO auditor. Be concise, practical, and prioritize high-impact fixes.',
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: prompt
        }]
      }],
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: DEFAULT_TEMPERATURE
    })
  });

  const elapsed = Date.now() - startTime;
  vlog('API response received in', elapsed, 'ms');
  vlog('Response status:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = 'API request failed';
    
    if (response.status === 401) {
      // Try to get more details from the error response
      let apiErrorDetail = '';
      try {
        const errorJson = JSON.parse(errorText);
        apiErrorDetail = errorJson.error?.message || '';
      } catch (e) {
        // Ignore parse errors
      }
      
      errorMessage = 'Invalid API key (401 Unauthorized).\n\nTroubleshooting steps:\n1. Open the options page (gear icon) and verify your API key is saved\n2. Check that the key starts with "sk-ant-" and has no extra spaces\n3. Copy your API key fresh from https://console.anthropic.com/\n4. Paste it in the options page and click "Save Settings"\n5. Make sure you\'re signed into the correct Anthropic account';
      
      if (apiErrorDetail) {
        errorMessage += `\n\nAPI error detail: ${apiErrorDetail}`;
      }
    } else if (response.status === 429) {
      errorMessage = 'Rate limit exceeded. Please try again later.';
    } else if (response.status >= 500) {
      errorMessage = 'Claude API server error. Please try again later.';
    } else {
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch (e) {
        errorMessage = `API error (${response.status}): ${errorText.substring(0, 100)}`;
      }
    }
    
    // Log error details (without exposing key)
    console.error('[SEO Auditor] API error:', response.status, errorMessage);
    
    throw new Error(errorMessage);
  }

  const data = await response.json();
  
  vlog('Response data:', {
    id: data.id,
    model: data.model,
    usage: data.usage,
    stop_reason: data.stop_reason
  });
  
  // Claude returns content in content[0].text format
  if (data.content && data.content[0] && data.content[0].text) {
    vlog('Analysis length:', data.content[0].text.length, 'characters');
    return data.content[0].text;
  }
  
  throw new Error('Unexpected API response format');
}

/**
 * Tests the API key with a simple API call.
 */
async function testAPIKey() {
  // Get API key from storage (try sync first, fallback to local)
  let result = await chrome.storage.sync.get(['apiKey', 'model']);
  
  // Fallback to local storage if sync is empty
  if (!result.apiKey) {
    result = await chrome.storage.local.get(['apiKey', 'model']);
  }
  
  let apiKey = result.apiKey;
  
  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      error: 'API key not found in storage. Please save it in the options page first.'
    };
  }
  
  apiKey = apiKey.trim();
  
  if (!apiKey.startsWith('sk-ant-')) {
    return {
      success: false,
      error: 'API key format appears incorrect. Expected to start with "sk-ant-".'
    };
  }
  
  try {
    // Make a minimal test API call
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: result.model || DEFAULT_MODEL,
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: 'Hi'
        }]
      })
    });
    
    if (response.ok) {
      return { success: true };
    } else if (response.status === 401) {
      const errorText = await response.text();
      let detail = '';
      try {
        const errorJson = JSON.parse(errorText);
        detail = errorJson.error?.message || '';
        // Check for CORS-related error messages
        if (detail.includes('CORS') || detail.includes('browser-access')) {
          detail = 'CORS issue detected. Make sure the extension background worker is properly loaded.';
        }
      } catch (e) {}
      return {
        success: false,
        error: `Invalid API key (401 Unauthorized). ${detail}`.trim()
      };
    } else {
      const errorText = await response.text();
      let errorDetail = '';
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.error?.message || '';
      } catch (e) {}
      return {
        success: false,
        error: `API returned status ${response.status}. ${errorDetail || 'Key format seems OK but API call failed.'}`.trim()
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to test API key: ${error.message}`
    };
  }
}

/**
 * Main message handler for background worker.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TEST_API_KEY') {
    // Run async test
    (async () => {
      const result = await testAPIKey();
      sendResponse(result);
    })();
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'RUN_AUDIT') {
    // Run async operation
    (async () => {
      try {
        // Get API key and model from storage (try sync first, fallback to local)
        let result = await chrome.storage.sync.get(['apiKey', 'model']);
        
        // Fallback to local storage if sync is empty
        if (!result.apiKey) {
          result = await chrome.storage.local.get(['apiKey', 'model']);
          if (result.apiKey) {
            console.log('[SEO Auditor] Using API key from local storage (sync unavailable)');
          }
        }
        
        let apiKey = result.apiKey;
        const model = result.model || DEFAULT_MODEL;

        if (!apiKey || apiKey.trim() === '') {
          sendResponse({
            success: false,
            error: 'API key not configured. Please set it in the options page.'
          });
          return;
        }

        // Trim whitespace from API key (in case it was accidentally saved with spaces)
        apiKey = apiKey.trim();

        // Log a safe version for debugging (never log full key)
        console.log('[SEO Auditor] API key found, length:', apiKey.length, 'prefix:', apiKey.substring(0, 7));
        
        // Validate key format
        if (!apiKey.startsWith('sk-ant-')) {
          sendResponse({
            success: false,
            error: 'API key format appears incorrect. Expected to start with "sk-ant-". Please check your API key in the options page.'
          });
          return;
        }

        // Get signals from the message
        const signals = message.signals;
        if (!signals) {
          sendResponse({
            success: false,
            error: 'No signals collected from page. Make sure you are on a valid HTML page.'
          });
          return;
        }

        // Build prompt and call API
        const prompt = buildPrompt(signals);
        const analysis = await callClaudeAPI(apiKey, model, prompt);

        sendResponse({
          success: true,
          analysis: analysis,
          signals: signals // Include signals for reference
        });

      } catch (error) {
        sendResponse({
          success: false,
          error: error.message || 'Unknown error occurred'
        });
      }
    })();

    // Return true to indicate async response
    return true;
  }
});

