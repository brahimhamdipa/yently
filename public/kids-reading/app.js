/* Kids Reading page app — ONE folder for every school or library.
   The school comes from its own private link, and its name, about
   text, students and books live in the database — there is no
   data.json file here. Visitors see the last APPROVED books. The
   owner logs in with the username + password the admin created
   for their school (that login is what Yently sells); Setup edits
   save as a draft, and the Upload button sends the draft to the
   admin for approval. Approval makes the draft live instantly —
   no file swap, no redeploy wait. Student names are the exception: adding or removing a student goes live at once, up to the school's student limit (3 included + paid extra kids).
   Play is public: a child picks their name, opens a book, and
   reads it one page at a time. A student with a 4-digit PIN set
   in Setup must enter it before reading; the verified PIN lives
   in memory only, never in localStorage. On the last page the
   finish button records the finish (best score only, one row per
   child per book, so re-reading never doubles the teacher's list). The bookshelf shows a tick
   on books this child already finished — from this browser's own
   finished list, plus the server list whenever the teacher has
   unlocked the Teacher tab in this session. The Teacher tab needs
   the school's shared teacher password (one password for all
   teachers, set by the admin; schools with none set stay fully
   open). The password is enforced on the server by the list RPC,
   not just in the page, so it cannot be bypassed. All credentials
   live in memory only: a reload asks again, exactly like the
   barber intake form. */
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
    // system's own folder name, so a bare /kids-reading visit still
    // shows "not found" by design.
    var segs = location.pathname.split('/').filter(function (s) { return s; });
    var lastSeg = (segs[segs.length - 1] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    if (lastSeg && lastSeg !== 'kids-reading') { SLUG = lastSeg; SLUG_FROM_PATH = true; }
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
  var STUDENT_KEY = 'kids-reading-student-' + SLUG;
  var FINISHED_KEY = 'kids-reading-finished-' + SLUG;

  /* Public by design: the same publishable key the main Yently site ships
     in its own pages. Used only for the database calls below. */
  var SUPABASE_URL = 'https://deykvlxikzwwrygmkdly.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_e2uwGgFB0SvVQS-TZahArQ_mjypz9Vr';

  var EMOJIS = ['📚', '⛵', '🐱', '🐶', '🦁', '🐸', '🚀', '🌈', '🐘', '🦋', '🌙', '⭐', '🐳', '🍎', '🏰', '🚂'];

  var data = null; // live name/about/students/books (visitors)
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
  var teacherScores = null; // rows from list_kids_reading_scores, newest first
  var serverScores = null; // same list, used by Play for the finished ticks
  var currentStudent = null; // picked name, kept in this browser only
  var studentPin = ''; // verified PIN for the current student, session only, never stored
  var pinName = ''; // student awaiting PIN entry on the picker
  var delStudentIdx = null; // Setup: student index awaiting an in-page delete confirmation
  var delScoreId = null; // teacher scores: score id awaiting an in-page delete confirmation
  var delScoreErr = ''; // teacher scores: delete error to show on the next list render
  var finishedLocal = {}; // student name -> [book ids finished in this browser]
  var readingBook = null; // book open in the reader, or null
  var readingPage = 0; // 0-based page index in the reader
  var justFinished = false; // true right after the finish button is tapped
  var currentView = 'play';

  try {
    currentStudent = localStorage.getItem(STUDENT_KEY) || null;
    finishedLocal = JSON.parse(localStorage.getItem(FINISHED_KEY) || '{}');
  } catch (e) {
    currentStudent = null;
    finishedLocal = {};
  }

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
  function saveFinishedLocal() {
    try { localStorage.setItem(FINISHED_KEY, JSON.stringify(finishedLocal)); } catch (e) {}
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
        body: JSON.stringify({ subject: subject, table: 'kids_reading_draft', record: record })
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- Finished books ---------- */
  /* A book counts as finished for the picked child when it is in
     this browser's finished list, or in the server list (which Play
     only has when the teacher unlocked the Teacher tab in this
     session, or the school has no teacher password at all). */
  function isFinished(bookId) {
    if (!currentStudent) return false;
    var local = finishedLocal[currentStudent] || [];
    if (local.indexOf(bookId) !== -1) return true;
    if (serverScores) {
      return serverScores.some(function (r) {
        return r.student_name === currentStudent && r.game === bookId && Number(r.score) >= 1;
      });
    }
    return false;
  }
  function markFinishedLocal(bookId) {
    if (!currentStudent) return;
    var list = finishedLocal[currentStudent] || [];
    if (list.indexOf(bookId) === -1) list.push(bookId);
    finishedLocal[currentStudent] = list;
    saveFinishedLocal();
  }
  function bookTitle(gameId) {
    var found = (data.books || []).filter(function (b) { return b.id === gameId; })[0];
    return found ? found.title : gameId;
  }
  function fetchServerScores() {
    if (!teacherUnlocked) return Promise.resolve();
    return rpc('list_kids_reading_scores', { p_slug: SLUG, p_epass: teacherPass }).then(function (rows) {
      serverScores = rows || [];
    }).catch(function () {
      serverScores = null;
    });
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
  function renderPlay() {
    var el = $('view-play');
    if (!data) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (readingBook) { renderReader(); return; }
    if (!currentStudent) {
      var students = data.students || [];
      if (!students.length) {
        el.innerHTML = '<h2>Play</h2><div class="card"><p class="info">No students yet — the teacher adds names in Setup.</p></div>';
        return;
      }
      var html = '<h2>Who is reading today?</h2><div class="card"><p class="info">Tap your name to see your bookshelf.</p>' +
        '<div class="name-grid">';
      students.forEach(function (name) {
        html += '<button data-student="' + esc(name) + '">' + esc(name) + '</button>';
      });
      html += '</div></div>';
      /* PIN gate: a student with a PIN set must enter it before
         reading. The prompt is in-page, never a native prompt(). */
      if (pinName) {
        html += '<div class="card"><h2>🔒 Enter your PIN</h2>' +
          '<p class="info">Enter ' + esc(pinName) + '\'s 4-digit PIN:</p>' +
          '<label>PIN</label><input id="pin-input" type="password" inputmode="numeric" maxlength="4" autocomplete="off">' +
          '<div class="row"><button id="pin-ok">OK</button><button id="pin-cancel" class="secondary">Cancel</button></div>' +
          '<div id="pin-out" style="margin-top:12px"></div></div>';
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
          currentStudent = name;
          studentPin = '';
          pinName = '';
          try { localStorage.setItem(STUDENT_KEY, currentStudent); } catch (e) {}
          renderPlay();
        });
      });
      wirePinBox(el);
      return;
    }
    var books = data.books || [];
    var h = '<h2>Hello, ' + esc(currentStudent) + '! 📚</h2>' +
      '<p class="info">Pick a book and read it, one page at a time. ' +
      '<button id="sign-out" class="small secondary">Sign out</button></p>';
    if (!books.length) {
      h += '<div class="card"><p class="info">No books yet — the teacher adds books in Setup.</p></div>';
    } else {
      h += '<div class="book-grid">';
      books.forEach(function (book) {
        var pages = (book.pages || []).length;
        var done = isFinished(book.id);
        h += '<div class="book-card' + (done ? ' finished' : '') + '" data-book="' + esc(book.id) + '" role="button" tabindex="0">' +
          '<div class="book-emoji">' + esc(book.emoji || '📚') + '</div>' +
          '<h3>' + esc(book.title) + ' ' + speakBtnHtml(book.title) + '</h3>' +
          '<div class="book-author">' + esc(book.author || '') + '</div>' +
          '<div class="book-pages">' + pages + ' page' + (pages === 1 ? '' : 's') + '</div>' +
          (done ? '<span class="book-done">✓ Finished</span>' : '') +
          '</div>';
      });
      h += '</div>';
    }
    el.innerHTML = h;
    wireSpeakButtons(el);
    $('sign-out').addEventListener('click', function () {
      currentStudent = null;
      studentPin = '';
      pinName = '';
      try { localStorage.removeItem(STUDENT_KEY); } catch (e) {}
      renderPlay();
    });
    el.querySelectorAll('[data-book]').forEach(function (card) {
      function open() {
        var book = books.filter(function (b) { return b.id === card.getAttribute('data-book'); })[0];
        if (!book) return;
        readingBook = book;
        readingPage = 0;
        justFinished = false;
        renderReader();
      }
      card.addEventListener('click', open);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
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
      rpc('check_kids_reading_student_pin', { p_slug: SLUG, p_student_name: pinName, p_pin: pin }).then(function (ok) {
        if (ok === true) {
          currentStudent = pinName;
          studentPin = pin;
          pinName = '';
          try { localStorage.setItem(STUDENT_KEY, currentStudent); } catch (e) {}
          renderPlay();
        } else {
          out.innerHTML = '<p class="error">Wrong PIN. Please try again.</p>';
        }
      }).catch(function () {
        out.innerHTML = '<p class="error">Could not reach the PIN check. Please try again in a moment.</p>';
      });
    });
    $('pin-cancel').addEventListener('click', function () { pinName = ''; renderPlay(); });
    input.focus();
  }
  function renderReader() {
    var el = $('view-play');
    var book = readingBook;
    if (!book) { renderPlay(); return; }
    var pages = (book.pages && book.pages.length) ? book.pages : ['This book has no pages yet.'];
    if (justFinished) {
      el.innerHTML = '<div class="celebration"><div class="big">🎉</div>' +
        '<h2>You finished ' + esc(book.title) + '!</h2>' +
        '<p>Great reading, ' + esc(currentStudent || '') + '! Your teacher can see that you finished this book.</p>' +
        '<button id="back-shelf">Choose another book</button></div>';
      $('back-shelf').addEventListener('click', function () {
        readingBook = null;
        justFinished = false;
        renderPlay();
      });
      return;
    }
    var last = readingPage >= pages.length - 1;
    var done = isFinished(book.id);
    var html = '<div class="reader">' +
      '<div class="reader-emoji">' + esc(book.emoji || '📚') + '</div>' +
      '<h2>' + esc(book.title) + ' ' + speakBtnHtml(book.title) + '</h2>' +
      '<div class="reader-author">' + esc(book.author || '') + '</div>' +
      '<div class="reader-page">' + esc(pages[readingPage]) + ' ' + speakBtnHtml(pages[readingPage]) + '</div>' +
      '<div class="reader-count">Page ' + (readingPage + 1) + ' of ' + pages.length + '</div>' +
      '<div class="reader-nav">' +
      '<button id="reader-prev" class="secondary"' + (readingPage === 0 ? ' disabled' : '') + '>← Prev</button>' +
      '<button id="reader-next" class="secondary"' + (last ? ' disabled' : '') + '>Next →</button>' +
      '</div>';
    if (last) {
      if (done) {
        html += '<p class="info" style="margin-top:16px">✓ You already finished this book! Great reading!</p>';
      } else {
        html += '<button id="reader-finish" class="finish-btn">I finished this book! 🎉</button><div id="reader-out" style="margin-top:12px"></div>';
      }
    }
    html += '<div style="margin-top:16px"><button id="back-shelf" class="secondary">← Back to bookshelf</button></div></div>';
    el.innerHTML = html;
    wireSpeakButtons(el);
    $('reader-prev').addEventListener('click', function () {
      if (readingPage > 0) { readingPage--; renderReader(); }
    });
    $('reader-next').addEventListener('click', function () {
      if (readingPage < pages.length - 1) { readingPage++; renderReader(); }
    });
    var finishBtn = $('reader-finish');
    if (finishBtn) finishBtn.addEventListener('click', function () {
      var out = $('reader-out');
      out.innerHTML = '<p class="info">Saving…</p>';
      rpc('record_kids_reading_score', { p_slug: SLUG, p_student_name: currentStudent, p_game: book.id, p_level: null, p_score: 1, p_total: 1, p_pin: studentPin || '' }).then(function () {
        markFinishedLocal(book.id);
        justFinished = true;
        renderReader();
      }).catch(function (err) {
        out.innerHTML = '<p class="error">Could not save your finish: ' + esc(err.message) + ' Please try again.</p>';
      });
    });
    $('back-shelf').addEventListener('click', function () {
      readingBook = null;
      justFinished = false;
      renderPlay();
    });
  }

  /* ---------- Teacher (shared teacher password) ---------- */
  /* The bookshelf stays public, but the Teacher tab needs the
     school's shared teacher password — one password for everybody,
     set by the admin. Nothing is stored: a reload asks again.
     Schools with no password set skip this entirely. */
  function openTeacher() {
    if (teacherUnlocked) {
      fetchTeacherScores().then(renderTeacher);
      return;
    }
    renderTeacherPrompt($('view-teacher'));
  }
  function renderTeacherPrompt(el) {
    el.innerHTML = '<h2>Teacher</h2><div class="card">' +
      '<p class="info">Enter the teacher password for this school to see who finished which book.</p>' +
      '<label>Teacher password</label><input id="teacher-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="teacher-go">Unlock</button></div>' +
      '<div id="teacher-out" style="margin-top:12px"></div></div>';
    $('teacher-go').addEventListener('click', function () {
      var out = $('teacher-out');
      var p = $('teacher-pass').value;
      out.innerHTML = '<p class="info">Checking…</p>';
      rpc('check_kids_reading_teacher_pass', { p_slug: SLUG, p_password: p }).then(function (ok) {
        if (ok === true) {
          teacherPass = p;
          teacherUnlocked = true;
          fetchTeacherScores().then(renderTeacher);
        } else {
          out.innerHTML = '<p class="error">Wrong teacher password.</p>';
        }
      }).catch(function () {
        out.innerHTML = '<p class="error">Could not reach the sign-in check. Please try again in a moment.</p>';
      });
    });
  }
  function fetchTeacherScores() {
    return rpc('list_kids_reading_scores', { p_slug: SLUG, p_epass: teacherPass }).then(function (rows) {
      teacherScores = rows || [];
      serverScores = teacherScores;
    }).catch(function (err) {
      teacherScores = null;
      var el = $('view-teacher');
      el.innerHTML = '<h2>Teacher</h2><div class="card"><p class="error">Could not load finished books: ' + esc(err.message) + '</p></div>';
    });
  }
  function renderTeacher() {
    var el = $('view-teacher');
    if (!teacherScores) { el.innerHTML = '<h2>Teacher</h2><p class="info">Loading…</p>'; return; }
    var html = '<h2>Teacher</h2>' +
      '<div class="row" style="margin-bottom:12px"><button id="teacher-refresh" class="secondary">Refresh</button></div>';
    if (delScoreErr) {
      html += '<div class="card"><p class="error">Could not delete score: ' + esc(delScoreErr) + '</p></div>';
      delScoreErr = '';
    }
    if (!teacherScores.length) {
      html += '<div class="card"><p class="info">No books finished yet. When a child finishes a book, their name and the book show up here.</p></div>';
    } else {
      html += '<div class="card"><p class="info">' + teacherScores.length + ' book' + (teacherScores.length === 1 ? '' : 's') + ' finished.</p>';
      teacherScores.forEach(function (r) {
        var when = r.created_at ? new Date(r.created_at).toLocaleString() : '';
        var delHtml;
        if (delScoreId === r.id) {
          delHtml = '<span>Delete this finish?</span> <button class="danger small" data-score-del-yes="' + r.id + '">Yes</button> <button class="secondary small" data-score-del-no>Keep</button>';
        } else {
          delHtml = '<button class="small danger" data-score-del="' + r.id + '">Delete</button>';
        }
        html += '<div class="score-line"><span><strong>' + esc(r.student_name) + '</strong> finished <strong>' + esc(bookTitle(r.game)) + '</strong></span>' +
          '<span class="when">' + esc(when) + '</span>' + delHtml + '</div>';
      });
      html += '</div>';
    }
    el.innerHTML = html;
    $('teacher-refresh').addEventListener('click', function () {
      fetchTeacherScores().then(renderTeacher);
    });
    /* Delete a finish: in-page tap-again confirm, same pattern as
       the student delete in Setup. Never a native confirm(). */
    el.querySelectorAll('[data-score-del]').forEach(function (b) {
      b.addEventListener('click', function () { delScoreId = Number(b.getAttribute('data-score-del')); renderTeacher(); });
    });
    el.querySelectorAll('[data-score-del-no]').forEach(function (b) {
      b.addEventListener('click', function () { delScoreId = null; renderTeacher(); });
    });
    el.querySelectorAll('[data-score-del-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-score-del-yes'));
        rpc('delete_kids_reading_score', { p_slug: SLUG, p_epass: teacherPass || '', p_score_id: id }).then(function () {
          delScoreId = null;
          fetchTeacherScores().then(renderTeacher);
        }).catch(function (err) {
          delScoreId = null;
          delScoreErr = err.message || 'request failed';
          fetchTeacherScores().then(renderTeacher);
        });
      });
    });
  }

  /* ---------- Setup (owner login only: draft + Upload for approval) ---------- */
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
  var ADDONS_SYSTEM = 'kids-reading';
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
        '<p class="info"><a href="/?add=kids-extra-reading&slug=' + encodeURIComponent(SLUG) + '">Add extra students</a> for $1/month each — free for the rest of this month.</p>';
    }
    box.innerHTML = html;
    /* Wire the buttons inside the panel just rendered. */
    if (key === 'clean' && !hasCleanLink) {
      var cleanAdd = $('setup-addons-clean-add');
      if (cleanAdd) cleanAdd.onclick = function () { var t = $('setup-addons-clean-type'); window.location.href = '/?add=' + encodeURIComponent(t ? t.value : 'clean:website') + '&shop=kids-reading&slug=' + encodeURIComponent(SLUG) + '&addon=1'; };
      var cleanHelp = $('setup-addons-clean-help');
      if (cleanHelp) cleanHelp.onclick = function (e) { if (e) e.preventDefault(); openCleanLinkHelp(); };
    }
    if (key === 'chat' && chatOn) {
      var inbox = $('setup-addons-chat-inbox');
      if (inbox) {
        if (window.ShopChat) {
          window.ShopChat.mountInbox(inbox, { ownerType: 'kids-reading', ownerKey: SLUG, creds: { u: staffCreds.u, p: staffCreds.p } });
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
      fetch(SUPABASE_URL + '/rest/v1/clean_links?system=eq.kids-reading&shop_slug=eq.' + encodeURIComponent(SLUG) + '&select=slug', {
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
    if (!staffCreds) {
      renderStaffLogin($('view-setup'), 'Setup sign-in', function () { openSetup(); });
      return;
    }
    var el = $('view-setup');
    el.innerHTML = '<h2>Setup</h2><div class="card"><p class="info">Loading your draft…</p></div>';
    rpc('get_kids_reading_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p }).then(function (res) {
      draft = res.data || {};
      draft.students = draft.students || [];
      draft.student_pins = draft.student_pins || {};
      draft.books = draft.books || [];
      draftStatus = res.status || 'editing';
      /* Student limit: 3 included + paid extra kids. Fetched fresh
         each time Setup opens; falls back to 3 if unavailable. */
      return rpc('kids_reading_student_limit', { p_slug: SLUG }).then(function (limit) {
        if (typeof limit === 'number' && isFinite(limit) && limit >= 3) studentLimit = limit;
      }).catch(function () {});
    }).then(function () {
      /* Direct Upload switch: see the note by directUploadOn. */
      return rpc('direct_upload_enabled', { p_owner_type: 'kids-reading', p_owner_key: SLUG }).then(function (on) {
        directUploadOn = (on === true);
      }).catch(function () { directUploadOn = false; });
    }).then(function () {
      /* Clean Link: whether the school already has one
         (clean_link_exists, public RPC). */
      return rpc('clean_link_exists', { p_system: 'kids-reading', p_slug: SLUG }).then(function (has) {
        hasCleanLink = (has === true);
      }).catch(function () { hasCleanLink = false; });
    }).then(function () {
      /* Live Chat switch: see the note by chatOn. */
      return rpc('shop_chat_enabled', { p_owner_type: 'kids-reading', p_owner_key: SLUG }).then(function (on) {
        chatOn = (on === true);
      }).catch(function () { chatOn = false; });
    }).then(function () {
      renderSetup();
    }).catch(function () {
      el.innerHTML = '<h2>Setup</h2><div class="card"><p class="error">Could not load your draft. Please try again in a moment.</p></div>';
    });
  }
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
      rpc('check_kids_reading_login', { p_slug: SLUG, p_username: u, p_password: p }).then(function (ok) {
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
    if (draftStatus === 'pending') return 'Your changes were sent to Yently and are waiting for approval. Children still see the approved books.';
    if (draftStatus === 'approved') return 'Your last upload was approved and is now live.';
    if (directUploadOn) return 'Direct Upload is on for this school — your changes go live the moment you upload them. Children still see the approved books.';
    return 'Your changes are saved as a draft. Children still see the approved books until you upload and Yently approves.';
  }
  function renderSetup() {
    var el = $('view-setup');
    var html = '<h2>Setup</h2>' +
      '<div class="note">' + esc(statusLine()) + '</div>' +
      '<div class="card">' +
      '<label>School name</label><input id="setup-name" type="text" value="' + esc(draft.name || '') + '">' +
      '<label>About text</label><textarea id="setup-about" rows="3">' + esc(draft.about || '') + '</textarea>' +
      '</div>' +
      '<h2>Students</h2><div class="card"><p class="info" id="setup-student-count"></p><div id="setup-students"></div>' +
      '<p class="info">To change a student\'s name, click Remove next to that student, then add a new student with the right name.</p>' +
      '<div class="row"><input id="setup-student-new" type="text" placeholder="Add a student name" style="flex:1;margin:0">' +
      '<button id="setup-student-add" class="secondary">+ Add student</button></div><div id="setup-student-out" style="margin-top:8px"></div></div>' +
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
      '<h2>Books</h2><div id="setup-books"></div>' +
      '<button id="setup-book-add" class="secondary">+ Add book</button>' +
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
      window.KidsLibrary.mount({ subject: 'reading', slug: SLUG, creds: staffCreds, container: libBox, onAdded: function () { openSetup(); } });
    }
    /* Add-ons section: the ☰ menu, the details panel and the
       active list (see renderAddonsSection). Replaces the old
       one-line-per-add-on Setup lines and the Chats card — the
       chat inbox now lives inside the Live Chat details panel. */
    renderAddonsSection();

    /* Students: names live on draft.students; add/remove re-renders
       Setup. Nothing is saved until Save draft or Upload. */
    var studentsEl = $('setup-students');
    /* Students go live at once — no draft, no approval. The RPC
       writes the new list into BOTH live_data and draft_data, so a
       later draft save/upload (collectDraft reads draft.students)
       can never revert it. PINs are untouched by the RPC and still
       flow through the draft. On success both in-memory copies are
       refreshed from the saved list. */
    function saveStudentsLive(next, out, done) {
      if (out) out.innerHTML = '<p class="info">Saving…</p>';
      rpc('set_kids_reading_students', { p_slug: SLUG, p_u: staffCreds.u, p_p: staffCreds.p, p_students: next }).then(function (ok) {
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
      rpc('set_kids_reading_student_pins', { p_slug: SLUG, p_u: staffCreds.u, p_p: staffCreds.p, p_pins: pins }).then(function (ok) {
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
      var newStudentInput = $('setup-student-new');
      if (newStudentInput) newStudentInput.disabled = draft.students.length >= studentLimit;
      studentsEl.innerHTML = '';
      if (!draft.students.length) {
        studentsEl.innerHTML = '<p class="info">No students yet — add names below.</p>';
        return;
      }
      draft.students.forEach(function (name, i) {
        var row = document.createElement('div');
        row.className = 'student-row';
        if (delStudentIdx === i) {
          row.innerHTML = '<span><strong>' + esc(name) + '</strong> — remove this student?</span>' +
            '<span><button class="danger small" data-student-del-yes="' + i + '">Yes, remove</button> ' +
            '<button class="secondary small" data-student-del-no>Keep</button></span>';
        } else {
          /* PIN: 4 digits, optional. A student with no PIN reads
             without one, exactly as before. */
          row.innerHTML = '<span>' + esc(name) + '</span>' +
            '<input type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="PIN — optional" data-student-pin="' + i + '" value="' + esc((draft.student_pins[name]) || '') + '">' +
            '<button class="small danger" data-remove-student="' + i + '">Remove</button>';
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
      studentsEl.querySelectorAll('[data-remove-student]').forEach(function (b) {
        b.addEventListener('click', function () { delStudentIdx = Number(b.getAttribute('data-remove-student')); drawStudents(); });
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
    $('setup-student-add').addEventListener('click', function () {
      var input = $('setup-student-new');
      var out = $('setup-student-out');
      var name = input.value.trim();
      if (!name) return;
      if (draft.students.indexOf(name) !== -1) { out.innerHTML = '<p class="error">That name is already on the list.</p>'; return; }
      if (draft.students.length >= studentLimit) { out.innerHTML = '<p class="error">You are at your limit of ' + studentLimit + ' students. <a href="/?add=kids-extra-reading&slug=' + encodeURIComponent(SLUG) + '">Add extra students</a> for $1/month each — free for the rest of this month.</p>'; return; }
      /* Adding a student goes live at once via the RPC — no draft,
         no approval. */
      saveStudentsLive(draft.students.concat([name]), out, function () {
        input.value = '';
        out.innerHTML = '<p class="info">Student added — live right away. ✅</p>';
      });
    });

    /* Books: each card edits one book in place. Title, author and
       pages update the draft as you type; the emoji picker and
       Remove update it at once. Nothing is saved until Save draft
       or Upload. */
    var booksEl = $('setup-books');
    function bookCard(book, i) {
      var card = document.createElement('div');
      card.className = 'book-edit';
      var emojiBtns = EMOJIS.map(function (e) {
        return '<button type="button" data-emoji="' + e + '" class="' + (book.emoji === e ? 'picked' : '') + '">' + e + '</button>';
      }).join('');
      card.innerHTML =
        '<label>Title</label><input data-f="title" type="text" value="' + esc(book.title || '') + '">' +
        '<label>Author</label><input data-f="author" type="text" value="' + esc(book.author || '') + '">' +
        '<label>Cover emoji</label><div class="emoji-pick">' + emojiBtns + '</div>' +
        '<label>Pages — one page per line</label><textarea data-f="pages" rows="6">' + esc((book.pages || []).join('\n')) + '</textarea>' +
        '<button type="button" class="small danger" data-remove-book="' + i + '">Remove book</button>';
      card.querySelectorAll('[data-f]').forEach(function (input) {
        input.addEventListener('input', function () {
          var f = input.getAttribute('data-f');
          if (f === 'pages') {
            book.pages = input.value.split('\n').map(function (line) { return line.trim(); }).filter(function (line) { return line !== ''; });
          } else {
            book[f] = input.value;
          }
        });
      });
      card.querySelectorAll('[data-emoji]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          book.emoji = btn.getAttribute('data-emoji');
          card.querySelectorAll('[data-emoji]').forEach(function (b) {
            b.classList.toggle('picked', b.getAttribute('data-emoji') === book.emoji);
          });
        });
      });
      card.querySelector('[data-remove-book]').addEventListener('click', function () {
        draft.books.splice(i, 1);
        renderSetup();
      });
      return card;
    }
    draft.books.forEach(function (book, i) { booksEl.appendChild(bookCard(book, i)); });
    $('setup-book-add').addEventListener('click', function () {
      draft.books.push({
        id: 'book-' + Date.now().toString(36) + '-' + draft.books.length,
        title: 'New book',
        author: '',
        emoji: '📚',
        pages: ['Once upon a time...']
      });
      renderSetup();
    });

    /* collectDraft must include EVERY editable field — name, about,
       students, student_pins and books — or Setup silently drops it.
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
        students: draft.students.filter(function (n) { return String(n).trim() !== ''; }),
        student_pins: pins,
        books: draft.books.filter(function (b) { return String(b.title || '').trim() !== ''; }).map(function (b) {
          return {
            id: b.id,
            title: String(b.title).trim(),
            author: b.author || '',
            emoji: b.emoji || '📚',
            pages: (b.pages || []).filter(function (p) { return String(p).trim() !== ''; })
          };
        })
      };
    }
    $('setup-save').addEventListener('click', function () {
      var out = $('setup-out');
      out.innerHTML = '<p class="info">Saving…</p>';
      var d = collectDraft();
      rpc('save_kids_reading_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p, p_draft: d }).then(function () {
        draft = d;
        draftStatus = 'editing';
        out.innerHTML = '<p class="info">Draft saved. Children still see the approved books.</p>';
      }).catch(function (err) {
        out.innerHTML = '<p class="error">Could not save: ' + esc(err.message) + '</p>';
      });
    });
    $('setup-upload').addEventListener('click', function () {
      var out = $('setup-out');
      out.innerHTML = '<p class="info">Uploading…</p>';
      var d = collectDraft();
      rpc('submit_kids_reading_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p, p_draft: d }).then(function () {
        draft = d;
        draftStatus = directUploadOn ? 'approved' : 'pending';
        notifyEmail((directUploadOn ? 'Kids Reading upload — live right away: ' : 'Kids Reading draft for approval: ') + (d.name || SLUG), { school: d.name || '', slug: SLUG, status: directUploadOn ? 'Live right away — no approval needed' : undefined });
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
    $('site-name').textContent = 'Reading page not found';
    $('view-play').innerHTML = '<div class="error">This link doesn\'t point to a school yet. Check the link and try again — ask Yently for your reading link.</div>';
  } else {
    resolveSlug().then(function () { return rpc('get_kids_reading_live', { p_slug: SLUG }); }).then(function (json) {
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
        window.ShopChat.mountBubble(chatBox, { ownerType: 'kids-reading', ownerKey: SLUG, shopName: data.name || 'Kids Reading', ownerEmail: '' });
      }
      data.students = data.students || [];
      data.books = data.books || [];
      /* A stored name that now has a PIN must re-enter it: never
         auto-select a PIN student from localStorage. */
      if (currentStudent && (data.pin_students || []).indexOf(currentStudent) !== -1) {
        currentStudent = null;
        try { localStorage.removeItem(STUDENT_KEY); } catch (e) {}
      }
      document.title = data.name || 'Kids Reading';
      var logo = $('site-logo');
      if (data.logo) { logo.src = (/^https?:\/\//.test(data.logo) ? data.logo : BASE + data.logo); logo.hidden = false; }
      $('site-name').textContent = data.name || 'Kids Reading';
      $('site-about').textContent = data.about || '';
      $('site-footer').innerHTML = '<div>Powered by Yently</div>';
      rpc('kids_reading_pass_status', { p_slug: SLUG }).then(function (s) {
        teacherUnlocked = !(s && s.has_pass);
        if (teacherUnlocked) {
          fetchServerScores().then(function () { renderPlay(); });
        } else {
          renderPlay();
        }
      }).catch(function () {
        /* If the status check itself is unreachable, stay open rather
           than locking every teacher out of a working school. */
        teacherUnlocked = true;
        fetchServerScores().then(function () { renderPlay(); });
      });
    }).catch(function () {
      $('site-name').textContent = 'Reading page not found';
      $('view-play').innerHTML = '<div class="error">This link doesn\'t point to a school yet. Check the link and try again.</div>';
    });
  }
})();
