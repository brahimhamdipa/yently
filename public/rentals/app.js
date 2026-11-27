/* Car rental page app — ONE folder for every rental company.
   The company comes from its own private link, and its info, cars,
   drivers, and bookings live in the database — there is no data.json
   file here. Every company has its own cars, drivers, and bookings,
   but they all use this same page.
   Visitors browse the cars and book one, with a driver or self-drive,
   for pickup and return dates. The price is per day, and the total is
   days × price per day. Bookings are emailed to Yently. Payment is
   at pickup — nothing is charged online.
   The Bookings tab needs the company's shared employee password
   (one password for all staff, set by the admin; companies with
   none set stay fully open). Setup needs the owner's own username +
   password. Setup edits save as a draft, and the Upload button sends
   the draft to the admin for approval — approval makes it live
   instantly. Cars and drivers are different: the owner adds, edits,
   and deletes them live in Setup, no approval needed. All credentials
   live in memory only: a reload asks again, exactly like the diner,
   barbershop, dealer, and POS pages. */
(function () {
  'use strict';

  /* Second-pass fix (2026-11-18, diner root-cause sweep, mechanism 3):
     Setup sideways scroll. The icon file input has min-width: 180px in
     style.css with no max-width cap, and body has no overflow-x guard.
     style.css is outside this pass's scope, so the guard is injected
     here instead of in the stylesheet. */
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
  var SLUG = String(params.c || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
  var SLUG_FROM_PATH = false;
  var slugResolved = false;
  if (!SLUG) {
    // Clean link (yently.com/<slug>): the middleware rewrites the
    // page server-side, so location.search is empty in the browser.
    // The shop slug is then the last path segment. Ignore this
    // system's own folder name, so a bare /rentals visit still
    // shows "not found" by design.
    var segs = location.pathname.split('/').filter(function (s) { return s; });
    var lastSeg = (segs[segs.length - 1] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    if (lastSeg && lastSeg !== 'rentals') { SLUG = lastSeg; SLUG_FROM_PATH = true; }
  }
  // Clean link (yently.com/<slug>): the name in the link is the CLEAN
  // name, which usually differs from the shop's own slug.
  // The middleware rewrites the page, but the browser address stays
  // clean, so look the clean name up in clean_links (public read)
  // and use the real shop slug. Only runs when the slug came from
  // the path (no ?c= query). Fails open: any error keeps
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

  var rental = null; // live rental company info + cars + drivers (visitors)
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
  var brandingRemoved = false; // the "Powered by YENTLY.com" banners are off for this shop — for the Add-ons section (branding_removed, fetched in openSetup)
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
    window.ShopChat.mountBubble(wrap, { ownerType: 'rentals', ownerKey: SLUG, shopName: shopName || 'this shop', ownerEmail: ownerEmail || '' });
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
     TV Gallery's link is yently.com/tv-<system>-<slug> — built from
     the system and the shop slug, so its ON state always shows the
     real gallery link, and the customer uploads their own pictures
     from the TV Gallery details panel (stored in the tv_gallery
     table, one row per shop). */
  var ADDONS_SYSTEM = 'rentals';
  /* "Powered by YENTLY.com" banners: a thin navy strip under the main menu and a small navy strip at the bottom
     of the page, with the Yently logo, linking to yently.com. It is
     on by default. It hides only when the customer ordered the
     Remove Branding add-on ($5/month, first month free) and Yently
     switched it on for this shop (branding_removed). The banners are
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
      return '<li>' + esc(r[0]) + ' — <b>' + (r[1] ? 'Active' : 'Not added') + '</b>' + addonRowLink(r[0], r[1]) + '</li>';
    }).join('');
  }
  /* Action link for an ACTIVE add-on in the "Your add-ons" list:
     the customer should reach what they paid for from the list
     itself, not only from the details panel. Reports opens its
     popup directly; Clean Link is the live URL itself; Live Chat
     opens the inbox panel; the rest open their details panel
     (they have no destination page — TV Gallery gets its real
     link with the database rework). Not-added rows get no link. */
  function addonRowLink(name, active) {
    if (!active) return '';
    if (name === 'Clean Link') {
      return cleanLinkSlug
        ? ' · <a href="/' + esc(cleanLinkSlug) + '">yently.com/' + esc(cleanLinkSlug) + '</a>'
        : ' · <a href="#" data-addon-link="clean">Details</a>';
    }
    if (name === 'Reports') return ' · <a href="#" data-addon-link="reports-view">View Reports</a>';
    if (name === 'Live Chat') return ' · <a href="#" data-addon-link="chat">Open Chats</a>';
    if (name === 'TV Gallery') return ' · <a href="/tv-' + ADDONS_SYSTEM + '-' + encodeURIComponent(SLUG) + '" target="_blank" rel="noopener">yently.com/tv-' + ADDONS_SYSTEM + '-' + esc(SLUG) + '</a>';
    if (name === 'Direct Upload') return ' · <a href="#" data-addon-link="direct">Details</a>';
    if (name === 'Remove Branding') return ' · <a href="#" data-addon-link="branding">Details</a>';
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
        var k = a.getAttribute('data-addon-link');
        if (k === 'reports-view') { openReportsModal(); }
        else { renderAddonDetails(k); }
      };
    });
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
        html += '<p class="info"><b>TV Gallery is on for this page.</b> Your gallery: <a href="/tv-' + ADDONS_SYSTEM + '-' + encodeURIComponent(SLUG) + '" target="_blank" rel="noopener">yently.com/tv-' + ADDONS_SYSTEM + '-' + esc(SLUG) + '</a> — open it on each TV.</p>' +
          '<div id="setup-addons-tv-manage"><p class="hint">Loading your pictures…</p></div>';
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
        '<p class="info">Take the "Powered by YENTLY.com" banners off your page — the one under your menu and the one at the bottom — visitors see only your page, nothing about Yently.</p>';
      if (brandingRemoved) {
        html += '<p class="info"><b>The Yently banners are off for this page.</b></p>';
      } else {
        html += '<p class="info">' + add('branding:website', 'Remove Branding') + ' — $5/month, first month free, free for the rest of this month.</p>';
      }
    }
    box.innerHTML = html;
    /* Wire the buttons inside the panel just rendered. */
    if (key === 'clean' && !hasCleanLink) {
      var cleanAdd = $('setup-addons-clean-add');
      if (cleanAdd) cleanAdd.onclick = function () { var t = $('setup-addons-clean-type'); window.location.href = '/?add=' + encodeURIComponent(t ? t.value : 'clean:website') + '&shop=rentals&slug=' + encodeURIComponent(SLUG) + '&addon=1'; };
      var cleanHelp = $('setup-addons-clean-help');
      if (cleanHelp) cleanHelp.onclick = function (e) { if (e) e.preventDefault(); openCleanLinkHelp(); };
    }
    if (key === 'reports' && reportsOn) {
      var roBtn = $('setup-addons-reports-open');
      if (roBtn) roBtn.onclick = function () { openReportsModal(); };
    }
    if (key === 'tv' && tvGalleryOn) {
      mountTvGalleryManage();
    }
    if (key === 'chat' && chatOn) {
      var inbox = $('setup-addons-chat-inbox');
      if (inbox) {
        if (window.ShopChat) {
          window.ShopChat.mountInbox(inbox, { ownerType: 'rentals', ownerKey: SLUG, creds: { u: ownerCreds.u, p: ownerCreds.p } });
        } else {
          inbox.innerHTML = '<p class="error">Chat could not load. Please reload the page and try again.</p>';
        }
      }
    }
  }
  /* ---------- TV Gallery pictures (Setup) ---------- */
  /* The customer uploads their own pictures from this panel —
     no hand-made upload form, no Storage folder to create by
     hand. Pictures are shrunk to 1600px (TV fullscreen needs
     them big), stored in the product-images bucket under
     store/tv-gallery/, and listed on the shop's tv_gallery row
     (one row per shop: system + slug, pictures + message). The
     gallery page (yently.com/tv-<system>-<slug>) reads that row.
     Saving is owner-gated server-side: tv_gallery_save checks
     the shop login, like get_system_report. At most 7 pictures. */
  var tvGalleryPics = [];
  var tvGalleryMsg = '';
  var tvDeleteArm = -1;
  var tvReplaceIndex = -1;
  function tvGalleryLink() {
    return '/tv-' + ADDONS_SYSTEM + '-' + encodeURIComponent(SLUG);
  }
  function shrinkTvImage(file) {
    try {
      return new Promise(function (resolve) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          URL.revokeObjectURL(url);
          var w0 = img.naturalWidth, h0 = img.naturalHeight;
          if (!w0 || !h0 || Math.max(w0, h0) <= 1600) { resolve(file); return; }
          var scale = 1600 / Math.max(w0, h0);
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(w0 * scale);
          canvas.height = Math.round(h0 * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          var outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          canvas.toBlob(function (blob) {
            if (!blob) { resolve(file); return; }
            var name = outType === 'image/jpeg' ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
            resolve(new File([blob], name, { type: outType }));
          }, outType, 0.85);
        };
        img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      });
    } catch (e) {
      return Promise.resolve(file);
    }
  }
  function uploadTvGalleryPicture(file) {
    return shrinkTvImage(file).then(function (up) {
      var safe = up.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      var path = 'store/tv-gallery/' + SLUG + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
      return fetch(SUPABASE_URL + '/storage/v1/object/product-images/' + path, {
        method: 'POST',
        headers: { 'Content-Type': up.type || 'application/octet-stream', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
        body: up
      }).then(function (res) {
        if (!res.ok) throw new Error('upload failed (HTTP ' + res.status + ')');
        return { name: path.split('/').pop(), url: SUPABASE_URL + '/storage/v1/object/public/product-images/' + path };
      });
    });
  }
  function tvGallerySave(pics, message) {
    return rpc('tv_gallery_save', { p_system: ADDONS_SYSTEM, p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_message: message, p_pics: pics });
  }
  function tvGalleryStatus(text) {
    var el = $('setup-addons-tv-status');
    if (el) el.textContent = text;
  }
  function mountTvGalleryManage() {
    var box = $('setup-addons-tv-manage');
    if (!box) return;
    box.innerHTML = '<p class="hint">Loading your pictures…</p>';
    rpc('tv_gallery_get', { p_owner_type: ADDONS_SYSTEM, p_owner_key: SLUG }).then(function (g) {
      tvGalleryPics = (g && Array.isArray(g.pics)) ? g.pics : [];
      tvGalleryMsg = (g && g.message) || '';
      tvDeleteArm = -1;
      renderTvGalleryManage();
    }).catch(function () {
      box.innerHTML = '<p class="error">Could not load your gallery. Please close this panel and try again.</p>';
    });
  }
  function renderTvGalleryManage() {
    var box = $('setup-addons-tv-manage');
    if (!box) return;
    var h = '';
    if (tvGalleryPics.length === 0) {
      h += '<p class="hint">No pictures in your gallery yet — tap Upload to add some (up to 7).</p>';
    } else {
      h += '<p class="hint">' + tvGalleryPics.length + ' of 7 pictures in your gallery.</p>';
    }
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;">';
    tvGalleryPics.forEach(function (p, i) {
      h += '<div><img src="' + esc(p.url) + '" alt="" style="width:100%;height:110px;object-fit:cover;border-radius:10px;" />' +
        '<div style="display:flex;gap:4px;margin-top:4px;">' +
        '<button type="button" class="secondary" style="flex:1;padding:6px 4px;font-size:13px;" data-tv-replace="' + i + '">Replace</button>' +
        '<button type="button" class="secondary" style="flex:1;padding:6px 4px;font-size:13px;" data-tv-delete="' + i + '">' + (tvDeleteArm === i ? 'Tap again' : 'Delete') + '</button>' +
        '</div></div>';
    });
    h += '</div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">' +
      '<button type="button" id="setup-addons-tv-upload"' + (tvGalleryPics.length >= 7 ? ' disabled' : '') + '>Upload</button>' +
      '<button type="button" class="secondary" id="setup-addons-tv-view">View gallery</button></div>' +
      '<input type="file" id="setup-addons-tv-file" accept="image/*" multiple style="display:none;" />' +
      '<input type="file" id="setup-addons-tv-replace-file" accept="image/*" style="display:none;" />' +
      '<p class="hint" id="setup-addons-tv-status"></p>' +
      '<div style="margin-top:12px;"><label>Message on the fullscreen (optional)</label>' +
      '<input id="setup-addons-tv-message" placeholder="e.g. SALE — 20% off everything today!" value="' + esc(tvGalleryMsg) + '" maxlength="200" style="font-size:16px;" />' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="secondary" id="setup-addons-tv-save-msg">Save message</button></div>' +
      '<p class="hint">This rolls across the bottom of the fullscreen, like the urgent messages on TV. Leave it empty and nothing shows — just the pictures.</p></div>';
    box.innerHTML = h;
    var upBtn = $('setup-addons-tv-upload');
    if (upBtn) upBtn.onclick = function () { var f = $('setup-addons-tv-file'); if (f) f.click(); };
    var viewBtn = $('setup-addons-tv-view');
    if (viewBtn) viewBtn.onclick = function () { window.open(tvGalleryLink(), '_blank'); };
    var fileInput = $('setup-addons-tv-file');
    if (fileInput) fileInput.onchange = function (e) { tvGalleryUploadPicked(e.target.files, -1); e.target.value = ''; };
    var repInput = $('setup-addons-tv-replace-file');
    if (repInput) repInput.onchange = function (e) { tvGalleryUploadPicked(e.target.files, tvReplaceIndex); e.target.value = ''; };
    var saveBtn = $('setup-addons-tv-save-msg');
    if (saveBtn) saveBtn.onclick = function () {
      var inp = $('setup-addons-tv-message');
      var value = inp ? inp.value : tvGalleryMsg;
      tvGalleryStatus('Saving…');
      tvGallerySave(tvGalleryPics, value).then(function () {
        tvGalleryMsg = value;
        tvGalleryStatus(value ? '✓ Message saved — it rolls across the bottom of the fullscreen.' : '✓ Message cleared — the fullscreen shows just the pictures.');
      }).catch(function (err) { tvGalleryStatus('Could not save the message: ' + (err && err.message ? err.message : 'try again')); });
    };
    box.querySelectorAll('[data-tv-delete]').forEach(function (b) {
      b.onclick = function () {
        var i = Number(b.getAttribute('data-tv-delete'));
        if (tvDeleteArm !== i) { tvDeleteArm = i; renderTvGalleryManage(); tvGalleryStatus('Tap Delete again to remove this picture.'); return; }
        tvDeleteArm = -1;
        var next = tvGalleryPics.slice();
        next.splice(i, 1);
        tvGalleryStatus('Deleting…');
        tvGallerySave(next, tvGalleryMsg).then(function () {
          tvGalleryPics = next;
          renderTvGalleryManage();
          tvGalleryStatus('✓ Picture deleted — its place is free now.');
        }).catch(function (err) { renderTvGalleryManage(); tvGalleryStatus('Could not delete: ' + (err && err.message ? err.message : 'try again')); });
      };
    });
    box.querySelectorAll('[data-tv-replace]').forEach(function (b) {
      b.onclick = function () {
        tvReplaceIndex = Number(b.getAttribute('data-tv-replace'));
        var f = $('setup-addons-tv-replace-file');
        if (f) f.click();
      };
    });
  }
  function tvGalleryUploadPicked(files, replaceIndex) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    if (replaceIndex < 0 && tvGalleryPics.length + list.length > 7) {
      tvGalleryStatus('You can have up to 7 pictures — you have ' + tvGalleryPics.length + ', and you picked ' + list.length + '. Delete some first, or pick fewer.');
      return;
    }
    tvGalleryStatus('Uploading 0 of ' + list.length + '…');
    var done = 0;
    var uploaded = [];
    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () {
        return uploadTvGalleryPicture(file).then(function (pic) {
          uploaded.push(pic);
          done += 1;
          tvGalleryStatus('Uploading ' + done + ' of ' + list.length + '…');
        });
      });
    });
    chain.then(function () {
      var next = tvGalleryPics.slice();
      if (replaceIndex >= 0) {
        next[replaceIndex] = uploaded[0];
      } else {
        next = next.concat(uploaded);
      }
      return tvGallerySave(next, tvGalleryMsg).then(function () {
        tvGalleryPics = next;
        tvReplaceIndex = -1;
        renderTvGalleryManage();
        tvGalleryStatus('✓ Uploaded ' + uploaded.length + ' picture' + (uploaded.length === 1 ? '' : 's') + '.');
      });
    }).catch(function (err) {
      tvReplaceIndex = -1;
      renderTvGalleryManage();
      tvGalleryStatus('Upload stopped at ' + done + ' of ' + list.length + ': ' + (err && err.message ? err.message : 'try again'));
    });
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
       Only when the shop already has one — and only once per
       Setup visit. If the Clean Link panel is open when the answer
       lands, it re-renders so the link appears. */
    if (hasCleanLink && !cleanLinkSlug) {
      fetch(SUPABASE_URL + '/rest/v1/clean_links?system=eq.rentals&shop_slug=eq.' + encodeURIComponent(SLUG) + '&select=slug', {
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
  var empPass = null; // employee password in memory only, never stored
  var empUnlocked = false; // true once the employee password is entered, or when the company has none set
  var passLocked = false;
  var bookings = [];
  var bookingsTimer = null;
  var currentView = 'cars';
  var carEditId = null; // car being edited in Setup, null = adding
  var driverEditId = null; // driver being edited in Setup, null = adding
  var cancelConfirmId = null; // booking id awaiting an in-page cancel confirmation
  var bookingsErr = ''; // last bookings error, shown inline above the list
  var delBookingId = null; // booking id awaiting an in-page delete confirmation
  var clearBookingsConfirm = false; // true while the clear-all bookings confirmation is showing
  var delConfirmId = null; // car id awaiting an in-page delete confirmation
  var delDriverConfirmId = null; // driver id awaiting an in-page delete confirmation
  var carSearch = ''; // public cars search text, kept while typing
  var slideIdx = {}; // car id -> current slideshow picture index
  var detailCarId = null; // car id shown in the details popup
  var pendingBookCarId = null; // car to preselect in Book
  var carPics = []; // picture URLs for the car being added/edited in Setup

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
  function tomorrowLocal() {
    var d = new Date(Date.now() + 86400000);
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  /* System kill switch (Admin menu 4 -> Systems On/Off): when Yently
     switches this system off, visitors see it as unavailable while
     Setup stays reachable. Fails open -- any error, missing row, or
     missing RPC means the system stays on. */
  var systemOff = false;
  var SYSTEM_OFF_NOTICE = '<p class="error">This system is currently unavailable. Yently has switched it off for now — please check back later, or contact Yently if you need help.</p>';
  var SYSTEM_OFF_SETUP_NOTICE = '<p class="error">This system is currently switched off in Yently Admin — visitors see it as unavailable. Your data is still here.</p>';
  function checkSystemOff() {
    try {
      if (typeof rpc !== 'function') return Promise.resolve(false);
      return rpc('list_system_switches', {}).then(function (rows) {
        try {
          var list = Array.isArray(rows) ? rows : [];
          for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].system === 'rentals' && list[i].visible === false) return true;
          }
        } catch (e) {}
        return false;
      }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
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
  /* Best-effort owner email, same shape as the dealer and POS pages: the
     table differs per call (booking, draft approval). */
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
    car: 'Pick the car you want to rent. Each car shows its price per day — the total is the number of days times that price.',
    driver: 'Pick a driver, or choose Self-drive to drive the car yourself. Drivers are the company\u2019s own drivers.',
    name: 'Your own name — the person booking the car. The rental company uses it to know who the booking is for.',
    phone: 'Your phone number, so the rental company can reach you about pickup. Digits only is fine — spaces or dashes do no harm.',
    email: 'Your email address — optional. The rental company can send your booking details here.',
    pickup: 'The day you pick the car up. That day counts as the first rental day.',
    ret: 'The day you bring the car back. The rental runs from the pickup day to this day — at least one day in total.'
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
     the original file). Same pattern as the POS, diner, barbershop,
     employee, and dealer pages. */
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
  function carById(id) {
    return (rental.cars || []).filter(function (c) { return String(c.id) === String(id); })[0] || null;
  }
  function driverById(id) {
    return (rental.drivers || []).filter(function (d) { return String(d.id) === String(id); })[0] || null;
  }
  function carLabel(c) {
    return [c.year, c.make, c.model].filter(function (x) { return x !== '' && x != null; }).join(' ');
  }
  function loadRental() {
    return rpc('get_rentals_live', { p_slug: SLUG }).then(function (d) {
      rental = d;
      setHeader();
      return d;
    });
  }

  /* ---------- views ---------- */
  function show(view) {
    currentView = view;
    if (view !== 'setup') stopShopChat();
    ['cars', 'book', 'bookings', 'setup'].forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.hidden = v !== view;
    });
    var tabs = document.querySelectorAll('#tabs button');
    tabs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view); });
    if (bookingsTimer) { clearInterval(bookingsTimer); bookingsTimer = null; }
    if (view === 'cars') renderCars();
    if (view === 'book') renderBook();
    if (view === 'bookings') { renderBookings(); bookingsTimer = setInterval(function () { if (currentView === 'bookings' && empUnlocked) loadBookings(true); }, 5000); }
    if (view === 'setup') renderSetup();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-view')); });
  });
  $('to-top').addEventListener('click', function () { window.scrollTo(0, 0); });

  function setHeader() {
    $('site-name').textContent = rental ? rental.name : 'Car Rental';
    renderHeaderIcon(rental && rental.icon ? rental.icon : '');
    $('site-about').innerHTML = rental
      ? [esc(rental.address), esc(rental.phone)].filter(Boolean).join('<br>')
      : '';
    $('site-footer').innerHTML = rental
      ? [esc(rental.address), esc(rental.phone)].filter(Boolean).join('<br>') + '<br>' + YENTLY_BADGE_HTML
      : YENTLY_BADGE_HTML;
    showYentlyBadgeTop();
    hideYentlyBadgeIfRemoved();
    document.title = (rental ? rental.name : 'Car Rental') + ' — Car Rental';
  }

  /* ---------- Cars (public inventory) ---------- */
  function carPicsOf(c) { return (c && Array.isArray(c.pics)) ? c.pics : []; }
  function carMatches(c, q) {
    if (!q) return true;
    var hay = [c.plate, c.make, c.model, c.year, c.fuel, c.transmission, c.price_per_day, money(c.price_per_day), c.description]
      .map(function (x) { return String(x == null ? '' : x).toLowerCase(); }).join(' ');
    return hay.indexOf(q) !== -1;
  }
  /* One picture shows static, 2+ get ‹ › arrows and a "1 of N" counter,
     none gets a plain grey placeholder block. The arrows keep their
     position per car in slideIdx, so flipping through one car does
     not reset the others. */
  function carSlideshowHtml(c) {
    var pics = carPicsOf(c);
    if (!pics.length) return '<div class="slideshow"><div class="slide-empty">No picture yet</div></div>';
    var idx = slideIdx[c.id] || 0;
    if (idx >= pics.length) idx = 0;
    var h = '<div class="slideshow"><img class="slide-img" src="' + esc(pics[idx]) + '" alt="' + esc(carLabel(c)) + '">';
    if (pics.length > 1) {
      h += '<button class="slide-btn prev" data-slide-prev="' + c.id + '" aria-label="Previous picture">‹</button>' +
        '<button class="slide-btn next" data-slide-next="' + c.id + '" aria-label="Next picture">›</button>' +
        '<span class="slide-count">' + (idx + 1) + ' of ' + pics.length + '</span>';
    }
    h += '</div>';
    return h;
  }
  function carCardHtml(c) {
    var specs = [];
    if (c.plate) specs.push('Plate ' + c.plate);
    if (c.seats) specs.push(c.seats + ' seats');
    if (c.fuel) specs.push(c.fuel);
    if (c.transmission) specs.push(c.transmission);
    return '<div class="item-card">' + carSlideshowHtml(c) +
      '<h3>' + esc(carLabel(c)) + '</h3>' +
      '<span class="price">' + money(c.price_per_day) + '/day</span>' +
      (specs.length ? '<span class="stock">' + esc(specs.join(' · ')) + '</span>' : '') +
      (c.description ? '<p class="info">' + esc(c.description) + '</p>' : '') +
      '<div class="row"><button data-book="' + c.id + '">Book this car</button>' +
      '<button class="small btn-soft" data-details="' + c.id + '" aria-label="View details">→</button></div>' +
      '</div>';
  }
  function renderCarsGrid() {
    var grid = $('cars-grid');
    if (!grid) return;
    var q = (carSearch || '').toLowerCase();
    var cars = (rental.cars || []).filter(function (c) { return carMatches(c, q); });
    if (!cars.length) {
      grid.innerHTML = '<div class="card"><p class="info">No cars match your search.</p></div>';
      return;
    }
    var h = '<div class="item-grid">';
    cars.forEach(function (c) { h += carCardHtml(c); });
    h += '</div>';
    grid.innerHTML = h;
  }
  function attachCarCardListeners(root) {
    root.querySelectorAll('[data-slide-prev]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-slide-prev');
        var pics = carPicsOf(carById(id));
        if (!pics.length) return;
        slideIdx[id] = ((slideIdx[id] || 0) - 1 + pics.length) % pics.length;
        renderCars();
      });
    });
    root.querySelectorAll('[data-slide-next]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-slide-next');
        var pics = carPicsOf(carById(id));
        if (!pics.length) return;
        slideIdx[id] = ((slideIdx[id] || 0) + 1) % pics.length;
        renderCars();
      });
    });
    root.querySelectorAll('[data-book]').forEach(function (b) {
      b.addEventListener('click', function () {
        pendingBookCarId = Number(b.getAttribute('data-book'));
        detailCarId = null;
        show('book');
      });
    });
    root.querySelectorAll('[data-details]').forEach(function (b) {
      b.addEventListener('click', function () {
        detailCarId = Number(b.getAttribute('data-details'));
        renderCars();
      });
    });
  }
  /* Details popup, modelled on the Cars "I'm interested" popup: an
     overlay that closes on a backdrop tap, a card with a ✕ button,
     the pictures up top and every field below. */
  function carDetailsHtml(c) {
    var rows = [
      ['Plate', c.plate], ['Make', c.make], ['Model', c.model], ['Year', c.year],
      ['Seats', c.seats], ['Fuel', c.fuel], ['Transmission', c.transmission],
      ['Price per day', money(c.price_per_day)]
    ];
    var h = '<div class="modal-overlay" data-close-details><div class="modal">' +
      '<button class="modal-close" data-close-details aria-label="Close">✕</button>' +
      carSlideshowHtml(c) +
      '<h3>' + esc(carLabel(c)) + '</h3>' +
      '<span class="price">' + money(c.price_per_day) + '/day</span>' +
      '<div class="detail-list">';
    rows.forEach(function (r) {
      if (r[1] === '' || r[1] == null) return;
      h += '<div class="detail-row"><span>' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>';
    });
    h += '</div>';
    if (c.description) h += '<p class="info">' + esc(c.description) + '</p>';
    h += '<div class="row"><button data-book="' + c.id + '">Book this car</button></div></div></div>';
    return h;
  }
  function renderCars() {
    var el = $('view-cars');
    if (!rental) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var h = '<h2>' + esc(rental.name) + '</h2>';
    if (rental.about) h += '<p class="info">' + esc(rental.about) + '</p>';
    if (rental.address || rental.phone || rental.hours) {
      h += '<div class="card info">';
      if (rental.address) h += '<p>📍 ' + esc(rental.address) + '</p>';
      if (rental.phone) h += '<p>📞 ' + esc(rental.phone) + '</p>';
      if (rental.hours) h += '<p>🕐 ' + esc(rental.hours) + '</p>';
      h += '</div>';
    }
    var cars = rental.cars || [];
    if (!cars.length) {
      h += '<div class="card"><p class="info">No cars yet — the owner adds cars in Setup.</p></div>';
      el.innerHTML = h;
      return;
    }
    h += '<input id="car-search" type="text" placeholder="Search cars…" value="' + esc(carSearch) + '" class="veh-search">';
    h += '<div id="cars-grid"></div>';
    h += '<div class="card"><p class="info">Found one you like? Book it from the <b>Book</b> tab — pick your dates and see the total before you send it. You pay at pickup.</p></div>';
    if (detailCarId != null) {
      var dc = carById(detailCarId);
      if (dc) h += carDetailsHtml(dc);
      else detailCarId = null;
    }
    el.innerHTML = h;
    var search = $('car-search');
    if (search) search.addEventListener('input', function () {
      carSearch = search.value;
      renderCarsGrid();
      attachCarCardListeners($('cars-grid'));
    });
    renderCarsGrid();
    attachCarCardListeners(el);
    el.querySelectorAll('[data-close-details]').forEach(function (n) {
      n.addEventListener('click', function (e) {
        if (e && e.target && e.target !== n) return;
        detailCarId = null;
        renderCars();
      });
    });
  }

  /* ---------- Book (public form) ---------- */
  function bookDays() {
    var pick = $('bk-pickup') ? $('bk-pickup').value : '';
    var ret = $('bk-return') ? $('bk-return').value : '';
    if (!pick || !ret) return 0;
    var d = Math.round((new Date(ret + 'T12:00:00') - new Date(pick + 'T12:00:00')) / 86400000);
    return Math.max(1, d);
  }
  function updateBookTotal() {
    var out = $('bk-total');
    if (!out) return;
    var c = carById($('bk-car').value);
    var pick = $('bk-pickup').value;
    var ret = $('bk-return').value;
    if (!c) { out.innerHTML = ''; return; }
    if (!pick || !ret) {
      out.innerHTML = '<div class="total">' + money(c.price_per_day) + '/day — pick your dates to see the total</div>';
      return;
    }
    if (ret < pick) {
      out.innerHTML = '<div class="total">Return date must be on or after the pickup date.</div>';
      return;
    }
    var days = bookDays();
    var total = round2(days * Number(c.price_per_day || 0));
    out.innerHTML = '<div class="total">' + days + (days === 1 ? ' day' : ' days') + ' × ' + money(c.price_per_day) + ' = <span class="big">' + money(total) + '</span></div>';
  }
  function renderBook() {
    var el = $('view-book');
    if (!rental) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var cars = rental.cars || [];
    var drivers = rental.drivers || [];
    var h = '<h2>Book a car — ' + esc(rental.name) + '</h2><div class="card direct-help">' +
      '<span class="field-label">Car ' + helpHtml('car') + '</span><select id="bk-car">' +
      (cars.length
        ? cars.map(function (c) { return '<option value="' + c.id + '">' + esc(carLabel(c)) + (c.plate ? ' (' + esc(c.plate) + ')' : '') + ' — ' + money(c.price_per_day) + '/day</option>'; }).join('')
        : '<option value="">No cars yet</option>') +
      '</select>' +
      '<span class="field-label">Driver ' + helpHtml('driver') + '</span><select id="bk-driver">' +
      '<option value="">Self-drive</option>' +
      drivers.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + '</option>'; }).join('') +
      '</select>' +
      '<span class="field-label">Your name ' + helpHtml('name') + '</span><input id="bk-name" type="text" placeholder="Full name">' +
      '<span class="field-label">Phone ' + helpHtml('phone') + '</span><input id="bk-phone" type="tel" placeholder="Phone number">' +
      '<span class="field-label">Email (optional) ' + helpHtml('email') + '</span><input id="bk-email" type="email" placeholder="Email address">' +
      '<span class="field-label">Pickup date ' + helpHtml('pickup') + '</span><input id="bk-pickup" type="date" value="' + todayLocal() + '">' +
      '<span class="field-label">Return date ' + helpHtml('ret') + '</span><input id="bk-return" type="date" value="' + tomorrowLocal() + '">' +
      '<div id="bk-total"></div>' +
      '<div class="row"><button id="bk-go">Book this car</button></div>' +
      '<p class="error" id="bk-err" hidden></p>' +
      '<div id="bk-out" style="margin-top:12px"></div></div>';
    el.innerHTML = h;
    wireHelp(el);
    if (pendingBookCarId != null) {
      var sel = $('bk-car');
      if (sel && carById(pendingBookCarId)) sel.value = pendingBookCarId;
      pendingBookCarId = null;
    }
    ['bk-car', 'bk-pickup', 'bk-return'].forEach(function (id) {
      $(id).addEventListener('change', updateBookTotal);
    });
    updateBookTotal();
    $('bk-go').addEventListener('click', function () {
      var err = $('bk-err');
      var out = $('bk-out');
      var c = carById($('bk-car').value);
      var driver = driverById($('bk-driver').value);
      var driverId = driver ? String(driver.id) : '';
      var driverName = driver ? driver.name : 'Self-drive';
      var name = $('bk-name').value.trim();
      var phone = $('bk-phone').value.trim();
      var email = $('bk-email').value.trim();
      var pickup = $('bk-pickup').value;
      var ret = $('bk-return').value;
      if (!c) { err.hidden = false; err.textContent = 'Pick a car first.'; return; }
      if (!name) { err.hidden = false; err.textContent = 'Your name is required.'; return; }
      if (!phone) { err.hidden = false; err.textContent = 'Your phone number is required.'; return; }
      if (!pickup) { err.hidden = false; err.textContent = 'Pick a pickup date.'; return; }
      if (!ret) { err.hidden = false; err.textContent = 'Pick a return date.'; return; }
      if (ret < pickup) { err.hidden = false; err.textContent = 'Return date must be on or after the pickup date.'; return; }
      err.hidden = true;
      var label = carLabel(c) + (c.plate ? ' (' + c.plate + ')' : '');
      var days = bookDays();
      var total = round2(days * Number(c.price_per_day || 0));
      rpc('place_rentals_booking', { p_slug: SLUG, p_car: String(c.id), p_driver: driverId, p_name: name, p_phone: phone, p_email: email, p_pickup: pickup, p_return: ret }).then(function (res) {
        var id = (res && typeof res === 'object') ? (res.id != null ? res.id : res.booking_id) : res;
        out.innerHTML = '<p class="info">✓ Booked — rental #RB-' + esc(id) + ': ' + esc(label) + ' from ' + esc(pickup) + ' to ' + esc(ret) + ' (' + days + (days === 1 ? ' day' : ' days') + ', ' + money(total) + ') for ' + esc(name) + '. Pay at pickup — show your name when you collect the car.</p>';
        notifyEmail('Car rental booking: ' + label, 'rentals_booking', { slug: SLUG, name: name, phone: phone, email: email, car: label, driver: driverName, pickup: pickup, return: ret, days: days, total: total });
      }).catch(function (e) {
        err.hidden = false;
        err.textContent = 'Error: ' + e.message;
      });
    });
  }

  /* ---------- Bookings (employee password) ---------- */
  function empGate(el, heading, after) {
    el.innerHTML = '<h2>' + heading + '</h2><div class="card">' +
      '<p class="info">Enter the employee password for this rental company to see bookings.</p>' +
      '<label>Employee password</label><input id="emp-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="emp-go">Unlock</button></div>' +
      '<p class="error" id="emp-err" hidden></p></div>';
    $('emp-go').addEventListener('click', function () {
      var pw = $('emp-pass').value;
      rpc('check_rentals_employee_pass', { p_slug: SLUG, p_password: pw }).then(function (ok) {
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
    return rpc('list_rentals_bookings', { p_slug: SLUG, p_epass: empPass }).then(function (d) {
      bookings = d || [];
      if (currentView === 'bookings') renderBookingsList();
      return bookings;
    }).catch(function (e) { if (!quiet) throw e; });
  }
  function renderBookings() {
    var el = $('view-bookings');
    if (!rental) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (passLocked && !empUnlocked) { empGate(el, 'Bookings', renderBookings); return; }
    el.innerHTML = '<h2>Bookings — ' + esc(rental.name) + '</h2><p class="info">Bookings refresh on their own every few seconds.</p><div id="bookings-list"><p class="info">Loading…</p></div>';
    loadBookings().catch(function (e) {
      var l = $('bookings-list');
      if (l) l.innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
    });
  }
  function bookingDetails(b) {
    var d = b.data || {};
    var lines = [];
    if (d.name) lines.push('<b>' + esc(d.name) + '</b>');
    if (d.phone) lines.push('Phone: ' + esc(d.phone));
    if (d.email) lines.push('Email: ' + esc(d.email));
    var c = d.car ? carById(d.car) : null;
    if (c) lines.push('Car: ' + esc(carLabel(c)) + (c.plate ? ' (' + esc(c.plate) + ')' : ''));
    else if (d.car) lines.push('Car: ' + esc(d.car));
    var dr = d.driver ? driverById(d.driver) : null;
    lines.push('Driver: ' + esc(dr ? dr.name : 'Self-drive'));
    if (d.pickup || d.return) lines.push('When: ' + esc(d.pickup || '') + (d.return ? ' → ' + esc(d.return) : ''));
    if (d.days != null && d.days !== '') lines.push('Days: ' + esc(d.days));
    if (d.total != null && d.total !== '') lines.push('Total: ' + money(d.total));
    return lines.join('<br>');
  }
  function renderBookingsList() {
    var el = $('bookings-list');
    if (!el) return;
    if (!bookings.length) { el.innerHTML = '<div class="card"><p class="info">No bookings yet.</p></div>'; return; }
    var h = '';
    var finishedCount = bookings.filter(function (b) { return b.status === 'done' || b.status === 'cancelled'; }).length;
    var stayingCount = bookings.length - finishedCount;
    if (bookingsErr) h += '<p class="error">' + esc(bookingsErr) + '</p>';
    if (clearBookingsConfirm) {
      h += '<p><b>Clear all ' + finishedCount + ' finished booking' + (finishedCount === 1 ? '' : 's') + '?</b> ' + stayingCount + ' active booking' + (stayingCount === 1 ? '' : 's') + ' will stay.</p><div class="row"><button class="small danger" data-clear-bookings-yes>Yes, clear all</button><button class="small secondary" data-clear-bookings-no>Keep them</button></div>';
    } else {
      h += '<div class="row"><button class="small danger" data-clear-bookings>Clear all bookings</button></div>';
    }
    bookings.forEach(function (b) {
      var delBtn = (delBookingId === b.id
        ? '<span><b>Delete this booking?</b> <button class="small danger" data-del-booking-yes="' + b.id + '" data-kind="booking">Yes, delete</button> <button class="small secondary" data-del-booking-no="' + b.id + '">Keep it</button></span>'
        : '<button class="small danger" data-del-booking="' + b.id + '">Delete</button>');
      h += '<div class="card"><h3>Booking #RB-' + esc(b.id) +
        (b.status && b.status !== 'active' ? ' <span class="voided">(' + esc(b.status) + ')</span>' : '') + '</h3>' +
        '<p class="info">' + esc(fmtDT(b.created_at)) + '</p>' +
        '<p>' + bookingDetails(b) + '</p>' +
        (b.status === 'active'
          ? (cancelConfirmId === b.id
            ? '<p><b>Cancel this booking?</b></p><div class="row"><button class="small danger" data-cancel-yes="' + b.id + '" data-kind="booking">Yes, cancel</button><button class="small secondary" data-cancel-no="' + b.id + '">Keep it</button></div>'
            : '<div class="row"><button class="small" data-done="' + b.id + '" data-kind="booking">Mark done</button><button class="small danger" data-cancel="' + b.id + '" data-kind="booking">Cancel</button>' + delBtn + '</div>')
          : '<div class="row">' + delBtn + '</div>') +
        '</div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-done]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-done'));
        var kind = btn.getAttribute('data-kind');
        btn.disabled = true;
        rpc('update_rentals_booking', { p_slug: SLUG, p_epass: empPass, p_kind: kind, p_id: id, p_status: 'done' })
          .then(function () { bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { bookingsErr = 'Error: ' + e.message; renderBookingsList(); });
      });
    });
    el.querySelectorAll('[data-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cancelConfirmId = Number(btn.getAttribute('data-cancel'));
        delBookingId = null;
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
        var kind = btn.getAttribute('data-kind');
        btn.disabled = true;
        rpc('update_rentals_booking', { p_slug: SLUG, p_epass: empPass, p_kind: kind, p_id: id, p_status: 'cancelled' })
          .then(function () { cancelConfirmId = null; bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { cancelConfirmId = null; bookingsErr = 'Error: ' + e.message; renderBookingsList(); });
      });
    });
    el.querySelectorAll('[data-del-booking]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        delBookingId = Number(btn.getAttribute('data-del-booking'));
        cancelConfirmId = null;
        bookingsErr = '';
        renderBookingsList();
      });
    });
    el.querySelectorAll('[data-del-booking-no]').forEach(function (btn) {
      btn.addEventListener('click', function () { delBookingId = null; renderBookingsList(); });
    });
    el.querySelectorAll('[data-del-booking-yes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-del-booking-yes'));
        var kind = btn.getAttribute('data-kind');
        btn.disabled = true;
        rpc('delete_rentals_booking', { p_slug: SLUG, p_epass: empPass, p_kind: kind, p_id: id })
          .then(function () { delBookingId = null; bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { delBookingId = null; bookingsErr = 'Error: ' + e.message; renderBookingsList(); });
      });
    });
    el.querySelectorAll('[data-clear-bookings]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearBookingsConfirm = true;
        bookingsErr = '';
        renderBookingsList();
      });
    });
    el.querySelectorAll('[data-clear-bookings-no]').forEach(function (btn) {
      btn.addEventListener('click', function () { clearBookingsConfirm = false; renderBookingsList(); });
    });
    el.querySelectorAll('[data-clear-bookings-yes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        rpc('clear_rentals_bookings', { p_slug: SLUG, p_epass: empPass })
          .then(function () { clearBookingsConfirm = false; bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { clearBookingsConfirm = false; bookingsErr = 'Error: ' + e.message; renderBookingsList(); });
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
  var REPORTS_SYSTEM = 'rentals';
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
    if (!rental && !systemOff) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (!ownerCreds) {
      el.innerHTML = (systemOff ? SYSTEM_OFF_SETUP_NOTICE : '') + '<h2>Setup</h2><div class="card">' +
        '<p class="info">Enter the username and password Yently gave this rental company.</p>' +
        '<label>Username</label><input id="st-user" type="text" autocomplete="username">' +
        '<label>Password</label><input id="st-pass" type="password" autocomplete="current-password">' +
        '<div class="row"><button id="st-go">Log in</button></div>' +
        '<p class="error" id="st-err" hidden></p></div>';
      $('st-go').addEventListener('click', function () {
        var u = $('st-user').value.trim();
        var p = $('st-pass').value;
        rpc('check_rentals_login', { p_slug: SLUG, p_u: u, p_p: p }).then(function (ok) {
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
      el.innerHTML = (systemOff ? SYSTEM_OFF_SETUP_NOTICE : '') + '<p class="info">Loading your setup…</p>';
      loadDraft();
      return;
    }
    var h = (systemOff ? SYSTEM_OFF_SETUP_NOTICE : '') + '<h2>Setup — ' + esc(rental ? rental.name : 'Car Rental') + '</h2>' +
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
      '<div class="card"><h3>Rental company details</h3>' +
      '<p class="info">' + (directUploadOn ? 'Direct Upload is on for this page — your changes go live the moment you upload them.' : 'Changes save as a draft. Upload for approval and the admin makes them live.') + '</p>' +
      '<label>Company name</label><input id="d-name" type="text" value="' + esc(draft.name || '') + '">' +
      '<label>Icon picture</label>' +
      '<div class="icon-field">' +
      '<img id="setup-icon-preview" class="icon-preview" src="' + esc(draft.icon || '') + '" alt=""' + (draft.icon ? '' : ' hidden') + '>' +
      '<input id="setup-icon-file" type="file" accept="image/*">' +
      '<button type="button" id="setup-icon-remove" class="small secondary">Remove icon</button>' +
      '</div>' +
      '<p class="info" id="setup-icon-out">One small picture shown next to the company name. It is shrunk to 200px before uploading.</p>' +
      '<label>Address</label><input id="d-address" type="text" value="' + esc(draft.address || '') + '">' +
      '<label>Phone</label><input id="d-phone" type="tel" value="' + esc(draft.phone || '') + '">' +
      '<label>Hours</label><input id="d-hours" type="text" value="' + esc(draft.hours || '') + '">' +
      '<label>About</label><textarea id="d-about">' + esc(draft.about || '') + '</textarea>' +
      '<div class="row"><button id="d-save">Save draft</button>' +
      '<button id="d-upload" class="secondary">' + (directUploadOn ? 'Upload — goes live right away' : 'Upload for approval') + '</button></div>' +
      '<p class="info" id="d-status">Draft status: ' + esc(draftStatus) + (draftStatus === 'pending' ? ' — waiting for Yently to approve it.' : draftStatus === 'approved' ? ' — approved, live now.' : ' — not sent yet.') + '</p>' +
      '<p class="error" id="d-err" hidden></p>' +
      '</div>' +
      '<div class="card"><h3>Cars</h3>' +
      '<p class="info">Cars go live right away — no approval needed.</p>' +
      '<div id="cars-list"></div>' +
      '<h3 id="car-form-title">Add a car</h3>' +
      '<label>Plate</label><input id="c-plate" type="text" placeholder="e.g. DEMO-001">' +
      '<label>Make</label><input id="c-make" type="text" placeholder="e.g. Toyota">' +
      '<label>Model</label><input id="c-model" type="text" placeholder="e.g. Camry LE">' +
      '<label>Year</label><input id="c-year" type="number" min="1900" max="2100" step="1" inputmode="numeric">' +
      '<label>Seats</label><input id="c-seats" type="number" min="1" step="1" inputmode="numeric" placeholder="e.g. 5">' +
      '<label>Fuel</label><input id="c-fuel" type="text" placeholder="Petrol, Diesel, Electric, Hybrid…">' +
      '<label>Transmission</label><input id="c-transmission" type="text" placeholder="Automatic, Manual…">' +
      '<label>Price per day</label><input id="c-price" type="number" min="0" step="0.01" inputmode="decimal">' +
      '<label>Description</label><textarea id="c-desc"></textarea>' +
      '<label>Pictures (up to 7)</label>' +
      '<input id="c-pics" type="file" accept="image/*" multiple>' +
      '<div id="c-pics-list"></div>' +
      '<p class="error" id="c-pics-status" hidden></p>' +
      '<div class="row"><button id="c-save">Save car</button>' +
      '<button id="c-cancel" class="secondary" hidden>Cancel edit</button></div>' +
      '<p class="error" id="c-err" hidden></p></div>' +
      '<div class="card"><h3>Drivers</h3>' +
      '<p class="info">Drivers go live right away — no approval needed. Customers pick a driver, or drive themselves.</p>' +
      '<div id="drivers-list"></div>' +
      '<h3 id="driver-form-title">Add a driver</h3>' +
      '<label>Name</label><input id="dr-name" type="text" placeholder="Full name">' +
      '<label>Phone</label><input id="dr-phone" type="tel" placeholder="Phone number">' +
      '<label>Email (optional)</label><input id="dr-email" type="email" placeholder="Email address">' +
      '<label>Licence number</label><input id="dr-licence" type="text" placeholder="e.g. DL-123456">' +
      '<div class="row"><button id="dr-save">Save driver</button>' +
      '<button id="dr-cancel" class="secondary" hidden>Cancel edit</button></div>' +
      '<p class="error" id="dr-err" hidden></p></div>';
    el.innerHTML = h;
    /* Add-ons section: the ☰ menu, the details panel and the
       active list (see renderAddonsSection). Replaces the old
       one-line-per-add-on Setup lines and the Chats card. */
    renderAddonsSection();
    renderCarsList();
    renderDriversList();
    $('d-save').addEventListener('click', function () { saveDraft(false); });
    $('d-upload').addEventListener('click', function () { saveDraft(true); });
    $('c-save').addEventListener('click', saveCar);
    $('c-cancel').addEventListener('click', function () { carEditId = null; renderSetup(); });
    $('dr-save').addEventListener('click', saveDriver);
    $('dr-cancel').addEventListener('click', function () { driverEditId = null; renderSetup(); });
    if (!carEditId) carPics = [];
    renderCarPics();
    $('c-pics').addEventListener('change', onCarPicsChosen);
    wireIconField();
  }
  function renderCarsList() {
    var el = $('cars-list');
    if (!el) return;
    var cars = (rental && rental.cars) || [];
    if (!cars.length) { el.innerHTML = '<p class="info">No cars yet.</p>'; return; }
    var h = '';
    cars.forEach(function (c) {
      h += '<div class="cart-line"><div><b>' + esc(carLabel(c)) + '</b><br><span class="info">' + money(c.price_per_day) + '/day' + (c.plate ? ' · ' + esc(c.plate) : '') + '</span></div>' +
        '<div class="row"><button class="small secondary" data-edit="' + c.id + '">Edit</button>' +
        (delConfirmId === c.id
          ? '<span><b>Delete "' + esc(carLabel(c)) + '"?</b> <button class="small danger" data-del-yes="' + c.id + '">Yes, delete</button> <button class="small secondary" data-del-no="' + c.id + '">Keep it</button></span>'
          : '<button class="small danger" data-del="' + c.id + '">Delete</button>') + '</div></div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = carById(Number(b.getAttribute('data-edit')));
        if (!c) return;
        carEditId = c.id;
        $('c-plate').value = c.plate || '';
        $('c-make').value = c.make || '';
        $('c-model').value = c.model || '';
        $('c-year').value = c.year == null ? '' : c.year;
        $('c-seats').value = c.seats == null ? '' : c.seats;
        $('c-fuel').value = c.fuel || '';
        $('c-transmission').value = c.transmission || '';
        $('c-price').value = c.price_per_day == null ? '' : c.price_per_day;
        $('c-desc').value = c.description || '';
        carPics = (c.pics || []).slice();
        renderCarPics();
        $('car-form-title').textContent = 'Edit car — ' + carLabel(c);
        $('c-cancel').hidden = false;
        window.scrollTo(0, document.getElementById('car-form-title').offsetTop - 80);
      });
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        delConfirmId = Number(b.getAttribute('data-del'));
        renderCarsList();
      });
    });
    el.querySelectorAll('[data-del-no]').forEach(function (b) {
      b.addEventListener('click', function () { delConfirmId = null; renderCarsList(); });
    });
    el.querySelectorAll('[data-del-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = carById(Number(b.getAttribute('data-del-yes')));
        if (!c) return;
        b.disabled = true;
        rpc('delete_rentals_car', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_car_id: c.id })
          .then(function () { delConfirmId = null; return loadRental(); })
          .then(function () { renderSetup(); })
          .catch(function (e) { delConfirmId = null; renderCarsList(); var er = $('c-err'); if (er) { er.hidden = false; er.textContent = 'Error: ' + e.message; } });
      });
    });
  }
  function renderDriversList() {
    var el = $('drivers-list');
    if (!el) return;
    var drivers = (rental && rental.drivers) || [];
    if (!drivers.length) { el.innerHTML = '<p class="info">No drivers yet.</p>'; return; }
    var h = '';
    drivers.forEach(function (d) {
      h += '<div class="cart-line"><div><b>' + esc(d.name) + '</b><br><span class="info">' + (d.phone ? esc(d.phone) : '') + (d.licence ? ' · ' + esc(d.licence) : '') + '</span></div>' +
        '<div class="row"><button class="small secondary" data-dr-edit="' + d.id + '">Edit</button>' +
        (delDriverConfirmId === d.id
          ? '<span><b>Delete "' + esc(d.name) + '"?</b> <button class="small danger" data-dr-del-yes="' + d.id + '">Yes, delete</button> <button class="small secondary" data-dr-del-no="' + d.id + '">Keep it</button></span>'
          : '<button class="small danger" data-dr-del="' + d.id + '">Delete</button>') + '</div></div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-dr-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = driverById(Number(b.getAttribute('data-dr-edit')));
        if (!d) return;
        driverEditId = d.id;
        $('dr-name').value = d.name || '';
        $('dr-phone').value = d.phone || '';
        $('dr-email').value = d.email || '';
        $('dr-licence').value = d.licence || '';
        $('driver-form-title').textContent = 'Edit driver — ' + d.name;
        $('dr-cancel').hidden = false;
        window.scrollTo(0, document.getElementById('driver-form-title').offsetTop - 80);
      });
    });
    el.querySelectorAll('[data-dr-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        delDriverConfirmId = Number(b.getAttribute('data-dr-del'));
        renderDriversList();
      });
    });
    el.querySelectorAll('[data-dr-del-no]').forEach(function (b) {
      b.addEventListener('click', function () { delDriverConfirmId = null; renderDriversList(); });
    });
    el.querySelectorAll('[data-dr-del-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = driverById(Number(b.getAttribute('data-dr-del-yes')));
        if (!d) return;
        b.disabled = true;
        rpc('delete_rentals_driver', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_driver_id: d.id })
          .then(function () { delDriverConfirmId = null; return loadRental(); })
          .then(function () { renderSetup(); })
          .catch(function (e) { delDriverConfirmId = null; renderDriversList(); var er = $('dr-err'); if (er) { er.hidden = false; er.textContent = 'Error: ' + e.message; } });
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
    if (!d.name) { err.hidden = false; err.textContent = 'Company name is required.'; return; }
    err.hidden = true;
    rpc('save_rentals_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_draft: d })
      .then(function () {
        draft = d;
        draftStatus = 'editing';
        if (!upload) {
          $('d-status').textContent = 'Draft status: editing — saved, not sent yet.';
          return;
        }
        return rpc('submit_rentals_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p }).then(function () {
          draftStatus = directUploadOn ? 'approved' : 'pending';
          $('d-status').textContent = directUploadOn ? 'Draft status: approved — live right away.' : 'Draft status: pending — waiting for Yently to approve it.';
          notifyEmail((directUploadOn ? 'Car rental upload — live right away: ' : 'Car rental draft for approval: ') + d.name, 'rentals_draft', { slug: SLUG, name: d.name, status: directUploadOn ? 'Live right away — no approval needed' : undefined });
        });
      })
      .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
  }
  /* ---------- Car pictures (Setup) ---------- */
  /* Shrink a picture in the browser before it is stored. Car
     pictures are shrunk to 800px on the long edge at JPEG quality 0.8
     — big enough to see the car, not high quality. PNGs stay PNG,
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
  /* Upload one picture to the product-images bucket, under store/rentals/,
     and return its public URL. Anon uploads are only allowed under
     store/ — this path qualifies, and the bucket is publicly readable. */
  function uploadCarPicture(file) {
    return shrinkImage(file, 800, 0.8).then(function (up) {
      var safe = up.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      var path = 'store/rentals/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
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
  function renderCarPics() {
    var el = $('c-pics-list');
    if (!el) return;
    var h = '<p class="info">' + carPics.length + ' of 7 pictures</p>';
    if (carPics.length) {
      h += '<div class="pic-thumbs">';
      carPics.forEach(function (url, i) {
        h += '<div class="pic-thumb"><img src="' + esc(url) + '" alt="Car picture ' + (i + 1) + '"><button class="small danger" data-pic-remove="' + i + '">Remove</button></div>';
      });
      h += '</div>';
    }
    el.innerHTML = h;
    el.querySelectorAll('[data-pic-remove]').forEach(function (b) {
      b.addEventListener('click', function () {
        carPics.splice(Number(b.getAttribute('data-pic-remove')), 1);
        renderCarPics();
      });
    });
  }
  function onCarPicsChosen() {
    var input = $('c-pics');
    var status = $('c-pics-status');
    var files = (input && input.files) ? Array.prototype.slice.call(input.files) : [];
    if (!files.length) return;
    var room = 7 - carPics.length;
    if (room <= 0) {
      if (status) { status.hidden = false; status.textContent = 'This car already has 7 pictures — remove one to add another.'; }
      input.value = '';
      return;
    }
    if (files.length > room) {
      if (status) { status.hidden = false; status.textContent = 'Only 7 pictures per car — the extra ' + (files.length - room) + ' picture(s) were not added.'; }
    } else if (status) { status.hidden = true; }
    input.value = '';
    var chain = Promise.resolve();
    files.slice(0, room).forEach(function (file) {
      chain = chain.then(function () { return uploadCarPicture(file); }).then(function (url) {
        carPics.push(url);
        renderCarPics();
      }).catch(function (err) {
        if (status) { status.hidden = false; status.textContent = 'Upload failed: ' + err.message; }
      });
    });
  }
  function collectCar() {
    var year = $('c-year').value.trim();
    var seats = $('c-seats').value.trim();
    var price = $('c-price').value.trim();
    return {
      plate: $('c-plate').value.trim(),
      make: $('c-make').value.trim(),
      model: $('c-model').value.trim(),
      year: year === '' ? null : Math.floor(Number(year)),
      seats: seats === '' ? null : Math.floor(Number(seats)),
      fuel: $('c-fuel').value.trim(),
      transmission: $('c-transmission').value.trim(),
      price_per_day: price === '' ? 0 : Number(price),
      description: $('c-desc').value.trim(),
      pics: carPics.slice()
    };
  }
  function saveCar() {
    var err = $('c-err');
    var v = collectCar();
    if (!v.make) { err.hidden = false; err.textContent = 'Make is required.'; return; }
    if (!(v.price_per_day >= 0)) { err.hidden = false; err.textContent = 'Price per day must be 0 or more.'; return; }
    err.hidden = true;
    if (carEditId) v.id = carEditId;
    rpc('save_rentals_car', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_car: v })
      .then(function () { carEditId = null; return loadRental(); })
      .then(function () { renderSetup(); })
      .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
  }
  function collectDriver() {
    return {
      name: $('dr-name').value.trim(),
      phone: $('dr-phone').value.trim(),
      email: $('dr-email').value.trim(),
      licence: $('dr-licence').value.trim()
    };
  }
  function saveDriver() {
    var err = $('dr-err');
    var v = collectDriver();
    if (!v.name) { err.hidden = false; err.textContent = 'Driver name is required.'; return; }
    err.hidden = true;
    if (driverEditId) v.id = driverEditId;
    rpc('save_rentals_driver', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_driver: v })
      .then(function () { driverEditId = null; return loadRental(); })
      .then(function () { renderSetup(); })
      .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
  }
  function loadDraft() {
    rpc('get_rentals_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p })
      .then(function (d) {
        draft = d || {};
        draftStatus = 'editing';
        /* Direct Upload switch: see the note by directUploadOn. */
        return rpc('direct_upload_enabled', { p_owner_type: 'rentals', p_owner_key: SLUG }).then(function (on) {
          directUploadOn = (on === true);
        }).catch(function () { directUploadOn = false; }).then(function () {
          /* Reports switch: see the note by reportsOn. */
          return rpc('reports_enabled', { p_owner_type: 'rentals', p_owner_key: SLUG }).then(function (on) {
            reportsOn = (on === true);
          }).catch(function () { reportsOn = false; });
        }).then(function () {
          /* TV Gallery switch: see the note by tvGalleryOn. */
          return rpc('tv_gallery_enabled', { p_owner_type: 'rentals', p_owner_key: SLUG }).then(function (on) {
            tvGalleryOn = (on === true);
          }).catch(function () { tvGalleryOn = false; });
        }).then(function () {
          /* Live Chat switch: see the note by chatOn. */
          return rpc('shop_chat_enabled', { p_owner_type: 'rentals', p_owner_key: SLUG }).then(function (on) {
            chatOn = (on === true);
          }).catch(function () { chatOn = false; });
        }).then(function () {
          /* Clean Link: whether the shop already has one
             (clean_link_exists, public RPC) — for the Add-ons
             section's Clean Link panel and active list. */
          return rpc('clean_link_exists', { p_system: 'rentals', p_slug: SLUG }).then(function (has) {
            hasCleanLink = (has === true);
          }).catch(function () { hasCleanLink = false; });
        }).then(function () {
          /* Remove Branding switch: whether Yently switched the
             "Powered by YENTLY.com" banners off for this shop
             (branding_removed, public RPC) — for the Add-ons
             section's Remove Branding panel and active list. */
          return rpc('branding_removed', { p_owner_type: 'rentals', p_owner_key: SLUG }).then(function (on) {
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
      $('site-name').textContent = 'Car Rental';
      $('view-cars').innerHTML = '<div class="card"><h2>Car rental not found</h2><p class="info">This car rental page needs your own rental link — ask Yently for it.</p></div>';
      return;
    }
    checkSystemOff().then(function (off) {
      if (off) {
        systemOff = true;
        $('site-name').textContent = 'Car Rental';
        $('view-cars').innerHTML = SYSTEM_OFF_NOTICE;
        return;
      }
      loadRental().then(function (d) {
        if (!d) {
          $('site-name').textContent = 'Car Rental';
          $('view-cars').innerHTML = '<div class="card"><h2>Car rental not found</h2><p class="info">No rental company with this link yet. Ask Yently to set it up.</p></div>';
          return;
        }
        mountShopChatBubble(d.name, '');
        return rpc('rentals_pass_status', { p_slug: SLUG }).then(function (st) {
          passLocked = st === 'locked';
          empUnlocked = !passLocked;
          renderCars();
        });
      }).catch(function (e) {
        $('view-cars').innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
      });
    });
  }
  resolveSlug().then(function () { init(); });
})();
