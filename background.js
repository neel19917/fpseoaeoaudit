/**
 * Background service worker for SEO & AEO Auditor.
 * Handles Claude API calls for audits.
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_MAX_TOKENS = 16000; // Increased for comprehensive audits
const DEFAULT_TEMPERATURE = 0.5;

// Verbose logging utility
let verboseLoggingEnabled = false;

// Audit state tracking
const auditStates = new Map(); // tabId -> { status, startTime, url, error }

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
 * Enhanced error logging with context
 */
function logError(context, error, additionalInfo = {}) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    context,
    message: error.message || error,
    stack: error.stack,
    ...additionalInfo
  };
  
  console.error(`[SEO Auditor ERROR] ${context}:`, errorLog);
  
  // Store last error for debugging
  chrome.storage.local.set({ 
    lastError: errorLog,
    lastErrorTime: Date.now()
  }).catch(e => console.error('[SEO Auditor] Failed to store error:', e));
  
  return errorLog;
}

/**
 * Updates badge to show audit status
 */
function updateBadge(tabId, status, text = '') {
  try {
    const colors = {
      running: '#4CAF50',
      error: '#F44336',
      complete: '#2196F3',
      idle: '#9E9E9E'
    };
    
    chrome.action.setBadgeBackgroundColor({ 
      color: colors[status] || colors.idle,
      tabId 
    });
    
    chrome.action.setBadgeText({ 
      text: text,
      tabId 
    });
    
    vlog(`Badge updated for tab ${tabId}: ${status} - ${text}`);
  } catch (error) {
    logError('updateBadge', error, { tabId, status, text });
  }
}

/**
 * Sets audit state for a tab
 */
function setAuditState(tabId, status, additionalData = {}) {
  try {
    const state = {
      status,
      timestamp: Date.now(),
      ...additionalData
    };
    
    auditStates.set(tabId, state);
    
    // Update badge based on status
    const badgeText = {
      running: '⏳',
      complete: '✓',
      error: '✗',
      idle: ''
    };
    
    updateBadge(tabId, status, badgeText[status] || '');
    
    // Store state in chrome.storage for persistence
    chrome.storage.local.set({
      [`auditState_${tabId}`]: state
    }).catch(e => logError('setAuditState storage', e, { tabId }));
    
    console.log(`[SEO Auditor] Tab ${tabId} state: ${status}`, additionalData);
    vlog('Audit state updated:', state);
    
  } catch (error) {
    logError('setAuditState', error, { tabId, status, additionalData });
  }
}

/**
 * Gets audit state for a tab
 */
async function getAuditState(tabId) {
  try {
    // Try memory first
    if (auditStates.has(tabId)) {
      return auditStates.get(tabId);
    }
    
    // Fall back to storage
    const result = await chrome.storage.local.get([`auditState_${tabId}`]);
    const state = result[`auditState_${tabId}`];
    
    if (state) {
      auditStates.set(tabId, state);
    }
    
    return state || { status: 'idle' };
  } catch (error) {
    logError('getAuditState', error, { tabId });
    return { status: 'idle' };
  }
}

/**
 * Builds the prompt sent to Claude based on collected signals.
 * OPTIMIZED: Reduced from 560+ lines to ~150 lines for faster processing
 */
function buildPrompt(signals) {
  const prompt = `You are a world-class SEO/AEO consultant conducting a comprehensive audit. 

INSTRUCTIONS:
1. Think deeply and analytically about each aspect before providing recommendations
2. Consider multiple perspectives and edge cases
3. Reason through your recommendations step-by-step
4. Provide highly actionable, specific recommendations with implementation details
5. Go beyond surface-level analysis - dig into the WHY behind each issue
6. Connect different SEO factors to show how they impact each other
7. Consider the broader context of the website and industry
8. Think about user behavior and search intent throughout your analysis

Take your time to analyze thoroughly. Quality and depth are more important than speed.

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

OUTPUT FORMAT (REQUIRED):

## CRITICAL ISSUES (3-5 items)
For each issue:
- [ ] **Issue**: [Name] | **Impact**: [SEO/AEO impact] | **Fix**: [Specific steps with code if needed]
- **Reasoning**: [Why critical and expected improvement]

(Repeat for 3-5 critical issues)

## TOP 10 RECOMMENDATIONS (Prioritized)
For each:
- [ ] **Rec #N**: [Title] | **Priority**: CRITICAL/HIGH/MEDIUM | **Effort**: [time]
  - **Analysis**: [Why this matters, data points, connections to other issues]
  - **Steps**: [1] [specific action] [2] [next action] [3] [verification]
  - **Impact**: [Expected improvement with metrics]

(Include all 10 with deep reasoning)

## TITLE & META OPTIMIZATION
**Current Analysis**: [Title and meta strengths/weaknesses, keyword placement, CTR potential]

### Title Options (Pick Best):
- [ ] **Option 1**: [Optimized title] - Reasoning: [Why it works] - CTR Impact: [%]
- [ ] **Option 2**: [Alternative] - Reasoning: [Different angle] - CTR Impact: [%]
- [ ] **Option 3**: [Third option] - Reasoning: [Another approach] - CTR Impact: [%]

### Meta Description Options:
- [ ] **Option 1**: [Optimized meta] - Reasoning: [Target audience appeal]
- [ ] **Option 2**: [Alternative] - Reasoning: [Value prop angle]
- [ ] **Option 3**: [Third option] - Reasoning: [Specific benefits]

**CTR Tactics**: [Power words, numbers, emotional triggers, keywords, urgency]

## CONTENT & STRUCTURE
- [ ] **Content Quality**: [Score 0-100] - **Gaps**: [What's missing] - **Recommended Length**: [Word count]
- [ ] **Heading Structure**: [Current issues + recommended H1-H6 outline with keywords]
- [ ] **Readability**: [Level + improvements needed]
- [ ] **Semantic SEO**: [Related entities/topics to add]

## FEATURED SNIPPET / AI OPTIMIZATION
- [ ] **Snippet Eligible**: [Yes/No/Partial] - **Target Question**: [Primary question]
- [ ] **Suggested Answer** (2-4 sentences): [Exact answer paragraph]
- [ ] **Answer Format**: [Paragraph/List/Table] - **Supporting Content**: [What to add]
- [ ] **Target Queries** (5-10): [List specific search queries]
- [ ] **AI Overview Tactics**: [How to optimize for Google AI, ChatGPT, Perplexity]

## SCHEMA MARKUP ${signals.structuredData.length > 0 ? '(Improve Existing)' : '(Add New)'}
- [ ] **Schema #1**: [Type] - **Why**: [Rich result benefit] - **Code**: [Complete JSON-LD] - **Test**: Rich Results Tool
- [ ] **Schema #2**: [Type] - **Reasoning**: [CTR impact]
- [ ] **Schema #3**: [Type] - **Expected Results**: [Specific rich results]

(Provide 2-3 production-ready schemas with full code)

## INTERNAL LINKING
- [ ] **Link Opportunities** (10+): [Specific pages to link to with anchor text]
- [ ] **Current Issues**: [Link equity flow, anchor diversity problems]
- [ ] **Hub Structure**: [Content hub recommendations]

## IMAGE OPTIMIZATION (${signals.imageStats?.withoutAlt || 0} missing alt)
${signals.imageStats?.missingAltExamples?.slice(0, 3).map((img, i) => `- [ ] **Image ${i + 1}**: Add alt "[suggested alt]" + rename to [keyword-name.jpg]`).join('\n') || '- [ ] All images have alt text ✓'}
- [ ] **General Tasks**: Compress (<100KB), WebP format, lazy loading, responsive srcset
- [ ] **Core Web Vitals**: [LCP improvements needed]

## TECHNICAL SEO
- [ ] **URL Structure**: [Issues + recommendations]
- [ ] **Mobile**: [Specific improvements needed]
- [ ] **Core Web Vitals**: LCP [score/fix] | FID [score/fix] | CLS [score/fix]
- [ ] **Page Speed**: [Load time + priority fixes]
- [ ] **Security/Canonical**: [Any issues found]

## E-E-A-T SCORE: [0-100]
- [ ] **Expertise**: Present: [list] | Missing: [add these] | Actions: [specific steps]
- [ ] **Authority**: [What's missing + how to build]
- [ ] **Trust**: [Security, social proof, contact info improvements]

## ADDITIONAL OPTIMIZATIONS
- [ ] **External Links**: [Quality assessment + rel attribute recommendations]
- [ ] **Voice/Conversational**: [Question targeting + natural language optimization]
- [ ] **Local SEO**: [If applicable - specific tactics]
- [ ] **Competitor Gaps**: [What competitors have that you don't + differentiation opportunities]

## QUICK WINS (< 1 Hour Each)
- [ ] **Win #1**: [Action] - Time: [X min] - Impact: [result] - Code: [if applicable]
- [ ] **Win #2**: [Action] - Time: [X min] - Impact: [result]
- [ ] **Win #3**: [Action] - Time: [X min] - Impact: [result]
- [ ] **Win #4**: [Action] - Time: [X min] - Impact: [result]
- [ ] **Win #5**: [Action] - Time: [X min] - Impact: [result]

(Include 5-10 quick wins with exact implementation steps)

## SCORES
- **Overall SEO**: [0-100] | **AEO Readiness**: [0-100] | **E-E-A-T**: [0-100]
- **Technical**: [0-100] | **Content**: [0-100] | **Mobile**: [0-100]

**Scoring Rationale**: [Brief explanation of scores]

## IMPLEMENTATION PRIORITY
**CRITICAL (This Week)**: [3-5 tasks with effort/impact/reasoning]
**HIGH (This Month)**: [3-5 tasks with strategic value]
**MEDIUM (Ongoing)**: [2-3 tasks for long-term value]

## TEAM ASSIGNMENTS
- [ ] **Developer**: [Technical tasks list with complexity]
- [ ] **Content**: [Writing/SEO tasks with skills needed]
- [ ] **Marketing**: [Promotional activities]

## TRACKING & MEASUREMENT
- **KPIs**: [Specific metrics to monitor]
- **Success Metrics**: [How to measure improvement]
- **Timeline**: [Expected results timeframe]

---

**REMEMBER**: Think deeply, show analytical reasoning, provide specific code examples, and make every recommendation actionable with exact implementation steps. This is a professional team audit worth $5,000+.`;

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

  // Get max tokens setting from storage (default to 16000)
  let maxTokensSetting = DEFAULT_MAX_TOKENS;
  try {
    const settings = await chrome.storage.sync.get(['maxTokens']);
    if (settings.maxTokens) {
      maxTokensSetting = parseInt(settings.maxTokens);
    } else {
      // Try local storage
      const localSettings = await chrome.storage.local.get(['maxTokens']);
      if (localSettings.maxTokens) {
        maxTokensSetting = parseInt(localSettings.maxTokens);
      }
    }
  } catch (e) {
    console.warn('[SEO Auditor] Could not load maxTokens setting, using default:', DEFAULT_MAX_TOKENS);
  }

  console.log('[SEO Auditor] Calling Claude API with key length:', cleanApiKey.length, 'model:', model);
  vlog('Calling Claude API...');
  vlog('Model:', model);
  vlog('Prompt length:', prompt.length, 'characters');
  vlog('Max tokens:', maxTokensSetting);
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
      system: 'You are a world-class SEO and AEO consultant with 15+ years of experience. You provide comprehensive, actionable audits worth $5,000+. You analyze data deeply, identify patterns and connections between factors, and think through the reasoning behind each recommendation. You go deep into every aspect of optimization, provide specific implementation steps with detailed explanations of WHY each change matters, and deliver measurable results. You think strategically while being extremely practical. Take your time to analyze thoroughly - quality and depth are paramount.',
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: prompt
        }]
      }],
      max_tokens: maxTokensSetting,
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
        const apiError = errorJson.error?.message || '';
        
        // Check for token limit errors
        if (apiError.includes('prompt is too long') || apiError.includes('max_tokens') || apiError.includes('token') && apiError.includes('limit')) {
          errorMessage = `Token limit error: ${apiError}\n\nThe page content is too large for the current settings.\n\nSolutions:\n1. Try using Claude Opus 4 (has 200K token context)\n2. Use Claude Sonnet 3.5 (has 200K token context)\n3. The current max_tokens setting may need adjustment`;
        } else {
          errorMessage = apiError || errorMessage;
        }
      } catch (e) {
        errorMessage = `API error (${response.status}): ${errorText.substring(0, 200)}`;
      }
    }
    
    // Log error details (without exposing key)
    console.error('[SEO Auditor] API error:', response.status, errorMessage);
    console.error('[SEO Auditor] Full error response:', errorText.substring(0, 500));
    
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
      try {
        console.log('[SEO Auditor] Testing API key...');
      const result = await testAPIKey();
        console.log('[SEO Auditor] API key test result:', result.success ? 'SUCCESS' : 'FAILED');
        if (!result.success) {
          logError('API Key Test', new Error(result.error));
        }
      sendResponse(result);
      } catch (error) {
        const errorLog = logError('TEST_API_KEY handler', error);
        sendResponse({
          success: false,
          error: `Test failed: ${error.message}`
        });
      }
    })();
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'RUN_AUDIT') {
    // Run async operation
    (async () => {
      const tabId = sender.tab?.id || message.tabId;
      const startTime = Date.now();
      
      try {
        console.log(`[SEO Auditor] Starting audit for tab ${tabId}`);
        
        // Set initial state
        setAuditState(tabId, 'running', { 
          startTime,
          url: message.signals?.url 
        });
        
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
          const error = 'API key not configured. Please set it in the options page.';
          logError('RUN_AUDIT', new Error(error), { tabId });
          setAuditState(tabId, 'error', { error });
          sendResponse({
            success: false,
            error
          });
          return;
        }

        // Trim whitespace from API key (in case it was accidentally saved with spaces)
        apiKey = apiKey.trim();

        // Log a safe version for debugging (never log full key)
        console.log('[SEO Auditor] API key found, length:', apiKey.length, 'prefix:', apiKey.substring(0, 7));
        vlog('Model:', model, 'Verbose logging:', verboseLoggingEnabled);
        
        // Validate key format
        if (!apiKey.startsWith('sk-ant-')) {
          const error = 'API key format appears incorrect. Expected to start with "sk-ant-". Please check your API key in the options page.';
          logError('RUN_AUDIT', new Error(error), { tabId, keyPrefix: apiKey.substring(0, 7) });
          setAuditState(tabId, 'error', { error });
          sendResponse({
            success: false,
            error
          });
          return;
        }

        // Get signals from the message
        const signals = message.signals;
        if (!signals) {
          const error = 'No signals collected from page. Make sure you are on a valid HTML page.';
          logError('RUN_AUDIT', new Error(error), { tabId });
          setAuditState(tabId, 'error', { error });
          sendResponse({
            success: false,
            error
          });
          return;
        }

        vlog('Starting API call with signals:', Object.keys(signals));

        // Build prompt and call API
        const prompt = buildPrompt(signals);
        const analysis = await callClaudeAPI(apiKey, model, prompt);

        const duration = Date.now() - startTime;
        console.log(`[SEO Auditor] Audit completed for tab ${tabId} in ${(duration/1000).toFixed(1)}s`);
        
        // Mark as complete
        setAuditState(tabId, 'complete', {
          url: signals.url,
          duration,
          analysisLength: analysis.length
        });

        sendResponse({
          success: true,
          analysis: analysis,
          signals: signals // Include signals for reference
        });

      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[SEO Auditor] Audit failed for tab ${tabId} after ${(duration/1000).toFixed(1)}s`);
        
        logError('RUN_AUDIT execution', error, { 
          tabId, 
          duration,
          url: message.signals?.url 
        });
        
        setAuditState(tabId, 'error', { 
          error: error.message,
          duration 
        });
        
        sendResponse({
          success: false,
          error: error.message || 'Unknown error occurred'
        });
      }
    })();

    // Return true to indicate async response
    return true;
  }
  
  if (message.type === 'GET_AUDIT_STATE') {
    // Get current audit state for the tab
    (async () => {
      try {
        const tabId = message.tabId || sender.tab?.id;
        const state = await getAuditState(tabId);
        sendResponse({ success: true, state });
      } catch (error) {
        logError('GET_AUDIT_STATE', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  
  if (message.type === 'GET_LAST_ERROR') {
    // Get last error for debugging
    (async () => {
      try {
        const result = await chrome.storage.local.get(['lastError', 'lastErrorTime']);
        sendResponse({ 
          success: true, 
          error: result.lastError,
          errorTime: result.lastErrorTime
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
});

// Listen for tab updates to restore badge state
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const state = await getAuditState(activeInfo.tabId);
    if (state && state.status !== 'idle') {
      const badgeText = {
        running: '⏳',
        complete: '✓',
        error: '✗'
      };
      updateBadge(activeInfo.tabId, state.status, badgeText[state.status] || '');
      vlog(`Restored badge for tab ${activeInfo.tabId}:`, state.status);
    }
  } catch (error) {
    logError('Tab activation', error, { tabId: activeInfo.tabId });
  }
});

// Clean up state when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    auditStates.delete(tabId);
    chrome.storage.local.remove([`auditState_${tabId}`]);
    vlog(`Cleaned up state for closed tab ${tabId}`);
  } catch (error) {
    logError('Tab cleanup', error, { tabId });
  }
});

console.log('[SEO Auditor] Background worker initialized');
