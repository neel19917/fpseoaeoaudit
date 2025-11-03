/**
 * Background service worker for SEO & AEO Auditor.
 * Handles Claude API calls for audits.
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_MAX_TOKENS = 8000;
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
  const prompt = `You are conducting a DEEP, COMPREHENSIVE SEO and AEO (Answer Engine Optimization) audit. Provide highly actionable, specific recommendations with implementation details. Go beyond surface-level analysis.

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

Provide DEEP, ACTIONABLE analysis in CHECKLIST FORMAT for easy team collaboration. Use markdown checkboxes (- [ ]) for all actionable items. Be specific, detailed, and provide exact implementation steps:

## ⚠️ CRITICAL ISSUES (Immediate Action Required)
List 3-5 critical problems with checkboxes for team tracking:

### Issue 1: [Issue Name]
- [ ] **Problem Identified**: [Specific problem]
- [ ] **Impact**: [Exact SEO/AEO consequence with metrics]
- [ ] **Fix Step 1**: [First implementation step with code]
- [ ] **Fix Step 2**: [Second implementation step]
- [ ] **Fix Step 3**: [Final step]
- [ ] **Verify Fix**: [How to confirm it's fixed]
**Priority**: 🔴 Critical | **Estimated Impact**: [Expected improvement]

(Repeat for each critical issue)

## 🎯 TOP 10 PRIORITIZED RECOMMENDATIONS

### Recommendation #1: [Title]
- [ ] **Issue**: [Specific problem found]
- [ ] **Why It Matters**: [SEO/AEO impact with data]
- [ ] **Implementation Steps**:
  - [ ] Step 1: [Detailed instruction]
  - [ ] Step 2: [Next step]
  - [ ] Step 3: [Final step]
- [ ] **Before/After Example**:
  ```
  Before: [current state]
  After: [improved state]
  ```
- [ ] **Test & Verify**: [How to confirm success]

**Priority**: 🔴 Critical / 🟡 High / 🟢 Medium | **Effort**: [time] | **Impact**: [expected result]

---

(Repeat for all 10 recommendations)

## 📝 TITLE & META DESCRIPTION DEEP DIVE

### Current Title Analysis
- [ ] **Review current title**: [Current title here]
- [ ] Character count: [X chars] (Optimal: 50-60)
- [ ] Keyword placement: [Analysis]
- [ ] CTR potential: [Rating]

### Title Optimization Tasks
- [ ] **Option 1**: [New title suggestion with reasoning]
- [ ] **Option 2**: [Alternative title with reasoning]
- [ ] **Option 3**: [Third alternative with reasoning]
- [ ] **Select best option** and implement
- [ ] **Test in SERP simulator**

### Current Meta Description Analysis
- [ ] **Review current meta**: [Current meta here]
- [ ] Character count: [X chars] (Optimal: 150-160)
- [ ] Call-to-action present: [Yes/No]
- [ ] Value proposition: [Analysis]

### Meta Description Tasks
- [ ] **Option 1**: [New meta suggestion]
- [ ] **Option 2**: [Alternative meta]
- [ ] **Option 3**: [Third alternative]
- [ ] **Implement selected option**
- [ ] **Add UTM parameters** if needed

### CTR Optimization Checklist
- [ ] Add power words: [specific words to use]
- [ ] Include numbers/statistics
- [ ] Add emotional trigger
- [ ] Include target keyword
- [ ] Create urgency or curiosity

## CONTENT STRATEGY & OPTIMIZATION
- **Content Quality Score**: [0-100 with breakdown]
- **Keyword Opportunities**: [Identify missing relevant terms from content]
- **Content Gaps**: [What's missing that users expect]
- **Readability Analysis**: [Reading level, sentence length, paragraph structure]
- **Content Length Recommendation**: [Ideal word count for topic with justification]
- **Semantic SEO**: [Related entities and topics to add]
- **User Intent Match**: [How well content matches search intent]
- **Content Enhancements**: [Specific sections to add with outlines]

## HEADING STRUCTURE ANALYSIS
- **Current Structure Issues**: [Hierarchy problems, missing opportunities]
- **Recommended Structure**: [Provide complete H1-H6 outline]
- **Keyword Integration**: [How to optimize each heading]
- **Semantic Relationships**: [How headings should relate to each other]

## FEATURED SNIPPET / AI OVERVIEW OPTIMIZATION
- **Snippet Eligibility**: [Yes/No/Partial with detailed reasoning]
- **Target Question**: [Primary question this page should answer]
- **Recommended Answer Format**: [Paragraph/List/Table with exact format]
- **Suggested Answer Paragraph**: [Write the exact 2-4 sentence answer]
- **Supporting Content**: [What additional content supports the answer]
- **Potential Queries**: [5-10 specific search queries this could rank for]
- **AI Overview Strategy**: [How to optimize for Google's AI Overviews]
- **Answer Box Tactics**: [Specific formatting for answer boxes]

## 🏗️ SCHEMA MARKUP IMPLEMENTATION CHECKLIST

${signals.structuredData.length > 0 ? '### Existing Schema Improvements' : '### New Schema Implementation'}

### Schema #1: [Schema Type]
- [ ] **Understand the benefit**: [SEO benefit and rich result potential]
- [ ] **Copy this code** and paste in <head>:
\`\`\`json
[Complete JSON-LD code here]
\`\`\`
- [ ] **Customize these properties**:
  - [ ] Property 1: [Update this value]
  - [ ] Property 2: [Update this value]
  - [ ] Property 3: [Update this value]
- [ ] **Test with Google Rich Results Tool**: https://search.google.com/test/rich-results
- [ ] **Validate with Schema.org validator**: https://validator.schema.org/
- [ ] **Check Search Console** for rich result appearance
- [ ] **Add nested schemas if needed**: [List of additional schemas]

(Provide 3-5 complete schema implementations with checkboxes)

## INTERNAL LINKING STRATEGY
- **Current Link Analysis**: [Link equity flow, anchor text diversity]
- **Missing Internal Links**: [Identify 10+ specific linking opportunities]
- **Anchor Text Recommendations**: [Exact anchor text for each link]
- **Link Placement**: [Where in content to place each link]
- **Hub Page Opportunities**: [Suggest content hub structure]
- **Orphan Page Risk**: [Analysis of page isolation]
- **Link Architecture**: [Site structure improvements]

## 🖼️ IMAGE OPTIMIZATION CHECKLIST

### Missing Alt Text (${signals.imageStats?.withoutAlt || 0} images)
${signals.imageStats?.missingAltExamples?.slice(0, 5).map((img, i) => `
#### Image ${i + 1}: ${img.src.substring(0, 50)}...
- [ ] **Add alt text**: "[Suggested descriptive alt text]"
- [ ] **Rename file**: from [current] to [optimized-keyword-name.jpg]
- [ ] **Verify accessibility**: Screen reader test
`).join('\n') || '- [ ] No images missing alt text ✓'}

### Image Optimization Tasks
- [ ] **Compress all images**:
  - [ ] Use TinyPNG or ImageOptim
  - [ ] Target: <100KB per image
  - [ ] Maintain quality at 80-85%
  
- [ ] **Convert to Next-Gen Formats**:
  - [ ] Convert to WebP format
  - [ ] Provide fallback for older browsers
  - [ ] Consider AVIF for better compression
  
- [ ] **Implement Lazy Loading**:
  - [ ] Add \`loading="lazy"\` attribute to images
  - [ ] Exclude above-the-fold images
  - [ ] Test on mobile devices
  
- [ ] **Optimize File Names**:
  - [ ] Image 1: Rename to [descriptive-keyword-name.jpg]
  - [ ] Image 2: Rename to [descriptive-keyword-name.jpg]
  - [ ] Use hyphens, not underscores
  
- [ ] **Add to Image Sitemap**: [Yes/No with reasoning]
- [ ] **Set proper dimensions** in HTML (width/height attributes)
- [ ] **Use responsive images** with srcset attribute

## EXTERNAL LINK AUDIT
- **Link Quality Assessment**: [Evaluate authority of outbound links]
- **Rel Attributes**: [nofollow/sponsored/ugc recommendations]
- **Broken Link Check**: [Note any suspicious links]
- **Link Opportunities**: [Authoritative sources to link to]
- **Competitive Backlink Strategy**: [Where to get links from]

## EEAT ENHANCEMENT STRATEGY
**Current EEAT Score**: [0-100 with breakdown by E-A-T component]

**Expertise Signals**:
- **Present**: [List all expertise indicators found]
- **Missing**: [What expertise signals to add]
- **Actions**: [Specific ways to demonstrate expertise]
- **Author Bio**: [Recommendations for author credibility]
- **Credentials**: [How to showcase qualifications]

**Authoritativeness Signals**:
- **Present**: [Authority indicators found]
- **Missing**: [What authority signals to add]
- **Actions**: [How to build authority]
- **Citations**: [Where to get cited/referenced]
- **Awards/Recognition**: [How to showcase achievements]

**Trustworthiness Signals**:
- **Present**: [Trust indicators found]
- **Missing**: [What trust signals to add]
- **Actions**: [Security, transparency, policy improvements]
- **Social Proof**: [Reviews, testimonials, case studies]
- **Contact Information**: [How to improve accessibility]

## TECHNICAL SEO DEEP DIVE
- **URL Structure**: [Analysis and optimization recommendations]
- **Mobile Optimization**: [Specific mobile improvements]
- **Page Speed**: [Estimated load time insights from markup]
- **Core Web Vitals Hints**: [LCP, FID, CLS improvement suggestions]
- **Structured Data Errors**: [Validation issues found]
- **Canonical Issues**: [Potential duplicate content problems]
- **Robots.txt Implications**: [Analysis of robots directives]
- **XML Sitemap**: [Whether page should be in sitemap]
- **HTTPS**: [Security recommendations]
- **Hreflang**: [International SEO if applicable]

## COMPETITOR GAP ANALYSIS
Based on the content and structure:
- **What Competitors Likely Have**: [Infer competitive advantages]
- **Opportunities to Differentiate**: [Unique content angles]
- **Content Depth Comparison**: [How to go deeper than competition]

## VOICE SEARCH & CONVERSATIONAL SEO
- **Voice Query Potential**: [Natural language query optimization]
- **Question Targeting**: [Specific questions to answer]
- **Conversational Content**: [How to make content more natural]
- **Local SEO**: [If applicable, local optimization tactics]

## AI & LLM OPTIMIZATION (AEO)
- **ChatGPT Visibility**: [How to appear in ChatGPT responses]
- **Perplexity Optimization**: [Citation-worthy content structure]
- **Bing Chat Ready**: [Structured answer optimization]
- **Bard/Gemini Alignment**: [Google AI alignment tactics]
- **AI Training Data**: [Make content valuable for AI training]

## ⚡ QUICK WINS (Implement Today - <1 Hour Each)

### Immediate Actions Checklist
- [ ] **Quick Win #1**: [Action title]
  - Implementation: [Exact code or steps]
  - Time: [X minutes]
  
- [ ] **Quick Win #2**: [Action title]
  - Implementation: [Exact code or steps]
  - Time: [X minutes]
  
- [ ] **Quick Win #3**: [Action title]
  - Implementation: [Exact code or steps]
  - Time: [X minutes]
  
- [ ] **Quick Win #4**: [Action title]
  - Implementation: [Exact code or steps]
  - Time: [X minutes]
  
- [ ] **Quick Win #5**: [Action title]
  - Implementation: [Exact code or steps]
  - Time: [X minutes]

(Continue for 10+ quick wins with checkboxes and exact steps)

## LONG-TERM STRATEGY (30-90 Days)
- **Content Expansion Plan**: [Detailed roadmap]
- **Link Building Strategy**: [Specific outreach tactics]
- **Authority Building**: [Long-term EEAT improvements]
- **Content Refresh Schedule**: [When to update this content]

## MEASUREMENT & TRACKING
- **KPIs to Monitor**: [Specific metrics to track]
- **Success Metrics**: [How to measure improvement]
- **Tracking Setup**: [Google Analytics/Search Console events]
- **Timeline**: [Expected results timeline]

## SCORES & BENCHMARKS
- **Overall SEO Score**: [0-100 with detailed breakdown]
- **AEO Readiness Score**: [0-100 with AI-specific criteria]
- **Content Quality Score**: [0-100]
- **Technical SEO Score**: [0-100]
- **EEAT Score**: [0-100]
- **Mobile Score**: [0-100]
- **User Experience Score**: [0-100]

**Scoring Breakdown**: [Explain each score component]

## 📋 IMPLEMENTATION PRIORITY MATRIX

### 🔴 CRITICAL - Do First (This Week)
- [ ] **Task 1**: [Action] - Effort: [time] - Impact: [high/critical]
- [ ] **Task 2**: [Action] - Effort: [time] - Impact: [high/critical]
- [ ] **Task 3**: [Action] - Effort: [time] - Impact: [high/critical]

**Team Assignment**: [Suggest who should handle]
**Deadline**: [Recommended completion date]

---

### 🟡 HIGH PRIORITY - This Week
- [ ] **Task 1**: [Action] - Effort: [time] - Impact: [high]
- [ ] **Task 2**: [Action] - Effort: [time] - Impact: [high]
- [ ] **Task 3**: [Action] - Effort: [time] - Impact: [high]
- [ ] **Task 4**: [Action] - Effort: [time] - Impact: [high]

**Team Assignment**: [Suggest who should handle]
**Deadline**: [Recommended completion date]

---

### 🟢 MEDIUM PRIORITY - This Month
- [ ] **Task 1**: [Action] - Effort: [time] - Impact: [medium]
- [ ] **Task 2**: [Action] - Effort: [time] - Impact: [medium]
- [ ] **Task 3**: [Action] - Effort: [time] - Impact: [medium]
- [ ] **Task 4**: [Action] - Effort: [time] - Impact: [medium]

**Team Assignment**: [Suggest who should handle]
**Deadline**: [Recommended completion date]

---

### ⚪ LOW PRIORITY - Future/Ongoing
- [ ] **Task 1**: [Action] - Effort: [time] - Impact: [low/ongoing]
- [ ] **Task 2**: [Action] - Effort: [time] - Impact: [low/ongoing]
- [ ] **Task 3**: [Action] - Effort: [time] - Impact: [low/ongoing]

**Team Assignment**: [Suggest who should handle]
**Review Date**: [When to revisit]

## 👥 TEAM COLLABORATION NOTES

### Assignments & Responsibilities
- [ ] **Developer Tasks**: [List technical implementations]
- [ ] **Content Team Tasks**: [List content updates needed]
- [ ] **Marketing Team Tasks**: [List promotional activities]
- [ ] **Design Team Tasks**: [List visual/UX improvements]

### Review & Sign-off
- [ ] **Technical Review Complete**: [Assigned to]
- [ ] **Content Review Complete**: [Assigned to]
- [ ] **Final QA Testing**: [Assigned to]
- [ ] **Live Deployment**: [Assigned to]
- [ ] **Post-Launch Monitoring**: [Assigned to - First 7 days]

---

**FORMATTING NOTE**: Use markdown checkbox syntax (- [ ]) for all actionable items. This makes it easy to share in GitHub, Notion, Trello, or any markdown-compatible tool. Team members can check off items as they complete them.

Be extremely detailed, specific, and actionable. Provide code examples, exact wording, and step-by-step instructions. Think like an expert SEO consultant delivering a $5,000 audit that a TEAM can execute together using this checklist.`;

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
      system: 'You are a world-class SEO and AEO consultant with 15+ years of experience. You provide comprehensive, actionable audits worth $5,000+. You go deep into every aspect of optimization, provide specific implementation steps, and deliver measurable results. You think strategically while being extremely practical.',
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

