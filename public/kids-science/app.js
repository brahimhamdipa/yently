/* Kids Science page app — ONE folder for every school.
   The school comes from its own private link, and its name, students,
   topics, facts and quiz questions live in the database — there is no
   data.json file here. Visitors see the last APPROVED content. The
   owner logs in with the username + password the admin created for
   their school (that login is what Yently sells); Setup edits save
   as a draft, and the Upload button sends the draft to the admin for
   approval. Approval makes the draft live instantly — no file swap,
   no redeploy wait. Student names are the exception: adding or removing a student goes live at once, up to the school's student limit (3 included + paid extra kids).
   Play is PUBLIC: a child picks their name from the student list,
   picks a topic and a level, then answers 5 quiz questions (4
   choices each). After each answer the page says whether it was
   right and shows a one-line fun fact; the score is shown at the
   end and saved for the teacher. The Teacher tab needs the
   school's shared teacher password (one password for everybody,
   set by the admin; schools with none set stay fully open) and
   shows every saved score so the teacher can see each student's
   progress. The password is checked on the server by the RPCs,
   not just in the page. A student with a 4-digit PIN set in Setup
   must enter it on the picker before playing; the PIN is checked
   on the server, kept only in a session variable, and never stored
   on the device. All credentials live in memory only: a
   reload asks again, exactly like the diner employee password. */
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
    // system's own folder name, so a bare /kids-science visit still
    // shows "not found" by design.
    var segs = location.pathname.split('/').filter(function (s) { return s; });
    var lastSeg = (segs[segs.length - 1] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    if (lastSeg && lastSeg !== 'kids-science') { SLUG = lastSeg; SLUG_FROM_PATH = true; }
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
  var STUDENT_KEY = 'kids-science-student-' + SLUG;

  /* Public by design: the same publishable key the main Yently site ships
     in its own pages. Used only for the database calls below. */
  var SUPABASE_URL = 'https://deykvlxikzwwrygmkdly.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_e2uwGgFB0SvVQS-TZahArQ_mjypz9Vr';

  var LEVELS = ['Easy', 'Medium', 'Hard'];
  var data = null; // live school content (visitors)
  var draft = null; // owner draft (Setup)
  var draftStatus = 'editing';
  /* Direct Upload: when Yently has switched it on for this shop,
     an upload goes live straight away instead of waiting for
     approval. Checked once when Setup opens and cached for the
     session; any failure leaves it off, so the old wording stays. */
  var directUploadOn = false;
  var studentLimit = 3; // students included in the plan (3) + paid extra kids; fetched in openSetup, falls back to 3
  var ownerCreds = null; // {u, p} in memory only, never stored
  var teacherPass = null; // teacher password in memory only, never stored
  var teacherUnlocked = false; // true once the teacher password is entered, or when the school has none set
  var currentView = 'play';
  // Play state.
  var playStudent = '';
  var playTopicId = '';
  var playLevel = '';
  var playFact = '';
  var quiz = []; // questions for this round
  var quizIdx = 0;
  var quizScore = 0;
  var quizAnswered = false;
  var quizSaved = false;
  var quizTopicLabel = '';
  // Setup state: which topic/question is awaiting an in-page removal.
  var removeTopicId = null;
  var removeQKey = null;
  var studentPin = ''; // verified PIN for the current student, session only, never stored
  var pinName = ''; // student awaiting PIN entry on the picker
  var delScoreId = null; // teacher scores: score id awaiting an in-page delete confirmation
  var delScoreErr = ''; // teacher scores: delete error to show on the next list render
  try { playStudent = localStorage.getItem(STUDENT_KEY) || ''; } catch (e) {}

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function topicById(id) {
    var list = (data && data.topics) || [];
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
    return null;
  }
  function rpc(name, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify(body)
    }).then(function (res) {
      /* Some calls (save/upload/record) return no body at all — read text
         first and only parse when there is something to parse, so an
         empty success reply is not mistaken for a failure. */
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
        body: JSON.stringify({ subject: subject, table: 'kids_science_draft', record: record })
      }).catch(function () {});
    } catch (e) {}
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
  /* Steps: pick your name, pick a topic, pick a level, then answer
     5 questions. The topic's own questions at the chosen level come
     first; if a topic has fewer than 5 at that level, the rest come
     from its other levels, so every round is always 5 questions. */
  function buildQuiz(topic, level) {
    var qs = topic.questions || [];
    var same = shuffle(qs.filter(function (q) { return q.level === level; }));
    var other = shuffle(qs.filter(function (q) { return q.level !== level; }));
    return shuffle(same.concat(other)).slice(0, 5);
  }
  function startQuiz() {
    var topic = topicById(playTopicId);
    if (!topic || !playStudent || !playLevel) return;
    quiz = buildQuiz(topic, playLevel);
    quizTopicLabel = topic.label;
    quizIdx = 0;
    quizScore = 0;
    quizAnswered = false;
    quizSaved = false;
    renderPlay();
  }
  function encouragement(score, total) {
    if (total > 0 && score === total) return 'Perfect! You are a science star! 🌟';
    if (score >= total - 1) return 'Great job! So close to perfect! 🎉';
    if (score >= 3) return 'Good work! Keep exploring! 🔬';
    if (score >= 2) return 'Nice try! Every scientist learns by trying. 🌱';
    return 'Good try! Play again and you will do even better! 💪';
  }
  function renderPlay() {
    var el = $('view-play');
    if (!data) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var students = data.students || [];
    var topics = data.topics || [];
    // A quiz is in progress (or finished): the quiz screen owns the view.
    if (quiz.length) { renderQuiz(el); return; }
    var html = '<h2>🔬 Play Science Quiz</h2>';
    if (!students.length) {
      html += '<div class="card"><p class="info">No students have been added yet. The teacher adds names in Setup.</p></div>';
      el.innerHTML = html;
      return;
    }
    // Step 1: who is playing?
    html += '<div class="card"><h3>1. Who is playing?</h3><div class="pick-grid">';
    students.forEach(function (name) {
      html += '<button data-student="' + esc(name) + '"' + (playStudent === name ? ' class="picked"' : '') + '>' + esc(name) + '</button>';
    });
    html += '</div></div>';
    /* Sign out: let the next child pick their own name (and enter
       their own PIN). Clears the session PIN too — nothing is
       stored on the device. */
    if (playStudent) {
      html += '<div class="row"><button id="sign-out" class="secondary">Sign out</button></div>';
    }
    /* PIN gate: a student with a PIN set must enter it before
       playing. The prompt is in-page, never a native prompt(). */
    if (pinName) {
      html += '<div class="card"><h3>🔒 Enter your PIN</h3>' +
        '<p class="info">Enter ' + esc(pinName) + '\'s 4-digit PIN to play:</p>' +
        '<label>PIN</label><input id="pin-input" type="password" inputmode="numeric" maxlength="4" autocomplete="off">' +
        '<div class="row"><button id="pin-ok">OK</button><button id="pin-cancel" class="secondary">Cancel</button></div>' +
        '<div id="pin-out" style="margin-top:12px"></div></div>';
    }
    if (playStudent) {
      // Step 2: pick a topic.
      html += '<div class="card"><h3>2. Pick a topic, ' + esc(playStudent) + '!</h3><div class="pick-grid">';
      topics.forEach(function (t) {
        html += '<button data-topic="' + esc(t.id) + '"' + (String(playTopicId) === String(t.id) ? ' class="picked"' : '') + '>' + esc(t.label) + '</button>';
      });
      html += '</div></div>';
    }
    var topic = playTopicId ? topicById(playTopicId) : null;
    if (topic) {
      // "Did you know?" — one fact from the chosen topic.
      if (playFact) html += '<div class="fact-box">💡 <b>Did you know?</b> ' + esc(playFact) + '</div>';
      // Step 3: pick a level, then start.
      html += '<div class="card"><h3>3. Pick a level</h3><div class="pick-grid">';
      LEVELS.forEach(function (lv) {
        html += '<button data-level="' + lv + '"' + (playLevel === lv ? ' class="picked"' : '') + '>' + lv + '</button>';
      });
      html += '</div>';
      if (playLevel) html += '<div class="row" style="margin-top:14px"><button id="play-start">Start the quiz! 🚀</button></div>';
      html += '</div>';
    }
    if (!topics.length) html += '<div class="card"><p class="info">No topics yet — check back soon!</p></div>';
    el.innerHTML = html;
    el.querySelectorAll('[data-student]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-student');
        /* Already verified for this student: no PIN prompt again. */
        if (name === playStudent && studentPin) { renderPlay(); return; }
        /* A student with a PIN set must enter it first. */
        if ((data.pin_students || []).indexOf(name) !== -1) {
          pinName = name;
          renderPlay();
          return;
        }
        pinName = '';
        playStudent = name;
        studentPin = '';
        try { localStorage.setItem(STUDENT_KEY, playStudent); } catch (e) {}
        renderPlay();
      });
    });
    wirePinBox(el);
    el.querySelectorAll('[data-topic]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        playTopicId = btn.getAttribute('data-topic');
        playLevel = '';
        var t = topicById(playTopicId);
        var facts = (t && t.facts) || [];
        playFact = facts.length ? facts[Math.floor(Math.random() * facts.length)] : '';
        renderPlay();
      });
    });
    el.querySelectorAll('[data-level]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        playLevel = btn.getAttribute('data-level');
        renderPlay();
      });
    });
    var startBtn = $('play-start');
    if (startBtn) startBtn.addEventListener('click', startQuiz);
    var signOut = $('sign-out');
    if (signOut) signOut.addEventListener('click', function () {
      playStudent = '';
      studentPin = '';
      pinName = '';
      playTopicId = '';
      playLevel = '';
      playFact = '';
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
      rpc('check_kids_science_student_pin', { p_slug: SLUG, p_student_name: pinName, p_pin: pin }).then(function (ok) {
        if (ok === true) {
          playStudent = pinName;
          studentPin = pin;
          pinName = '';
          try { localStorage.setItem(STUDENT_KEY, playStudent); } catch (e) {}
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
  function renderQuiz(el) {
    // Finished: score + encouragement, saved once for the teacher.
    if (quizIdx >= quiz.length) {
      var total = quiz.length;
      if (!quizSaved) {
        quizSaved = true;
        rpc('record_kids_science_score', {
          p_slug: SLUG, p_student_name: playStudent, p_game: quizTopicLabel,
          p_level: playLevel, p_score: quizScore, p_total: total,
          p_pin: studentPin || ''
        }).catch(function () {});
      }
      el.innerHTML = '<h2>🎉 Quiz finished!</h2><div class="card">' +
        '<div class="score-big">' + quizScore + ' out of ' + total + ' ⭐</div>' +
        '<p style="text-align:center;font-size:20px">' + esc(encouragement(quizScore, total)) + '</p>' +
        '<p class="info" style="text-align:center">' + esc(playStudent) + ' · ' + esc(quizTopicLabel) + ' · ' + esc(playLevel) + '</p>' +
        '<div class="row" style="justify-content:center"><button id="quiz-again">Play again</button>' +
        '<button id="quiz-change" class="secondary">Change topic</button></div></div>';
      $('quiz-again').addEventListener('click', function () { startQuiz(); });
      $('quiz-change').addEventListener('click', function () {
        quiz = []; playLevel = ''; playFact = ''; renderPlay();
      });
      return;
    }
    var q = quiz[quizIdx];
    var choices = q.choices || [];
    var html = '<h2>🔬 ' + esc(quizTopicLabel) + ' · ' + esc(playLevel) + '</h2>' +
      '<div class="progress">Question ' + (quizIdx + 1) + ' of ' + quiz.length + ' · ' + esc(playStudent) + ' · Score: ' + quizScore + '</div>' +
      '<div class="card"><div class="question">' + esc(q.q) + '</div><div class="choice-list">';
    choices.forEach(function (c, i) {
      var cls = '';
      if (quizAnswered) {
        if (i === q.answer) cls = ' class="correct"';
        else if (i === quizPicked) cls = ' class="wrong"';
      }
      html += '<button data-choice="' + i + '"' + cls + (quizAnswered ? ' disabled' : '') + '>' + esc(c) + '</button>';
    });
    html += '</div>';
    if (quizAnswered) {
      var right = quizPicked === q.answer;
      html += right
        ? '<div class="good" style="margin-top:14px">✅ Correct! Great job! 🎉</div>'
        : '<div class="bad" style="margin-top:14px">Not quite — the answer was <b>' + esc(choices[q.answer] || '') + '</b>. You will get the next one!</div>';
      if (q.fact) html += '<div class="fact-box" style="margin-top:12px">💡 <b>Fun fact:</b> ' + esc(q.fact) + '</div>';
      html += '<div class="row" style="margin-top:14px"><button id="quiz-next">' + (quizIdx + 1 >= quiz.length ? 'See my score! ⭐' : 'Next question →') + '</button></div>';
    }
    html += '</div>';
    el.innerHTML = html;
    el.querySelectorAll('[data-choice]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (quizAnswered) return;
        quizPicked = Number(btn.getAttribute('data-choice'));
        quizAnswered = true;
        if (quizPicked === q.answer) quizScore++;
        renderQuiz(el);
      });
    });
    var nextBtn = $('quiz-next');
    if (nextBtn) nextBtn.addEventListener('click', function () {
      quizIdx++;
      quizAnswered = false;
      renderQuiz(el);
    });
  }
  var quizPicked = -1;

  /* ---------- Teacher (shared teacher password) ---------- */
  /* The scores table is public to the school's teacher only: the
     shared teacher password unlocks it, checked on the server by
     the list RPC. Schools with no teacher password set skip this
     entirely (teacherUnlocked starts true for them, see the start
     block). Nothing is stored: a reload asks again. */
  function openTeacher() {
    if (teacherUnlocked) { renderTeacher(); return; }
    var el = $('view-teacher');
    el.innerHTML = '<h2>Teacher</h2><div class="card">' +
      '<p class="info">Enter the teacher password for this school to see the students\' scores.</p>' +
      '<label>Teacher password</label><input id="tp-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="tp-go">Unlock</button></div>' +
      '<div id="tp-out" style="margin-top:12px"></div></div>';
    $('tp-go').addEventListener('click', function () {
      var out = $('tp-out');
      var p = $('tp-pass').value;
      out.innerHTML = '<p class="info">Checking…</p>';
      rpc('check_kids_science_teacher_pass', { p_slug: SLUG, p_password: p }).then(function (ok) {
        if (ok === true) {
          teacherPass = p;
          teacherUnlocked = true;
          renderTeacher();
        } else {
          out.innerHTML = '<p class="error">Wrong teacher password.</p>';
        }
      }).catch(function () {
        out.innerHTML = '<p class="error">Could not reach the sign-in check. Please try again in a moment.</p>';
      });
    });
  }
  function renderTeacher() {
    var el = $('view-teacher');
    el.innerHTML = '<h2>Teacher — Scores</h2><div class="card"><p class="info">Loading scores…</p></div>';
    rpc('list_kids_science_scores', { p_slug: SLUG, p_epass: teacherPass || '' }).then(function (rows) {
      var list = rows || [];
      var html = '<h2>Teacher — Scores</h2>' +
        '<div class="row" style="margin-bottom:12px"><button id="scores-refresh" class="secondary">Refresh</button></div>';
      if (delScoreErr) {
        html += '<div class="card"><p class="error">Could not delete score: ' + esc(delScoreErr) + '</p></div>';
        delScoreErr = '';
      }
      if (!list.length) {
        html += '<div class="card"><p class="info">No scores yet. Scores appear here after a student finishes a quiz in Play.</p></div>';
      } else {
        html += '<div class="card"><table class="scores"><thead><tr><th>Student</th><th>Topic</th><th>Level</th><th>Score</th><th>Date</th><th></th></tr></thead><tbody>';
        list.forEach(function (r) {
          var when = r.created_at ? new Date(r.created_at).toLocaleString() : '';
          var delHtml;
          if (delScoreId === r.id) {
            delHtml = '<span>Delete this score?</span> <button class="danger small" data-score-del-yes="' + r.id + '">Yes</button> <button class="secondary small" data-score-del-no>Keep</button>';
          } else {
            delHtml = '<button class="small danger" data-score-del="' + r.id + '">Delete</button>';
          }
          html += '<tr><td>' + esc(r.student_name) + '</td><td>' + esc(r.game) + '</td><td>' + esc(r.level) + '</td>' +
            '<td><b>' + esc(r.score) + ' / ' + esc(r.total) + '</b></td><td>' + esc(when) + '</td><td>' + delHtml + '</td></tr>';
        });
        html += '</tbody></table></div>';
      }
      el.innerHTML = html;
      $('scores-refresh').addEventListener('click', renderTeacher);
      /* Delete a score: in-page tap-again confirm, same pattern as
         the topic/question delete in Setup. Never a native confirm(). */
      el.querySelectorAll('[data-score-del]').forEach(function (b) {
        b.addEventListener('click', function () { delScoreId = Number(b.getAttribute('data-score-del')); renderTeacher(); });
      });
      el.querySelectorAll('[data-score-del-no]').forEach(function (b) {
        b.addEventListener('click', function () { delScoreId = null; renderTeacher(); });
      });
      el.querySelectorAll('[data-score-del-yes]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = Number(b.getAttribute('data-score-del-yes'));
          rpc('delete_kids_science_score', { p_slug: SLUG, p_epass: teacherPass || '', p_score_id: id }).then(function () {
            delScoreId = null;
            renderTeacher();
          }).catch(function (err) {
            delScoreId = null;
            delScoreErr = err.message || 'request failed';
            renderTeacher();
          });
        });
      });
    }).catch(function (err) {
      el.innerHTML = '<h2>Teacher — Scores</h2><div class="card"><p class="error">Could not load scores: ' + esc(err.message) + '</p></div>';
    });
  }

  /* ---------- Setup (owner login only: draft + Upload for approval) ---------- */
  function ownerUnlocked() { return !!ownerCreds; }
  function renderOwnerLogin(el, heading, after) {
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
      rpc('check_kids_science_login', { p_slug: SLUG, p_username: u, p_password: p }).then(function (ok) {
        if (ok === true) {
          ownerCreds = { u: u, p: p };
          after();
        } else {
          out.innerHTML = '<p class="error">Wrong username or password.</p>';
        }
      }).catch(function () {
        out.innerHTML = '<p class="error">Could not reach the sign-in check. Please try again in a moment.</p>';
      });
    });
  }
  /* Per-shop live chat: stop the owner inbox poll when Setup is
     left or the Chats section is closed. No-op when chats were
     never opened. */
  function stopSetupChats() {
    var box = $('setup-chats');
    if (box && box._shopChatStop) { try { box._shopChatStop(); } catch (e) {} }
  }

  function openSetup() {
    if (!ownerUnlocked()) {
      renderOwnerLogin($('view-setup'), 'Setup sign-in', function () { openSetup(); });
      return;
    }
    var el = $('view-setup');
    el.innerHTML = '<h2>Setup</h2><div class="card"><p class="info">Loading your draft…</p></div>';
    rpc('get_kids_science_draft', { p_slug: SLUG, p_username: ownerCreds.u, p_password: ownerCreds.p }).then(function (res) {
      draft = res.data || {};
      draft.name = draft.name || '';
      draft.about = draft.about || '';
      draft.students = draft.students || [];
      draft.student_pins = draft.student_pins || {};
      draft.topics = draft.topics || [];
      draftStatus = res.status || 'editing';
      removeTopicId = null;
      removeQKey = null;
      /* Student limit: 3 included + paid extra kids. Fetched fresh
         each time Setup opens; falls back to 3 if unavailable. */
      return rpc('kids_science_student_limit', { p_slug: SLUG }).then(function (limit) {
        if (typeof limit === 'number' && isFinite(limit) && limit >= 3) studentLimit = limit;
      }).catch(function () {});
    }).then(function () {
      /* Direct Upload switch: see the note by directUploadOn. */
      return rpc('direct_upload_enabled', { p_owner_type: 'kids-science', p_owner_key: SLUG }).then(function (on) {
        directUploadOn = (on === true);
      }).catch(function () { directUploadOn = false; });
    }).then(function () {
      renderSetup();
    }).catch(function () {
      el.innerHTML = '<h2>Setup</h2><div class="card"><p class="error">Could not load your draft. Please try again in a moment.</p></div>';
    });
  }
  function statusLine() {
    if (draftStatus === 'pending') return 'Your changes were sent to Yently and are waiting for approval. Children still see the approved quizzes.';
    if (draftStatus === 'approved') return 'Your last upload was approved and is now live.';
    if (directUploadOn) return 'Direct Upload is on for this school — your changes go live the moment you upload them. Children still see the approved quizzes.';
    return 'Your changes are saved as a draft. Children still see the approved quizzes until you upload and Yently approves.';
  }
  function newTopic() {
    return { id: 'topic-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), label: 'New topic', facts: [''], questions: [] };
  }
  function newQuestion() {
    return { q: '', choices: ['', '', '', ''], answer: 0, level: 'Easy', fact: '' };
  }
  function renderSetup() {
    var el = $('view-setup');
    var html = '<h2>Setup</h2>' +
      '<div class="note">' + esc(statusLine()) + ' Your school\'s private link is yours alone — you\'ll get your own private link by email.</div>' +
      '<div class="card">' +
      '<label>School name</label><input id="setup-name" type="text" value="' + esc(draft.name) + '">' +
      '<label>About text</label><input id="setup-about" type="text" value="' + esc(draft.about) + '">' +
      '</div>' +
      '<h2>Students</h2><div class="card"><p class="info" id="setup-student-count"></p><div id="setup-students"></div>' +
      '<div class="row"><input id="setup-new-student" type="text" placeholder="New student name" style="flex:1;margin:0">' +
      '<button id="setup-add-student" class="secondary">+ Add student</button></div><div id="setup-student-out" style="margin-top:8px"></div></div>' +
      '<h2>Topics</h2><div id="setup-topics"></div>' +
      '<button id="setup-add-topic" class="secondary">+ Add topic</button>' +
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
      window.KidsLibrary.mount({ subject: 'science', slug: SLUG, creds: ownerCreds, container: libBox, onAdded: function () { openSetup(); } });
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
        window.ShopChat.mountInbox(box, { ownerType: 'kids-science', ownerKey: SLUG, creds: { u: ownerCreds.u, p: ownerCreds.p } });
      } else {
        box.innerHTML = '<p class="error">Chat is not available right now. Please reload the page and try again.</p>';
      }
    });
    // Students list (kept in draft.students, re-rendered on change).
    var stEl = $('setup-students');
    /* Students go live at once — no draft, no approval. The RPC
       writes the new list into BOTH live_data and draft_data, so a
       later draft save/upload (collectDraft reads draft.students)
       can never revert it. PINs are untouched by the RPC and still
       flow through the draft. On success both in-memory copies are
       refreshed from the saved list. */
    function saveStudentsLive(next, out, done) {
      if (out) out.innerHTML = '<p class="info">Saving…</p>';
      rpc('set_kids_science_students', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_students: next }).then(function (ok) {
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
      rpc('set_kids_science_student_pins', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_pins: pins }).then(function (ok) {
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
      stEl.innerHTML = '';
      if (!draft.students.length) stEl.innerHTML = '<p class="info">No students yet — add the first one below.</p>';
      draft.students.forEach(function (name, i) {
        var row = document.createElement('div');
        row.className = 'student-row';
        /* PIN: 4 digits, optional. A student with no PIN plays
           without one, exactly as before. */
        row.innerHTML = '<span>' + esc(name) + '</span>' +
          '<input type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="PIN — optional" data-student-pin="' + i + '" value="' + esc((draft.student_pins[name]) || '') + '">' +
          '<button class="small danger" data-rm-student="' + i + '">Remove</button>';
        row.querySelector('[data-student-pin]').addEventListener('input', function (e) {
          var v = e.target.value.replace(/\D/g, '').slice(0, 4);
          e.target.value = v;
          var nm = draft.students[Number(e.target.getAttribute('data-student-pin'))];
          if (!nm) return;
          if (v) draft.student_pins[nm] = v; else delete draft.student_pins[nm];
        });
        row.querySelector('[data-student-pin]').addEventListener('change', savePinsLive);
        row.querySelector('[data-rm-student]').addEventListener('click', function () {
          var nm = draft.students[i];
          var next = draft.students.slice();
          next.splice(i, 1);
          /* Removing a student also goes live at once via the RPC. */
          saveStudentsLive(next, $('setup-student-out'), function () {
            if (nm) delete draft.student_pins[nm];
            var out = $('setup-student-out');
            if (out) out.innerHTML = '<p class="info">Student removed — live right away. ✅</p>';
          });
        });
        stEl.appendChild(row);
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
    // Topics: label + facts + questions, all bound to draft.topics.
    var topicsEl = $('setup-topics');
    function drawTopics() {
      topicsEl.innerHTML = '';
      draft.topics.forEach(function (topic) {
        var card = document.createElement('div');
        card.className = 'card topic-card';
        var qHtml = '';
        (topic.questions || []).forEach(function (q, qi) {
          var key = topic.id + ':' + qi;
          qHtml += '<div class="card q-card"><h3>Question ' + (qi + 1) + '</h3>' +
            '<label>Question</label><input data-qf="q" data-qi="' + qi + '" type="text" value="' + esc(q.q) + '">' +
            '<label>Choice 1</label><input data-qf="c0" data-qi="' + qi + '" type="text" value="' + esc(q.choices[0] || '') + '">' +
            '<label>Choice 2</label><input data-qf="c1" data-qi="' + qi + '" type="text" value="' + esc(q.choices[1] || '') + '">' +
            '<label>Choice 3</label><input data-qf="c2" data-qi="' + qi + '" type="text" value="' + esc(q.choices[2] || '') + '">' +
            '<label>Choice 4</label><input data-qf="c3" data-qi="' + qi + '" type="text" value="' + esc(q.choices[3] || '') + '">' +
            '<label>Correct choice</label><select data-qf="answer" data-qi="' + qi + '">' +
            [0, 1, 2, 3].map(function (n) {
              return '<option value="' + n + '"' + (q.answer === n ? ' selected' : '') + '>Choice ' + (n + 1) + '</option>';
            }).join('') + '</select>' +
            '<label>Level</label><select data-qf="level" data-qi="' + qi + '">' +
            LEVELS.map(function (lv) {
              return '<option value="' + lv + '"' + (q.level === lv ? ' selected' : '') + '>' + lv + '</option>';
            }).join('') + '</select>' +
            '<label>Fun fact (shown after the question)</label><input data-qf="fact" data-qi="' + qi + '" type="text" value="' + esc(q.fact || '') + '">' +
            (removeQKey === key
              ? '<span><b>Remove this question?</b> <button class="small danger" data-rmq-yes="' + key + '">Yes, remove</button> <button class="small secondary" data-rmq-no>Keep it</button></span>'
              : '<button class="small danger" data-rmq="' + key + '">Remove question</button>') +
            '</div>';
        });
        card.innerHTML =
          '<label>Topic name</label><input data-tf="label" type="text" value="' + esc(topic.label) + '">' +
          '<label>Facts — one per line (shown as "Did you know?")</label>' +
          '<textarea data-tf="facts">' + esc((topic.facts || []).join('\n')) + '</textarea>' +
          '<h3>Questions</h3>' + qHtml +
          '<button class="small secondary" data-addq>Add question</button> ' +
          (removeTopicId === topic.id
            ? '<span><b>Remove this whole topic?</b> <button class="small danger" data-rmt-yes>Yes, remove</button> <button class="small secondary" data-rmt-no>Keep it</button></span>'
            : '<button class="small danger" data-rmt>Remove topic</button>');
        // Topic label + facts write straight into the draft.
        card.querySelector('[data-tf="label"]').addEventListener('input', function (e) { topic.label = e.target.value; });
        card.querySelector('[data-tf="facts"]').addEventListener('input', function (e) {
          topic.facts = e.target.value.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; });
        });
        // Question fields write straight into the draft question.
        card.querySelectorAll('[data-qf]').forEach(function (input) {
          input.addEventListener('input', function () {
            var qi = Number(input.getAttribute('data-qi'));
            var qq = topic.questions[qi];
            if (!qq) return;
            var f = input.getAttribute('data-qf');
            if (f === 'q') qq.q = input.value;
            else if (f === 'fact') qq.fact = input.value;
            else if (f === 'answer') qq.answer = Number(input.value);
            else if (f === 'level') qq.level = input.value;
            else if (f.charAt(0) === 'c') qq.choices[Number(f.slice(1))] = input.value;
          });
          input.addEventListener('change', function () {
            var qi = Number(input.getAttribute('data-qi'));
            var qq = topic.questions[qi];
            if (!qq) return;
            var f = input.getAttribute('data-qf');
            if (f === 'answer') qq.answer = Number(input.value);
            else if (f === 'level') qq.level = input.value;
          });
        });
        card.querySelector('[data-addq]').addEventListener('click', function () {
          topic.questions = topic.questions || [];
          topic.questions.push(newQuestion());
          drawTopics();
        });
        var rmq = card.querySelector('[data-rmq]');
        if (rmq) rmq.addEventListener('click', function () { removeQKey = rmq.getAttribute('data-rmq'); drawTopics(); });
        var rmqNo = card.querySelector('[data-rmq-no]');
        if (rmqNo) rmqNo.addEventListener('click', function () { removeQKey = null; drawTopics(); });
        var rmqYes = card.querySelector('[data-rmq-yes]');
        if (rmqYes) rmqYes.addEventListener('click', function () {
          var parts = rmqYes.getAttribute('data-rmq-yes').split(':');
          var t = null;
          draft.topics.forEach(function (tt) { if (String(tt.id) === parts[0]) t = tt; });
          if (t) t.questions.splice(Number(parts[1]), 1);
          removeQKey = null;
          drawTopics();
        });
        var rmt = card.querySelector('[data-rmt]');
        if (rmt) rmt.addEventListener('click', function () { removeTopicId = topic.id; drawTopics(); });
        var rmtNo = card.querySelector('[data-rmt-no]');
        if (rmtNo) rmtNo.addEventListener('click', function () { removeTopicId = null; drawTopics(); });
        var rmtYes = card.querySelector('[data-rmt-yes]');
        if (rmtYes) rmtYes.addEventListener('click', function () {
          draft.topics = draft.topics.filter(function (tt) { return tt.id !== topic.id; });
          removeTopicId = null;
          drawTopics();
        });
        topicsEl.appendChild(card);
      });
      if (!draft.topics.length) topicsEl.innerHTML = '<div class="card"><p class="info">No topics yet — add the first one below.</p></div>';
    }
    drawTopics();
    $('setup-add-topic').addEventListener('click', function () {
      draft.topics.push(newTopic());
      drawTopics();
    });
    /* collectDraft must include EVERY editable field, or Setup silently
       drops it: name, about, students, student_pins, and each topic's
       label, facts and questions (question text, 4 choices, correct
       choice, level, fun fact). Name/about come from the inputs;
       students and topics come from the draft state, which every field
       above keeps in sync. PINs are pruned to current students and to
       exactly 4 digits. Students come from draft.students, which the
       live student RPC keeps in sync — a later save/upload never
       reverts a student change. */
    function collectDraft() {
      var pins = {};
      Object.keys(draft.student_pins || {}).forEach(function (nm) {
        if (draft.students.indexOf(nm) !== -1 && /^\d{4}$/.test(draft.student_pins[nm])) pins[nm] = draft.student_pins[nm];
      });
      return {
        name: $('setup-name').value.trim() || draft.name,
        about: $('setup-about').value,
        students: (draft.students || []).filter(function (s) { return String(s).trim() !== ''; }),
        student_pins: pins,
        topics: (draft.topics || []).map(function (t) {
          return {
            id: t.id,
            label: t.label,
            facts: (t.facts || []).filter(function (f) { return String(f).trim() !== ''; }),
            questions: (t.questions || []).filter(function (q) { return String(q.q || '').trim() !== ''; }).map(function (q) {
              var ch = [0, 1, 2, 3].map(function (i) { return q.choices[i] || ''; });
              var ans = Number(q.answer) || 0;
              if (ans < 0 || ans > 3) ans = 0;
              return { q: q.q, choices: ch, answer: ans, level: LEVELS.indexOf(q.level) !== -1 ? q.level : 'Easy', fact: q.fact || '' };
            })
          };
        }).filter(function (t) { return String(t.label || '').trim() !== ''; })
      };
    }
    $('setup-save').addEventListener('click', function () {
      var out = $('setup-out');
      out.innerHTML = '<p class="info">Saving…</p>';
      var d = collectDraft();
      rpc('save_kids_science_draft', { p_slug: SLUG, p_username: ownerCreds.u, p_password: ownerCreds.p, p_draft: d }).then(function () {
        draft = d;
        draftStatus = 'editing';
        out.innerHTML = '<p class="info">Draft saved. Children still see the approved quizzes.</p>';
      }).catch(function (err) {
        out.innerHTML = '<p class="error">Could not save: ' + esc(err.message) + '</p>';
      });
    });
    $('setup-upload').addEventListener('click', function () {
      var out = $('setup-out');
      out.innerHTML = '<p class="info">Uploading…</p>';
      var d = collectDraft();
      rpc('submit_kids_science_draft', { p_slug: SLUG, p_username: ownerCreds.u, p_password: ownerCreds.p, p_draft: d }).then(function () {
        draft = d;
        draftStatus = directUploadOn ? 'approved' : 'pending';
        notifyEmail('Kids Science draft for approval: ' + (d.name || SLUG), { school: d.name || '', slug: SLUG });
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
    resolveSlug().then(function () { return rpc('get_kids_science_live', { p_slug: SLUG }); }).then(function (json) {
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
        window.ShopChat.mountBubble(chatBox, { ownerType: 'kids-science', ownerKey: SLUG, shopName: data.name || 'Kids Science', ownerEmail: '' });
      }
      data.students = data.students || [];
      data.topics = data.topics || [];
      /* A stored name that now has a PIN must re-enter it: never
         auto-select a PIN student from localStorage. */
      if (playStudent && (data.pin_students || []).indexOf(playStudent) !== -1) {
        playStudent = '';
        try { localStorage.removeItem(STUDENT_KEY); } catch (e) {}
      }
      document.title = data.name || 'Kids Science';
      var logo = $('site-logo');
      if (data.logo) { logo.src = (/^https?:\/\//.test(data.logo) ? data.logo : BASE + data.logo); logo.hidden = false; }
      $('site-name').textContent = data.name || 'Kids Science';
      $('site-about').textContent = data.about || '';
      $('site-footer').innerHTML = '<div>Powered by Yently</div>';
      rpc('kids_science_pass_status', { p_slug: SLUG }).then(function (s) {
        teacherUnlocked = !(s && s.has_pass);
        renderPlay();
      }).catch(function () {
        /* If the status check itself is unreachable, stay open rather
           than locking everyone out of a working school. The list RPC
           still enforces the teacher password on the server. */
        teacherUnlocked = true;
        renderPlay();
      });
    }).catch(function () {
      $('site-name').textContent = 'School not found';
      $('view-play').innerHTML = '<div class="error">This link doesn\'t point to a school yet. Check the link and try again.</div>';
    });
  }
})();
