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
  var draft = null; // owner draft (Setup)
  var draftStatus = 'editing';
  /* Direct Upload: when Yently has switched it on for this shop,
     an upload goes live straight away instead of waiting for
     approval. Checked once when Setup opens and cached for the
     session; any failure leaves it off, so the old wording stays. */
  var directUploadOn = false;
  var hasCleanLink = false; // the school already has a clean link — hides the Setup add-on line (clean_link_exists, fetched in openSetup)
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
     left or the Chats section is closed. No-op when chats were
     never opened. */
  function stopSetupChats() {
    var box = $('setup-chats');
    if (box && box._shopChatStop) { try { box._shopChatStop(); } catch (e) {} }
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
      /* Clean Link: hide the Setup add-on line when the school
         already has one (clean_link_exists, public RPC). */
      return rpc('clean_link_exists', { p_system: 'kids-english', p_slug: SLUG }).then(function (has) {
        hasCleanLink = (has === true);
      }).catch(function () { hasCleanLink = false; });
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
    var html = '<h2>Setup</h2>' +
      '<div class="note">' + esc(statusLine()) + '</div>' +
      '<div class="card">' +
      field('School name', 'setup-name', draft.name) +
      field('About text', 'setup-about', draft.about) +
      '</div><h2>Students</h2><p class="info" id="setup-student-count"></p><div id="setup-students"></div>' +
      '<p class="info">To change a student\'s name, click Remove next to that student, then add a new student with the right name.</p>' +
      '<div class="row"><input id="setup-new-student" type="text" placeholder="New student name…" style="flex:1;margin:0">' +
      '<button id="setup-add-student" class="secondary">+ Add student</button></div>' +
      '<div id="setup-student-out" style="margin-top:8px"></div>' +
      '<p class="info" id="setup-extra-students"></p>' +
      '<p class="info" id="setup-clean-link"></p>' +
      '<p class="info" id="setup-direct-upload"></p>' +
      '<h2>Words</h2><p class="info">Each word has a meaning or hint the children see while they play.</p><div id="setup-words"></div>' +
      '<button id="setup-add-word" class="secondary">+ Add word</button>' +
      '<div class="row" style="margin-top:16px"><button id="setup-save" class="secondary">Save draft</button>' +
      '<button id="setup-upload">' + (directUploadOn ? 'Upload — goes live right away' : 'Upload for approval') + '</button></div>' +
      '<div id="setup-out" style="margin-top:12px"></div>' +
      '<h2>Chats — المحادثات</h2>' +
      '<div class="row"><button id="setup-chats-toggle" class="secondary">💬 Chats — المحادثات</button></div>' +
      '<div id="setup-chats"></div>';
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
    /* Per-shop live chat: owner inbox, behind the owner login.
       Opens on tap; tapping again (or leaving Setup) stops its poll. */
    $('setup-chats-toggle').addEventListener('click', function () {
      var box = $('setup-chats');
      if (!box) return;
      if (box.innerHTML) {
        stopSetupChats();
        box.innerHTML = '';
        return;
      }
      if (window.ShopChat) {
        window.ShopChat.mountInbox(box, { ownerType: 'kids-english', ownerKey: SLUG, creds: { u: staffCreds.u, p: staffCreds.p } });
      } else {
        box.innerHTML = '<p class="error">Chat is not available right now. Please reload the page and try again.</p>';
      }
    });

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
      /* Need more students? Quiet line under the Students section,
         linking to the Extra Students page. Count and limit are
         already client-side (studentLimit, fetched in openSetup). */
      var extraEl = $('setup-extra-students');
      if (extraEl) {
        extraEl.innerHTML = draft.students.length >= studentLimit
          ? 'Need more students? You have ' + draft.students.length + ' of ' + studentLimit + ' places — <a href="/?add=kids-extra-english&slug=' + encodeURIComponent(SLUG) + '">add extra students</a> for $1/month each — free for the rest of this month.'
          : 'Need more students? <a href="/?add=kids-extra-english&slug=' + encodeURIComponent(SLUG) + '">Extra students</a> are $1/month each — free for the rest of this month.';
      }
      /* Clean Link add-on: a short yently.com link for this school,
         $2/month from the next payment — free for the rest of this
         month. Hidden when the school already has a clean link. */
      var cleanEl = $('setup-clean-link');
      if (cleanEl) {
        cleanEl.innerHTML = hasCleanLink ? '' : 'Want a short link for this page? <a href="/?add=clean:website&shop=kids-english&slug=' + encodeURIComponent(SLUG) + '&addon=1">Add a Clean Link</a> — $2/month, free for the rest of this month.';
      }
      /* Direct Upload add-on: $5/month from the next payment —
         free for the rest of this month. Hidden when the switch
         is already ON (directUploadOn, fetched in openSetup). */
      var duEl = $('setup-direct-upload');
      if (duEl) {
        duEl.innerHTML = directUploadOn ? '' : 'Want your uploads to go live right away? <a href="/?add=direct:website&shop=kids-english&slug=' + encodeURIComponent(SLUG) + '&addon=1">Add Direct Upload</a> — $5/month, free for the rest of this month.';
      }
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
    resolveSlug().then(function () { return rpc('get_kids_english_live', { p_slug: SLUG }); }).then(function (json) {
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
      $('site-footer').innerHTML = '<div>Powered by Yently</div>';
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
