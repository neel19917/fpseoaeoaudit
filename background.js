/**
 * Background service worker for SEO & AEO Auditor.
 * Handles Claude API calls for audits.
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_MAX_TOKENS = 8000;
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
 */
function buildPrompt(signals) {
  const prompt = `You are conducting a DEEP, COMPREHENSIVE SEO and AEO (Answer Engine Optimization) audit. 

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

Provide DEEP, ACTIONABLE analysis in CHECKLIST FORMAT for easy team collaboration. Use markdown checkboxes (- [ ]) for all actionable items. 

ANALYSIS APPROACH:
- First, analyze the data holistically to understand the site's current state
- Identify patterns and interconnections between different SEO factors
- Consider the competitive landscape and user intent
- Think through the reasoning behind each recommendation
- Provide detailed explanations of WHY each change matters
- Show your analytical reasoning for complex issues

Be specific, detailed, and provide exact implementation steps:

## CRITICAL ISSUES (Immediate Action Required)
List 3-5 critical problems with checkboxes for team tracking.

For each issue, first ANALYZE why this is critical:
- What patterns in the data reveal this issue?
- What are the cascading effects on other SEO factors?
- What's the root cause, not just the symptom?

Then provide actionable steps:

### Issue 1: [Issue Name]
**Analysis & Reasoning**:
[Detailed explanation of why this is critical, how you identified it, and its broader impact on the site's SEO performance. Show your thinking process.]

- [ ] **Problem Identified**: [Specific problem]
- [ ] **Impact**: [Exact SEO/AEO consequence with metrics]
- [ ] **Root Cause**: [Why this problem exists]
- [ ] **Fix Step 1**: [First implementation step with code]
- [ ] **Fix Step 2**: [Second implementation step]
- [ ] **Fix Step 3**: [Final step]
- [ ] **Verify Fix**: [How to confirm it's fixed]
**Priority**: CRITICAL | **Estimated Impact**: [Expected improvement]

(Repeat for each critical issue with deep analysis)

## TOP 10 PRIORITIZED RECOMMENDATIONS

For each recommendation, show your analytical reasoning before providing the checklist:

### Recommendation #1: [Title]

**Deep Analysis**:
[Explain your thought process: What data points led you to this recommendation? How does this connect to other issues? What are the second-order effects? Consider user behavior, search intent, and competitive factors.]

- [ ] **Issue**: [Specific problem found]
- [ ] **Why It Matters**: [SEO/AEO impact with data and reasoning]
- [ ] **Connected Issues**: [How this relates to other problems]
- [ ] **Implementation Steps**:
  - [ ] Step 1: [Detailed instruction with reasoning]
  - [ ] Step 2: [Next step with explanation]
  - [ ] Step 3: [Final step with verification]
- [ ] **Before/After Example**:
  \`\`\`
  Before: [current state]
  After: [improved state]
  Reasoning: [Why this change works]
  \`\`\`
- [ ] **Test & Verify**: [How to confirm success]
- [ ] **Monitor**: [Metrics to track post-implementation]

**Priority**: CRITICAL / HIGH / MEDIUM | **Effort**: [time] | **Impact**: [expected result]

---

(Repeat for all 10 recommendations with deep analysis for each)

## TITLE & META DESCRIPTION DEEP DIVE

**Analytical Framework**:
Before providing recommendations, analyze:
- Current positioning and messaging strategy
- Keyword relevance and search intent alignment
- Competitive differentiation in SERPs
- Psychological triggers and user motivation
- Brand voice and consistency

### Current Title Analysis
- [ ] **Review current title**: [Current title here]
- [ ] Character count: [X chars] (Optimal: 50-60)
- [ ] Keyword placement: [Analysis with reasoning]
- [ ] CTR potential: [Rating with explanation]
- [ ] Emotional appeal: [Assessment]
- [ ] Competitive positioning: [How it compares]

**Reasoning**: [Detailed analysis of strengths and weaknesses]

### Title Optimization Tasks
- [ ] **Option 1**: [New title suggestion]
  - Reasoning: [Why this works - keyword placement, user intent, differentiation]
  - Expected CTR impact: [Percentage]
  
- [ ] **Option 2**: [Alternative title]
  - Reasoning: [Different approach and why it might work better]
  - Expected CTR impact: [Percentage]
  
- [ ] **Option 3**: [Third alternative]
  - Reasoning: [Yet another angle with specific benefits]
  - Expected CTR impact: [Percentage]
  
- [ ] **A/B Testing Strategy**: [How to test these variations]
- [ ] **Select best option** based on: [Decision criteria]
- [ ] **Test in SERP simulator**

### Current Meta Description Analysis
- [ ] **Review current meta**: [Current meta here]
- [ ] Character count: [X chars] (Optimal: 150-160)
- [ ] Call-to-action present: [Yes/No with effectiveness rating]
- [ ] Value proposition clarity: [Analysis]
- [ ] Emotional resonance: [Assessment]

**Reasoning**: [Detailed analysis of messaging effectiveness]

### Meta Description Tasks
- [ ] **Option 1**: [New meta suggestion]
  - Reasoning: [Why this messaging works for the target audience]
  
- [ ] **Option 2**: [Alternative meta]
  - Reasoning: [Different value proposition angle]
  
- [ ] **Option 3**: [Third alternative]
  - Reasoning: [Another approach with specific benefits]
  
- [ ] **Implement selected option**
- [ ] **Add UTM parameters** if needed

### CTR Optimization Checklist
- [ ] Add power words: [specific words with psychological impact explained]
- [ ] Include numbers/statistics: [Why specificity increases trust]
- [ ] Add emotional trigger: [Which emotion and why]
- [ ] Include target keyword: [Natural placement strategy]
- [ ] Create urgency or curiosity: [Technique and reasoning]

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

## SCHEMA MARKUP IMPLEMENTATION CHECKLIST

**Strategic Thinking**:
[Analyze which schema types would have the most impact for this specific content type and business model. Consider rich result eligibility, competitive advantage, and implementation complexity.]

${signals.structuredData.length > 0 ? '### Existing Schema Improvements' : '### New Schema Implementation'}

### Schema #1: [Schema Type]

**Why This Schema**:
[Deep analysis: Why this specific schema type is critical for this page. What rich results it enables. How it differentiates in SERPs. Expected impact on CTR and visibility.]

- [ ] **Understand the benefit**: [SEO benefit and rich result potential with data]
- [ ] **Copy this code** and paste in <head>:
\`\`\`json
[Complete, production-ready JSON-LD code here]
\`\`\`
- [ ] **Customize these properties**:
  - [ ] Property 1: [Update this value - why it matters]
  - [ ] Property 2: [Update this value - impact on rich results]
  - [ ] Property 3: [Update this value - SEO benefit]
- [ ] **Test with Google Rich Results Tool**: https://search.google.com/test/rich-results
- [ ] **Validate with Schema.org validator**: https://validator.schema.org/
- [ ] **Check Search Console** for rich result appearance (7-14 days)
- [ ] **Add nested schemas if needed**: [List with reasoning]

**Expected Results**: [Specific rich result types and estimated CTR impact]

(Provide 3-5 complete schema implementations with deep analysis for each)

## INTERNAL LINKING STRATEGY
- **Current Link Analysis**: [Link equity flow, anchor text diversity]
- **Missing Internal Links**: [Identify 10+ specific linking opportunities]
- **Anchor Text Recommendations**: [Exact anchor text for each link]
- **Link Placement**: [Where in content to place each link]
- **Hub Page Opportunities**: [Suggest content hub structure]
- **Orphan Page Risk**: [Analysis of page isolation]
- **Link Architecture**: [Site structure improvements]

## IMAGE OPTIMIZATION CHECKLIST

**Strategic Analysis**:
[Analyze the role of images in this content. Consider user experience, page speed impact, SEO value, and accessibility. Think about mobile vs desktop usage patterns.]

### Missing Alt Text (${signals.imageStats?.withoutAlt || 0} images)
${signals.imageStats?.missingAltExamples?.slice(0, 5).map((img, i) => `
#### Image ${i + 1}: ${img.src.substring(0, 50)}...

**Context Analysis**: [What this image likely depicts based on URL/page context]

- [ ] **Add alt text**: "[Suggested descriptive, keyword-rich alt text]"
  - Reasoning: [Why this alt text works - descriptive, accessible, SEO-friendly]
- [ ] **Rename file**: from [current] to [optimized-keyword-name.jpg]
  - SEO benefit: [How filename impacts image search ranking]
- [ ] **Verify accessibility**: Screen reader test
`).join('\n') || '- [ ] No images missing alt text - EXCELLENT'}

### Image Optimization Tasks

**Performance vs Quality Tradeoff Analysis**:
[Consider the balance between file size reduction and visual quality for this specific use case]

- [ ] **Compress all images**:
  - [ ] Use TinyPNG or ImageOptim
  - [ ] Target: <100KB per image (<50KB for mobile)
  - [ ] Maintain quality at 80-85%
  - [ ] Priority images: [List images that impact LCP]
  - **Reasoning**: [Impact on Core Web Vitals and page speed]
  
- [ ] **Convert to Next-Gen Formats**:
  - [ ] Convert to WebP format (80% smaller files)
  - [ ] Provide fallback for older browsers
  - [ ] Consider AVIF for even better compression
  - [ ] Test browser support: [Target browser versions]
  - **Reasoning**: [File size reduction impact on performance score]
  
- [ ] **Implement Lazy Loading**:
  - [ ] Add \`loading="lazy"\` attribute to below-fold images
  - [ ] Exclude above-the-fold images (first 3-5 visible)
  - [ ] Test on mobile devices (different viewports)
  - [ ] Verify impact on LCP metric
  - **Reasoning**: [Initial page load improvement]
  
- [ ] **Optimize File Names**:
  - [ ] Image 1: Rename to [descriptive-keyword-name.jpg]
  - [ ] Image 2: Rename to [descriptive-keyword-name.jpg]
  - [ ] Use hyphens, not underscores (Google's preference)
  - **Reasoning**: [Image search SEO and organization]
  
- [ ] **Add to Image Sitemap**: [Yes/No with strategic reasoning]
- [ ] **Set proper dimensions** in HTML (prevents layout shift)
- [ ] **Use responsive images** with srcset attribute
- [ ] **Monitor**: Track Core Web Vitals impact post-implementation

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

## QUICK WINS (Implement Today - Under 1 Hour Each)

**Prioritization Logic**:
[Explain how these quick wins were selected based on impact-to-effort ratio, current site state, and immediate visibility opportunities]

### Immediate Actions Checklist
- [ ] **Quick Win #1**: [Action title]
  - Implementation: [Exact code or steps]
  - Time: [X minutes]
  - **Reasoning**: [Why this has outsized impact for minimal effort]
  - Expected result: [Specific improvement]
  
- [ ] **Quick Win #2**: [Action title]
  - Implementation: [Exact code or steps]
  - Time: [X minutes]
  - **Reasoning**: [Strategic importance]
  - Expected result: [Specific improvement]
  
- [ ] **Quick Win #3**: [Action title]
  - Implementation: [Exact code or steps]
  - Time: [X minutes]
  - **Reasoning**: [Why this matters now]
  - Expected result: [Specific improvement]
  
- [ ] **Quick Win #4**: [Action title]
  - Implementation: [Exact code or steps]
  - Time: [X minutes]
  - **Reasoning**: [Impact analysis]
  - Expected result: [Specific improvement]
  
- [ ] **Quick Win #5**: [Action title]
  - Implementation: [Exact code or steps]
  - Time: [X minutes]
  - **Reasoning**: [Why prioritize this]
  - Expected result: [Specific improvement]

(Continue for 10+ quick wins with deep reasoning for each)

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

## IMPLEMENTATION PRIORITY MATRIX

**Prioritization Methodology**:
[Explain the framework used to prioritize these tasks: impact vs effort, dependencies, quick wins vs strategic moves, risk factors, resource requirements]

### CRITICAL - Do First (This Week)
**Strategic Reasoning**: [Why these tasks take absolute priority - cascading effects, competitive urgency, revenue impact]

- [ ] **Task 1**: [Action] - Effort: [time] - Impact: [high/critical]
  - Reasoning: [Deep analysis of why this is critical]
  - Dependencies: [What must be done first]
  - Risk if delayed: [Consequences of not doing this now]
  
- [ ] **Task 2**: [Action] - Effort: [time] - Impact: [high/critical]
  - Reasoning: [Why this can't wait]
  - Dependencies: [Prerequisites]
  - Risk if delayed: [Impact analysis]
  
- [ ] **Task 3**: [Action] - Effort: [time] - Impact: [high/critical]
  - Reasoning: [Urgency factors]
  - Dependencies: [Related tasks]
  - Risk if delayed: [Cost of delay]

**Team Assignment**: [Suggested roles with reasoning]
**Deadline**: [Recommended date with justification]
**Success Metrics**: [How to measure completion]

---

### HIGH PRIORITY - This Week
**Strategic Reasoning**: [Why these follow critical tasks - building on foundation, maximizing early wins]

- [ ] **Task 1**: [Action] - Effort: [time] - Impact: [high]
  - Reasoning: [Strategic value]
  - Builds on: [Which critical tasks]
  
- [ ] **Task 2**: [Action] - Effort: [time] - Impact: [high]
  - Reasoning: [Why this matters]
  - Synergies: [Related improvements]
  
- [ ] **Task 3**: [Action] - Effort: [time] - Impact: [high]
- [ ] **Task 4**: [Action] - Effort: [time] - Impact: [high]

**Team Assignment**: [Suggested roles]
**Deadline**: [Recommended date]
**Success Metrics**: [Measurement criteria]

---

### MEDIUM PRIORITY - This Month
**Strategic Reasoning**: [Long-term value, optimization, competitive positioning]

- [ ] **Task 1**: [Action] - Effort: [time] - Impact: [medium]
  - Reasoning: [Why this timing works]
  
- [ ] **Task 2**: [Action] - Effort: [time] - Impact: [medium]
- [ ] **Task 3**: [Action] - Effort: [time] - Impact: [medium]
- [ ] **Task 4**: [Action] - Effort: [time] - Impact: [medium]

**Team Assignment**: [Suggested roles]
**Deadline**: [Recommended date]

---

### LOW PRIORITY - Future/Ongoing
**Strategic Reasoning**: [Maintenance, incremental gains, continuous improvement]

- [ ] **Task 1**: [Action] - Effort: [time] - Impact: [low/ongoing]
- [ ] **Task 2**: [Action] - Effort: [time] - Impact: [low/ongoing]
- [ ] **Task 3**: [Action] - Effort: [time] - Impact: [low/ongoing]

**Team Assignment**: [Suggested roles]
**Review Date**: [When to revisit]

## TEAM COLLABORATION NOTES

### Assignments & Responsibilities
**Resource Allocation Strategy**: [How to divide work based on skills, capacity, and impact]

- [ ] **Developer Tasks**: [List technical implementations]
  - Complexity: [Assessment]
  - Required skills: [Specific technologies]
  
- [ ] **Content Team Tasks**: [List content updates needed]
  - Complexity: [Assessment]
  - Required skills: [SEO writing, keyword research]
  
- [ ] **Marketing Team Tasks**: [List promotional activities]
  - Complexity: [Assessment]
  - Focus areas: [Channels and tactics]
  
- [ ] **Design Team Tasks**: [List visual/UX improvements]
  - Complexity: [Assessment]
  - Tools needed: [Software requirements]

### Review & Sign-off
- [ ] **Technical Review Complete**: [Assigned to]
  - Review criteria: [What to verify]
  
- [ ] **Content Review Complete**: [Assigned to]
  - Review criteria: [Quality standards]
  
- [ ] **Final QA Testing**: [Assigned to]
  - Test cases: [What to validate]
  
- [ ] **Live Deployment**: [Assigned to]
  - Pre-launch checklist: [Critical checks]
  
- [ ] **Post-Launch Monitoring**: [Assigned to - First 7 days]
  - Metrics to track: [KPIs]
  - Alert thresholds: [When to act]

---

**DEEP ANALYSIS METHODOLOGY**: This audit uses systematic analysis of interconnected SEO factors. Each recommendation is based on:
1. Data pattern analysis
2. Industry best practices
3. Competitive benchmarking
4. User behavior insights
5. Search engine algorithm understanding
6. Business impact assessment

**FORMATTING NOTE**: Use markdown checkbox syntax (- [ ]) for all actionable items. This makes it easy to share in GitHub, Notion, Trello, or any markdown-compatible tool. Team members can check off items as they complete them.

Think deeply about each aspect. Consider how different factors interact. Provide reasoning that demonstrates expert-level understanding of SEO, user behavior, and search algorithms. Be extremely detailed, specific, and actionable. Provide code examples, exact wording, and step-by-step instructions. Think like a world-class SEO consultant delivering a $5,000 audit that a TEAM can execute together using this checklist.`;

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
      system: 'You are a world-class SEO and AEO consultant with 15+ years of experience. You provide comprehensive, actionable audits worth $5,000+. You analyze data deeply, identify patterns and connections between factors, and think through the reasoning behind each recommendation. You go deep into every aspect of optimization, provide specific implementation steps with detailed explanations of WHY each change matters, and deliver measurable results. You think strategically while being extremely practical. Take your time to analyze thoroughly - quality and depth are paramount.',
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
