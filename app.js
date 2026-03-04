/* =============================================================
   COMPETITIVE BREAKDOWN — SpaStack
   API-driven: form submission -> /api/analyze -> report
   ============================================================= */

(function () {
  'use strict';

  var STORAGE_KEY = 'spastack-cb-form';
  var body = document.body;

  // --- DOM refs ---
  var form = document.getElementById('analyzeForm');
  var analyzeBtn = document.getElementById('analyzeBtn');
  var backBtn = document.getElementById('backToInput');

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
    backBtn.addEventListener('click', showInput);

    // Auto-save form on input
    form.addEventListener('input', saveFormState);
    form.addEventListener('change', saveFormState);
  }

  // =============================================
  // VIEWS
  // =============================================

  function showInput() {
    body.className = 'mode-input';
    window.scrollTo(0, 0);
  }

  function showLoading(businessName) {
    document.getElementById('loadingBusinessName').textContent = businessName;
    document.getElementById('stepText1').textContent = 'Searching for ' + businessName + '...';

    // Reset all steps
    document.querySelectorAll('.loading-step').forEach(function (step) {
      step.classList.remove('active', 'done');
    });

    body.className = 'mode-loading';
    window.scrollTo(0, 0);

    // Animate steps sequentially
    var steps = document.querySelectorAll('.loading-step');
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

  function showReport() {
    body.className = 'mode-report';
    window.scrollTo(0, 0);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { animateReport(); });
    });
  }

  function showError(message) {
    body.className = 'mode-input';
    window.scrollTo(0, 0);
    alert('Analysis failed: ' + message);
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
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) {
          showError(data.error || 'Unknown error');
          return;
        }
        completeLoadingSteps();

        // Brief pause to show all checkmarks before transitioning
        setTimeout(function () {
          renderReport(data, city, state);
          showReport();
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
    var dateFmt = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    var location = [city, state].filter(Boolean).join(', ');
    document.getElementById('reportMeta').textContent =
      [prospect.businessName, location, dateFmt].filter(Boolean).join(' \u2022 ');

    // Grade circle
    var circle = document.getElementById('gradeCircle');
    circle.className = 'grade-circle';
    document.getElementById('gradeLetter').textContent = scoring.grade;
    document.getElementById('gradeScore').textContent = scoring.total + ' / 100';

    // Score bars
    renderScoreBars(scoring);

    // Review chart
    renderReviewChart(prospect, competitors);

    // Rankings
    renderRankings(rankings);

    // Findings
    renderFindings(findings);
  }

  function renderScoreBars(scoring) {
    var container = document.getElementById('scoreBars');
    container.textContent = '';

    var categories = [
      { label: 'Website Quality', score: scoring.website.score, max: scoring.website.max },
      { label: 'Google Reviews', score: scoring.reviews.score, max: scoring.reviews.max },
      { label: 'Search Visibility', score: scoring.search.score, max: scoring.search.max },
      { label: 'Client Experience', score: scoring.experience.score, max: scoring.experience.max },
    ];

    categories.forEach(function (cat) {
      var pct = Math.round((cat.score / cat.max) * 100);
      var colorClass = pct >= 70 ? 'bar-green' : pct >= 40 ? 'bar-yellow' : 'bar-red';

      var item = el('div', 'score-bar-item');

      var header = el('div', 'score-bar-header');
      header.appendChild(el('span', 'score-bar-label', cat.label));
      header.appendChild(el('span', 'score-bar-value', cat.score + ' / ' + cat.max));
      item.appendChild(header);

      var track = el('div', 'score-bar-track');
      var fill = el('div', 'score-bar-fill ' + colorClass);
      fill.setAttribute('data-width', pct + '%');
      track.appendChild(fill);
      item.appendChild(track);

      container.appendChild(item);
    });
  }

  function renderReviewChart(prospect, competitors) {
    var container = document.getElementById('reviewChart');
    container.textContent = '';

    var entries = [{ name: prospect.businessName || 'Prospect', count: prospect.reviewCount || 0, rating: prospect.rating || 0, isProspect: true }];
    competitors.forEach(function (c) {
      if (c.name) entries.push({ name: c.name, count: c.reviewCount || 0, rating: c.rating || 0, isProspect: false });
    });
    entries.sort(function (a, b) { return b.count - a.count; });

    var maxReviews = Math.max.apply(null, entries.map(function (e) { return e.count; }).concat([1]));

    entries.forEach(function (entry) {
      var pct = Math.round((entry.count / maxReviews) * 100);

      var row = el('div', 'chart-row' + (entry.isProspect ? ' is-prospect' : ''));

      var nameSpan = el('span', 'chart-name', entry.name);
      nameSpan.title = entry.name;
      row.appendChild(nameSpan);

      var track = el('div', 'chart-bar-track');
      var fill = el('div', 'chart-bar-fill');
      fill.setAttribute('data-width', pct + '%');
      track.appendChild(fill);
      row.appendChild(track);

      var info = el('span', 'chart-count');
      info.textContent = entry.count;
      if (entry.rating > 0) {
        var starSpan = el('span', 'chart-stars', ' (' + entry.rating.toFixed(1) + '\u2605)');
        info.appendChild(starSpan);
      }
      row.appendChild(info);
      container.appendChild(row);
    });
  }

  function renderRankings(rankings) {
    var section = document.getElementById('rankingsSection');
    var container = document.getElementById('rankingsList');
    container.textContent = '';

    if (!rankings || rankings.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';

    rankings.forEach(function (kw) {
      var item = el('div', 'ranking-item');

      var label = el('span', 'ranking-label', '\u201C' + kw.label + '\u201D');
      item.appendChild(label);

      var pos;
      if (kw.position !== null) {
        var posClass = kw.position <= 3 ? 'rank-top' : kw.position <= 10 ? 'rank-mid' : 'rank-low';
        pos = el('span', 'ranking-position ' + posClass, '#' + kw.position);
      } else {
        pos = el('span', 'ranking-position rank-none', 'Not in top 20');
      }
      item.appendChild(pos);

      container.appendChild(item);
    });
  }

  function renderFindings(findings) {
    var container = document.getElementById('findingsList');
    container.textContent = '';

    var icons = { critical: '\u2716', warning: '\u26A0', positive: '\u2714' };

    findings.forEach(function (f) {
      var item = el('div', 'finding-item finding-' + f.type);
      item.appendChild(el('div', 'finding-icon', icons[f.type]));
      item.appendChild(el('div', 'finding-text', f.text));
      container.appendChild(item);
    });
  }

  // =============================================
  // ANIMATIONS
  // =============================================

  function animateReport() {
    // Grade circle
    var circle = document.getElementById('gradeCircle');
    var grade = document.getElementById('gradeLetter').textContent;
    var gradeClsMap = { A: 'grade-a', B: 'grade-b', C: 'grade-c', D: 'grade-d', F: 'grade-f' };
    circle.classList.add('animate', gradeClsMap[grade] || 'grade-f');

    // Score bars stagger
    var bars = document.querySelectorAll('.score-bar-item');
    bars.forEach(function (bar, i) {
      setTimeout(function () {
        bar.classList.add('animate');
        var fill = bar.querySelector('.score-bar-fill');
        if (fill) fill.style.width = fill.getAttribute('data-width');
      }, 200 + i * 120);
    });

    // Chart rows stagger
    var rows = document.querySelectorAll('.chart-row');
    rows.forEach(function (row, i) {
      setTimeout(function () {
        row.classList.add('animate');
        var fill = row.querySelector('.chart-bar-fill');
        if (fill) fill.style.width = fill.getAttribute('data-width');
      }, 600 + i * 100);
    });

    // Ranking items stagger
    var rankItems = document.querySelectorAll('.ranking-item');
    rankItems.forEach(function (item, i) {
      setTimeout(function () { item.classList.add('animate'); }, 700 + i * 80);
    });

    // Findings stagger
    var findingItems = document.querySelectorAll('.finding-item');
    findingItems.forEach(function (item, i) {
      setTimeout(function () { item.classList.add('animate'); }, 900 + i * 80);
    });
  }

  // =============================================
  // LOCAL STORAGE (form values only)
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
