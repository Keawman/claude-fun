/* AWS CLI v2 Cheatsheet — application logic (vanilla JS, no build step). */
(function () {
  'use strict';

  var STORAGE = { theme: 'awscheat-theme', png: 'awscheat-png', nav: 'awscheat-nav-open' };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var topics = (window.AWSCHEAT && window.AWSCHEAT.topics || []).slice().sort(function (a, b) {
    return (a.order || 0) - (b.order || 0) || a.title.localeCompare(b.title);
  });
  var cardIndex = {};    // global card id -> { topic, card, el }
  var allCards = [];

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Minimal inline markup for prose: `code` and **bold**.
  function prose(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
  var ICON = {
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>'
  };

  var PH_RE = /<([a-z][a-z0-9-]*(?:\|[a-z0-9-]+)*)>/g;
  var SENT_OPEN = '⁅PH⁅', SENT_CLOSE = '⁆PH⁆';

  function highlightCommand(cmd) {
    // Protect <placeholders> from the bash tokenizer, highlight, then restore as styled spans.
    var protectedCmd = cmd.replace(PH_RE, function (_, name) { return SENT_OPEN + name + SENT_CLOSE; });
    var html;
    if (window.Prism && Prism.languages && Prism.languages.bash) {
      html = Prism.highlight(protectedCmd, Prism.languages.bash, 'bash');
    } else {
      html = esc(protectedCmd);
    }
    html = html.replace(new RegExp(SENT_OPEN + '([^⁆]+)' + SENT_CLOSE, 'g'), function (_, name) {
      return '<span class="ph" title="placeholder">&lt;' + esc(name) + '&gt;</span>';
    });
    // Emphasise the leading "aws" program name (and "aws" after pipes/newlines).
    html = html.replace(/(^|\n|\$\(|\| |; |&amp;&amp; )(aws)(?=\s)/g, '$1<span class="token aws">$2</span>');
    return html;
  }

  function highlightOutput(format, body) {
    if (!body) return '';
    if (format === 'json' && window.Prism && Prism.languages && Prism.languages.json) {
      return Prism.highlight(body, Prism.languages.json, 'json');
    }
    return esc(body).replace(PH_RE, '<span class="ph">&lt;$1&gt;</span>');
  }

  function promptLines(cmd) {
    var lines = cmd.split('\n');
    return lines.map(function (l, i) {
      var p = i === 0 ? '$' : '&gt;';
      var text = esc(l).replace(PH_RE, '<span class="ph">&lt;$1&gt;</span>');
      return '<span class="prompt">' + p + '</span> <span class="cmdline">' + text + '</span>';
    }).join('\n');
  }

  function firstWords(cmd) {
    var l = cmd.split('\n')[0].replace(/^\s*(?:for|while|if)\b.*$/, 'bash');
    var m = l.match(/aws(?:\s+[a-z0-9-]+){1,2}/);
    return m ? m[0] : l.slice(0, 40);
  }

  /* ---------- rendering ---------- */
  function renderTerminal(topic, card) {
    var out = card.output || { format: 'none', body: '' };
    var fmt = out.format || 'none';
    var body = '';
    if (fmt === 'none') {
      body = out.body ? esc(out.body) : '<span class="out-muted">(no output on success)</span>';
    } else if (fmt === 'stderr') {
      body = '<span class="stderr">' + esc(out.body) + '</span>';
    } else {
      body = '<span class="out">' + highlightOutput(fmt, out.body) + '</span>';
    }
    var shot = topic.id + '/' + card.id;
    var fmtLabel = fmt === 'none' ? '' : (fmt === 'stderr' ? 'stderr' : (fmt === 'plain' ? 'output' : '--output ' + fmt));
    return '<figure class="terminal" data-shot="' + esc(shot) + '">' +
      '<figcaption class="term-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
      '<span class="title">' + esc(firstWords(card.command)) + '</span>' +
      (fmtLabel ? '<span class="fmt">' + esc(fmtLabel) + '</span>' : '') +
      '</figcaption>' +
      '<pre class="term-body" tabindex="0">' + promptLines(card.command) + (body ? '\n' + body : '') + '</pre>' +
      '<img class="term-png" alt="Terminal screenshot for ' + esc(card.title) + '">' +
      '</figure>';
  }

  function renderCard(topic, card) {
    var gid = topic.id + '-' + card.id;
    var tags = (card.tags || []).map(function (t) {
      return '<span class="tag tag-' + esc(t) + '">' + esc(t) + '</span>';
    }).join('');
    var flags = '';
    if (card.flags && card.flags.length) {
      flags = '<table class="flags"><thead><tr><th scope="col">Flag</th><th scope="col">What it does</th></tr></thead><tbody>' +
        card.flags.map(function (f) {
          return '<tr><td><code>' + esc(f[0]) + '</code></td><td>' + prose(f[1]) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    var note = '';
    if (card.note) {
      var n = typeof card.note === 'string' ? { type: 'gotcha', text: card.note } : card.note;
      var label = n.type === 'danger' ? 'Danger' : (n.type === 'info' ? 'Note' : 'Gotcha');
      note = '<div class="callout callout-' + esc(n.type || 'gotcha') + '" role="note"><span class="ci">' + label + '</span><p>' + prose(n.text) + '</p></div>';
    }
    var meta = '';
    if ((card.iam && card.iam.length) || (card.related && card.related.length)) {
      meta = '<div class="meta">';
      if (card.iam && card.iam.length) {
        meta += '<div><b>IAM</b>' + card.iam.map(function (p) { return '<code>' + esc(p) + '</code> '; }).join('') + '</div>';
      }
      if (card.related && card.related.length) {
        meta += '<div class="related"><b>Related</b>' + card.related.map(function (r) {
          return '<a href="#' + esc(r) + '" data-rel="' + esc(r) + '">' + esc(r) + '</a>';
        }).join('') + '</div>';
      }
      meta += '</div>';
    }
    return '<article class="card" id="' + esc(gid) + '" data-topic="' + esc(topic.id) + '">' +
      '<header class="card-head">' +
      '<h4>' + esc(card.title) + '<a class="anchor" href="#' + esc(gid) + '" aria-label="Link to this command">#</a></h4>' +
      '<div class="tags">' + tags + '</div>' +
      '<button class="card-toggle" type="button" aria-expanded="true" aria-label="Collapse card">' + ICON.chev + '</button>' +
      '</header>' +
      '<div class="cmd"><pre><code class="language-bash">' + highlightCommand(card.command) + '</code></pre>' +
      '<button class="copy" type="button" aria-label="Copy command">' + ICON.copy + '<span>Copy</span></button></div>' +
      '<div class="card-body">' +
      '<p class="desc">' + prose(card.description) + '</p>' +
      flags + renderTerminal(topic, card) + note + meta +
      '</div></article>';
  }

  function renderTopic(topic, idx) {
    var subs = topic.subtopics || [];
    var html = '<section class="topic-section" id="' + esc(topic.id) + '" data-topic="' + esc(topic.id) + '">' +
      '<h2><span class="n">' + (idx + 1) + '</span>' + esc(topic.title) +
      '<a class="anchor" href="#' + esc(topic.id) + '" aria-label="Link to this section">#</a>' +
      '<span class="cnt" data-count></span></h2>';
    if (topic.intro) html += '<p class="intro">' + prose(topic.intro) + '</p>';
    subs.forEach(function (s) {
      var sid = topic.id + '-' + s.id;
      var cards = (topic.cards || []).filter(function (c) { return c.subtopic === s.id; });
      html += '<div class="sub-section" id="' + esc(sid) + '"><h3>' + esc(s.title) +
        '<a class="anchor" href="#' + esc(sid) + '" aria-label="Link to this subtopic">#</a></h3>' +
        cards.map(function (c) { return renderCard(topic, c); }).join('') + '</div>';
    });
    var orphans = (topic.cards || []).filter(function (c) { return !subs.some(function (s) { return s.id === c.subtopic; }); });
    if (orphans.length) html += orphans.map(function (c) { return renderCard(topic, c); }).join('');
    return html + '</section>';
  }

  function renderNav() {
    var open = {};
    try { open = JSON.parse(localStorage.getItem(STORAGE.nav) || '{}'); } catch (e) { open = {}; }
    return topics.map(function (t, i) {
      var subs = (t.subtopics || []).map(function (s) {
        return '<li><a href="#' + esc(t.id + '-' + s.id) + '" data-nav="' + esc(t.id + '-' + s.id) + '">' + esc(s.title) + '</a></li>';
      }).join('');
      return '<li class="topic' + (open[t.id] ? ' open' : '') + '" data-topic="' + esc(t.id) + '">' +
        '<div class="row"><a href="#' + esc(t.id) + '" data-nav="' + esc(t.id) + '"><span class="num">' + (i + 1) + '</span> ' + esc(t.title) + '</a>' +
        (subs ? '<button class="caret" type="button" aria-expanded="' + (open[t.id] ? 'true' : 'false') + '" aria-label="Toggle ' + esc(t.title) + ' subtopics">' + ICON.chev + '</button>' : '') +
        '</div>' + (subs ? '<ul class="subs">' + subs + '</ul>' : '') + '</li>';
    }).join('');
  }

  function render() {
    $('#nav-list').innerHTML = renderNav();
    $('#content').innerHTML = topics.map(renderTopic).join('');
    topics.forEach(function (t) {
      (t.cards || []).forEach(function (c) {
        var gid = t.id + '-' + c.id;
        var el = document.getElementById(gid);
        var entry = {
          topic: t, card: c, el: el, gid: gid,
          text: [c.title, c.command, c.description, (c.tags || []).join(' '),
            (c.flags || []).map(function (f) { return f.join(' '); }).join(' '),
            (c.iam || []).join(' '), c.note ? (c.note.text || c.note) : ''].join('\n').toLowerCase()
        };
        cardIndex[gid] = entry;
        allCards.push(entry);
      });
    });
    // Resolve "related" links to titles.
    $$('a[data-rel]').forEach(function (a) {
      var r = cardIndex[a.getAttribute('data-rel')];
      if (r) a.textContent = r.card.title; else a.classList.add('missing');
    });
    updateCounts();
  }

  /* ---------- search ---------- */
  function updateCounts() {
    var visible = 0;
    topics.forEach(function (t) {
      var sec = document.getElementById(t.id);
      var n = $$('.card:not(.hidden-by-search)', sec).length;
      visible += n;
      var cnt = $('[data-count]', sec);
      if (cnt) cnt.textContent = n + (n === 1 ? ' command' : ' commands');
      sec.classList.toggle('hidden-by-search', n === 0);
      $$('.sub-section', sec).forEach(function (ss) {
        ss.classList.toggle('hidden-by-search', $$('.card:not(.hidden-by-search)', ss).length === 0);
      });
      var navItem = $('.sidebar .topic[data-topic="' + t.id + '"]');
      if (navItem) navItem.classList.toggle('hidden-by-search', n === 0);
    });
    var q = $('#search').value.trim();
    $('#search-count').textContent = q ? visible + ' / ' + allCards.length : '';
    $('#no-results').hidden = visible !== 0;
    $('#no-results').textContent = 'No commands match "' + q + '".';
  }

  function applySearch() {
    var q = $('#search').value.trim().toLowerCase();
    var terms = q.split(/\s+/).filter(Boolean);
    allCards.forEach(function (e) {
      var hit = terms.every(function (t) {
        if (t.charAt(0) === '#') return (e.card.tags || []).indexOf(t.slice(1)) !== -1;
        return e.text.indexOf(t) !== -1;
      });
      e.el.classList.toggle('hidden-by-search', !hit);
    });
    updateCounts();
  }

  /* ---------- theme ---------- */
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(STORAGE.theme, t); } catch (e) { /* ignore */ }
    var btn = $('#theme-toggle');
    btn.setAttribute('aria-label', 'Switch to ' + (t === 'dark' ? 'light' : 'dark') + ' theme');
    btn.innerHTML = t === 'dark'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  }

  /* ---------- expand / collapse ---------- */
  function setCollapsed(el, collapsed) {
    el.classList.toggle('collapsed', collapsed);
    var b = $('.card-toggle', el);
    if (b) { b.setAttribute('aria-expanded', String(!collapsed)); b.setAttribute('aria-label', collapsed ? 'Expand card' : 'Collapse card'); }
  }
  function setAll(collapsed) { allCards.forEach(function (e) { setCollapsed(e.el, collapsed); }); }

  /* ---------- PNG screenshots toggle ---------- */
  var pngChecked = {};
  function applyPng(on) {
    $$('.terminal').forEach(function (term) {
      if (!on) { term.classList.remove('has-png'); return; }
      var shot = term.getAttribute('data-shot');
      var img = $('.term-png', term);
      if (pngChecked[shot] === true) { term.classList.add('has-png'); return; }
      if (pngChecked[shot] === false) return;
      img.onload = function () { pngChecked[shot] = true; if ($('#png-toggle').checked) term.classList.add('has-png'); };
      img.onerror = function () { pngChecked[shot] = false; term.classList.remove('has-png'); };
      img.src = 'screenshots/' + shot + '.png';
    });
  }

  /* ---------- scrollspy ---------- */
  function setupScrollspy() {
    var links = {};
    $$('.sidebar a[data-nav]').forEach(function (a) { links[a.getAttribute('data-nav')] = a; });
    var targets = $$('.topic-section, .sub-section');
    var current = null;
    function activate(id) {
      if (id === current) return;
      current = id;
      $$('.sidebar a.active').forEach(function (a) { a.classList.remove('active'); });
      var a = links[id];
      if (!a) return;
      a.classList.add('active');
      var topicLi = a.closest('.topic');
      if (topicLi) {
        var topicLink = $('.row > a', topicLi);
        if (topicLink) topicLink.classList.add('active');
        if (!topicLi.classList.contains('open')) {
          $$('.sidebar .topic.open').forEach(function (li) { if (li !== topicLi) toggleTopic(li, false); });
          toggleTopic(topicLi, true);
        }
        var r = a.getBoundingClientRect(), s = $('#sidebar').getBoundingClientRect();
        if (r.top < s.top + 40 || r.bottom > s.bottom - 40) a.scrollIntoView({ block: 'nearest' });
      }
    }
    function pick() {
      var line = 52 + 90;
      var best = null;
      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        if (t.classList.contains('hidden-by-search')) continue;
        var rect = t.getBoundingClientRect();
        if (rect.top <= line && rect.bottom > line) { best = t; if (t.classList.contains('sub-section')) break; }
        else if (rect.top > line) break;
      }
      if (!best && targets.length) best = targets[0];
      if (best) activate(best.id);
    }
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () { pick(); ticking = false; });
    }, { passive: true });
    pick();
  }

  function toggleTopic(li, open) {
    if (open === undefined) open = !li.classList.contains('open');
    li.classList.toggle('open', open);
    var c = $('.caret', li);
    if (c) c.setAttribute('aria-expanded', String(open));
    try {
      var state = JSON.parse(localStorage.getItem(STORAGE.nav) || '{}');
      state[li.getAttribute('data-topic')] = open;
      localStorage.setItem(STORAGE.nav, JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  /* ---------- clipboard ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1400);
  }
  function copyLegacy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); }
      catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return copyLegacy(text); });
    }
    return copyLegacy(text);
  }

  /* ---------- deep links ---------- */
  function revealHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    if (el.classList.contains('card')) {
      setCollapsed(el, false);
      el.classList.add('flash');
      setTimeout(function () { el.classList.remove('flash'); }, 1600);
    }
    var li = el.closest('.topic-section');
    if (li) {
      var navLi = $('.sidebar .topic[data-topic="' + li.id + '"]');
      if (navLi) toggleTopic(navLi, true);
    }
    el.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  /* ---------- sidebar (mobile) ---------- */
  function setSidebar(open) {
    $('#sidebar').classList.toggle('open', open);
    $('#backdrop').classList.toggle('show', open);
    $('#hamburger').setAttribute('aria-expanded', String(open));
  }

  /* ---------- init ---------- */
  function init() {
    render();

    var theme = 'dark';
    try { theme = localStorage.getItem(STORAGE.theme) === 'light' ? 'light' : 'dark'; } catch (e) { /* ignore */ }
    setTheme(theme);
    $('#theme-toggle').addEventListener('click', function () {
      setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    $('#expand-all').addEventListener('click', function () { setAll(false); });
    $('#collapse-all').addEventListener('click', function () { setAll(true); });

    var pngToggle = $('#png-toggle');
    var pngOn = false;
    try { pngOn = localStorage.getItem(STORAGE.png) === '1'; } catch (e) { /* ignore */ }
    pngToggle.checked = pngOn;
    applyPng(pngOn);
    pngToggle.addEventListener('change', function () {
      try { localStorage.setItem(STORAGE.png, pngToggle.checked ? '1' : '0'); } catch (e) { /* ignore */ }
      applyPng(pngToggle.checked);
    });

    var search = $('#search');
    var debounce;
    search.addEventListener('input', function () { clearTimeout(debounce); debounce = setTimeout(applySearch, 80); });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { search.value = ''; applySearch(); search.blur(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if (e.key === '/' && !typing) { e.preventDefault(); search.focus(); search.select(); }
      else if (e.key === 'Escape') {
        if ($('#sidebar').classList.contains('open')) setSidebar(false);
        else if (search.value) { search.value = ''; applySearch(); }
      }
    });

    document.addEventListener('click', function (e) {
      var t = e.target.closest('button, a');
      if (!t) return;
      if (t.classList.contains('copy')) {
        var cmd = cardIndex[t.closest('.card').id].card.command;
        copyText(cmd).then(function () {
          t.classList.add('done'); t.innerHTML = ICON.check + '<span>Copied</span>'; toast('Copied to clipboard');
          setTimeout(function () { t.classList.remove('done'); t.innerHTML = ICON.copy + '<span>Copy</span>'; }, 1500);
        }, function () { toast('Copy failed — select the text manually'); });
      } else if (t.classList.contains('card-toggle')) {
        var card = t.closest('.card');
        setCollapsed(card, !card.classList.contains('collapsed'));
      } else if (t.classList.contains('caret')) {
        toggleTopic(t.closest('.topic'));
      } else if (t.id === 'hamburger') {
        setSidebar(!$('#sidebar').classList.contains('open'));
      } else if (t.closest('#sidebar') && t.tagName === 'A') {
        if (window.innerWidth <= 900) setSidebar(false);
      }
    });
    $('#backdrop').addEventListener('click', function () { setSidebar(false); });
    // Card title double-click toggles collapse (keyboard users have the button).
    $('#content').addEventListener('dblclick', function (e) {
      var h = e.target.closest('.card-head h4');
      if (h) { var c = h.closest('.card'); setCollapsed(c, !c.classList.contains('collapsed')); }
    });

    window.addEventListener('hashchange', revealHash);
    window.addEventListener('beforeprint', function () { setAll(false); });
    setupScrollspy();
    $('#stats').textContent = allCards.length + ' commands across ' + topics.length + ' topics';
    if (location.hash) setTimeout(revealHash, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
