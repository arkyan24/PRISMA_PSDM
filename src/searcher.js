const axios = require('axios');
const cheerio = require('cheerio');
const db = require('./database');
const nlpSentiment = require('./nlp_sentiment');

// ─── Multiple Search Strategies ───────────────────────
// Strategy 1: Google Custom Search API (if configured)
// Strategy 2: Google News RSS feed (always works, no key needed)
// Strategy 3: DuckDuckGo HTML (fallback, no key needed)

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Platform-specific query modifiers
const PLATFORM_SITE_FILTERS = {
  facebook: 'site:facebook.com',
  twitter: 'site:twitter.com OR site:x.com',
  instagram: 'site:instagram.com',
  website: '-site:facebook.com -site:twitter.com -site:x.com -site:instagram.com'
};

// ═══════════════════════════════════════════════════════
// STRATEGY 1: Google News RSS (always works!)
// ═══════════════════════════════════════════════════════
async function searchGoogleNewsRSS(keyword, platform, maxResults = 10) {
  const siteFilter = PLATFORM_SITE_FILTERS[platform];
  const query = `${keyword} ${siteFilter}`;
  const encodedQuery = encodeURIComponent(query);

  // Google News RSS feed URL - publicly available, no API key needed
  const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=id&gl=ID&ceid=ID:id`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': getRandomUA(),
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data, { xmlMode: true });
    const results = [];

    $('item').each((i, el) => {
      if (results.length >= maxResults) return;

      const title = $(el).find('title').text().trim();
      const link = $(el).find('link').text().trim();
      const description = $(el).find('description').text().trim();
      const pubDate = $(el).find('pubDate').text().trim();
      const source = $(el).find('source').text().trim();

      if (!title || !link) return;

      // Clean HTML from description
      const cleanDesc = description.replace(/<[^>]*>/g, '').trim();

      let displayLink = '';
      try { displayLink = new URL(link).hostname; } catch { displayLink = source || ''; }

      let publishedAt = null;
      if (pubDate) {
        try {
          const d = new Date(pubDate);
          if (!isNaN(d.getTime())) publishedAt = d.toISOString();
        } catch (e) {}
      }

      results.push({
        platform,
        title: title.substring(0, 300),
        link: link,
        snippet: cleanDesc.substring(0, 500) || `Sumber: ${source}`,
        display_link: displayLink,
        published_at: publishedAt
      });
    });

    return results;
  } catch (error) {
    console.warn(`[Searcher] Google News RSS failed for ${platform}: ${error.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
// STRATEGY 2: Google Search via alternative endpoint
// ═══════════════════════════════════════════════════════
async function searchGoogleLite(keyword, platform, maxResults = 10) {
  const siteFilter = PLATFORM_SITE_FILTERS[platform];
  const query = `${keyword} ${siteFilter}`;

  try {
    // Use Google's lite/basic HTML search which is less likely to block
    const response = await axios.get('https://www.google.com/search', {
      params: {
        q: query,
        num: maxResults,
        hl: 'id',
        gl: 'id',
        // Request simple HTML output
        client: 'safari',
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'id-ID,id;q=0.9',
        'Cache-Control': 'no-cache',
      },
      timeout: 15000,
      maxRedirects: 5,
      // Accept all status codes to handle redirects properly
      validateStatus: (status) => status < 500
    });

    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }

    const $ = cheerio.load(response.data);
    const results = [];

    // Parse search results — try multiple selectors
    $('div.g, div[class*="result"], div.tF2Cxc').each((i, element) => {
      if (results.length >= maxResults) return;

      const el = $(element);
      const linkEl = el.find('a[href^="http"]').first();
      const link = linkEl.attr('href');
      if (!link || link.includes('google.com')) return;

      const title = el.find('h3').first().text().trim() || linkEl.text().trim();
      if (!title || title.length < 3) return;

      let snippet = '';
      el.find('div, span').each((j, child) => {
        const text = $(child).text().trim();
        if (text.length > 30 && text !== title && !snippet) {
          snippet = text;
        }
      });

      let displayLink = '';
      try { displayLink = new URL(link).hostname; } catch { displayLink = ''; }

      results.push({
        platform,
        title: title.substring(0, 300),
        link: link,
        snippet: (snippet || '').substring(0, 500),
        display_link: displayLink
      });
    });

    // Additional fallback parsing for mobile/lite results
    if (results.length === 0) {
      $('a[href^="http"]').each((i, el) => {
        if (results.length >= maxResults) return;
        const link = $(el).attr('href');
        if (!link || link.includes('google.com') || link.includes('gstatic.com')) return;

        const text = $(el).text().trim();
        if (!text || text.length < 5) return;

        // Check for duplicates
        if (results.some(r => r.link === link)) return;

        let displayLink = '';
        try { displayLink = new URL(link).hostname; } catch { displayLink = ''; }

        results.push({
          platform,
          title: text.substring(0, 300),
          link: link,
          snippet: '',
          display_link: displayLink
        });
      });
    }

    return results;
  } catch (error) {
    if (error.message === 'RATE_LIMITED') throw error;
    console.warn(`[Searcher] Google Lite failed for ${platform}: ${error.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
// STRATEGY 3: DuckDuckGo HTML Search (reliable fallback)
// ═══════════════════════════════════════════════════════
async function searchDuckDuckGo(keyword, platform, maxResults = 10) {
  const siteFilter = PLATFORM_SITE_FILTERS[platform];
  const query = `${keyword} ${siteFilter}`;

  try {
    const response = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q: query },
      headers: {
        'User-Agent': getRandomUA(),
        'Accept': 'text/html',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.7',
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $('.result, .web-result').each((i, element) => {
      if (results.length >= maxResults) return;

      const el = $(element);
      const linkEl = el.find('a.result__a, a.result__url').first();
      let link = linkEl.attr('href') || '';

      // DuckDuckGo sometimes uses redirect URLs
      if (link.includes('duckduckgo.com/l/')) {
        const match = link.match(/uddg=([^&]+)/);
        if (match) link = decodeURIComponent(match[1]);
      }

      if (!link || !link.startsWith('http')) return;

      const title = el.find('.result__title, a.result__a').first().text().trim();
      const snippet = el.find('.result__snippet').text().trim();

      if (!title || title.length < 3) return;

      let displayLink = '';
      try { displayLink = new URL(link).hostname; } catch { displayLink = ''; }

      results.push({
        platform,
        title: title.substring(0, 300),
        link: link,
        snippet: (snippet || '').substring(0, 500),
        display_link: displayLink
      });
    });

    return results;
  } catch (error) {
    console.warn(`[Searcher] DuckDuckGo failed for ${platform}: ${error.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
// STRATEGY 4: Google Custom Search API (optional)
// ═══════════════════════════════════════════════════════
async function searchGoogleAPI(keyword, platform, apiKey, cxId, maxResults = 10) {
  const siteFilter = PLATFORM_SITE_FILTERS[platform];
  const query = `${keyword} ${siteFilter}`;

  const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: {
      key: apiKey,
      cx: cxId,
      q: query,
      num: Math.min(maxResults, 10),
      sort: 'date'
    },
    timeout: 15000
  });

  return (response.data.items || []).map(item => ({
    platform,
    title: item.title || 'No Title',
    link: item.link || '',
    snippet: item.snippet || '',
    display_link: item.displayLink || ''
  }));
}

// ═══════════════════════════════════════════════════════
// COMBINED SEARCH — tries multiple strategies
// ═══════════════════════════════════════════════════════
async function searchPlatform(keyword, platform, apiKey, cxId, maxResults = 10) {
  // Strategy 1: If API key is configured, use it
  if (apiKey && cxId) {
    try {
      console.log(`[Searcher]   [${platform}] Trying Google API...`);
      const results = await searchGoogleAPI(keyword, platform, apiKey, cxId, maxResults);
      if (results.length > 0) return results;
    } catch (e) {
      console.warn(`[Searcher]   [${platform}] API failed: ${e.message}`);
    }
  }

  // Strategy 2: Google News RSS (most reliable, no key needed)
  try {
    console.log(`[Searcher]   [${platform}] Trying Google News RSS...`);
    const results = await searchGoogleNewsRSS(keyword, platform, maxResults);
    if (results.length > 0) return results;
  } catch (e) {
    console.warn(`[Searcher]   [${platform}] Google News RSS failed: ${e.message}`);
  }

  // Strategy 3: DuckDuckGo (very reliable fallback)
  try {
    console.log(`[Searcher]   [${platform}] Trying DuckDuckGo...`);
    await sleep(1000 + Math.random() * 500);
    const results = await searchDuckDuckGo(keyword, platform, maxResults);
    if (results.length > 0) return results;
  } catch (e) {
    console.warn(`[Searcher]   [${platform}] DuckDuckGo failed: ${e.message}`);
  }

  // Strategy 4: Google Lite (last resort)
  try {
    console.log(`[Searcher]   [${platform}] Trying Google Lite...`);
    await sleep(2000 + Math.random() * 1000);
    const results = await searchGoogleLite(keyword, platform, maxResults);
    if (results.length > 0) return results;
  } catch (e) {
    console.warn(`[Searcher]   [${platform}] Google Lite failed: ${e.message}`);
  }

  console.log(`[Searcher]   [${platform}] No results from any strategy`);
  return [];
}

// ═══════════════════════════════════════════════════════
// MONITOR SCAN — scan a specific monitor's keyword
// ═══════════════════════════════════════════════════════
async function runMonitorScan(monitor) {
  const apiKey = db.getSetting('google_api_key');
  const cxId = db.getSetting('google_cx_id');
  const maxResults = parseInt(db.getSetting('max_results_per_query') || '10');

  const scanLogId = db.createScanLog(monitor.id);
  const platforms = ['facebook', 'twitter', 'instagram', 'website'];
  let totalNewResults = 0;
  const errors = [];

  const hasApi = !!(apiKey && cxId);
  console.log(`[Searcher] ══════════════════════════════════════════`);
  console.log(`[Searcher] Monitor scan: "${monitor.name}" (keyword: "${monitor.keyword}"), API: ${hasApi ? 'YES' : 'NO (using RSS + DuckDuckGo)'}`);
  console.log(`[Searcher] ══════════════════════════════════════════`);

  for (const platform of platforms) {
    try {
      await sleep(800 + Math.random() * 400);
      const results = await searchPlatform(monitor.keyword, platform, apiKey, cxId, maxResults);

      const sentimentModule = nlpSentiment;
      if (results.length > 0) {
        const texts = results.map(r => `${r.title || ''} ${r.snippet || ''}`);
        let sentiments = [];
        try {
          sentiments = await sentimentModule.analyzeSentimentBatchAsync(texts);
        } catch (sentErr) {
          console.warn(`[Searcher] Batch sentiment failed, using fallback: ${sentErr.message}`);
          sentiments = texts.map(t => sentimentModule.analyzeSentimentNLP(t));
        }

        const enrichedResults = results.map((r, i) => {
          const sent = sentiments[i] || sentimentModule.analyzeSentimentNLP(texts[i]);
          return {
            ...r,
            keyword_id: monitor.keyword_id,
            keyword_text: monitor.keyword,
            monitor_id: monitor.id,
            sentiment: sent.label,
            nlp_sentiment: sent
          };
        });

        const inserted = await db.insertResults(enrichedResults, monitor.id);
        totalNewResults += inserted;
        console.log(`[Searcher]   ✅ ${platform}: ${results.length} found, ${inserted} new`);
      } else {
        console.log(`[Searcher]   ⚪ ${platform}: no results`);
      }
    } catch (error) {
      const errMsg = `[${monitor.keyword}][${platform}] ${error.message}`;
      console.error(`[Searcher]   ❌ ${platform}: ${error.message}`);
      errors.push(errMsg);
    }
  }

  const errorMsg = errors.length > 0 ? errors.join('; ') : null;
  db.completeScanLog(scanLogId, totalNewResults, errorMsg);

  console.log(`[Searcher] ══════════════════════════════════════════`);
  console.log(`[Searcher] Monitor scan complete. ${totalNewResults} new results.`);
  console.log(`[Searcher] ══════════════════════════════════════════`);

  return { totalNewResults, errors, scanLogId };
}

// ═══════════════════════════════════════════════════════
// FULL SCAN — scan all active monitors across all platforms
// ═══════════════════════════════════════════════════════
async function runFullScan() {
  const apiKey = db.getSetting('google_api_key');
  const cxId = db.getSetting('google_cx_id');
  const maxResults = parseInt(db.getSetting('max_results_per_query') || '10');

  const monitors = db.getActiveMonitors();
  if (monitors.length === 0) {
    // Fallback to legacy keywords if no monitors
    const keywords = db.getActiveKeywords();
    if (keywords.length === 0) {
      throw new Error('Tidak ada monitor atau keyword aktif. Tambahkan monitor terlebih dahulu.');
    }
  }

  // Use monitors if available, otherwise fallback to keywords
  if (monitors.length > 0) {
    let totalNewResults = 0;
    const allErrors = [];

    console.log(`[Searcher] ══════════════════════════════════════════`);
    console.log(`[Searcher] Starting full scan: ${monitors.length} monitor(s)`);
    console.log(`[Searcher] ══════════════════════════════════════════`);

    for (const monitor of monitors) {
      const result = await runMonitorScan(monitor);
      totalNewResults += result.totalNewResults;
      allErrors.push(...result.errors);
    }

    return { totalNewResults, errors: allErrors };
  }

  // Legacy path: keywords without monitors
  const keywords = db.getActiveKeywords();
  const scanLogId = db.createScanLog();
  const platforms = ['facebook', 'twitter', 'instagram', 'website'];
  let totalNewResults = 0;
  const errors = [];

  const hasApi = !!(apiKey && cxId);
  console.log(`[Searcher] ══════════════════════════════════════════`);
  console.log(`[Searcher] Starting scan: ${keywords.length} keyword(s), API: ${hasApi ? 'YES' : 'NO (using RSS + DuckDuckGo)'}`);
  console.log(`[Searcher] ══════════════════════════════════════════`);

  for (const kw of keywords) {
    console.log(`[Searcher] ── Keyword: "${kw.keyword}" ──`);

    for (const platform of platforms) {
      try {
        await sleep(800 + Math.random() * 400);
        const results = await searchPlatform(kw.keyword, platform, apiKey, cxId, maxResults);

        const sentimentModule = nlpSentiment;
        if (results.length > 0) {
          const texts = results.map(r => `${r.title || ''} ${r.snippet || ''}`);
          let sentiments = [];
          try {
            sentiments = await sentimentModule.analyzeSentimentBatchAsync(texts);
          } catch (sentErr) {
            console.warn(`[Searcher] Batch sentiment failed, using fallback: ${sentErr.message}`);
            sentiments = texts.map(t => sentimentModule.analyzeSentimentNLP(t));
          }

          const enrichedResults = results.map((r, i) => {
            const sent = sentiments[i] || sentimentModule.analyzeSentimentNLP(texts[i]);
            return {
              ...r,
              keyword_id: kw.id,
              keyword_text: kw.keyword,
              monitor_id: kw.monitor_id || null,
              sentiment: sent.label,
              nlp_sentiment: sent
            };
          });

          const inserted = await db.insertResults(enrichedResults, kw.monitor_id || null);
          totalNewResults += inserted;
          console.log(`[Searcher]   ✅ ${platform}: ${results.length} found, ${inserted} new`);
        } else {
          console.log(`[Searcher]   ⚪ ${platform}: no results`);
        }

      } catch (error) {
        const errMsg = `[${kw.keyword}][${platform}] ${error.message}`;
        console.error(`[Searcher]   ❌ ${platform}: ${error.message}`);
        errors.push(errMsg);
      }
    }
  }

  const errorMsg = errors.length > 0 ? errors.join('; ') : null;
  db.completeScanLog(scanLogId, totalNewResults, errorMsg);

  console.log(`[Searcher] ══════════════════════════════════════════`);
  console.log(`[Searcher] Scan complete. ${totalNewResults} new results.`);
  console.log(`[Searcher] ══════════════════════════════════════════`);

  return { totalNewResults, errors, scanLogId };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchPlatform, runFullScan, runMonitorScan };
