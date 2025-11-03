# Testing Guide for Error Logging & Background Audit Features

## Pre-Test Setup

1. **Reload the extension**
   ```
   chrome://extensions → Reload button
   ```

2. **Enable verbose logging**
   - Open extension Options
   - Check "Enable Verbose Logging"
   - Click "Save Settings"

3. **Open browser console**
   - Right-click extension icon → Inspect Popup
   - Or press F12 in popup window

## Test Cases

### Test 1: Basic Audit with Logging

**Steps:**
1. Navigate to any website (e.g., https://example.com)
2. Open extension popup
3. Click "Run Audit"
4. Watch console for log messages

**Expected Results:**
- ✅ Console shows: `[Popup] Starting audit at [time]`
- ✅ Console shows: `[SEO Auditor] Starting audit for tab [id]`
- ✅ Console shows verbose logs (signal collection, API call, etc.)
- ✅ Console shows: `[Popup] Audit completed in [X]s`
- ✅ Extension badge shows ⏳ while running
- ✅ Extension badge shows ✓ when complete
- ✅ Results display in popup

### Test 2: Background Audit Persistence

**Steps:**
1. Navigate to any website
2. Open extension popup
3. Click "Run Audit"
4. **Immediately close the popup** (while audit is running)
5. Wait 15-30 seconds
6. Check extension badge
7. Reopen popup

**Expected Results:**
- ✅ Badge shows ⏳ while audit runs (even with popup closed)
- ✅ Badge changes to ✓ when complete
- ✅ Results are displayed when popup reopens
- ✅ Console shows: `[Popup] Loaded saved audit from [date]`

### Test 3: Multi-Tab State Tracking

**Steps:**
1. Open Tab A: https://example.com
2. Open Tab B: https://google.com
3. In Tab A: Open popup, start audit, close popup
4. Switch to Tab B: Open popup, start audit, close popup
5. Wait for both to complete
6. Switch between tabs and check badges

**Expected Results:**
- ✅ Each tab shows its own badge status
- ✅ Tab A badge: ✓ (or ⏳ if still running)
- ✅ Tab B badge: ✓ (or ⏳ if still running)
- ✅ Opening popup in Tab A shows Tab A results
- ✅ Opening popup in Tab B shows Tab B results

### Test 4: Error Handling & Logging

**Steps:**
1. Go to Options
2. Change API key to invalid value: `sk-ant-invalid123`
3. Save settings
4. Navigate to any website
5. Open popup, click "Run Audit"
6. Wait for error

**Expected Results:**
- ✅ Badge shows ✗ (red)
- ✅ Error message displayed in popup
- ✅ Console shows `[SEO Auditor ERROR]` with context
- ✅ Error stored in chrome.storage
- ✅ Debug button (🐛) appears in popup (if verbose enabled)
- ✅ Clicking Debug button shows error details

### Test 5: Debug Button

**Steps:**
1. Ensure verbose logging is enabled
2. Trigger an error (use invalid API key)
3. Open popup
4. Look for 🐛 button in top-left corner
5. Click the button

**Expected Results:**
- ✅ Button appears (semi-transparent, top-left)
- ✅ Clicking shows alert with error details
- ✅ Alert includes: timestamp, context, message
- ✅ Console logs full error object

### Test 6: Verbose Logging Toggle

**Steps:**
1. Open Options
2. Uncheck "Enable Verbose Logging"
3. Save settings
4. Run an audit
5. Check console
6. Re-enable verbose logging
7. Run another audit
8. Check console

**Expected Results:**
- ✅ Without verbose: Only basic logs (`[SEO Auditor]`, `[Popup]`)
- ✅ With verbose: Detailed logs (`[SEO Auditor VERBOSE]`)
- ✅ Verbose logs include: model info, signal details, response data, duration
- ✅ Debug button only appears when verbose enabled

### Test 7: Badge State Restoration

**Steps:**
1. Navigate to a website
2. Run audit, wait for completion (✓ badge)
3. Switch to another tab
4. Switch back to original tab
5. Check badge

**Expected Results:**
- ✅ Badge shows ✓ (restored from storage)
- ✅ Console shows: `Restored badge for tab [id]: complete`

### Test 8: Tab Cleanup

**Steps:**
1. Navigate to a website
2. Run audit
3. Note the tab ID from console
4. Close the tab
5. Check console

**Expected Results:**
- ✅ Console shows: `Cleaned up state for closed tab [id]`
- ✅ State removed from memory and storage

### Test 9: Logs Viewer (Verbose Mode)

**Steps:**
1. Enable verbose logging
2. Run an audit
3. Wait for completion
4. Look for 📝 button next to download button
5. Click the logs viewer button

**Expected Results:**
- ✅ Logs button (📝) appears after audit completes
- ✅ Clicking opens full-screen logs viewer
- ✅ Logs show timestamps
- ✅ Logs show all audit steps
- ✅ Error logs highlighted in red
- ✅ Verbose logs have different styling
- ✅ Close button (✕) works

### Test 10: Error Storage & Retrieval

**Steps:**
1. Trigger an error (invalid API key)
2. Open Chrome DevTools (F12)
3. Go to: Application → Storage → Extension Storage → Local
4. Find `lastError` key
5. Inspect value

**Expected Results:**
- ✅ `lastError` key exists
- ✅ Contains: timestamp, context, message, stack
- ✅ `lastErrorTime` key exists with timestamp
- ✅ Error details match what's shown in Debug button

## Manual Verification Checklist

- [ ] Badge indicators work correctly (⏳ ✓ ✗)
- [ ] Audits run in background when popup is closed
- [ ] Results persist across popup close/open
- [ ] Each tab maintains independent state
- [ ] Console logging is comprehensive
- [ ] Verbose mode provides detailed info
- [ ] Errors are logged with full context
- [ ] Debug button shows last error
- [ ] Logs viewer works correctly
- [ ] Badge state restores after tab switch
- [ ] Tab state cleans up when tab closes
- [ ] Duration tracking shows correct times
- [ ] Storage keys are created correctly

## Console Log Examples

### Successful Audit:
```
[SEO Auditor] Verbose logging enabled
[Popup] Starting audit at 10:30:45 AM
[SEO Auditor] Starting audit for tab 123
[SEO Auditor] Tab 123 state: running
[SEO Auditor VERBOSE] Model: claude-sonnet-4-5-20250929 Verbose logging: true
[SEO Auditor VERBOSE] Starting API call with signals: (19) ['url', 'timestamp', 'title', ...]
[SEO Auditor VERBOSE] Response data: { id: 'msg_...', model: '...', usage: {...} }
[SEO Auditor] Audit completed for tab 123 in 15.3s
[SEO Auditor] Tab 123 state: complete
[Popup] Audit completed in 15.3s
```

### Failed Audit:
```
[Popup] Starting audit at 10:35:12 AM
[SEO Auditor] Starting audit for tab 124
[SEO Auditor] Tab 124 state: running
[SEO Auditor ERROR] RUN_AUDIT execution: {
  timestamp: "2024-11-03T10:35:15.234Z",
  context: "RUN_AUDIT execution",
  message: "Invalid API key format",
  tabId: 124,
  duration: 3234,
  url: "https://example.com"
}
[SEO Auditor] Audit failed for tab 124 after 3.2s
[SEO Auditor] Tab 124 state: error
[Popup ERROR] runAudit - API call failed: { ... }
```

## Troubleshooting

**Badge not showing:**
- Reload extension
- Check console for errors
- Verify manifest.json has no issues

**Debug button not appearing:**
- Ensure verbose logging is enabled
- Reload popup
- Check console for errors

**Logs not persisting:**
- Check chrome.storage.local permissions
- Verify extension has storage access
- Look for quota errors in console

**State not restoring:**
- Check if 7-day expiry has passed
- Verify storage keys exist (chrome DevTools)
- Look for storage errors in console

## Performance Benchmarks

Typical audit timings (will vary by page complexity):
- Signal collection: 0.1-0.5s
- API call: 10-30s (depends on Claude response time)
- Total audit: 10-30s

These are logged in verbose mode.

## Next Steps After Testing

If all tests pass:
1. Document any issues found
2. Test on different websites
3. Test with different Claude models
4. Test with slow network connections
5. Test with very large pages (many images/links)
6. Stress test with multiple tabs

If issues found:
1. Note the specific test case that failed
2. Copy console error messages
3. Use Debug button to get error details
4. Check chrome.storage for state
5. Report with full context

