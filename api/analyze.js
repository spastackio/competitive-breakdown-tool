const https = require('https');
const http = require('http');
const { URL } = require('url');

// --- Helpers ---

function sendJson(res, statusCode, body) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(statusCode).json(body);
}

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 30000,
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

// --- HTML Fetching & Analysis ---

function fetchHTML(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 3;
  var startTime = Date.now();

  return new Promise((resolve) => {
    if (redirectsLeft <= 0) { resolve({ html: null, timeMs: null }); return; }

    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { resolve({ html: null, timeMs: null }); return; }

    const proto = parsedUrl.protocol === 'https:' ? https : http;

    const req = proto.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 30000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl;
        try { redirectUrl = new URL(res.headers.location, url).toString(); } catch { resolve({ html: null, timeMs: null }); return; }
        res.resume();
        fetchHTML(redirectUrl, redirectsLeft - 1).then(resolve);
        return;
      }

      if (res.statusCode !== 200) { res.resume(); resolve({ html: null, timeMs: null }); return; }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > 500000) res.destroy();
      });
      res.on('end', () => resolve({ html: data, timeMs: Date.now() - startTime }));
      res.on('error', () => resolve({ html: null, timeMs: null }));
    });

    req.on('error', () => resolve({ html: null, timeMs: null }));
    req.on('timeout', () => { req.destroy(); resolve({ html: null, timeMs: null }); });
    req.end();
  });
}

function analyzeWebsiteHTML(html, fetchTimeMs) {
  if (!html || typeof html !== 'string') return null;

  var lower = html.toLowerCase();

  // === CTA ANALYSIS ===
  var strongCtaPatterns = [
    /book\s*(now|a|an|your|online|appointment|consultation|today|free)/i,
    /schedule\s*(now|a|an|your|appointment|consultation|today|free)/i,
    /free\s*consultation/i,
    /request\s*(a|an|your)?\s*(appointment|consultation)/i,
  ];
  var mediumCtaPatterns = [
    /get\s*(started|your|a|my|free)/i,
    /call\s*(now|us|today)/i,
    /contact\s*(us|now|today)/i,
    /view\s*(services|treatments|pricing|menu)/i,
    /learn\s*more/i,
    /request\s*(a|an|your)?\s*(quote|info|information)/i,
  ];

  var hasStrongCta = strongCtaPatterns.some(function(p) { return p.test(html); });
  var hasMediumCta = mediumCtaPatterns.some(function(p) { return p.test(html); });

  var ctaInButton = /<(button|a)[^>]*(class\s*=\s*["'][^"']*\b(btn|button|cta|book|schedule|action|primary)[^"']*["'])[^>]*>/i.test(html);

  var bodyMatch = html.match(/<body[^>]*>([\s\S]*)/i);
  var bodyContent = bodyMatch ? bodyMatch[1] : html;
  var aboveFold = bodyContent.substring(0, Math.floor(bodyContent.length * 0.3));
  var ctaAboveFold = strongCtaPatterns.some(function(p) { return p.test(aboveFold); }) ||
                     mediumCtaPatterns.some(function(p) { return p.test(aboveFold); });

  var ctaStrength = 'none';
  if (hasStrongCta && ctaInButton && ctaAboveFold) ctaStrength = 'strong';
  else if (hasStrongCta && (ctaInButton || ctaAboveFold)) ctaStrength = 'good';
  else if (hasStrongCta || (hasMediumCta && ctaInButton)) ctaStrength = 'present';
  else if (hasMediumCta) ctaStrength = 'weak';

  // === CLICKABLE PHONE ===
  var hasClickablePhone = /href\s*=\s*["']tel:/i.test(html);

  // === ONLINE BOOKING / CONTACT FORM ===
  var hasForm = /<form[\s>]/i.test(html);
  var bookingPlatforms = [
    'vagaro.com', 'mindbodyonline.com', 'acuityscheduling.com',
    'glossgenius.com', 'booksy.com', 'fresha.com', 'schedulicity.com',
    'janeapp.com', 'calendly.com', 'setmore.com', 'square.site',
    'zocdoc.com', 'patientpop.com', 'boulevard.io', 'zenoti.com',
  ];
  var hasBookingLink = bookingPlatforms.some(function(p) { return lower.includes(p); });
  var hasBooking = hasForm || hasBookingLink;

  // === MODERN DESIGN SIGNALS (0-10) ===
  var modernSignals = 0;

  if (lower.includes('fonts.googleapis.com') || lower.includes('fonts.adobe.com') || lower.includes('@font-face') || lower.includes('typekit.net')) {
    modernSignals++;
  }
  var deprecatedElements = ['<center>', '<center ', '<font ', '<font>', '<marquee', '<blink', '<frameset', '<frame '];
  var hasDeprecated = deprecatedElements.some(function(el) { return lower.includes(el); });
  if (!hasDeprecated) modernSignals++;

  var currentYear = new Date().getFullYear();
  var copyrightMatch = html.match(/(?:\u00A9|&copy;|copyright)\s*(\d{4})/i);
  if (copyrightMatch && parseInt(copyrightMatch[1]) >= currentYear - 1) modernSignals++;

  if (lower.includes('name="viewport"') || lower.includes("name='viewport'")) modernSignals++;
  if (/var\s*\(\s*--/.test(html)) modernSignals++;
  if (/display\s*:\s*(grid|flex)/i.test(html) || /\bclass\s*=\s*["'][^"']*([\s"']flex[\s"']|[\s"']grid[\s"']|\bd-flex\b|\bd-grid\b)/i.test(html)) modernSignals++;
  if (/\.(webp|avif)/i.test(html) || /srcset\s*=/i.test(html) || /<picture[\s>]/i.test(html) || /loading\s*=\s*["']lazy["']/i.test(html)) modernSignals++;
  if (/<svg[\s>]/i.test(html) || /\.svg["'\s>]/i.test(html)) modernSignals++;
  if (/@keyframes/i.test(html) || /transition\s*:/i.test(html) || /animation\s*:/i.test(html) || lower.includes('data-aos') || lower.includes('gsap') || lower.includes('framer-motion')) modernSignals++;
  if (lower.includes('__next') || lower.includes('_next/') || lower.includes('__nuxt') || lower.includes('data-reactroot') ||
      lower.includes('data-v-') || lower.includes('tailwindcss') || lower.includes('tailwind') ||
      /bootstrap[\/\.]5/i.test(html) || lower.includes('/vite') || lower.includes('astro')) modernSignals++;

  // === PAGE STRUCTURE ===
  var hasNav = /<nav[\s>]/i.test(html) || /class\s*=\s*["'][^"']*\bnav(bar|igation)?\b/i.test(html);
  var hasHeader = /<header[\s>]/i.test(html);
  var hasMain = /<main[\s>]/i.test(html);
  var hasFooter = /<footer[\s>]/i.test(html);
  var semanticCount = [hasNav, hasHeader, hasMain, hasFooter].filter(Boolean).length;

  var hasH1 = /<h1[\s>]/i.test(html);
  var h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  var hasH2 = /<h2[\s>]/i.test(html);
  var properHeadings = hasH1 && h1Count <= 2 && hasH2;

  var imgTags = html.match(/<img[^>]*>/gi) || [];
  var imgsWithAlt = imgTags.filter(function(img) { return /alt\s*=\s*["'][^"']+["']/i.test(img); }).length;
  var altCoverage = imgTags.length > 0 ? imgsWithAlt / imgTags.length : 1;

  // === TRUST & SOCIAL PROOF ===
  var testimonialPatterns = [
    /testimoni/i, /what\s*(our|my)?\s*(clients?|customers?|patients?)\s*say/i,
    /\bclient\s*reviews?\b/i, /\bsuccess\s*stor/i, /\bbefore\s*(&|and)\s*after\b/i,
  ];
  var hasTestimonials = testimonialPatterns.some(function(p) { return p.test(html); });

  var socialDomains = ['instagram.com', 'facebook.com', 'tiktok.com', 'youtube.com', 'twitter.com', 'x.com'];
  var foundSocials = {};
  socialDomains.forEach(function(domain) {
    var pattern = new RegExp('href\\s*=\\s*["\'][^"\']*' + domain.replace('.', '\\.') + '[^"\']*["\']', 'gi');
    if (pattern.test(html)) {
      var key = (domain === 'twitter.com' || domain === 'x.com') ? 'twitter_x' : domain;
      foundSocials[key] = true;
    }
  });
  var socialLinks = Object.keys(foundSocials).length;

  var trustPatterns = [
    /certif/i, /accredit/i, /\blicensed\b/i, /board.certified/i,
    /\baward/i, /member\s*of/i, /\bassociation\b/i,
  ];
  var hasTrustSignals = trustPatterns.some(function(p) { return p.test(html); });

  // === SCHEMA MARKUP ===
  var hasSchema = false;
  var schemaMatch = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (schemaMatch) {
    var schemaTypes = ['localbusiness', 'medicalbusiness', 'healthandbeautybusiness', 'organization', 'service', 'professionalservice'];
    hasSchema = schemaMatch.some(function(block) {
      var blockLower = block.toLowerCase();
      return schemaTypes.some(function(t) { return blockLower.includes(t); });
    });
  }

  // === SEO META TAGS ===
  var hasMetaDescription = /<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["'][^"']+["']/i.test(html) ||
                           /<meta[^>]*content\s*=\s*["'][^"']+["'][^>]*name\s*=\s*["']description["']/i.test(html);
  var hasTitleTag = /<title[^>]*>[^<]+<\/title>/i.test(html);
  var hasCanonical = /<link[^>]*rel\s*=\s*["']canonical["']/i.test(html);
  var hasOgTags = /<meta[^>]*property\s*=\s*["']og:/i.test(html);
  var hasLangAttr = /<html[^>]*lang\s*=/i.test(html);

  // === ACCESSIBILITY ===
  var hasAriaLabels = /aria-label\s*=/i.test(html);
  var hasRoleAttrs = /role\s*=\s*["']/i.test(html);

  // === MOBILE ===
  var hasViewport = lower.includes('name="viewport"') || lower.includes("name='viewport'");

  return {
    ctaStrength, hasClickablePhone, hasBooking, modernSignals, semanticCount,
    properHeadings, altCoverage, hasTestimonials, socialLinks, hasTrustSignals,
    hasSchema, loadTimeMs: fetchTimeMs || null, hasMetaDescription, hasTitleTag,
    hasCanonical, hasOgTags, hasLangAttr, hasAriaLabels, hasRoleAttrs, hasViewport,
  };
}

// --- Google Places Search ---

async function searchGooglePlaces(businessName, city, state) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  const query = `${businessName} ${city || ''} ${state || ''}`.trim();

  try {
    const res = await httpRequest('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.reviews,places.photos,places.currentOpeningHours,places.nationalPhoneNumber,places.websiteUri,places.businessStatus,places.editorialSummary',
      },
      body: JSON.stringify({ textQuery: query }),
      timeout: 30000,
    });

    if (res.data && res.data.places && res.data.places.length > 0) {
      return res.data.places[0];
    }
    return null;
  } catch (err) {
    console.error('Google Places search failed:', err.message);
    return null;
  }
}

// --- Competitor Discovery ---

async function discoverCompetitors(businessType, city, state, prospectName) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return [];

  const query = `${businessType} in ${city} ${state || ''}`.trim();

  try {
    const res = await httpRequest('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.photos,places.currentOpeningHours,places.nationalPhoneNumber',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 10 }),
      timeout: 30000,
    });

    if (!res.data || !res.data.places) return [];

    const normalizedProspect = prospectName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

    return res.data.places
      .filter(function(p) {
        const name = (p.displayName && p.displayName.text) || '';
        const normalized = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        return !normalized.includes(normalizedProspect) && !normalizedProspect.includes(normalized);
      })
      .slice(0, 2)
      .map(function(p, idx) {
        return {
          name: (p.displayName && p.displayName.text) || 'Unknown',
          rank: idx + 1,
          reviewCount: p.userRatingCount || 0,
          rating: p.rating || 0,
          websiteUrl: p.websiteUri || null,
          photoCount: p.photos ? p.photos.length : 0,
          hasHours: !!(p.currentOpeningHours && p.currentOpeningHours.periods),
          hasPhone: !!p.nationalPhoneNumber,
        };
      });
  } catch (err) {
    console.error('Competitor discovery failed:', err.message);
    return [];
  }
}

// --- Keyword Rankings ---

function getKeywordsForType(businessType, city, state) {
  var location = (city + (state ? ' ' + state : '')).trim();
  var type = (businessType || '').toLowerCase();

  if (type.includes('med spa') || type.includes('medspa') || type.includes('medical spa')) {
    return [
      { query: 'med spa in ' + location, label: 'Med Spa' },
      { query: 'botox ' + location, label: 'Botox' },
      { query: 'medical spa ' + location, label: 'Medical Spa' },
    ];
  } else if (type.includes('massage')) {
    return [
      { query: 'massage therapist in ' + location, label: 'Massage Therapist' },
      { query: 'massage near ' + location, label: 'Massage Near Me' },
      { query: 'deep tissue massage ' + location, label: 'Deep Tissue Massage' },
    ];
  } else if (type.includes('wellness')) {
    return [
      { query: 'wellness center in ' + location, label: 'Wellness Center' },
      { query: 'holistic health ' + location, label: 'Holistic Health' },
      { query: 'wellness spa ' + location, label: 'Wellness Spa' },
    ];
  } else {
    return [
      { query: businessType + ' in ' + location, label: businessType },
      { query: businessType + ' near ' + location, label: businessType + ' Near Me' },
    ];
  }
}

async function checkKeywordRankings(businessName, businessType, city, state) {
  var apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || !city) return [];

  var keywords = getKeywordsForType(businessType, city, state);

  var results = await Promise.all(keywords.map(function(kw) {
    return httpRequest('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({ textQuery: kw.query, maxResultCount: 20 }),
      timeout: 30000,
    }).then(function(res) {
      if (!res.data || !res.data.places) return { label: kw.label, query: kw.query, position: null, totalResults: 0 };

      var places = res.data.places;
      var normalizedBiz = businessName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

      for (var i = 0; i < places.length; i++) {
        var name = (places[i].displayName && places[i].displayName.text) || '';
        var normalizedName = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        if (normalizedName.includes(normalizedBiz) || normalizedBiz.includes(normalizedName)) {
          return { label: kw.label, query: kw.query, position: i + 1, totalResults: places.length };
        }
      }

      return { label: kw.label, query: kw.query, position: null, totalResults: places.length };
    }).catch(function() {
      return { label: kw.label, query: kw.query, position: null, totalResults: 0 };
    });
  }));

  return results;
}

// --- Score Calculations ---

function calculateWebsiteScore(websiteUrl, htmlAnalysis) {
  var findings = [];
  var score = 0;

  if (!websiteUrl) {
    findings.push({ label: 'No Website', value: 'Not found', points: 0, maxPoints: 100 });
    return { score: 0, findings: findings };
  }

  if (!htmlAnalysis) {
    findings.push({ label: 'Website Status', value: 'Failed to load', points: 0, maxPoints: 100 });
    return { score: 0, findings: findings };
  }

  // 1. Speed & Security (0-25): HTTPS + load speed
  var speedSecPoints = 0;
  var isHttps = websiteUrl.startsWith('https://');
  if (isHttps) speedSecPoints += 10;
  var speedLabel = 'Unknown';
  if (htmlAnalysis.loadTimeMs !== null) {
    var sec = htmlAnalysis.loadTimeMs / 1000;
    if (sec < 1.5) { speedSecPoints += 15; speedLabel = sec.toFixed(1) + 's'; }
    else if (sec < 3) { speedSecPoints += 10; speedLabel = sec.toFixed(1) + 's'; }
    else if (sec < 5) { speedSecPoints += 5; speedLabel = sec.toFixed(1) + 's'; }
    else { speedLabel = sec.toFixed(1) + 's'; }
  }
  score += speedSecPoints;
  var ssVal = (isHttps ? 'Secure' : 'No SSL') + (speedLabel !== 'Unknown' ? ', ' + speedLabel : '');
  findings.push({ label: 'Speed & Security', value: ssVal, points: speedSecPoints, maxPoints: 25 });

  // 2. SEO & Discoverability (0-25): title, meta, canonical, headings, schema
  var seoPoints = 0;
  var seoHits = [];
  if (htmlAnalysis.hasTitleTag) { seoPoints += 6; seoHits.push('title'); }
  if (htmlAnalysis.hasMetaDescription) { seoPoints += 6; seoHits.push('meta'); }
  if (htmlAnalysis.hasCanonical) { seoPoints += 4; }
  if (htmlAnalysis.properHeadings) { seoPoints += 5; }
  if (htmlAnalysis.hasSchema) { seoPoints += 4; }
  score += seoPoints;
  var seoLabel = seoPoints >= 20 ? 'Strong' : seoPoints >= 12 ? 'Partial' : 'Weak';
  findings.push({ label: 'SEO & Discoverability', value: seoLabel, points: seoPoints, maxPoints: 25 });

  // 3. Design & UX (0-25): modern design, mobile, CTA, booking
  var uxPoints = 0;
  var ms = htmlAnalysis.modernSignals;
  if (ms >= 8) uxPoints += 7;
  else if (ms >= 6) uxPoints += 5;
  else if (ms >= 4) uxPoints += 3;
  if (htmlAnalysis.hasViewport) uxPoints += 5;
  if (htmlAnalysis.hasClickablePhone) uxPoints += 3;
  if (htmlAnalysis.ctaStrength === 'strong') uxPoints += 5;
  else if (htmlAnalysis.ctaStrength === 'good') uxPoints += 4;
  else if (htmlAnalysis.ctaStrength === 'present') uxPoints += 2;
  if (htmlAnalysis.hasBooking) uxPoints += 5;
  uxPoints = Math.min(uxPoints, 25);
  score += uxPoints;
  var uxLabel = uxPoints >= 20 ? 'Modern & Effective' : uxPoints >= 12 ? 'Needs Improvement' : 'Outdated';
  findings.push({ label: 'Design & User Experience', value: uxLabel, points: uxPoints, maxPoints: 25 });

  // 4. Trust & Credibility (0-25): testimonials, social proof, accessibility, structure
  var trustPoints = 0;
  if (htmlAnalysis.hasTestimonials) trustPoints += 7;
  if (htmlAnalysis.socialLinks > 0) trustPoints += 5;
  if (htmlAnalysis.hasTrustSignals) trustPoints += 5;
  if (htmlAnalysis.altCoverage >= 0.5) trustPoints += 4;
  if (htmlAnalysis.semanticCount >= 3) trustPoints += 4;
  trustPoints = Math.min(trustPoints, 25);
  score += trustPoints;
  var trustLabel = trustPoints >= 18 ? 'Strong' : trustPoints >= 10 ? 'Some' : 'Weak';
  findings.push({ label: 'Trust & Credibility', value: trustLabel, points: trustPoints, maxPoints: 25 });

  // Total: 25+25+25+25 = 100
  return { score: Math.min(score, 100), findings: findings };
}

function calculateReviewScore(place) {
  var findings = [];
  var score = 0;

  var reviewCount = place ? (place.userRatingCount || 0) : 0;
  var rating = place ? (place.rating || 0) : 0;

  // Review count (0-60)
  var countPoints = 0;
  if (reviewCount === 0) countPoints = 0;
  else if (reviewCount <= 5) countPoints = 7;
  else if (reviewCount <= 10) countPoints = 13;
  else if (reviewCount <= 25) countPoints = 23;
  else if (reviewCount <= 50) countPoints = 33;
  else if (reviewCount <= 100) countPoints = 43;
  else if (reviewCount <= 150) countPoints = 50;
  else if (reviewCount <= 200) countPoints = 57;
  else countPoints = 60;

  score += countPoints;
  findings.push({
    label: 'Review Count',
    value: reviewCount + ' review' + (reviewCount !== 1 ? 's' : ''),
    points: countPoints,
    maxPoints: 60,
  });

  // Star rating (0-40)
  var ratingPoints = 0;
  if (rating > 0) {
    if (rating >= 4.9) ratingPoints = 40;
    else if (rating >= 4.7) ratingPoints = 37;
    else if (rating >= 4.5) ratingPoints = 33;
    else if (rating >= 4.3) ratingPoints = 27;
    else if (rating >= 4.0) ratingPoints = 20;
    else if (rating >= 3.5) ratingPoints = 13;
    else if (rating >= 3.0) ratingPoints = 7;
    else ratingPoints = 3;
  }
  score += ratingPoints;
  findings.push({
    label: 'Average Rating',
    value: rating > 0 ? rating.toFixed(1) + ' stars' : 'No rating',
    points: ratingPoints,
    maxPoints: 40,
  });

  // Total: 60+40 = 100
  return { score: score, findings: findings };
}

function calculateSearchScore(keywordResults, place) {
  var findings = [];
  var score = 0;

  // 1. Keyword Rankings (0-50)
  var kwScore = 0;
  var rankedCount = 0;
  if (keywordResults && keywordResults.length > 0) {
    keywordResults.forEach(function(kw) {
      if (kw.position !== null) {
        rankedCount++;
        if (kw.position <= 3) kwScore += 25;
        else if (kw.position <= 5) kwScore += 18;
        else if (kw.position <= 10) kwScore += 12;
        else if (kw.position <= 15) kwScore += 6;
        else kwScore += 3;
      }
    });
    kwScore = Math.min(kwScore, 50);
  }
  score += kwScore;
  var kwLabel = rankedCount === 0 ? 'Not ranking' : rankedCount + '/' + (keywordResults ? keywordResults.length : 0) + ' keywords found';
  findings.push({ label: 'Keyword Rankings', value: kwLabel, points: kwScore, maxPoints: 50 });

  // 2. Google Business Profile (0-50)
  var gbpScore = 0;
  var gbpDetails = [];
  if (place) {
    if (place.photos && place.photos.length >= 5) { gbpScore += 15; gbpDetails.push('photos'); }
    else if (place.photos && place.photos.length > 0) { gbpScore += 7; gbpDetails.push('few photos'); }
    if (place.currentOpeningHours && place.currentOpeningHours.periods) { gbpScore += 15; gbpDetails.push('hours'); }
    if (place.nationalPhoneNumber) { gbpScore += 10; gbpDetails.push('phone'); }
    if (place.editorialSummary && place.editorialSummary.text) { gbpScore += 10; gbpDetails.push('description'); }
  }
  score += gbpScore;
  var gbpLabel = gbpScore >= 40 ? 'Complete' : gbpScore >= 20 ? 'Partial' : place ? 'Incomplete' : 'Not found';
  findings.push({ label: 'Google Business Profile', value: gbpLabel, points: gbpScore, maxPoints: 50 });

  // Total: 50+50 = 100
  return { score: Math.min(score, 100), findings: findings };
}

function calculateExperienceScore(htmlAnalysis) {
  var findings = [];
  var score = 0;

  if (!htmlAnalysis) {
    findings.push({ label: 'No Website Data', value: 'N/A', points: 0, maxPoints: 100 });
    return { score: 0, findings: findings };
  }

  // 1. Mobile Experience (0-30)
  var mobilePoints = 0;
  if (htmlAnalysis.hasViewport) mobilePoints += 15;
  if (htmlAnalysis.hasClickablePhone) mobilePoints += 15;
  score += mobilePoints;
  var mobileLabel = mobilePoints >= 30 ? 'Fully mobile-ready' : mobilePoints >= 15 ? 'Partially mobile-ready' : 'Not mobile-friendly';
  findings.push({ label: 'Mobile Experience', value: mobileLabel, points: mobilePoints, maxPoints: 30 });

  // 2. Online Booking (0-30)
  var bookingPoints = htmlAnalysis.hasBooking ? 30 : 0;
  score += bookingPoints;
  findings.push({ label: 'Online Booking', value: bookingPoints > 0 ? 'Available' : 'Not found', points: bookingPoints, maxPoints: 30 });

  // 3. Modern Design (0-20)
  var designPoints = 0;
  var ms = htmlAnalysis.modernSignals;
  if (ms >= 6) designPoints = 20;
  else if (ms >= 4) designPoints = 10;
  score += designPoints;
  var designLabel = designPoints >= 20 ? 'Modern' : designPoints >= 10 ? 'Dated' : 'Outdated';
  findings.push({ label: 'Visual Design', value: designLabel, points: designPoints, maxPoints: 20 });

  // 4. Page Structure (0-20)
  var structPoints = 0;
  if (htmlAnalysis.semanticCount >= 3) structPoints += 10;
  if (htmlAnalysis.properHeadings) structPoints += 10;
  score += structPoints;
  var structLabel = structPoints >= 20 ? 'Well organized' : structPoints >= 10 ? 'Partial' : 'Poor';
  findings.push({ label: 'Page Structure', value: structLabel, points: structPoints, maxPoints: 20 });

  // Total: 30+30+20+20 = 100
  return { score: Math.min(score, 100), findings: findings };
}

// --- Findings Generation ---

function generateFindings(prospect, competitors, scoring) {
  var findings = [];
  var biz = prospect.businessName || 'This business';
  var comps = competitors || [];

  // Website findings
  if (!prospect.websiteUrl) {
    findings.push({ type: 'critical', text: biz + ' has no website. Potential clients searching online have no way to learn about services, see pricing, or book appointments \u2014 they\'ll go to a competitor who does.' });
  } else if (scoring.website.score <= 17) {
    findings.push({ type: 'critical', text: 'The website is in poor shape \u2014 scoring only ' + scoring.website.score + ' out of ' + scoring.website.max + '. Critical issues with design, SEO, or functionality are costing potential clients.' });
  } else if (scoring.website.score <= 50) {
    findings.push({ type: 'warning', text: 'The website needs significant improvement (' + scoring.website.score + '/' + scoring.website.max + '). Missing modern design elements, weak CTAs, or poor structure are hurting conversion rates.' });
  } else if (scoring.website.score >= 80) {
    findings.push({ type: 'positive', text: 'Strong website quality (' + scoring.website.score + '/' + scoring.website.max + '). Good foundation with modern design and clear calls-to-action.' });
  }

  // Review count findings
  var rc = prospect.reviewCount || 0;
  if (rc === 0) {
    findings.push({ type: 'critical', text: 'Zero Google reviews is a major red flag for potential clients. 93% of consumers read reviews before choosing a local business. This needs immediate attention.' });
  } else if (rc < 10) {
    findings.push({ type: 'critical', text: 'Only ' + rc + ' Google review' + (rc === 1 ? '' : 's') + '. Most consumers won\'t trust a business with fewer than 10 reviews. Competitors with more reviews will win the click every time.' });
  } else if (rc < 25) {
    findings.push({ type: 'warning', text: rc + ' Google reviews is a start, but still below the threshold (25+) where businesses see a meaningful boost in trust and local search ranking.' });
  } else if (rc < 50) {
    findings.push({ type: 'positive', text: rc + ' reviews is a healthy count. Continuing to collect reviews consistently will strengthen the competitive position.' });
  } else {
    findings.push({ type: 'positive', text: rc + ' Google reviews is strong social proof. This is a significant competitive advantage in the local market.' });
  }

  // Star rating
  var rating = prospect.rating || 0;
  if (rating > 0 && rating < 4.0) {
    findings.push({ type: 'critical', text: 'A ' + rating.toFixed(1) + '-star rating is below the threshold most consumers consider acceptable (4.0+). This actively drives potential clients to competitors.' });
  } else if (rating >= 4.0 && rating < 4.5) {
    findings.push({ type: 'warning', text: rating.toFixed(1) + ' stars is decent but there\'s room for improvement. Businesses rated 4.5+ see significantly higher click-through rates.' });
  } else if (rating >= 4.5) {
    findings.push({ type: 'positive', text: rating.toFixed(1) + '-star rating is excellent. This builds strong trust with potential clients browsing Google.' });
  }

  // Competitor review comparison
  if (comps.length > 0) {
    var compWithMoreReviews = comps.filter(function(c) { return c.reviewCount > rc; });
    if (compWithMoreReviews.length > 0) {
      var biggest = compWithMoreReviews.sort(function(a, b) { return b.reviewCount - a.reviewCount; })[0];
      var gap = biggest.reviewCount - rc;
      findings.push({ type: 'critical', text: biggest.name + ' has ' + biggest.reviewCount + ' reviews \u2014 ' + gap + ' more than ' + biz + '. In local search, review count is one of the top ranking factors. This gap directly costs visibility.' });
    } else {
      findings.push({ type: 'positive', text: biz + ' leads all discovered competitors in review count. That\'s a strong competitive advantage for local search visibility.' });
    }

    var higherStars = comps.filter(function(c) { return c.rating > rating && c.rating > 0; });
    if (higherStars.length > 0 && rating > 0) {
      var best = higherStars.sort(function(a, b) { return b.rating - a.rating; })[0];
      findings.push({ type: 'warning', text: best.name + ' has a higher rating (' + best.rating.toFixed(1) + ' stars vs ' + rating.toFixed(1) + '). When review counts are similar, the higher-rated business wins the click.' });
    }
  }

  // Search visibility
  if (scoring.search.score <= 25) {
    findings.push({ type: 'critical', text: 'Very low search visibility (' + scoring.search.score + '/' + scoring.search.max + '). ' + biz + ' isn\'t showing up when potential clients search for these services in the area.' });
  } else if (scoring.search.score >= 75) {
    findings.push({ type: 'positive', text: 'Good search visibility (' + scoring.search.score + '/' + scoring.search.max + '). Ranking well for local keywords drives consistent organic traffic from high-intent clients.' });
  }

  // GBP completeness
  if (!prospect.hasGBP) {
    findings.push({ type: 'critical', text: 'No Google Business Profile found. This is free and essential \u2014 it\'s how patients find you on Google Maps and local search.' });
  } else {
    if (!prospect.hasHours) {
      findings.push({ type: 'warning', text: 'Business hours are not listed on the Google Business Profile. This hurts local ranking and makes the business look less established.' });
    }
    if (prospect.photoCount < 5) {
      findings.push({ type: 'warning', text: 'Only ' + (prospect.photoCount || 0) + ' photos on the Google Business Profile. Businesses with 10+ photos get significantly more engagement.' });
    }
  }

  // Client experience
  if (scoring.experience.score <= 30) {
    findings.push({ type: 'warning', text: 'The client experience needs work (' + scoring.experience.score + '/' + scoring.experience.max + '). Missing online booking, poor mobile experience, or hard-to-navigate site structure loses potential clients.' });
  } else if (scoring.experience.score >= 80) {
    findings.push({ type: 'positive', text: 'Strong client experience (' + scoring.experience.score + '/' + scoring.experience.max + '). Easy booking, mobile-friendly, and well-structured for visitors.' });
  }

  // Sort: critical first, then warning, then positive
  var order = { critical: 0, warning: 1, positive: 2 };
  findings.sort(function(a, b) { return order[a.type] - order[b.type]; });

  return findings;
}

// --- Main Handler ---

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, {});
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = req.body;
    const { businessName, city, state, websiteUrl, businessType } = body;

    if (!businessName || !city) {
      return sendJson(res,400, { error: 'Business name and city are required' });
    }

    // Run all analyses in parallel
    const [placeResult, htmlResult, keywordResults, competitors] = await Promise.all([
      searchGooglePlaces(businessName, city, state),
      websiteUrl ? fetchHTML(websiteUrl).then(function(r) {
        return { html: r.html, timeMs: r.timeMs, analysis: analyzeWebsiteHTML(r.html, r.timeMs) };
      }) : Promise.resolve({ html: null, timeMs: null, analysis: null }),
      checkKeywordRankings(businessName, businessType || 'Med Spa', city, state),
      discoverCompetitors(businessType || 'Med Spa', city, state, businessName),
    ]);

    // Use website URL from Places if not provided
    var finalWebsiteUrl = websiteUrl || (placeResult && placeResult.websiteUri) || null;

    // If we didn't have a URL but Places gave us one, fetch and analyze it
    var htmlAnalysis = htmlResult.analysis;
    if (!websiteUrl && finalWebsiteUrl && !htmlAnalysis) {
      var fetched = await fetchHTML(finalWebsiteUrl);
      htmlAnalysis = analyzeWebsiteHTML(fetched.html, fetched.timeMs);
    }

    // Calculate scores
    var websiteScore = calculateWebsiteScore(finalWebsiteUrl, htmlAnalysis);
    var reviewScore = calculateReviewScore(placeResult);
    var searchScore = calculateSearchScore(keywordResults, placeResult);
    var experienceScore = calculateExperienceScore(htmlAnalysis);

    var total = Math.round((websiteScore.score + reviewScore.score + searchScore.score + experienceScore.score) / 4);

    var grade;
    if (total >= 90) grade = 'A';
    else if (total >= 80) grade = 'B';
    else if (total >= 70) grade = 'C';
    else if (total >= 60) grade = 'D';
    else grade = 'F';

    // Build prospect summary
    var prospect = {
      businessName: businessName,
      reviewCount: placeResult ? (placeResult.userRatingCount || 0) : 0,
      rating: placeResult ? (placeResult.rating || 0) : 0,
      hasGBP: !!placeResult,
      photoCount: placeResult && placeResult.photos ? placeResult.photos.length : 0,
      hasHours: !!(placeResult && placeResult.currentOpeningHours && placeResult.currentOpeningHours.periods),
      hasPhone: !!(placeResult && placeResult.nationalPhoneNumber),
      websiteUrl: finalWebsiteUrl,
    };

    var scoring = {
      website: { score: websiteScore.score, max: 100 },
      reviews: { score: reviewScore.score, max: 100 },
      search: { score: searchScore.score, max: 100 },
      experience: { score: experienceScore.score, max: 100 },
      total: total,
      grade: grade,
    };

    var findings = generateFindings(prospect, competitors, scoring);

    // Keyword ranking details for the frontend
    var rankings = (keywordResults || []).map(function(kw) {
      return {
        label: kw.label,
        position: kw.position,
      };
    });

    return sendJson(res,200, {
      success: true,
      prospect: prospect,
      competitors: competitors,
      scoring: scoring,
      findings: findings,
      rankings: rankings,
      websiteFindings: websiteScore.findings || [],
      reviewFindings: reviewScore.findings || [],
      searchFindings: searchScore.findings || [],
      experienceFindings: experienceScore.findings || [],
    });
  } catch (err) {
    console.error('Analysis failed:', err);
    return sendJson(res,500, { error: 'Analysis failed: ' + err.message });
  }
};
