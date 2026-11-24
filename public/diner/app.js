/* Diner page app — ONE folder for every restaurant.
   The restaurant comes from its own private link, and its menu, info,
   and orders live in the database — there is no data.json file here.
   Visitors see the last APPROVED menu. The customer logs in with the
   username + password the admin created for their restaurant (that
   login is what AutoFly sells); Setup edits save as a draft, and the
   Upload button sends the draft to the admin for approval. Approval
   makes the draft live instantly — no file swap, no redeploy wait.
   The menu itself is PUBLIC: anyone with the link sees it, but with
   no Add buttons. The Order button unlocks the working site with
   the restaurant's shared employee password (one password for all
   staff, set by the admin; restaurants with none set stay fully
   open). Ordering, My Order, Kitchen and Receipt all need that
   unlock; Setup still asks for the owner's own login. The Kitchen
   tab polls the shared order list every few seconds while open, so
   new orders appear with no manual refresh, from any phone. All
   credentials live in memory only: a reload asks again, exactly
   like the barber intake form. */
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
  var SLUG = String(params.r || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
  var SLUG_FROM_PATH = false;
  var slugResolved = false;
  if (!SLUG) {
    // Clean link (yently.com/<slug>): the middleware rewrites the
    // page server-side, so location.search is empty in the browser.
    // The shop slug is then the last path segment. Ignore this
    // system's own folder name, so a bare /diner visit still
    // shows "not found" by design.
    var segs = location.pathname.split('/').filter(function (s) { return s; });
    var lastSeg = (segs[segs.length - 1] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    if (lastSeg && lastSeg !== 'diner') { SLUG = lastSeg; SLUG_FROM_PATH = true; }
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
  var MYORDERS_KEY = 'diner-myorders-' + SLUG;

  /* Public by design: the same publishable key the main AutoFly site ships
     in its own pages. Used only for the database calls below. */
  var SUPABASE_URL = 'https://deykvlxikzwwrygmkdly.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_e2uwGgFB0SvVQS-TZahArQ_mjypz9Vr';

  var data = null; // live menu/info (visitors)
  var draft = null; // staff draft (Setup)
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
  var staffCreds = null; // {u, p} in memory only, never stored
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
    window.ShopChat.mountBubble(wrap, { ownerType: 'diner', ownerKey: SLUG, shopName: shopName || 'this shop', ownerEmail: ownerEmail || '' });
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
  var ADDONS_SYSTEM = 'diner';
  function addonsActiveRows() {
    var rows = [
      ['Clean Link', hasCleanLink],
      ['TV Gallery', tvGalleryOn],
      ['Live Chat', chatOn],
      ['Direct Upload', directUploadOn],
      ['Reports', reportsOn],
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
    }
    box.innerHTML = html;
    /* Wire the buttons inside the panel just rendered. */
    if (key === 'clean' && !hasCleanLink) {
      var cleanAdd = $('setup-addons-clean-add');
      if (cleanAdd) cleanAdd.onclick = function () { var t = $('setup-addons-clean-type'); window.location.href = '/?add=' + encodeURIComponent(t ? t.value : 'clean:website') + '&shop=diner&slug=' + encodeURIComponent(SLUG) + '&addon=1'; };
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
          window.ShopChat.mountInbox(inbox, { ownerType: 'diner', ownerKey: SLUG, creds: { u: staffCreds.u, p: staffCreds.p } });
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
      fetch(SUPABASE_URL + '/rest/v1/clean_links?system=eq.diner&shop_slug=eq.' + encodeURIComponent(SLUG) + '&select=slug', {
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
  var empUnlocked = false; // true once the employee password is entered, or when the restaurant has none set
  var cart = {}; // menu index -> quantity
  var sentNote = '';
  var myOrders = loadMyOrders();
  var kitchenOrders = [];
  var delOrderId = null; // kitchen order id awaiting an in-page delete confirmation
  var kitchenTimer = null;
  var receiptOrders = []; // all orders from the server (any device) for the Receipt view
  var receiptTimer = null;
  var delReceiptId = null; // receipt order id awaiting an in-page delete confirmation
  var clearReceipts = false; // true while the Receipt "Clear all" confirmation is showing
  var currentView = 'menu';
  var menuSearch = ''; // public menu search text, kept while typing
  var slideIdx = 0; // featured slideshow: index into slideItems
  var slideTimer = null; // featured slideshow auto-advance timer
  var slideItems = []; // menu items with a picture, in menu order
  var kitchenSeen = {}; // order id -> true, seeded on first Kitchen load
  var kitchenFirstLoad = true; // first poll after opening Kitchen seeds, never beeps
  var kitchenNewAt = {}; // order id -> timestamp it first appeared (new-order highlight)
  var audioCtx = null; // Web Audio context, created/resumed on a user gesture
  var SOUND_KEY = 'diner-sound-' + SLUG;
  var soundOn = true; // Kitchen beep on/off, persisted per restaurant
  try { if (localStorage.getItem(SOUND_KEY) === 'off') soundOn = false; } catch (e) {}
  var remoteFocusIdx = -1; // TV remote: index into the Kitchen's visible buttons

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + Number(n || 0).toFixed(2); }
  function loadMyOrders() {
    try { return JSON.parse(localStorage.getItem(MYORDERS_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveMyOrders() {
    try { localStorage.setItem(MYORDERS_KEY, JSON.stringify(myOrders)); } catch (e) {}
  }
  function cartCount() {
    var n = 0;
    Object.keys(cart).forEach(function (k) { n += cart[k]; });
    return n;
  }
  function updateBadges() {
    var cc = $('cart-count');
    var c = cartCount();
    cc.hidden = c === 0;
    cc.textContent = c;
    var kc = $('kitchen-count');
    var active = kitchenOrders.filter(function (o) { return o.status === 'active'; }).length;
    kc.hidden = active === 0;
    kc.textContent = active;
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
  function notifyEmail(subject, record) {
    try {
      fetch(SUPABASE_URL + '/functions/v1/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
        body: JSON.stringify({ subject: subject, table: 'diner_draft', record: record })
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- Icon picture (one small square image) ---------- */
  /* The icon lives in the draft/live data as `icon` — a public URL or ''.
     It is uploaded to the product-images bucket, shrunk to 200px on its
     long edge first (same rules as the shop picture uploads: JPEG 0.8,
     PNGs stay PNG, small pictures untouched, any failure falls back to
     the original file). */
  /* Shrink a picture before uploading: JPEG 0.8, PNGs stay PNG,
     small pictures untouched, any failure falls back to the
     original file. The icon is shrunk to 200px; menu item pictures
     to 800px, because they are now shown big on the Menu page. */
  function shrinkImage(file, maxEdge) {
    try {
      return new Promise(function (resolve) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          URL.revokeObjectURL(url);
          var w0 = img.naturalWidth, h0 = img.naturalHeight;
          if (!w0 || !h0 || Math.max(w0, h0) <= maxEdge) { resolve(file); return; }
          var scale = maxEdge / Math.max(w0, h0);
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
  function shrinkIconImage(file) { return shrinkImage(file, 200); }
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
  /* One picture per menu item, shrunk to 800px on its long edge
     (JPEG 0.8, PNGs stay PNG) — the pictures are now shown big on
     the Menu page, so a 200px file would look blurry at full width.
     Uploaded at once to store/diner-items/ and stored on the draft
     item as `pic` — a public URL or ''. */
  function uploadItemPicture(file) {
    return shrinkImage(file, 800).then(function (up) {
      var safe = up.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      var path = 'store/diner-items/' + SLUG + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
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
        var urlField = $('setup-icon-url');
        if (urlField) urlField.value = url;
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
      var urlField = $('setup-icon-url');
      if (urlField) urlField.value = '';
      var out = $('setup-icon-out');
      if (out) out.textContent = 'Icon removed — save the draft to keep it removed.';
      var file = $('setup-icon-file');
      if (file) file.value = '';
    });
  }

  /* ---------- Staff sign-in ---------- */
  /* Setup only: the restaurant's own username + password, checked
     against that restaurant only. Credentials stay in memory for this
     page only — a reload asks for login again. */
  function staffUnlocked() { return !!staffCreds; }
  function renderStaffLogin(el, heading, after) {
    el.innerHTML = '<h2>' + heading + '</h2><div class="card">' +
      '<p class="info">Enter the username and password Yently gave this restaurant.</p>' +
      '<label>Username</label><input id="st-user" type="text" autocomplete="username">' +
      '<label>Password</label><input id="st-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="st-go">Sign in</button></div>' +
      '<div id="st-out" style="margin-top:12px"></div></div>';
    $('st-go').addEventListener('click', function () {
      var out = $('st-out');
      var u = $('st-user').value.trim();
      var p = $('st-pass').value;
      out.innerHTML = '<p class="info">Checking…</p>';
      rpc('check_diner_login', { p_slug: SLUG, p_username: u, p_password: p }).then(function (ok) {
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

  /* ---------- Employee unlock (ordering + kitchen) ---------- */
  /* The menu is public, but ordering, My Order, Kitchen and Receipt
     need the restaurant's shared employee password — one password
     for everybody, set by the admin. Nothing is stored: a reload
     asks again. Restaurants with no password set skip this entirely
     (empUnlocked starts true for them, see the start block). */
  function renderEmpPrompt(el, after, heading) {
    /* The prompt can be rendered into several hidden views at once
       (Menu, My Order, Kitchen, Receipt all live in the page), so
       the ids below can exist more than once in the document. Look
       the button, input and output up INSIDE this view's container
       only — a global getElementById would find the first copy in
       the page and wire the wrong button, leaving this view's Unlock
       button dead. That was why an employee could not log in from
       the Kitchen or Receipt page after visiting the other one
       first (and why unlocking from one could land them on the
       other tab). The server check itself
       (check_diner_employee_pass) is sound — this was purely the
       page wiring the wrong button. */
    el.innerHTML = '<h2>' + esc(heading || 'Order') + '</h2><div class="card">' +
      '<p class="info">Enter the employee password for this restaurant to order and use the kitchen.</p>' +
      '<label>Employee password</label><input id="emp-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="emp-go">Unlock</button></div>' +
      '<div id="emp-out" style="margin-top:12px"></div></div>';
    el.querySelector('#emp-go').addEventListener('click', function () {
      ensureAudio(); // user gesture: lets the Kitchen beep play later
      var out = el.querySelector('#emp-out');
      var p = el.querySelector('#emp-pass').value;
      out.innerHTML = '<p class="info">Checking…</p>';
      rpc('check_diner_employee_pass', { p_slug: SLUG, p_password: p }).then(function (ok) {
        if (ok === true) {
          empPass = p;
          empUnlocked = true;
          after();
        } else {
          out.innerHTML = '<p class="error">Wrong employee password.</p>';
        }
      }).catch(function () {
        out.innerHTML = '<p class="error">Could not reach the sign-in check. Please try again in a moment.</p>';
      });
    });
  }
  function needEmp(el, view) {
    if (empUnlocked) return false;
    var heading = view === 'kitchen' ? 'Kitchen' : view === 'receipt' ? 'Receipt' : view === 'order' ? 'My Order' : 'Order';
    renderEmpPrompt(el, function () { show(view); }, heading);
    return true;
  }

  function stopKitchenPoll() {
    if (kitchenTimer) { clearInterval(kitchenTimer); kitchenTimer = null; }
  }
  function stopReceiptPoll() {
    if (receiptTimer) { clearInterval(receiptTimer); receiptTimer = null; }
  }

  function show(view) {
    currentView = view;
    if (view !== 'setup') stopShopChat();
    if (view !== 'kitchen') stopKitchenPoll();
    if (view !== 'receipt') stopReceiptPoll();
    if (view !== 'menu') stopSlideTimer();
    ['menu', 'order', 'kitchen', 'receipt', 'setup'].forEach(function (v) {
      $('view-' + v).hidden = v !== view;
    });
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view);
    });
    if (view === 'menu') renderMenu();
    if (view === 'order') renderOrder();
    if (view === 'kitchen') openKitchen();
    if (view === 'receipt') openReceipt();
    if (view === 'setup') openSetup();
    window.scrollTo(0, 0);
  }

  /* ---------- Menu ---------- */
  function menuMatches(item, q) {
    if (!q) return true;
    var hay = [item.name, item.description].map(function (x) { return String(x == null ? '' : x).toLowerCase(); }).join(' ');
    return hay.indexOf(q) !== -1;
  }
  /* One menu item: one LARGE picture on top of the card (full width,
     about 16:10, capped at 220px tall), then name, description,
     price and the Add button below it. Items without a picture show
     no picture area at all. A legacy `image` is shown the same way
     when there is no `pic`. */
  function menuItemHtml(item, i) {
    var pic = item.pic || item.image || '';
    var h = '<div class="menu-item">';
    if (pic) h += '<img class="item-pic-big" src="' + esc(pic) + '" alt="">';
    h += '<h3>' + esc(item.name) + '</h3>';
    if (item.description) h += '<div class="desc">' + esc(item.description) + '</div>';
    h += '<div class="row"><span class="price">' + money(item.price) + '</span>' +
      '<span style="flex:1"></span>' +
      (empUnlocked ? '<button data-add="' + i + '">Add</button>' : '') + '</div></div>';
    return h;
  }
  /* The menu grid alone, re-rendered as the visitor types in the
     search box, so the search input never loses focus. */
  function renderMenuGrid() {
    var grid = $('menu-grid');
    if (!grid) return;
    var q = (menuSearch || '').toLowerCase();
    var cats = [];
    (data.menu || []).forEach(function (item) {
      if (!menuMatches(item, q)) return;
      var cat = item.category || 'Menu';
      if (cats.indexOf(cat) === -1) cats.push(cat);
    });
    var html = '';
    if (!cats.length) {
      html = '<div class="card"><p class="info">' + (menuSearch ? 'No items match your search.' : 'No menu items yet.') + '</p></div>';
    } else {
      cats.forEach(function (cat) {
        html += '<h2>' + esc(cat) + '</h2><div class="menu-grid">';
        data.menu.forEach(function (item, i) {
          if ((item.category || 'Menu') !== cat) return;
          if (!menuMatches(item, q)) return;
          html += menuItemHtml(item, i);
        });
        html += '</div>';
      });
    }
    grid.innerHTML = html;
    /* The featured slideshow only runs while the search is empty. */
    var ss = $('menu-slideshow');
    if (ss) {
      ss.hidden = !!menuSearch;
      if (menuSearch) stopSlideTimer(); else startSlideTimer();
    }
    grid.querySelectorAll('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = btn.getAttribute('data-add');
        cart[i] = (cart[i] || 0) + 1;
        sentNote = '';
        updateBadges();
        btn.textContent = 'Added ✓';
        setTimeout(function () { btn.textContent = 'Add'; }, 900);
      });
    });
  }
  function renderMenu() {
    var el = $('view-menu');
    if (!data) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var info = '<div class="card info">';
    if (data.address) info += '<p>📍 ' + esc(data.address) + '</p>';
    if (data.phone) info += '<p>📞 ' + esc(data.phone) + '</p>';
    if (data.email) info += '<p>✉️ ' + esc(data.email) + '</p>';
    if (data.hours) info += '<p>🕐 ' + esc(data.hours) + '</p>';
    info += '</div>';
    var html = info;
    if (!empUnlocked) {
      html += '<div class="card"><p class="info">This is the public menu — take a look around. To order, enter the employee password.</p>' +
        '<button id="menu-order">Order</button></div>';
    }
    html += '<div id="menu-slideshow" class="featured-slideshow"></div>';
    html += '<input id="menu-search" type="text" placeholder="Search menu…" value="' + esc(menuSearch) + '">';
    html += '<div id="menu-grid"></div>';
    el.innerHTML = html;
    var orderBtn = $('menu-order');
    if (orderBtn) orderBtn.addEventListener('click', function () {
      renderEmpPrompt(el, function () { renderMenu(); });
    });
    var search = $('menu-search');
    if (search) search.addEventListener('input', function () {
      menuSearch = search.value;
      renderMenuGrid();
    });
    renderSlideshow();
    renderMenuGrid();
  }

  /* ---------- Featured slideshow (top of the Menu page) ---------- */
  /* Cycles through the menu items that have a picture, in menu
     order — one big image, full content width, with the dish name
     and price overlaid at the bottom. Auto-advances every 5s; a
     hover (or touch) pauses it, and any manual step (arrow or dot)
     restarts the 5s timer. Shown only while the search box is empty. */
  function slideList() {
    return (data.menu || []).filter(function (it) { return it.pic || it.image; });
  }
  function stopSlideTimer() {
    if (slideTimer) { clearInterval(slideTimer); slideTimer = null; }
  }
  function startSlideTimer() {
    stopSlideTimer();
    if (!slideItems.length || menuSearch) return;
    slideTimer = setInterval(function () { showSlide(slideIdx + 1); }, 5000);
  }
  function paintSlide() {
    var box = $('menu-slideshow');
    if (!box || !slideItems.length) return;
    var item = slideItems[slideIdx % slideItems.length];
    var pic = item.pic || item.image || '';
    var img = box.querySelector('.featured-img');
    if (img && img.getAttribute('src') !== pic) img.setAttribute('src', pic);
    var nm = box.querySelector('.featured-name');
    if (nm) nm.textContent = item.name;
    var pr = box.querySelector('.featured-price');
    if (pr) pr.textContent = money(item.price);
    var ct = box.querySelector('.slide-count');
    if (ct) ct.textContent = (slideIdx + 1) + ' of ' + slideItems.length;
    box.querySelectorAll('.dot').forEach(function (d, i) {
      d.classList.toggle('active', i === slideIdx);
    });
  }
  function showSlide(n) {
    if (!slideItems.length) return;
    slideIdx = ((n % slideItems.length) + slideItems.length) % slideItems.length;
    paintSlide();
    startSlideTimer();
  }
  function renderSlideshow() {
    var box = $('menu-slideshow');
    if (!box) return;
    slideItems = slideList();
    slideIdx = 0;
    stopSlideTimer();
    if (!slideItems.length) { box.innerHTML = ''; box.hidden = true; return; }
    var dots = '';
    slideItems.forEach(function (_, i) {
      dots += '<button class="dot' + (i === 0 ? ' active' : '') + '" data-slide-dot="' + i + '" aria-label="Dish ' + (i + 1) + '"></button>';
    });
    var first = slideItems[0];
    box.innerHTML = '<img class="featured-img" src="' + esc(first.pic || first.image || '') + '" alt="">' +
      '<div class="featured-overlay"><span class="featured-name">' + esc(first.name) + '</span><span class="featured-price">' + money(first.price) + '</span></div>' +
      '<button class="slide-btn prev" data-slide-prev aria-label="Previous dish">‹</button>' +
      '<button class="slide-btn next" data-slide-next aria-label="Next dish">›</button>' +
      '<span class="slide-count">1 of ' + slideItems.length + '</span>' +
      '<div class="slide-dots">' + dots + '</div>';
    box.hidden = !!menuSearch;
    box.querySelector('[data-slide-prev]').addEventListener('click', function () { showSlide(slideIdx - 1); });
    box.querySelector('[data-slide-next]').addEventListener('click', function () { showSlide(slideIdx + 1); });
    box.querySelectorAll('[data-slide-dot]').forEach(function (d) {
      d.addEventListener('click', function () { showSlide(Number(d.getAttribute('data-slide-dot'))); });
    });
    box.addEventListener('mouseenter', stopSlideTimer);
    box.addEventListener('mouseleave', startSlideTimer);
    box.addEventListener('touchstart', stopSlideTimer, { passive: true });
    box.addEventListener('touchend', startSlideTimer, { passive: true });
    startSlideTimer();
  }

  /* ---------- Order ---------- */
  function renderOrder() {
    var el = $('view-order');
    if (needEmp(el, 'order')) return;
    var keys = Object.keys(cart);
    if (keys.length === 0) {
      el.innerHTML = '<h2>My Order</h2>' +
        (sentNote ? '<div class="note">' + esc(sentNote) + '</div>' : '') +
        '<p class="info">Nothing here yet — add something tasty from the Menu tab.</p>';
      return;
    }
    var total = 0;
    var html = '<h2>My Order</h2><label>Table number</label><select id="order-table">';
    for (var t = 1; t <= (data.tables || 10); t++) html += '<option value="' + t + '">Table ' + t + '</option>';
    html += '</select><div class="card">';
    keys.forEach(function (k) {
      var item = data.menu[Number(k)];
      var qty = cart[k];
      total += item.price * qty;
      html += '<div class="order-line"><div><strong>' + esc(item.name) + '</strong><br>' +
        '<span class="info">' + money(item.price) + ' each</span></div>' +
        '<div class="qty"><button class="small secondary" data-dec="' + k + '">−</button>' +
        '<span>' + qty + '</span>' +
        '<button class="small secondary" data-inc="' + k + '">+</button>' +
        '<button class="small danger" data-del="' + k + '">Remove</button></div></div>';
    });
    html += '<div class="total">Total: ' + money(total) + '</div></div>' +
      '<button id="send-kitchen">Send to kitchen</button><div id="order-out" style="margin-top:12px"></div>';
    el.innerHTML = html;
    el.querySelectorAll('[data-inc]').forEach(function (b) {
      b.addEventListener('click', function () { cart[b.getAttribute('data-inc')]++; renderOrder(); updateBadges(); });
    });
    el.querySelectorAll('[data-dec]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-dec');
        cart[k]--;
        if (cart[k] <= 0) delete cart[k];
        renderOrder(); updateBadges();
      });
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { delete cart[b.getAttribute('data-del')]; renderOrder(); updateBadges(); });
    });
    $('send-kitchen').addEventListener('click', function () {
      var out = $('order-out');
      out.innerHTML = '<p class="info">Sending…</p>';
      var table = Number($('order-table').value);
      var items = Object.keys(cart).map(function (k) {
        var item = data.menu[Number(k)];
        return { name: item.name, price: item.price, qty: cart[k], cooked: false };
      });
      var order = { table: table, items: items, createdAt: new Date().toISOString() };
      rpc('place_diner_order', { p_slug: SLUG, p_order: order, p_epass: empPass }).then(function (id) {
        myOrders.push({ dbId: id, table: table, items: items, createdAt: order.createdAt });
        saveMyOrders();
        sentNote = 'Sent to the kitchen — Table ' + table + ', total ' + money(items.reduce(function (s, it) { return s + it.price * it.qty; }, 0)) + '.';
        cart = {};
        updateBadges();
        renderOrder();
      }).catch(function (err) {
        out.innerHTML = '<p class="error">Could not send the order: ' + esc(err.message) + ' Please try again.</p>';
      });
    });
  }

  /* ---------- Kitchen beep (big screen in the kitchen) ---------- */
  /* The Kitchen runs on a big screen/TV: when a new order arrives,
     the screen plays a loud triple-beep from its own speakers so
     the cooks hear it across the room. Synthesized with the Web
     Audio API — no audio file. Browsers block sound until the user
     has interacted with the page, so the audio context is created
     and resumed on a user gesture (employee unlock, Kitchen tab
     click, or the sound toggle itself). */
  function ensureAudio() {
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (e) { return null; }
  }
  function playTripleBeep() {
    if (!soundOn) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    try {
      /* Three 880 Hz tones, 0.2s each, 0.15s apart, full volume. */
      [0, 1, 2].forEach(function (k) {
        var t = ctx.currentTime + k * 0.35;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(1, t);
        gain.gain.setValueAtTime(1, t + 0.2);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    } catch (e) {}
  }
  function soundToggleHtml() {
    return '<button id="sound-toggle" class="small secondary">' + (soundOn ? '🔔 Sound: On' : '🔇 Sound: Off') + '</button>';
  }
  function wireSoundToggle() {
    var btn = $('sound-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      soundOn = !soundOn;
      try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (e) {}
      btn.textContent = soundOn ? '🔔 Sound: On' : '🔇 Sound: Off';
      if (soundOn) playTripleBeep(); // gesture + proves the sound works
    });
  }

  /* ---------- Kitchen (employee password, shared across devices) ---------- */
  function openKitchen() {
    if (needEmp($('view-kitchen'), 'kitchen')) return;
    /* Fresh open: the orders already waiting seed the seen set, so
       they never beep — only orders that arrive afterwards do. */
    kitchenSeen = {};
    kitchenNewAt = {};
    kitchenFirstLoad = true;
    remoteFocusIdx = -1;
    fetchKitchen();
    stopKitchenPoll();
    kitchenTimer = setInterval(fetchKitchen, 5000);
  }
  function fetchKitchen() {
    rpc('list_diner_orders_open', { p_slug: SLUG, p_epass: empPass }).then(function (rows) {
      var list = rows || [];
      if (kitchenFirstLoad) {
        /* First load seeds the seen set — no beep for orders that
           were already waiting when the Kitchen opened. */
        kitchenSeen = {};
        list.forEach(function (o) { kitchenSeen[o.id] = true; });
        kitchenFirstLoad = false;
      } else {
        var hasNew = false;
        list.forEach(function (o) {
          if (!kitchenSeen[o.id]) {
            kitchenSeen[o.id] = true;
            kitchenNewAt[o.id] = Date.now();
            hasNew = true;
          }
        });
        /* One beep per poll cycle that brings any new order, even
           when several arrive together. */
        if (hasNew) playTripleBeep();
      }
      kitchenOrders = list;
      updateBadges();
      if (currentView === 'kitchen') renderKitchen();
    }).catch(function () {
      if (currentView === 'kitchen') {
        var el = $('view-kitchen');
        if (!kitchenOrders.length) el.innerHTML = '<h2>Kitchen</h2><p class="error">Could not load orders. Please try again in a moment.</p>';
      }
    });
  }
  /* TV remote: after each Kitchen re-render (the list polls every
     5s), put the remote focus back on the same button, so the cook
     does not lose their place. */
  function kitchenButtons() {
    var el = $('view-kitchen');
    if (!el) return [];
    var btns = [];
    el.querySelectorAll('button, input[type="checkbox"]').forEach(function (b) {
      if (!b.disabled && b.offsetParent !== null) btns.push(b);
    });
    return btns;
  }
  function restoreRemoteFocus() {
    if (remoteFocusIdx < 0) return;
    var btns = kitchenButtons();
    if (!btns.length) { remoteFocusIdx = -1; return; }
    if (remoteFocusIdx >= btns.length) remoteFocusIdx = btns.length - 1;
    btns[remoteFocusIdx].classList.add('remote-focus');
    btns[remoteFocusIdx].focus();
  }
  function remoteMove(dir) {
    var btns = kitchenButtons();
    if (!btns.length) return;
    remoteFocusIdx = (remoteFocusIdx + dir + btns.length) % btns.length;
    btns.forEach(function (b, i) { b.classList.toggle('remote-focus', i === remoteFocusIdx); });
    btns[remoteFocusIdx].focus();
  }
  function renderKitchen() {
    var el = $('view-kitchen');
    var active = kitchenOrders.filter(function (o) { return o.status === 'active'; });
    if (active.length === 0) {
      el.innerHTML = '<h2>Kitchen</h2><div class="row">' + soundToggleHtml() + '</div><p class="info">No active orders right now. New orders appear here by themselves — no need to refresh.</p>';
      wireSoundToggle();
      restoreRemoteFocus();
      return;
    }
    var html = '<h2>Kitchen</h2><div class="row">' + soundToggleHtml() + '</div><p class="info">Orders refresh on their own every few seconds.</p>';
    active.forEach(function (order) {
      var d = order.data || {};
      var items = d.items || [];
      var allCooked = items.length > 0 && items.every(function (it) { return it.cooked; });
      /* New orders (arrived while the Kitchen screen was open, within
         the last 2 minutes) stand out with a gold border + NEW badge,
         so the cooks spot them from across the room. */
      var isNew = kitchenNewAt[order.id] && (Date.now() - kitchenNewAt[order.id] < 120000);
      html += '<div class="card' + (isNew ? ' new-order' : '') + '"><h3>Table ' + d.table + (isNew ? '<span class="new-badge">NEW</span>' : '') + '</h3>' +
        '<p class="info">' + new Date(d.createdAt || order.created_at).toLocaleString() + '</p>';
      items.forEach(function (it, i) {
        html += '<div class="kitchen-item"><input type="checkbox" data-cook="' + order.id + ':' + i + '"' +
          (it.cooked ? ' checked' : '') + '><span class="' + (it.cooked ? 'done' : '') + '">' +
          esc(it.qty) + ' × ' + esc(it.name) + '</span></div>';
      });
      html += '<div class="row" style="margin-top:10px">' +
        '<button data-fulfil="' + order.id + '"' + (allCooked ? '' : ' disabled') + '>Fulfil order</button>' +
        (delOrderId === order.id
          ? '<span><b>Delete this order?</b> <button class="danger" data-delorder-yes="' + order.id + '">Yes, delete</button> <button class="secondary" data-delorder-no="' + order.id + '">Keep it</button></span>'
          : '<button class="secondary" data-delorder="' + order.id + '">Delete</button>') + '</div></div>';
    });
    el.innerHTML = html;
    el.querySelectorAll('[data-cook]').forEach(function (box) {
      box.addEventListener('change', function () {
        var parts = box.getAttribute('data-cook').split(':');
        var order = kitchenOrders.filter(function (o) { return String(o.id) === parts[0]; })[0];
        if (!order) return;
        order.data.items[Number(parts[1])].cooked = box.checked;
        rpc('update_diner_order_open', { p_slug: SLUG, p_order_id: order.id, p_data: order.data, p_status: 'active', p_epass: empPass }).then(fetchKitchen).catch(fetchKitchen);
      });
    });
    el.querySelectorAll('[data-fulfil]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var order = kitchenOrders.filter(function (o) { return String(o.id) === btn.getAttribute('data-fulfil'); })[0];
        if (!order) return;
        rpc('update_diner_order_open', { p_slug: SLUG, p_order_id: order.id, p_data: order.data, p_status: 'done', p_epass: empPass }).then(fetchKitchen).catch(fetchKitchen);
      });
    });
    el.querySelectorAll('[data-delorder]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        delOrderId = Number(btn.getAttribute('data-delorder'));
        renderKitchen();
      });
    });
    el.querySelectorAll('[data-delorder-no]').forEach(function (btn) {
      btn.addEventListener('click', function () { delOrderId = null; renderKitchen(); });
    });
    el.querySelectorAll('[data-delorder-yes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-delorder-yes'));
        delOrderId = null;
        rpc('delete_diner_order_open', { p_slug: SLUG, p_order_id: id, p_epass: empPass }).then(fetchKitchen).catch(fetchKitchen);
      });
    });
    wireSoundToggle();
    restoreRemoteFocus();
  }

  /* ---------- Receipt (the cashier's live list — every order, any device) ---------- */
  /* Was: the visitor's own orders from this browser only (myOrders in
     localStorage), rendered once when the tab opened and never
     refreshed — so a cashier with the page open all day never saw
     orders placed on other phones. Now: the same server list the
     Kitchen polls (list_diner_orders_open, employee-password
     checked), refreshed every 5 seconds while the Receipt tab is
     open, newest first. No beep here — the Kitchen is the one that
     beeps. The visitor's own orders are still in the server list
     (they were sent to the kitchen), so nothing is lost; the local
     list is kept only as a fallback when the server cannot be
     reached yet. */
  function openReceipt() {
    if (needEmp($('view-receipt'), 'receipt')) return;
    delReceiptId = null;
    clearReceipts = false;
    fetchReceipt();
    stopReceiptPoll();
    receiptTimer = setInterval(fetchReceipt, 5000);
  }
  function fetchReceipt() {
    rpc('list_diner_orders_open', { p_slug: SLUG, p_epass: empPass }).then(function (rows) {
      receiptOrders = rows || [];
      if (currentView === 'receipt') renderReceipt();
    }).catch(function () {
      if (currentView === 'receipt' && receiptOrders.length === 0) renderReceiptLocal();
    });
  }
  function renderReceipt() {
    var el = $('view-receipt');
    var list = receiptOrders.slice().reverse(); // newest first
    var doneCount = receiptOrders.filter(function (o) { return o.status === 'done'; }).length;
    var stayingCount = receiptOrders.length - doneCount;
    var html = '<h2>Receipt</h2><p class="info">All orders for this restaurant, from every phone. Orders refresh on their own every few seconds.</p>';
    if (receiptOrders.length === 0) {
      html += '<p class="info">No orders yet. New orders appear here by themselves — no need to refresh.</p>';
      el.innerHTML = html;
      return;
    }
    html += '<div class="row" style="margin-bottom:12px">' +
      (clearReceipts
        ? '<span><b>Clear all ' + doneCount + ' fulfilled receipt' + (doneCount === 1 ? '' : 's') + '?</b> ' + stayingCount + ' still-active order' + (stayingCount === 1 ? '' : 's') + ' will stay. <button class="danger" data-clear-yes>Yes, clear all</button> <button class="secondary" data-clear-no>Keep them</button></span>'
        : '<button class="secondary" data-clear>Clear all receipts</button>') + '</div>';
    list.forEach(function (order) {
      var d = order.data || {};
      var items = d.items || [];
      var total = 0;
      var rows = '';
      items.forEach(function (it) {
        total += (Number(it.price) || 0) * (Number(it.qty) || 0);
        rows += '<div class="order-line"><span>' + esc(it.qty) + ' × ' + esc(it.name) + '</span><span>' + money((Number(it.price) || 0) * (Number(it.qty) || 0)) + '</span></div>';
      });
      html += '<div class="card"><h3>Table ' + esc(d.table) + ' — ' + (order.status === 'done' ? 'Fulfilled' : 'Active') + '</h3>' +
        '<p class="info">' + new Date(d.createdAt || order.created_at).toLocaleString() + '</p>' +
        rows + '<div class="total">Total: ' + money(total) + '</div>' +
        '<div class="row" style="margin-top:10px">' +
        '<button class="secondary" data-print="' + order.id + '">Print receipt</button>' +
        (delReceiptId === order.id
          ? '<span><b>Delete this receipt?</b> <button class="danger" data-delreceipt-yes="' + order.id + '">Yes, delete</button> <button class="secondary" data-delreceipt-no="' + order.id + '">Keep it</button></span>'
          : '<button class="secondary" data-delreceipt="' + order.id + '">Delete</button>') + '</div></div>';
    });
    el.innerHTML = html;
    el.querySelectorAll('[data-print]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.card');
        if (card) { $('print-area').innerHTML = card.outerHTML; window.print(); }
      });
    });
    el.querySelectorAll('[data-delreceipt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        delReceiptId = Number(btn.getAttribute('data-delreceipt'));
        renderReceipt();
      });
    });
    el.querySelectorAll('[data-delreceipt-no]').forEach(function (btn) {
      btn.addEventListener('click', function () { delReceiptId = null; renderReceipt(); });
    });
    el.querySelectorAll('[data-delreceipt-yes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-delreceipt-yes'));
        delReceiptId = null;
        rpc('delete_diner_order_open', { p_slug: SLUG, p_order_id: id, p_epass: empPass }).then(fetchReceipt).catch(fetchReceipt);
      });
    });
    var clearBtn = el.querySelector('[data-clear]');
    if (clearBtn) clearBtn.addEventListener('click', function () { clearReceipts = true; renderReceipt(); });
    var clearNo = el.querySelector('[data-clear-no]');
    if (clearNo) clearNo.addEventListener('click', function () { clearReceipts = false; renderReceipt(); });
    var clearYes = el.querySelector('[data-clear-yes]');
    if (clearYes) clearYes.addEventListener('click', function () {
      clearReceipts = false;
      rpc('clear_diner_orders_open', { p_slug: SLUG, p_epass: empPass }).then(fetchReceipt).catch(fetchReceipt);
    });
  }
  /* Fallback when the server list cannot be reached yet: the old
     view — this browser's own orders, printable. Shown only until
     the first successful fetch. */
  function renderReceiptLocal() {
    var el = $('view-receipt');
    if (myOrders.length === 0) {
      el.innerHTML = '<h2>Receipt</h2><p class="error">Could not load orders. Please try again in a moment.</p>';
      return;
    }
    var html = '<h2>Receipt</h2><div class="note">Could not reach the live list right now — showing your orders from this browser instead.</div>';
    myOrders.slice().reverse().forEach(function (o, idx) {
      var total = 0;
      var rows = '';
      (o.items || []).forEach(function (it) {
        total += it.price * it.qty;
        rows += '<div class="order-line"><span>' + it.qty + ' × ' + esc(it.name) + '</span><span>' + money(it.price * it.qty) + '</span></div>';
      });
      var card = '<div class="card"><h3>' + esc(data.name) + '</h3>' +
        '<p class="info">Table ' + o.table + ' — ' + new Date(o.createdAt).toLocaleString() + '</p>' +
        rows + '<div class="total">Total: ' + money(total) + '</div></div>';
      html += '<div data-receipt="' + idx + '">' + card +
        '<button class="secondary" data-print="' + idx + '" style="margin-bottom:16px">Print receipt</button></div>';
    });
    el.innerHTML = html;
    el.querySelectorAll('[data-print]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wrap = el.querySelector('[data-receipt="' + btn.getAttribute('data-print') + '"] .card');
        if (wrap) { $('print-area').innerHTML = wrap.outerHTML; window.print(); }
      });
    });
  }

  /* ---------- Setup (login only: draft + Upload for approval) ---------- */
  function openSetup() {
    stopShopChat(); // the loading state replaces the Setup view, destroying the inbox container
    if (!staffUnlocked()) {
      renderStaffLogin($('view-setup'), 'Setup sign-in', function () { openSetup(); });
      return;
    }
    var el = $('view-setup');
    el.innerHTML = '<h2>Setup</h2><div class="card"><p class="info">Loading your draft…</p></div>';
    rpc('get_diner_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p }).then(function (res) {
      draft = res.data || {};
      draft.menu = draft.menu || [];
      draftStatus = res.status || 'editing';
      /* Direct Upload switch: see the note by directUploadOn. */
      return rpc('direct_upload_enabled', { p_owner_type: 'diner', p_owner_key: SLUG }).then(function (on) {
        directUploadOn = (on === true);
      }).catch(function () { directUploadOn = false; }).then(function () {
        /* Reports switch: see the note by reportsOn. */
        return rpc('reports_enabled', { p_owner_type: 'diner', p_owner_key: SLUG }).then(function (on) {
          reportsOn = (on === true);
        }).catch(function () { reportsOn = false; });
      }).then(function () {
        /* TV Gallery switch: see the note by tvGalleryOn. */
        return rpc('tv_gallery_enabled', { p_owner_type: 'diner', p_owner_key: SLUG }).then(function (on) {
          tvGalleryOn = (on === true);
        }).catch(function () { tvGalleryOn = false; });
      }).then(function () {
        /* Live Chat switch: see the note by chatOn. */
        return rpc('shop_chat_enabled', { p_owner_type: 'diner', p_owner_key: SLUG }).then(function (on) {
          chatOn = (on === true);
        }).catch(function () { chatOn = false; });
      }).then(function () {
        /* Clean Link: whether the shop already has one
           (clean_link_exists, public RPC) — for the Add-ons
           section's Clean Link panel and active list. */
        return rpc('clean_link_exists', { p_system: 'diner', p_slug: SLUG }).then(function (has) {
          hasCleanLink = (has === true);
        }).catch(function () { hasCleanLink = false; });
      });
    }).then(function () {
      renderSetup();
    }).catch(function () {
      el.innerHTML = '<h2>Setup</h2><div class="card"><p class="error">Could not load your draft. Please try again in a moment.</p></div>';
    });
  }
  function statusLine() {
    if (draftStatus === 'pending') return 'Your changes were sent to Yently and are waiting for approval. Visitors still see the approved menu.';
    if (draftStatus === 'approved') return 'Your last upload was approved and is now live.';
    if (directUploadOn) return 'Direct Upload is on for this page — your changes go live the moment you upload them. Visitors still see the approved menu.';
    return 'Your changes are saved as a draft. Visitors still see the approved menu until you upload and Yently approves.';
  }
  /* Reports add-on: this shop's orders and bookings, from the
     generic get_system_report RPC (SECURITY DEFINER — anon REST
     reads nothing on these tables). Summary cards (totals, counts
     by status), one table per row set, FROM/TO date filters, and
     Print / Download as PDF. There is no vendored PDF library in
     the folder apps, so "Download as PDF" uses the same print path
     as the receipts: the report is copied into #print-area and
     window.print() is called — the browser's print window offers
     "Save as PDF". */
  var REPORTS_SYSTEM = 'diner';
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
    rpc('get_system_report', { p_system: REPORTS_SYSTEM, p_slug: SLUG, p_from: from, p_to: to, p_u: staffCreds.u, p_p: staffCreds.p }).then(function (rep) {
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
    function field(label, id, value, type) {
      return '<label>' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(value == null ? '' : value) + '">';
    }
    var html = '<h2>Setup</h2>' +
      '<div class="note">' + esc(statusLine()) + '</div>' +
      '<div class="card" id="setup-addons">' +
      '<h3>Add-ons</h3>' +
      '<p class="info">Add-ons add more to your page — a short link, a TV gallery, live chat, uploads that go live right away, or a clear view of your orders. Pick one below to see what it does and what it costs. Add-ons join the payment you already have — free for the rest of this month, charged from your next payment.</p>' +
      '<div class="row"><button type="button" id="setup-addons-menu-btn" class="secondary" aria-label="Add-ons menu">☰ Add-ons</button></div>' +
      '<div id="setup-addons-menu" style="display:none;margin-top:8px;">' +
      '<button type="button" class="secondary" data-addon-pick="clean" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Clean Link — $5/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="tv" style="display:block;width:100%;text-align:left;margin-bottom:6px;">TV Gallery — $2/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="chat" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Live Chat — $3/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="direct" style="display:block;width:100%;text-align:left;margin-bottom:6px;">Direct Upload — $5/month</button>' +
      '<button type="button" class="secondary" data-addon-pick="reports" style="display:block;width:100%;text-align:left;">Reports — $5/month</button>' +
      '</div>' +
      '<div id="setup-addons-details" style="margin-top:12px;"></div>' +
      '<div style="margin-top:12px;"><h4 style="margin:0 0 6px;">Your add-ons</h4><ul id="setup-addons-active-list" style="margin:0;padding-left:18px;"></ul></div>' +
      '</div>' +
      '<div class="card">' +
      field('Restaurant name', 'setup-name', draft.name) +
      '<label>Icon picture</label>' +
      '<div class="icon-field">' +
      '<img id="setup-icon-preview" class="icon-preview" src="' + esc(draft.icon || '') + '" alt=""' + (draft.icon ? '' : ' hidden') + '>' +
      '<input id="setup-icon-file" type="file" accept="image/*">' +
      '<button type="button" id="setup-icon-remove" class="small secondary">Remove icon</button>' +
      '</div>' +
      '<p class="info" id="setup-icon-out">One small picture shown next to the restaurant name. It is shrunk to 200px before uploading.</p>' +
      field('About text', 'setup-about', draft.about) +
      field('Phone', 'setup-phone', draft.phone) +
      field('Email', 'setup-email', draft.email, 'email') +
      field('Address', 'setup-address', draft.address) +
      field('Hours', 'setup-hours', draft.hours) +
      field('Number of tables', 'setup-tables', draft.tables, 'number') +
      field('Number of seats', 'setup-seats', draft.seats, 'number') +
      '</div><h2>Menu</h2><div id="setup-menu"></div>' +
      '<button id="setup-add" class="secondary">+ Add menu item</button>' +
      '<div class="row" style="margin-top:16px"><button id="setup-save" class="secondary">Save draft</button>' +
      '<button id="setup-upload">' + (directUploadOn ? 'Upload — goes live right away' : 'Upload for approval') + '</button></div>' +
      '<div id="setup-out" style="margin-top:12px"></div>';
    el.innerHTML = html;
    /* Add-ons section: the ☰ menu, the details panel and the
       active list (see renderAddonsSection). Replaces the old
       one-line-per-add-on Setup lines and the Chats card. */
    renderAddonsSection();
    var menuEl = $('setup-menu');
    function menuRow(item, i) {
      var row = document.createElement('div');
      row.className = 'card';
      row.innerHTML =
        '<label>Item name</label><input data-f="name" value="' + esc(item.name) + '">' +
        '<label>Price</label><input data-f="price" type="number" step="0.01" min="0" value="' + esc(item.price) + '">' +
        '<label>Category (e.g. Starters, Main courses, Desserts, Drinks)</label><input data-f="category" value="' + esc(item.category || '') + '">' +
        '<label>Description</label><input data-f="description" value="' + esc(item.description || '') + '">' +
        '<label>Picture</label>' +
        '<div class="pic-thumbs">' +
        (item.pic ? '<div class="pic-thumb"><img src="' + esc(item.pic) + '" alt="Menu item picture"><button class="small danger" data-pic-remove="' + i + '">Remove</button></div>' : '') +
        '</div>' +
        '<input type="file" accept="image/*" data-pic-file="' + i + '">' +
        '<p class="info" data-pic-status="' + i + '" hidden></p>' +
        '<button class="small danger" data-remove="' + i + '">Remove item</button>';
      row.querySelectorAll('[data-f]').forEach(function (input) {
        input.addEventListener('input', function () {
          var f = input.getAttribute('data-f');
          item[f] = f === 'price' ? Number(input.value) : input.value;
        });
      });
      row.querySelector('[data-remove]').addEventListener('click', function () {
        draft.menu.splice(i, 1);
        renderSetup();
      });
      /* Picking a picture uploads it at once and stores the URL on the
         draft item; Remove clears it. The draft is only persisted when
         the owner saves it, like every other field. */
      var picFile = row.querySelector('[data-pic-file]');
      if (picFile) picFile.addEventListener('change', function () {
        var f = picFile.files && picFile.files[0];
        if (!f) return;
        var st = row.querySelector('[data-pic-status]');
        if (st) { st.hidden = false; st.textContent = 'Uploading picture…'; }
        uploadItemPicture(f).then(function (url) {
          item.pic = url;
          drawMenu();
        }).catch(function (err) {
          if (st) { st.hidden = false; st.textContent = 'Could not upload the picture: ' + (err && err.message ? err.message : 'please try again.'); }
          picFile.value = '';
        });
      });
      var picRemove = row.querySelector('[data-pic-remove]');
      if (picRemove) picRemove.addEventListener('click', function () {
        item.pic = '';
        drawMenu();
      });
      return row;
    }
    function drawMenu() {
      menuEl.innerHTML = '';
      draft.menu.forEach(function (item, i) { menuEl.appendChild(menuRow(item, i)); });
    }
    drawMenu();
    wireIconField();
    $('setup-add').addEventListener('click', function () {
      draft.menu.push({ name: 'New item', price: 0, category: 'Menu', description: '', pic: '' });
      drawMenu();
    });
    function collectDraft() {
      return {
        name: $('setup-name').value.trim() || draft.name,
        about: $('setup-about').value,
        phone: $('setup-phone').value,
        email: $('setup-email').value,
        address: $('setup-address').value,
        hours: $('setup-hours').value,
        tables: Number($('setup-tables').value) || draft.tables,
        seats: Number($('setup-seats').value) || draft.seats,
        logo: draft.logo || '',
        icon: draft.icon || '',
        menu: draft.menu.filter(function (it) { return it.name.trim() !== ''; })
      };
    }
    $('setup-save').addEventListener('click', function () {
      var out = $('setup-out');
      out.innerHTML = '<p class="info">Saving…</p>';
      var d = collectDraft();
      rpc('save_diner_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p, p_draft: d }).then(function () {
        draft = d;
        draftStatus = 'editing';
        out.innerHTML = '<p class="info">Draft saved. Visitors still see the approved menu.</p>';
      }).catch(function (err) {
        out.innerHTML = '<p class="error">Could not save: ' + esc(err.message) + '</p>';
      });
    });
    $('setup-upload').addEventListener('click', function () {
      var out = $('setup-out');
      out.innerHTML = '<p class="info">Uploading…</p>';
      var d = collectDraft();
      rpc('submit_diner_draft', { p_slug: SLUG, p_username: staffCreds.u, p_password: staffCreds.p, p_draft: d }).then(function () {
        draft = d;
        draftStatus = directUploadOn ? 'approved' : 'pending';
        notifyEmail((directUploadOn ? 'Diner upload — live right away: ' : 'Diner draft for approval: ') + (d.name || SLUG), { restaurant: d.name || '', slug: SLUG, status: directUploadOn ? 'Live right away — no approval needed' : undefined });
        out.innerHTML = '<p class="info">' + (directUploadOn ? 'Uploaded! Your changes are live right away. ✅' : 'Uploaded! Your changes were sent to Yently and are waiting for approval. We will confirm once they are live.') + '</p>';
      }).catch(function (err) {
        out.innerHTML = '<p class="error">Could not upload: ' + esc(err.message) + '</p>';
      });
    });
  }

  /* ---------- Start ---------- */
  document.querySelectorAll('#tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.getAttribute('data-view') === 'kitchen') ensureAudio(); // gesture: lets the Kitchen beep play
      show(btn.getAttribute('data-view'));
    });
  });
  /* TV remote navigation, Kitchen tab only: the Kitchen runs on a
     big screen, and the remote sends plain arrow keys + Enter. Any
     arrow moves the focus to the next/previous visible action
     button (wrapping at the ends); Enter activates the focused
     button. Typing in a text input is left alone. */
  document.addEventListener('keydown', function (e) {
    if (currentView !== 'kitchen') return;
    var ae = document.activeElement;
    /* Typing in a text field is left alone — but a checkbox is a
       remote target too, so only text-like inputs block the keys. */
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || (ae.tagName === 'INPUT' && ae.type !== 'checkbox'))) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      remoteMove(e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'Enter') {
      var focused = document.querySelector('#view-kitchen .remote-focus');
      if (!focused) return;
      if (focused.tagName === 'INPUT' && focused.type === 'checkbox') {
        /* OK on a checkbox ticks it (Enter alone does not toggle a
           checkbox in every browser), and the change event saves it. */
        e.preventDefault();
        focused.checked = !focused.checked;
        focused.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (document.activeElement !== focused) {
        e.preventDefault(); focused.click();
      }
      /* Button already focused: let the browser's own Enter press it. */
    }
  });
  /* Black ↑ Top pill at the bottom-left, exactly like the shop pages:
     always visible, tap it to jump back to the top. */
  var toTop = $('to-top');
  if (toTop) {
    toTop.addEventListener('click', function () { window.scrollTo(0, 0); });
  }
  if (!SLUG) {
    $('site-name').textContent = 'Restaurant not found';
    $('view-menu').innerHTML = '<div class="error">This link doesn\'t point to a restaurant. Check the link and try again — ask Yently for your restaurant link.</div>';
  } else {
    resolveSlug().then(function () { return rpc('get_diner_live', { p_slug: SLUG }); }).then(function (json) {
      if (!json || !json.name) throw new Error('not found');
      data = json;
      data.menu = data.menu || [];
      document.title = data.name || 'Restaurant';
      var logo = $('site-logo');
      if (data.logo) { logo.src = (/^https?:\/\//.test(data.logo) ? data.logo : BASE + data.logo); logo.hidden = false; }
      $('site-name').textContent = data.name || 'Restaurant';
      renderHeaderIcon(data.icon || '');
      $('site-about').textContent = data.about || '';
      var foot = [];
      if (data.address) foot.push(esc(data.address));
      if (data.phone) foot.push(esc(data.phone));
      if (data.hours) foot.push(esc(data.hours));
      var firstLine = foot.join('<br>');
      $('site-footer').innerHTML = (firstLine ? '<div>' + firstLine + '</div>' : '') +
        '<div>Powered by Yently</div>';
      updateBadges();
      mountShopChatBubble(data.name, data.email);
      rpc('diner_pass_status', { p_slug: SLUG }).then(function (s) {
        empUnlocked = (s !== 'locked');
        renderMenu();
      }).catch(function () {
        /* If the status check itself is unreachable, stay open rather
           than locking everyone out of a working restaurant. */
        empUnlocked = true;
        renderMenu();
      });
    }).catch(function () {
      $('site-name').textContent = 'Restaurant not found';
      $('view-menu').innerHTML = '<div class="error">This link doesn\'t point to a restaurant yet. Check the link and try again.</div>';
    });
  }
})();
