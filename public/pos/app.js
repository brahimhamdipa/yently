/* POS page app — ONE folder for every store.
   The store comes from the link (?s=<slug>), and its info, items, and
   sales live in the database — there is no data.json file here.
   Every store has its own items and sales, but they all use this same POS.
   Visitors see the public price list (Shop tab). The register (Sell) and
   the sales history (Receipts) need the store's shared employee password
   (one password for all staff, set by the admin; stores with none set
   stay fully open). Setup needs the owner's own username + password.
   Setup edits save as a draft, and the Upload button sends the draft to
   the admin for approval — approval makes it live instantly. Items are
   different: the owner adds, edits, and deletes items live in Setup, and
   every completed sale lowers the stock by itself. A voided sale puts
   the stock back. All credentials live in memory only: a reload asks
   again, exactly like the diner and barbershop pages.
   "Card" only records that the card was taken at the counter terminal —
   no card is charged online. */
(function () {
  'use strict';

  /* Sideways-scroll guard (Setup file inputs): Setup is the only page
     with <input type="file">, and a file input's intrinsic phone width
     can push the page past the viewport. The per-system style.css is a
     separate file, so these two rules are injected here instead — the
     same two rules as the diner fix: cap file inputs at the card width,
     and never let the page scroll sideways. The body rule is handed to
     the viewport, so the sticky header keeps working. */
  (function () {
    var st = document.createElement('style');
    st.textContent = 'input[type="file"]{max-width:100%}body{overflow-x:hidden}';
    (document.head || document.documentElement).appendChild(st);
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
  var SLUG = String(params.s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
  var SLUG_FROM_PATH = false;
  var slugResolved = false;
  if (!SLUG) {
    // Clean link (yently.com/<slug>): the middleware rewrites the
    // page server-side, so location.search is empty in the browser.
    // The shop slug is then the last path segment. Ignore this
    // system's own folder name, so a bare /pos visit still
    // shows "not found" by design.
    var segs = location.pathname.split('/').filter(function (s) { return s; });
    var lastSeg = (segs[segs.length - 1] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    if (lastSeg && lastSeg !== 'pos') { SLUG = lastSeg; SLUG_FROM_PATH = true; }
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

  /* Public by design: the same publishable key the main AutoFly site ships
     in its own pages. Used only for the database calls below. */
  var SUPABASE_URL = 'https://deykvlxikzwwrygmkdly.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_e2uwGgFB0SvVQS-TZahArQ_mjypz9Vr';

  var store = null; // live store info + items (visitors)
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
    window.ShopChat.mountBubble(wrap, { ownerType: 'pos', ownerKey: SLUG, shopName: shopName || 'this shop', ownerEmail: ownerEmail || '' });
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
  var ADDONS_SYSTEM = 'pos';
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
      if (cleanAdd) cleanAdd.onclick = function () { var t = $('setup-addons-clean-type'); window.location.href = '/?add=' + encodeURIComponent(t ? t.value : 'clean:website') + '&shop=pos&slug=' + encodeURIComponent(SLUG) + '&addon=1'; };
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
          window.ShopChat.mountInbox(inbox, { ownerType: 'pos', ownerKey: SLUG, creds: { u: ownerCreds.u, p: ownerCreds.p } });
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
      fetch(SUPABASE_URL + '/rest/v1/clean_links?system=eq.pos&shop_slug=eq.' + encodeURIComponent(SLUG) + '&select=slug', {
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
  var empUnlocked = false; // true once the employee password is entered, or when the store has none set
  var passLocked = false;
  var cart = {}; // item id -> quantity
  var sales = [];
  var lastReceipt = null;
  var currentView = 'shop';
  var receiptsTimer = null;
  var itemEditId = null; // item being edited in Setup, null = adding
  var scanner = null; // running Html5Qrcode scanner, if any
  var scanTarget = null; // 'sell' (add to cart) or 'setup' (fill the barcode field)
  var lastScanCode = '';
  var lastScanAt = 0;
  var scanOverlay = null; // fixed overlay holding the camera view
  var voidConfirmId = null; // sale id awaiting an in-page void confirmation
  var voidErr = ''; // last void error, shown inline above the sales list
  var delSaleId = null; // sale id awaiting an in-page delete confirmation (Receipts)
  var clearSalesConfirm = false; // true while the clear-all-receipts confirm is showing
  var delConfirmId = null; // item id awaiting an in-page delete confirmation
  var shopQuery = ''; // current Shop search text, kept across re-renders
  var sellQuery = ''; // current Sell search/scan text, kept across re-renders
  var refocusSellSearch = false; // put the cursor back in the Sell search box after a scan/Enter add
  var itemPic = ''; // picture URL for the item being added/edited in Setup

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + Number(n || 0).toFixed(2); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function fmtDT(iso) {
    var d = new Date(iso);
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  /* System kill switch (Admin menu 4 -> Systems On/Off): when Yently
     switches this system off, visitors see it as unavailable and the
     shop data is never loaded, while the Setup tab stays reachable.
     Any error, missing row, or missing RPC means the system stays ON
     (fail open). */
  var systemOff = false;
  function checkSystemOff() {
    try {
      if (typeof rpc !== 'function') return Promise.resolve(false);
      return rpc('list_system_switches', {}).then(function (rows) {
        if (!rows || !rows.length) return false;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].system === 'pos') return rows[i].visible === false;
        }
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
  function notifyEmail(subject, record) {
    try {
      fetch(SUPABASE_URL + '/functions/v1/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
        body: JSON.stringify({ subject: subject, table: 'pos_draft', record: record })
      }).catch(function () {});
    } catch (e) {}
  }
  /* ---------- Icon picture (one small square image) ---------- */
  /* The icon lives in the draft/live data as `icon` — a public URL or ''.
     It is uploaded to the product-images bucket, shrunk to 200px on its
     long edge first (same rules as the shop picture uploads: JPEG 0.8,
     PNGs stay PNG, small pictures untouched, any failure falls back to
     the original file). */
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
  /* ---------- Item pictures (one small picture per item) ---------- */
  /* Same rules as the icon: shrunk to 200px on the long edge, JPEG 0.8,
     PNGs stay PNG, small pictures untouched, failure falls back to the
     original file. Uploaded to store/pos-items/ so the anon upload
     policy (store/ only) allows it. The URL is stored on the item as
     `pic` and shown on Shop and Sell next to the item. */
  function shrinkItemPic(file) {
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
  function uploadItemPic(file) {
    return shrinkItemPic(file).then(function (up) {
      var safe = up.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      var path = 'store/pos-items/' + SLUG + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
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
  /* Small thumbnail on the right of an item — 96x72, the same size as
     the dealer Setup thumbnails. Items without a picture show nothing. */
  function itemPicHtml(it) {
    return it && it.pic ? '<img class="item-thumb" src="' + esc(it.pic) + '" alt="">' : '';
  }
  /* Search matching: Shop filters by name/category; Sell also matches
     the barcode, so a scanner (or a typed code) finds its item. */
  function matchesShopQuery(it, q) {
    if (!q) return true;
    q = String(q).toLowerCase();
    return (it.name || '').toLowerCase().indexOf(q) !== -1 ||
      (it.category || '').toLowerCase().indexOf(q) !== -1;
  }
  function matchesSellQuery(it, q) {
    if (!q) return true;
    return matchesShopQuery(it, q) || String(it.barcode || '').toLowerCase().indexOf(String(q).toLowerCase()) !== -1;
  }
  function itemById(id) {
    return (store.items || []).filter(function (p) { return String(p.id) === String(id); })[0] || null;
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
  }
  function taxRate() { return Number(store && store.taxRate != null ? store.taxRate : 0.08); }
  function cartTotals() {
    var sub = 0;
    Object.keys(cart).forEach(function (id) {
      var it = itemById(id);
      if (it) sub += Number(it.price) * cart[id];
    });
    sub = round2(sub);
    var tax = round2(sub * taxRate());
    return { sub: sub, tax: tax, total: round2(sub + tax) };
  }

  /* ---------- views ---------- */
  function show(view) {
    currentView = view;
    if (view !== 'setup') stopShopChat();
    ['shop', 'sell', 'receipts', 'setup'].forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.hidden = v !== view;
    });
    var tabs = document.querySelectorAll('#tabs button');
    tabs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view); });
    if (receiptsTimer) { clearInterval(receiptsTimer); receiptsTimer = null; }
    if (view === 'shop') renderShop();
    if (view === 'sell') renderSell();
    if (view === 'receipts') { renderReceipts(); receiptsTimer = setInterval(function () { if (currentView === 'receipts' && empUnlocked) loadSales(true); }, 10000); }
    if (view === 'setup') renderSetup();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-view')); });
  });
  $('to-top').addEventListener('click', function () { window.scrollTo(0, 0); });

  function setHeader() {
    $('site-name').textContent = store ? store.name : 'POS';
    renderHeaderIcon(store && store.icon ? store.icon : '');
    $('site-about').innerHTML = store
      ? [esc(store.address), esc(store.phone)].filter(Boolean).join('<br>')
      : '';
    $('site-footer').innerHTML = store
      ? [esc(store.address), esc(store.phone)].filter(Boolean).join('<br>') + '<br>' + YENTLY_BADGE_HTML
      : YENTLY_BADGE_HTML;
    showYentlyBadgeTop();
    hideYentlyBadgeIfRemoved();
    document.title = (store ? store.name : 'POS') + ' — Point of Sale';
  }

  /* ---------- Shop (public price list) ---------- */
  function renderShop() {
    var el = $('view-shop');
    if (!store) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var h = '<h2>' + esc(store.name) + '</h2>';
    if (store.address || store.phone) h += '<p class="info">' + [esc(store.address), esc(store.phone)].filter(Boolean).join('<br>') + '</p>';
    /* The search box lives outside the results container, so typing
       never loses the cursor — only the list below is re-rendered. */
    h += '<input id="shop-search" type="text" placeholder="Search items…" value="' + esc(shopQuery) + '" autocomplete="off">';
    h += '<div id="shop-results"></div>';
    h += '<div class="card"><p class="info">Staff: open the <b>Sell</b> tab to ring up a sale. Tax ' + Math.round(taxRate() * 100) + '% is added at the till.</p></div>';
    el.innerHTML = h;
    $('shop-search').addEventListener('input', function () { shopQuery = this.value; renderShopResults(); });
    renderShopResults();
  }
  function renderShopResults() {
    var el = $('shop-results');
    if (!el) return;
    var items = (store.items || []).filter(function (it) { return matchesShopQuery(it, shopQuery); });
    if (!items.length) {
      el.innerHTML = (store.items || []).length
        ? '<div class="card"><p class="info">No items match your search.</p></div>'
        : '<div class="card"><p class="info">No items yet — the owner adds items in Setup.</p></div>';
      return;
    }
    var cats = [];
    items.forEach(function (it) {
      if (cats.indexOf(it.category || '') === -1) cats.push(it.category || '');
    });
    var h = '';
    cats.forEach(function (c) {
      h += '<h3>' + esc(c || 'Items') + '</h3><div class="item-grid">';
      items.filter(function (it) { return (it.category || '') === c; }).forEach(function (it) {
        h += '<div class="item-card"><div class="item-top"><div class="item-text"><h3>' + esc(it.name) + '</h3>' +
          '<span class="price">' + money(it.price) + '</span>' +
          (Number(it.stock) > 0
            ? '<span class="stock">' + Number(it.stock) + ' in stock</span>'
            : '<span class="out">Out of stock</span>') +
          '</div>' + itemPicHtml(it) + '</div></div>';
      });
      h += '</div>';
    });
    el.innerHTML = h;
  }

  /* ---------- Sell (cashier) ---------- */
  function empGate(el, heading, after) {
    /* The gate can be rendered into two hidden views at once (Sell and
       Receipts both live in the page), so the ids below can exist twice
       in the document. Look the button, input and error up INSIDE this
       view's container only — a global getElementById would find the
       first copy in the page and wire the wrong button, leaving this
       view's Unlock button dead. That was why an employee could not
       unlock Receipts after visiting Sell first (and why unlocking
       from Sell could fire the Receipts callback too). The server
       check itself (check_pos_employee_pass) is sound — this was
       purely the page wiring the wrong button. */
    el.innerHTML = '<h2>' + heading + '</h2><div class="card">' +
      '<p class="info">Enter the employee password for this store to open the register.</p>' +
      '<label>Employee password</label><input id="emp-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="emp-go">Unlock</button></div>' +
      '<p class="error" id="emp-err" hidden></p></div>';
    el.querySelector('#emp-go').addEventListener('click', function () {
      var pw = el.querySelector('#emp-pass').value;
      rpc('check_pos_employee_pass', { p_slug: SLUG, p_password: pw }).then(function (ok) {
        if (!ok) {
          var e = el.querySelector('#emp-err');
          e.hidden = false;
          e.textContent = 'Wrong employee password.';
          return;
        }
        empPass = pw;
        empUnlocked = true;
        after();
      }).catch(function (err) {
        var e = el.querySelector('#emp-err');
        e.hidden = false;
        e.textContent = 'Error: ' + err.message;
      });
    });
  }
  function renderSell() {
    var el = $('view-sell');
    if (!store) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (passLocked && !empUnlocked) { empGate(el, 'Sell', renderSell); return; }
    var h = '<h2>Sell — ' + esc(store.name) + '</h2>';
    h += '<div class="card"><div class="row"><button id="sell-scan">📷 Scan barcode</button>' +
      '<span class="info">Point the phone camera at a product barcode to add it to the sale.</span></div>' +
      '<p class="info" id="scan-note" hidden></p></div>';
    if (lastReceipt) h += receiptHtml(lastReceipt);
    /* Search or scan: the box filters the list while typing, and a
       hardware barcode scanner (keyboard wedge: fast typing + Enter)
       works here too — Enter adds the scanned item. The box lives
       outside the results container so typing never loses the cursor. */
    h += '<input id="sell-search" type="text" placeholder="Search or scan barcode…" value="' + esc(sellQuery) + '" autocomplete="off" inputmode="search">';
    h += '<p class="error" id="sell-search-err" hidden></p>';
    h += '<div id="sell-results"></div>';
    h += '<div class="card"><h3>Current sale</h3><div id="cart-lines"></div>' +
      '<div id="cart-totals"></div>' +
      '<label>Customer name (optional)</label><input id="sale-name" type="text" placeholder="Name for the receipt">' +
      '<label>Customer phone (optional)</label><input id="sale-phone" type="tel" placeholder="Phone for the receipt">' +
      '<label>Payment</label><select id="sale-pay"><option value="cash">Cash</option><option value="card">Card</option></select>' +
      '<p class="info">Card only records that the card was taken at the counter terminal — no card is charged online.</p>' +
      '<label>Cash tendered</label><input id="sale-tendered" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00">' +
      '<div class="row"><button id="sale-complete">Complete sale</button>' +
      '<button id="sale-clear" class="secondary">Clear</button></div>' +
      '<p class="error" id="sale-err" hidden></p></div>';
    el.innerHTML = h;
    var pb = $('receipt-print');
    if (pb) pb.addEventListener('click', printReceipt);
    var scanBtn = $('sell-scan');
    if (scanBtn) scanBtn.addEventListener('click', function () { openScanner('sell'); });
    var sInput = $('sell-search');
    sInput.addEventListener('input', function () { sellQuery = this.value; hideSellSearchErr(); renderSellResults(); });
    sInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); sellSearchEnter(); } });
    $('sale-clear').addEventListener('click', function () { cart = {}; lastReceipt = null; updateBadges(); renderSell(); });
    $('sale-complete').addEventListener('click', completeSale);
    renderSellResults();
    renderCartLines();
    if (refocusSellSearch) {
      refocusSellSearch = false;
      if (sInput.focus) sInput.focus();
    }
  }
  function renderSellResults() {
    var el = $('sell-results');
    if (!el) return;
    var items = (store.items || []).filter(function (it) { return matchesSellQuery(it, sellQuery); });
    if (!items.length) {
      el.innerHTML = (store.items || []).length
        ? '<div class="card"><p class="info">No items match your search.</p></div>'
        : '<div class="card"><p class="info">No items to sell yet — add items in Setup first.</p></div>';
      return;
    }
    var cats = [];
    items.forEach(function (it) {
      if (cats.indexOf(it.category || '') === -1) cats.push(it.category || '');
    });
    var h = '';
    cats.forEach(function (c) {
      h += '<h3>' + esc(c || 'Items') + '</h3><div class="item-grid">';
      items.filter(function (it) { return (it.category || '') === c; }).forEach(function (it) {
        var inCart = cart[it.id] || 0;
        h += '<div class="item-card"><div class="item-top"><div class="item-text"><h3>' + esc(it.name) + '</h3>' +
          '<span class="price">' + money(it.price) + '</span>' +
          (Number(it.stock) > 0
            ? '<span class="stock">' + Number(it.stock) + ' in stock</span>'
            : '<span class="out">Out of stock</span>') +
          '</div>' + itemPicHtml(it) + '</div>' +
          (Number(it.stock) > 0
            ? '<button class="small" data-add="' + it.id + '">Add' + (inCart ? ' (' + inCart + ')' : '') + '</button>'
            : '<button class="small" disabled>Out of stock</button>') +
          '</div>';
      });
      h += '</div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { addToCart(Number(b.getAttribute('data-add'))); });
    });
  }
  function showSellSearchErr(msg) {
    var e = $('sell-search-err');
    if (e) { e.hidden = false; e.textContent = msg; }
  }
  function hideSellSearchErr() {
    var e = $('sell-search-err');
    if (e) e.hidden = true;
  }
  function clearSellSearch() {
    sellQuery = '';
    var s = $('sell-search');
    if (s) s.value = '';
    hideSellSearchErr();
    renderSellResults();
  }
  /* Enter in the Sell search box. A hardware barcode scanner types the
     code and presses Enter, so this is the scanner path too — not only
     the phone camera. An exact barcode match adds that item; otherwise
     a single matching item is added; anything else stays on screen. */
  function sellSearchEnter() {
    var q = String(sellQuery || '').trim();
    if (!q) return;
    var items = store.items || [];
    var byBarcode = items.filter(function (it) { return String(it.barcode || '') !== '' && String(it.barcode) === q; })[0];
    if (byBarcode) {
      if (Number(byBarcode.stock) <= 0) { showSellSearchErr(byBarcode.name + ' is out of stock.'); return; }
      clearSellSearch();
      addToCart(byBarcode.id, true);
      return;
    }
    var matched = items.filter(function (it) { return matchesSellQuery(it, q); });
    if (matched.length === 1) {
      if (Number(matched[0].stock) <= 0) { showSellSearchErr(matched[0].name + ' is out of stock.'); return; }
      clearSellSearch();
      addToCart(matched[0].id, true);
      return;
    }
    if (matched.length === 0) {
      showSellSearchErr(/^\d+$/.test(q) ? 'No item with that barcode.' : 'No items match your search.');
      return;
    }
    /* Several matches: the filtered list below already shows them — the
       cashier picks one. */
  }
  function addToCart(id, fromSearch) {
    var it = itemById(id);
    if (!it || Number(it.stock) <= 0) return;
    var cur = cart[id] || 0;
    if (cur + 1 > Number(it.stock)) {
      var e = $('sale-err');
      if (e) { e.hidden = false; e.textContent = 'Only ' + Number(it.stock) + ' in stock for ' + it.name + '.'; }
      return;
    }
    cart[id] = cur + 1;
    updateBadges();
    if (fromSearch) refocusSellSearch = true;
    renderSell();
  }
  function renderCartLines() {
    var lines = $('cart-lines');
    var totals = $('cart-totals');
    if (!lines || !totals) return;
    var ids = Object.keys(cart);
    if (!ids.length) {
      lines.innerHTML = '<p class="info">Nothing in this sale yet — tap Add on an item.</p>';
      totals.innerHTML = '';
      return;
    }
    var h = '';
    ids.forEach(function (id) {
      var it = itemById(id);
      if (!it) return;
      h += '<div class="cart-line"><div><b>' + esc(it.name) + '</b><br><span class="info">' + money(it.price) + ' each</span></div>' +
        '<div class="qty"><button data-dec="' + id + '" aria-label="Less">−</button><span>' + cart[id] + '</span>' +
        '<button data-inc="' + id + '" aria-label="More">+</button></div>' +
        '<b>' + money(Number(it.price) * cart[id]) + '</b></div>';
    });
    lines.innerHTML = h;
    lines.querySelectorAll('[data-inc]').forEach(function (b) {
      b.addEventListener('click', function () { addToCart(Number(b.getAttribute('data-inc'))); });
    });
    lines.querySelectorAll('[data-dec]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-dec');
        cart[id] -= 1;
        if (cart[id] <= 0) delete cart[id];
        updateBadges();
        renderSell();
      });
    });
    var t = cartTotals();
    totals.innerHTML = '<div class="total">Subtotal ' + money(t.sub) + '<br>Tax (' + Math.round(taxRate() * 100) + '%) ' + money(t.tax) +
      '<br><span class="big">Total ' + money(t.total) + '</span></div>';
  }
  function completeSale() {
    var ids = Object.keys(cart);
    var err = $('sale-err');
    if (!ids.length) { err.hidden = false; err.textContent = 'The sale is empty.'; return; }
    var t = cartTotals();
    var pay = $('sale-pay').value;
    var tendered = Number($('sale-tendered').value || 0);
    if (pay === 'cash' && tendered < t.total) {
      err.hidden = false;
      err.textContent = 'Cash tendered (' + money(tendered) + ') is less than the total (' + money(t.total) + ').';
      return;
    }
    err.hidden = true;
    var items = ids.map(function (id) { return { id: Number(id), qty: cart[id] }; });
    rpc('place_pos_sale', {
      p_slug: SLUG, p_epass: empPass, p_items: items,
      p_tendered: tendered, p_payment: pay,
      p_customer: { name: $('sale-name').value.trim(), phone: $('sale-phone').value.trim() }
    }).then(function (res) {
      cart = {};
      updateBadges();
      lastReceipt = {
        ref: res.ref, items: items.map(function (l) {
          var it = itemById(l.id);
          return { name: it ? it.name : 'Item', price: it ? Number(it.price) : 0, qty: l.qty };
        }),
        subtotal: res.subtotal, tax: res.tax, total: res.total, change: res.change,
        payment: pay, customer: $('sale-name').value.trim()
      };
      return loadStore();
    }).then(function () { renderSell(); })
    .catch(function (e2) {
      err.hidden = false;
      err.textContent = 'Error: ' + e2.message;
    });
  }
  function receiptHtml(r) {
    var h = '<div class="receipt"><h3>' + esc(store.name) + '</h3>' +
      '<p class="center">Receipt ' + esc(r.ref) + (r.customer ? ' · ' + esc(r.customer) : '') + '</p>';
    (r.items || []).forEach(function (l) {
      h += '<div class="line"><span>' + esc(l.name) + ' × ' + l.qty + '</span><span>' + money(Number(l.price) * l.qty) + '</span></div>';
    });
    h += '<div class="line"><span>Subtotal</span><span>' + money(r.subtotal) + '</span></div>' +
      '<div class="line"><span>Tax</span><span>' + money(r.tax) + '</span></div>' +
      '<div class="line"><b>Total</b><b>' + money(r.total) + '</b></div>' +
      '<div class="line"><span>Paid (' + esc(r.payment || 'cash') + ')</span><span>' + money(Number(r.total) + Number(r.change || 0)) + '</span></div>';
    if (Number(r.change || 0) > 0) h += '<div class="line"><span>Change</span><span>' + money(r.change) + '</span></div>';
    h += '<p class="center">' + esc(store.receiptMessage || 'Thank you!') + '</p>' +
      '<div class="row" style="justify-content:center"><button class="small" id="receipt-print">Print receipt</button></div></div>';
    return h;
  }
  function loadStore() {
    return rpc('get_pos_live', { p_slug: SLUG }).then(function (d) {
      store = d;
      setHeader();
      return d;
    });
  }

  /* ---------- Receipts (cashier) ---------- */
  function loadSales(quiet) {
    return rpc('list_pos_sales', { p_slug: SLUG, p_epass: empPass, p_limit: 50 }).then(function (d) {
      sales = d || [];
      if (currentView === 'receipts') renderReceiptsList();
      return sales;
    }).catch(function (e) { if (!quiet) throw e; });
  }
  function renderReceipts() {
    var el = $('view-receipts');
    if (!store) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (passLocked && !empUnlocked) { empGate(el, 'Receipts', renderReceipts); return; }
    el.innerHTML = '<h2>Receipts — ' + esc(store.name) + '</h2><div id="sales-list"><p class="info">Loading…</p></div>';
    loadSales().catch(function (e) {
      var l = $('sales-list');
      if (l) l.innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
    });
  }
  function renderReceiptsList() {
    var el = $('sales-list');
    if (!el) return;
    if (!sales.length) { el.innerHTML = '<div class="card"><p class="info">No sales yet.</p></div>'; return; }
    var h = '';
    if (voidErr) h += '<p class="error">' + esc(voidErr) + '</p>';
    /* Clear all: two-step confirm, same pattern as Void below. */
    if (clearSalesConfirm) {
      h += '<p><b>Clear all receipts? This deletes every receipt for this store and cannot be undone.</b></p><div class="row"><button class="small danger" data-clear-yes>Yes, clear all</button><button class="small secondary" data-clear-no>Keep them</button></div>';
    } else {
      h += '<div class="row"><button class="small danger" data-clear>Clear all receipts</button></div>';
    }
    sales.forEach(function (s) {
      var items = s.items || [];
      var names = items.map(function (l) { return esc(l.name) + ' × ' + l.qty; }).join(', ');
      h += '<div class="card"><h3>' + esc(s.ref) + ' — ' + money(s.total) +
        (s.status === 'voided' ? ' <span class="voided">(voided)</span>' : '') + '</h3>' +
        '<p class="info">' + esc(fmtDT(s.created_at)) + ' · ' + esc(s.payment || 'cash') +
        (s.customer_name ? ' · ' + esc(s.customer_name) : '') + '</p>' +
        '<p>' + names + '</p>' +
        (s.status !== 'voided'
          ? (voidConfirmId === s.id
            ? '<p><b>Void this sale? The stock goes back.</b></p><div class="row"><button class="small danger" data-void-yes="' + s.id + '">Yes, void it</button><button class="small secondary" data-void-no="' + s.id + '">Keep it</button></div>'
            : '<button class="small danger" data-void="' + s.id + '">Void sale</button>')
          : '') +
        (delSaleId === s.id
          ? '<p><b>Delete this receipt? The sale stays counted — use Void first if the stock should go back.</b></p><div class="row"><button class="small danger" data-del-yes="' + s.id + '">Yes, delete</button><button class="small secondary" data-del-no="' + s.id + '">Keep it</button></div>'
          : '<button class="small danger" data-del="' + s.id + '">Delete receipt</button>') +
        '</div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-void]').forEach(function (b) {
      b.addEventListener('click', function () {
        voidConfirmId = Number(b.getAttribute('data-void'));
        voidErr = '';
        renderReceiptsList();
      });
    });
    el.querySelectorAll('[data-void-no]').forEach(function (b) {
      b.addEventListener('click', function () { voidConfirmId = null; renderReceiptsList(); });
    });
    el.querySelectorAll('[data-void-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-void-yes'));
        b.disabled = true;
        rpc('void_pos_sale', { p_slug: SLUG, p_epass: empPass, p_sale_id: id })
          .then(function () { voidConfirmId = null; voidErr = ''; return loadStore(); })
          .then(function () { return loadSales(); })
          .catch(function (e) { voidConfirmId = null; voidErr = 'Error: ' + e.message; renderReceiptsList(); });
      });
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        delSaleId = Number(b.getAttribute('data-del'));
        voidErr = '';
        renderReceiptsList();
      });
    });
    el.querySelectorAll('[data-del-no]').forEach(function (b) {
      b.addEventListener('click', function () { delSaleId = null; renderReceiptsList(); });
    });
    el.querySelectorAll('[data-del-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-del-yes'));
        b.disabled = true;
        rpc('delete_pos_sale', { p_slug: SLUG, p_epass: empPass, p_sale_id: id })
          .then(function () { delSaleId = null; voidErr = ''; return loadSales(); })
          .catch(function (e) { delSaleId = null; voidErr = 'Error: ' + e.message; renderReceiptsList(); });
      });
    });
    el.querySelectorAll('[data-clear]').forEach(function (b) {
      b.addEventListener('click', function () {
        clearSalesConfirm = true;
        renderReceiptsList();
      });
    });
    el.querySelectorAll('[data-clear-no]').forEach(function (b) {
      b.addEventListener('click', function () { clearSalesConfirm = false; renderReceiptsList(); });
    });
    el.querySelectorAll('[data-clear-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        rpc('clear_pos_sales', { p_slug: SLUG, p_epass: empPass })
          .then(function () { clearSalesConfirm = false; voidErr = ''; return loadSales(); })
          .catch(function (e) { clearSalesConfirm = false; voidErr = 'Error: ' + e.message; renderReceiptsList(); });
      });
    });
  }
  function printReceipt() {
    if (!lastReceipt) return;
    var r = lastReceipt;
    var h = '<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto">' +
      '<h3 style="text-align:center">' + esc(store.name) + '</h3>' +
      '<p style="text-align:center">Receipt ' + esc(r.ref) + '</p>';
    (r.items || []).forEach(function (l) {
      h += '<div style="display:flex;justify-content:space-between"><span>' + esc(l.name) + ' × ' + l.qty + '</span><span>' + money(Number(l.price) * l.qty) + '</span></div>';
    });
    h += '<div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>' + money(r.subtotal) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between"><span>Tax</span><span>' + money(r.tax) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between"><b>Total</b><b>' + money(r.total) + '</b></div>';
    if (Number(r.change || 0) > 0) h += '<div style="display:flex;justify-content:space-between"><span>Change</span><span>' + money(r.change) + '</span></div>';
    h += '<p style="text-align:center">' + esc(store.receiptMessage || 'Thank you!') + '</p></div>';
    $('print-area').innerHTML = h;
    window.print();
  }

  /* ---------- Barcode scanner (phone camera) ---------- */
  /* The camera reads the barcode with the phone itself — no extra
     hardware. The code is matched against this store's items, which
     are already loaded. In Sell it adds the item to the sale; in
     Setup it fills the barcode field of the item being added. The
     same code stays on screen while scanning, so one scan must not
     add the same item ten times — repeats within 2 seconds are
     ignored. */
  function openScanner(target) {
    scanTarget = target;
    if (typeof window.Html5Qrcode === 'undefined') {
      var msg = 'Scanner could not load — check your connection and try again.';
      var note0 = $('scan-note');
      if (note0) { note0.hidden = false; note0.textContent = msg; return; }
      var ierr = $('i-err');
      if (ierr) { ierr.hidden = false; ierr.textContent = msg; return; }
      return;
    }
    if (!scanOverlay) {
      scanOverlay = document.createElement('div');
      scanOverlay.id = 'scan-overlay';
      document.body.appendChild(scanOverlay);
    }
    scanOverlay.innerHTML = '<div class="scan-overlay"><h3>Scan barcode</h3>' +
      '<div id="pos-scanner"></div>' +
      '<p class="scan-status" id="scan-status">Point the camera at a barcode…</p>' +
      '<button id="scan-close">Close scanner</button></div>';
    scanOverlay.querySelector('#scan-close').addEventListener('click', closeScanner);
    scanner = new window.Html5Qrcode('pos-scanner');
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      function (code) { onScan(String(code).trim()); },
      function () { /* scan errors (no code in frame) are normal — ignore */ }
    ).catch(function (e) {
      var st = scanOverlay.querySelector('#scan-status');
      if (st) st.textContent = 'Could not open the camera: ' + (e && e.message ? e.message : e) + ' — allow camera access and try again.';
    });
  }
  function closeScanner() {
    if (scanner) {
      var s = scanner;
      scanner = null;
      try { s.stop().then(function () { try { s.clear(); } catch (e) {} }).catch(function () {}); } catch (e) {}
    }
    if (scanOverlay) scanOverlay.innerHTML = '';
    scanTarget = null;
  }
  function onScan(code) {
    if (!code) return;
    var now = Date.now();
    if (code === lastScanCode && now - lastScanAt < 2000) return;
    lastScanCode = code;
    lastScanAt = now;
    var st = scanOverlay && scanOverlay.querySelector('#scan-status');
    if (scanTarget === 'setup') {
      var field = $('i-barcode');
      if (field) field.value = code;
      if (st) st.textContent = '✓ Barcode ' + code + ' — tap Close scanner to keep it.';
      return;
    }
    var it = (store.items || []).filter(function (p) { return String(p.barcode || '') !== '' && String(p.barcode) === code; })[0];
    if (!it) {
      if (st) st.textContent = 'No item with barcode ' + code + ' — add it in Setup first.';
      return;
    }
    if (Number(it.stock) <= 0) {
      if (st) st.textContent = it.name + ' is out of stock.';
      return;
    }
    var cur = cart[it.id] || 0;
    if (cur + 1 > Number(it.stock)) {
      if (st) st.textContent = 'Only ' + Number(it.stock) + ' in stock for ' + it.name + '.';
      return;
    }
    cart[it.id] = cur + 1;
    updateBadges();
    if (st) st.textContent = '✓ Added ' + it.name + ' — scan the next item.';
    renderSell();
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
  var REPORTS_SYSTEM = 'pos';
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
    if (systemOff) {
      /* System switched off in Yently Admin (see checkSystemOff):
         the shop was never loaded, so there is no login form or
         draft to show — the tab stays reachable and shows only
         this notice. */
      el.innerHTML = '<p class="error">This system is currently switched off in Yently Admin — visitors see it as unavailable. Your data is still here.</p>';
      return;
    }
    if (!store) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (!ownerCreds) {
      el.innerHTML = '<h2>Setup</h2><div class="card">' +
        '<p class="info">Enter the username and password Yently gave this store.</p>' +
        '<label>Username</label><input id="st-user" type="text" autocomplete="username">' +
        '<label>Password</label><input id="st-pass" type="password" autocomplete="current-password">' +
        '<div class="row"><button id="st-go">Log in</button></div>' +
        '<p class="error" id="st-err" hidden></p></div>';
      $('st-go').addEventListener('click', function () {
        var u = $('st-user').value.trim();
        var p = $('st-pass').value;
        rpc('check_pos_login', { p_slug: SLUG, p_u: u, p_p: p }).then(function (ok) {
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
    var h = '<h2>Setup — ' + esc(store.name) + '</h2>' +
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
      '<div class="card"><h3>Store details</h3>' +
      '<p class="info">' + (directUploadOn ? 'Direct Upload is on for this page — your changes go live the moment you upload them.' : 'Changes save as a draft. Upload for approval and the admin makes them live.') + '</p>' +
      '<label>Store name</label><input id="d-name" type="text" value="' + esc(draft.name || '') + '">' +
      '<label>Icon picture</label>' +
      '<div class="icon-field">' +
      '<img id="setup-icon-preview" class="icon-preview" src="' + esc(draft.icon || '') + '" alt=""' + (draft.icon ? '' : ' hidden') + '>' +
      '<input id="setup-icon-file" type="file" accept="image/*">' +
      '<button type="button" id="setup-icon-remove" class="small secondary">Remove icon</button>' +
      '</div>' +
      '<p class="info" id="setup-icon-out">One small picture shown next to the store name. It is shrunk to 200px before uploading.</p>' +
      '<label>Address</label><input id="d-address" type="text" value="' + esc(draft.address || '') + '">' +
      '<label>Phone</label><input id="d-phone" type="tel" value="' + esc(draft.phone || '') + '">' +
      '<label>Tax rate (%)</label><input id="d-tax" type="number" min="0" max="30" step="0.1" value="' + (Number(draft.taxRate || 0.08) * 100) + '">' +
      '<label>Receipt message</label><input id="d-msg" type="text" value="' + esc(draft.receiptMessage || '') + '">' +
      '<div class="row"><button id="d-save">Save draft</button>' +
      '<button id="d-upload" class="secondary">' + (directUploadOn ? 'Upload — goes live right away' : 'Upload for approval') + '</button></div>' +
      '<p class="info" id="d-status">Draft status: ' + esc(draftStatus) + (draftStatus === 'pending' ? ' — waiting for Yently to approve it.' : draftStatus === 'approved' ? ' — approved, live now.' : ' — not sent yet.') + '</p>' +
      '<p class="error" id="d-err" hidden></p>' +
      '</div>' +
      '<div class="card"><h3>Items</h3>' +
      '<p class="info">Items go live right away — no approval needed. Stock drops by itself with every sale.</p>' +
      '<div id="items-list"></div>' +
      '<h3 id="item-form-title">Add an item</h3>' +
      '<label>Name</label><input id="i-name" type="text">' +
      '<label>Price</label><input id="i-price" type="number" min="0" step="0.01" inputmode="decimal">' +
      '<label>Stock</label><input id="i-stock" type="number" min="0" step="1" inputmode="numeric" value="0">' +
      '<label>Category</label><input id="i-cat" type="text" placeholder="Drinks, Food, Other…">' +
      '<label>Barcode (optional)</label><input id="i-barcode" type="text" inputmode="numeric" placeholder="The number under the product barcode">' +
      '<label>Picture (optional)</label>' +
      '<div class="icon-field">' +
      '<img id="i-pic-preview" class="item-thumb" src="' + esc(itemPic) + '" alt=""' + (itemPic ? '' : ' hidden') + '>' +
      '<input id="i-pic-file" type="file" accept="image/*">' +
      '<button type="button" id="i-pic-remove" class="small secondary">Remove picture</button>' +
      '</div>' +
      '<p class="info" id="i-pic-out">One small picture shown next to the item on Shop and Sell. It is shrunk to 200px before uploading.</p>' +
      '<div class="row"><button type="button" class="secondary" id="i-scan">📷 Scan barcode</button></div>' +
      '<div class="row"><button id="i-save">Save item</button>' +
      '<button id="i-cancel" class="secondary" hidden>Cancel edit</button></div>' +
      '<p class="error" id="i-err" hidden></p></div>';
    el.innerHTML = h;
    /* Add-ons section: the ☰ menu, the details panel and the
       active list (see renderAddonsSection). Replaces the old
       one-line-per-add-on Setup lines and the Chats card. */
    renderAddonsSection();
    renderItemsList();
    $('d-save').addEventListener('click', function () { saveDraft(false); });
    $('d-upload').addEventListener('click', function () { saveDraft(true); });
    $('i-save').addEventListener('click', saveItem);
    var scanItemBtn = $('i-scan');
    if (scanItemBtn) scanItemBtn.addEventListener('click', function () { openScanner('setup'); });
    $('i-cancel').addEventListener('click', function () { itemEditId = null; itemPic = ''; renderSetup(); });
    wireIconField();
    wireItemPicField();
  }
  /* Wire the item picture field in Setup: picking a picture uploads it
     at once and stores the URL on the item being added/edited; Remove
     clears it. The URL is only persisted when the item is saved. */
  function wireItemPicField() {
    var file = $('i-pic-file');
    if (file) file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var out = $('i-pic-out');
      if (out) out.textContent = 'Uploading picture…';
      uploadItemPic(f).then(function (url) {
        itemPic = url;
        var prev = $('i-pic-preview');
        if (prev) { prev.src = url; prev.hidden = false; }
        if (out) out.textContent = 'Picture uploaded — save the item to keep it.';
        file.value = '';
      }).catch(function (err) {
        if (out) out.textContent = 'Could not upload the picture: ' + (err && err.message ? err.message : 'please try again.');
        file.value = '';
      });
    });
    var rem = $('i-pic-remove');
    if (rem) rem.addEventListener('click', function () {
      itemPic = '';
      var prev = $('i-pic-preview');
      if (prev) { prev.src = ''; prev.hidden = true; }
      var out = $('i-pic-out');
      if (out) out.textContent = 'Picture removed — save the item to keep it removed.';
      var file = $('i-pic-file');
      if (file) file.value = '';
    });
  }
  function renderItemsList() {
    var el = $('items-list');
    if (!el) return;
    var items = store.items || [];
    if (!items.length) { el.innerHTML = '<p class="info">No items yet.</p>'; return; }
    var h = '';
    items.forEach(function (it) {
      h += '<div class="cart-line"><div><b>' + esc(it.name) + '</b><br><span class="info">' + esc(it.category || '') + ' · ' + money(it.price) + ' · stock ' + Number(it.stock) + (it.barcode ? ' · #' + esc(it.barcode) : '') + '</span></div>' +
        itemPicHtml(it) +
        '<div class="row"><button class="small secondary" data-edit="' + it.id + '">Edit</button>' +
        (delConfirmId === it.id
          ? '<span><b>Delete "' + esc(it.name) + '"?</b> <button class="small danger" data-del-yes="' + it.id + '">Yes, delete</button> <button class="small secondary" data-del-no="' + it.id + '">Keep it</button></span>'
          : '<button class="small danger" data-del="' + it.id + '">Delete</button>') + '</div></div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = itemById(Number(b.getAttribute('data-edit')));
        if (!it) return;
        itemEditId = it.id;
        $('i-name').value = it.name;
        $('i-price').value = it.price;
        $('i-stock').value = it.stock;
        $('i-cat').value = it.category || '';
        $('i-barcode').value = it.barcode || '';
        itemPic = it.pic || '';
        var prev = $('i-pic-preview');
        if (prev) { if (itemPic) { prev.src = itemPic; prev.hidden = false; } else { prev.src = ''; prev.hidden = true; } }
        var out = $('i-pic-out');
        if (out) out.textContent = itemPic ? 'Picture uploaded — save the item to keep it.' : 'One small picture shown next to the item on Shop and Sell. It is shrunk to 200px before uploading.';
        $('item-form-title').textContent = 'Edit item — ' + it.name;
        $('i-cancel').hidden = false;
        window.scrollTo(0, document.getElementById('item-form-title').offsetTop - 80);
      });
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        delConfirmId = Number(b.getAttribute('data-del'));
        renderItemsList();
      });
    });
    el.querySelectorAll('[data-del-no]').forEach(function (b) {
      b.addEventListener('click', function () { delConfirmId = null; renderItemsList(); });
    });
    el.querySelectorAll('[data-del-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = itemById(Number(b.getAttribute('data-del-yes')));
        if (!it) return;
        b.disabled = true;
        rpc('delete_pos_item', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_item_id: it.id })
          .then(function () { delConfirmId = null; return loadStore(); })
          .then(function () { renderSetup(); })
          .catch(function (e) { delConfirmId = null; renderItemsList(); var er = $('i-err'); if (er) { er.hidden = false; er.textContent = 'Error: ' + e.message; } });
      });
    });
  }
  function collectDraft() {
    return {
      name: $('d-name').value.trim(),
      address: $('d-address').value.trim(),
      phone: $('d-phone').value.trim(),
      taxRate: round2(Number($('d-tax').value || 0) / 100),
      receiptMessage: $('d-msg').value.trim(),
      icon: draft.icon || ''
    };
  }
  function saveDraft(upload) {
    var d = collectDraft();
    var err = $('d-err');
    if (!d.name) { err.hidden = false; err.textContent = 'Store name is required.'; return; }
    err.hidden = true;
    rpc('save_pos_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_draft: d })
      .then(function () {
        draft = d;
        draftStatus = 'editing';
        if (!upload) {
          $('d-status').textContent = 'Draft status: editing — saved, not sent yet.';
          return;
        }
        return rpc('submit_pos_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p }).then(function () {
          draftStatus = directUploadOn ? 'approved' : 'pending';
          $('d-status').textContent = directUploadOn ? 'Draft status: approved — live right away.' : 'Draft status: pending — waiting for Yently to approve it.';
          notifyEmail((directUploadOn ? 'POS upload — live right away: ' : 'POS draft for approval: ') + d.name, { slug: SLUG, name: d.name, status: directUploadOn ? 'Live right away — no approval needed' : undefined });
        });
      })
      .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
  }
  function saveItem() {
    var err = $('i-err');
    var name = $('i-name').value.trim();
    var price = Number($('i-price').value);
    var stock = Math.max(0, Math.floor(Number($('i-stock').value || 0)));
    var cat = $('i-cat').value.trim();
    var barcode = $('i-barcode').value.trim();
    if (!name) { err.hidden = false; err.textContent = 'Item name is required.'; return; }
    if (!(price >= 0)) { err.hidden = false; err.textContent = 'Price must be 0 or more.'; return; }
    err.hidden = true;
    var item = { name: name, price: price, stock: stock, category: cat, barcode: barcode, pic: itemPic, is_active: true };
    if (itemEditId) item.id = itemEditId;
    rpc('save_pos_item', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_item: item })
      .then(function () { itemEditId = null; itemPic = ''; return loadStore(); })
      .then(function () { renderSetup(); })
      .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
  }
  function loadDraft() {
    rpc('get_pos_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p })
      .then(function (d) {
        draft = d || {};
        draftStatus = 'editing';
        /* Direct Upload switch: see the note by directUploadOn. */
        return rpc('direct_upload_enabled', { p_owner_type: 'pos', p_owner_key: SLUG }).then(function (on) {
          directUploadOn = (on === true);
        }).catch(function () { directUploadOn = false; }).then(function () {
          /* Reports switch: see the note by reportsOn. */
          return rpc('reports_enabled', { p_owner_type: 'pos', p_owner_key: SLUG }).then(function (on) {
            reportsOn = (on === true);
          }).catch(function () { reportsOn = false; });
        }).then(function () {
          /* TV Gallery switch: see the note by tvGalleryOn. */
          return rpc('tv_gallery_enabled', { p_owner_type: 'pos', p_owner_key: SLUG }).then(function (on) {
            tvGalleryOn = (on === true);
          }).catch(function () { tvGalleryOn = false; });
        }).then(function () {
          /* Live Chat switch: see the note by chatOn. */
          return rpc('shop_chat_enabled', { p_owner_type: 'pos', p_owner_key: SLUG }).then(function (on) {
            chatOn = (on === true);
          }).catch(function () { chatOn = false; });
        }).then(function () {
          /* Clean Link: whether the shop already has one
             (clean_link_exists, public RPC) — for the Add-ons
             section's Clean Link panel and active list. */
          return rpc('clean_link_exists', { p_system: 'pos', p_slug: SLUG }).then(function (has) {
            hasCleanLink = (has === true);
          }).catch(function () { hasCleanLink = false; });
        }).then(function () {
          /* Remove Branding switch: whether Yently switched the
             "Powered by YENTLY.com" banners off for this shop
             (branding_removed, public RPC) — for the Add-ons
             section's Remove Branding panel and active list. */
          return rpc('branding_removed', { p_owner_type: 'pos', p_owner_key: SLUG }).then(function (on) {
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
      $('site-name').textContent = 'POS';
      $('view-shop').innerHTML = '<div class="card"><h2>Store not found</h2><p class="info">This POS page needs a store link. Ask Yently for your store link.</p></div>';
      return;
    }
    loadStore().then(function (d) {
      if (!d) {
        $('site-name').textContent = 'POS';
        $('view-shop').innerHTML = '<div class="card"><h2>Store not found</h2><p class="info">No store with this link yet. Ask Yently to set it up.</p></div>';
        return;
      }
      mountShopChatBubble(d.name, '');
      return rpc('pos_pass_status', { p_slug: SLUG }).then(function (st) {
        passLocked = st === 'locked';
        empUnlocked = !passLocked;
        renderShop();
      });
    }).catch(function (e) {
      $('view-shop').innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
    });
  }
  resolveSlug().then(function () { return checkSystemOff(); }).then(function (off) {
    if (off) {
      systemOff = true;
      $('site-name').textContent = 'POS';
      $('view-shop').innerHTML = '<div class="error">This system is currently unavailable. Yently has switched it off for now — please check back later, or contact Yently if you need help.</div>';
      return;
    }
    init();
  });
})();
