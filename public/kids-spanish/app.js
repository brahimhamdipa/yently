/* Kids Spanish — one folder for every school.
   Spanish vocabulary games for kids. The school comes from its own
   private link, and its name, students and word list live in the
   database — there is no data.json file here. Visitors always see
   the last APPROVED word list.
   Play is public: a child picks their name, picks a game, and plays
   10 rounds. Scores are saved so the teacher can see each student's
   progress. The Teacher tab needs the school's shared teacher
   password (one password for everybody, set by the admin; schools
   with none set stay fully open). Setup needs the owner's own
   username + password: edits save as a draft, and the Upload button
   sends the draft to the admin for approval. Approval makes the
   draft live instantly — no file swap, no redeploy wait. Student names are the exception: adding or removing a student goes live at once, up to the school's student limit (3 included + paid extra kids).
   All credentials live in memory only: a reload asks again. */
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
    // system's own folder name, so a bare /kids-spanish visit still
    // shows "not found" by design.
    var segs = location.pathname.split('/').filter(function (s) { return s; });
    var lastSeg = (segs[segs.length - 1] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    if (lastSeg && lastSeg !== 'kids-spanish') { SLUG = lastSeg; SLUG_FROM_PATH = true; }
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
  var STUDENT_KEY = 'kids-spanish-student-' + SLUG;

  /* Public by design: the same publishable key the main Yently site ships
     in its own pages. Used only for the database calls below. */
  var SUPABASE_URL = 'https://deykvlxikzwwrygmkdly.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_e2uwGgFB0SvVQS-TZahArQ_mjypz9Vr';

  var data = null; // live school info + word list (visitors)
  var draft = null; // owner draft (Setup)
  var draftStatus = 'editing';
  /* Direct Upload: when Yently has switched it on for this shop,
     an upload goes live straight away instead of waiting for
     approval. Checked once when Setup opens and cached for the
     session; any failure leaves it off, so the old wording stays. */
  var directUploadOn = false;
  var studentLimit = 3; // students included in the plan (3) + paid extra kids; fetched in openSetup, falls back to 3
  var staffCreds = null; // {u, p} in memory only, never stored
  var teacherPass = null; // teacher password in memory only, never stored
  var teacherUnlocked = false; // true once the teacher password is entered, or when the school has none set
  var currentView = 'play';

  /* ---------- Play state ---------- */
  var player = ''; // chosen student name
  var playerPin = ''; // verified PIN for the current student, session only, never stored
  var pinName = ''; // student awaiting PIN entry on the picker
  var delStudentIdx = null; // Setup: student index awaiting an in-page delete confirmation
  var delScoreId = null; // teacher scores: score id awaiting an in-page delete confirmation
  var delScoreErr = ''; // teacher scores: delete error to show on the next list render
  var game = null; // 'spell' | 'pick' | 'meaning'
  var rounds = []; // the 10 words for this game, shuffled
  var roundIdx = 0;
  var score = 0;
  var answered = false; // true once the current round has been answered
  var lastAnswer = null; // { correct, picked, right } for the feedback line

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
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
        body: JSON.stringify({ subject: subject, table: 'kids_spanish_draft', record: record })
      }).catch(function () {});
    } catch (e) {}
  }
  /* Accents accepted with or without: "árbol" and "arbol" both count.
     Lowercase, split off accents (á → a, ñ → n), trim, collapse spaces. */
  function normalize(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function words() { return (data && data.words) || []; }
  function students() { return (data && data.students) || []; }

  var PRAISE = ['Great job! 🎉', 'Well done! ⭐', 'Awesome! 🌟', 'You did it! 👏', 'Brilliant! 😄', 'Keep going! 💪'];
  var TRY_AGAIN = ['Good try! 👍', 'Almost — you will get the next one! 💪', 'Nice effort! 🌟', 'Keep trying! 😊'];
  function praise() { return PRAISE[Math.floor(Math.random() * PRAISE.length)]; }
  function tryAgain() { return TRY_AGAIN[Math.floor(Math.random() * TRY_AGAIN.length)]; }

  function loadPlayer() {
    try { player = localStorage.getItem(STUDENT_KEY) || ''; } catch (e) { player = ''; }
    if (player && students().indexOf(player) === -1) player = '';
    /* A stored name that now has a PIN must re-enter it: never
       auto-select a PIN student from localStorage. */
    if (player && (data && data.pin_students || []).indexOf(player) !== -1) {
      player = '';
      try { localStorage.removeItem(STUDENT_KEY); } catch (e) {}
    }
  }
  function savePlayer() {
    try { localStorage.setItem(STUDENT_KEY, player); } catch (e) {}
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

  /* ---------- Play ---------- */
  function gameTitle(g) {
    if (g === 'spell') return 'Spell it';
    if (g === 'pick') return 'Pick the word';
    return 'What does it mean?';
  }
  function renderPlay() {
    var el = $('view-play');
    if (!data) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (game) { renderRound(); return; }
    var html = '';
    if (!player) {
      html += '<h2>Who is playing? 👋</h2><div class="card"><p class="info">Tap your name to start playing!</p>';
      if (!students().length) {
        html += '<p class="info">No students yet — ask your teacher to add names in Setup.</p>';
      } else {
        html += '<div class="choice-grid">';
        students().forEach(function (name) {
          html += '<button class="big-choice" data-student="' + esc(name) + '">' + esc(name) + '</button>';
        });
        html += '</div>';
      }
      html += '</div>';
      /* PIN gate: a student with a PIN set must enter it before
         playing. The prompt is in-page, never a native prompt(). */
      if (pinName) {
        html += '<div class="card"><h2>🔒 Enter your PIN</h2>' +
          '<p class="info">Enter ' + esc(pinName) + '\'s 4-digit PIN to play:</p>' +
          '<label>PIN</label><input id="pin-input" type="password" inputmode="numeric" maxlength="4" autocomplete="off">' +
          '<div class="row"><button id="pin-ok" class="big-btn">OK</button><button id="pin-cancel" class="secondary">Cancel</button></div>' +
          '<div id="pin-out" style="margin-top:12px"></div></div>';
      }
    } else {
      html += '<h2>Hi, ' + esc(player) + '! 👋</h2>' +
        '<div class="card"><p class="info">Pick a game — 10 rounds each. Good luck!</p>' +
        '<div class="game-grid">' +
        '<button class="game-card" data-game="spell"><span class="game-emoji">✏️</span><span class="game-name">Spell it</span><span class="game-desc">See the English word, type the Spanish word.</span></button>' +
        '<button class="game-card" data-game="pick"><span class="game-emoji">🔤</span><span class="game-name">Pick the word</span><span class="game-desc">See the English word, pick the right Spanish word.</span></button>' +
        '<button class="game-card" data-game="meaning"><span class="game-emoji">💬</span><span class="game-name">What does it mean?</span><span class="game-desc">See the Spanish word, pick the right English meaning.</span></button>' +
        '</div>' +
        '<p class="info">Not ' + esc(player) + '? <button class="small secondary" id="sign-out">Sign out</button></p></div>';
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-student]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-student');
        /* A student with a PIN set must enter it first. */
        if ((data.pin_students || []).indexOf(name) !== -1) {
          pinName = name;
          renderPlay();
          return;
        }
        player = name;
        playerPin = '';
        pinName = '';
        savePlayer();
        renderPlay();
      });
    });
    wirePinBox();
    el.querySelectorAll('[data-game]').forEach(function (btn) {
      btn.addEventListener('click', function () { startGame(btn.getAttribute('data-game')); });
    });
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
      rpc('check_kids_spanish_student_pin', { p_slug: SLUG, p_student_name: pinName, p_pin: pin }).then(function (ok) {
        if (ok === true) {
          player = pinName;
          playerPin = pin;
          pinName = '';
          savePlayer();
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
    var list = shuffle(words());
    if (list.length < 4) {
      $('view-play').innerHTML = '<h2>' + esc(gameTitle(g)) + '</h2><div class="card"><p class="info">Not enough words yet to play — this school needs at least 4 words. Ask your teacher to add some in Setup.</p><button class="secondary" id="back-games">Back to games</button></div>';
      $('back-games').addEventListener('click', function () { game = null; renderPlay(); });
      return;
    }
    game = g;
    /* 10 rounds: cycle the shuffled words if there are fewer than 10. */
    rounds = [];
    for (var i = 0; i < 10; i++) rounds.push(list[i % list.length]);
    roundIdx = 0;
    score = 0;
    answered = false;
    lastAnswer = null;
    renderRound();
  }
  function choicesFor(right, field) {
    var others = shuffle(words().filter(function (w) { return w[field] !== right[field]; }));
    var picks = [right];
    for (var i = 0; i < others.length && picks.length < 4; i++) picks.push(others[i]);
    return shuffle(picks);
  }
  function renderRound() {
    var el = $('view-play');
    if (roundIdx >= rounds.length) { renderResult(); return; }
    var w = rounds[roundIdx];
    var html = '<div class="score-bar"><span>Round ' + (roundIdx + 1) + ' of ' + rounds.length + '</span><span>⭐ ' + score + ' correct</span><span>' + esc(player) + '</span></div>' +
      '<h2>' + esc(gameTitle(game)) + '</h2>';
    if (game === 'spell') {
      html += '<div class="card question"><p class="info">How do you say this in Spanish?</p>' +
        '<div class="big-word">' + esc(w.meaning) + '</div>' +
        '<input id="spell-input" type="text" placeholder="Type the Spanish word…" autocomplete="off" autocapitalize="off">' +
        '<button id="spell-check" class="big-btn">Check ✅</button>' +
        '<div id="round-out" style="margin-top:12px"></div></div>';
    } else if (game === 'pick') {
      html += '<div class="card question"><p class="info">Which Spanish word means this?</p>' +
        '<div class="big-word">' + esc(w.meaning) + '</div><div class="choice-grid">';
      choicesFor(w, 'word').forEach(function (c) {
        html += '<button class="big-choice" data-choice="' + esc(c.word) + '">' + esc(c.word) + '</button>';
      });
      html += '</div><div id="round-out" style="margin-top:12px"></div></div>';
    } else {
      html += '<div class="card question"><p class="info">What does this Spanish word mean?</p>' +
        '<div class="big-word">' + esc(w.word) + '</div><div class="choice-grid">';
      choicesFor(w, 'meaning').forEach(function (c) {
        html += '<button class="big-choice" data-choice="' + esc(c.meaning) + '">' + esc(c.meaning) + '</button>';
      });
      html += '</div><div id="round-out" style="margin-top:12px"></div></div>';
    }
    el.innerHTML = html;
    if (game === 'spell') {
      var input = $('spell-input');
      input.focus();
      $('spell-check').addEventListener('click', function () { answerSpell(input.value); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') answerSpell(input.value);
      });
    } else {
      el.querySelectorAll('[data-choice]').forEach(function (btn) {
        btn.addEventListener('click', function () { answerChoice(btn.getAttribute('data-choice')); });
      });
    }
    if (answered && lastAnswer) paintFeedback();
  }
  function feedbackHtml() {
    if (!lastAnswer) return '';
    var w = rounds[roundIdx];
    var h;
    if (lastAnswer.correct) {
      h = '<div class="note good">' + esc(praise()) + ' 🎉</div>';
    } else {
      h = '<div class="note bad">' + esc(tryAgain()) + ' The right answer is <b>' + esc(w.word) + '</b> — ' + esc(w.meaning) + '.</div>';
    }
    h += '<button id="next-round" class="big-btn">' + (roundIdx + 1 >= rounds.length ? 'See my score! 🏆' : 'Next 👉') + '</button>';
    return h;
  }
  function paintFeedback() {
    var bar = $('view-play').querySelector('.score-bar');
    if (bar) {
      var spans = bar.querySelectorAll('span');
      if (spans[1]) spans[1].textContent = '⭐ ' + score + ' correct';
    }
    var out = $('round-out');
    if (!out) return;
    out.innerHTML = feedbackHtml();
    var next = $('next-round');
    if (next) next.addEventListener('click', function () {
      roundIdx++;
      answered = false;
      lastAnswer = null;
      renderRound();
    });
    /* Disable the round's inputs so the answer cannot be changed. */
    var input = $('spell-input');
    if (input) input.disabled = true;
    var btn = $('spell-check');
    if (btn) btn.disabled = true;
    document.querySelectorAll('#view-play [data-choice]').forEach(function (b) {
      b.disabled = true;
      if (game === 'pick' && normalize(b.getAttribute('data-choice')) === normalize(rounds[roundIdx].word)) b.classList.add('correct');
      if (game === 'meaning' && normalize(b.getAttribute('data-choice')) === normalize(rounds[roundIdx].meaning)) b.classList.add('correct');
      if (lastAnswer && !lastAnswer.correct && b.getAttribute('data-choice') === lastAnswer.picked) b.classList.add('wrong');
    });
  }
  function answerSpell(typed) {
    if (answered) return;
    answered = true;
    var ok = normalize(typed) === normalize(rounds[roundIdx].word);
    if (ok) score++;
    lastAnswer = { correct: ok, picked: typed };
    paintFeedback();
  }
  function answerChoice(picked) {
    if (answered) return;
    answered = true;
    var right = game === 'pick' ? rounds[roundIdx].word : rounds[roundIdx].meaning;
    var ok = normalize(picked) === normalize(right);
    if (ok) score++;
    lastAnswer = { correct: ok, picked: picked };
    paintFeedback();
  }
  function renderResult() {
    var el = $('view-play');
    var total = rounds.length;
    var msg = score === total ? 'Perfect score! You are a Spanish star! 🌟🏆'
      : score >= 7 ? 'Great work, ' + player + '! You know a lot of Spanish! 😄'
      : score >= 4 ? 'Good job, ' + player + '! Keep practicing! 👍'
      : 'Good try, ' + player + '! Play again and you will get better! 💪';
    el.innerHTML = '<h2>Your score 🏆</h2><div class="card result">' +
      '<div class="big-score">' + score + ' / ' + total + '</div>' +
      '<p class="info">' + esc(msg) + '</p>' +
      '<p class="info" id="save-out">Saving your score…</p>' +
      '<div class="row"><button id="play-again" class="big-btn">Play again 🔄</button>' +
      '<button id="other-game" class="big-btn secondary">Other games</button></div></div>';
    $('play-again').addEventListener('click', function () { startGame(game); });
    $('other-game').addEventListener('click', function () { game = null; renderPlay(); });
    rpc('record_kids_spanish_score', { p_slug: SLUG, p_student_name: player, p_game: gameTitle(game), p_level: 'easy', p_score: score, p_total: total, p_pin: playerPin || '' }).then(function () {
      var out = $('save-out');
      if (out) out.textContent = 'Score saved — your teacher can see it. 🎉';
    }).catch(function () {
      var out = $('save-out');
      if (out) out.textContent = 'Your score is ' + score + ' out of ' + total + '. (It could not be saved this time — try again later.)';
    });
  }

  /* ---------- Teacher (shared teacher password) ---------- */
  /* The scores table needs the school's shared teacher password —
     one password for everybody, set by the admin. Nothing is stored:
     a reload asks again. Schools with no password set skip this
     entirely (teacherUnlocked starts true for them, see the start
     block). */
  function renderTeacherPrompt(el, after) {
    el.innerHTML = '<h2>Teacher</h2><div class="card">' +
      '<p class="info">Enter the teacher password for this school to see the students\' scores.</p>' +
      '<label>Teacher password</label><input id="teacher-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="teacher-go" class="big-btn">Unlock</button></div>' +
      '<div id="teacher-out" style="margin-top:12px"></div></div>';
    $('teacher-go').addEventListener('click', function () {
      var out = $('teacher-out');
      var p = $('teacher-pass').value;
      out.innerHTML = '<p class="info">Checking…</p>';
      rpc('check_kids_spanish_teacher_pass', { p_slug: SLUG, p_password: p }).then(function (ok) {
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
  function needTeacher(el) {
    if (teacherUnlocked) return false;
    renderTeacherPrompt(el, function () { openTeacher(); });
    return true;
  }
  function openTeacher() {
    var el = $('view-teacher');
    if (needTeacher(el)) return;
    el.innerHTML = '<h2>Teacher — Scores</h2><div class="card"><p class="info">Loading scores…</p></div>';
    rpc('list_kids_spanish_scores', { p_slug: SLUG, p_epass: teacherPass }).then(function (rows) {
      var list = rows || [];
      var html = '<h2>Teacher — Scores</h2>';
      if (delScoreErr) {
        html += '<div class="card"><p class="error">Could not delete score: ' + esc(delScoreErr) + '</p></div>';
        delScoreErr = '';
      }
      if (!list.length) {
        html += '<div class="card"><p class="info">No scores yet. Once a student finishes a game, their score shows here.</p></div>';
        el.innerHTML = html;
        return;
      }
      html += '<p class="info">Newest first. Each row is one finished game.</p><div class="card"><table class="scores"><thead><tr><th>Student</th><th>Game</th><th>Score</th><th>Date</th><th></th></tr></thead><tbody>';
      list.forEach(function (r) {
        var delHtml;
        if (delScoreId === r.id) {
          delHtml = '<span>Delete this score?</span> <button class="small danger" data-score-del-yes="' + r.id + '">Yes</button> <button class="small secondary" data-score-del-no>Keep</button>';
        } else {
          delHtml = '<button class="small danger" data-score-del="' + r.id + '">Delete</button>';
        }
        html += '<tr><td>' + esc(r.student_name) + '</td><td>' + esc(r.game) + '</td><td><b>' + esc(r.score) + ' / ' + esc(r.total) + '</b></td><td>' + esc(new Date(r.created_at).toLocaleString()) + '</td><td>' + delHtml + '</td></tr>';
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
          rpc('delete_kids_spanish_score', { p_slug: SLUG, p_epass: teacherPass || '', p_score_id: id }).then(function () {
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

  /* ---------- Setup (owner login only: draft + Upload for approval) ---------- */
  function renderStaffLogin(el, heading, after) {
    el.innerHTML = '<h2>' + heading + '</h2><div class="card">' +
      '<p class="info">Enter the username and password Yently gave this school.</p>' +
      '<label>Username</label><input id="st-user" type="text" autocomplete="username">' +
      '<label>Password</label><input id="st-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="st-go" class="big-btn">Sign in</button></div>' +
      '<div id="st-out" style="margin-top:12px"></div></div>';
    $('st-go').addEventListener('click', function () {
      var out = $('st-out');
      var u = $('st-user').value.trim();
      var p = $('st-pass').value;
      out.innerHTML = '<p class="info">Checking…</p>';
      rpc('check_kids_spanish_login', { p_slug: SLUG, p_username: u, p_password: p }).then(function (ok) {
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
  function staffUnlocked() { return !!staffCreds; }
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
    rpc('get_kids_spanish_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p }).then(function (res) {
      draft = res.data || {};
      draft.students = draft.students || [];
      draft.student_pins = draft.student_pins || {};
      draft.words = draft.words || [];
      draftStatus = res.status || 'editing';
      /* Student limit: 3 included + paid extra kids. Fetched fresh
         each time Setup opens; falls back to 3 if unavailable. */
      return rpc('kids_spanish_student_limit', { p_slug: SLUG }).then(function (limit) {
        if (typeof limit === 'number' && isFinite(limit) && limit >= 3) studentLimit = limit;
      }).catch(function () {});
    }).then(function () {
      /* Direct Upload switch: see the note by directUploadOn. */
      return rpc('direct_upload_enabled', { p_owner_type: 'kids-spanish', p_owner_key: SLUG }).then(function (on) {
        directUploadOn = (on === true);
      }).catch(function () { directUploadOn = false; });
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
      '</div>' +
      '<h2>Students</h2><div class="card"><p class="info">Children pick their name from this list before playing.</p>' +
      '<p class="info" id="setup-student-count"></p>' +
      '<div id="setup-students"></div>' +
      '<div class="row"><input id="setup-new-student" type="text" placeholder="New student name…"><button id="setup-add-student" class="secondary">+ Add student</button></div><div id="setup-student-out" style="margin-top:8px"></div></div>' +
      '<h2>Words</h2><div class="card"><p class="info">Each word has a Spanish word and its English meaning. At least 4 words are needed to play the games.</p>' +
      '<div id="setup-words"></div>' +
      '<button id="setup-add-word" class="secondary">+ Add word</button></div>' +
      '<div class="row" style="margin-top:16px"><button id="setup-save" class="secondary big-btn">Save draft</button>' +
      '<button id="setup-upload" class="big-btn">' + (directUploadOn ? 'Upload — goes live right away' : 'Upload for approval') + '</button></div>' +
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
      window.KidsLibrary.mount({ subject: 'spanish', slug: SLUG, creds: staffCreds, container: libBox, onAdded: function () { openSetup(); } });
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
        window.ShopChat.mountInbox(box, { ownerType: 'kids-spanish', ownerKey: SLUG, creds: { u: staffCreds.u, p: staffCreds.p } });
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
      rpc('set_kids_spanish_students', { p_slug: SLUG, p_u: staffCreds.u, p_p: staffCreds.p, p_students: next }).then(function (ok) {
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
      rpc('set_kids_spanish_student_pins', { p_slug: SLUG, p_u: staffCreds.u, p_p: staffCreds.p, p_pins: pins }).then(function (ok) {
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
         the limit — extra kids are bought at checkout. */
      var countEl = $('setup-student-count');
      if (countEl) {
        countEl.textContent = draft.students.length >= studentLimit
          ? 'Students: ' + draft.students.length + ' of ' + studentLimit + ' — at your limit. Need more students? Add extra kids at checkout — $1/month each.'
          : 'Students: ' + draft.students.length + ' of ' + studentLimit + ' — changes go live right away, no approval needed.';
      }
      var addBtn = $('setup-add-student');
      if (addBtn) addBtn.disabled = draft.students.length >= studentLimit;
      var newStudentInput = $('setup-new-student');
      if (newStudentInput) newStudentInput.disabled = draft.students.length >= studentLimit;
      studentsEl.innerHTML = '';
      if (!draft.students.length) studentsEl.innerHTML = '<p class="info">No students yet.</p>';
      draft.students.forEach(function (name, i) {
        var row = document.createElement('div');
        row.className = 'student-row';
        if (delStudentIdx === i) {
          row.innerHTML = '<span><strong>' + esc(name) + '</strong> — remove this student?</span>' +
            '<span><button class="small danger" data-student-del-yes="' + i + '">Yes, remove</button> ' +
            '<button class="small secondary" data-student-del-no>Keep</button></span>';
        } else {
          /* PIN: 4 digits, optional. A student with no PIN plays
             without one, exactly as before. */
          row.innerHTML = '<span>' + esc(name) + '</span>' +
            '<input type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="PIN — optional" data-student-pin="' + i + '" value="' + esc((draft.student_pins[name]) || '') + '">' +
            '<button class="small danger" data-student-del="' + i + '">Remove</button>';
        }
        studentsEl.appendChild(row);
      });
      studentsEl.querySelectorAll('[data-student-pin]').forEach(function (input) {
        input.addEventListener('input', function () {
          var v = input.value.replace(/\D/g, '').slice(0, 4);
          input.value = v;
          var name = draft.students[Number(input.getAttribute('data-student-pin'))];
          if (!name) return;
          if (v) draft.student_pins[name] = v; else delete draft.student_pins[name];
        });
        input.addEventListener('change', savePinsLive);
      });
      studentsEl.querySelectorAll('[data-student-del]').forEach(function (b) {
        b.addEventListener('click', function () { delStudentIdx = Number(b.getAttribute('data-student-del')); drawStudents(); });
      });
      studentsEl.querySelectorAll('[data-student-del-no]').forEach(function (b) {
        b.addEventListener('click', function () { delStudentIdx = null; drawStudents(); });
      });
      studentsEl.querySelectorAll('[data-student-del-yes]').forEach(function (b) {
        b.addEventListener('click', function () {
          var idx = Number(b.getAttribute('data-student-del-yes'));
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
      var v = $('setup-new-student').value.trim();
      var out = $('setup-student-out');
      if (!v) return;
      if (draft.students.indexOf(v) !== -1) { out.innerHTML = '<p class="error">That name is already on the list.</p>'; return; }
      if (draft.students.length >= studentLimit) { out.innerHTML = '<p class="error">You are at your limit of ' + studentLimit + ' students. Add extra kids at checkout — $1/month each.</p>'; return; }
      /* Adding a student goes live at once via the RPC — no draft,
         no approval. */
      saveStudentsLive(draft.students.concat([v]), out, function () {
        $('setup-new-student').value = '';
        out.innerHTML = '<p class="info">Student added — live right away. ✅</p>';
      });
    });
    var wordsEl = $('setup-words');
    function drawWords() {
      wordsEl.innerHTML = '';
      if (!draft.words.length) wordsEl.innerHTML = '<p class="info">No words yet.</p>';
      draft.words.forEach(function (w, i) {
        var row = document.createElement('div');
        row.className = 'card word-row';
        row.innerHTML =
          '<label>Spanish word</label><input data-f="word" value="' + esc(w.word) + '">' +
          '<label>English meaning</label><input data-f="meaning" value="' + esc(w.meaning) + '">' +
          '<button class="small danger" data-remove-word="' + i + '">Remove word</button>';
        row.querySelectorAll('[data-f]').forEach(function (input) {
          input.addEventListener('input', function () {
            w[input.getAttribute('data-f')] = input.value;
          });
        });
        row.querySelector('[data-remove-word]').addEventListener('click', function () {
          draft.words.splice(i, 1);
          drawWords();
        });
        wordsEl.appendChild(row);
      });
    }
    drawWords();
    $('setup-add-word').addEventListener('click', function () {
      draft.words.push({ word: '', meaning: '' });
      drawWords();
    });
    /* collectDraft must include EVERY editable field — anything left
       out here is silently dropped when the owner saves. PINs are
       pruned to current students and to exactly 4 digits. Students
       come from draft.students, which the live student RPC keeps in
       sync — a later save/upload never reverts a student change. */
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
        words: draft.words.filter(function (w) { return String(w.word || '').trim() !== '' && String(w.meaning || '').trim() !== ''; })
          .map(function (w) { return { word: String(w.word).trim(), meaning: String(w.meaning).trim() }; })
      };
    }
    $('setup-save').addEventListener('click', function () {
      var out = $('setup-out');
      out.innerHTML = '<p class="info">Saving…</p>';
      var d = collectDraft();
      rpc('save_kids_spanish_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p, p_draft: d }).then(function () {
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
      rpc('submit_kids_spanish_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p, p_draft: d }).then(function () {
        draft = d;
        draftStatus = directUploadOn ? 'approved' : 'pending';
        notifyEmail('Kids Spanish draft for approval: ' + (d.name || SLUG), { school: d.name || '', slug: SLUG });
        out.innerHTML = '<p class="info">' + (directUploadOn ? 'Uploaded! Your changes are live right away. ✅' : 'Uploaded! Your changes were sent to Yently and are waiting for approval. We will email you once they are live.') + '</p>';
      }).catch(function (err) {
        out.innerHTML = '<p class="error">Could not upload: ' + esc(err.message) + '</p>';
      });
    });
  }

  /* ---------- Start ---------- */
  document.querySelectorAll('#tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () { show(btn.getAttribute('data-view')); });
  });
  var toTop = $('to-top');
  if (toTop) {
    toTop.addEventListener('click', function () { window.scrollTo(0, 0); });
  }
  if (!SLUG) {
    $('site-name').textContent = 'School not found';
    $('view-play').innerHTML = '<div class="error">This link doesn\'t point to a school. Check the link and try again — ask Yently for your school link.</div>';
  } else {
    resolveSlug().then(function () { return rpc('get_kids_spanish_live', { p_slug: SLUG }); }).then(function (json) {
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
        window.ShopChat.mountBubble(chatBox, { ownerType: 'kids-spanish', ownerKey: SLUG, shopName: data.name || 'Kids Spanish', ownerEmail: '' });
      }
      data.students = data.students || [];
      data.words = data.words || [];
      document.title = data.name || 'Kids Spanish';
      $('site-name').textContent = data.name || 'Kids Spanish';
      $('site-about').textContent = data.about || '';
      $('site-footer').innerHTML = '<div>Powered by Yently</div>';
      loadPlayer();
      rpc('kids_spanish_pass_status', { p_slug: SLUG }).then(function (s) {
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
