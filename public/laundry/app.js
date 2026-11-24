/* Laundry page app — ONE folder for every laundry.
   The laundry comes from its own private link, and its info,
   services, and orders live in the database — there is no data.json
   file here. Every laundry has its own services and orders,
   but they all use this same page.
   Visitors browse the services, add them to a basket, and place an
   order for pickup or delivery on a chosen date. Payment is when the
   clothes are collected or delivered — nothing is charged online.
   The Orders tab needs the laundry's shared employee password
   (one password for all staff, set by the admin; laundries with
   none set stay fully open). Setup needs the owner's own username +
   password. Setup edits save as a draft, and the Upload button sends
   the draft to the admin for approval — approval makes it live
   instantly. Services are different: the owner adds, edits,
   and deletes them live in Setup, no approval needed. All credentials
   live in memory only: a reload asks again, exactly like the other
   folder pages. */
(function () {
  'use strict';

  /* Belt-and-braces against sideways scroll on phones (diner root
     cause, 2026-11-18): Setup has file inputs and style.css gives
     body no overflow-x guard and file inputs no max-width — the
     .icon-field override is width:auto + min-width:180px. Injected
     here so the guard ships with this file (style.css is separate). */
  (function () {
    var st = document.createElement('style');
    st.textContent = 'input[type="file"]{max-width:100%;}body{overflow-x:hidden;}';
    document.head.appendChild(st);
  })();

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
  var SLUG = String(params.l || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
  var SLUG_FROM_PATH = false;
  var slugResolved = false;
  if (!SLUG) {
    // Clean link (yently.com/<slug>): the middleware rewrites the
    // page server-side, so location.search is empty in the browser.
    // The laundry slug is then the last path segment. Ignore this
    // system's own folder name, so a bare /laundry visit still
    // shows "not found" by design.
    var segs = location.pathname.split('/').filter(function (s) { return s; });
    var lastSeg = (segs[segs.length - 1] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    if (lastSeg && lastSeg !== 'laundry') { SLUG = lastSeg; SLUG_FROM_PATH = true; }
  }
  // Clean link (yently.com/<slug>): the name in the link is the CLEAN
  // name, which usually differs from the laundry's own slug.
  // The middleware rewrites the page, but the browser address stays
  // clean, so look the clean name up in clean_links (public read)
  // and use the real laundry slug. Only runs when the slug came from
  // the path (no ?l= query). Fails open: any error keeps
  // the path slug, and the laundry just shows "not found" as before.
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

  var laundry = null; // live laundry info + services (visitors)
  var draft = null; // owner draft (Setup)
  var draftStatus = 'editing';
  /* Direct Upload: when Yently has switched it on for this shop,
     an upload goes live straight away instead of waiting for
     approval. Checked once when Setup opens and cached for the
     session; any failure leaves it off, so the old wording stays. */
  var directUploadOn = false;
    var reportsOn = false;
  /* Add-ons section (see renderAddonsSection): TV Gallery and
     Live Chat switches + Clean Link state, fetched in openSetup
     and cached for the session; any failure leaves them off, so
     the section shows the add lines. cleanLinkSlug is the shop's
     live clean-link word, fetched on demand for the "Your live
     link" line. addonsSelected is the add-on whose details panel
     is open ('' = none). */
  var tvGalleryOn = false;
  var chatOn = false;
  var hasCleanLink = false;
  var cleanLinkSlug = '';
  var addonsSelected = '';
  var brandingRemoved = false; // the "Powered by Yently" banner is off for this shop — for the Add-ons section (branding_removed, fetched in openSetup)
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
    window.ShopChat.mountBubble(wrap, { ownerType: 'laundry', ownerKey: SLUG, shopName: shopName || 'this shop', ownerEmail: ownerEmail || '' });
  }
  function stopShopChat() {
    var box = $('setup-addons-chat-inbox');
    if (box && box._shopChatStop) { box._shopChatStop(); box._shopChatStop = null; }
  }
  /* ---------- Setup Add-ons section ---------- */
  /* One section for every add-on this page can take — Clean Link,
     TV Gallery, Live Chat, Direct Upload, Reports — replacing the
     old one-line-per-add-on Setup lines. The ☰ button opens the
     add-on list; picking one shows its details (what it does, what
     it costs, its action) below. The "Your add-ons" list shows each
     add-on's state, read from the switch RPCs fetched in openSetup.
     Add actions open the cart with the add-on line for this shop —
     free for the rest of this month, charged from the next payment.
     No draft fields: the section only reads switches and writes
     cart lines. The Live Chat conversations + reply box live inside
     the Live Chat details panel when chat is ON (mounted from
     ShopChat) — there is no separate Chats section in Setup any
     more, and when chat is OFF there is no chat UI in Setup at all.
     TV Gallery has no shop→gallery-link mapping in the data (the
     admin names the upload form by hand), so its ON state names no
     link — the gallery link was sent to the customer by email when
     Yently set it up. */
  var ADDONS_SYSTEM = 'laundry';
  /* "Powered by Yently" banner: a small navy strip at the bottom
     of the page, with the Yently logo, linking to yently.com. It is
     on by default. It hides only when the customer ordered the
     Remove Branding add-on ($5/month, first month free) and Yently
     switched it on for this shop (branding_removed). The banner is
     the default: if the check errors or answers nothing, the
     banner stays — a failed check never takes the branding off. */
  var YENTLY_BADGE_HTML = '<div id="yently-badge" style="margin-top:10px;background:#161d44;border-radius:8px;padding:8px 12px;text-align:center;"><a href="https://yently.com" target="_blank" rel="noopener" style="color:#fff;text-decoration:none;display:inline-flex;align-items:center;gap:8px;font-size:13px;"><img src="/logo.webp" alt="Yently" style="height:20px;width:auto;border-radius:4px;">Powered by Yently</a></div>';
  function hideYentlyBadgeIfRemoved() {
    if (!SLUG) return;
    rpc('branding_removed', { p_owner_type: ADDONS_SYSTEM, p_owner_key: SLUG }).then(function (removed) {
      if (removed) { var b = $('yently-badge'); if (b) b.style.display = 'none'; }
    }).catch(function () { /* banner stays */ });
  }
  function addonsActiveRows() {
    var rows = [
      ['Clean Link', hasCleanLink],
      ['TV Gallery', tvGalleryOn],
      ['Live Chat', chatOn],
      ['Direct Upload', directUploadOn],
      ['Reports', reportsOn],
      ['Remove Branding', brandingRemoved],
    ];
    return rows.map(function (r) {
      return '<li>' + esc(r[0]) + ' — <b>' + (r[1] ? 'Active' : 'Not added') + '</b></li>';
    }).join('');
  }
  function renderAddonDetails(key) {
    stopShopChat(); // a chat inbox from another pick must stop polling first
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
    } else if (key === 'tv') {
      html = '<h4 style="margin:0 0 6px;">TV Gallery — $2/month</h4>' +
        '<p class="info">Your pictures on the big screen — slideshow and one-picture display, up to 7 pictures, with your message rolling across the bottom.</p>';
      if (tvGalleryOn) {
        html += '<p class="info"><b>TV Gallery is on for this page.</b> Your gallery link was sent to you by email when Yently set it up.</p>';
      } else {
        html += '<p class="info">' + add('tv:website', 'TV Gallery') + ' — $2/month, first month free, free for the rest of this month.</p>';
      }
    } else if (key === 'chat') {
      html = '<h4 style="margin:0 0 6px;">Live Chat — $3/month</h4>' +
        '<p class="info">A chat bubble on your page — visitors tap it and message you, and every message reaches you by email.</p>';
      if (chatOn) {
        html += '<p class="info"><b>Live chat is on for this page</b> — visitors see the chat bubble. Answer them here:</p><div id="setup-addons-chat-inbox"></div>';
      } else {
        html += '<p class="info">' + add('chat:website', 'Live Chat') + ' — $3/month, first month free, free for the rest of this month.</p>';
      }
    } else if (key === 'direct') {
      html = '<h4 style="margin:0 0 6px;">Direct Upload — $5/month</h4>' +
        '<p class="info">Your uploads go live the moment you send them — no waiting for approval.</p>';
      if (directUploadOn) {
        html += '<p class="info"><b>Direct Upload is on for this page</b> — your uploads go live right away.</p>';
      } else {
        html += '<p class="info">' + add('direct:website', 'Direct Upload') + ' — $5/month, first month free, free for the rest of this month.</p>';
      }
    } else if (key === 'reports') {
      html = '<h4 style="margin:0 0 6px;">Reports — $5/month</h4>' +
        '<p class="info">Your orders and bookings in one clear view — totals, counts by status, date filters, print and PDF.</p>';
      if (reportsOn) {
        html += '<p class="info"><b>Reports is on for this page.</b> <button type="button" id="setup-addons-reports-open" class="secondary">View Reports</button></p>';
      } else {
        html += '<p class="info">' + add('reports:website', 'Reports') + ' — $5/month, first month free, free for the rest of this month.</p>';
      }
    } else if (key === 'branding') {
      html = '<h4 style="margin:0 0 6px;">Remove Branding — $5/month</h4>' +
        '<p class="info">Take the "Powered by Yently" banner off the bottom of your page — visitors see only your page, nothing about Yently.</p>';
      if (brandingRemoved) {
        html += '<p class="info"><b>The Yently banner is off for this page.</b></p>';
      } else {
        html += '<p class="info">' + add('branding:website', 'Remove Branding') + ' — $5/month, first month free, free for the rest of this month.</p>';
      }
    }
    box.innerHTML = html;
    /* Wire the buttons inside the panel just rendered. */
    if (key === 'clean' && !hasCleanLink) {
      var cleanAdd = $('setup-addons-clean-add');
      if (cleanAdd) cleanAdd.onclick = function () { var t = $('setup-addons-clean-type'); window.location.href = '/?add=' + encodeURIComponent(t ? t.value : 'clean:website') + '&shop=laundry&slug=' + encodeURIComponent(SLUG) + '&addon=1'; };
      var cleanHelp = $('setup-addons-clean-help');
      if (cleanHelp) cleanHelp.onclick = function (e) { if (e) e.preventDefault(); openCleanLinkHelp(); };
    }
    if (key === 'reports' && reportsOn) {
      var roBtn = $('setup-addons-reports-open');
      if (roBtn) roBtn.onclick = function () { openReportsModal(); };
    }
    if (key === 'chat' && chatOn) {
      var inbox = $('setup-addons-chat-inbox');
      if (inbox) {
        if (window.ShopChat) {
          window.ShopChat.mountInbox(inbox, { ownerType: 'laundry', ownerKey: SLUG, creds: { u: ownerCreds.u, p: ownerCreds.p } });
        } else {
          inbox.innerHTML = '<p class="error">Chat could not load. Please reload the page and try again.</p>';
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
       Only when the shop already has one — and only once per
       Setup visit. If the Clean Link panel is open when the answer
       lands, it re-renders so the link appears. */
    if (hasCleanLink && !cleanLinkSlug) {
      fetch(SUPABASE_URL + '/rest/v1/clean_links?system=eq.laundry&shop_slug=eq.' + encodeURIComponent(SLUG) + '&select=slug', {
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
  var empPass = null; // employee password in memory only, never stored
  var empUnlocked = false; // true once the employee password is entered, or when the laundry has none set
  var passLocked = false;
  var bookings = [];
  var bookingsTimer = null;
  var currentView = 'services';
  var serviceEditId = null; // service being edited in Setup, null = adding
  var cancelConfirmId = null; // order id awaiting an in-page cancel confirmation
  var orderDelId = null; // order id awaiting an in-page delete confirmation
  var clearOrdersConfirm = false; // true while the clear-all-orders confirmation is showing
  var bookingsErr = ''; // last orders error, shown inline above the list
  var delConfirmId = null; // service id awaiting an in-page delete confirmation
  var serviceSearch = ''; // public services search text, kept while typing
  var slideIdx = {}; // service id -> current slideshow picture index
  var basket = {}; // service id -> quantity
  var servicePics = []; // picture URLs for the service being added/edited in Setup

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
  function round2(n) { return Math.round(n * 100) / 100; }
  function fmtNum(n) { return Number(n || 0).toLocaleString('en-US'); }
  function fmtDT(iso) {
    var d = new Date(iso);
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function todayLocal() {
    var d = new Date();
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function refOf(id) {
    return 'LA-' + String(id).padStart(6, '0');
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
     table differs per call (order, draft approval). */
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
    basket: 'What you picked so far. Change a quantity with + and −, or remove a line entirely, before you send the order.',
    name: 'Your own name — the person placing the order. The laundry uses it to know whose clothes these are.',
    phone: 'Your phone number, so the laundry can reach you about pickup or delivery. Digits only is fine — spaces or dashes do no harm.',
    email: 'Your email address — optional. The laundry can send your order details here.',
    fulfilment: 'Pickup means you bring the clothes in and collect them when they are ready. Delivery means the laundry collects and brings them back.',
    date: 'The day you want the clothes picked up or brought in. The laundry confirms the ready time with you.',
    payment: 'How you want to pay. Either way, you pay when the clothes are collected or delivered — nothing is charged online.',
    note: 'Anything the laundry should know — stains, special care, a gate code for delivery, or when you will be home.'
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
  function serviceById(id) {
    return (laundry.services || []).filter(function (s) { return String(s.id) === String(id); })[0] || null;
  }
  function loadLaundry() {
    return rpc('get_laundry_live', { p_slug: SLUG }).then(function (d) {
      laundry = d;
      setHeader();
      return d;
    });
  }

  /* ---------- views ---------- */
  function show(view) {
    currentView = view;
    if (view !== 'setup') stopShopChat();
    ['services', 'order', 'orders', 'setup'].forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.hidden = v !== view;
    });
    var tabs = document.querySelectorAll('#tabs button');
    tabs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view); });
    if (bookingsTimer) { clearInterval(bookingsTimer); bookingsTimer = null; }
    if (view === 'services') renderServices();
    if (view === 'order') renderOrder();
    if (view === 'orders') { renderOrders(); bookingsTimer = setInterval(function () { if (currentView === 'orders' && empUnlocked) loadBookings(true); }, 5000); }
    if (view === 'setup') renderSetup();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-view')); });
  });
  $('to-top').addEventListener('click', function () { window.scrollTo(0, 0); });

  function setHeader() {
    $('site-name').textContent = laundry ? laundry.name : 'Laundry';
    renderHeaderIcon(laundry && laundry.icon ? laundry.icon : '');
    $('site-about').innerHTML = laundry
      ? [esc(laundry.address), esc(laundry.phone)].filter(Boolean).join('<br>')
      : '';
    $('site-footer').innerHTML = laundry
      ? [esc(laundry.address), esc(laundry.phone)].filter(Boolean).join('<br>') + '<br>' + YENTLY_BADGE_HTML
      : YENTLY_BADGE_HTML;
    hideYentlyBadgeIfRemoved();
    document.title = (laundry ? laundry.name : 'Laundry') + ' — Laundry';
  }

  /* ---------- Services (public list + basket) ---------- */
  function servicePicsOf(s) { return (s && Array.isArray(s.pics)) ? s.pics : []; }
  function serviceMatches(s, q) {
    if (!q) return true;
    var hay = [s.name, s.category, s.price, money(s.price), s.description]
      .map(function (x) { return String(x == null ? '' : x).toLowerCase(); }).join(' ');
    return hay.indexOf(q) !== -1;
  }
  function sortedServices() {
    var list = (laundry.services || []).slice();
    list.sort(function (a, b) { return Number(a.price || 0) - Number(b.price || 0); });
    return list;
  }
  /* One picture shows static, 2+ get ‹ › arrows and a "1 of N" counter,
     none gets a plain grey placeholder block. The arrows keep their
     position per service in slideIdx, so flipping through one service
     does not reset the others. */
  function serviceSlideshowHtml(s) {
    var pics = servicePicsOf(s);
    if (!pics.length) return '<div class="slideshow"><div class="slide-empty">No picture yet</div></div>';
    var idx = slideIdx[s.id] || 0;
    if (idx >= pics.length) idx = 0;
    var h = '<div class="slideshow"><img class="slide-img" src="' + esc(pics[idx]) + '" alt="' + esc(s.name) + '">';
    if (pics.length > 1) {
      h += '<button class="slide-btn prev" data-slide-prev="' + s.id + '" aria-label="Previous picture">‹</button>' +
        '<button class="slide-btn next" data-slide-next="' + s.id + '" aria-label="Next picture">›</button>' +
        '<span class="slide-count">' + (idx + 1) + ' of ' + pics.length + '</span>';
    }
    h += '</div>';
    return h;
  }
  function basketQty(id) { return basket[String(id)] || 0; }
  function basketLines() {
    var lines = [];
    Object.keys(basket).forEach(function (id) {
      var q = basket[id];
      if (!q) return;
      var s = serviceById(id);
      if (!s) return;
      lines.push({ service: s, qty: q, lineTotal: round2(Number(s.price || 0) * q) });
    });
    return lines;
  }
  function basketTotal() {
    return round2(basketLines().reduce(function (sum, l) { return sum + l.lineTotal; }, 0));
  }
  function basketCount() {
    return basketLines().reduce(function (sum, l) { return sum + l.qty; }, 0);
  }
  function setQty(id, qty) {
    if (qty <= 0) delete basket[String(id)];
    else basket[String(id)] = qty;
  }
  function serviceCardHtml(s) {
    var q = basketQty(s.id);
    var stepper = q > 0
      ? '<span class="qty"><button data-dec="' + s.id + '" aria-label="One less">−</button><b>' + q + '</b><button data-inc="' + s.id + '" aria-label="One more">+</button></span>'
      : '<button data-add="' + s.id + '">Add</button>';
    return '<div class="item-card">' + serviceSlideshowHtml(s) +
      '<h3>' + esc(s.name) + '</h3>' +
      (s.category ? '<span class="cat">' + esc(s.category) + '</span>' : '') +
      '<span class="price">' + money(s.price) + '</span>' +
      (s.description ? '<p class="info">' + esc(s.description) + '</p>' : '') +
      '<div class="row">' + stepper + '</div>' +
      '</div>';
  }
  function renderServicesGrid() {
    var grid = $('services-grid');
    if (!grid) return;
    var q = (serviceSearch || '').toLowerCase();
    var services = sortedServices().filter(function (s) { return serviceMatches(s, q); });
    if (!services.length) {
      grid.innerHTML = '<div class="card"><p class="info">No services match your search.</p></div>';
      return;
    }
    /* Grouped by category, in the order each category first appears
       after the price sort, so the cheapest service is always first. */
    var cats = [];
    var byCat = {};
    services.forEach(function (s) {
      var c = s.category || 'Services';
      if (!byCat[c]) { byCat[c] = []; cats.push(c); }
      byCat[c].push(s);
    });
    var h = '';
    cats.forEach(function (c) {
      h += '<h3>' + esc(c) + '</h3><div class="item-grid">';
      byCat[c].forEach(function (s) { h += serviceCardHtml(s); });
      h += '</div>';
    });
    grid.innerHTML = h;
  }
  function attachServiceCardListeners(root) {
    root.querySelectorAll('[data-slide-prev]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-slide-prev');
        var pics = servicePicsOf(serviceById(id));
        if (!pics.length) return;
        slideIdx[id] = ((slideIdx[id] || 0) - 1 + pics.length) % pics.length;
        renderServices();
      });
    });
    root.querySelectorAll('[data-slide-next]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-slide-next');
        var pics = servicePicsOf(serviceById(id));
        if (!pics.length) return;
        slideIdx[id] = ((slideIdx[id] || 0) + 1) % pics.length;
        renderServices();
      });
    });
    root.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        setQty(b.getAttribute('data-add'), 1);
        renderServices();
      });
    });
    root.querySelectorAll('[data-inc]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-inc');
        setQty(id, basketQty(id) + 1);
        renderServices();
      });
    });
    root.querySelectorAll('[data-dec]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-dec');
        setQty(id, basketQty(id) - 1);
        renderServices();
      });
    });
  }
  function renderBasketCard() {
    var el = $('basket-card');
    if (!el) return;
    var lines = basketLines();
    if (!lines.length) {
      el.innerHTML = '<p class="info">Your basket is empty — tap <b>Add</b> on a service to start an order.</p>';
      return;
    }
    var h = '';
    lines.forEach(function (l) {
      h += '<div class="cart-line"><div><b>' + esc(l.service.name) + '</b> × ' + l.qty + '<br><span class="info">' + money(l.service.price) + ' each</span></div>' +
        '<div class="row"><span class="qty"><button data-dec="' + l.service.id + '" aria-label="One less">−</button><b>' + l.qty + '</b><button data-inc="' + l.service.id + '" aria-label="One more">+</button></span>' +
        '<b>' + money(l.lineTotal) + '</b></div></div>';
    });
    h += '<div class="total">Total <span class="big">' + money(basketTotal()) + '</span></div>' +
      '<div class="row"><button id="basket-go">Go to Order</button></div>';
    el.innerHTML = h;
    el.querySelectorAll('[data-inc]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-inc');
        setQty(id, basketQty(id) + 1);
        renderServices();
      });
    });
    el.querySelectorAll('[data-dec]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-dec');
        setQty(id, basketQty(id) - 1);
        renderServices();
      });
    });
    var go = $('basket-go');
    if (go) go.addEventListener('click', function () { show('order'); });
  }
  function renderServices() {
    var el = $('view-services');
    if (!laundry) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var h = '<h2>' + esc(laundry.name) + '</h2>';
    if (laundry.about) h += '<p class="info">' + esc(laundry.about) + '</p>';
    if (laundry.address || laundry.phone || laundry.hours) {
      h += '<div class="card info">';
      if (laundry.address) h += '<p>📍 ' + esc(laundry.address) + '</p>';
      if (laundry.phone) h += '<p>📞 ' + esc(laundry.phone) + '</p>';
      if (laundry.hours) h += '<p>🕐 ' + esc(laundry.hours) + '</p>';
      h += '</div>';
    }
    var services = laundry.services || [];
    if (!services.length) {
      h += '<div class="card"><p class="info">No services yet — the owner adds services in Setup.</p></div>';
      el.innerHTML = h;
      return;
    }
    h += '<input id="service-search" type="text" placeholder="Search services…" value="' + esc(serviceSearch) + '" class="veh-search">';
    h += '<div id="services-grid"></div>';
    h += '<div class="card"><h3>Your basket' + (basketCount() ? ' <span class="badge">' + basketCount() + '</span>' : '') + '</h3><div id="basket-card"></div></div>';
    h += '<div class="card"><p class="info">Found what you need? Add it to your basket, then finish your order from the <b>Order</b> tab. You pay when the clothes are collected or delivered.</p></div>';
    el.innerHTML = h;
    var search = $('service-search');
    if (search) search.addEventListener('input', function () {
      serviceSearch = search.value;
      renderServicesGrid();
      attachServiceCardListeners($('services-grid'));
    });
    renderServicesGrid();
    attachServiceCardListeners(el);
    renderBasketCard();
  }

  /* ---------- Order (public form + receipt) ---------- */
  function orderFormValue(name) {
    var r = document.querySelector('input[name="' + name + '"]:checked');
    return r ? r.value : '';
  }
  function renderOrderBasket() {
    var el = $('ord-basket');
    if (!el) return;
    var lines = basketLines();
    if (!lines.length) {
      el.innerHTML = '<p class="info">Your basket is empty — add services from the <b>Services</b> tab first.</p>';
      return;
    }
    var h = '';
    lines.forEach(function (l) {
      h += '<div class="cart-line"><div><b>' + esc(l.service.name) + '</b><br><span class="info">' + money(l.service.price) + ' each</span></div>' +
        '<div class="row"><span class="qty"><button data-dec="' + l.service.id + '" aria-label="One less">−</button><b>' + l.qty + '</b><button data-inc="' + l.service.id + '" aria-label="One more">+</button></span>' +
        '<b>' + money(l.lineTotal) + '</b>' +
        '<button class="small danger" data-remove="' + l.service.id + '">Remove</button></div></div>';
    });
    h += '<div class="total">Total <span class="big">' + money(basketTotal()) + '</span></div>';
    el.innerHTML = h;
    el.querySelectorAll('[data-inc]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-inc');
        setQty(id, basketQty(id) + 1);
        renderOrderBasket();
      });
    });
    el.querySelectorAll('[data-dec]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-dec');
        setQty(id, basketQty(id) - 1);
        renderOrderBasket();
      });
    });
    el.querySelectorAll('[data-remove]').forEach(function (b) {
      b.addEventListener('click', function () {
        setQty(b.getAttribute('data-remove'), 0);
        renderOrderBasket();
      });
    });
  }
  function renderOrder() {
    var el = $('view-order');
    if (!laundry) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var h = '<h2>Order — ' + esc(laundry.name) + '</h2><div class="card direct-help">' +
      '<span class="field-label">Your basket ' + helpHtml('basket') + '</span><div id="ord-basket"></div>' +
      '<span class="field-label">Your name ' + helpHtml('name') + '</span><input id="ord-name" type="text" placeholder="Full name">' +
      '<span class="field-label">Phone ' + helpHtml('phone') + '</span><input id="ord-phone" type="tel" placeholder="Phone number">' +
      '<span class="field-label">Email (optional) ' + helpHtml('email') + '</span><input id="ord-email" type="email" placeholder="Email address">' +
      '<span class="field-label">Pickup or delivery ' + helpHtml('fulfilment') + '</span>' +
      '<div><label class="choice"><input type="radio" name="ord-fulfilment" value="pickup" checked> Pickup</label>' +
      '<label class="choice"><input type="radio" name="ord-fulfilment" value="delivery"> Delivery</label></div>' +
      '<span class="field-label">Date ' + helpHtml('date') + '</span><input id="ord-date" type="date" value="' + todayLocal() + '" min="' + todayLocal() + '">' +
      '<span class="field-label">Payment ' + helpHtml('payment') + '</span>' +
      '<div><label class="choice"><input type="radio" name="ord-payment" value="Cash" checked> Cash</label>' +
      '<label class="choice"><input type="radio" name="ord-payment" value="Online"> Online</label></div>' +
      '<span class="field-label">Note (optional) ' + helpHtml('note') + '</span><textarea id="ord-note" placeholder="Anything the laundry should know…"></textarea>' +
      '<div class="row"><button id="ord-go">Place order</button></div>' +
      '<p class="error" id="ord-err" hidden></p>' +
      '<div id="ord-out" style="margin-top:12px"></div></div>';
    el.innerHTML = h;
    wireHelp(el);
    renderOrderBasket();
    $('ord-go').addEventListener('click', function () {
      var err = $('ord-err');
      var out = $('ord-out');
      var lines = basketLines();
      var name = $('ord-name').value.trim();
      var phone = $('ord-phone').value.trim();
      var email = $('ord-email').value.trim();
      var fulfilment = orderFormValue('ord-fulfilment') || 'pickup';
      var date = $('ord-date').value;
      var payment = orderFormValue('ord-payment') || 'Cash';
      var note = $('ord-note').value.trim();
      if (!lines.length) { err.hidden = false; err.textContent = 'Your basket is empty — add a service first.'; return; }
      if (!name) { err.hidden = false; err.textContent = 'Your name is required.'; return; }
      if (!phone) { err.hidden = false; err.textContent = 'Your phone number is required.'; return; }
      if (!date) { err.hidden = false; err.textContent = 'Pick a date.'; return; }
      err.hidden = true;
      var total = basketTotal();
      var items = lines.map(function (l) { return { service_id: l.service.id, qty: l.qty }; });
      var linesText = lines.map(function (l) { return l.service.name + ' × ' + l.qty + ' — ' + money(l.lineTotal); }).join(', ');
      rpc('place_laundry_order', { p_slug: SLUG, p_items: items, p_name: name, p_phone: phone, p_email: email, p_fulfilment: fulfilment, p_date: date, p_payment: payment, p_note: note }).then(function (res) {
        var id = (res && typeof res === 'object') ? (res.id != null ? res.id : res.booking_id) : res;
        var ref = refOf(id);
        var payLine = fulfilment === 'pickup' ? 'Pay at pickup' : 'Pay on delivery';
        var h2 = '<div class="note"><p><b>✓ Order placed — ' + esc(ref) + '</b></p>' +
          '<p>' + esc(linesText) + '<br>Total: <b>' + money(total) + '</b></p>' +
          '<p>' + esc(name) + ' · ' + esc(phone) + '</p>' +
          '<p>' + (fulfilment === 'pickup' ? 'Pickup' : 'Delivery') + ' · ' + esc(date) + ' · ' + esc(payment) + '</p>' +
          '<p>' + payLine + ' — show your name and order number when the clothes are collected or delivered.</p></div>';
        out.innerHTML = h2;
        basket = {};
        renderOrderBasket();
        notifyEmail('Laundry order ' + ref + ': ' + name, 'laundry_order', { slug: SLUG, name: name, phone: phone, email: email, items: linesText, fulfilment: fulfilment, date: date, payment: payment, total: total, note: note });
      }).catch(function (e) {
        err.hidden = false;
        err.textContent = 'Error: ' + e.message;
      });
    });
  }

  /* ---------- Orders (employee password) ---------- */
  function empGate(el, heading, after) {
    el.innerHTML = '<h2>' + heading + '</h2><div class="card">' +
      '<p class="info">Enter the employee password for this laundry to see orders.</p>' +
      '<label>Employee password</label><input id="emp-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="emp-go">Unlock</button></div>' +
      '<p class="error" id="emp-err" hidden></p></div>';
    $('emp-go').addEventListener('click', function () {
      var pw = $('emp-pass').value;
      rpc('check_laundry_employee_pass', { p_slug: SLUG, p_password: pw }).then(function (ok) {
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
  function loadBookings(quiet) {
    return rpc('list_laundry_bookings', { p_slug: SLUG, p_epass: empPass }).then(function (d) {
      bookings = d || [];
      if (currentView === 'orders') renderOrdersList();
      return bookings;
    }).catch(function (e) { if (!quiet) throw e; });
  }
  function renderOrders() {
    var el = $('view-orders');
    if (!laundry) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (passLocked && !empUnlocked) { empGate(el, 'Orders', renderOrders); return; }
    el.innerHTML = '<h2>Orders — ' + esc(laundry.name) + '</h2><p class="info">Orders refresh on their own every few seconds.</p><div id="orders-list"><p class="info">Loading…</p></div>';
    loadBookings().catch(function (e) {
      var l = $('orders-list');
      if (l) l.innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
    });
  }
  function orderItemsSummary(d) {
    var items = d.items || d.services || d.lines || [];
    if (typeof items === 'string') return esc(items);
    if (!Array.isArray(items) || !items.length) return '';
    var parts = items.map(function (it) {
      var nm = it.name || it.service_name || '';
      if (!nm) {
        var s = serviceById(it.service_id != null ? it.service_id : (it.service != null ? it.service : it.id));
        nm = s ? s.name : (it.service_id != null ? 'Service ' + it.service_id : 'Service');
      }
      return esc(nm) + ' × ' + esc(it.qty != null ? it.qty : 1);
    });
    return parts.join(', ');
  }
  function orderDetails(b) {
    var d = b.data || {};
    var lines = [];
    if (d.name) lines.push('<b>' + esc(d.name) + '</b>');
    if (d.phone) lines.push('Phone: ' + esc(d.phone));
    if (d.email) lines.push('Email: ' + esc(d.email));
    var items = orderItemsSummary(d);
    if (items) lines.push('Items: ' + items);
    if (d.total != null && d.total !== '') lines.push('Total: ' + money(d.total));
    if (d.fulfilment) lines.push((d.fulfilment === 'pickup' ? 'Pickup' : 'Delivery') + (d.date ? ' · ' + esc(d.date) : ''));
    if (d.payment) lines.push('Payment: ' + esc(d.payment));
    if (d.note) lines.push('Note: ' + esc(d.note));
    return lines.join('<br>');
  }
  function statusBadge(status) {
    var st = String(status || 'pending');
    return '<span class="status-badge st-' + esc(st) + '">' + esc(st) + '</span>';
  }
  function renderOrdersList() {
    var el = $('orders-list');
    if (!el) return;
    if (!bookings.length) { el.innerHTML = '<div class="card"><p class="info">No orders yet.</p></div>'; return; }
    var h = '';
    var finishedCount = bookings.filter(function (b) { return b.status === 'delivered' || b.status === 'cancelled'; }).length;
    var stayingCount = bookings.length - finishedCount;
    if (bookingsErr) h += '<p class="error">' + esc(bookingsErr) + '</p>';
    if (clearOrdersConfirm) {
      h += '<p><b>Clear all ' + finishedCount + ' finished order' + (finishedCount === 1 ? '' : 's') + '?</b> ' + stayingCount + ' order' + (stayingCount === 1 ? '' : 's') + ' not yet delivered will stay.</p><div class="row"><button class="small danger" data-clear-orders-yes>Yes, clear all</button><button class="small secondary" data-clear-orders-no>Keep them</button></div>';
    } else {
      h += '<div class="row"><button class="small danger" data-clear-orders>Clear all orders</button></div>';
    }
    bookings.forEach(function (b) {
      var st = String(b.status || 'pending');
      h += '<div class="card"><h3>Order ' + esc(refOf(b.id)) + ' ' + statusBadge(st) + '</h3>' +
        '<p class="info">' + esc(fmtDT(b.created_at)) + '</p>' +
        '<p>' + orderDetails(b) + '</p>';
      if (st === 'pending') {
        h += '<div class="row"><button class="small" data-advance="' + b.id + '" data-to="washing">Start washing</button>' +
          '<button class="small danger" data-cancel="' + b.id + '">Cancel</button></div>';
      } else if (st === 'washing') {
        h += '<div class="row"><button class="small" data-advance="' + b.id + '" data-to="ready">Mark ready</button>' +
          '<button class="small danger" data-cancel="' + b.id + '">Cancel</button></div>';
      } else if (st === 'ready') {
        h += '<div class="row"><button class="small" data-advance="' + b.id + '" data-to="delivered">Mark delivered</button>' +
          '<button class="small danger" data-cancel="' + b.id + '">Cancel</button></div>';
      }
      if (cancelConfirmId === b.id) {
        h += '<p><b>Cancel this order?</b></p><div class="row"><button class="small danger" data-cancel-yes="' + b.id + '">Yes, cancel</button><button class="small secondary" data-cancel-no="' + b.id + '">Keep it</button></div>';
      }
      h += '<div class="row"><button class="small danger" data-del-order="' + b.id + '">Delete</button></div>';
      if (orderDelId === b.id) {
        h += '<p><b>Delete this order?</b></p><div class="row"><button class="small danger" data-del-order-yes="' + b.id + '">Yes, delete</button><button class="small secondary" data-del-order-no="' + b.id + '">Keep it</button></div>';
      }
      h += '</div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-advance]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-advance'));
        var to = btn.getAttribute('data-to');
        btn.disabled = true;
        rpc('update_laundry_booking', { p_slug: SLUG, p_epass: empPass, p_kind: 'order', p_id: id, p_status: to })
          .then(function () { bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { bookingsErr = 'Error: ' + e.message; renderOrdersList(); });
      });
    });
    el.querySelectorAll('[data-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cancelConfirmId = Number(btn.getAttribute('data-cancel'));
        bookingsErr = '';
        renderOrdersList();
      });
    });
    el.querySelectorAll('[data-cancel-no]').forEach(function (btn) {
      btn.addEventListener('click', function () { cancelConfirmId = null; renderOrdersList(); });
    });
    el.querySelectorAll('[data-cancel-yes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-cancel-yes'));
        btn.disabled = true;
        rpc('update_laundry_booking', { p_slug: SLUG, p_epass: empPass, p_kind: 'order', p_id: id, p_status: 'cancelled' })
          .then(function () { cancelConfirmId = null; bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { cancelConfirmId = null; bookingsErr = 'Error: ' + e.message; renderOrdersList(); });
      });
    });
    el.querySelectorAll('[data-del-order]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        orderDelId = Number(btn.getAttribute('data-del-order'));
        bookingsErr = '';
        renderOrdersList();
      });
    });
    el.querySelectorAll('[data-del-order-no]').forEach(function (btn) {
      btn.addEventListener('click', function () { orderDelId = null; renderOrdersList(); });
    });
    el.querySelectorAll('[data-del-order-yes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-del-order-yes'));
        btn.disabled = true;
        rpc('delete_laundry_booking', { p_slug: SLUG, p_epass: empPass, p_id: id })
          .then(function () { orderDelId = null; bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { orderDelId = null; bookingsErr = 'Error: ' + e.message; renderOrdersList(); });
      });
    });
    el.querySelectorAll('[data-clear-orders]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearOrdersConfirm = true;
        bookingsErr = '';
        renderOrdersList();
      });
    });
    el.querySelectorAll('[data-clear-orders-no]').forEach(function (btn) {
      btn.addEventListener('click', function () { clearOrdersConfirm = false; renderOrdersList(); });
    });
    el.querySelectorAll('[data-clear-orders-yes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        rpc('clear_laundry_bookings', { p_slug: SLUG, p_epass: empPass })
          .then(function () { clearOrdersConfirm = false; bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { clearOrdersConfirm = false; bookingsErr = 'Error: ' + e.message; renderOrdersList(); });
      });
    });
  }

  /* ---------- Setup (owner) ---------- */
  /* Reports add-on: this shop's orders and bookings, from the
     generic get_system_report RPC (SECURITY DEFINER — anon REST
     reads nothing on these tables). Summary cards (totals, counts
     by status), one table per row set, FROM/TO date filters, and
     Print / Download as PDF. There is no vendored PDF library in
     the folder apps, so "Download as PDF" uses the same print path
     as the receipts: the report is copied into #print-area and
     window.print() is called — the browser's print window offers
     "Save as PDF". */
  var REPORTS_SYSTEM = 'laundry';
  var lastReports = null;
  var REPORTS_COL_FIELD = { '#': 'id', 'Customer': 'name', 'Details': 'detail', 'Amount': 'amount', 'Status': 'status', 'Date': 'date', 'Phone': 'phone', 'Vehicle': 'vehicle', 'Member': 'name', 'Plan': 'plan', 'Joined': 'date', 'Checked in': 'date' };
  function reportsISO(d) { var m = d.getMonth() + 1, day = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day; }
  function reportsCell(row, col, hasMoney) {
    var f = REPORTS_COL_FIELD[col] || 'detail';
    var v = row[f];
    if (v === null || v === undefined || v === '') return '';
    if (f === 'amount') {
      var n = Number(v);
      if (isNaN(n)) return esc(String(v));
      return hasMoney ? '$' + n.toFixed(2) : String(Math.round(n * 100) / 100);
    }
    return esc(String(v));
  }
  function openReportsModal() {
    var overlay = $('reports-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'reports-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;overflow:auto;padding:16px;box-sizing:border-box;';
      overlay.innerHTML = '<div id="reports-modal" style="background:#fff;max-width:900px;margin:0 auto;border-radius:14px;padding:20px;box-sizing:border-box;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;"><h2 style="margin:0;">Reports</h2>' +
        '<button type="button" id="reports-close" class="secondary">Close</button></div>' +
        '<p class="info" id="reports-shop"></p>' +
        '<div class="row" style="margin:12px 0;"><span>From <input type="date" id="reports-from"></span> <span>To <input type="date" id="reports-to"></span> ' +
        '<button type="button" id="reports-filter" class="secondary">Filter</button></div>' +
        '<div id="reports-body"><p class="info">Loading…</p></div>' +
        '<div class="row" style="margin-top:16px;"><button type="button" id="reports-print" class="secondary">Print</button> ' +
        '<button type="button" id="reports-pdf" class="secondary">Download as PDF</button></div>' +
        '<p class="info">Download as PDF opens the print window — choose “Save as PDF” there. The printout shows only the report, not the rest of the page.</p>' +
        '</div>';
      document.body.appendChild(overlay);
      $('reports-close').onclick = function () { overlay.style.display = 'none'; };
      overlay.onclick = function (e) { if (e.target === overlay) overlay.style.display = 'none'; };
      $('reports-filter').onclick = function () { loadReports(); };
      $('reports-print').onclick = function () { printReports(); };
      $('reports-pdf').onclick = function () { printReports(); };
      if (!$('reports-print-style')) {
        var st = document.createElement('style');
        st.id = 'reports-print-style';
        st.textContent = '@media print { body * { visibility: hidden; } #print-area, #print-area * { visibility: visible; } #print-area { position: absolute; left: 0; top: 0; width: 100%; } }';
        document.head.appendChild(st);
      }
    }
    overlay.style.display = 'block';
    var now = new Date();
    $('reports-from').value = reportsISO(new Date(now.getFullYear(), now.getMonth(), 1));
    $('reports-to').value = reportsISO(now);
    loadReports();
  }
  function loadReports() {
    var body = $('reports-body');
    if (body) body.innerHTML = '<p class="info">Loading…</p>';
    var from = $('reports-from') ? ($('reports-from').value || null) : null;
    var to = $('reports-to') ? ($('reports-to').value || null) : null;
    rpc('get_system_report', { p_system: REPORTS_SYSTEM, p_slug: SLUG, p_from: from, p_to: to, p_u: ownerCreds.u, p_p: ownerCreds.p }).then(function (rep) {
      lastReports = rep;
      renderReports(rep);
    }).catch(function (err) {
      if (body) body.innerHTML = '<p class="error">Could not load the report: ' + esc(err && err.message ? err.message : 'please try again in a moment.') + '</p>';
    });
  }
  function renderReports(rep) {
    var body = $('reports-body');
    if (!body) return;
    var shopEl = $('reports-shop');
    if (shopEl) shopEl.textContent = (rep.shop_name || SLUG) + ((rep.from || rep.to) ? ' — ' + (rep.from || '…') + ' to ' + (rep.to || '…') : '');
    var html = '';
    (rep.tables || []).forEach(function (t) {
      html += '<div class="card"><h3 style="margin-top:0;">' + esc(t.title) + ' — ' + t.count + '</h3>';
      if (t.has_money) html += '<p><b>' + esc(t.amount_label || 'Total sold') + ': $' + Number(t.revenue || 0).toFixed(2) + '</b></p>';
      else if (t.amount_label) html += '<p><b>' + esc(t.amount_label) + ': ' + String(Math.round(Number(t.revenue || 0) * 100) / 100) + '</b></p>';
      var counts = [];
      Object.keys(t.status_counts || {}).forEach(function (k) { counts.push(esc(k) + ': ' + t.status_counts[k]); });
      if (counts.length) html += '<p class="info">' + counts.join(' · ') + '</p>';
      html += '</div>';
      html += '<h3>' + esc(t.title) + ' (' + t.count + ')</h3>';
      if (!t.rows || !t.rows.length) { html += '<p class="info">No ' + esc(String(t.title).toLowerCase()) + ' in this period.</p>'; return; }
      html += '<div style="overflow:auto;max-height:520px;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr>';
      (t.columns || []).forEach(function (c) { html += '<th style="text-align:left;border-bottom:2px solid #e5e7eb;padding:8px 6px;">' + esc(c) + '</th>'; });
      html += '</tr></thead><tbody>';
      t.rows.forEach(function (row) {
        html += '<tr>';
        (t.columns || []).forEach(function (c) { html += '<td style="border-bottom:1px solid #f1f2f5;padding:8px 6px;vertical-align:top;">' + reportsCell(row, c, t.has_money) + '</td>'; });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      if (t.count > t.rows.length) html += '<p class="info">Showing ' + t.rows.length + ' of ' + t.count + ' rows — narrow the dates to see the rest.</p>';
    });
    body.innerHTML = html;
  }
  function printReports() {
    var body = $('reports-body');
    if (!body) return;
    var title = 'Reports' + (lastReports && lastReports.shop_name ? ' — ' + lastReports.shop_name : '');
    var range = (lastReports && (lastReports.from || lastReports.to)) ? ' (' + (lastReports.from || '…') + ' to ' + (lastReports.to || '…') + ')' : '';
    var area = $('print-area');
    if (area) {
      area.innerHTML = '<div style="font-family:sans-serif;"><h2>' + esc(title) + '</h2><p>' + esc(range) + '</p>' + body.innerHTML + '</div>';
      window.print();
    } else {
      window.print();
    }
  }

  function renderSetup() {
    stopShopChat(); // re-render destroys the inbox container; stop its poll first
    var el = $('view-setup');
    if (!laundry) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (!ownerCreds) {
      el.innerHTML = '<h2>Setup</h2><div class="card">' +
        '<p class="info">Enter the username and password Yently gave this laundry.</p>' +
        '<label>Username</label><input id="st-user" type="text" autocomplete="username">' +
        '<label>Password</label><input id="st-pass" type="password" autocomplete="current-password">' +
        '<div class="row"><button id="st-go">Log in</button></div>' +
        '<p class="error" id="st-err" hidden></p></div>';
      $('st-go').addEventListener('click', function () {
        var u = $('st-user').value.trim();
        var p = $('st-pass').value;
        rpc('check_laundry_login', { p_slug: SLUG, p_u: u, p_p: p }).then(function (ok) {
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
    var h = '<h2>Setup — ' + esc(laundry.name) + '</h2>' +
      '<div class="card" id="setup-addons">' +
      '<h3>Add-ons</h3>' +
      '<p class="info">Add-ons add more to your page — a short link, a TV gallery, live chat, uploads that go live right away, or a clear view of your orders, or a page without the Yently banner. Pick one below to see what it does and what it costs. Add-ons join the payment you already have — free for the rest of this month, charged from your next payment.</p>' +
      '<div class="row"><button type="button" id="setup-addons-menu-btn" class="secondary" aria-label="Add-ons menu">☰ Add-ons</button></div>' +
      '<div id="setup-addons-menu" style="display:none;margin-top:8px;">' +
      '<button type="button" class="secondary" data-addon-pick="clean" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Clean Link — $5/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="tv" style="display:block;width:100%;text-align:left;margin-bottom:6px;">TV Gallery — $2/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="chat" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Live Chat — $3/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="direct" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Direct Upload — $5/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="reports" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Reports — $5/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="branding" style="display:block;width:100%;text-align:left;">Remove Branding — $5/month</button>' +
      '</div>' +
      '<div id="setup-addons-details" style="margin-top:12px;"></div>' +
      '<div style="margin-top:12px;"><h4 style="margin:0 0 6px;">Your add-ons</h4><ul id="setup-addons-active-list" style="margin:0;padding-left:18px;"></ul></div>' +
      '</div>' +
      '<div class="card"><h3>Laundry details</h3>' +
      '<p class="info">' + (directUploadOn ? 'Direct Upload is on for this page — your changes go live the moment you upload them.' : 'Changes save as a draft. Upload for approval and the admin makes them live.') + '</p>' +
      '<label>Laundry name</label><input id="d-name" type="text" value="' + esc(draft.name || '') + '">' +
      '<label>Icon picture</label>' +
      '<div class="icon-field">' +
      '<img id="setup-icon-preview" class="icon-preview" src="' + esc(draft.icon || '') + '" alt=""' + (draft.icon ? '' : ' hidden') + '>' +
      '<input id="setup-icon-file" type="file" accept="image/*">' +
      '<button type="button" id="setup-icon-remove" class="small secondary">Remove icon</button>' +
      '</div>' +
      '<p class="info" id="setup-icon-out">One small picture shown next to the laundry name. It is shrunk to 200px before uploading.</p>' +
      '<label>Address</label><input id="d-address" type="text" value="' + esc(draft.address || '') + '">' +
      '<label>Phone</label><input id="d-phone" type="tel" value="' + esc(draft.phone || '') + '">' +
      '<label>Hours</label><input id="d-hours" type="text" value="' + esc(draft.hours || '') + '">' +
      '<label>About</label><textarea id="d-about">' + esc(draft.about || '') + '</textarea>' +
      '<div class="row"><button id="d-save">Save draft</button>' +
      '<button id="d-upload" class="secondary">' + (directUploadOn ? 'Upload — goes live right away' : 'Upload for approval') + '</button></div>' +
      '<p class="info" id="d-status">Draft status: ' + esc(draftStatus) + (draftStatus === 'pending' ? ' — waiting for Yently to approve it.' : draftStatus === 'approved' ? ' — approved, live now.' : ' — not sent yet.') + '</p>' +
      '<p class="error" id="d-err" hidden></p>' +
      '</div>' +
      '<div class="card"><h3>Services</h3>' +
      '<p class="info">Services go live right away — no approval needed.</p>' +
      '<div id="services-list"></div>' +
      '<h3 id="service-form-title">Add a service</h3>' +
      '<label>Name</label><input id="s-name" type="text" placeholder="e.g. Wash &amp; Fold">' +
      '<label>Category</label><input id="s-category" type="text" placeholder="e.g. Wash, Dry Cleaning, Ironing…">' +
      '<label>Price</label><input id="s-price" type="number" min="0" step="0.01" inputmode="decimal">' +
      '<label>Description</label><textarea id="s-desc"></textarea>' +
      '<label>Pictures (up to 7)</label>' +
      '<input id="s-pics" type="file" accept="image/*" multiple>' +
      '<div id="s-pics-list"></div>' +
      '<p class="error" id="s-pics-status" hidden></p>' +
      '<div class="row"><button id="s-save">Save service</button>' +
      '<button id="s-cancel" class="secondary" hidden>Cancel edit</button></div>' +
      '<p class="error" id="s-err" hidden></p></div>';
    el.innerHTML = h;
    /* Add-ons section: the ☰ menu, the details panel and the
       active list (see renderAddonsSection). Replaces the old
       one-line-per-add-on Setup lines and the Chats card. */
    renderAddonsSection();
    renderServicesList();
    $('d-save').addEventListener('click', function () { saveDraft(false); });
    $('d-upload').addEventListener('click', function () { saveDraft(true); });
    $('s-save').addEventListener('click', saveService);
    $('s-cancel').addEventListener('click', function () { serviceEditId = null; renderSetup(); });
    if (!serviceEditId) servicePics = [];
    renderServicePics();
    $('s-pics').addEventListener('change', onServicePicsChosen);
    wireIconField();
  }
  function renderServicesList() {
    var el = $('services-list');
    if (!el) return;
    var services = sortedServices();
    if (!services.length) { el.innerHTML = '<p class="info">No services yet.</p>'; return; }
    var h = '';
    services.forEach(function (s) {
      h += '<div class="cart-line"><div><b>' + esc(s.name) + '</b><br><span class="info">' + money(s.price) + (s.category ? ' · ' + esc(s.category) : '') + '</span></div>' +
        '<div class="row"><button class="small secondary" data-edit="' + s.id + '">Edit</button>' +
        (delConfirmId === s.id
          ? '<span><b>Delete "' + esc(s.name) + '"?</b> <button class="small danger" data-del-yes="' + s.id + '">Yes, delete</button> <button class="small secondary" data-del-no="' + s.id + '">Keep it</button></span>'
          : '<button class="small danger" data-del="' + s.id + '">Delete</button>') + '</div></div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = serviceById(Number(b.getAttribute('data-edit')));
        if (!s) return;
        serviceEditId = s.id;
        $('s-name').value = s.name || '';
        $('s-category').value = s.category || '';
        $('s-price').value = s.price == null ? '' : s.price;
        $('s-desc').value = s.description || '';
        servicePics = (s.pics || []).slice();
        renderServicePics();
        $('service-form-title').textContent = 'Edit service — ' + s.name;
        $('s-cancel').hidden = false;
        window.scrollTo(0, document.getElementById('service-form-title').offsetTop - 80);
      });
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        delConfirmId = Number(b.getAttribute('data-del'));
        renderServicesList();
      });
    });
    el.querySelectorAll('[data-del-no]').forEach(function (b) {
      b.addEventListener('click', function () { delConfirmId = null; renderServicesList(); });
    });
    el.querySelectorAll('[data-del-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = serviceById(Number(b.getAttribute('data-del-yes')));
        if (!s) return;
        b.disabled = true;
        rpc('delete_laundry_service', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_service_id: s.id })
          .then(function () { delConfirmId = null; return loadLaundry(); })
          .then(function () { renderSetup(); })
          .catch(function (e) { delConfirmId = null; renderServicesList(); var er = $('s-err'); if (er) { er.hidden = false; er.textContent = 'Error: ' + e.message; } });
      });
    });
  }
  function collectDraft() {
    return {
      name: $('d-name').value.trim(),
      address: $('d-address').value.trim(),
      phone: $('d-phone').value.trim(),
      hours: $('d-hours').value.trim(),
      about: $('d-about').value.trim(),
      icon: draft.icon || ''
    };
  }
  function saveDraft(upload) {
    var d = collectDraft();
    var err = $('d-err');
    if (!d.name) { err.hidden = false; err.textContent = 'Laundry name is required.'; return; }
    err.hidden = true;
    rpc('save_laundry_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_draft: d })
      .then(function () {
        draft = d;
        draftStatus = 'editing';
        if (!upload) {
          $('d-status').textContent = 'Draft status: editing — saved, not sent yet.';
          return;
        }
        return rpc('submit_laundry_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p }).then(function () {
          draftStatus = directUploadOn ? 'approved' : 'pending';
          $('d-status').textContent = directUploadOn ? 'Draft status: approved — live right away.' : 'Draft status: pending — waiting for Yently to approve it.';
          notifyEmail((directUploadOn ? 'Laundry upload — live right away: ' : 'Laundry draft for approval: ') + d.name, 'laundry_draft', { slug: SLUG, name: d.name, status: directUploadOn ? 'Live right away — no approval needed' : undefined });
        });
      })
      .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
  }
  /* ---------- Service pictures (Setup) ---------- */
  /* Shrink a picture in the browser before it is stored. Service
     pictures are shrunk to 800px on the long edge at JPEG quality 0.8
     — big enough to see the service, not high quality. PNGs stay PNG,
     small pictures untouched, and anything that fails falls back to
     the original file. */
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
  /* Upload one picture to the product-images bucket, under store/laundry/,
     and return its public URL. Anon uploads are only allowed under
     store/ — this path qualifies, and the bucket is publicly readable. */
  function uploadServicePicture(file) {
    return shrinkImage(file, 800, 0.8).then(function (up) {
      var safe = up.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      var path = 'store/laundry/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
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
  function renderServicePics() {
    var el = $('s-pics-list');
    if (!el) return;
    var h = '<p class="info">' + servicePics.length + ' of 7 pictures</p>';
    if (servicePics.length) {
      h += '<div class="pic-thumbs">';
      servicePics.forEach(function (url, i) {
        h += '<div class="pic-thumb"><img src="' + esc(url) + '" alt="Service picture ' + (i + 1) + '"><button class="small danger" data-pic-remove="' + i + '">Remove</button></div>';
      });
      h += '</div>';
    }
    el.innerHTML = h;
    el.querySelectorAll('[data-pic-remove]').forEach(function (b) {
      b.addEventListener('click', function () {
        servicePics.splice(Number(b.getAttribute('data-pic-remove')), 1);
        renderServicePics();
      });
    });
  }
  function onServicePicsChosen() {
    var input = $('s-pics');
    var status = $('s-pics-status');
    var files = (input && input.files) ? Array.prototype.slice.call(input.files) : [];
    if (!files.length) return;
    var room = 7 - servicePics.length;
    if (room <= 0) {
      if (status) { status.hidden = false; status.textContent = 'This service already has 7 pictures — remove one to add another.'; }
      input.value = '';
      return;
    }
    if (files.length > room) {
      if (status) { status.hidden = false; status.textContent = 'Only 7 pictures per service — the extra ' + (files.length - room) + ' picture(s) were not added.'; }
    } else if (status) { status.hidden = true; }
    input.value = '';
    var chain = Promise.resolve();
    files.slice(0, room).forEach(function (file) {
      chain = chain.then(function () { return uploadServicePicture(file); }).then(function (url) {
        servicePics.push(url);
        renderServicePics();
      }).catch(function (err) {
        if (status) { status.hidden = false; status.textContent = 'Upload failed: ' + err.message; }
      });
    });
  }
  function collectService() {
    var price = $('s-price').value.trim();
    return {
      name: $('s-name').value.trim(),
      category: $('s-category').value.trim(),
      price: price === '' ? 0 : Number(price),
      description: $('s-desc').value.trim(),
      pics: servicePics.slice()
    };
  }
  function saveService() {
    var err = $('s-err');
    var v = collectService();
    if (!v.name) { err.hidden = false; err.textContent = 'Service name is required.'; return; }
    if (!(v.price >= 0)) { err.hidden = false; err.textContent = 'Price must be 0 or more.'; return; }
    err.hidden = true;
    if (serviceEditId) v.id = serviceEditId;
    rpc('save_laundry_service', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_service: v })
      .then(function () { serviceEditId = null; return loadLaundry(); })
      .then(function () { renderSetup(); })
      .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
  }
  function loadDraft() {
    rpc('get_laundry_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p })
      .then(function (d) {
        draft = d || {};
        draftStatus = 'editing';
        /* Direct Upload switch: see the note by directUploadOn. */
        return rpc('direct_upload_enabled', { p_owner_type: 'laundry', p_owner_key: SLUG }).then(function (on) {
          directUploadOn = (on === true);
        }).catch(function () { directUploadOn = false; }).then(function () {
          /* Reports switch: see the note by reportsOn. */
          return rpc('reports_enabled', { p_owner_type: 'laundry', p_owner_key: SLUG }).then(function (on) {
            reportsOn = (on === true);
          }).catch(function () { reportsOn = false; });
        }).then(function () {
          /* TV Gallery switch: see the note by tvGalleryOn. */
          return rpc('tv_gallery_enabled', { p_owner_type: 'laundry', p_owner_key: SLUG }).then(function (on) {
            tvGalleryOn = (on === true);
          }).catch(function () { tvGalleryOn = false; });
        }).then(function () {
          /* Live Chat switch: see the note by chatOn. */
          return rpc('shop_chat_enabled', { p_owner_type: 'laundry', p_owner_key: SLUG }).then(function (on) {
            chatOn = (on === true);
          }).catch(function () { chatOn = false; });
        }).then(function () {
          /* Clean Link: whether the shop already has one
             (clean_link_exists, public RPC) — for the Add-ons
             section's Clean Link panel and active list. */
          return rpc('clean_link_exists', { p_system: 'laundry', p_slug: SLUG }).then(function (has) {
            hasCleanLink = (has === true);
          }).catch(function () { hasCleanLink = false; });
        }).then(function () {
          /* Remove Branding switch: whether Yently switched the
             "Powered by Yently" banner off for this shop
             (branding_removed, public RPC) — for the Add-ons
             section's Remove Branding panel and active list. */
          return rpc('branding_removed', { p_owner_type: 'laundry', p_owner_key: SLUG }).then(function (on) {
            brandingRemoved = (on === true);
          }).catch(function () { brandingRemoved = false; });
        });
      })
      .then(function () { renderSetup(); })
      .catch(function (e) {
        var el = $('view-setup');
        el.innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
      });
  }

  /* ---------- start ---------- */
  function init() {
    if (!SLUG) {
      $('site-name').textContent = 'Laundry';
      $('view-services').innerHTML = '<div class="card"><h2>Laundry not found</h2><p class="info">This laundry page needs your own laundry link — ask Yently for it.</p></div>';
      return;
    }
    loadLaundry().then(function (d) {
      if (!d) {
        $('site-name').textContent = 'Laundry';
        $('view-services').innerHTML = '<div class="card"><h2>Laundry not found</h2><p class="info">No laundry with this link yet. Ask Yently to set it up.</p></div>';
        return;
      }
      mountShopChatBubble(d.name, '');
      return rpc('laundry_pass_status', { p_slug: SLUG }).then(function (st) {
        passLocked = st === 'locked';
        empUnlocked = !passLocked;
        renderServices();
      });
    }).catch(function (e) {
      $('view-services').innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
    });
  }
  resolveSlug().then(function () { init(); });
})();
