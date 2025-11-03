/**
 * Content script that collects SEO and AEO signals from the current page.
 * Stores results in window.__SEO_AEO_SIGNALS__ for popup.js to access.
 */

(function() {
  'use strict';

  function collectSignals() {
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
    const currentHost = window.location.hostname;
    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    const processedLinks = [];
    
    for (const link of allLinks) {
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
          text: link.textContent.trim(),
          isInternal
        });
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
    
    signals.linkCounts = {
      internal: internalLinks.length,
      external: externalLinks.length,
      total: processedLinks.length
    };

    // Images - collect alt attributes
    const allImages = Array.from(document.querySelectorAll('img'));
    const imagesWithoutAlt = [];
    
    signals.images = allImages
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
    
    signals.imageStats = {
      total: allImages.length,
      withAlt: allImages.filter(img => img.alt && img.alt.trim()).length,
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
    const bodyText = document.body ? document.body.textContent || '' : '';
    signals.bodyTextSample = bodyText
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 3000);
    
    // Approximate word count (simple split on whitespace)
    signals.wordCount = bodyText
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0).length;

    return signals;
  }

  // Store signals globally for popup.js to access
  window.__SEO_AEO_SIGNALS__ = collectSignals();

  // Re-collect on popup request (for SPAs that may have changed)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'REFRESH_SIGNALS') {
      window.__SEO_AEO_SIGNALS__ = collectSignals();
      sendResponse({ success: true });
    }
    return true; // Keep channel open for async response
  });
})();

