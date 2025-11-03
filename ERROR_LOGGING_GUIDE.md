# Error Logging & Background Audit Guide

## Overview
The SEO & AEO Auditor now includes comprehensive error logging and background audit tracking, allowing audits to run independently of the popup and providing detailed debugging information.

## Features

### 1. Extension Badge Indicators
The extension icon shows the current audit status for each tab:

- **⏳ (Green)**: Audit is currently running
- **✓ (Blue)**: Audit completed successfully
- **✗ (Red)**: Audit failed with an error
- **No badge**: No recent audit activity

**How it works:**
- Badge persists even when you close the popup
- Badge follows you as you switch tabs
- Automatically restores when you reopen the extension

### 2. Background Audit Execution
Audits now run in the background service worker, meaning:

- ✅ You can close the popup while an audit is running
- ✅ Audit will continue in the background
- ✅ Results are saved and restored when you reopen the popup
- ✅ Each tab tracks its own audit state independently

**Usage:**
1. Click "Run Audit"
2. Close the popup (audit continues)
3. Navigate to other tabs or pages
4. Return to the original tab
5. Open the popup to see completed results

### 3. Comprehensive Error Logging

#### Console Logging
All major operations are logged to the browser console with context:

```
[SEO Auditor] Starting audit for tab 123
[SEO Auditor] Tab 123 state: running
[SEO Auditor] Audit completed for tab 123 in 15.3s
[Popup] Starting audit at 10:30:45 AM
[Popup] Audit completed in 15.3s
```

#### Verbose Logging
Enable in Options page for detailed debugging:
- API request/response details
- Signal collection breakdown
- Performance metrics
- Model and configuration info

**To enable verbose logging:**
1. Go to Options (gear icon)
2. Check "Enable Verbose Logging"
3. Save settings
4. Check browser console for `[SEO Auditor VERBOSE]` messages

#### Error Storage
Every error is automatically stored with:
- Timestamp
- Context (where it occurred)
- Error message
- Stack trace
- Additional metadata (URL, tab ID, duration, etc.)

**To view last error:**
1. Enable verbose logging in Options
2. Open the popup
3. Click the "🐛 Debug" button in the top-left corner
4. View error details in the alert and console

### 4. Audit State Tracking

Each tab maintains its own audit state including:
- Status (idle, running, complete, error)
- Start time
- URL being audited
- Duration
- Error details (if failed)
- Analysis length

State persists across:
- Tab switches
- Popup close/open
- Page navigation (results saved separately)

## Debugging Workflow

### If an audit fails:

1. **Check the badge:**
   - ✗ badge = error occurred
   - No badge = audit may not have started

2. **Open browser console:**
   - Right-click extension icon → Inspect Popup
   - Check for `[SEO Auditor ERROR]` messages
   - Look for red error logs with full context

3. **Enable verbose logging:**
   - Go to Options
   - Enable "Enable Verbose Logging"
   - Run audit again
   - Check console for detailed trace

4. **View last error:**
   - Click "🐛 Debug" button in popup (appears in verbose mode)
   - Review error context and message
   - Check console for full stack trace

5. **Check error storage:**
   - Open Chrome DevTools
   - Go to Application → Storage → Extension Storage
   - Look for `lastError` and `lastErrorTime` keys

### Common errors and solutions:

**"API key not configured"**
- Solution: Go to Options and save your Anthropic API key

**"No signals collected from page"**
- Solution: Make sure you're on a valid HTML page (not chrome:// or about:)

**"401 Unauthorized"**
- Solution: API key is invalid, check your key in Options

**"Service worker registration failed"**
- Solution: Reload the extension in chrome://extensions

## Technical Details

### Error Log Format
```javascript
{
  timestamp: "2024-11-03T10:30:45.123Z",
  context: "RUN_AUDIT execution",
  message: "API returned status 401",
  stack: "Error: API returned...\n  at callClaudeAPI...",
  tabId: 123,
  duration: 5432,
  url: "https://example.com"
}
```

### State Management
- In-memory Map for active tabs
- chrome.storage.local for persistence
- Automatic cleanup when tabs close
- Badge restoration on tab activation

### Message Handlers
- `RUN_AUDIT`: Execute audit with state tracking
- `GET_AUDIT_STATE`: Query current state for tab
- `GET_LAST_ERROR`: Retrieve last error for debugging
- `TEST_API_KEY`: Validate API key with error logging

## Best Practices

1. **Always enable verbose logging during development**
   - Provides detailed insights into extension behavior
   - Helps identify issues quickly

2. **Monitor the extension badge**
   - Quick visual confirmation of audit status
   - No need to keep popup open

3. **Check console regularly**
   - All major operations are logged
   - Errors include full context

4. **Use the Debug button**
   - Quick access to last error
   - Useful for sharing error details

5. **Let audits complete in background**
   - Close popup after starting audit
   - Check badge for completion
   - Reopen popup to view results

## Performance Metrics

All audits now include duration tracking:
- Signal collection time
- API request time
- Total audit duration
- Logged in console and verbose logs

Example console output:
```
[Popup] Audit completed in 15.3s
[SEO Auditor] Audit completed for tab 123 in 15.3s
```

## Storage Keys

The extension uses these storage keys:
- `lastError`: Last error object with full details
- `lastErrorTime`: Timestamp of last error
- `auditState_[tabId]`: State for specific tab
- `lastAudit`: Most recent audit results (7-day expiry)
- `auditHistory`: Recent audit history (5 audits)

## Console Commands

You can inspect extension state from the console:

```javascript
// View current storage
chrome.storage.local.get(null, console.log);

// Get last error
chrome.storage.local.get(['lastError', 'lastErrorTime'], console.log);

// Clear error log
chrome.storage.local.remove(['lastError', 'lastErrorTime']);
```

## Future Enhancements

Potential additions:
- Error history (not just last error)
- Audit queue for multiple simultaneous audits
- Progress percentage during audit
- Notification when background audit completes
- Export error logs

