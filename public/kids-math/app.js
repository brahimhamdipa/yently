/* Kids Math page app — ONE folder for every school.
   The school comes from its own private link, and its name, about
   text, students and questions-per-round live in the database —
   there is no data.json file here. Visitors see the last APPROVED
   version. The owner logs in with the username + password the
   admin created for their school (that login is what Yently
   sells); Setup edits save as a draft, and the Upload button sends
   the draft to the admin for approval. Approval makes the draft
   live instantly — no file swap, no redeploy wait. Student names are the exception: adding or removing a student goes live at once, up to the school's student limit (3 included + paid extra kids).
   Play is PUBLIC: a child picks their name from the student list,
   picks a level and a game, and plays a round of questions. The
   score is saved so the teacher can see each student's progress.
   The Teacher tab needs the school's shared teacher password
   (one password for everybody, set by the admin; schools with
   none set stay fully open). Setup still asks for the owner's
   own login. All credentials live in memory only: a reload asks
   again, exactly like the other folder apps. */
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
    // system's own folder name, so a bare /kids-math visit still
    // shows "not found" by design.
    var segs = location.pathname.split('/').filter(function (s) { return s; });
    var lastSeg = (segs[segs.length - 1] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    if (lastSeg && lastSeg !== 'kids-math') { SLUG = lastSeg; SLUG_FROM_PATH = true; }
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
  var hasCleanLink = false; // the school already has a clean link — for the Add-ons section (clean_link_exists, fetched in openSetup)
  var chatOn = false; // live chat switched on for this school — for the Add-ons section (shop_chat_enabled, fetched in openSetup)
  var cleanLinkSlug = ''; // the school's live clean-link word, fetched on demand for the "Your live link" line
  var addonsSelected = ''; // the add-on whose details panel is open ('' = none)
  var studentLimit = 3; // students included in the plan (3) + paid extra kids; fetched in openSetup, falls back to 3
  var staffCreds = null; // {u, p} in memory only, never stored
  var teacherPass = null; // teacher password in memory only, never stored
  var teacherUnlocked = false; // true once the teacher password is entered, or when the school has none set
  var currentView = 'play';

  /* The round in progress. */
  var playStudent = '';
  var playLevel = 'Easy';
  var playGame = 'Addition';
  var playQuestions = [];
  var playIdx = 0;
  var playScore = 0;
  var playAnswered = false;
  var LAST_STUDENT_KEY = 'kids-math-last-student-' + SLUG;
  var playStudentPin = ''; // verified PIN for the current student, session only, never stored
  var pinName = ''; // student awaiting PIN entry on the picker
  var delStudentIdx = null; // Setup: student index awaiting an in-page delete confirmation
  var delScoreId = null; // teacher scores: score id awaiting an in-page delete confirmation
  var delScoreErr = ''; // teacher scores: delete error to show on the next list render

  var LEVELS = [
    { name: 'Easy', blurb: 'Numbers to 10 · adding and taking away' },
    { name: 'Medium', blurb: 'Numbers to 50 · adding, taking away, and × 2, 3, 5' },
    { name: 'Hard', blurb: 'Numbers to 100 · all four operations' }
  ];
  var GAMES = ['Addition', 'Subtraction', 'Multiplication', 'Division', 'Word problems'];
  var CHEERS = ['Great job! 🎉', 'Well done! ⭐', 'You did it! 🌟', 'Amazing! 👏', 'Super work! 🚀', 'Brilliant! 💪'];

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
      /* Some calls (save/upload/record) return no body at all — read
         text first and only parse when there is something to parse,
         so an empty success reply is not mistaken for a failure. */
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
        body: JSON.stringify({ subject: subject, table: 'kids_math_draft', record: record })
      }).catch(function () {});
    } catch (e) {}
  }
  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function questionsPerRound() {
    var n = data && data.questionsPerRound ? Number(data.questionsPerRound) : 10;
    if (!n || n < 1) n = 10;
    if (n > 50) n = 50;
    return n;
  }

  /* ---------- Question generation ---------- */
  /* Easy: numbers to 10, adding and taking away. Medium: numbers to
     50, adding, taking away, and multiplying by 2, 3 or 5. Hard:
     numbers to 100, all four operations. Division always has a
     whole-number answer. Subtraction never goes below zero. */
  function makeQuestion(game, level) {
    var a, b, ans, text;
    if (game === 'Word problems') {
      /* A story problem from the school's own list, at the picked
         level. Nothing listed for this level (or a bad answer) falls
         back to a generated Addition question, so the game never
         breaks on empty data. Wrong choices are built the same way
         as for the generated questions below. */
      var pool = ((data && data.wordProblems) || []).filter(function (wp) {
        return wp && String(wp.q || '').trim() !== '' && (wp.level || 'Easy') === level;
      });
      if (!pool.length) return makeQuestion('Addition', level);
      var prob = pool[Math.floor(Math.random() * pool.length)];
      ans = Number(prob.answer);
      if (!isFinite(ans) || ans < 0) return makeQuestion('Addition', level);
      text = String(prob.q).trim();
    } else if (game === 'Addition') {
      var max = level === 'Easy' ? 10 : (level === 'Medium' ? 50 : 100);
      a = randInt(0, max); b = randInt(0, max);
      ans = a + b; text = a + ' + ' + b + ' = ?';
    } else if (game === 'Subtraction') {
      var maxS = level === 'Easy' ? 10 : (level === 'Medium' ? 50 : 100);
      a = randInt(0, maxS); b = randInt(0, a);
      ans = a - b; text = a + ' − ' + b + ' = ?';
    } else if (game === 'Multiplication') {
      if (level === 'Easy') { a = randInt(0, 5); b = randInt(0, 5); }
      else if (level === 'Medium') { a = randInt(0, 10); b = [2, 3, 5][randInt(0, 2)]; if (Math.random() < 0.5) { var t = a; a = b; b = t; } }
      else { a = randInt(0, 12); b = randInt(0, 12); }
      ans = a * b; text = a + ' × ' + b + ' = ?';
    } else { /* Division */
      if (level === 'Easy') { b = [2, 3, 5][randInt(0, 2)]; ans = randInt(0, 5); }
      else if (level === 'Medium') { b = [2, 3, 5][randInt(0, 2)]; ans = randInt(0, 10); }
      else { b = randInt(2, 12); ans = randInt(0, 12); }
      a = b * ans; text = a + ' ÷ ' + b + ' = ?';
    }
    var choices = [ans];
    var tries = 0;
    while (choices.length < 4 && tries < 40) {
      tries++;
      var d = ans + [1, -1, 2, -2, 10, -10, 3, -3][randInt(0, 7)];
      if (d < 0) continue;
      if (choices.indexOf(d) === -1) choices.push(d);
    }
    while (choices.length < 4) choices.push(ans + choices.length + 1);
    return { text: text, answer: ans, choices: shuffle(choices) };
  }
  function makeRound() {
    var n = questionsPerRound();
    var qs = [];
    for (var i = 0; i < n; i++) qs.push(makeQuestion(playGame, playLevel));
    return qs;
  }

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

  /* ---------- Play (public) ---------- */
  function renderPlay() {
    var el = $('view-play');
    if (!data) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var students = data.students || [];
    if (!students.length) {
      el.innerHTML = '<h2>Play</h2><div class="card"><p class="info">No students have been added yet. The teacher can add names in Setup.</p></div>';
      return;
    }
    /* Remember the last picked student on this device, so a child
       does not have to find their name every time. */
    if (!playStudent) {
      try { playStudent = localStorage.getItem(LAST_STUDENT_KEY) || ''; } catch (e) {}
      if (students.indexOf(playStudent) === -1) playStudent = '';
      /* A stored name that now has a PIN must re-enter it: never
         auto-select a PIN student from localStorage. */
      if (playStudent && (data.pin_students || []).indexOf(playStudent) !== -1) {
        playStudent = '';
        try { localStorage.removeItem(LAST_STUDENT_KEY); } catch (e) {}
      }
    }
    var html = '<h2>Who is playing?</h2><div class="student-grid">';
    students.forEach(function (name) {
      html += '<button class="student-btn' + (playStudent === name ? ' selected' : '') + '" data-student="' + esc(name) + '">' + esc(name) + '</button>';
    });
    html += '</div>';
    /* Sign out: let the next child pick their own name (and enter
       their own PIN). Clears the session PIN too — nothing is
       stored on the device. */
    if (playStudent) {
      html += '<div class="row"><button id="sign-out" class="secondary">Sign out</button></div>';
    }
    /* PIN gate: a student with a PIN set must enter it before
       playing. The prompt is in-page, never a native prompt(). */
    if (pinName) {
      html += '<div class="card"><h2>🔒 Enter your PIN</h2>' +
        '<p class="info">Enter ' + esc(pinName) + '\'s 4-digit PIN to play:</p>' +
        '<label>PIN</label><input id="pin-input" type="password" inputmode="numeric" maxlength="4" autocomplete="off">' +
        '<div class="row"><button id="pin-ok">OK</button><button id="pin-cancel" class="secondary">Cancel</button></div>' +
        '<div id="pin-out" style="margin-top:12px"></div></div>';
    }
    html += '<h2>Pick a level</h2><div class="level-grid">';
    LEVELS.forEach(function (lv) {
      html += '<button class="level-btn' + (playLevel === lv.name ? ' selected' : '') + '" data-level="' + lv.name + '">' +
        '<span class="level-name">' + lv.name + '</span><span class="level-blurb">' + lv.blurb + '</span></button>';
    });
    html += '</div>';
    html += '<h2>Pick a game</h2><div class="game-grid">';
    GAMES.forEach(function (g) {
      html += '<button class="game-btn' + (playGame === g ? ' selected' : '') + '" data-game="' + g + '">' + g + '</button>';
    });
    html += '</div>';
    html += '<div class="row" style="margin-top:18px"><button id="play-start" class="big-btn"' + (playStudent ? '' : ' disabled') + '>▶ Start playing!</button></div>' +
      '<div id="play-out" style="margin-top:12px"></div>';
    el.innerHTML = html;
    el.querySelectorAll('[data-student]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-student');
        /* Already verified for this student: no PIN prompt again. */
        if (name === playStudent && playStudentPin) { renderPlay(); return; }
        /* A student with a PIN set must enter it first. */
        if ((data.pin_students || []).indexOf(name) !== -1) {
          pinName = name;
          renderPlay();
          return;
        }
        playStudent = name;
        playStudentPin = '';
        pinName = '';
        try { localStorage.setItem(LAST_STUDENT_KEY, playStudent); } catch (e) {}
        renderPlay();
      });
    });
    wirePinBox();
    el.querySelectorAll('[data-level]').forEach(function (btn) {
      btn.addEventListener('click', function () { playLevel = btn.getAttribute('data-level'); renderPlay(); });
    });
    el.querySelectorAll('[data-game]').forEach(function (btn) {
      btn.addEventListener('click', function () { playGame = btn.getAttribute('data-game'); renderPlay(); });
    });
    $('play-start').addEventListener('click', function () {
      if (!playStudent) {
        $('play-out').innerHTML = '<p class="error">Pick your name first!</p>';
        return;
      }
      playQuestions = makeRound();
      playIdx = 0;
      playScore = 0;
      renderQuestion();
    });
    var signOut = $('sign-out');
    if (signOut) signOut.addEventListener('click', function () {
      playStudent = '';
      playStudentPin = '';
      pinName = '';
      try { localStorage.removeItem(LAST_STUDENT_KEY); } catch (e) {}
      renderPlay();
    });
  }
  /* PIN entry box on the picker: digits only, verified against the
     server. The verified PIN lives only in a session variable. */
  function wirePinBox() {
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
      rpc('check_kids_math_student_pin', { p_slug: SLUG, p_student_name: pinName, p_pin: pin }).then(function (ok) {
        if (ok === true) {
          playStudent = pinName;
          playStudentPin = pin;
          pinName = '';
          try { localStorage.setItem(LAST_STUDENT_KEY, playStudent); } catch (e) {}
          renderPlay();
        } else {
          out.innerHTML = '<p class="error">Wrong PIN — try again.</p>';
        }
      }).catch(function () {
        out.innerHTML = '<p class="error">Could not reach the PIN check. Please try again in a moment.</p>';
      });
    });
    $('pin-cancel').addEventListener('click', function () { pinName = ''; renderPlay(); });
    input.focus();
  }
  function renderQuestion() {
    var el = $('view-play');
    var q = playQuestions[playIdx];
    var total = playQuestions.length;
    playAnswered = false;
    var html = '<div class="progress">Question ' + (playIdx + 1) + ' of ' + total + ' &nbsp;·&nbsp; ⭐ ' + playScore + ' correct</div>' +
      '<div class="card question-card"><div class="question-text">' + esc(q.text) + ' ' + speakBtnHtml(q.text) + '</div>' +
      '<div class="choice-grid">';
    q.choices.forEach(function (c) {
      html += '<button class="choice-btn" data-choice="' + c + '">' + c + '</button>';
    });
    html += '</div><div id="q-out" style="margin-top:14px"></div></div>';
    el.innerHTML = html;
    wireSpeakButtons(el);
    el.querySelectorAll('[data-choice]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (playAnswered) return;
        playAnswered = true;
        var picked = Number(btn.getAttribute('data-choice'));
        var correct = picked === q.answer;
        if (correct) playScore++;
        var prog = el.querySelector('.progress');
        if (prog) prog.innerHTML = 'Question ' + (playIdx + 1) + ' of ' + total + ' &nbsp;·&nbsp; ⭐ ' + playScore + ' correct';
        el.querySelectorAll('[data-choice]').forEach(function (b) {
          var v = Number(b.getAttribute('data-choice'));
          if (v === q.answer) b.classList.add('correct');
          else if (b === btn) b.classList.add('wrong');
          b.disabled = true;
        });
        var out = $('q-out');
        if (correct) {
          out.innerHTML = '<p class="cheer">' + CHEERS[randInt(0, CHEERS.length - 1)] + '</p>';
        } else {
          out.innerHTML = '<p class="info big">Not quite — the answer was <strong>' + q.answer + '</strong>. ' + speakBtnHtml(String(q.answer)) + ' You will get the next one!</p>';
        }
        var nextLabel = playIdx + 1 >= total ? 'See my score! 🎉' : 'Next question →';
        out.innerHTML += '<div class="row" style="margin-top:14px"><button id="q-next" class="big-btn">' + nextLabel + '</button></div>';
        $('q-next').addEventListener('click', function () {
          playIdx++;
          if (playIdx >= total) renderResult();
          else renderQuestion();
        });
        wireSpeakButtons(out);
      });
    });
  }
  function renderResult() {
    var el = $('view-play');
    var total = playQuestions.length;
    var msg;
    if (playScore === total) msg = 'Perfect score! You are a maths star! 🌟🎉';
    else if (playScore >= Math.ceil(total * 0.7)) msg = 'Great job! You got most of them right! ⭐';
    else if (playScore >= Math.ceil(total * 0.4)) msg = 'Good try! Keep practising — you are getting better! 👍';
    else msg = 'Good effort! Try again — practice makes perfect! 💪';
    el.innerHTML = '<div class="card result-card"><h2>' + esc(playStudent) + ', you scored</h2>' +
      '<div class="score-big">' + playScore + ' / ' + total + '</div>' +
      '<p class="cheer">' + msg + '</p>' +
      '<p class="info">' + esc(playGame) + ' · ' + esc(playLevel) + '</p>' +
      '<p class="info" id="score-save-note">Saving your score…</p>' +
      '<div class="row"><button id="play-again" class="big-btn">Play again 🔁</button>' +
      '<button id="play-change" class="secondary big-btn">Change game</button></div></div>';
    rpc('record_kids_math_score', {
      p_slug: SLUG, p_student_name: playStudent, p_game: playGame,
      p_level: playLevel, p_score: playScore, p_total: total,
      p_pin: playStudentPin || ''
    }).then(function () {
      var n = $('score-save-note');
      if (n) n.textContent = 'Your score was saved for your teacher to see. ✅';
    }).catch(function () {
      var n = $('score-save-note');
      if (n) n.textContent = 'Your score could not be saved this time — but great playing anyway!';
    });
    $('play-again').addEventListener('click', function () {
      playQuestions = makeRound();
      playIdx = 0;
      playScore = 0;
      renderQuestion();
    });
    $('play-change').addEventListener('click', function () { renderPlay(); });
  }

  /* ---------- Teacher (shared teacher password) ---------- */
  /* The scores are behind the school's shared teacher password —
     one password for everybody, set by the admin. Nothing is
     stored: a reload asks again. Schools with no password set skip
     this entirely (teacherUnlocked starts true for them, see the
     start block). */
  function renderTeacherPrompt(el) {
    el.innerHTML = '<h2>Teacher</h2><div class="card">' +
      '<p class="info">Enter the teacher password for this school to see the students\' scores.</p>' +
      '<label>Teacher password</label><input id="teacher-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="teacher-go">Unlock</button></div>' +
      '<div id="teacher-out" style="margin-top:12px"></div></div>';
    $('teacher-go').addEventListener('click', function () {
      var out = $('teacher-out');
      var p = $('teacher-pass').value;
      out.innerHTML = '<p class="info">Checking…</p>';
      rpc('check_kids_math_teacher_pass', { p_slug: SLUG, p_password: p }).then(function (ok) {
        if (ok === true) {
          teacherPass = p;
          teacherUnlocked = true;
          openTeacher();
        } else {
          out.innerHTML = '<p class="error">Wrong teacher password.</p>';
        }
      }).catch(function () {
        out.innerHTML = '<p class="error">Could not reach the sign-in check. Please try again in a moment.</p>';
      });
    });
  }
  function openTeacher() {
    var el = $('view-teacher');
    if (!teacherUnlocked) { renderTeacherPrompt(el); return; }
    el.innerHTML = '<h2>Teacher</h2><div class="card"><p class="info">Loading scores…</p></div>';
    rpc('list_kids_math_scores', { p_slug: SLUG, p_epass: teacherPass }).then(function (rows) {
      renderScores(rows || []);
    }).catch(function (err) {
      el.innerHTML = '<h2>Teacher</h2><div class="card"><p class="error">Could not load scores: ' + esc(err.message) + '</p></div>';
    });
  }
  function renderScores(rows) {
    var el = $('view-teacher');
    var html = '<h2>Teacher — Scores</h2>';
    if (delScoreErr) {
      html += '<div class="card"><p class="error">Could not delete score: ' + esc(delScoreErr) + '</p></div>';
      delScoreErr = '';
    }
    if (!rows.length) {
      el.innerHTML = html + '<div class="card"><p class="info">No scores yet. Once children play a round, their scores will show up here.</p></div>';
      return;
    }
    /* Progress per student: how many rounds each child played, their
       best score and their average, so the teacher can see at a
       glance who is flying and who needs a little more practice. */
    var byStudent = {};
    rows.forEach(function (r) {
      var s = byStudent[r.student_name] || (byStudent[r.student_name] = { rounds: 0, best: 0, bestTotal: 0, sum: 0, sumTotal: 0 });
      s.rounds++;
      s.sum += r.score; s.sumTotal += r.total;
      if (r.total > 0 && (s.bestTotal === 0 || r.score / r.total > s.best / s.bestTotal)) { s.best = r.score; s.bestTotal = r.total; }
    });
    html += '<h3>Progress by student</h3><div class="card"><table class="scores-table"><thead><tr><th>Student</th><th>Rounds</th><th>Best</th><th>Average</th></tr></thead><tbody>';
    Object.keys(byStudent).sort().forEach(function (name) {
      var s = byStudent[name];
      var avg = s.sumTotal ? Math.round(100 * s.sum / s.sumTotal) : 0;
      html += '<tr><td><strong>' + esc(name) + '</strong></td><td>' + s.rounds + '</td><td>' + s.best + ' / ' + s.bestTotal + '</td><td>' + avg + '%</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<h3>All scores (newest first)</h3><div class="card"><table class="scores-table"><thead><tr><th>Student</th><th>Game</th><th>Level</th><th>Score</th><th>Date</th><th></th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var d = r.created_at ? new Date(r.created_at).toLocaleString() : '';
      var delHtml;
      if (delScoreId === r.id) {
        delHtml = '<span>Delete this score?</span> <button class="danger small" data-score-del-yes="' + r.id + '">Yes</button> <button class="secondary small" data-score-del-no>Keep</button>';
      } else {
        delHtml = '<button class="small danger" data-score-del="' + r.id + '">Delete</button>';
      }
      html += '<tr><td><strong>' + esc(r.student_name) + '</strong></td><td>' + esc(r.game) + '</td><td>' + esc(r.level) + '</td><td>' + r.score + ' / ' + r.total + '</td><td>' + esc(d) + '</td><td>' + delHtml + '</td></tr>';
    });
    html += '</tbody></table></div>';
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
        rpc('delete_kids_math_score', { p_slug: SLUG, p_epass: teacherPass || '', p_score_id: id }).then(function () {
          delScoreId = null;
          openTeacher();
        }).catch(function (err) {
          delScoreId = null;
          delScoreErr = err.message || 'request failed';
          openTeacher();
        });
      });
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
  var ADDONS_SYSTEM = 'kids-math';
  function addonsExtraCount() { return Math.max(0, studentLimit - 3); }
  function addonsExtraText() {
    var extra = addonsExtraCount();
    return 'You have ' + draft.students.length + ' of ' + studentLimit + ' student places' + (extra > 0 ? ' — ' + extra + ' extra place' + (extra > 1 ? 's' : '') + ' paid' : ' — 3 included in your plan');
  }
  function addonsActiveRows() {
    var extra = addonsExtraCount();
    return '<li>Clean Link — <b>' + (hasCleanLink ? 'Active' : 'Not added') + '</b></li>' +
      '<li>Live Chat — <b>' + (chatOn ? 'Active' : 'Not added') + '</b></li>' +
      '<li>Direct Upload — <b>' + (directUploadOn ? 'Active' : 'Not added') + '</b></li>' +
      '<li id="setup-addons-active-extra">Extra Students — <b>' + (extra > 0 ? 'Active (' + extra + ' extra place' + (extra > 1 ? 's' : '') + ')' : 'Not added') + '</b></li>';
  }
  function updateAddonsExtra() {
    var row = $('setup-addons-active-extra');
    if (row) {
      var extra = addonsExtraCount();
      row.innerHTML = 'Extra Students — <b>' + (extra > 0 ? 'Active (' + extra + ' extra place' + (extra > 1 ? 's' : '') + ')' : 'Not added') + '</b>';
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
        '<p class="info"><a href="/?add=kids-extra-math&slug=' + encodeURIComponent(SLUG) + '">Add extra students</a> for $1/month each — free for the rest of this month.</p>';
    }
    box.innerHTML = html;
    /* Wire the buttons inside the panel just rendered. */
    if (key === 'clean' && !hasCleanLink) {
      var cleanAdd = $('setup-addons-clean-add');
      if (cleanAdd) cleanAdd.onclick = function () { var t = $('setup-addons-clean-type'); window.location.href = '/?add=' + encodeURIComponent(t ? t.value : 'clean:website') + '&shop=kids-math&slug=' + encodeURIComponent(SLUG) + '&addon=1'; };
      var cleanHelp = $('setup-addons-clean-help');
      if (cleanHelp) cleanHelp.onclick = function (e) { if (e) e.preventDefault(); openCleanLinkHelp(); };
    }
    if (key === 'chat' && chatOn) {
      var inbox = $('setup-addons-chat-inbox');
      if (inbox) {
        if (window.ShopChat) {
          window.ShopChat.mountInbox(inbox, { ownerType: 'kids-math', ownerKey: SLUG, creds: { u: staffCreds.u, p: staffCreds.p } });
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
      fetch(SUPABASE_URL + '/rest/v1/clean_links?system=eq.kids-math&shop_slug=eq.' + encodeURIComponent(SLUG) + '&select=slug', {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
      }).then(function (res) { return res.ok ? res.json() : []; }).then(function (rows) {
        if (rows && rows[0] && rows[0].slug) {
          cleanLinkSlug = String(rows[0].slug);
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
    rpc('get_kids_math_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p }).then(function (res) {
      draft = res.data || {};
      draft.students = draft.students || [];
      draft.student_pins = draft.student_pins || {};
      draft.wordProblems = draft.wordProblems || [];
      if (!draft.questionsPerRound) draft.questionsPerRound = 10;
      draftStatus = res.status || 'editing';
      /* Student limit: 3 included + paid extra kids. Fetched fresh
         each time Setup opens; falls back to 3 if unavailable. */
      return rpc('kids_math_student_limit', { p_slug: SLUG }).then(function (limit) {
        if (typeof limit === 'number' && isFinite(limit) && limit >= 3) studentLimit = limit;
      }).catch(function () {});
    }).then(function () {
      /* Direct Upload switch: see the note by directUploadOn. */
      return rpc('direct_upload_enabled', { p_owner_type: 'kids-math', p_owner_key: SLUG }).then(function (on) {
        directUploadOn = (on === true);
      }).catch(function () { directUploadOn = false; });
    }).then(function () {
      /* Clean Link: whether the school already has one
         (clean_link_exists, public RPC). */
      return rpc('clean_link_exists', { p_system: 'kids-math', p_slug: SLUG }).then(function (has) {
        hasCleanLink = (has === true);
      }).catch(function () { hasCleanLink = false; });
    }).then(function () {
      /* Live Chat switch: see the note by chatOn. */
      return rpc('shop_chat_enabled', { p_owner_type: 'kids-math', p_owner_key: SLUG }).then(function (on) {
        chatOn = (on === true);
      }).catch(function () { chatOn = false; });
    }).then(function () {
      renderSetup();
    }).catch(function () {
      el.innerHTML = '<h2>Setup</h2><div class="card"><p class="error">Could not load your draft. Please try again in a moment.</p></div>';
    });
  }
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
      rpc('check_kids_math_login', { p_slug: SLUG, p_username: u, p_password: p }).then(function (ok) {
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
  function statusLine() {
    if (draftStatus === 'pending') return 'Your changes were sent to Yently and are waiting for approval. Children still see the approved version.';
    if (draftStatus === 'approved') return 'Your last upload was approved and is now live.';
    if (directUploadOn) return 'Direct Upload is on for this school — your changes go live the moment you upload them. Children still see the approved version.';
    return 'Your changes are saved as a draft. Children still see the approved version until you upload and Yently approves.';
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
      field('Questions per round', 'setup-qpr', draft.questionsPerRound, 'number') +
      '<p class="info">How many questions each round has. 10 is the usual number.</p>' +
      '</div><h2>Students</h2><div class="card">' +
      '<p class="info">Children pick their name from this list before they play. Add one name at a time.</p>' +
      '<p class="info" id="setup-student-count"></p>' +
      '<div id="setup-students"></div>' +
      '<p class="info">To change a student\'s name, click Remove next to that student, then add a new student with the right name.</p>' +
      '<div class="row"><input id="setup-new-student" type="text" placeholder="New student name" style="flex:1;margin:0">' +
      '<button id="setup-add-student" class="secondary">+ Add student</button></div>' +
      '<div id="setup-student-out" style="margin-top:8px"></div></div>' +
      '<div class="card" id="setup-addons">' +
      '<h3>Add-ons</h3>' +
      '<p class="info">Add-ons add more to your school page — a short link, live chat, uploads that go live right away, or places for more students. Pick one below to see what it does and what it costs. Add-ons join the payment you already have — free for the rest of this month, charged from your next payment.</p>' +
      '<div class="row"><button type="button" id="setup-addons-menu-btn" class="secondary" aria-label="Add-ons menu">☰ Add-ons</button></div>' +
      '<div id="setup-addons-menu" style="display:none;margin-top:8px;">' +
      '<button type="button" class="secondary" data-addon-pick="clean" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Clean Link — $5/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="chat" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Live Chat — $3/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="direct" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Direct Upload — $5/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="extra" style="display:block;width:100%;text-align:left;">Extra Students — $1/month each</button>' +
      '</div>' +
      '<div id="setup-addons-details" style="margin-top:12px;"></div>' +
      '<div style="margin-top:12px;"><h4 style="margin:0 0 6px;">Your add-ons</h4><ul id="setup-addons-active-list" style="margin:0;padding-left:18px;"></ul></div>' +
      '</div>' +
      '<h2>Word problems</h2><div class="card">' +
      '<p class="info">Short story problems for the Word problems game. Each one needs a question, a number answer, and a level.</p>' +
      '<div id="setup-word-problems"></div>' +
      '<button id="setup-add-word-problem" class="secondary">+ Add word problem</button></div>' +
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
      window.KidsLibrary.mount({ subject: 'math', slug: SLUG, creds: staffCreds, container: libBox, onAdded: function () { openSetup(); } });
    }
    /* Add-ons section: the ☰ menu, the details panel and the
       active list (see renderAddonsSection). Replaces the old
       one-line-per-add-on Setup lines and the Chats card — the
       chat inbox now lives inside the Live Chat details panel. */
    renderAddonsSection();
    /* Students go live at once — no draft, no approval. The RPC
       writes the new list into BOTH live_data and draft_data, so a
       later draft save/upload (collectDraft reads draft.students)
       can never revert it. PINs are untouched by the RPC and still
       flow through the draft. On success both in-memory copies are
       refreshed from the saved list. */
    function saveStudentsLive(next, out, done) {
      if (out) out.innerHTML = '<p class="info">Saving…</p>';
      rpc('set_kids_math_students', { p_slug: SLUG, p_u: staffCreds.u, p_p: staffCreds.p, p_students: next }).then(function (ok) {
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
      rpc('set_kids_math_student_pins', { p_slug: SLUG, p_u: staffCreds.u, p_p: staffCreds.p, p_pins: pins }).then(function (ok) {
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
      var list = $('setup-students');
      if (!draft.students.length) {
        list.innerHTML = '<p class="info">No students yet — add the first one below.</p>';
        return;
      }
      var h = '';
      draft.students.forEach(function (name, i) {
        if (delStudentIdx === i) {
          h += '<div class="student-row"><span><strong>' + esc(name) + '</strong> — remove this student?</span>' +
            '<button class="small danger" data-student-del-yes="' + i + '">Yes, remove</button> ' +
            '<button class="small secondary" data-student-del-no>Keep</button></div>';
        } else {
          /* PIN: 4 digits, optional. A student with no PIN plays
             without one, exactly as before. */
          h += '<div class="student-row"><span>' + esc(name) + '</span>' +
            '<input type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="PIN — optional" data-student-pin="' + i + '" value="' + esc((draft.student_pins[name]) || '') + '">' +
            '<button class="small danger" data-remove-student="' + i + '">Remove</button></div>';
        }
      });
      list.innerHTML = h;
      list.querySelectorAll('[data-student-pin]').forEach(function (input) {
        input.addEventListener('input', function () {
          var v = input.value.replace(/\D/g, '').slice(0, 4);
          input.value = v;
          var name = draft.students[Number(input.getAttribute('data-student-pin'))];
          if (!name) return;
          if (v) draft.student_pins[name] = v; else delete draft.student_pins[name];
        });
        input.addEventListener('change', savePinsLive);
      });
      list.querySelectorAll('[data-remove-student]').forEach(function (btn) {
        btn.addEventListener('click', function () { delStudentIdx = Number(btn.getAttribute('data-remove-student')); drawStudents(); });
      });
      list.querySelectorAll('[data-student-del-no]').forEach(function (btn) {
        btn.addEventListener('click', function () { delStudentIdx = null; drawStudents(); });
      });
      list.querySelectorAll('[data-student-del-yes]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = Number(btn.getAttribute('data-student-del-yes'));
          var nm = draft.students[idx];
          var next = draft.students.slice();
          next.splice(idx, 1);
          /* Removing a student also goes live at once via the RPC. */
          saveStudentsLive(next, $('setup-student-out'), function () {
            if (nm) delete draft.student_pins[nm];
            delStudentIdx = null;
            drawStudents();
            var out = $('setup-student-out');
            if (out) out.innerHTML = '<p class="info">Student removed — live right away. ✅</p>';
          });
        });
      });
    }
    drawStudents();
    $('setup-add-student').addEventListener('click', function () {
      var input = $('setup-new-student');
      var out = $('setup-student-out');
      var name = input.value.trim();
      if (!name) { out.innerHTML = '<p class="error">Type a name first.</p>'; return; }
      if (draft.students.indexOf(name) !== -1) { out.innerHTML = '<p class="error">That name is already on the list.</p>'; return; }
      if (draft.students.length >= studentLimit) { out.innerHTML = '<p class="error">You are at your limit of ' + studentLimit + ' students. <a href="/?add=kids-extra-math&slug=' + encodeURIComponent(SLUG) + '">Add extra students</a> for $1/month each — free for the rest of this month.</p>'; return; }
      /* Adding a student goes live at once via the RPC — no draft,
         no approval. */
      saveStudentsLive(draft.students.concat([name]), out, function () {
        input.value = '';
        out.innerHTML = '<p class="info">Student added — live right away. ✅</p>';
      });
    });
    /* Word problems: one card per problem — question, number answer
       and level — following the same row pattern as the word list in
       the language apps. Edits write straight into draft, exactly
       like the student list above. */
    var wpEl = $('setup-word-problems');
    function wordProblemRow(item, i) {
      var row = document.createElement('div');
      row.className = 'card';
      row.innerHTML =
        '<label>Question</label><input data-f="q" type="text" value="' + esc(item.q || '') + '" placeholder="Sara has 3 apples and buys 2 more. How many apples does she have?">' +
        '<label>Answer (a number)</label><input data-f="answer" type="number" value="' + esc(item.answer == null ? '' : item.answer) + '">' +
        '<label>Level</label><select data-f="level">' +
        '<option value="Easy"' + (item.level === 'Easy' ? ' selected' : '') + '>Easy</option>' +
        '<option value="Medium"' + (item.level === 'Medium' ? ' selected' : '') + '>Medium</option>' +
        '<option value="Hard"' + (item.level === 'Hard' ? ' selected' : '') + '>Hard</option>' +
        '</select>' +
        '<button class="small danger" data-remove="' + i + '">Remove word problem</button>';
      row.querySelectorAll('[data-f]').forEach(function (input) {
        function sync() { item[input.getAttribute('data-f')] = input.value; }
        input.addEventListener('input', sync);
        input.addEventListener('change', sync);
      });
      row.querySelector('[data-remove]').addEventListener('click', function () {
        draft.wordProblems.splice(i, 1);
        drawWordProblems();
      });
      return row;
    }
    function drawWordProblems() {
      wpEl.innerHTML = '';
      if (!draft.wordProblems.length) {
        wpEl.innerHTML = '<p class="info">No word problems yet — add the first one below, or add a ready-made level from the content library further down.</p>';
        return;
      }
      draft.wordProblems.forEach(function (item, i) { wpEl.appendChild(wordProblemRow(item, i)); });
    }
    drawWordProblems();
    $('setup-add-word-problem').addEventListener('click', function () {
      draft.wordProblems.push({ q: '', answer: '', level: 'Easy' });
      drawWordProblems();
    });
    function collectDraft() {
      var qpr = Number($('setup-qpr').value);
      if (!qpr || qpr < 1) qpr = 10;
      if (qpr > 50) qpr = 50;
      /* PINs are pruned to current students and to exactly 4 digits,
         or Setup would silently save a half-typed PIN. Students come
         from draft.students, which the live student RPC keeps in sync
         — a later save/upload therefore never reverts a student change. */
      var pins = {};
      Object.keys(draft.student_pins || {}).forEach(function (nm) {
        if (draft.students.indexOf(nm) !== -1 && /^\d{4}$/.test(draft.student_pins[nm])) pins[nm] = draft.student_pins[nm];
      });
      return {
        name: $('setup-name').value.trim() || draft.name,
        about: $('setup-about').value,
        students: draft.students.filter(function (n) { return String(n).trim() !== ''; }),
        student_pins: pins,
        wordProblems: draft.wordProblems.filter(function (wp) { return wp && String(wp.q || '').trim() !== ''; }).map(function (wp) {
          var lv = String(wp.level || 'Easy');
          if (lv !== 'Easy' && lv !== 'Medium' && lv !== 'Hard') lv = 'Easy';
          return { q: String(wp.q).trim(), answer: Number(wp.answer) || 0, level: lv };
        }),
        questionsPerRound: qpr
      };
    }
    $('setup-save').addEventListener('click', function () {
      var out = $('setup-out');
      out.innerHTML = '<p class="info">Saving…</p>';
      var d = collectDraft();
      rpc('save_kids_math_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p, p_draft: d }).then(function () {
        draft = d;
        draftStatus = 'editing';
        out.innerHTML = '<p class="info">Draft saved. Children still see the approved version.</p>';
      }).catch(function (err) {
        out.innerHTML = '<p class="error">Could not save: ' + esc(err.message) + '</p>';
      });
    });
    $('setup-upload').addEventListener('click', function () {
      var out = $('setup-out');
      out.innerHTML = '<p class="info">Uploading…</p>';
      var d = collectDraft();
      rpc('submit_kids_math_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p, p_draft: d }).then(function () {
        draft = d;
        draftStatus = directUploadOn ? 'approved' : 'pending';
        notifyEmail((directUploadOn ? 'Kids Math upload — live right away: ' : 'Kids Math draft for approval: ') + (d.name || SLUG), { school: d.name || '', slug: SLUG, status: directUploadOn ? 'Live right away — no approval needed' : undefined });
        out.innerHTML = '<p class="info">' + (directUploadOn ? 'Uploaded! Your changes are live right away. ✅' : 'Uploaded! Your changes were sent to Yently and are waiting for approval. We will confirm once they are live. You will get your own private link by email.') + '</p>';
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
  /* Black ↑ Top pill at the bottom-left, exactly like the other
     folder apps: always visible, tap it to jump back to the top. */
  var toTop = $('to-top');
  if (toTop) {
    toTop.addEventListener('click', function () { window.scrollTo(0, 0); });
  }
  if (!SLUG) {
    $('site-name').textContent = 'School not found';
    $('view-play').innerHTML = '<div class="error">This link doesn\'t point to a school. Check the link and try again — ask Yently for your school link.</div>';
  } else {
    resolveSlug().then(function () { return rpc('get_kids_math_live', { p_slug: SLUG }); }).then(function (json) {
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
        window.ShopChat.mountBubble(chatBox, { ownerType: 'kids-math', ownerKey: SLUG, shopName: data.name || 'Kids Math', ownerEmail: '' });
      }
      data.students = data.students || [];
      data.wordProblems = data.wordProblems || [];
      if (!data.questionsPerRound) data.questionsPerRound = 10;
      document.title = data.name || 'Kids Math';
      var logo = $('site-logo');
      if (data.logo) { logo.src = (/^https?:\/\//.test(data.logo) ? data.logo : BASE + data.logo); logo.hidden = false; }
      $('site-name').textContent = data.name || 'Kids Math';
      $('site-about').textContent = data.about || '';
      var foot = [];
      if (data.about) foot.push(esc(data.about));
      var firstLine = foot.join(' · ');
      $('site-footer').innerHTML = (firstLine ? '<div>' + firstLine + '</div>' : '') +
        '<div>Powered by Yently</div>';
      rpc('kids_math_pass_status', { p_slug: SLUG }).then(function (s) {
        teacherUnlocked = !(s && s.has_pass === true);
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
