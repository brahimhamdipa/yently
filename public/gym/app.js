/* Gym page app — ONE folder for every gym.
   The gym comes from its own private link, and its info,
   plans, classes, trainers, members, and bookings live in the
   database. Every gym has its own plans and classes,
   but they all use this same page.
   Visitors browse the classes and plans, join as members, book a
   class, or check in with their member number. Payment is at the
   gym — nothing is charged online.
   The Members and Bookings tabs need the gym's shared employee
   password (one password for all staff, set by the admin; gyms with
   none set stay fully open). Setup needs the owner's own username +
   password. Setup edits save as a draft, and the Upload button sends
   the draft to the admin for approval — approval makes it live
   instantly. Joining, confirming members, and check-ins are
   operational: they write straight to the gym's live data, no
   approval needed. All credentials live in memory only: a reload
   asks again, exactly like the other folder pages. */
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
    // Clean link: the middleware rewrites the page server-side, so
    // location.search is empty in the browser. The gym slug is then
    // the last path segment. Ignore this system's own folder name,
    // so a bare /gym visit still shows "not found" by design.
    var segs = location.pathname.split('/').filter(function (s) { return s; });
    var lastSeg = (segs[segs.length - 1] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    if (lastSeg && lastSeg !== 'gym') { SLUG = lastSeg; SLUG_FROM_PATH = true; }
  }
  // Clean link: the name in the link is the CLEAN name, which usually
  // differs from the gym's own slug. The middleware rewrites the
  // page, but the browser address stays clean, so look the clean
  // name up in clean_links (public read) and use the real gym slug.
  // Only runs when the slug came from the path (no query string).
  // Fails open: any error keeps the path slug, and the gym just
  // shows "not found" as before.
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

  var gym = null; // live gym info + plans/classes/trainers (visitors)
  var draft = null; // owner draft (Setup)
  var draftStatus = 'editing';
  var ownerCreds = null; // {u, p} in memory only, never stored
  /* ---------- Shop live chat (per-shop add-on) ---------- */
  /* The visitor bubble mounts once, after the shop's live data loads;
     the shared file checks the per-shop switch itself and renders
     nothing while it is OFF. The owner inbox lives in Setup, behind
     the owner login. NOTE: ShopChat.mountBubble sets its container's
     innerHTML, so it must NOT be given document.body - that would
     wipe the whole page. It gets a dedicated container div instead. */
  var shopChatMounted = false;
  function mountShopChatBubble(shopName, ownerEmail) {
    if (shopChatMounted || !window.ShopChat) return;
    shopChatMounted = true;
    var wrap = document.createElement('div');
    wrap.id = 'shop-chat-wrap';
    document.body.appendChild(wrap);
    window.ShopChat.mountBubble(wrap, { ownerType: 'gym', ownerKey: SLUG, shopName: shopName || 'this shop', ownerEmail: ownerEmail || '' });
  }
  function stopShopChat() {
    var box = $('setup-chats');
    if (box && box._shopChatStop) box._shopChatStop();
  }
  function wireShopChatInbox() {
    var btn = $('setup-chats-toggle');
    var box = $('setup-chats');
    if (!btn || !box) return;
    btn.addEventListener('click', function () {
      if (box._shopChatStop) {
        box._shopChatStop();
        box._shopChatStop = null;
        box.innerHTML = '';
        btn.textContent = 'Open chats';
        return;
      }
      if (!window.ShopChat) {
        box.innerHTML = '<p class="error">Chat could not load. Please try again in a moment.</p>';
        return;
      }
      window.ShopChat.mountInbox(box, { ownerType: 'gym', ownerKey: SLUG, creds: { u: ownerCreds.u, p: ownerCreds.p } });
      btn.textContent = 'Close chats';
    });
  }
  var empPass = null; // employee password in memory only, never stored
  var empUnlocked = false; // true once the employee password is entered, or when the gym has none set
  var passLocked = false;
  var bookings = [];
  var members = [];
  var checkins = [];
  var staffTimer = null;
  var currentView = 'classes';
  var planEditId = null; // plan being edited in Setup, null = adding
  var classEditId = null; // class being edited in Setup, null = adding
  var trainerEditId = null; // trainer being edited in Setup, null = adding
  var planDelId = null; // plan id awaiting an in-page delete confirmation
  var classDelId = null; // class id awaiting an in-page delete confirmation
  var trainerDelId = null; // trainer id awaiting an in-page delete confirmation
  var trainerPhoto = ''; // photo URL for the trainer being added/edited in Setup
  var cancelConfirmId = null; // booking id awaiting an in-page cancel confirmation
  var removeConfirmId = null; // member id awaiting an in-page remove confirmation
  var bookingsErr = ''; // last bookings error, shown inline above the list
  var membersErr = ''; // last members error, shown inline above the list

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* Amounts use thousands separators: $1,500, not $1500.00. Whole
     amounts stay plain ($45); amounts with cents show two decimals. */
  function money(n) {
    var v = Number(n || 0);
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  }
  function fmtDT(iso) {
    var d = new Date(iso);
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function refOf(id) {
    return 'GY-' + String(id).padStart(6, '0');
  }
  function newId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }
  function rpc(name, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify(body)
    }).then(function (res) {
      /* Some calls (save/upload) return no body at all — read text first
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
  /* Best-effort owner email, same shape as the other folder pages: the
     table differs per call (booking, new member, draft approval). */
  function notifyEmail(subject, table, record) {
    try {
      fetch(SUPABASE_URL + '/functions/v1/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
        body: JSON.stringify({ subject: subject, table: table, record: record })
      }).catch(function () {});
    } catch (e) {}
  }
  /* ---------- "?" help popups (request forms) ---------- */
  /* Same pattern as the Direct Upload form on the main site: a "?"
     next to a field label opens a short explanation under it. Tap
     again — or anywhere else on the page — to close it. The popups
     anchor to the field label, so they can never run past the page
     edge and zoom the page on a phone. */
  var HELP_TEXT = {
    name: 'Your own name — the person joining or booking. The gym uses it to know who you are.',
    phone: 'Your phone number, so the gym can reach you about your membership or booking. Digits only is fine — spaces or dashes do no harm.',
    email: 'Your email address — optional. The gym can send your booking or membership details here.',
    plan: 'Pick the membership plan that fits you. The gym confirms your membership after you join.',
    cls: 'Pick the class you want to attend. If a class is full, the gym will tell you when you send the booking.',
    memberRef: 'Your member number (given when you joined) or your full name, exactly as you joined with.',
    note: 'Anything the gym should know — an injury, a first visit, or a question about the class.'
  };
  function helpHtml(key) {
    return '<span class="help"><button type="button" class="help-btn" data-help-btn aria-label="Help">?</button><span class="help-pop" hidden>' + esc(HELP_TEXT[key] || '') + '</span></span>';
  }
  function wireHelp(root) {
    root.querySelectorAll('[data-help-btn]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var pop = b.parentNode.querySelector('.help-pop');
        if (!pop) return;
        var wasHidden = pop.hidden;
        root.querySelectorAll('.help-pop').forEach(function (p) { p.hidden = true; });
        pop.hidden = !wasHidden;
      });
    });
  }
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.help')) return;
    document.querySelectorAll('.help-pop').forEach(function (p) { p.hidden = true; });
  });
  /* ---------- Icon picture (one small square image) ---------- */
  /* The icon lives in the draft/live data as `icon` — a public URL or ''.
     It is uploaded to the product-images bucket, shrunk to 200px on its
     long edge first (same rules as the shop picture uploads: JPEG 0.8,
     PNGs stay PNG, small pictures untouched, any failure falls back to
     the original file). Same pattern as the other folder pages. */
  function shrinkIconImage(file) {
    try {
      return new Promise(function (resolve) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          URL.revokeObjectURL(url);
          var w0 = img.naturalWidth, h0 = img.naturalHeight;
          if (!w0 || !h0 || Math.max(w0, h0) <= 200) { resolve(file); return; }
          var scale = 200 / Math.max(w0, h0);
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(w0 * scale);
          canvas.height = Math.round(h0 * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          var outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          canvas.toBlob(function (blob) {
            if (!blob) { resolve(file); return; }
            var name = outType === 'image/jpeg' ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
            resolve(new File([blob], name, { type: outType }));
          }, outType, 0.8);
        };
        img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      });
    } catch (e) {
      return Promise.resolve(file);
    }
  }
  function uploadIconImage(file) {
    return shrinkIconImage(file).then(function (up) {
      var safe = up.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      var path = 'store/icons/' + SLUG + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
      return fetch(SUPABASE_URL + '/storage/v1/object/product-images/' + path, {
        method: 'POST',
        headers: { 'Content-Type': up.type || 'application/octet-stream', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
        body: up
      }).then(function (res) {
        if (!res.ok) throw new Error('upload failed (HTTP ' + res.status + ')');
        return SUPABASE_URL + '/storage/v1/object/public/product-images/' + path;
      });
    });
  }
  /* Show the live icon next to the business name in the header — only
     when there is one. Created once and re-used, so repeated header
     renders never duplicate it, and removing the icon restores the
     header exactly as it was. */
  function renderHeaderIcon(url) {
    var nameEl = $('site-name');
    if (!nameEl) return;
    var brand = nameEl.closest ? nameEl.closest('.brand') : null;
    if (!brand) {
      var p = nameEl.parentNode;
      brand = p && p.parentNode;
      if (!brand) return;
    }
    var img = brand.querySelector('img.site-icon');
    if (!url) {
      if (img) img.remove();
      return;
    }
    if (!img) {
      img = document.createElement('img');
      img.className = 'site-icon';
      img.alt = '';
      var ref = nameEl.parentNode;
      if (ref === brand) ref = nameEl;
      brand.insertBefore(img, ref);
    }
    if (img.getAttribute('src') !== url) img.setAttribute('src', url);
  }
  /* Wire the icon field in Setup: picking a picture uploads it at once
     and stores the URL on the draft; Remove clears it. The draft is
     only persisted when the owner saves it, like every other field. */
  function wireIconField() {
    var iconFile = $('setup-icon-file');
    if (iconFile) iconFile.addEventListener('change', function () {
      var f = iconFile.files && iconFile.files[0];
      if (!f) return;
      var out = $('setup-icon-out');
      if (out) out.textContent = 'Uploading icon…';
      uploadIconImage(f).then(function (url) {
        draft.icon = url;
        var prev = $('setup-icon-preview');
        if (prev) { prev.src = url; prev.hidden = false; }
        if (out) out.textContent = 'Icon uploaded — save the draft to keep it.';
        iconFile.value = '';
      }).catch(function (err) {
        if (out) out.textContent = 'Could not upload the icon: ' + (err && err.message ? err.message : 'please try again.');
        iconFile.value = '';
      });
    });
    var iconRemove = $('setup-icon-remove');
    if (iconRemove) iconRemove.addEventListener('click', function () {
      draft.icon = '';
      var prev = $('setup-icon-preview');
      if (prev) { prev.src = ''; prev.hidden = true; }
      var out = $('setup-icon-out');
      if (out) out.textContent = 'Icon removed — save the draft to keep it removed.';
      var file = $('setup-icon-file');
      if (file) file.value = '';
    });
  }
  /* ---------- Trainer picture (one picture per trainer) ---------- */
  /* Same shrink + upload rules as the icon (800px long edge, JPEG 0.8,
     PNGs stay PNG, small pictures untouched, failure falls back to the
     original file). Stored under store/gym/ in the product-images
     bucket, which is publicly readable. */
  function shrinkImage(file, maxEdge, quality) {
    maxEdge = maxEdge || 1600;
    quality = quality || 0.85;
    try {
      return new Promise(function (resolve) {
        var url = URL.createObjectURL(file);
        var image = new Image();
        image.onload = function () {
          URL.revokeObjectURL(url);
          var w0 = image.naturalWidth, h0 = image.naturalHeight;
          if (!w0 || !h0 || Math.max(w0, h0) <= maxEdge) { resolve(file); return; }
          var scale = maxEdge / Math.max(w0, h0);
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(w0 * scale);
          canvas.height = Math.round(h0 * scale);
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          var outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          canvas.toBlob(function (blob) {
            if (!blob) { resolve(file); return; }
            var name = outType === 'image/jpeg' ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
            resolve(new File([blob], name, { type: outType }));
          }, outType, quality);
        };
        image.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
        image.src = url;
      }).catch(function () { return file; });
    } catch (e) {
      return Promise.resolve(file);
    }
  }
  function uploadGymPicture(file) {
    return shrinkImage(file, 800, 0.8).then(function (up) {
      var safe = up.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      var path = 'store/gym/' + SLUG + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
      return fetch(SUPABASE_URL + '/storage/v1/object/product-images/' + path, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
        body: up
      }).then(function (res) {
        if (!res.ok) throw new Error('Picture upload failed');
        return SUPABASE_URL + '/storage/v1/object/public/product-images/' + path;
      });
    });
  }
  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  function planById(id) {
    return (gym && gym.plans || []).filter(function (p) { return String(p.id) === String(id); })[0] || null;
  }
  function draftPlanById(id) {
    return (draft && draft.plans || []).filter(function (p) { return String(p.id) === String(id); })[0] || null;
  }
  function classById(id) {
    return (gym && gym.classes || []).filter(function (c) { return String(c.id) === String(id); })[0] || null;
  }
  function draftClassById(id) {
    return (draft && draft.classes || []).filter(function (c) { return String(c.id) === String(id); })[0] || null;
  }
  function draftTrainerById(id) {
    return (draft && draft.trainers || []).filter(function (t) { return String(t.id) === String(id); })[0] || null;
  }
  function planName(id) {
    var p = planById(id);
    return p ? p.name : String(id || '');
  }
  function sortedClasses(list) {
    var arr = (list || []).slice();
    arr.sort(function (a, b) {
      var da = DAYS.indexOf(a.day), db = DAYS.indexOf(b.day);
      if (da !== db) return da - db;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });
    return arr;
  }
  function loadGym() {
    return rpc('get_gym_live', { p_slug: SLUG }).then(function (d) {
      gym = d;
      setHeader();
      return d;
    });
  }

  /* ---------- views ---------- */
  function show(view) {
    currentView = view;
    if (view !== 'setup') stopShopChat();
    ['classes', 'join', 'book', 'checkin', 'members', 'bookings', 'setup'].forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.hidden = v !== view;
    });
    var tabs = document.querySelectorAll('#tabs button');
    tabs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view); });
    if (staffTimer) { clearInterval(staffTimer); staffTimer = null; }
    if (view === 'classes') renderClasses();
    if (view === 'join') renderJoin();
    if (view === 'book') renderBook();
    if (view === 'checkin') renderCheckin();
    if (view === 'members') { renderMembers(); staffTimer = setInterval(function () { if (currentView === 'members' && empUnlocked) loadMembers(true); }, 5000); }
    if (view === 'bookings') { renderBookings(); staffTimer = setInterval(function () { if (currentView === 'bookings' && empUnlocked) loadBookings(true); }, 5000); }
    if (view === 'setup') renderSetup();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-view')); });
  });
  $('to-top').addEventListener('click', function () { window.scrollTo(0, 0); });

  function setHeader() {
    $('site-name').textContent = gym ? gym.name : 'Gym';
    renderHeaderIcon(gym && gym.icon ? gym.icon : '');
    $('site-about').textContent = gym
      ? [gym.address, gym.phone].filter(Boolean).join(' · ')
      : '';
    $('site-footer').innerHTML = gym
      ? esc([gym.address, gym.phone].filter(Boolean).join(' · ')) + '<br>Powered by Yently'
      : 'Powered by Yently';
    document.title = (gym ? gym.name : 'Gym') + ' — Gym';
  }

  /* ---------- Classes (public: gym info, plans, schedule, trainers) ---------- */
  function classPriceLabel(c) {
    var p = Number(c.price || 0);
    return p > 0 ? money(p) + ' per class' : 'Included in membership';
  }
  function classCardHtml(c) {
    return '<div class="item-card">' +
      '<h3>' + esc(c.name) + '</h3>' +
      '<span class="cat">' + esc(c.day || '') + ' · ' + esc(c.time || '') + '</span>' +
      (c.trainer ? '<span class="info">Trainer: ' + esc(c.trainer) + '</span>' : '') +
      '<span class="info">Capacity ' + esc(c.capacity != null ? c.capacity : '—') + '</span>' +
      '<span class="price">' + esc(classPriceLabel(c)) + '</span>' +
      (c.description ? '<p class="info">' + esc(c.description) + '</p>' : '') +
      '</div>';
  }
  function renderClasses() {
    var el = $('view-classes');
    if (!gym) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var h = '<h2>' + esc(gym.name) + '</h2>';
    if (gym.about) h += '<p class="info">' + esc(gym.about) + '</p>';
    if (gym.address || gym.phone || gym.hours || gym.email) {
      h += '<div class="card info">';
      if (gym.address) h += '<p>📍 ' + esc(gym.address) + '</p>';
      if (gym.phone) h += '<p>📞 ' + esc(gym.phone) + '</p>';
      if (gym.hours) h += '<p>🕐 ' + esc(gym.hours) + '</p>';
      if (gym.email) h += '<p>✉️ ' + esc(gym.email) + '</p>';
      h += '</div>';
    }
    var plans = gym.plans || [];
    if (plans.length) {
      h += '<h3>Membership plans</h3><div class="item-grid">';
      plans.forEach(function (p) {
        h += '<div class="item-card"><h3>' + esc(p.name) + '</h3>' +
          '<span class="price">' + money(p.price) + '</span>' +
          (p.duration ? '<span class="cat">' + esc(p.duration) + '</span>' : '') +
          (p.description ? '<p class="info">' + esc(p.description) + '</p>' : '') +
          '</div>';
      });
      h += '</div>';
    }
    var classes = sortedClasses(gym.classes || []);
    if (classes.length) {
      h += '<h3>Class schedule</h3>';
      var days = [];
      var byDay = {};
      classes.forEach(function (c) {
        var d = c.day || 'Any day';
        if (!byDay[d]) { byDay[d] = []; days.push(d); }
        byDay[d].push(c);
      });
      days.forEach(function (d) {
        h += '<h3>' + esc(d) + '</h3><div class="item-grid">';
        byDay[d].forEach(function (c) { h += classCardHtml(c); });
        h += '</div>';
      });
    } else {
      h += '<div class="card"><p class="info">No classes scheduled yet — the owner adds classes in Setup.</p></div>';
    }
    var trainers = gym.trainers || [];
    if (trainers.length) {
      h += '<h3>Trainers</h3><div class="item-grid">';
      trainers.forEach(function (t) {
        h += '<div class="item-card">' +
          (t.photo ? '<img class="trainer-photo" src="' + esc(t.photo) + '" alt="' + esc(t.name) + '">' : '') +
          '<h3>' + esc(t.name) + '</h3>' +
          (t.specialty ? '<span class="cat">' + esc(t.specialty) + '</span>' : '') +
          (t.phone ? '<span class="info">📞 ' + esc(t.phone) + '</span>' : '') +
          (t.bio ? '<p class="info">' + esc(t.bio) + '</p>' : '') +
          '</div>';
      });
      h += '</div>';
    }
    h += '<div class="card"><p class="info">Want to join? Pick a plan on the <b>Join</b> tab, or book a single class from the <b>Book a class</b> tab. You pay at the gym — nothing is charged online.</p></div>';
    el.innerHTML = h;
  }

  /* ---------- Join (public form) ---------- */
  function renderJoin() {
    var el = $('view-join');
    if (!gym) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var plans = gym.plans || [];
    var h = '<h2>Join — ' + esc(gym.name) + '</h2><div class="card direct-help">' +
      '<span class="field-label">Your name ' + helpHtml('name') + '</span><input id="j-name" type="text" placeholder="Full name">' +
      '<span class="field-label">Phone ' + helpHtml('phone') + '</span><input id="j-phone" type="tel" placeholder="Phone number">' +
      '<span class="field-label">Email (optional) ' + helpHtml('email') + '</span><input id="j-email" type="email" placeholder="Email address">' +
      '<span class="field-label">Membership plan ' + helpHtml('plan') + '</span><select id="j-plan">';
    if (!plans.length) h += '<option value="">No plans yet</option>';
    plans.forEach(function (p) {
      h += '<option value="' + esc(p.id) + '">' + esc(p.name) + ' — ' + money(p.price) + (p.duration ? ' / ' + esc(p.duration) : '') + '</option>';
    });
    h += '</select>' +
      '<div class="row"><button id="j-go">Join the gym</button></div>' +
      '<p class="error" id="j-err" hidden></p>' +
      '<div id="j-out" style="margin-top:12px"></div></div>';
    el.innerHTML = h;
    wireHelp(el);
    $('j-go').addEventListener('click', function () {
      var err = $('j-err');
      var out = $('j-out');
      var name = $('j-name').value.trim();
      var phone = $('j-phone').value.trim();
      var email = $('j-email').value.trim();
      var plan = $('j-plan').value;
      if (!name) { err.hidden = false; err.textContent = 'Your name is required.'; return; }
      if (!phone) { err.hidden = false; err.textContent = 'Your phone number is required.'; return; }
      if (!plan) { err.hidden = false; err.textContent = 'Pick a membership plan.'; return; }
      err.hidden = true;
      rpc('join_gym', { p_slug: SLUG, p_name: name, p_phone: phone, p_email: email, p_plan: plan }).then(function (res) {
        var memberId = (res && typeof res === 'object') ? (res.id != null ? res.id : res.member_id) : res;
        var planObj = planById(plan);
        out.innerHTML = '<div class="note"><p><b>✓ Welcome to ' + esc(gym.name) + '!</b></p>' +
          '<p>Your member number is <b>' + esc(memberId) + '</b> — keep it for check-in.</p>' +
          '<p>' + esc(name) + ' · ' + esc(planObj ? planObj.name : plan) + '</p>' +
          '<p>The gym will confirm your membership — show your member number at the front desk on your first visit.</p></div>';
        notifyEmail('New gym member: ' + name, 'gym_shops', { slug: SLUG, name: name, phone: phone, email: email, plan: plan, member_id: memberId });
      }).catch(function (e) {
        err.hidden = false;
        err.textContent = 'Error: ' + e.message;
      });
    });
  }

  /* ---------- Book a class (public form + receipt) ---------- */
  function renderBook() {
    var el = $('view-book');
    if (!gym) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var classes = sortedClasses(gym.classes || []);
    var h = '<h2>Book a class — ' + esc(gym.name) + '</h2><div class="card direct-help">' +
      '<span class="field-label">Class ' + helpHtml('cls') + '</span><select id="b-class">';
    if (!classes.length) h += '<option value="">No classes yet</option>';
    classes.forEach(function (c) {
      h += '<option value="' + esc(c.id) + '">' + esc(c.name) + ' — ' + esc(c.day || '') + ' ' + esc(c.time || '') + (c.trainer ? ' with ' + esc(c.trainer) : '') + ' — ' + esc(classPriceLabel(c)) + '</option>';
    });
    h += '</select>' +
      '<span class="field-label">Your name ' + helpHtml('name') + '</span><input id="b-name" type="text" placeholder="Full name">' +
      '<span class="field-label">Phone ' + helpHtml('phone') + '</span><input id="b-phone" type="tel" placeholder="Phone number">' +
      '<span class="field-label">Email (optional) ' + helpHtml('email') + '</span><input id="b-email" type="email" placeholder="Email address">' +
      '<span class="field-label">Note (optional) ' + helpHtml('note') + '</span><textarea id="b-note" placeholder="Anything the gym should know…"></textarea>' +
      '<div class="row"><button id="b-go">Book this class</button></div>' +
      '<p class="error" id="b-err" hidden></p>' +
      '<div id="b-out" style="margin-top:12px"></div></div>';
    el.innerHTML = h;
    wireHelp(el);
    $('b-go').addEventListener('click', function () {
      var err = $('b-err');
      var out = $('b-out');
      var classId = $('b-class').value;
      var name = $('b-name').value.trim();
      var phone = $('b-phone').value.trim();
      var email = $('b-email').value.trim();
      var note = $('b-note').value.trim();
      if (!classId) { err.hidden = false; err.textContent = 'Pick a class first.'; return; }
      if (!name) { err.hidden = false; err.textContent = 'Your name is required.'; return; }
      if (!phone) { err.hidden = false; err.textContent = 'Your phone number is required.'; return; }
      err.hidden = true;
      var c = classById(classId);
      rpc('place_gym_booking', { p_slug: SLUG, p_member_name: name, p_phone: phone, p_email: email, p_class_id: classId, p_note: note }).then(function (res) {
        var id = (res && typeof res === 'object') ? (res.id != null ? res.id : res.booking_id) : res;
        var ref = refOf(id);
        var total = c ? Number(c.price || 0) : 0;
        out.innerHTML = '<div class="note"><p><b>✓ Class booked — ' + esc(ref) + '</b></p>' +
          '<p>' + esc(c ? c.name : 'Class') + (c ? ' · ' + esc(c.day || '') + ' ' + esc(c.time || '') : '') + '<br>Total: <b>' + money(total) + '</b></p>' +
          '<p>' + esc(name) + ' · ' + esc(phone) + '</p>' +
          '<p>Pay at the gym — show your name and booking number when you arrive.</p></div>';
        notifyEmail('Gym booking ' + ref + ': ' + name, 'gym_bookings', { slug: SLUG, name: name, phone: phone, email: email, class_id: classId, class_name: c ? c.name : '', day: c ? c.day : '', time: c ? c.time : '', total: total, note: note });
      }).catch(function (e) {
        err.hidden = false;
        err.textContent = 'Error: ' + e.message;
      });
    });
  }

  /* ---------- Check-in (public form) ---------- */
  function renderCheckin() {
    var el = $('view-checkin');
    if (!gym) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var h = '<h2>Check-in — ' + esc(gym.name) + '</h2><div class="card direct-help">' +
      '<p class="info">Enter your member number or your full name to check in.</p>' +
      '<span class="field-label">Member number or name ' + helpHtml('memberRef') + '</span><input id="ci-ref" type="text" placeholder="e.g. m-20261114120000 or Alex">' +
      '<div class="row"><button id="ci-go">Check in</button></div>' +
      '<p class="error" id="ci-err" hidden></p>' +
      '<div id="ci-out" style="margin-top:12px"></div></div>';
    el.innerHTML = h;
    wireHelp(el);
    $('ci-go').addEventListener('click', function () {
      var err = $('ci-err');
      var out = $('ci-out');
      var ref = $('ci-ref').value.trim();
      if (!ref) { err.hidden = false; err.textContent = 'Enter your member number or name.'; return; }
      err.hidden = true;
      rpc('checkin_gym_member', { p_slug: SLUG, p_member_ref: ref }).then(function (res) {
        var d = res || {};
        out.innerHTML = '<div class="note"><p><b>✓ Welcome back, ' + esc(d.member_name || ref) + '!</b></p>' +
          '<p>Plan: ' + esc(planName(d.plan)) + '</p>' +
          '<p>Check-ins today: <b>' + esc(d.checkins_today != null ? d.checkins_today : 1) + '</b></p>' +
          '<p>Have a great workout.</p></div>';
      }).catch(function (e) {
        err.hidden = false;
        err.textContent = 'Error: ' + e.message;
      });
    });
  }

  /* ---------- Staff gate (employee password) ---------- */
  function empGate(el, heading, after) {
    el.innerHTML = '<h2>' + heading + '</h2><div class="card">' +
      '<p class="info">Enter the employee password for this gym to see this page.</p>' +
      '<label>Employee password</label><input id="emp-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="emp-go">Unlock</button></div>' +
      '<p class="error" id="emp-err" hidden></p></div>';
    $('emp-go').addEventListener('click', function () {
      var pw = $('emp-pass').value;
      rpc('check_gym_employee_pass', { p_slug: SLUG, p_password: pw }).then(function (ok) {
        if (!ok) {
          var e = $('emp-err');
          e.hidden = false;
          e.textContent = 'Wrong employee password.';
          return;
        }
        empPass = pw;
        empUnlocked = true;
        after();
      }).catch(function (err) {
        var e = $('emp-err');
        e.hidden = false;
        e.textContent = 'Error: ' + err.message;
      });
    });
  }
  function statusBadge(status) {
    var st = String(status || 'pending');
    return '<span class="status-badge st-' + esc(st) + '">' + esc(st) + '</span>';
  }

  /* ---------- Members (employee password) ---------- */
  function loadMembers(quiet) {
    return rpc('list_gym_members', { p_slug: SLUG, p_epass: empPass }).then(function (d) {
      members = d || [];
      return rpc('list_gym_checkins', { p_slug: SLUG, p_epass: empPass }).then(function (c) {
        checkins = c || [];
        if (currentView === 'members') renderMembersList();
        return members;
      });
    }).catch(function (e) { if (!quiet) throw e; });
  }
  function renderMembers() {
    var el = $('view-members');
    if (!gym) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (passLocked && !empUnlocked) { empGate(el, 'Members', renderMembers); return; }
    el.innerHTML = '<h2>Members — ' + esc(gym.name) + '</h2><p class="info">Members refresh on their own every few seconds.</p><div id="members-list"><p class="info">Loading…</p></div><div class="card"><h3>Recent check-ins</h3><div id="checkins-list"><p class="info">Loading…</p></div></div>';
    loadMembers().catch(function (e) {
      var l = $('members-list');
      if (l) l.innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
    });
  }
  function renderMembersList() {
    var el = $('members-list');
    if (!el) return;
    var h = '';
    if (membersErr) h += '<p class="error">' + esc(membersErr) + '</p>';
    if (!members.length) {
      h += '<div class="card"><p class="info">No members yet.</p></div>';
    } else {
      members.forEach(function (m) {
        var st = String(m.status || 'pending');
        h += '<div class="card"><h3>' + esc(m.name) + ' ' + statusBadge(st) + '</h3>' +
          '<p class="info">Member ' + esc(m.id) + (m.joined ? ' · joined ' + esc(m.joined) : '') + '</p>' +
          '<p>Plan: ' + esc(planName(m.plan)) +
          (m.phone ? '<br>Phone: ' + esc(m.phone) : '') +
          (m.email ? '<br>Email: ' + esc(m.email) : '') + '</p>';
        if (st === 'pending') {
          h += '<div class="row"><button class="small" data-confirm-member="' + esc(m.id) + '">Confirm membership</button></div>';
        }
        h += '<div class="row"><button class="small danger" data-remove-member="' + esc(m.id) + '">Remove</button></div>';
        if (removeConfirmId === m.id) {
          h += '<p><b>Remove ' + esc(m.name) + ' from the gym?</b></p><div class="row"><button class="small danger" data-remove-yes="' + esc(m.id) + '">Yes, remove</button><button class="small secondary" data-remove-no="' + esc(m.id) + '">Keep</button></div>';
        }
        h += '</div>';
      });
    }
    el.innerHTML = h;
    el.querySelectorAll('[data-confirm-member]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-confirm-member');
        btn.disabled = true;
        rpc('confirm_gym_member', { p_slug: SLUG, p_epass: empPass, p_member_id: id })
          .then(function () { membersErr = ''; return loadMembers(); })
          .catch(function (e) { membersErr = 'Error: ' + e.message; renderMembersList(); });
      });
    });
    el.querySelectorAll('[data-remove-member]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        removeConfirmId = btn.getAttribute('data-remove-member');
        membersErr = '';
        renderMembersList();
      });
    });
    el.querySelectorAll('[data-remove-no]').forEach(function (btn) {
      btn.addEventListener('click', function () { removeConfirmId = null; renderMembersList(); });
    });
    el.querySelectorAll('[data-remove-yes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-remove-yes');
        btn.disabled = true;
        rpc('remove_gym_member', { p_slug: SLUG, p_epass: empPass, p_member_id: id })
          .then(function () { removeConfirmId = null; membersErr = ''; return loadMembers(); })
          .catch(function (e) { removeConfirmId = null; membersErr = 'Error: ' + e.message; renderMembersList(); });
      });
    });
    var cl = $('checkins-list');
    if (cl) {
      if (!checkins.length) {
        cl.innerHTML = '<p class="info">No check-ins yet.</p>';
      } else {
        var ch = '';
        checkins.forEach(function (c) {
          ch += '<div class="cart-line"><div><b>' + esc(c.member_name) + '</b><br><span class="info">' + esc(c.member_id) + '</span></div><span class="info">' + esc(fmtDT(c.checked_in_at)) + '</span></div>';
        });
        cl.innerHTML = ch;
      }
    }
  }

  /* ---------- Bookings (employee password) ---------- */
  function loadBookings(quiet) {
    return rpc('list_gym_bookings', { p_slug: SLUG, p_epass: empPass }).then(function (d) {
      bookings = d || [];
      if (currentView === 'bookings') renderBookingsList();
      return bookings;
    }).catch(function (e) { if (!quiet) throw e; });
  }
  function renderBookings() {
    var el = $('view-bookings');
    if (!gym) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (passLocked && !empUnlocked) { empGate(el, 'Bookings', renderBookings); return; }
    el.innerHTML = '<h2>Bookings — ' + esc(gym.name) + '</h2><p class="info">Bookings refresh on their own every few seconds.</p><div id="bookings-list"><p class="info">Loading…</p></div>';
    loadBookings().catch(function (e) {
      var l = $('bookings-list');
      if (l) l.innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
    });
  }
  function bookingDetails(b) {
    var d = b.data || {};
    var lines = [];
    if (d.class_name) lines.push('<b>' + esc(d.class_name) + '</b>' + (d.day ? ' · ' + esc(d.day) : '') + (d.time ? ' ' + esc(d.time) : ''));
    if (d.trainer) lines.push('Trainer: ' + esc(d.trainer));
    if (d.member_name) lines.push('Member: ' + esc(d.member_name));
    if (d.phone) lines.push('Phone: ' + esc(d.phone));
    if (d.email) lines.push('Email: ' + esc(d.email));
    if (d.total != null && d.total !== '') lines.push('Total: ' + money(d.total));
    if (d.note) lines.push('Note: ' + esc(d.note));
    return lines.join('<br>');
  }
  function renderBookingsList() {
    var el = $('bookings-list');
    if (!el) return;
    if (!bookings.length) { el.innerHTML = '<div class="card"><p class="info">No bookings yet.</p></div>'; return; }
    var h = '';
    if (bookingsErr) h += '<p class="error">' + esc(bookingsErr) + '</p>';
    bookings.forEach(function (b) {
      var st = String(b.status || 'pending');
      h += '<div class="card"><h3>Booking ' + esc(refOf(b.id)) + ' ' + statusBadge(st) + '</h3>' +
        '<p class="info">' + esc(fmtDT(b.created_at)) + '</p>' +
        '<p>' + bookingDetails(b) + '</p>';
      if (st === 'pending') {
        h += '<div class="row"><button class="small" data-advance="' + b.id + '" data-to="confirmed">Confirm</button>' +
          '<button class="small danger" data-cancel="' + b.id + '">Cancel</button></div>';
      } else if (st === 'confirmed') {
        h += '<div class="row"><button class="small" data-advance="' + b.id + '" data-to="done">Mark done</button>' +
          '<button class="small danger" data-cancel="' + b.id + '">Cancel</button></div>';
      }
      if (cancelConfirmId === b.id) {
        h += '<p><b>Cancel this booking?</b></p><div class="row"><button class="small danger" data-cancel-yes="' + b.id + '">Yes, cancel</button><button class="small secondary" data-cancel-no="' + b.id + '">Keep it</button></div>';
      }
      h += '</div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-advance]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-advance'));
        var to = btn.getAttribute('data-to');
        btn.disabled = true;
        rpc('update_gym_booking', { p_slug: SLUG, p_epass: empPass, p_kind: 'booking', p_id: id, p_status: to })
          .then(function () { bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { bookingsErr = 'Error: ' + e.message; renderBookingsList(); });
      });
    });
    el.querySelectorAll('[data-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cancelConfirmId = Number(btn.getAttribute('data-cancel'));
        bookingsErr = '';
        renderBookingsList();
      });
    });
    el.querySelectorAll('[data-cancel-no]').forEach(function (btn) {
      btn.addEventListener('click', function () { cancelConfirmId = null; renderBookingsList(); });
    });
    el.querySelectorAll('[data-cancel-yes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-cancel-yes'));
        btn.disabled = true;
        rpc('update_gym_booking', { p_slug: SLUG, p_epass: empPass, p_kind: 'booking', p_id: id, p_status: 'cancelled' })
          .then(function () { cancelConfirmId = null; bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { cancelConfirmId = null; bookingsErr = 'Error: ' + e.message; renderBookingsList(); });
      });
    });
  }

  /* ---------- Setup (owner) ---------- */
  function renderSetup() {
    stopShopChat(); // re-render destroys the inbox container; stop its poll first
    var el = $('view-setup');
    if (!gym) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (!ownerCreds) {
      el.innerHTML = '<h2>Setup</h2><div class="card">' +
        '<p class="info">Enter the username and password Yently gave this gym.</p>' +
        '<label>Username</label><input id="st-user" type="text" autocomplete="username">' +
        '<label>Password</label><input id="st-pass" type="password" autocomplete="current-password">' +
        '<div class="row"><button id="st-go">Log in</button></div>' +
        '<p class="error" id="st-err" hidden></p></div>';
      $('st-go').addEventListener('click', function () {
        var u = $('st-user').value.trim();
        var p = $('st-pass').value;
        rpc('check_gym_login', { p_slug: SLUG, p_u: u, p_p: p }).then(function (ok) {
          if (!ok) {
            var e = $('st-err');
            e.hidden = false;
            e.textContent = 'Wrong username or password.';
            return;
          }
          ownerCreds = { u: u, p: p };
          loadDraft();
        }).catch(function (err) {
          var e = $('st-err');
          e.hidden = false;
          e.textContent = 'Error: ' + err.message;
        });
      });
      return;
    }
    if (!draft) {
      el.innerHTML = '<p class="info">Loading your setup…</p>';
      loadDraft();
      return;
    }
    var dayOpts = DAYS.map(function (d) { return '<option value="' + d + '">' + d + '</option>'; }).join('');
    var h = '<h2>Setup — ' + esc(gym.name) + '</h2>' +
      '<div class="card"><h3>Gym details</h3>' +
      '<p class="info">Changes save as a draft. Upload for approval and the admin makes them live.</p>' +
      '<label>Gym name</label><input id="d-name" type="text" value="' + esc(draft.name || '') + '">' +
      '<label>Icon picture</label>' +
      '<div class="icon-field">' +
      '<img id="setup-icon-preview" class="icon-preview" src="' + esc(draft.icon || '') + '" alt=""' + (draft.icon ? '' : ' hidden') + '>' +
      '<input id="setup-icon-file" type="file" accept="image/*">' +
      '<button type="button" id="setup-icon-remove" class="small secondary">Remove icon</button>' +
      '</div>' +
      '<p class="info" id="setup-icon-out">One small picture shown next to the gym name. It is shrunk to 200px before uploading.</p>' +
      '<label>Address</label><input id="d-address" type="text" value="' + esc(draft.address || '') + '">' +
      '<label>Phone</label><input id="d-phone" type="tel" value="' + esc(draft.phone || '') + '">' +
      '<label>Email</label><input id="d-email" type="email" value="' + esc(draft.email || '') + '">' +
      '<label>Hours</label><input id="d-hours" type="text" value="' + esc(draft.hours || '') + '">' +
      '<label>About</label><textarea id="d-about">' + esc(draft.about || '') + '</textarea>' +
      '<div class="row"><button id="d-save">Save draft</button>' +
      '<button id="d-upload" class="secondary">Upload for approval</button></div>' +
      '<p class="info" id="d-status">Draft status: ' + esc(draftStatus) + (draftStatus === 'pending' ? ' — waiting for Yently to approve it.' : draftStatus === 'approved' ? ' — approved, live now.' : ' — not sent yet.') + '</p>' +
      '<p class="error" id="d-err" hidden></p></div>' +
      '<div class="card"><h3>Membership plans</h3>' +
      '<p class="info">Plans are part of the draft — save the draft to keep plan changes.</p>' +
      '<div id="plans-list"></div>' +
      '<h3 id="plan-form-title">Add a plan</h3>' +
      '<label>Name</label><input id="p-name" type="text" placeholder="e.g. Monthly">' +
      '<label>Price</label><input id="p-price" type="number" min="0" step="0.01" inputmode="decimal">' +
      '<label>Duration</label><input id="p-duration" type="text" placeholder="e.g. 1 month">' +
      '<label>Description</label><textarea id="p-desc"></textarea>' +
      '<div class="row"><button id="p-save">Save plan</button>' +
      '<button id="p-cancel" class="secondary" hidden>Cancel edit</button></div>' +
      '<p class="error" id="p-err" hidden></p></div>' +
      '<div class="card"><h3>Classes</h3>' +
      '<p class="info">Classes are part of the draft — save the draft to keep class changes.</p>' +
      '<div id="classes-list"></div>' +
      '<h3 id="class-form-title">Add a class</h3>' +
      '<label>Name</label><input id="c-name" type="text" placeholder="e.g. Yoga">' +
      '<label>Trainer</label><input id="c-trainer" type="text" placeholder="Trainer name">' +
      '<label>Day</label><select id="c-day">' + dayOpts + '</select>' +
      '<label>Time</label><input id="c-time" type="time" value="07:00">' +
      '<label>Capacity</label><input id="c-capacity" type="number" min="1" step="1" inputmode="numeric" value="20">' +
      '<label>Price (0 = included in membership)</label><input id="c-price" type="number" min="0" step="0.01" inputmode="decimal" value="0">' +
      '<label>Description</label><textarea id="c-desc"></textarea>' +
      '<div class="row"><button id="c-save">Save class</button>' +
      '<button id="c-cancel" class="secondary" hidden>Cancel edit</button></div>' +
      '<p class="error" id="c-err" hidden></p></div>' +
      '<div class="card"><h3>Trainers</h3>' +
      '<p class="info">Trainers are part of the draft — save the draft to keep trainer changes.</p>' +
      '<div id="trainers-list"></div>' +
      '<h3 id="trainer-form-title">Add a trainer</h3>' +
      '<label>Name</label><input id="t-name" type="text" placeholder="Trainer name">' +
      '<label>Specialty</label><input id="t-specialty" type="text" placeholder="e.g. Yoga &amp; Pilates">' +
      '<label>Phone</label><input id="t-phone" type="tel">' +
      '<label>Bio</label><textarea id="t-bio"></textarea>' +
      '<label>Photo</label>' +
      '<div class="icon-field">' +
      '<img id="t-photo-preview" class="icon-preview" src="" alt="" hidden>' +
      '<input id="t-photo-file" type="file" accept="image/*">' +
      '<button type="button" id="t-photo-remove" class="small secondary">Remove photo</button>' +
      '</div>' +
      '<p class="info" id="t-photo-out">One picture for this trainer. It is shrunk before uploading.</p>' +
      '<div class="row"><button id="t-save">Save trainer</button>' +
      '<button id="t-cancel" class="secondary" hidden>Cancel edit</button></div>' +
      '<p class="error" id="t-err" hidden></p></div>' +
      '<div class="card"><h3>Chats</h3>' +
      '<p class="info">Messages from visitors on this page. Visitors only see the chat bubble once Yently switches live chat on for this shop.</p>' +
      '<div class="row"><button type="button" id="setup-chats-toggle" class="secondary">Open chats</button></div>' +
      '<div id="setup-chats"></div></div>';
    el.innerHTML = h;
    wireShopChatInbox();
    renderPlansList();
    renderClassesList();
    renderTrainersList();
    $('d-save').addEventListener('click', function () { saveDraft(false); });
    $('d-upload').addEventListener('click', function () { saveDraft(true); });
    $('p-save').addEventListener('click', savePlan);
    $('p-cancel').addEventListener('click', function () { planEditId = null; renderSetup(); });
    $('c-save').addEventListener('click', saveClass);
    $('c-cancel').addEventListener('click', function () { classEditId = null; renderSetup(); });
    $('t-save').addEventListener('click', saveTrainer);
    $('t-cancel').addEventListener('click', function () { trainerEditId = null; trainerPhoto = ''; renderSetup(); });
    if (!trainerEditId) trainerPhoto = '';
    renderTrainerPhoto();
    $('t-photo-file').addEventListener('change', onTrainerPhotoChosen);
    $('t-photo-remove').addEventListener('click', function () {
      trainerPhoto = '';
      renderTrainerPhoto();
      var out = $('t-photo-out');
      if (out) out.textContent = 'Photo removed — save the trainer to keep it removed.';
      var file = $('t-photo-file');
      if (file) file.value = '';
    });
    wireIconField();
  }
  /* Copy whatever the owner typed in the details fields into the draft
     in memory, so saving a plan/class/trainer (which re-renders Setup)
     never silently drops unsaved detail edits. The draft is only
     persisted when the owner clicks Save draft. */
  function syncDetails() {
    if (!draft) return;
    if ($('d-name')) draft.name = $('d-name').value.trim();
    if ($('d-address')) draft.address = $('d-address').value.trim();
    if ($('d-phone')) draft.phone = $('d-phone').value.trim();
    if ($('d-email')) draft.email = $('d-email').value.trim();
    if ($('d-hours')) draft.hours = $('d-hours').value.trim();
    if ($('d-about')) draft.about = $('d-about').value.trim();
  }
  function renderPlansList() {
    var el = $('plans-list');
    if (!el) return;
    var plans = draft.plans || [];
    if (!plans.length) { el.innerHTML = '<p class="info">No plans yet.</p>'; return; }
    var h = '';
    plans.forEach(function (p) {
      h += '<div class="cart-line"><div><b>' + esc(p.name) + '</b><br><span class="info">' + money(p.price) + (p.duration ? ' · ' + esc(p.duration) : '') + '</span></div>' +
        '<div class="row"><button class="small secondary" data-edit-plan="' + esc(p.id) + '">Edit</button>' +
        (planDelId === p.id
          ? '<span><b>Delete "' + esc(p.name) + '"?</b> <button class="small danger" data-del-plan-yes="' + esc(p.id) + '">Yes, delete</button> <button class="small secondary" data-del-plan-no="' + esc(p.id) + '">Keep it</button></span>'
          : '<button class="small danger" data-del-plan="' + esc(p.id) + '">Delete</button>') + '</div></div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-edit-plan]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = draftPlanById(b.getAttribute('data-edit-plan'));
        if (!p) return;
        planEditId = p.id;
        $('p-name').value = p.name || '';
        $('p-price').value = p.price == null ? '' : p.price;
        $('p-duration').value = p.duration || '';
        $('p-desc').value = p.description || '';
        $('plan-form-title').textContent = 'Edit plan — ' + p.name;
        $('p-cancel').hidden = false;
        window.scrollTo(0, document.getElementById('plan-form-title').offsetTop - 80);
      });
    });
    el.querySelectorAll('[data-del-plan]').forEach(function (b) {
      b.addEventListener('click', function () {
        planDelId = b.getAttribute('data-del-plan');
        renderPlansList();
      });
    });
    el.querySelectorAll('[data-del-plan-no]').forEach(function (b) {
      b.addEventListener('click', function () { planDelId = null; renderPlansList(); });
    });
    el.querySelectorAll('[data-del-plan-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        syncDetails();
        draft.plans = (draft.plans || []).filter(function (p) { return String(p.id) !== String(b.getAttribute('data-del-plan-yes')); });
        planDelId = null;
        renderSetup();
      });
    });
  }
  function collectPlan() {
    var price = $('p-price').value.trim();
    return {
      name: $('p-name').value.trim(),
      price: price === '' ? 0 : Number(price),
      duration: $('p-duration').value.trim(),
      description: $('p-desc').value.trim()
    };
  }
  function savePlan() {
    var err = $('p-err');
    var v = collectPlan();
    if (!v.name) { err.hidden = false; err.textContent = 'Plan name is required.'; return; }
    if (!(v.price >= 0)) { err.hidden = false; err.textContent = 'Price must be 0 or more.'; return; }
    err.hidden = true;
    syncDetails();
    if (!draft.plans) draft.plans = [];
    if (planEditId) {
      v.id = planEditId;
      var i = draft.plans.findIndex(function (p) { return String(p.id) === String(planEditId); });
      if (i >= 0) draft.plans[i] = v;
      planEditId = null;
    } else {
      v.id = newId('plan');
      draft.plans.push(v);
    }
    renderSetup();
  }
  function renderClassesList() {
    var el = $('classes-list');
    if (!el) return;
    var classes = sortedClasses(draft.classes || []);
    if (!classes.length) { el.innerHTML = '<p class="info">No classes yet.</p>'; return; }
    var h = '';
    classes.forEach(function (c) {
      h += '<div class="cart-line"><div><b>' + esc(c.name) + '</b><br><span class="info">' + esc(c.day || '') + ' ' + esc(c.time || '') + (c.trainer ? ' · ' + esc(c.trainer) : '') + ' · Capacity ' + esc(c.capacity != null ? c.capacity : '—') + ' · ' + esc(classPriceLabel(c)) + '</span></div>' +
        '<div class="row"><button class="small secondary" data-edit-class="' + esc(c.id) + '">Edit</button>' +
        (classDelId === c.id
          ? '<span><b>Delete "' + esc(c.name) + '"?</b> <button class="small danger" data-del-class-yes="' + esc(c.id) + '">Yes, delete</button> <button class="small secondary" data-del-class-no="' + esc(c.id) + '">Keep it</button></span>'
          : '<button class="small danger" data-del-class="' + esc(c.id) + '">Delete</button>') + '</div></div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-edit-class]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = draftClassById(b.getAttribute('data-edit-class'));
        if (!c) return;
        classEditId = c.id;
        $('c-name').value = c.name || '';
        $('c-trainer').value = c.trainer || '';
        $('c-day').value = c.day || 'Monday';
        $('c-time').value = c.time || '07:00';
        $('c-capacity').value = c.capacity == null ? '' : c.capacity;
        $('c-price').value = c.price == null ? '' : c.price;
        $('c-desc').value = c.description || '';
        $('class-form-title').textContent = 'Edit class — ' + c.name;
        $('c-cancel').hidden = false;
        window.scrollTo(0, document.getElementById('class-form-title').offsetTop - 80);
      });
    });
    el.querySelectorAll('[data-del-class]').forEach(function (b) {
      b.addEventListener('click', function () {
        classDelId = b.getAttribute('data-del-class');
        renderClassesList();
      });
    });
    el.querySelectorAll('[data-del-class-no]').forEach(function (b) {
      b.addEventListener('click', function () { classDelId = null; renderClassesList(); });
    });
    el.querySelectorAll('[data-del-class-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        syncDetails();
        draft.classes = (draft.classes || []).filter(function (c) { return String(c.id) !== String(b.getAttribute('data-del-class-yes')); });
        classDelId = null;
        renderSetup();
      });
    });
  }
  function collectClass() {
    var price = $('c-price').value.trim();
    var cap = $('c-capacity').value.trim();
    return {
      name: $('c-name').value.trim(),
      trainer: $('c-trainer').value.trim(),
      day: $('c-day').value,
      time: $('c-time').value,
      capacity: cap === '' ? 0 : Number(cap),
      price: price === '' ? 0 : Number(price),
      description: $('c-desc').value.trim()
    };
  }
  function saveClass() {
    var err = $('c-err');
    var v = collectClass();
    if (!v.name) { err.hidden = false; err.textContent = 'Class name is required.'; return; }
    if (!(v.capacity >= 1)) { err.hidden = false; err.textContent = 'Capacity must be 1 or more.'; return; }
    if (!(v.price >= 0)) { err.hidden = false; err.textContent = 'Price must be 0 or more.'; return; }
    err.hidden = true;
    syncDetails();
    if (!draft.classes) draft.classes = [];
    if (classEditId) {
      v.id = classEditId;
      var i = draft.classes.findIndex(function (c) { return String(c.id) === String(classEditId); });
      if (i >= 0) draft.classes[i] = v;
      classEditId = null;
    } else {
      v.id = newId('class');
      draft.classes.push(v);
    }
    renderSetup();
  }
  function renderTrainersList() {
    var el = $('trainers-list');
    if (!el) return;
    var trainers = draft.trainers || [];
    if (!trainers.length) { el.innerHTML = '<p class="info">No trainers yet.</p>'; return; }
    var h = '';
    trainers.forEach(function (t) {
      h += '<div class="cart-line"><div><b>' + esc(t.name) + '</b><br><span class="info">' + esc(t.specialty || '') + (t.phone ? ' · ' + esc(t.phone) : '') + '</span></div>' +
        '<div class="row"><button class="small secondary" data-edit-trainer="' + esc(t.id) + '">Edit</button>' +
        (trainerDelId === t.id
          ? '<span><b>Delete "' + esc(t.name) + '"?</b> <button class="small danger" data-del-trainer-yes="' + esc(t.id) + '">Yes, delete</button> <button class="small secondary" data-del-trainer-no="' + esc(t.id) + '">Keep it</button></span>'
          : '<button class="small danger" data-del-trainer="' + esc(t.id) + '">Delete</button>') + '</div></div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-edit-trainer]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = draftTrainerById(b.getAttribute('data-edit-trainer'));
        if (!t) return;
        trainerEditId = t.id;
        trainerPhoto = t.photo || '';
        $('t-name').value = t.name || '';
        $('t-specialty').value = t.specialty || '';
        $('t-phone').value = t.phone || '';
        $('t-bio').value = t.bio || '';
        renderTrainerPhoto();
        $('trainer-form-title').textContent = 'Edit trainer — ' + t.name;
        $('t-cancel').hidden = false;
        window.scrollTo(0, document.getElementById('trainer-form-title').offsetTop - 80);
      });
    });
    el.querySelectorAll('[data-del-trainer]').forEach(function (b) {
      b.addEventListener('click', function () {
        trainerDelId = b.getAttribute('data-del-trainer');
        renderTrainersList();
      });
    });
    el.querySelectorAll('[data-del-trainer-no]').forEach(function (b) {
      b.addEventListener('click', function () { trainerDelId = null; renderTrainersList(); });
    });
    el.querySelectorAll('[data-del-trainer-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        syncDetails();
        draft.trainers = (draft.trainers || []).filter(function (t) { return String(t.id) !== String(b.getAttribute('data-del-trainer-yes')); });
        trainerDelId = null;
        renderSetup();
      });
    });
  }
  function renderTrainerPhoto() {
    var prev = $('t-photo-preview');
    if (!prev) return;
    if (trainerPhoto) { prev.src = trainerPhoto; prev.hidden = false; }
    else { prev.src = ''; prev.hidden = true; }
  }
  function onTrainerPhotoChosen() {
    var input = $('t-photo-file');
    var out = $('t-photo-out');
    var files = (input && input.files) ? Array.prototype.slice.call(input.files) : [];
    if (!files.length) return;
    input.value = '';
    if (out) out.textContent = 'Uploading photo…';
    uploadGymPicture(files[0]).then(function (url) {
      trainerPhoto = url;
      renderTrainerPhoto();
      if (out) out.textContent = 'Photo uploaded — save the trainer to keep it.';
    }).catch(function (err) {
      if (out) out.textContent = 'Could not upload the photo: ' + (err && err.message ? err.message : 'please try again.');
    });
  }
  function collectTrainer() {
    return {
      name: $('t-name').value.trim(),
      specialty: $('t-specialty').value.trim(),
      phone: $('t-phone').value.trim(),
      bio: $('t-bio').value.trim(),
      photo: trainerPhoto || ''
    };
  }
  function saveTrainer() {
    var err = $('t-err');
    var v = collectTrainer();
    if (!v.name) { err.hidden = false; err.textContent = 'Trainer name is required.'; return; }
    err.hidden = true;
    syncDetails();
    if (!draft.trainers) draft.trainers = [];
    if (trainerEditId) {
      v.id = trainerEditId;
      var i = draft.trainers.findIndex(function (t) { return String(t.id) === String(trainerEditId); });
      if (i >= 0) draft.trainers[i] = v;
      trainerEditId = null;
      trainerPhoto = '';
    } else {
      v.id = newId('t');
      draft.trainers.push(v);
      trainerPhoto = '';
    }
    renderSetup();
  }
  function collectDraft() {
    /* EVERY draft field must be here, or Setup save silently drops it.
       Members are NOT edited in Setup — they are operational (join /
       confirm / remove write live data directly) — but they are carried
       through from the loaded draft so saving a draft never wipes them. */
    return {
      name: $('d-name').value.trim(),
      address: $('d-address').value.trim(),
      phone: $('d-phone').value.trim(),
      email: $('d-email').value.trim(),
      hours: $('d-hours').value.trim(),
      about: $('d-about').value.trim(),
      icon: draft.icon || '',
      plans: draft.plans || [],
      classes: draft.classes || [],
      trainers: draft.trainers || [],
      members: draft.members || []
    };
  }
  function saveDraft(upload) {
    var d = collectDraft();
    var err = $('d-err');
    if (!d.name) { err.hidden = false; err.textContent = 'Gym name is required.'; return; }
    err.hidden = true;
    rpc('save_gym_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_draft: d })
      .then(function () {
        draft = d;
        draftStatus = 'editing';
        if (!upload) {
          $('d-status').textContent = 'Draft status: editing — saved, not sent yet.';
          return;
        }
        return rpc('submit_gym_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p }).then(function () {
          draftStatus = 'pending';
          $('d-status').textContent = 'Draft status: pending — waiting for Yently to approve it.';
          notifyEmail('Gym draft for approval: ' + d.name, 'gym_draft', { slug: SLUG, name: d.name });
        });
      })
      .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
  }
  function loadDraft() {
    rpc('get_gym_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p })
      .then(function (d) {
        draft = d || {};
        draftStatus = 'editing';
        renderSetup();
      })
      .catch(function (e) {
        var el = $('view-setup');
        el.innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
      });
  }

  /* ---------- start ---------- */
  function init() {
    if (!SLUG) {
      $('site-name').textContent = 'Gym';
      $('view-classes').innerHTML = '<div class="card"><h2>Gym not found</h2><p class="info">This gym page needs your own gym link — ask Yently for it.</p></div>';
      return;
    }
    loadGym().then(function (d) {
      if (!d) {
        $('site-name').textContent = 'Gym';
        $('view-classes').innerHTML = '<div class="card"><h2>Gym not found</h2><p class="info">No gym with this link yet. Ask Yently to set it up.</p></div>';
        return;
      }
      mountShopChatBubble(d.name, '');
      return rpc('gym_pass_status', { p_slug: SLUG }).then(function (st) {
        passLocked = st === 'locked';
        empUnlocked = !passLocked;
        renderClasses();
      });
    }).catch(function (e) {
      $('view-classes').innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
    });
  }
  resolveSlug().then(function () { init(); });
})();
