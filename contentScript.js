/**
 * Content script that collects SEO and AEO signals from the current page.
 * Optimized for performance - only runs when requested.
 */

(function() {
  'use strict';

  // Cache for signals to avoid re-collection
  let cachedSignals = null;
  let cacheTimestamp = 0;
  const CACHE_DURATION = 5000; // 5 seconds

  function collectSignals(forceRefresh = false) {
    // Return cached signals if still valid
    const now = Date.now();
    if (!forceRefresh && cachedSignals && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('[ContentScript] Returning cached signals');
      return cachedSignals;
    }

    console.log('[ContentScript] Collecting fresh signals...');
    const startTime = performance.now();
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
      wordCount: 0
    };

    // Basic meta tags
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

    // Headings (H1-H6, capped at 30)
    const headingSelectors = 'h1, h2, h3, h4, h5, h6';
    const allHeadings = Array.from(document.querySelectorAll(headingSelectors));
    signals.headings = allHeadings
      .slice(0, 30)
      .map(h => ({
        level: parseInt(h.tagName.substring(1)),
        text: h.textContent.trim()
      }));

    // Links - separate internal/external, skip data: and javascript: URLs, ignore anchors
    // OPTIMIZED: Use limit to avoid processing thousands of links
    const currentHost = window.location.hostname;
    const allLinks = document.querySelectorAll('a[href]');
    const processedLinks = [];
    const MAX_LINKS_TO_PROCESS = 200; // Limit to prevent lag on huge pages
    
    let linkCount = 0;
    for (const link of allLinks) {
      if (linkCount >= MAX_LINKS_TO_PROCESS) break;
      
      try {
        const href = link.href;
        // Skip data: and javascript: URLs
        if (href.startsWith('data:') || href.startsWith('javascript:')) {
          continue;
        }
        
        // Parse URL to check if it's internal/external
        const url = new URL(href, window.location.href);
        // Ignore anchor-only links (same path, different hash)
        if (url.hash && url.pathname === window.location.pathname && 
            url.hostname === currentHost) {
          continue;
        }
        
        const isInternal = url.hostname === currentHost || 
                          url.hostname === '' ||
                          url.hostname === window.location.hostname;
        
        processedLinks.push({
          href: url.href.split('#')[0], // Remove hash
          text: link.textContent.trim().substring(0, 100), // Limit text length
          isInternal
        });
        linkCount++;
      } catch (e) {
        // Skip malformed URLs
        continue;
      }
    }

    // Separate and cap at 100 total, then take top 10 of each for examples
    const internalLinks = processedLinks.filter(l => l.isInternal);
    const externalLinks = processedLinks.filter(l => !l.isInternal);
    
    signals.internalLinks = internalLinks
      .slice(0, 10)
      .map(l => ({ href: l.href, text: l.text }));
    signals.externalLinks = externalLinks
      .slice(0, 10)
      .map(l => ({ href: l.href, text: l.text }));
    
    // Count total links on page for accurate stats
    signals.linkCounts = {
      internal: internalLinks.length,
      external: externalLinks.length,
      total: allLinks.length // Use actual DOM count
    };

    // Images - collect alt attributes
    // OPTIMIZED: Limit to first 50 images to avoid lag
    const allImages = document.querySelectorAll('img');
    const imageArray = Array.from(allImages).slice(0, 50);
    const imagesWithoutAlt = [];
    
    signals.images = imageArray
      .slice(0, 10)
      .map(img => {
        const hasAlt = img.hasAttribute('alt');
        const altText = img.alt || '';
        
        if (!hasAlt || altText.trim() === '') {
          imagesWithoutAlt.push({
            src: img.src.substring(0, 100), // Truncate long URLs
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight
          });
        }
        
        return {
          src: img.src.substring(0, 100),
          alt: altText,
          hasAlt: hasAlt && altText.trim() !== ''
        };
      });
    
    // Count all images but only analyze first 50
    signals.imageStats = {
      total: allImages.length,
      withAlt: imageArray.filter(img => img.alt && img.alt.trim()).length,
      withoutAlt: imagesWithoutAlt.length,
      missingAltExamples: imagesWithoutAlt.slice(0, 10)
    };

    // Structured data (JSON-LD)
    const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    signals.structuredData = jsonLdScripts.map(script => {
      try {
        const data = JSON.parse(script.textContent);
        return {
          type: Array.isArray(data) ? data[0]?.['@type'] : data['@type'],
          raw: script.textContent.substring(0, 500) // Truncate for prompt
        };
      } catch (e) {
        return { type: 'parse_error', raw: script.textContent.substring(0, 500) };
      }
    });

    // OG tags
    const ogSelectors = [
      'og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name'
    ];
    ogSelectors.forEach(prop => {
      const el = document.querySelector(`meta[property="${prop}"]`);
      if (el) {
        signals.ogTags[prop] = el.content.trim();
      }
    });

    // Twitter tags
    const twitterSelectors = [
      'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'
    ];
    twitterSelectors.forEach(name => {
      const el = document.querySelector(`meta[name="${name}"]`);
      if (el) {
        signals.twitterTags[name] = el.content.trim();
      }
    });

    // Body text sample (truncate to ~3000 chars)
    // OPTIMIZED: Use faster method and limit word count to main content
    const bodyElement = document.body;
    if (bodyElement) {
      const bodyText = bodyElement.textContent || '';
      signals.bodyTextSample = bodyText
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 3000);
      
      // OPTIMIZED: Approximate word count from sample instead of entire body
      // This is much faster and still accurate enough for SEO analysis
      const sampleText = bodyText.substring(0, 10000); // Only count first 10K chars
      const sampleWordCount = sampleText.trim().split(/\s+/).filter(w => w.length > 0).length;
      signals.wordCount = Math.round((bodyText.length / sampleText.length) * sampleWordCount);
    } else {
      signals.bodyTextSample = '';
      signals.wordCount = 0;
    }

    // Cache the results
    cachedSignals = signals;
    cacheTimestamp = Date.now();
    
    const elapsed = performance.now() - startTime;
    console.log(`[ContentScript] Signal collection completed in ${elapsed.toFixed(2)}ms`);

    return signals;
  }

  // DON'T collect on page load - only when requested
  // This prevents lag on initial page load
  console.log('[ContentScript] Ready and waiting for signal requests...');

  // Listen for signal requests from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SIGNALS') {
      try {
        const signals = collectSignals(message.forceRefresh || false);
        sendResponse({ success: true, signals });
      } catch (error) {
        console.error('[ContentScript] Error collecting signals:', error);
        sendResponse({ success: false, error: error.message });
      }
    } else if (message.type === 'REFRESH_SIGNALS') {
      try {
        const signals = collectSignals(true);
        window.__SEO_AEO_SIGNALS__ = signals; // Update global for backwards compat
        sendResponse({ success: true, signals });
      } catch (error) {
        console.error('[ContentScript] Error refreshing signals:', error);
        sendResponse({ success: false, error: error.message });
      }
    }
    return true; // Keep channel open for async response
  });

  // Expose method for legacy access (if popup.js tries to access directly)
  window.__SEO_AEO_SIGNALS_COLLECT__ = collectSignals;
})();

