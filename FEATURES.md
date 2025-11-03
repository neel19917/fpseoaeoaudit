# SEO & AEO Auditor - Feature Documentation

## Latest Updates

### ✅ CORS Issue Fixed
- Added required `anthropic-dangerous-direct-browser-access` header to all API calls
- API key testing and audits now work without CORS errors

### ✅ Persistent Audit Storage
**Results are now automatically saved and restored!**

#### How It Works
- **Automatic Saving**: Every audit result is automatically saved to browser storage
- **Auto-Restore**: When you reopen the extension, your last audit is automatically loaded
- **Storage Duration**: Results are kept for 7 days, then automatically cleared
- **Visual Indicator**: Restored results show "(Restored from storage)" label

#### What Gets Saved
- Full audit analysis
- Page metadata (URL, title, stats)
- Collected signals
- Verbose logs (if enabled)
- Timestamp

#### Benefits
- Close and reopen extension without losing results
- Navigate away and come back later
- Share your browser with same results available
- No need to re-run audits for the same page

### ✅ Latest Claude Models Added
The extension now supports the latest Claude 4 models:
- **claude-sonnet-4-5-20250929** (Latest - Recommended) 
- **claude-opus-4-1-20250805** (Most capable)
- **claude-haiku-4-5-20251015** (Fastest, cheapest)
- Previous generation models still available (Claude 3.5 Sonnet, Haiku, Opus, etc.)

### ✅ Verbose Logging System

#### Enable Verbose Logging
1. Open extension settings (gear icon or options page)
2. Check "Enable Verbose Logging"
3. Click "Save Settings"

#### What Gets Logged
When verbose logging is enabled, detailed information is logged to:
- **Browser Console** (F12 → Console tab)
  - API call details
  - Model used
  - Prompt length
  - Response time
  - Token usage
  - Signal collection details

- **In-App Log Viewer** (see below)

#### Access Logs
- A 📝 button appears in the results header when verbose logging is enabled
- Click it to view detailed logs of the audit process
- Logs show:
  - Timestamps
  - Step-by-step process
  - Error messages (if any)
  - Detailed statistics

### ✅ Enhanced Download Functionality

#### Comprehensive Reports
Downloaded reports now include:
- **Metadata Header**
  - Generated timestamp
  - Page URL (clickable)
  - Page title
  - Claude model used
  - Word count
  - Link statistics
  - Image statistics

- **Full Audit Analysis**
  - All Claude AI recommendations
  - SEO and AEO scores
  - Prioritized fixes

- **Audit Metadata Section**
  - Complete audit details
  - Easy to track and share

#### Smart Filenames
Downloads are automatically named based on:
- Page title (slugified)
- Timestamp
- Example: `seo-audit-homepage-example-com-1730000000000.md`

### ✅ Linkable Results

#### In-App Links
- Results display includes clickable URL to audited page
- Opens in new tab for easy reference

#### Copy with Metadata
- Copied results now include:
  - Page URL
  - Page title
  - Generation timestamp
  - Full analysis
- Perfect for sharing with team or documentation

## How to Use

### Basic Audit
1. Navigate to any webpage
2. Click the extension icon
3. Click "Run Audit"
4. View results
5. **Results are automatically saved** - come back anytime!

### Restored Results
- When you reopen the extension, previous results load automatically
- Look for "(Restored from storage)" label in the audit details
- Results stay saved for 7 days
- Running a new audit replaces the saved results

### With Verbose Logging
1. Enable verbose logging in settings
2. Run audit
3. Click 📝 to view detailed logs
4. Check browser console for technical details

### Download Report
1. Run audit
2. Click 💾 (download icon)
3. Markdown file saves with full metadata

### Copy Results
1. Run audit
2. Click 📋 (copy icon)
3. Paste anywhere (includes URL and metadata)

## Console Output Examples

### With Verbose Logging Enabled
```
[SEO Auditor VERBOSE] Calling Claude API...
[SEO Auditor VERBOSE] Model: claude-sonnet-4-5-20250929
[SEO Auditor VERBOSE] Prompt length: 2453 characters
[SEO Auditor VERBOSE] Max tokens: 4096
[SEO Auditor VERBOSE] Temperature: 0.3
[SEO Auditor VERBOSE] API response received in 2341 ms
[SEO Auditor VERBOSE] Response status: 200 OK
[SEO Auditor VERBOSE] Response data: {id: "...", model: "...", usage: {...}}
[SEO Auditor VERBOSE] Analysis length: 3245 characters
```

### Regular Logging
```
[SEO Auditor] Calling Claude API with key length: 108 model: claude-sonnet-4-5-20250929
[Popup] Starting audit with verbose logging enabled
[Popup] Model: claude-sonnet-4-5-20250929
[Popup] Signals collected: {url: "...", title: "...", wordCount: 1234}
[Popup] Audit completed successfully
[Popup] Analysis length: 3245 characters
```

## Log Viewer UI

The in-app log viewer shows:
- **Timestamp** - When each step occurred
- **Message** - What happened
- **Type** - Info (blue), Verbose (gray), or Error (red)

### Log Types
- **Info** (blue border) - Main process steps
- **Verbose** (gray border) - Detailed information
- **Error** (red border) - Issues that occurred

## API Key Storage

Your API key is stored:
- **Chrome Sync Storage** (syncs across devices)
- **Local Storage** (backup)
- Never shared or transmitted except to Anthropic API
- Masked by default in UI

## Troubleshooting

### Check Verbose Logs
1. Enable verbose logging
2. Run audit
3. Click 📝 to see where it failed
4. Check console (F12) for technical details

### Common Issues
- **401 Unauthorized**: Invalid API key
  - Check key in settings
  - Verify it starts with `sk-ant-`
  - Get new key from console.anthropic.com
  
- **CORS errors**: Should be fixed now
  - Reload extension if still occurring
  
- **No signals collected**: Page not accessible
  - Can't audit chrome:// pages
  - Wait for page to fully load

## Model Selection

### Claude Sonnet 4.5 (Recommended)
- Best balance of speed, cost, and quality
- Optimized for real-world tasks
- Great for coding and analysis

### Claude Opus 4.1 (Most Capable)
- Highest intelligence
- Best for complex analysis
- More expensive, slower

### Claude Haiku 4.5 (Fastest)
- Quickest responses
- Most cost-effective
- Still highly capable

## Privacy & Security

- API key stored locally in your browser
- Keys never transmitted except to Anthropic API
- **Audit results stored locally in browser storage**
- **Results never leave your device**
- No data collected by extension
- All processing happens client-side
- Audit data automatically expires after 7 days

## Storage Management

### What's Stored
- **Last Audit**: Full audit results with metadata (expires after 7 days)
- **Audit History**: Basic info about last 5 audits (URL, title, timestamp)
- **Settings**: API key, model selection, verbose logging preference

### Storage Location
- Chrome Local Storage (stays on your device)
- Chrome Sync Storage (for settings that sync across devices)

### Clear Storage
To clear stored audits:
1. Run a new audit (replaces saved audit)
2. Or wait 7 days (automatic expiration)
3. Or clear browser data for the extension

## Support

If you encounter issues:
1. Enable verbose logging
2. Check the logs viewer
3. Check browser console
4. Reload extension
5. Verify API key is valid

---

*Last updated: November 2024*


