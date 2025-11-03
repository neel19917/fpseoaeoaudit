/**
 * Popup script for SEO & AEO Auditor.
 * Handles UI interactions and coordinates with content script and background worker.
 */

const UI = {
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  initialState: document.getElementById('initialState'),
  results: document.getElementById('results'),
  resultsContent: document.getElementById('resultsContent'),
  settings: document.getElementById('settings'),
  settingsBtn: document.getElementById('settingsBtn'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  apiKeyInput: document.getElementById('apiKey'),
  modelSelect: document.getElementById('model'),
  toggleKeyBtn: document.getElementById('toggleKey'),
  saveBtn: document.getElementById('saveBtn'),
  testBtn: document.getElementById('testBtn'),
  settingsStatus: document.getElementById('settingsStatus'),
  runAuditBtn: document.getElementById('runAuditBtn'),
  runAgainBtn: document.getElementById('runAgainBtn'),
  copyBtn: document.getElementById('copyBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  toggleLogsBtn: document.getElementById('toggleLogsBtn'),
  logsViewer: document.getElementById('logsViewer'),
  logsContent: document.getElementById('logsContent'),
  closeLogsBtn: document.getElementById('closeLogsBtn')
};

let currentAnalysis = '';
let currentSignals = null;
let currentMetadata = null; // Store audit metadata
let isKeyVisible = false;
let auditLogs = []; // Store logs for this audit session

/**
 * Adds a log entry to the audit logs
 */
function addLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  auditLogs.push({ timestamp, message, type });
}

/**
 * Shows the logs viewer
 */
function showLogs() {
  if (auditLogs.length === 0) {
    alert('No logs available for this audit.');
    return;
  }
  
  // Build logs HTML
  let logsHTML = '';
  auditLogs.forEach(log => {
    const typeClass = log.type === 'error' ? 'error' : (log.type === 'verbose' ? 'verbose' : '');
    logsHTML += `<div class="log-entry ${typeClass}">`;
    logsHTML += `<span class="log-timestamp">${log.timestamp}</span>`;
    logsHTML += `<span>${escapeHtml(log.message)}</span>`;
    logsHTML += `</div>`;
  });
  
  UI.logsContent.innerHTML = logsHTML;
  UI.logsViewer.classList.remove('hidden');
}

/**
 * Hides the logs viewer
 */
function hideLogs() {
  UI.logsViewer.classList.add('hidden');
}

/**
 * Shows an error message to the user.
 */
function showError(message) {
  UI.error.textContent = message;
  UI.error.classList.remove('hidden');
  UI.loading.classList.add('hidden');
  UI.results.classList.add('hidden');
}

/**
 * Hides error message.
 */
function hideError() {
  UI.error.classList.add('hidden');
}

/**
 * Shows loading state.
 */
function showLoading() {
  UI.loading.classList.remove('hidden');
  UI.error.classList.add('hidden');
  UI.initialState.classList.add('hidden');
  UI.results.classList.add('hidden');
  // Clear previous results
  UI.resultsContent.innerHTML = '';
}

/**
 * Collects signals directly from the page (fallback if content script isn't available).
 */
function collectSignalsFromPage() {
  const signals = {
    url: window.location.href,
    timestamp: Date.now(),
    title: '',
    metaDescription: '',
    canonical: '',
    robots: '',
    lang: '',
    headings: [],
    internalLinks: [],
    externalLinks: [],
    images: [],
    structuredData: [],
    ogTags: {},
    twitterTags: {},
    bodyTextSample: '',
    wordCount: 0,
    linkCounts: { internal: 0, external: 0, total: 0 },
    imageStats: { total: 0, withAlt: 0, withoutAlt: 0, missingAltExamples: [] }
  };

  try {
    const titleEl = document.querySelector('title');
    signals.title = titleEl ? titleEl.textContent.trim() : '';

    const metaDesc = document.querySelector('meta[name="description"]');
    signals.metaDescription = metaDesc ? metaDesc.content.trim() : '';

    const canonicalEl = document.querySelector('link[rel="canonical"]');
    signals.canonical = canonicalEl ? canonicalEl.href : '';

    const robotsEl = document.querySelector('meta[name="robots"]');
    signals.robots = robotsEl ? robotsEl.content.trim() : '';

    const htmlLang = document.documentElement.getAttribute('lang') || 
                     document.documentElement.getAttribute('xml:lang') || '';
    signals.lang = htmlLang;

    const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    signals.headings = allHeadings.slice(0, 30).map(h => ({
      level: parseInt(h.tagName.substring(1)),
      text: h.textContent.trim()
    }));

    const currentHost = window.location.hostname;
    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    const processedLinks = [];
    
    for (const link of allLinks) {
      try {
        const href = link.href;
        if (href.startsWith('data:') || href.startsWith('javascript:')) continue;
        
        const url = new URL(href, window.location.href);
        if (url.hash && url.pathname === window.location.pathname && 
            url.hostname === currentHost) continue;
        
        const isInternal = url.hostname === currentHost || 
                          url.hostname === '' ||
                          url.hostname === window.location.hostname;
        
        processedLinks.push({
          href: url.href.split('#')[0],
          text: link.textContent.trim(),
          isInternal
        });
      } catch (e) {
        continue;
      }
    }

    const internalLinks = processedLinks.filter(l => l.isInternal);
    const externalLinks = processedLinks.filter(l => !l.isInternal);
    
    signals.internalLinks = internalLinks.slice(0, 10).map(l => ({ href: l.href, text: l.text }));
    signals.externalLinks = externalLinks.slice(0, 10).map(l => ({ href: l.href, text: l.text }));
    
    signals.linkCounts = {
      internal: internalLinks.length,
      external: externalLinks.length,
      total: processedLinks.length
    };

    const allImages = Array.from(document.querySelectorAll('img'));
    const imagesWithoutAlt = [];
    
    allImages.slice(0, 10).forEach(img => {
      const hasAlt = img.hasAttribute('alt');
      const altText = img.alt || '';
      
      if (!hasAlt || altText.trim() === '') {
        imagesWithoutAlt.push({
          src: img.src.substring(0, 100),
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        });
      }
    });
    
    signals.imageStats = {
      total: allImages.length,
      withAlt: allImages.filter(img => img.alt && img.alt.trim()).length,
      withoutAlt: imagesWithoutAlt.length,
      missingAltExamples: imagesWithoutAlt.slice(0, 10)
    };

    const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    signals.structuredData = jsonLdScripts.map(script => {
      try {
        const data = JSON.parse(script.textContent);
        return {
          type: Array.isArray(data) ? data[0]?.['@type'] : data['@type'],
          raw: script.textContent.substring(0, 500)
        };
      } catch (e) {
        return { type: 'parse_error', raw: script.textContent.substring(0, 500) };
      }
    });

    const ogSelectors = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name'];
    ogSelectors.forEach(prop => {
      const el = document.querySelector(`meta[property="${prop}"]`);
      if (el) {
        signals.ogTags[prop] = el.content.trim();
      }
    });

    const twitterSelectors = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];
    twitterSelectors.forEach(name => {
      const el = document.querySelector(`meta[name="${name}"]`);
      if (el) {
        signals.twitterTags[name] = el.content.trim();
      }
    });

    const bodyText = document.body ? document.body.textContent || '' : '';
    signals.bodyTextSample = bodyText.replace(/\s+/g, ' ').trim().substring(0, 3000);
    signals.wordCount = bodyText.trim().split(/\s+/).filter(word => word.length > 0).length;

    return signals;
  } catch (error) {
    console.error('Error collecting signals:', error);
    return signals; // Return partial signals
  }
}

/**
 * Gets signals from the current tab's content script.
 */
async function getSignals() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if we can access the page
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || 
        tab.url.startsWith('moz-extension://') || tab.url.startsWith('about:')) {
      throw new Error('Cannot analyze this page type. Please navigate to a regular webpage.');
    }

    // Try to refresh signals (for SPAs that may have changed)
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_SIGNALS' });
    } catch (e) {
      // Content script may not be ready, that's ok - we'll inject it
    }

    // Try to get signals from content script first
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return window.__SEO_AEO_SIGNALS__ || null;
        }
      });

      if (results && results[0] && results[0].result) {
        return results[0].result;
      }
    } catch (e) {
      console.log('Content script not available, injecting fallback...');
    }

    // Fallback: inject and collect signals directly
    // We need to inject the function as code since it can't be serialized
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function() {
        const signals = {
          url: window.location.href,
          timestamp: Date.now(),
          title: '',
          metaDescription: '',
          canonical: '',
          robots: '',
          lang: '',
          headings: [],
          internalLinks: [],
          externalLinks: [],
          images: [],
          structuredData: [],
          ogTags: {},
          twitterTags: {},
          bodyTextSample: '',
          wordCount: 0,
          linkCounts: { internal: 0, external: 0, total: 0 },
          imageStats: { total: 0, withAlt: 0, withoutAlt: 0, missingAltExamples: [] }
        };

        try {
          const titleEl = document.querySelector('title');
          signals.title = titleEl ? titleEl.textContent.trim() : '';

          const metaDesc = document.querySelector('meta[name="description"]');
          signals.metaDescription = metaDesc ? metaDesc.content.trim() : '';

          const canonicalEl = document.querySelector('link[rel="canonical"]');
          signals.canonical = canonicalEl ? canonicalEl.href : '';

          const robotsEl = document.querySelector('meta[name="robots"]');
          signals.robots = robotsEl ? robotsEl.content.trim() : '';

          const htmlLang = document.documentElement.getAttribute('lang') || 
                           document.documentElement.getAttribute('xml:lang') || '';
          signals.lang = htmlLang;

          const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
          signals.headings = allHeadings.slice(0, 30).map(h => ({
            level: parseInt(h.tagName.substring(1)),
            text: h.textContent.trim()
          }));

          const currentHost = window.location.hostname;
          const allLinks = Array.from(document.querySelectorAll('a[href]'));
          const processedLinks = [];
          
          for (const link of allLinks) {
            try {
              const href = link.href;
              if (href.startsWith('data:') || href.startsWith('javascript:')) continue;
              
              const url = new URL(href, window.location.href);
              if (url.hash && url.pathname === window.location.pathname && 
                  url.hostname === currentHost) continue;
              
              const isInternal = url.hostname === currentHost || 
                                url.hostname === '' ||
                                url.hostname === window.location.hostname;
              
              processedLinks.push({
                href: url.href.split('#')[0],
                text: link.textContent.trim(),
                isInternal
              });
            } catch (e) {
              continue;
            }
          }

          const internalLinks = processedLinks.filter(l => l.isInternal);
          const externalLinks = processedLinks.filter(l => !l.isInternal);
          
          signals.internalLinks = internalLinks.slice(0, 10).map(l => ({ href: l.href, text: l.text }));
          signals.externalLinks = externalLinks.slice(0, 10).map(l => ({ href: l.href, text: l.text }));
          
          signals.linkCounts = {
            internal: internalLinks.length,
            external: externalLinks.length,
            total: processedLinks.length
          };

          const allImages = Array.from(document.querySelectorAll('img'));
          const imagesWithoutAlt = [];
          
          allImages.slice(0, 10).forEach(img => {
            const hasAlt = img.hasAttribute('alt');
            const altText = img.alt || '';
            
            if (!hasAlt || altText.trim() === '') {
              imagesWithoutAlt.push({
                src: img.src.substring(0, 100),
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight
              });
            }
          });
          
          signals.imageStats = {
            total: allImages.length,
            withAlt: allImages.filter(img => img.alt && img.alt.trim()).length,
            withoutAlt: imagesWithoutAlt.length,
            missingAltExamples: imagesWithoutAlt.slice(0, 10)
          };

          const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          signals.structuredData = jsonLdScripts.map(script => {
            try {
              const data = JSON.parse(script.textContent);
              return {
                type: Array.isArray(data) ? data[0]?.['@type'] : data['@type'],
                raw: script.textContent.substring(0, 500)
              };
            } catch (e) {
              return { type: 'parse_error', raw: script.textContent.substring(0, 500) };
            }
          });

          const ogSelectors = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name'];
          ogSelectors.forEach(prop => {
            const el = document.querySelector(`meta[property="${prop}"]`);
            if (el) {
              signals.ogTags[prop] = el.content.trim();
            }
          });

          const twitterSelectors = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];
          twitterSelectors.forEach(name => {
            const el = document.querySelector(`meta[name="${name}"]`);
            if (el) {
              signals.twitterTags[name] = el.content.trim();
            }
          });

          const bodyText = document.body ? document.body.textContent || '' : '';
          signals.bodyTextSample = bodyText.replace(/\s+/g, ' ').trim().substring(0, 3000);
          signals.wordCount = bodyText.trim().split(/\s+/).filter(word => word.length > 0).length;

          return signals;
        } catch (error) {
          console.error('Error collecting signals:', error);
          return signals;
        }
      }
    });

    if (!results || !results[0] || !results[0].result) {
      throw new Error('Could not collect page signals. Make sure you are on a valid HTML page.');
    }

    const signals = results[0].result;
    
    // Validate we got meaningful data
    if (!signals.url || (!signals.title && !signals.bodyTextSample)) {
      throw new Error('Page appears to be empty or not fully loaded. Please wait for the page to load completely.');
    }

    return signals;
  } catch (error) {
    if (error.message.includes('Cannot analyze')) {
      throw error;
    }
    throw new Error(`Failed to access page: ${error.message}`);
  }
}

/**
 * Runs the audit by collecting signals and sending to background worker.
 */
async function runAudit() {
  hideError();
  showLoading();
  
  // Clear previous logs
  auditLogs = [];
  addLog('Starting SEO & AEO audit...');

  try {
    // Check if API key is configured (try sync first, fallback to local)
    let result = await chrome.storage.sync.get(['apiKey', 'model', 'verboseLogging']);
    if (!result.apiKey) {
      result = await chrome.storage.local.get(['apiKey', 'model', 'verboseLogging']);
    }
    
    if (!result.apiKey) {
      showError('API key not configured. Please set it in the options page first.');
      addLog('ERROR: API key not configured', 'error');
      return;
    }

    const verboseLogging = result.verboseLogging || false;
    addLog(`Verbose logging: ${verboseLogging ? 'enabled' : 'disabled'}`);
    
    if (verboseLogging) {
      console.log('[Popup] Starting audit with verbose logging enabled');
      console.log('[Popup] Model:', result.model || 'default');
      addLog(`Model: ${result.model || 'default'}`, 'verbose');
      UI.toggleLogsBtn.style.display = 'inline-block';
    }

    // Get signals from content script
    addLog('Collecting page signals...');
    const signals = await getSignals();
    
    if (!signals || Object.keys(signals).length === 0) {
      showError('No signals collected from page. Make sure you are on a valid HTML page.');
      addLog('ERROR: No signals collected', 'error');
      return;
    }

    addLog(`Signals collected: ${Object.keys(signals).length} properties`);
    
    if (verboseLogging) {
      console.log('[Popup] Signals collected:', {
        url: signals.url,
        title: signals.title,
        wordCount: signals.wordCount,
        headings: signals.headings.length,
        internalLinks: signals.linkCounts?.internal,
        externalLinks: signals.linkCounts?.external,
        images: signals.imageStats?.total
      });
      addLog(`URL: ${signals.url}`, 'verbose');
      addLog(`Title: ${signals.title}`, 'verbose');
      addLog(`Word count: ${signals.wordCount}`, 'verbose');
      addLog(`Headings: ${signals.headings.length}`, 'verbose');
      addLog(`Links: ${signals.linkCounts?.total} (${signals.linkCounts?.internal} internal, ${signals.linkCounts?.external} external)`, 'verbose');
      addLog(`Images: ${signals.imageStats?.total} (${signals.imageStats?.withoutAlt} missing alt)`, 'verbose');
    }

    currentSignals = signals;

    // Send to background worker
    addLog('Sending request to Claude AI...');
    const response = await chrome.runtime.sendMessage({
      type: 'RUN_AUDIT',
      signals: signals
    });

    if (!response.success) {
      showError(response.error || 'Audit failed');
      addLog(`ERROR: ${response.error || 'Audit failed'}`, 'error');
      return;
    }

    addLog('Claude AI analysis received');
    
    if (verboseLogging) {
      console.log('[Popup] Audit completed successfully');
      console.log('[Popup] Analysis length:', response.analysis.length, 'characters');
      addLog(`Analysis length: ${response.analysis.length} characters`, 'verbose');
    }

    // Store metadata for download
    currentMetadata = {
      url: signals.url,
      title: signals.title,
      model: result.model || 'claude-sonnet-4-5-20250929',
      timestamp: new Date().toISOString(),
      wordCount: signals.wordCount,
      internalLinks: signals.linkCounts?.internal,
      externalLinks: signals.linkCounts?.external,
      totalImages: signals.imageStats?.total,
      missingAlt: signals.imageStats?.withoutAlt
    };

    // Display results
    currentAnalysis = response.analysis;
    addLog('Displaying results');
    displayResults(response.analysis);
    
    // Save audit to storage for persistence
    await saveAuditToStorage();

  } catch (error) {
    showError(error.message || 'An unexpected error occurred');
    addLog(`ERROR: ${error.message || 'Unknown error'}`, 'error');
    console.error('[Popup] Audit error:', error);
  }
}

/**
 * Displays the audit results in the popup.
 */
function displayResults(analysis) {
  UI.loading.classList.add('hidden');
  UI.results.classList.remove('hidden');
  UI.initialState.classList.add('hidden');
  
  // Convert markdown-like text to HTML (simple conversion)
  const html = formatAnalysis(analysis);
  
  // Add metadata header
  const metadata = currentMetadata || {};
  const savedAt = metadata.savedAt || Date.now();
  const isRestored = metadata.savedAt && (Date.now() - metadata.savedAt > 5000);
  
  let headerHTML = '<div style="background: #f0f7ff; padding: 12px; border-radius: 6px; margin-bottom: 16px; border-left: 4px solid #007bff;">';
  headerHTML += '<div style="font-weight: 600; margin-bottom: 6px;">📊 Audit Details';
  if (isRestored) {
    headerHTML += ' <span style="font-size: 11px; color: #666; font-weight: normal;">(Restored from storage)</span>';
  }
  headerHTML += '</div>';
  if (metadata.url) {
    headerHTML += `<div style="font-size: 12px; color: #555;"><strong>URL:</strong> <a href="${metadata.url}" target="_blank" style="color: #007bff; text-decoration: none;">${metadata.url}</a></div>`;
  }
  if (metadata.title) {
    headerHTML += `<div style="font-size: 12px; color: #555;"><strong>Title:</strong> ${escapeHtml(metadata.title)}</div>`;
  }
  if (metadata.model) {
    headerHTML += `<div style="font-size: 12px; color: #555;"><strong>Model:</strong> ${metadata.model}</div>`;
  }
  headerHTML += `<div style="font-size: 12px; color: #555;"><strong>Generated:</strong> ${new Date(metadata.timestamp || Date.now()).toLocaleString()}</div>`;
  headerHTML += '</div>';
  
  UI.resultsContent.innerHTML = headerHTML + html;
  
  // Scroll to top
  UI.resultsContent.scrollTop = 0;
}

/**
 * Converts markdown-style analysis text to HTML.
 * Handles headers, lists, code blocks, and bold text.
 */
function formatAnalysis(text) {
  let html = text;
  
  // Escape HTML first (but preserve structure for processing)
  const lines = html.split('\n');
  const processed = [];
  let inCodeBlock = false;
  let codeBlockContent = [];
  let inList = false;
  let listItems = [];
  let listOrdered = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Handle code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // Close code block
        processed.push('<pre><code>' + escapeHtml(codeBlockContent.join('\n')) + '</code></pre>');
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        // Open code block
        if (inList) {
          processed.push(listOrdered ? '<ol>' + listItems.join('') + '</ol>' : '<ul>' + listItems.join('') + '</ul>');
          inList = false;
          listItems = [];
        }
        inCodeBlock = true;
      }
      continue;
    }
    
    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }
    
    // Handle headers
    if (line.match(/^### /)) {
      if (inList) {
        processed.push(listOrdered ? '<ol>' + listItems.join('') + '</ol>' : '<ul>' + listItems.join('') + '</ul>');
        inList = false;
        listItems = [];
      }
      processed.push('<h4>' + escapeHtml(line.replace(/^### /, '')) + '</h4>');
      continue;
    }
    
    if (line.match(/^## /)) {
      if (inList) {
        processed.push(listOrdered ? '<ol>' + listItems.join('') + '</ol>' : '<ul>' + listItems.join('') + '</ul>');
        inList = false;
        listItems = [];
      }
      processed.push('<h3>' + escapeHtml(line.replace(/^## /, '')) + '</h3>');
      continue;
    }
    
    // Handle lists
    const numberedMatch = line.match(/^\d+\.\s+(.+)/);
    const bulletMatch = line.match(/^-\s+(.+)/);
    
    if (numberedMatch) {
      // Close previous list if different type
      if (inList && !listOrdered) {
        processed.push('<ul>' + listItems.join('') + '</ul>');
        listItems = [];
        inList = false;
      }
      // Start list if not in one
      if (!inList) {
        inList = true;
        listOrdered = true;
      }
      listItems.push('<li>' + escapeHtml(numberedMatch[1]) + '</li>');
      continue;
    }
    
    if (bulletMatch) {
      // Close previous list if different type
      if (inList && listOrdered) {
        processed.push('<ol>' + listItems.join('') + '</ol>');
        listItems = [];
        inList = false;
      }
      // Start list if not in one
      if (!inList) {
        inList = true;
        listOrdered = false;
      }
      listItems.push('<li>' + escapeHtml(bulletMatch[1]) + '</li>');
      continue;
    }
    
    // End list if line is empty or doesn't match list pattern
    if (inList) {
      const isListItem = line.match(/^\d+\.\s+/) || line.match(/^-\s+/);
      if (line.trim() === '' || !isListItem) {
        processed.push(listOrdered ? '<ol>' + listItems.join('') + '</ol>' : '<ul>' + listItems.join('') + '</ul>');
        inList = false;
        listItems = [];
        listOrdered = false;
      }
    }
    
    // Regular paragraph line (only if not a list item, header, or code block)
    if (line.trim() !== '' && !inCodeBlock && !inList) {
      const isHeader = line.match(/^#{1,6}\s+/);
      const isListItem = line.match(/^\d+\.\s+/) || line.match(/^-\s+/);
      if (!isHeader && !isListItem) {
        let paraText = escapeHtml(line);
        // Process bold (**text**)
        paraText = paraText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Process inline code (`text`)
        paraText = paraText.replace(/`([^`]+)`/g, '<code>$1</code>');
        processed.push('<p>' + paraText + '</p>');
      }
    }
  }
  
  // Close any remaining list
  if (inList) {
    processed.push(listOrdered ? '<ol>' + listItems.join('') + '</ol>' : '<ul>' + listItems.join('') + '</ul>');
  }
  
  return processed.join('\n');
}

/**
 * Escapes HTML special characters.
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Copies the analysis to clipboard.
 */
async function copyResults() {
  try {
    const text = currentAnalysis || '';
    if (!text) {
      alert('No results to copy');
      return;
    }
    
    // Include URL in copied text
    const metadata = currentMetadata || {};
    let copyText = `# SEO & AEO Audit\n\n`;
    if (metadata.url) {
      copyText += `**URL:** ${metadata.url}\n`;
    }
    if (metadata.title) {
      copyText += `**Title:** ${metadata.title}\n`;
    }
    copyText += `**Generated:** ${new Date().toLocaleString()}\n\n---\n\n`;
    copyText += text;
    
    await navigator.clipboard.writeText(copyText);
    UI.copyBtn.textContent = '✓ Copied';
    setTimeout(() => {
      UI.copyBtn.textContent = '📋';
    }, 2000);
  } catch (error) {
    alert('Failed to copy to clipboard: ' + error.message);
  }
}

/**
 * Downloads the analysis as a Markdown file.
 */
function downloadResults() {
  const text = currentAnalysis || '';
  if (!text) {
    alert('No results to download');
    return;
  }

  // Build comprehensive report with metadata
  const timestamp = new Date().toISOString();
  const metadata = currentMetadata || {};
  
  let fullReport = `# SEO & AEO Audit Report\n\n`;
  fullReport += `**Generated:** ${new Date(timestamp).toLocaleString()}\n`;
  fullReport += `**URL:** ${metadata.url || 'Unknown'}\n`;
  fullReport += `**Model:** ${metadata.model || 'Unknown'}\n`;
  fullReport += `**Title:** ${metadata.title || 'Unknown'}\n\n`;
  fullReport += `---\n\n`;
  fullReport += text;
  fullReport += `\n\n---\n\n`;
  fullReport += `## Audit Metadata\n\n`;
  fullReport += `- **Audit Timestamp:** ${timestamp}\n`;
  fullReport += `- **Page URL:** ${metadata.url || 'N/A'}\n`;
  fullReport += `- **Page Title:** ${metadata.title || 'N/A'}\n`;
  fullReport += `- **Model Used:** ${metadata.model || 'N/A'}\n`;
  fullReport += `- **Word Count:** ${metadata.wordCount || 'N/A'}\n`;
  fullReport += `- **Internal Links:** ${metadata.internalLinks || 'N/A'}\n`;
  fullReport += `- **External Links:** ${metadata.externalLinks || 'N/A'}\n`;
  fullReport += `- **Total Images:** ${metadata.totalImages || 'N/A'}\n`;
  fullReport += `- **Images Missing Alt:** ${metadata.missingAlt || 'N/A'}\n\n`;
  fullReport += `---\n\n`;
  fullReport += `*Report generated by SEO & AEO Auditor (Claude AI)*\n`;

  const blob = new Blob([fullReport], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  
  // Create filename with page title and timestamp
  const pageTitleSlug = (metadata.title || 'audit')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  a.download = `seo-audit-${pageTitleSlug}-${Date.now()}.md`;
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('[Popup] Downloaded report with metadata');
}

/**
 * Shows/hides the settings panel.
 */
function showSettings() {
  UI.settings.classList.remove('hidden');
  UI.initialState.classList.add('hidden');
  UI.results.classList.add('hidden');
  UI.error.classList.add('hidden');
  // Reset visibility state when opening settings
  isKeyVisible = false;
  loadSettings();
}

function hideSettings() {
  UI.settings.classList.add('hidden');
  UI.initialState.classList.remove('hidden');
}

/**
 * Masks the API key for display.
 */
function maskKey(key) {
  if (!key || key.length < 12) {
    return '';
  }
  return key.substring(0, 8) + '...' + key.substring(key.length - 4);
}

/**
 * Shows a status message in settings.
 */
function showSettingsStatus(message, isError = false) {
  UI.settingsStatus.textContent = message;
  UI.settingsStatus.className = `status-message ${isError ? 'error' : 'success'}`;
  setTimeout(() => {
    UI.settingsStatus.className = 'status-message';
    UI.settingsStatus.textContent = '';
  }, 3000);
}

/**
 * Loads saved settings.
 */
async function loadSettings() {
  try {
    let result = await chrome.storage.sync.get(['apiKey', 'model']);
    
    if (!result.apiKey) {
      const localResult = await chrome.storage.local.get(['apiKey', 'model']);
      if (localResult.apiKey) {
        result = localResult;
        console.log('[Popup] Loaded from local storage');
      }
    }
    
    console.log('[Popup] Loading settings - API key present:', !!result.apiKey, 'Length:', result.apiKey?.length || 0);
    
    if (result.apiKey) {
      // Show masked or visible based on current visibility state
      if (isKeyVisible) {
        UI.apiKeyInput.value = result.apiKey;
        UI.apiKeyInput.type = 'text';
        UI.toggleKeyBtn.textContent = 'Hide';
      } else {
        UI.apiKeyInput.value = maskKey(result.apiKey);
        UI.apiKeyInput.type = 'password';
        UI.toggleKeyBtn.textContent = 'Show';
      }
    } else {
      UI.apiKeyInput.value = '';
      UI.apiKeyInput.type = 'password';
      UI.toggleKeyBtn.textContent = 'Show';
      isKeyVisible = false;
    }
    
    if (result.model) {
      UI.modelSelect.value = result.model;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    showSettingsStatus('Failed to load settings: ' + error.message, true);
  }
}

/**
 * Saves settings.
 */
async function saveSettings() {
  // Capture the original input value BEFORE any processing
  // This tells us if user was viewing masked or typing a real key
  const originalInputValue = UI.apiKeyInput.value;
  const apiKey = originalInputValue.trim();
  const model = UI.modelSelect.value;

  console.log('[Popup] Save started - original input length:', originalInputValue.length, 'contains ...:', originalInputValue.includes('...'));

  if (apiKey.includes('...')) {
    let currentKey = await chrome.storage.sync.get(['apiKey']);
    if (!currentKey.apiKey) {
      currentKey = await chrome.storage.local.get(['apiKey']);
    }
    
    if (currentKey.apiKey) {
      const maskedCurrent = maskKey(currentKey.apiKey);
      if (apiKey === maskedCurrent) {
        try {
          await chrome.storage.sync.set({ model: model });
          await chrome.storage.local.set({ model: model });
          showSettingsStatus('Settings saved successfully!');
        } catch (error) {
          showSettingsStatus('Failed to save settings: ' + error.message, true);
        }
        return;
      }
    }
    showSettingsStatus('Please reveal or enter a new API key before saving.', true);
    return;
  }

  // Get the actual key value - if user typed directly, use that
  // If empty, check if we're viewing a masked key
  let keyToSave = (apiKey || '').trim();
  
  // If input appears empty but we might be viewing masked, preserve existing
  if (!keyToSave && !apiKey.includes('...')) {
    // User cleared the field - allow that
    keyToSave = '';
  }
  
  console.log('[Popup] Saving - keyToSave length:', keyToSave.length, 'isKeyVisible:', isKeyVisible);
  
  if (keyToSave) {
    if (!keyToSave.startsWith('sk-ant-') && !keyToSave.startsWith('sk-ant-api-')) {
      const proceed = confirm('API key doesn\'t start with expected prefix (sk-ant-). Are you sure this is correct?');
      if (!proceed) {
        return;
      }
    }
    
    if (keyToSave.length < 50) {
      const proceed = confirm(`API key seems unusually short (${keyToSave.length} chars). Continue anyway?`);
      if (!proceed) {
        return;
      }
    }
  }

  try {
    await chrome.storage.sync.set({
      apiKey: keyToSave,
      model: model
    });

    await chrome.storage.local.set({
      apiKey: keyToSave,
      model: model
    });

    // Wait a moment for storage to persist
    await new Promise(resolve => setTimeout(resolve, 50));

    let verify = await chrome.storage.sync.get(['apiKey']);
    if (!verify.apiKey && keyToSave) {
      verify = await chrome.storage.local.get(['apiKey']);
    }

    if (verify.apiKey !== keyToSave && keyToSave !== '') {
      showSettingsStatus('Warning: Key may not have saved correctly. Please try again.', true);
      return;
    }

    // After saving, update the display
    // If user typed a real key (not masked), keep it visible after save
    // We captured originalInputValue at the start - if it didn't contain '...', user typed it
    const inputWasMasked = originalInputValue.includes('...');
    const userTypedNewKey = keyToSave && !inputWasMasked && keyToSave.length > 10; // Real key is longer than mask
    
    console.log('[Popup] After save - inputWasMasked:', inputWasMasked, 'userTypedNewKey:', userTypedNewKey, 'isKeyVisible:', isKeyVisible);
    
    if (userTypedNewKey || (keyToSave && isKeyVisible)) {
      // User typed a new key or had it visible - keep showing it
      UI.apiKeyInput.value = verify.apiKey || keyToSave;
      UI.apiKeyInput.type = 'text';
      UI.toggleKeyBtn.textContent = 'Hide';
      isKeyVisible = true;
      console.log('[Popup] Keeping key visible after save');
    } else if (keyToSave) {
      // Key was saved but should be masked (user didn't type it, it was already saved)
      // Reload will mask it properly
      await loadSettings();
      console.log('[Popup] Reloaded from storage - key will be masked');
    } else {
      // Key was cleared
      UI.apiKeyInput.value = '';
      UI.apiKeyInput.type = 'password';
      UI.toggleKeyBtn.textContent = 'Show';
      isKeyVisible = false;
    }

    showSettingsStatus('Settings saved successfully!');
    console.log('[Popup] Settings saved - API key length:', verify.apiKey?.length || 0, 'saved successfully');
  } catch (error) {
    showSettingsStatus('Failed to save settings: ' + error.message, true);
    console.error('Storage error:', error);
  }
}

/**
 * Tests the API key.
 */
async function testAPIKey() {
  // First, save any unsaved changes from the input field
  let apiKey = UI.apiKeyInput.value.trim();
  
  // If the input shows a masked key or is empty, get from storage
  if (apiKey.includes('...') || !apiKey) {
    let result = await chrome.storage.sync.get(['apiKey']);
    if (!result.apiKey) {
      result = await chrome.storage.local.get(['apiKey']);
    }
    apiKey = result.apiKey || '';
  } else {
    // User has typed a new key - save it first
    console.log('[Popup] Saving API key before test');
    try {
      await chrome.storage.sync.set({ apiKey: apiKey });
      await chrome.storage.local.set({ apiKey: apiKey });
    } catch (e) {
      console.error('Failed to save before test:', e);
    }
  }
  
  if (!apiKey || apiKey.trim() === '') {
    showSettingsStatus('No API key to test. Please enter your API key first.', true);
    return;
  }
  
  apiKey = apiKey.trim();
  
  if (!apiKey.startsWith('sk-ant-')) {
    showSettingsStatus('API key format appears incorrect. Should start with "sk-ant-".', true);
    return;
  }
  
  showSettingsStatus('Testing API key...', false);
  UI.testBtn.disabled = true;
  UI.testBtn.textContent = 'Testing...';
  
  try {
    // Use a timeout to detect if the background worker isn't responding
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout: Background worker not responding')), 10000)
    );
    
    const messagePromise = chrome.runtime.sendMessage({
      type: 'TEST_API_KEY'
    });
    
    const response = await Promise.race([messagePromise, timeoutPromise]);
    
    if (response && response.success) {
      showSettingsStatus('✓ API key is valid!', false);
    } else {
      const errorMsg = response?.error || 'API key test failed';
      showSettingsStatus(`✗ ${errorMsg}`, true);
      console.error('[Popup] Test failed:', errorMsg);
    }
  } catch (error) {
    console.error('[Popup] Test error:', error);
    if (error.message && (
      error.message.includes('Could not establish connection') ||
      error.message.includes('Timeout') ||
      error.message.includes('Extension context invalidated')
    )) {
      showSettingsStatus('Background worker not ready. Please reload the extension (chrome://extensions) and try again.', true);
    } else {
      showSettingsStatus('Failed to test API key: ' + (error.message || 'Unknown error'), true);
    }
  } finally {
    UI.testBtn.disabled = false;
    UI.testBtn.textContent = 'Test API Key';
  }
}

/**
 * Saves audit results to storage for persistence
 */
async function saveAuditToStorage() {
  if (!currentAnalysis || !currentMetadata) {
    return;
  }
  
  const auditData = {
    analysis: currentAnalysis,
    metadata: currentMetadata,
    signals: currentSignals,
    logs: auditLogs,
    savedAt: Date.now()
  };
  
  try {
    // Save current audit
    await chrome.storage.local.set({ lastAudit: auditData });
    
    // Also maintain audit history (keep last 5 audits)
    let history = await chrome.storage.local.get(['auditHistory']);
    let auditHistory = history.auditHistory || [];
    
    // Add to history
    auditHistory.unshift({
      url: currentMetadata.url,
      title: currentMetadata.title,
      timestamp: currentMetadata.timestamp,
      savedAt: Date.now()
    });
    
    // Keep only last 5
    auditHistory = auditHistory.slice(0, 5);
    
    await chrome.storage.local.set({ auditHistory: auditHistory });
    
    console.log('[Popup] Audit results saved to storage');
  } catch (error) {
    console.error('[Popup] Failed to save audit to storage:', error);
  }
}

/**
 * Loads the last audit from storage
 */
async function loadLastAudit() {
  try {
    const result = await chrome.storage.local.get(['lastAudit']);
    
    if (!result.lastAudit) {
      console.log('[Popup] No saved audit found');
      return false;
    }
    
    const auditData = result.lastAudit;
    
    // Check if audit is not too old (keep for 7 days)
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (Date.now() - auditData.savedAt > maxAge) {
      console.log('[Popup] Saved audit too old, clearing');
      await chrome.storage.local.remove(['lastAudit']);
      return false;
    }
    
    // Restore audit data
    currentAnalysis = auditData.analysis;
    currentMetadata = auditData.metadata;
    currentSignals = auditData.signals;
    auditLogs = auditData.logs || [];
    
    // Check if verbose logging is enabled to show logs button
    const settings = await chrome.storage.sync.get(['verboseLogging']);
    if (settings.verboseLogging && auditLogs.length > 0) {
      UI.toggleLogsBtn.style.display = 'inline-block';
    }
    
    // Display the saved results
    displayResults(currentAnalysis);
    
    console.log('[Popup] Loaded saved audit from', new Date(auditData.savedAt).toLocaleString());
    
    return true;
  } catch (error) {
    console.error('[Popup] Failed to load saved audit:', error);
    return false;
  }
}

/**
 * Clears saved audit results
 */
async function clearSavedAudit() {
  try {
    await chrome.storage.local.remove(['lastAudit']);
    console.log('[Popup] Cleared saved audit');
  } catch (error) {
    console.error('[Popup] Failed to clear saved audit:', error);
  }
}

/**
 * Toggles API key visibility.
 */
async function toggleKeyVisibility() {
  // If currently showing masked key and user wants to show it
  if (!isKeyVisible && UI.apiKeyInput.value.includes('...')) {
    let result = await chrome.storage.sync.get(['apiKey']);
    if (!result.apiKey) {
      result = await chrome.storage.local.get(['apiKey']);
    }
    
    if (result.apiKey) {
      UI.apiKeyInput.value = result.apiKey;
      isKeyVisible = true;
      UI.apiKeyInput.type = 'text';
      UI.toggleKeyBtn.textContent = 'Hide';
    } else {
      UI.apiKeyInput.value = '';
      UI.toggleKeyBtn.textContent = 'Show';
    }
    return;
  }
  
  // Toggle visibility state
  isKeyVisible = !isKeyVisible;
  
  if (isKeyVisible) {
    UI.apiKeyInput.type = 'text';
    UI.toggleKeyBtn.textContent = 'Hide';
    // If currently masked, load real key
    if (UI.apiKeyInput.value.includes('...')) {
      let result = await chrome.storage.sync.get(['apiKey']);
      if (!result.apiKey) {
        result = await chrome.storage.local.get(['apiKey']);
      }
      if (result.apiKey) {
        UI.apiKeyInput.value = result.apiKey;
      }
    }
  } else {
    UI.apiKeyInput.type = 'password';
    UI.toggleKeyBtn.textContent = 'Show';
    // If showing real key, mask it when hiding
    if (UI.apiKeyInput.value && !UI.apiKeyInput.value.includes('...')) {
      let result = await chrome.storage.sync.get(['apiKey']);
      if (!result.apiKey) {
        result = await chrome.storage.local.get(['apiKey']);
      }
      if (result.apiKey) {
        UI.apiKeyInput.value = maskKey(result.apiKey);
      }
    }
  }
}

// Event listeners
UI.runAuditBtn.addEventListener('click', runAudit);
UI.runAgainBtn.addEventListener('click', runAudit);
UI.copyBtn.addEventListener('click', copyResults);
UI.downloadBtn.addEventListener('click', downloadResults);
UI.settingsBtn.addEventListener('click', showSettings);
UI.closeSettingsBtn.addEventListener('click', hideSettings);
UI.toggleKeyBtn.addEventListener('click', toggleKeyVisibility);
UI.saveBtn.addEventListener('click', saveSettings);
UI.testBtn.addEventListener('click', testAPIKey);
UI.toggleLogsBtn.addEventListener('click', showLogs);
UI.closeLogsBtn.addEventListener('click', hideLogs);

// Initialize: Load last audit if available
(async function init() {
  console.log('[Popup] Initializing...');
  
  // Try to load last audit from storage
  const loaded = await loadLastAudit();
  
  if (loaded) {
    console.log('[Popup] Restored previous audit results');
  } else {
    console.log('[Popup] No previous audit to restore, showing initial state');
  }
})();

