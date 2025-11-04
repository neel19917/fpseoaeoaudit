# Token Limit Guide

## What are Token Errors?

Token errors occur when either:
1. **Input is too large**: The webpage content + prompt is too long
2. **Output limit is too small**: The `max_tokens` setting doesn't allow for a complete audit
3. **Model context limit**: Total tokens (input + output) exceed the model's maximum

## Common Error Messages

```
prompt is too long: X tokens
max_tokens: output tokens exceeds limit
context length exceeded
```

## Solutions

### 1. **Increase Max Tokens** (Recommended First Step)

Go to Options (gear icon) → **Max Tokens (Output Length)**:
- **4,096 tokens**: Short audit (~$0.10) - Only for simple pages
- **8,000 tokens**: Standard audit (~$0.20) - Good for medium pages
- **16,000 tokens**: Comprehensive audit (~$0.40) - **RECOMMENDED** ⭐
- **32,000 tokens**: Very detailed (~$0.80) - For complex enterprise sites

### 2. **Switch to a Better Model**

If still getting errors, switch models in Options:

#### Best for Large Pages:
- **claude-opus-4-1** (200K context) - Most capable, handles huge pages
- **claude-sonnet-4-5** (200K context) - Recommended balance
- **claude-3-5-sonnet-latest** (200K context) - Previous gen but reliable

#### Budget Options:
- **claude-haiku-4-5** (200K context) - Fastest & cheapest

### 3. **Check the Console for Details**

Enable **Verbose Logging** in Options to see:
- Exact prompt length in characters
- Token usage from API
- Which limit was exceeded

### 4. **Understand the Math**

The extension sends:
- **System prompt**: ~300 tokens
- **Instructions + template**: ~5,000 tokens
- **Your page data**: Variable (500-10,000+ tokens)
- **Expected output**: Whatever you set for `max_tokens`

**Total = Input + Output must fit in model's context**

For example:
- Page content: 8,000 tokens
- Template/instructions: 5,000 tokens
- **Input total**: 13,000 tokens
- **Output**: 16,000 tokens (your setting)
- **Total needed**: 29,000 tokens ✓ Fits in all modern Claude models

## Model Context Limits (2025)

| Model | Context Limit | Good For |
|-------|---------------|----------|
| claude-sonnet-4-5 | 200,000 tokens | ✅ Everything |
| claude-opus-4-1 | 200,000 tokens | ✅ Everything (highest quality) |
| claude-haiku-4-5 | 200,000 tokens | ✅ Everything (fastest/cheapest) |
| claude-3-5-sonnet | 200,000 tokens | ✅ Everything |

**All modern Claude models have 200K context**, so token errors are rare. They usually mean:
1. Your `max_tokens` is too low for a comprehensive audit
2. The page has MASSIVE content (>50K tokens of text)

## Cost Optimization

If you want to save money but still get good audits:

1. Use **claude-haiku-4-5** (10x cheaper than Opus)
2. Set max_tokens to **8000** (half the cost of 16K)
3. Still get excellent audits, just slightly shorter

## Current Extension Defaults

- **Model**: `claude-sonnet-4-5` (Best balance)
- **Max Tokens**: `16000` (Comprehensive audits)
- **Temperature**: `0.5` (Good mix of creativity and consistency)

## What Each Token Setting Gets You

### 4,096 Tokens (~1,500 words)
- Critical issues only
- Brief recommendations
- Basic schema examples
- **Use for**: Quick checks, small pages

### 8,000 Tokens (~3,000 words)
- Top 10 recommendations
- Detailed title/meta analysis
- Schema markup examples
- Image optimization checklist
- **Use for**: Standard audits

### 16,000 Tokens (~6,000 words) ⭐ **RECOMMENDED**
- ALL sections in full depth
- Multiple schema examples
- Complete checklists
- Before/after examples
- Team collaboration notes
- Priority matrix
- **Use for**: Professional audits you share with your team

### 32,000 Tokens (~12,000 words)
- EXTREMELY detailed
- Every possible recommendation
- Extensive code examples
- Long-term strategy sections
- **Use for**: Enterprise sites, comprehensive documentation

## Debugging Token Errors

1. **Enable Verbose Logging** in Options
2. Run an audit
3. Open Console (F12 → Console tab)
4. Look for:
```
[SEO Auditor VERBOSE] Prompt length: XXXXX characters
[SEO Auditor VERBOSE] Max tokens: XXXXX
[SEO Auditor] API error: ...
```

5. Check the **exact error message** - it will tell you:
   - If input is too long
   - If max_tokens is the issue
   - Suggested fixes

## Still Having Issues?

If you're still getting token errors after:
- Setting max_tokens to 16000
- Using claude-sonnet-4-5 or claude-opus-4-1
- Enabling verbose logging

Then the page is **exceptionally large** (rare). Solutions:
1. Manually reduce the page content before auditing
2. Focus on specific sections rather than full page
3. Use a different page/URL
4. Check if the page has massive amounts of structured data or hidden text

## API Costs Reference (Approximate)

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Typical Audit Cost |
|-------|----------------------|------------------------|-------------------|
| claude-haiku-4-5 | $1.00 | $5.00 | $0.05-$0.15 |
| claude-sonnet-4-5 | $3.00 | $15.00 | $0.15-$0.50 |
| claude-opus-4-1 | $15.00 | $75.00 | $0.75-$2.50 |

**16K tokens = 0.016M tokens output**

For a typical audit:
- Input: 10K tokens = $0.03-$0.15
- Output: 16K tokens = $0.08-$1.20
- **Total: $0.11-$1.35 per audit**

Most users spend **$0.20-$0.40 per audit** with default settings.

---

## Quick Fix Checklist

- [ ] Go to Options (click gear icon)
- [ ] Set **Max Tokens** to **16000**
- [ ] Select **claude-sonnet-4-5** or **claude-opus-4-1**
- [ ] Enable **Verbose Logging**
- [ ] Click **Save Settings**
- [ ] Reload the extension (chrome://extensions → Reload)
- [ ] Try the audit again
- [ ] Check console for detailed logs

This should fix 99% of token errors!

