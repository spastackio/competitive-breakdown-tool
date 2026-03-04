/* =============================================================
   COMPETITIVE BREAKDOWN — SpaStack
   Matching score.spastack.io design patterns
   ============================================================= */

(function () {
  'use strict';

  var STORAGE_KEY = 'spastack-cb-form';

  // --- DOM refs ---
  var form = document.getElementById('analyzeForm');
  var backBtn = document.getElementById('backToInput');
  var retryBtn = document.getElementById('retryBtn');

  // --- SVG icon templates (static, trusted content) ---
  var ICONS = {
    website: function () {
      var svg = createSvg();
      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '2'); rect.setAttribute('y', '3');
      rect.setAttribute('width', '20'); rect.setAttribute('height', '14');
      rect.setAttribute('rx', '2');
      var l1 = createLine('8', '21', '16', '21');
      var l2 = createLine('12', '17', '12', '21');
      svg.appendChild(rect); svg.appendChild(l1); svg.appendChild(l2);
      return svg;
    },
    reviews: function () {
      var svg = createSvg();
      var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2');
      svg.appendChild(poly);
      return svg;
    },
    search: function () {
      var svg = createSvg();
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', '11'); c.setAttribute('cy', '11'); c.setAttribute('r', '8');
      var l = createLine('21', '21', '16.65', '16.65');
      svg.appendChild(c); svg.appendChild(l);
      return svg;
    },
    experience: function () {
      var svg = createSvg();
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2');
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', '12'); c.setAttribute('cy', '7'); c.setAttribute('r', '4');
      svg.appendChild(p); svg.appendChild(c);
      return svg;
    },
  };

  function createSvg() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    return svg;
  }

  function createLine(x1, y1, x2, y2) {
    var l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    return l;
  }

  // --- Helpers ---
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // --- Init ---
  loadFormState();
  bindEvents();

  function bindEvents() {
    form.addEventListener('submit', handleSubmit);
    backBtn.addEventListener('click', showLanding);
    retryBtn.addEventListener('click', showLanding);
    form.addEventListener('input', saveFormState);
    form.addEventListener('change', saveFormState);
  }

  // =============================================
  // VIEWS
  // =============================================

  function showLanding() {
    document.getElementById('landing-page').classList.remove('hidden');
    document.getElementById('loading-section').classList.add('hidden');
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('error-section').classList.add('hidden');
    window.scrollTo(0, 0);
  }

  function showLoading(businessName) {
    document.getElementById('loadingBusinessName').textContent = businessName;
    document.getElementById('stepText1').textContent = 'Searching for ' + businessName + '...';

    var steps = document.querySelectorAll('.loading-step');
    steps.forEach(function (step) {
      step.classList.remove('active', 'done');
    });

    document.getElementById('landing-page').classList.add('hidden');
    document.getElementById('loading-section').classList.remove('hidden');
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('error-section').classList.add('hidden');
    window.scrollTo(0, 0);

    var delays = [0, 2000, 4500, 7000];
    steps.forEach(function (step, i) {
      setTimeout(function () { step.classList.add('active'); }, delays[i]);
    });
  }

  function completeLoadingSteps() {
    var steps = document.querySelectorAll('.loading-step');
    steps.forEach(function (step) {
      step.classList.remove('active');
      step.classList.add('done');
    });
  }

  function showResults() {
    document.getElementById('landing-page').classList.add('hidden');
    document.getElementById('loading-section').classList.add('hidden');
    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('error-section').classList.add('hidden');
    window.scrollTo(0, 0);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { animateResults(); });
    });
  }

  function showError(message) {
    document.getElementById('errorMessage').textContent = message || 'We couldn\'t analyze this business right now. Please try again.';
    document.getElementById('landing-page').classList.add('hidden');
    document.getElementById('loading-section').classList.add('hidden');
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('error-section').classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  // =============================================
  // FORM HANDLING
  // =============================================

  function handleSubmit(e) {
    e.preventDefault();

    var businessName = document.getElementById('businessName').value.trim();
    var city = document.getElementById('city').value.trim();
    var state = document.getElementById('state').value.trim();
    var websiteUrl = document.getElementById('websiteUrl').value.trim();
    var businessType = document.getElementById('businessType').value;

    if (!businessName || !city) return;

    showLoading(businessName);

    var payload = {
      businessName: businessName,
      city: city,
      state: state,
      websiteUrl: websiteUrl || null,
      businessType: businessType,
    };

    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        var contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Server error \u2014 please try again');
        }
        return res.json();
      })
      .then(function (data) {
        if (!data.success) {
          showError(data.error || 'Unknown error');
          return;
        }
        completeLoadingSteps();

        setTimeout(function () {
          renderReport(data, city, state);
          showResults();
        }, 800);
      })
      .catch(function (err) {
        showError(err.message || 'Network error');
      });
  }

  // =============================================
  // REPORT RENDERING
  // =============================================

  function renderReport(data, city, state) {
    var scoring = data.scoring;
    var prospect = data.prospect;
    var competitors = data.competitors || [];
    var findings = data.findings || [];
    var rankings = data.rankings || [];

    // Meta
    var location = [city, state].filter(Boolean).join(', ');
    document.getElementById('reportMeta').textContent =
      [prospect.businessName, location].filter(Boolean).join(' \u2022 ');

    // Score gauge
    var total = scoring.total;
    document.getElementById('scoreNumber').textContent = '0';

    // Score label
    var labelEl = document.getElementById('scoreLabel');
    var grade = scoring.grade;
    var gradeLabels = { A: 'Excellent', B: 'Good', C: 'Average', D: 'Below Average', F: 'Needs Work' };
    var gradeColors = {
      A: { bg: '#F0FDF4', color: '#16A34A' },
      B: { bg: '#EBF3FC', color: '#3A7BD5' },
      C: { bg: '#FFFBEB', color: '#CA8A04' },
      D: { bg: '#FFF7ED', color: '#EA580C' },
      F: { bg: '#FEF2F2', color: '#DC2626' },
    };
    labelEl.textContent = gradeLabels[grade] || 'Unknown';
    labelEl.style.background = (gradeColors[grade] || gradeColors.F).bg;
    labelEl.style.color = (gradeColors[grade] || gradeColors.F).color;

    // Gauge color
    var gaugeEl = document.getElementById('gaugeFill');
    gaugeEl.style.stroke = (gradeColors[grade] || gradeColors.F).color;

    // Store total for animation
    document.getElementById('scoreNumber').setAttribute('data-target', total);

    // Breakdown cards (order: search, website, reviews, experience)
    renderBreakdownCards(scoring, data);

    // Competitors detail
    renderCompetitors(competitors);

    // Review comparison
    renderReviewChart(prospect, competitors);

    // Rankings
    renderRankings(rankings);

    // Findings
    renderFindings(findings);
  }

  function renderBreakdownCards(scoring, data) {
    var container = document.getElementById('breakdownGrid');
    container.textContent = '';

    var categories = [
      { key: 'search', label: 'Search Visibility', score: scoring.search.score, max: scoring.search.max, findings: data.searchFindings || [] },
      { key: 'website', label: 'Website Quality', score: scoring.website.score, max: scoring.website.max, findings: data.websiteFindings || [] },
      { key: 'reviews', label: 'Google Reviews', score: scoring.reviews.score, max: scoring.reviews.max, findings: data.reviewFindings || [] },
      { key: 'experience', label: 'Client Experience', score: scoring.experience.score, max: scoring.experience.max, findings: data.experienceFindings || [] },
    ];

    categories.forEach(function (cat) {
      var card = el('div', 'breakdown-card');
      var header = el('div', 'breakdown-header');

      var iconWrap = el('div', 'breakdown-icon-wrap');
      if (ICONS[cat.key]) iconWrap.appendChild(ICONS[cat.key]());
      header.appendChild(iconWrap);

      header.appendChild(el('h3', null, cat.label));
      header.appendChild(el('span', 'breakdown-score', cat.score + '/' + cat.max));

      card.appendChild(header);

      if (cat.findings && cat.findings.length > 0) {
        var list = el('div', 'findings-list');
        cat.findings.forEach(function (f) {
          var row = el('div', 'finding-row');
          row.appendChild(el('span', 'finding-label', f.label));

          var right = el('div', 'finding-right');
          right.appendChild(el('span', 'finding-value', f.value));

          var pct = f.maxPoints > 0 ? (f.points / f.maxPoints) : 0;
          var badgeClass = pct >= 0.7 ? 'good' : pct >= 0.4 ? 'okay' : 'bad';
          right.appendChild(el('span', 'finding-badge ' + badgeClass, f.points + '/' + f.maxPoints));

          row.appendChild(right);
          list.appendChild(row);
        });
        card.appendChild(list);
      }

      container.appendChild(card);
    });
  }

  function renderCompetitors(competitors) {
    var card = document.getElementById('competitorsCard');
    var container = document.getElementById('competitorsList');
    container.textContent = '';

    if (!competitors || competitors.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';

    competitors.forEach(function (comp) {
      var item = el('div', 'competitor-item');

      var header = el('div', 'competitor-header');
      var rank = el('span', 'competitor-rank', '#' + comp.rank);
      header.appendChild(rank);
      header.appendChild(el('span', 'competitor-name', comp.name));
      item.appendChild(header);

      var stats = el('div', 'competitor-stats');

      var reviewStat = el('div', 'competitor-stat');
      reviewStat.appendChild(el('span', 'competitor-stat-value', (comp.reviewCount || 0).toString()));
      reviewStat.appendChild(el('span', 'competitor-stat-label', 'Reviews'));
      stats.appendChild(reviewStat);

      var ratingStat = el('div', 'competitor-stat');
      ratingStat.appendChild(el('span', 'competitor-stat-value', comp.rating > 0 ? comp.rating.toFixed(1) + '\u2605' : 'N/A'));
      ratingStat.appendChild(el('span', 'competitor-stat-label', 'Rating'));
      stats.appendChild(ratingStat);

      var photoStat = el('div', 'competitor-stat');
      photoStat.appendChild(el('span', 'competitor-stat-value', (comp.photoCount || 0).toString()));
      photoStat.appendChild(el('span', 'competitor-stat-label', 'Photos'));
      stats.appendChild(photoStat);

      item.appendChild(stats);

      var details = el('div', 'competitor-details');
      details.appendChild(el('span', 'competitor-detail ' + (comp.websiteUrl ? 'detail-good' : 'detail-bad'), comp.websiteUrl ? 'Has website' : 'No website'));
      details.appendChild(el('span', 'competitor-detail ' + (comp.hasHours ? 'detail-good' : 'detail-bad'), comp.hasHours ? 'Hours listed' : 'No hours'));
      details.appendChild(el('span', 'competitor-detail ' + (comp.hasPhone ? 'detail-good' : 'detail-bad'), comp.hasPhone ? 'Phone listed' : 'No phone'));
      item.appendChild(details);

      container.appendChild(item);
    });
  }

  function renderReviewChart(prospect, competitors) {
    var container = document.getElementById('reviewChart');
    var card = document.getElementById('reviewComparisonCard');
    container.textContent = '';

    var entries = [{ name: prospect.businessName || 'Prospect', count: prospect.reviewCount || 0, rating: prospect.rating || 0, isProspect: true }];
    competitors.forEach(function (c) {
      if (c.name) entries.push({ name: c.name, count: c.reviewCount || 0, rating: c.rating || 0, isProspect: false });
    });

    if (entries.length <= 1 && entries[0].count === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    entries.sort(function (a, b) { return b.count - a.count; });
    var maxReviews = Math.max.apply(null, entries.map(function (e) { return e.count; }).concat([1]));

    entries.forEach(function (entry) {
      var pct = Math.round((entry.count / maxReviews) * 100);
      var row = el('div', 'review-row' + (entry.isProspect ? ' is-prospect' : ''));

      var nameSpan = el('span', 'review-name', entry.name);
      nameSpan.title = entry.name;
      row.appendChild(nameSpan);

      var track = el('div', 'review-bar-track');
      var fill = el('div', 'review-bar-fill');
      fill.setAttribute('data-width', pct + '%');
      track.appendChild(fill);
      row.appendChild(track);

      var info = el('span', 'review-count');
      info.textContent = entry.count;
      if (entry.rating > 0) {
        var starSpan = el('span', 'review-stars', ' (' + entry.rating.toFixed(1) + '\u2605)');
        info.appendChild(starSpan);
      }
      row.appendChild(info);
      container.appendChild(row);
    });
  }

  function renderRankings(rankings) {
    var card = document.getElementById('rankingsCard');
    var container = document.getElementById('rankingsList');
    container.textContent = '';

    if (!rankings || rankings.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';

    rankings.forEach(function (kw) {
      var row = el('div', 'ranking-row');
      row.appendChild(el('span', 'ranking-label', '\u201C' + kw.label + '\u201D'));

      var pos;
      if (kw.position !== null) {
        var posClass = kw.position <= 3 ? 'rank-top' : kw.position <= 10 ? 'rank-mid' : 'rank-low';
        pos = el('span', 'ranking-position ' + posClass, '#' + kw.position);
      } else {
        pos = el('span', 'ranking-position rank-none', 'Not in top 20');
      }
      row.appendChild(pos);
      container.appendChild(row);
    });
  }

  function renderFindings(findings) {
    var container = document.getElementById('findingsList');
    container.textContent = '';

    var typeLabels = { critical: 'Critical', warning: 'Warning', positive: 'Strength' };

    findings.forEach(function (f) {
      var item = el('div', 'rec-item ' + f.type);
      item.appendChild(el('span', 'rec-badge', typeLabels[f.type] || ''));
      item.appendChild(el('span', 'rec-text', f.text));
      container.appendChild(item);
    });
  }

  // =============================================
  // ANIMATIONS
  // =============================================

  function animateResults() {
    var total = parseInt(document.getElementById('scoreNumber').getAttribute('data-target')) || 0;
    var circumference = 534;
    var offset = circumference - (total / 100) * circumference;
    var gaugeEl = document.getElementById('gaugeFill');
    gaugeEl.style.strokeDashoffset = offset;

    animateCount(document.getElementById('scoreNumber'), 0, total, 1500);

    setTimeout(function () {
      var fills = document.querySelectorAll('.review-bar-fill');
      fills.forEach(function (fill) {
        fill.style.width = fill.getAttribute('data-width');
      });
    }, 800);
  }

  function animateCount(element, start, end, duration) {
    var startTime = null;
    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = Math.round(start + (end - start) * eased);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // =============================================
  // LOCAL STORAGE
  // =============================================

  function saveFormState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        businessName: document.getElementById('businessName').value,
        city: document.getElementById('city').value,
        state: document.getElementById('state').value,
        websiteUrl: document.getElementById('websiteUrl').value,
        businessType: document.getElementById('businessType').value,
      }));
    } catch (e) { /* ignore */ }
  }

  function loadFormState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.businessName) document.getElementById('businessName').value = data.businessName;
      if (data.city) document.getElementById('city').value = data.city;
      if (data.state) document.getElementById('state').value = data.state;
      if (data.websiteUrl) document.getElementById('websiteUrl').value = data.websiteUrl;
      if (data.businessType) document.getElementById('businessType').value = data.businessType;
    } catch (e) { /* ignore */ }
  }

})();
