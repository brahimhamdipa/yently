/* Kids English page app — ONE folder for every school.
   The school comes from its own private link, and its students,
   words and scores live in the database — there is no data.json
   file here. Visitors see the last APPROVED word list. The owner
   logs in with the username + password the admin created for
   their school (that login is what Yently sells); Setup edits
   save as a draft, and the Upload button sends the draft to the
   admin for approval. Approval makes the draft live instantly —
   no file swap, no redeploy wait. Student names are the exception: adding or removing a student goes live at once, up to the school's student limit (3 included + paid extra kids).
   Play is PUBLIC: a child picks their name, picks a game, and
   plays 10 rounds. Scores are saved so the teacher can see each
   student's progress — only each student's BEST score per game is
   kept. A student can have an optional 4-digit PIN (set in Setup);
   a PIN student must enter it before playing, and the verified PIN
   lives in memory only, never in localStorage. The Teacher tab needs the school's shared
   teacher password (one password for everybody, set by the
   admin; schools with none set stay fully open). All credentials
   live in memory only: a reload asks again. */
(function () {
  'use strict';

  function folderBase() {
    var p = location.pathname;
    var last = p.split('/').pop();
    if (last.indexOf('.') !== -1) return p.replace(/\/[^\/]*$/, '/');
    return p.charAt(p.length - 1) === '/' ? p : p + '/';
  }
  var BASE = window.RMS_BASE || folderBase();
  var params = {};
  try {
    location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (m, k, v) {
      params[decodeURIComponent(k)] = decodeURIComponent(v);
    });
  } catch (e) {}
  var SLUG = String(params.s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
  var SLUG_FROM_PATH = false;
  var slugResolved = false;
  if (!SLUG) {
    // Clean link (yently.com/<slug>): the middleware rewrites the
    // page server-side, so location.search is empty in the browser.
    // The shop slug is then the last path segment. Ignore this
    // system's own folder name, so a bare /kids-english visit still
    // shows "not found" by design.
    var segs = location.pathname.split('/').filter(function (s) { return s; });
    var lastSeg = (segs[segs.length - 1] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    if (lastSeg && lastSeg !== 'kids-english') { SLUG = lastSeg; SLUG_FROM_PATH = true; }
  }
  // Clean link (yently.com/<slug>): the name in the link is the CLEAN
  // name, which usually differs from the shop's own slug (e.g.
  // yently.com/testlink opens the Demo POS shop, slug demo-pos).
  // The middleware rewrites the page, but the browser address stays
  // clean, so look the clean name up in clean_links (public read)
  // and use the real shop slug. Only runs when the slug came from
  // the path (no ?s=/?r=/... query). Fails open: any error keeps
  // the path slug, and the shop just shows "not found" as before.
  function resolveSlug() {
    if (!SLUG_FROM_PATH || slugResolved || !SLUG) return Promise.resolve();
    slugResolved = true;
    return fetch(SUPABASE_URL + '/rest/v1/clean_links?slug=eq.' + encodeURIComponent(SLUG) + '&select=shop_slug', {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
    }).then(function (res) { return res.ok ? res.json() : []; }).then(function (rows) {
      if (rows && rows[0] && rows[0].shop_slug) SLUG = String(rows[0].shop_slug).toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    }).catch(function () {});
  }
  var STUDENT_KEY = 'kids-english-student-' + SLUG;

  /* Public by design: the same publishable key the main Yently site ships
     in its own pages. Used only for the database calls below. */
  var SUPABASE_URL = 'https://deykvlxikzwwrygmkdly.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_e2uwGgFB0SvVQS-TZahArQ_mjypz9Vr';

  var data = null; // live school info (visitors)
  var systemOff = false; // Yently Admin kill switch (menu 4 → Systems On/Off): true while this system is switched off
  var shopOff = false; // per-shop switch (menu 4 → Shops On/Off): true while this shop is switched off
  var draft = null; // owner draft (Setup)
  var draftStatus = 'editing';
  /* Direct Upload: when Yently has switched it on for this shop,
     an upload goes live straight away instead of waiting for
     approval. Checked once when Setup opens and cached for the
     session; any failure leaves it off, so the old wording stays. */
  var directUploadOn = false;
  var hasCleanLink = false; // the school already has a clean link — for the Add-ons section (clean_link_exists, fetched in openSetup)
  var chatOn = false; // live chat switched on for this school — for the Add-ons section (shop_chat_enabled, fetched in openSetup)
  var cleanLinkSlug = ''; // the school's live clean-link word, fetched on demand for the "Your live link" line
  var addonsSelected = ''; // the add-on whose details panel is open ('' = none)
  var brandingRemoved = false; // the "Powered by YENTLY.com" banners are off for this school — for the Add-ons section (branding_removed, fetched in openSetup)
  var studentLimit = 3; // students included in the plan (3) + paid extra kids; fetched in openSetup, falls back to 3
  var staffCreds = null; // {u, p} in memory only, never stored
  var teacherPass = null; // teacher password in memory only, never stored
  var teacherUnlocked = false; // true once the teacher password is entered, or when the school has none set
  var currentView = 'play';

  /* ---------- Play state ---------- */
  var player = ''; // picked student name
  var game = ''; // 'spell' | 'pick-word' | 'pick-meaning'
  var questions = []; // words for this game, in round order
  var round = 0; // 0-based round index
  var score = 0;
  var answered = false; // true once the current round has been answered
  var scoreSaved = false;
  var playerPin = ''; // verified PIN for the current student, session only, never stored
  var pinName = ''; // student awaiting PIN entry on the picker
  var delScoreId = null; // teacher scores: score id awaiting an in-page delete confirmation
  var delScoreErr = ''; // teacher scores: delete error to show on the next list render

  try { player = localStorage.getItem(STUDENT_KEY) || ''; } catch (e) {}

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* Speaker button (Nov 2026): tap the 🔊 button to hear a word read
     aloud with the browser's built-in speech (window.speechSynthesis).
     Never auto-plays — only on tap. Cancels any speech already playing
     first; a graceful no-op when speechSynthesis is unavailable. Words
     are passed as-is (Arabic harakat included, never stripped). */
  function speakWord(text, lang) {
    if (!text) return;
    try {
      if (!('speechSynthesis' in window) || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      var target = lang || 'en-US';
      var u = new SpeechSynthesisUtterance(String(text));
      u.lang = target;
      u.rate = 0.9;
      try {
        var prefix = target.split('-')[0].toLowerCase();
        var voices = window.speechSynthesis.getVoices() || [];
        for (var i = 0; i < voices.length; i++) {
          if (voices[i] && voices[i].lang && String(voices[i].lang).toLowerCase().indexOf(prefix) === 0) { u.voice = voices[i]; break; }
        }
      } catch (e) {}
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  function speakBtnHtml(text, lang) {
    return '<button type="button" class="speak-btn" data-speak="' + esc(text) + '"' + (lang ? ' data-speak-lang="' + esc(lang) + '"' : '') + ' aria-label="Hear it" title="Hear it" style="font-size:20px;padding:4px 8px;margin-left:8px;cursor:pointer;background:#fff;border:1px solid #ccc;border-radius:8px;line-height:1;vertical-align:middle">\uD83D\uDD0A</button>';
  }
  function wireSpeakButtons(scope) {
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll('[data-speak]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        speakWord(btn.getAttribute('data-speak'), btn.getAttribute('data-speak-lang') || undefined);
      });
    });
  }
  function rpc(name, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify(body)
    }).then(function (res) {
      /* Some calls (save/upload/record) return no body at all — read text first
         and only parse when there is something to parse, so an empty
         success reply is not mistaken for a failure. */
      return res.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!res.ok) throw new Error((j && j.message) || 'request failed');
        return j;
      });
    });
  }
  /* System kill switch (Admin menu 4 → Systems On/Off): true only
     when list_system_switches has a row for this system with
     visible === false. Any error, missing row, or missing RPC
     means false (On) — the school stays up rather than going
     dark on a lookup failure. */
  /* Per-shop switch (Admin → menu 4 → Shops On/Off): true when this
     shop alone is switched off. Same fail-open shape as
     checkSystemOff — an RPC error or a missing row means On. */
  function checkShopOff() {
    try {
      if (typeof rpc !== 'function' || !SLUG) return Promise.resolve(false);
      return rpc('shop_is_visible', { p_system: 'kids-english', p_slug: SLUG }).then(function (v) {
        return v === false;
      }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  function checkSystemOff() {
    try {
      if (typeof rpc !== 'function') return Promise.resolve(false);
      return rpc('list_system_switches', {}).then(function (rows) {
        try {
          rows = rows || [];
          for (var i = 0; i < rows.length; i++) {
            if (rows[i] && rows[i].system === 'kids-english' && rows[i].visible === false) return true;
          }
        } catch (e) {}
        return false;
      }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }
  function notifyEmail(subject, record) {
    try {
      fetch(SUPABASE_URL + '/functions/v1/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
        body: JSON.stringify({ subject: subject, table: 'kids_english_draft', record: record })
      }).catch(function () {});
    } catch (e) {}
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function words() { return (data && data.words) || []; }
  function students() { return (data && data.students) || []; }

  function show(view) {
    currentView = view;
    stopSetupChats();
    ['play', 'teacher', 'setup'].forEach(function (v) {
      $('view-' + v).hidden = v !== view;
    });
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view);
    });
    if (view === 'play') renderPlay();
    if (view === 'teacher') openTeacher();
    if (view === 'setup') openSetup();
    window.scrollTo(0, 0);
  }

  /* ---------- Staff sign-in (Setup only) ---------- */
  function staffUnlocked() { return !!staffCreds; }
  function renderStaffLogin(el, heading, after) {
    el.innerHTML = '<h2>' + heading + '</h2><div class="card">' +
      '<p class="info">Enter the username and password Yently gave this school.</p>' +
      '<label>Username</label><input id="st-user" type="text" autocomplete="username">' +
      '<label>Password</label><input id="st-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="st-go">Sign in</button></div>' +
      '<div id="st-out" style="margin-top:12px"></div></div>';
    $('st-go').addEventListener('click', function () {
      var out = $('st-out');
      var u = $('st-user').value.trim();
      var p = $('st-pass').value;
      out.innerHTML = '<p class="info">Checking…</p>';
      rpc('check_kids_english_login', { p_slug: SLUG, p_username: u, p_password: p }).then(function (ok) {
        if (ok === true) {
          staffCreds = { u: u, p: p };
          after();
        } else {
          out.innerHTML = '<p class="error">Wrong username or password.</p>';
        }
      }).catch(function () {
        out.innerHTML = '<p class="error">Could not reach the sign-in check. Please try again in a moment.</p>';
      });
    });
  }

  /* ---------- Teacher unlock (scores) ---------- */
  /* Scores are behind the school's shared teacher password — one
     password for everybody, set by the admin. Nothing is stored:
     a reload asks again. Schools with no password set skip this
     entirely (teacherUnlocked starts true for them, see the start
     block). The password is checked on the server by the list RPC,
     not just in the page, so the gate cannot be bypassed. */
  function renderTeacherPrompt(el, after) {
    el.innerHTML = '<h2>Teacher</h2><div class="card">' +
      '<p class="info">Enter the teacher password for this school to see the students\' scores.</p>' +
      '<label>Teacher password</label><input id="tp-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="tp-go">Unlock</button></div>' +
      '<div id="tp-out" style="margin-top:12px"></div></div>';
    $('tp-go').addEventListener('click', function () {
      var out = $('tp-out');
      var p = $('tp-pass').value;
      out.innerHTML = '<p class="info">Checking…</p>';
      rpc('check_kids_english_teacher_pass', { p_slug: SLUG, p_password: p }).then(function (ok) {
        if (ok === true) {
          teacherPass = p;
          teacherUnlocked = true;
          after();
        } else {
          out.innerHTML = '<p class="error">Wrong teacher password.</p>';
        }
      }).catch(function () {
        out.innerHTML = '<p class="error">Could not reach the sign-in check. Please try again in a moment.</p>';
      });
    });
  }
  function needTeacher(el, view) {
    if (teacherUnlocked) return false;
    renderTeacherPrompt(el, function () { show(view); });
    return true;
  }

  /* ---------- Play ---------- */
  var GAME_NAMES = { 'spell': 'Spell it', 'pick-word': 'Pick the word', 'pick-meaning': 'What does it mean?' };
  var PRAISE = ['Great job! 🎉', 'Well done! ⭐', 'You got it! 😄', 'Amazing! 🌟', 'Super! 👏'];
  function praise() { return PRAISE[Math.floor(Math.random() * PRAISE.length)]; }

  function renderPlay() {
    var el = $('view-play');
    if (!data) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (!game) { renderPickPlayer(el); return; }
    if (round >= questions.length) { renderResult(el); return; }
    renderRound(el);
  }
  /* Step 1: who is playing, and which game? */
  function renderPickPlayer(el) {
    var list = students();
    var html = '<h2>Hi! Who is playing? 👋</h2>';
    if (!list.length) {
      html += '<div class="card"><p class="info">No students yet — the teacher adds names in Setup.</p></div>';
    } else {
      html += '<div class="student-grid">';
      list.forEach(function (name) {
        html += '<button class="student-btn' + (player === name ? ' selected' : '') + '" data-student="' + esc(name) + '">' + esc(name) + '</button>';
      });
      html += '</div>';
    }
    /* Sign out: let the next child pick their own name (and enter
       their own PIN). Clears the session PIN too — nothing is
       stored on the device. */
    if (player) {
      html += '<div class="row"><button id="sign-out" class="secondary">Sign out</button></div>';
    }
    /* PIN gate: a student with a PIN set must enter it before
       playing. The prompt is in-page, never a native prompt(). */
    if (pinName) {
      html += '<div class="card"><h2>🔒 Enter your PIN</h2>' +
        '<p class="info">Enter ' + esc(pinName) + '\'s 4-digit PIN:</p>' +
        '<label>PIN</label><input id="pin-input" type="password" inputmode="numeric" maxlength="4" autocomplete="off">' +
        '<div class="row"><button id="pin-ok">OK</button><button id="pin-cancel" class="secondary">Cancel</button></div>' +
        '<div id="pin-out" style="margin-top:12px"></div></div>';
    }
    html += '<h2>Pick a game 🎮</h2><div class="game-grid">' +
      '<button class="game-btn" data-game="spell">✏️ Spell it<br><span>Type the word from its meaning</span></button>' +
      '<button class="game-btn" data-game="pick-word">🔤 Pick the word<br><span>Find the word that matches the meaning</span></button>' +
      '<button class="game-btn" data-game="pick-meaning">💡 What does it mean?<br><span>Find the meaning of the word</span></button>' +
      '</div><div id="play-out" style="margin-top:12px"></div>';
    el.innerHTML = html;
    el.querySelectorAll('[data-student]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-student');
        /* Already verified for this student: no PIN prompt again. */
        if (name === player && playerPin) { renderPlay(); return; }
        /* A student with a PIN set must enter it first. */
        if ((data.pin_students || []).indexOf(name) !== -1) {
          pinName = name;
          renderPlay();
          return;
        }
        player = name;
        playerPin = '';
        pinName = '';
        try { localStorage.setItem(STUDENT_KEY, player); } catch (e) {}
        renderPlay();
      });
    });
    el.querySelectorAll('[data-game]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var out = $('play-out');
        if (!player) {
          out.innerHTML = '<p class="error">Pick your name first, then pick a game. 😊</p>';
          return;
        }
        if (words().length < 4) {
          out.innerHTML = '<p class="error">This school needs at least 4 words before you can play — the teacher adds words in Setup.</p>';
          return;
        }
        startGame(btn.getAttribute('data-game'));
      });
    });
    wirePinBox(el);
    var signOut = $('sign-out');
    if (signOut) signOut.addEventListener('click', function () {
      player = '';
      playerPin = '';
      pinName = '';
      game = null;
      try { localStorage.removeItem(STUDENT_KEY); } catch (e) {}
      renderPlay();
    });
  }
  /* PIN entry box on the picker: digits only, verified against the
     server. The verified PIN lives only in a session variable. */
  function wirePinBox(el) {
    var input = $('pin-input');
    if (!input) return;
    input.addEventListener('input', function () {
      input.value = input.value.replace(/\D/g, '').slice(0, 4);
    });
    $('pin-ok').addEventListener('click', function () {
      var out = $('pin-out');
      var pin = input.value;
      if (!/^\d{4}$/.test(pin)) {
        out.innerHTML = '<p class="error">Enter the 4-digit PIN.</p>';
        return;
      }
      out.innerHTML = '<p class="info">Checking…</p>';
      rpc('check_kids_english_student_pin', { p_slug: SLUG, p_student_name: pinName, p_pin: pin }).then(function (ok) {
        if (ok === true) {
          player = pinName;
          playerPin = pin;
          pinName = '';
          try { localStorage.setItem(STUDENT_KEY, player); } catch (e) {}
          renderPlay();
        } else {
          out.innerHTML = '<p class="error">Wrong PIN. Try again.</p>';
        }
      }).catch(function () {
        out.innerHTML = '<p class="error">Could not reach the PIN check. Please try again in a moment.</p>';
      });
    });
    $('pin-cancel').addEventListener('click', function () { pinName = ''; renderPlay(); });
    input.focus();
  }
  function startGame(g) {
    game = g;
    /* 10 rounds: shuffle the word list and take the first 10 (if
       there are fewer than 10 words, cycle the shuffled list). */
    var pool = shuffle(words());
    questions = [];
    while (questions.length < 10) questions = questions.concat(shuffle(pool));
    questions = questions.slice(0, 10);
    round = 0;
    score = 0;
    answered = false;
    scoreSaved = false;
    renderPlay();
  }
  function roundHeader() {
    return '<p class="round-line">Round ' + (round + 1) + ' of ' + questions.length + ' &nbsp;·&nbsp; ' + esc(player) + ' &nbsp;·&nbsp; ⭐ ' + score + '</p>';
  }
  function nextButtonHtml() {
    return '<div class="row"><button id="next-round">' + (round + 1 >= questions.length ? 'See my score! 🎉' : 'Next ➜') + '</button></div>';
  }
  function wireNext(el) {
    $('next-round').addEventListener('click', function () {
      round++;
      answered = false;
      renderPlay();
    });
  }
  /* Three wrong choices for a multiple-choice round: random other
     words (or meanings), never the right answer, never repeated. */
  function wrongChoices(right, all) {
    var pool = shuffle(all.filter(function (x) { return x !== right; }));
    return pool.slice(0, 3);
  }
  function renderRound(el) {
    var q = questions[round];
    var html = '<h2>' + esc(GAME_NAMES[game]) + '</h2>' + roundHeader();
    if (game === 'spell') {
      html += '<div class="card question-card"><p class="hint-label">What word means this?</p>' +
        '<p class="question-big">💬 ' + esc(q.meaning) + ' ' + speakBtnHtml(q.meaning) + '</p>' +
        '<label>Type the word</label><input id="spell-answer" type="text" autocomplete="off" autocapitalize="off" placeholder="Type here…">' +
        '<div class="row"><button id="spell-check">Check ✅</button></div>' +
        '<div id="round-out" style="margin-top:12px"></div></div>';
      el.innerHTML = html;
      wireSpeakButtons(el);
      var input = $('spell-answer');
      input.focus();
      $('spell-check').addEventListener('click', function () { checkSpell(el); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !answered) checkSpell(el);
      });
      return;
    }
    if (game === 'pick-word') {
      var opts = shuffle([q.word].concat(wrongChoices(q.word, words().map(function (w) { return w.word; }))));
      html += '<div class="card question-card"><p class="hint-label">Which word means this?</p>' +
        '<p class="question-big">💬 ' + esc(q.meaning) + ' ' + speakBtnHtml(q.meaning) + '</p><div class="choice-grid">';
      opts.forEach(function (opt) {
        html += '<button class="choice-btn" data-choice="' + esc(opt) + '">' + esc(opt) + '</button>';
      });
      html += '</div><div id="round-out" style="margin-top:12px"></div></div>';
      el.innerHTML = html;
      wireSpeakButtons(el);
      el.querySelectorAll('[data-choice]').forEach(function (btn) {
        btn.addEventListener('click', function () { answerChoice(el, btn, btn.getAttribute('data-choice') === q.word, q.word); });
      });
      return;
    }
    /* pick-meaning */
    var meanings = shuffle([q.meaning].concat(wrongChoices(q.meaning, words().map(function (w) { return w.meaning; }))));
    html += '<div class="card question-card"><p class="hint-label">What does this word mean?</p>' +
      '<p class="question-big">🔤 ' + esc(q.word) + ' ' + speakBtnHtml(q.word) + '</p><div class="choice-grid">';
    meanings.forEach(function (m) {
      html += '<button class="choice-btn meaning-btn" data-choice="' + esc(m) + '">' + esc(m) + '</button>';
    });
    html += '</div><div id="round-out" style="margin-top:12px"></div></div>';
    el.innerHTML = html;
    wireSpeakButtons(el);
    el.querySelectorAll('[data-choice]').forEach(function (btn) {
      btn.addEventListener('click', function () { answerChoice(el, btn, btn.getAttribute('data-choice') === q.meaning, q.meaning); });
    });
  }
  function checkSpell(el) {
    if (answered) return;
    answered = true;
    var q = questions[round];
    var typed = ($('spell-answer').value || '').trim().toLowerCase();
    var right = String(q.word || '').trim().toLowerCase();
    var out = $('round-out');
    if (typed && typed === right) {
      score++;
      var rl = el.querySelector('.round-line');
      if (rl) rl.innerHTML = 'Round ' + (round + 1) + ' of ' + questions.length + ' &nbsp;·&nbsp; ' + esc(player) + ' &nbsp;·&nbsp; ⭐ ' + score;
      out.innerHTML = '<p class="good">' + praise() + ' "' + esc(q.word) + '" is right! ' + speakBtnHtml(q.word) + ' ⭐</p>' + nextButtonHtml();
    } else {
      out.innerHTML = '<p class="try-again">Good try! The word is <strong>' + esc(q.word) + '</strong>. ' + speakBtnHtml(q.word) + ' You will get the next one! 💪</p>' + nextButtonHtml();
    }
    var checkBtn = $('spell-check');
    if (checkBtn) checkBtn.disabled = true;
    var input = $('spell-answer');
    if (input) input.disabled = true;
    wireSpeakButtons(out);
    wireNext(el);
  }
  function answerChoice(el, btn, correct, rightText) {
    if (answered) return;
    answered = true;
    var out = $('round-out');
    el.querySelectorAll('[data-choice]').forEach(function (b) { b.disabled = true; });
    if (correct) {
      score++;
      var rl = el.querySelector('.round-line');
      if (rl) rl.innerHTML = 'Round ' + (round + 1) + ' of ' + questions.length + ' &nbsp;·&nbsp; ' + esc(player) + ' &nbsp;·&nbsp; ⭐ ' + score;
      btn.classList.add('correct');
      out.innerHTML = '<p class="good">' + praise() + ' ' + speakBtnHtml(rightText) + '</p>' + nextButtonHtml();
    } else {
      btn.classList.add('wrong');
      out.innerHTML = '<p class="try-again">Good try! The right answer is <strong>' + esc(rightText) + '</strong>. ' + speakBtnHtml(rightText) + ' You will get the next one! 💪</p>' + nextButtonHtml();
    }
    wireSpeakButtons(out);
    wireNext(el);
  }
  function renderResult(el) {
    var total = questions.length;
    var msg = score === total ? 'Perfect! You are a star! 🌟🎉'
      : score >= 7 ? 'Great work! You are learning so fast! 😄'
      : score >= 4 ? 'Good job! Keep practising! 💪'
      : 'Good try! Play again and you will do even better! 🌱';
    el.innerHTML = '<h2>Your score 🎉</h2><div class="card score-card">' +
      '<p class="score-big">' + score + ' / ' + total + '</p>' +
      '<p class="score-msg">' + msg + '</p>' +
      '<p class="info">' + esc(player) + ' · ' + esc(GAME_NAMES[game]) + '</p>' +
      '<div id="save-out"></div>' +
      '<div class="row"><button id="play-again">Play again 🔁</button>' +
      '<button id="change-game" class="secondary">Pick another game</button></div></div>';
    $('play-again').addEventListener('click', function () { startGame(game); });
    $('change-game').addEventListener('click', function () { game = ''; renderPlay(); });
    if (!scoreSaved) {
      scoreSaved = true;
      rpc('record_kids_english_score', { p_slug: SLUG, p_student_name: player, p_game: game, p_level: '', p_score: score, p_total: total, p_pin: playerPin || '' }).catch(function () {
        var out = $('save-out');
        if (out) out.innerHTML = '<p class="info">Your score could not be saved this time — it will still show here.</p>';
      });
    }
  }

  /* ---------- Teacher (scores) ---------- */
  function openTeacher() {
    if (needTeacher($('view-teacher'), 'teacher')) return;
    var el = $('view-teacher');
    el.innerHTML = '<h2>Teacher — Scores</h2><div class="card"><p class="info">Loading scores…</p></div>';
    rpc('list_kids_english_scores', { p_slug: SLUG, p_epass: teacherPass }).then(function (rows) {
      var list = rows || [];
      var html = '<h2>Teacher — Scores</h2>';
      if (delScoreErr) {
        html += '<div class="card"><p class="error">Could not delete score: ' + esc(delScoreErr) + '</p></div>';
        delScoreErr = '';
      }
      if (!list.length) {
        html += '<div class="card"><p class="info">No scores yet. Scores appear here once a student finishes a game.</p></div>';
      } else {
        html += '<div class="card"><table class="scores-table"><thead><tr><th>Student</th><th>Game</th><th>Score</th><th>Date</th><th></th></tr></thead><tbody>';
        list.forEach(function (r) {
          var when = r.created_at ? new Date(r.created_at).toLocaleString() : '';
          var delHtml;
          if (delScoreId === r.id) {
            delHtml = '<span>Delete this score?</span> <button class="danger small" data-score-del-yes="' + r.id + '">Yes</button> <button class="secondary small" data-score-del-no>Keep</button>';
          } else {
            delHtml = '<button class="small danger" data-score-del="' + r.id + '">Delete</button>';
          }
          html += '<tr><td>' + esc(r.student_name) + '</td><td>' + esc(GAME_NAMES[r.game] || r.game) + '</td><td><strong>' + esc(r.score) + ' / ' + esc(r.total) + '</strong></td><td>' + esc(when) + '</td><td>' + delHtml + '</td></tr>';
        });
        html += '</tbody></table></div>';
      }
      el.innerHTML = html;
      /* Delete a score: in-page tap-again confirm, same pattern as
         the student delete in Setup. Never a native confirm(). */
      el.querySelectorAll('[data-score-del]').forEach(function (b) {
        b.addEventListener('click', function () { delScoreId = Number(b.getAttribute('data-score-del')); openTeacher(); });
      });
      el.querySelectorAll('[data-score-del-no]').forEach(function (b) {
        b.addEventListener('click', function () { delScoreId = null; openTeacher(); });
      });
      el.querySelectorAll('[data-score-del-yes]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = Number(b.getAttribute('data-score-del-yes'));
          rpc('delete_kids_english_score', { p_slug: SLUG, p_epass: teacherPass, p_score_id: id }).then(function () {
            delScoreId = null;
            openTeacher();
          }).catch(function (err) {
            delScoreId = null;
            delScoreErr = err.message || 'request failed';
            openTeacher();
          });
        });
      });
    }).catch(function (err) {
      el.innerHTML = '<h2>Teacher — Scores</h2><div class="card"><p class="error">Could not load scores: ' + esc(err.message) + '</p></div>';
    });
  }

  /* ---------- Setup (login only: draft + Upload for approval) ---------- */
  /* Per-shop live chat: stop the owner inbox poll when Setup is
     left or another add-on's panel is picked. No-op when chats were
     never opened. The inbox lives inside the Add-ons section's Live
     Chat details panel — there is no separate Chats section in
     Setup any more. */
  function stopSetupChats() {
    var box = $('setup-addons-chat-inbox');
    if (box && box._shopChatStop) { try { box._shopChatStop(); box._shopChatStop = null; } catch (e) {} }
  }

  /* ---------- Setup Add-ons section ---------- */
  /* One section for every add-on this school can take — Clean
     Link, Live Chat, Direct Upload, Extra Students — replacing the
     old one-line-per-add-on Setup lines and the standalone Chats
     card. The ☰ button opens the add-on list; picking one shows
     its details (what it does, what it costs, its action) below.
     The "Your add-ons" list shows each add-on's state. Add actions
     open the cart with the add-on line for this school — free for
     the rest of this month, charged from the next payment. No draft
     fields: the section only reads switches and writes cart lines.
     Live Chat is in the list because the chat inbox lives here now:
     the conversations + reply box mount inside the Live Chat
     details panel when chat is ON — when OFF there is no chat UI
     in Setup at all. Extra Students counts as active when the
     school has paid extra places (studentLimit above 3). */
  var ADDONS_SYSTEM = 'kids-english';
  /* "Powered by YENTLY.com" banners: a thin navy strip under the main menu and a small navy strip at the bottom
     of the page, with the Yently logo, linking to yently.com. It is
     on by default. It hides only when the customer ordered the
     Remove Branding add-on ($5/month, first month free) and Yently
     switched it on for this school (branding_removed). The banners are
     the default: if the check errors or answers nothing, the
     banners stay — a failed check never takes the branding off. */
  var YENTLY_BADGE_HTML = '<div id="yently-badge" style="margin-top:10px;background:#161d44;border-radius:8px;padding:8px 12px;text-align:center;"><a href="https://yently.com" target="_blank" rel="noopener" style="color:#fff;text-decoration:none;display:inline-flex;align-items:center;gap:8px;font-size:13px;"><img src="/logo.webp" alt="Yently" style="height:20px;width:auto;border-radius:4px;">Powered by YENTLY.com</a></div>';
  var YENTLY_BADGE_TOP_HTML = '<div id="yently-badge-top" style="background:#161d44;padding:4px 12px;text-align:center;margin-bottom:0;"><a href="https://yently.com" target="_blank" rel="noopener" style="color:#fff;text-decoration:none;display:inline-flex;align-items:center;gap:6px;font-size:12px;"><img src="/logo.webp" alt="Yently" style="height:16px;width:auto;border-radius:3px;">Powered by YENTLY.com</a></div>';
  function hideYentlyBadgeIfRemoved() {
    if (!SLUG) return;
    rpc('branding_removed', { p_owner_type: ADDONS_SYSTEM, p_owner_key: SLUG }).then(function (removed) {
      if (removed) { var b = $('yently-badge'); if (b) b.style.display = 'none'; var t = $('yently-badge-top'); if (t) t.style.display = 'none'; var h = document.getElementById('site-header'); if (h) h.style.paddingBottom = '16px'; }
    }).catch(function () { /* banner stays */ });
  }

  /* Thin "Powered by YENTLY.com" banner under the main menu (#tabs):
     same navy strip as the bottom badge, thinner. It sits outside
     <main>, so view switches never wipe it, and it is inserted once
     (the guard) even when setHeader runs again. It hides with the
     bottom badge when Remove Branding is on (hideYentlyBadgeIfRemoved). */
  function showYentlyBadgeTop() {
    if ($('yently-badge-top')) return;
    var tabs = $('tabs');
    if (!tabs) return;
    tabs.insertAdjacentHTML('afterend', YENTLY_BADGE_TOP_HTML);
  }
  function addonsExtraCount() { return Math.max(0, studentLimit - 3); }
  function addonsExtraText() {
    var extra = addonsExtraCount();
    return 'You have ' + draft.students.length + ' of ' + studentLimit + ' student places' + (extra > 0 ? ' — ' + extra + ' extra place' + (extra > 1 ? 's' : '') + ' paid' : ' — 3 included in your plan');
  }
  function addonsActiveRows() {
    var extra = addonsExtraCount();
    return '<li>Clean Link — <b>' + (hasCleanLink ? 'Active' : 'Not added') + '</b>' + addonRowLink('clean', hasCleanLink) + '</li>' +
      '<li>Live Chat — <b>' + (chatOn ? 'Active' : 'Not added') + '</b>' + addonRowLink('chat', chatOn) + '</li>' +
      '<li>Direct Upload — <b>' + (directUploadOn ? 'Active' : 'Not added') + '</b>' + addonRowLink('direct', directUploadOn) + '</li>' +
      '<li id="setup-addons-active-extra">Extra Students — <b>' + (extra > 0 ? 'Active (' + extra + ' extra place' + (extra > 1 ? 's' : '') + ')' : 'Not added') + '</b>' + addonRowLink('extra', extra > 0) + '</li>' +
      '<li>Remove Branding — <b>' + (brandingRemoved ? 'Active' : 'Not added') + '</b>' + addonRowLink('branding', brandingRemoved) + '</li>';
  }
  /* Action link for an ACTIVE add-on in the "Your add-ons" list:
     the customer should reach what they paid for from the list
     itself, not only from the details panel. Clean Link is the
     live URL itself; Live Chat opens the inbox panel; the rest
     open their details panel (they have no destination page).
     Not-added rows get no link. */
  function addonRowLink(key, active) {
    if (!active) return '';
    if (key === 'clean') {
      return cleanLinkSlug
        ? ' · <a href="/' + esc(cleanLinkSlug) + '">yently.com/' + esc(cleanLinkSlug) + '</a>'
        : ' · <a href="#" data-addon-link="clean">Details</a>';
    }
    if (key === 'chat') return ' · <a href="#" data-addon-link="chat">Open Chats</a>';
    if (key === 'direct') return ' · <a href="#" data-addon-link="direct">Details</a>';
    if (key === 'extra') return ' · <a href="#" data-addon-link="extra">Details</a>';
    if (key === 'branding') return ' · <a href="#" data-addon-link="branding">Details</a>';
    return '';
  }
  /* Wire the "Your add-ons" row links after every list render
     (the list is innerHTML, so the handlers must be re-attached
     each time). Row links also hide the dropdown menu, like the
     dropdown picks do. */
  function wireAddonRowLinks() {
    var list = $('setup-addons-active-list');
    if (!list) return;
    var links = list.querySelectorAll('[data-addon-link]');
    links.forEach(function (a) {
      a.onclick = function (e) {
        if (e) e.preventDefault();
        var menu = $('setup-addons-menu');
        if (menu) menu.style.display = 'none';
        renderAddonDetails(a.getAttribute('data-addon-link'));
      };
    });
  }
  function updateAddonsExtra() {
    var row = $('setup-addons-active-extra');
    if (row) {
      var extra = addonsExtraCount();
      row.innerHTML = 'Extra Students — <b>' + (extra > 0 ? 'Active (' + extra + ' extra place' + (extra > 1 ? 's' : '') + ')' : 'Not added') + '</b>' + addonRowLink('extra', extra > 0);
      wireAddonRowLinks();
    }
    if (addonsSelected === 'extra') {
      var line = $('setup-addons-detail-extra');
      if (line) line.textContent = addonsExtraText();
    }
  }
  function renderAddonDetails(key) {
    stopSetupChats(); // a chat inbox from another pick must stop polling first
    var box = $('setup-addons-details');
    if (!box) return;
    addonsSelected = key;
    var add = function (plan, label) {
      return '<a href="/?add=' + plan + '&shop=' + ADDONS_SYSTEM + '&slug=' + encodeURIComponent(SLUG) + '&addon=1">Add ' + label + '</a>';
    };
    var html = '';
    if (key === 'clean') {
      html = '<h4 style="margin:0 0 6px;">Clean Link — $5/month</h4>' +
        '<p class="info">A short, easy address for this page — yently.com/[name] — instead of the long system link.</p>';
      if (hasCleanLink) {
        html += cleanLinkSlug
          ? '<p class="info">Your live link: <a href="/' + esc(cleanLinkSlug) + '">yently.com/' + esc(cleanLinkSlug) + '</a> — it stays live while the plan is active.</p>'
          : '<p class="info">You already have a clean link for this page — it stays live while the plan is active.</p>';
      } else {
        html += '<p class="info"><select id="setup-addons-clean-type"><option value="clean:website">Clean Link — $5/month</option><option value="clean:golden" disabled>Golden Link — $10/month (Available soon)</option><option value="clean:domain" disabled>Your Own Domain — $20/month (Available soon)</option></select> <button type="button" id="setup-addons-clean-add" class="secondary">Add</button> — free for the rest of this month. <a href="#" id="setup-addons-clean-help" style="color:#2563eb">What is a clean link?</a></p>';
      }
    } else if (key === 'chat') {
      html = '<h4 style="margin:0 0 6px;">Live Chat — $3/month</h4>' +
        '<p class="info">A chat bubble on your school page — visitors tap it and message you, and every message reaches you by email.</p>';
      if (chatOn) {
        html += '<p class="info"><b>Live chat is on for this school</b> — visitors see the chat bubble. Answer them here:</p><div id="setup-addons-chat-inbox"></div>';
      } else {
        html += '<p class="info">' + add('chat:website', 'Live Chat') + ' — $3/month, first month free, free for the rest of this month.</p>';
      }
    } else if (key === 'direct') {
      html = '<h4 style="margin:0 0 6px;">Direct Upload — $5/month</h4>' +
        '<p class="info">Your uploads go live the moment you send them — no waiting for approval.</p>';
      if (directUploadOn) {
        html += '<p class="info"><b>Direct Upload is on for this school</b> — your uploads go live right away.</p>';
      } else {
        html += '<p class="info">' + add('direct:website', 'Direct Upload') + ' — $5/month, first month free, free for the rest of this month.</p>';
      }
    } else if (key === 'extra') {
      html = '<h4 style="margin:0 0 6px;">Extra Students — $1/month each</h4>' +
        '<p class="info" id="setup-addons-detail-extra">' + esc(addonsExtraText()) + '</p>' +
        '<p class="info"><a href="/?add=kids-extra-english&slug=' + encodeURIComponent(SLUG) + '">Add extra students</a> for $1/month each — free for the rest of this month.</p>';
    } else if (key === 'branding') {
      html = '<h4 style="margin:0 0 6px;">Remove Branding — $5/month</h4>' +
        '<p class="info">Take the "Powered by YENTLY.com" banners off your school page — the one under your menu and the one at the bottom — visitors see only your school page, nothing about Yently.</p>';
      if (brandingRemoved) {
        html += '<p class="info"><b>The Yently banners are off for this school page.</b></p>';
      } else {
        html += '<p class="info">' + add('branding:website', 'Remove Branding') + ' — $5/month, first month free, free for the rest of this month.</p>';
      }
    }
    box.innerHTML = html;
    /* Wire the buttons inside the panel just rendered. */
    if (key === 'clean' && !hasCleanLink) {
      var cleanAdd = $('setup-addons-clean-add');
      if (cleanAdd) cleanAdd.onclick = function () { var t = $('setup-addons-clean-type'); window.location.href = '/?add=' + encodeURIComponent(t ? t.value : 'clean:website') + '&shop=kids-english&slug=' + encodeURIComponent(SLUG) + '&addon=1'; };
      var cleanHelp = $('setup-addons-clean-help');
      if (cleanHelp) cleanHelp.onclick = function (e) { if (e) e.preventDefault(); openCleanLinkHelp(); };
    }
    if (key === 'chat' && chatOn) {
      var inbox = $('setup-addons-chat-inbox');
      if (inbox) {
        if (window.ShopChat) {
          window.ShopChat.mountInbox(inbox, { ownerType: 'kids-english', ownerKey: SLUG, creds: { u: staffCreds.u, p: staffCreds.p } });
        } else {
          inbox.innerHTML = '<p class="error">Chat is not available right now. Please reload the page and try again.</p>';
        }
      }
    }
  }
  function renderAddonsSection() {
    addonsSelected = ''; // a fresh Setup render starts with no panel open
    var list = $('setup-addons-active-list');
    if (list) list.innerHTML = addonsActiveRows();
    wireAddonRowLinks();
    var btn = $('setup-addons-menu-btn');
    var menu = $('setup-addons-menu');
    if (btn && menu) {
      btn.onclick = function () {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
      };
    }
    var picks = document.querySelectorAll('[data-addon-pick]');
    picks.forEach(function (b) {
      b.onclick = function () {
        if (menu) menu.style.display = 'none';
        renderAddonDetails(b.getAttribute('data-addon-pick'));
      };
    });
    /* Fetch the clean-link word for the "Your live link" line.
       Only when the school already has one — and only once per
       Setup visit. If the Clean Link panel is open when the answer
       lands, it re-renders so the link appears. */
    if (hasCleanLink && !cleanLinkSlug) {
      fetch(SUPABASE_URL + '/rest/v1/clean_links?system=eq.kids-english&shop_slug=eq.' + encodeURIComponent(SLUG) + '&select=slug', {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
      }).then(function (res) { return res.ok ? res.json() : []; }).then(function (rows) {
        if (rows && rows[0] && rows[0].slug) {
          cleanLinkSlug = String(rows[0].slug);
          /* The slug just landed: re-render the "Your add-ons"
             list so the Clean Link row shows the live URL, then
             re-wire its links. */
          var l2 = $('setup-addons-active-list');
          if (l2) { l2.innerHTML = addonsActiveRows(); wireAddonRowLinks(); }
          if (addonsSelected === 'clean') renderAddonDetails('clean');
        }
      }).catch(function () {});
    }
  }
  /* Clean Link help: "What is a clean link?" opens a small popup
     explaining the four link types. Built with inline styles so it
     works in every folder app without a stylesheet change. */
  function openCleanLinkHelp() {
    if ($('clean-link-help-pop')) return;
    var pop = document.createElement('div');
    pop.id = 'clean-link-help-pop';
    pop.setAttribute('style', 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;');
    pop.innerHTML =
      '<div style="background:#fff;color:#111827;border-radius:12px;max-width:420px;width:100%;padding:20px;box-shadow:0 8px 30px rgba(0,0,0,0.25);">' +
      '<h3 style="margin:0 0 8px;font-size:18px;">What is a clean link?</h3>' +
      '<p style="margin:0 0 10px;">A clean link is a short, easy address for this page, instead of the long system link. Your link stays live while the plan is active. You can cancel anytime.</p>' +
      '<p style="margin:0 0 6px;"><b>Free Link — $0:</b> the standard system link, included with your system.</p>' +
      '<p style="margin:0 0 6px;"><b>Clean Link — $5/month:</b> yently.com/[name] — your own short address.</p>' +
      '<p style="margin:0 0 6px;"><b>Golden Link — $10/month:</b> [name].yently.com — coming soon.</p>' +
      '<p style="margin:0 0 12px;"><b>Your Own Domain — $20/month:</b> use your own domain name — coming soon.</p>' +
      '<button type="button" id="clean-link-help-close" class="secondary">Close</button>' +
      '</div>';
    pop.onclick = function (ev) { if (ev.target === pop) document.body.removeChild(pop); };
    document.body.appendChild(pop);
    var closeBtn = $('clean-link-help-close');
    if (closeBtn) closeBtn.onclick = function () { document.body.removeChild(pop); };
  }

  function openSetup() {
    if (!staffUnlocked()) {
      renderStaffLogin($('view-setup'), 'Setup sign-in', function () { openSetup(); });
      return;
    }
    var el = $('view-setup');
    el.innerHTML = '<h2>Setup</h2><div class="card"><p class="info">Loading your draft…</p></div>';
    rpc('get_kids_english_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p }).then(function (res) {
      draft = res.data || {};
      draft.students = draft.students || [];
      draft.student_pins = draft.student_pins || {};
      draft.words = draft.words || [];
      draftStatus = res.status || 'editing';
      /* Student limit: 3 included + paid extra kids. Fetched fresh
         each time Setup opens; falls back to 3 if unavailable. */
      return rpc('kids_english_student_limit', { p_slug: SLUG }).then(function (limit) {
        if (typeof limit === 'number' && isFinite(limit) && limit >= 3) studentLimit = limit;
      }).catch(function () {});
    }).then(function () {
      /* Direct Upload switch: see the note by directUploadOn. */
      return rpc('direct_upload_enabled', { p_owner_type: 'kids-english', p_owner_key: SLUG }).then(function (on) {
        directUploadOn = (on === true);
      }).catch(function () { directUploadOn = false; });
    }).then(function () {
      /* Clean Link: whether the school already has one
         (clean_link_exists, public RPC). */
      return rpc('clean_link_exists', { p_system: 'kids-english', p_slug: SLUG }).then(function (has) {
        hasCleanLink = (has === true);
      }).catch(function () { hasCleanLink = false; });
    }).then(function () {
      /* Live Chat switch: see the note by chatOn. */
      return rpc('shop_chat_enabled', { p_owner_type: 'kids-english', p_owner_key: SLUG }).then(function (on) {
        chatOn = (on === true);
      }).catch(function () { chatOn = false; });
    }).then(function () {
      /* Remove Branding switch: whether Yently switched the
         "Powered by YENTLY.com" banners off for this school
         (branding_removed, public RPC) — for the Add-ons
         section's Remove Branding panel and active list. */
      return rpc('branding_removed', { p_owner_type: 'kids-english', p_owner_key: SLUG }).then(function (on) {
        brandingRemoved = (on === true);
      }).catch(function () { brandingRemoved = false; });
    }).then(function () {
      renderSetup();
    }).catch(function () {
      el.innerHTML = '<h2>Setup</h2><div class="card"><p class="error">Could not load your draft. Please try again in a moment.</p></div>';
    });
  }
  function statusLine() {
    if (draftStatus === 'pending') return 'Your changes were sent to Yently and are waiting for approval. Children still see the approved words.';
    if (draftStatus === 'approved') return 'Your last upload was approved and is now live.';
    if (directUploadOn) return 'Direct Upload is on for this school — your changes go live the moment you upload them. Children still see the approved words.';
    return 'Your changes are saved as a draft. Children still see the approved words until you upload and Yently approves.';
  }
  function renderSetup() {
    var el = $('view-setup');
    function field(label, id, value, type) {
      return '<label>' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(value == null ? '' : value) + '">';
    }
    var html = (systemOff ? '<div class="error">This system is currently switched off in Yently Admin — visitors see it as unavailable. Your data is still here.</div>' : shopOff ? '<div class="error">This shop is currently switched off in Yently Admin — visitors see it as unavailable. Your data is still here.</div>' : '') + '<h2>Setup</h2>' +
      '<div class="note">' + esc(statusLine()) + '</div>' +
      '<div class="card">' +
      field('School name', 'setup-name', draft.name) +
      field('About text', 'setup-about', draft.about) +
      '</div><h2>Students</h2><p class="info" id="setup-student-count"></p><div id="setup-students"></div>' +
      '<p class="info">To change a student\'s name, click Remove next to that student, then add a new student with the right name.</p>' +
      '<div class="row"><input id="setup-new-student" type="text" placeholder="New student name…" style="flex:1;margin:0">' +
      '<button id="setup-add-student" class="secondary">+ Add student</button></div>' +
      '<div id="setup-student-out" style="margin-top:8px"></div>' +
      '<div class="card" id="setup-addons">' +
      '<h3>Add-ons</h3>' +
      '<p class="info">Add-ons add more to your school page — a short link, live chat, uploads that go live right away, or places for more students, or a school page without the Yently banner. Pick one below to see what it does and what it costs. Add-ons join the payment you already have — free for the rest of this month, charged from your next payment.</p>' +
      '<div class="row"><button type="button" id="setup-addons-menu-btn" class="secondary" aria-label="Add-ons menu">☰ Add-ons</button></div>' +
      '<div id="setup-addons-menu" style="display:none;margin-top:8px;">' +
      '<button type="button" class="secondary" data-addon-pick="clean" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Clean Link — $5/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="chat" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Live Chat — $3/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="direct" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Direct Upload — $5/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="extra" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Extra Students — $1/month each</button>' +
      '<button type="button" class="secondary" data-addon-pick="branding" style="display:block;width:100%;text-align:left;">Remove Branding — $5/month</button>' +
      '</div>' +
      '<div id="setup-addons-details" style="margin-top:12px;"></div>' +
      '<div style="margin-top:12px;"><h4 style="margin:0 0 6px;">Your add-ons</h4><ul id="setup-addons-active-list" style="margin:0;padding-left:18px;"></ul></div>' +
      '</div>' +
      '<h2>Words</h2><p class="info">Each word has a meaning or hint the children see while they play.</p><div id="setup-words"></div>' +
      '<button id="setup-add-word" class="secondary">+ Add word</button>' +
      '<div class="row" style="margin-top:16px"><button id="setup-save" class="secondary">Save draft</button>' +
      '<button id="setup-upload">' + (directUploadOn ? 'Upload — goes live right away' : 'Upload for approval') + '</button></div>' +
      '<div id="setup-out" style="margin-top:12px"></div>';
    el.innerHTML = html;
    /* Yently content library: ready-to-use levels for this subject.
       Mounts only here in Setup, never in public play. The library
       adds items to the school's own list — nothing is removed. */
    if (window.KidsLibrary) {
      var libBox = document.createElement('div');
      libBox.id = 'setup-library';
      var saveRow = $('setup-save') && $('setup-save').parentNode;
      if (saveRow && saveRow.parentNode) saveRow.parentNode.insertBefore(libBox, saveRow);
      else el.appendChild(libBox);
      window.KidsLibrary.mount({ subject: 'english', slug: SLUG, creds: staffCreds, container: libBox, onAdded: function () { openSetup(); } });
    }
    /* Add-ons section: the ☰ menu, the details panel and the
       active list (see renderAddonsSection). Replaces the old
       one-line-per-add-on Setup lines and the Chats card — the
       chat inbox now lives inside the Live Chat details panel. */
    renderAddonsSection();

    var studentsEl = $('setup-students');
    /* Students go live at once — no draft, no approval. The RPC
       writes the new list into BOTH live_data and draft_data, so a
       later draft save/upload (collectDraft reads draft.students)
       can never revert it. PINs are untouched by the RPC and still
       flow through the draft. On success both in-memory copies are
       refreshed from the saved list. */
    function saveStudentsLive(next, out, done) {
      if (out) out.innerHTML = '<p class="info">Saving…</p>';
      rpc('set_kids_english_students', { p_slug: SLUG, p_u: staffCreds.u, p_p: staffCreds.p, p_students: next }).then(function (ok) {
        if (ok !== true) throw new Error('not saved');
        draft.students = next.slice();
        if (data) data.students = next.slice();
        if (out) out.innerHTML = '';
        drawStudents();
        if (done) done();
      }).catch(function (err) {
        if (out) out.innerHTML = '<p class="error">Could not save students: ' + esc(err.message || 'request failed') + '</p>';
      });
    }
    /* PINs go live at once — no draft, no approval. The RPC writes
       the pruned PIN map into BOTH live_data and draft_data, so a
       later draft save/upload (collectDraft includes pins) can never
       revert it. Called on the PIN box's change event (blur/Enter),
       never on every keystroke. Removing a PIN = blanking the box:
       the input handler already deleted the key from
       draft.student_pins, so the RPC writes the map without it. */
    function savePinsLive() {
      var out = $('setup-student-out');
      var pins = {};
      Object.keys(draft.student_pins || {}).forEach(function (nm) {
        if (draft.students.indexOf(nm) !== -1 && /^\d{4}$/.test(draft.student_pins[nm])) pins[nm] = draft.student_pins[nm];
      });
      if (out) out.innerHTML = '<p class="info">Saving PIN…</p>';
      rpc('set_kids_english_student_pins', { p_slug: SLUG, p_u: staffCreds.u, p_p: staffCreds.p, p_pins: pins }).then(function (ok) {
        if (ok !== true) throw new Error('not saved');
        draft.student_pins = pins;
        if (data) data.pin_students = Object.keys(pins);
        if (out) out.innerHTML = '<p class="info">PIN saved — live right away ✓</p>';
      }).catch(function (err) {
        if (out) out.innerHTML = '<p class="error">Could not save PIN: ' + esc(err.message || 'request failed') + '</p>';
      });
    }
    function drawStudents() {
      /* Student limit: show "Students: X of Y" and disable Add at
         the limit — extra students are on the Extra Students page. */
      var countEl = $('setup-student-count');
      if (countEl) {
        countEl.textContent = draft.students.length >= studentLimit
          ? 'Students: ' + draft.students.length + ' of ' + studentLimit + ' — at your limit.'
          : 'Students: ' + draft.students.length + ' of ' + studentLimit + ' — changes go live right away, no approval needed.';
      }
      /* Extra Students count: the Add-ons section shows it — refresh
         its active-list row and its details panel (when open) so the
         numbers stay right as students are added or removed. */
      updateAddonsExtra();
      var addBtn = $('setup-add-student');
      if (addBtn) addBtn.disabled = draft.students.length >= studentLimit;
      var newStudentInput = $('setup-new-student');
      if (newStudentInput) newStudentInput.disabled = draft.students.length >= studentLimit;
      studentsEl.innerHTML = '';
      if (!draft.students.length) {
        studentsEl.innerHTML = '<div class="card"><p class="info">No students yet — add names above.</p></div>';
        return;
      }
      draft.students.forEach(function (name, i) {
        var row = document.createElement('div');
        row.className = 'card student-row';
        row.innerHTML = '<strong>' + esc(name) + '</strong>' +
          '<input type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="PIN — optional" data-student-pin="' + i + '" value="' + esc((draft.student_pins[name]) || '') + '">' +
          '<span style="flex:1"></span>' +
          '<button class="small danger" data-remove-student="' + i + '">Remove</button>';
        row.querySelector('[data-student-pin]').addEventListener('input', function () {
          var v = this.value.replace(/\D/g, '').slice(0, 4);
          this.value = v;
          if (v) draft.student_pins[name] = v; else delete draft.student_pins[name];
        });
        row.querySelector('[data-student-pin]').addEventListener('change', savePinsLive);
        row.querySelector('[data-remove-student]').addEventListener('click', function () {
          var next = draft.students.slice();
          next.splice(i, 1);
          /* Removing a student also goes live at once via the RPC. */
          saveStudentsLive(next, $('setup-student-out'), function () {
            delete draft.student_pins[name];
            var out = $('setup-student-out');
            if (out) out.innerHTML = '<p class="info">Student removed — live right away. ✅</p>';
          });
        });
        studentsEl.appendChild(row);
      });
    }
    drawStudents();
    $('setup-add-student').addEventListener('click', function () {
      var input = $('setup-new-student');
      var out = $('setup-student-out');
      var name = input.value.trim();
      if (!name) { out.innerHTML = '<p class="error">Type a name first.</p>'; return; }
      if (draft.students.indexOf(name) !== -1) { out.innerHTML = '<p class="error">That name is already on the list.</p>'; return; }
      if (draft.students.length >= studentLimit) { out.innerHTML = '<p class="error">You are at your limit of ' + studentLimit + ' students. <a href="/?add=kids-extra-english&slug=' + encodeURIComponent(SLUG) + '">Add extra students</a> for $1/month each — free for the rest of this month.</p>'; return; }
      /* Adding a student goes live at once via the RPC — no draft,
         no approval. */
      saveStudentsLive(draft.students.concat([name]), out, function () {
        input.value = '';
        out.innerHTML = '<p class="info">Student added — live right away. ✅</p>';
      });
    });

    var wordsEl = $('setup-words');
    function wordRow(item, i) {
      var row = document.createElement('div');
      row.className = 'card';
      row.innerHTML =
        '<label>Word</label><input data-f="word" value="' + esc(item.word) + '">' +
        '<label>Meaning / hint</label><input data-f="meaning" value="' + esc(item.meaning || '') + '">' +
        '<button class="small danger" data-remove="' + i + '">Remove word</button>';
      row.querySelectorAll('[data-f]').forEach(function (input) {
        input.addEventListener('input', function () {
          item[input.getAttribute('data-f')] = input.value;
        });
      });
      row.querySelector('[data-remove]').addEventListener('click', function () {
        draft.words.splice(i, 1);
        drawWords();
      });
      return row;
    }
    function drawWords() {
      wordsEl.innerHTML = '';
      draft.words.forEach(function (item, i) { wordsEl.appendChild(wordRow(item, i)); });
    }
    drawWords();
    $('setup-add-word').addEventListener('click', function () {
      draft.words.push({ word: 'New word', meaning: '' });
      drawWords();
    });

    /* collectDraft must include EVERY editable field — name, about,
       students, student_pins and words — or Setup silently drops it.
       PINs are pruned to current students and to exactly 4 digits.
       Students come from draft.students, which the live student RPC
       keeps in sync — a later save/upload never reverts a student change. */
    function collectDraft() {
      var pins = {};
      Object.keys(draft.student_pins || {}).forEach(function (nm) {
        if (draft.students.indexOf(nm) !== -1 && /^\d{4}$/.test(draft.student_pins[nm])) pins[nm] = draft.student_pins[nm];
      });
      return {
        name: $('setup-name').value.trim() || draft.name,
        about: $('setup-about').value,
        students: draft.students.slice(),
        student_pins: pins,
        words: draft.words.filter(function (w) { return String(w.word || '').trim() !== ''; })
          .map(function (w) { return { word: String(w.word).trim(), meaning: String(w.meaning || '').trim() }; })
      };
    }
    $('setup-save').addEventListener('click', function () {
      var out = $('setup-out');
      out.innerHTML = '<p class="info">Saving…</p>';
      var d = collectDraft();
      rpc('save_kids_english_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p, p_draft: d }).then(function () {
        draft = d;
        draftStatus = 'editing';
        out.innerHTML = '<p class="info">Draft saved. Children still see the approved words.</p>';
      }).catch(function (err) {
        out.innerHTML = '<p class="error">Could not save: ' + esc(err.message) + '</p>';
      });
    });
    $('setup-upload').addEventListener('click', function () {
      var out = $('setup-out');
      out.innerHTML = '<p class="info">Uploading…</p>';
      var d = collectDraft();
      rpc('submit_kids_english_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p, p_draft: d }).then(function () {
        draft = d;
        draftStatus = directUploadOn ? 'approved' : 'pending';
        notifyEmail((directUploadOn ? 'Kids English upload — live right away: ' : 'Kids English draft for approval: ') + (d.name || SLUG), { school: d.name || '', slug: SLUG, status: directUploadOn ? 'Live right away — no approval needed' : undefined });
        out.innerHTML = '<p class="info">' + (directUploadOn ? 'Uploaded! Your changes are live right away. ✅' : 'Uploaded! Your changes were sent to Yently and are waiting for approval. We will email you once they are live.') + '</p>';
      }).catch(function (err) {
        out.innerHTML = '<p class="error">Could not upload: ' + esc(err.message) + '</p>';
      });
    });
  }

  /* ---------- Start ---------- */
  document.querySelectorAll('#tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      show(btn.getAttribute('data-view'));
    });
  });
  /* Black ↑ Top pill at the bottom-left, exactly like the shop pages:
     always visible, tap it to jump back to the top. */
  var toTop = $('to-top');
  if (toTop) {
    toTop.addEventListener('click', function () { window.scrollTo(0, 0); });
  }
  if (!SLUG) {
    $('site-name').textContent = 'School not found';
    $('view-play').innerHTML = '<div class="error">This link doesn\'t point to a school. Check the link and try again — ask Yently for your school link.</div>';
  } else {
    resolveSlug().then(function () { return Promise.all([checkSystemOff(), checkShopOff()]); }).then(function (res) { var off = res[0] || res[1];
      if (off) {
        systemOff = res[0]; shopOff = res[1];
        $('site-name').textContent = 'Kids English';
        $('view-play').innerHTML = shopOff ? '<div class="error">This shop is currently unavailable. Yently has switched it off for now — please check back later, or contact Yently if you need help.</div>' : '<div class="error">This system is currently unavailable. Yently has switched it off for now — please check back later, or contact Yently if you need help.</div>';
        return null;
      }
      return rpc('get_kids_english_live', { p_slug: SLUG });
    }).then(function (json) {
      if (!json) return; // system or shop switched off — nothing to load
      if (!json || !json.name) throw new Error('not found');
      data = json;
      /* Per-shop live chat: visitor bubble. ShopChat checks the
         switch itself and renders nothing while OFF. mountBubble
         writes into the element it is given, so it mounts into its
         own container div — never document.body, which would wipe
         the page. No owner email exists for Kids schools, so ''
         is passed and no email is attempted. */
      if (window.ShopChat) {
        var chatBox = document.createElement('div');
        chatBox.id = 'shop-chat-mount';
        document.body.appendChild(chatBox);
        window.ShopChat.mountBubble(chatBox, { ownerType: 'kids-english', ownerKey: SLUG, shopName: data.name || 'Kids English', ownerEmail: '' });
      }
      data.students = data.students || [];
      data.words = data.words || [];
      /* A stored name that now has a PIN must re-enter it: never
         auto-select a PIN student from localStorage. */
      if (player && (data.pin_students || []).indexOf(player) !== -1) {
        player = '';
        try { localStorage.removeItem(STUDENT_KEY); } catch (e) {}
      }
      document.title = data.name || 'Kids English';
      var logo = $('site-logo');
      if (data.logo) { logo.src = (/^https?:\/\//.test(data.logo) ? data.logo : BASE + data.logo); logo.hidden = false; }
      $('site-name').textContent = data.name || 'Kids English';
      $('site-about').textContent = data.about || '';
      $('site-footer').innerHTML = YENTLY_BADGE_HTML;
      showYentlyBadgeTop();
      hideYentlyBadgeIfRemoved();
      rpc('kids_english_pass_status', { p_slug: SLUG }).then(function (s) {
        teacherUnlocked = !(s && s.has_pass);
        renderPlay();
      }).catch(function () {
        /* If the status check itself is unreachable, stay open rather
           than locking the teacher out of a working school. */
        teacherUnlocked = true;
        renderPlay();
      });
    }).catch(function () {
      $('site-name').textContent = 'School not found';
      $('view-play').innerHTML = '<div class="error">This link doesn\'t point to a school yet. Check the link and try again.</div>';
    });
  }
})();
