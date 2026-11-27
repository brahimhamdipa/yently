/* Bodyshop page app — ONE folder for every bodyshop.
   The shop comes from its own private link, and its info, jobs,
   estimates, customers, and loan cars live in the database — there is
   no data.json file here.
   Visitors see the public Request Estimate form: anyone with the link
   can ask for an estimate, and the shop sees it in Estimates. The
   working tabs (Jobs, Estimates, Customers, Loan Cars) need the
   shop's shared employee password (one password for all staff, set
   by the admin; shops with none set stay fully open). Setup needs
   the owner's own username + password. Setup edits save as a draft,
   and the Upload button sends the draft to the admin for approval —
   approval makes it live instantly. All credentials live in memory
   only: a reload asks again, exactly like the diner, barbershop,
   and POS pages. The workflow is estimate, then job, then invoice:
   an accepted estimate raises a job here, and a finished job is
   marked Invoiced. No payment is taken online: a job marked
   Invoiced is a record, not a payment. Deletes never use the
   native confirm() popup (it silently does nothing in some
   browsers) — clicking Delete asks in the page itself, exactly
   like the POS void/delete flow. */
(function () {
  'use strict';

  /* Belt-and-braces against sideways scroll on phones: the file
     input in Setup can push the page past the viewport. (The proper
     home for these two rules is this app's style.css; this copy
     rides with app.js so the page is safe even if the stylesheet
     lags behind.) */
  (function () {
    var st = document.createElement('style');
    st.textContent = 'input[type="file"]{max-width:100%}body{overflow-x:hidden}';
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
  var SLUG = String(params.b || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
  var SLUG_FROM_PATH = false;
  var slugResolved = false;
  if (!SLUG) {
    // Clean link (yently.com/<slug>): the middleware rewrites the
    // page server-side, so location.search is empty in the browser.
    // The shop slug is then the last path segment. Ignore this
    // system's own folder name, so a bare /bodyshop visit still
    // shows "not found" by design.
    var segs = location.pathname.split('/').filter(function (s) { return s; });
    var lastSeg = (segs[segs.length - 1] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    if (lastSeg && lastSeg !== 'bodyshop') { SLUG = lastSeg; SLUG_FROM_PATH = true; }
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

  var shop = null; // live shop info (visitors)
  var shopData = null; // { jobs, estimates, customers, loancars } (staff)
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
    window.ShopChat.mountBubble(wrap, { ownerType: 'bodyshop', ownerKey: SLUG, shopName: shopName || 'this shop', ownerEmail: ownerEmail || '' });
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
  var ADDONS_SYSTEM = 'bodyshop';
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
      if (cleanAdd) cleanAdd.onclick = function () { var t = $('setup-addons-clean-type'); window.location.href = '/?add=' + encodeURIComponent(t ? t.value : 'clean:website') + '&shop=bodyshop&slug=' + encodeURIComponent(SLUG) + '&addon=1'; };
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
          window.ShopChat.mountInbox(inbox, { ownerType: 'bodyshop', ownerKey: SLUG, creds: { u: ownerCreds.u, p: ownerCreds.p } });
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
      fetch(SUPABASE_URL + '/rest/v1/clean_links?system=eq.bodyshop&shop_slug=eq.' + encodeURIComponent(SLUG) + '&select=slug', {
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
  var empUnlocked = false; // true once the employee password is entered, or when the shop has none set
  var passLocked = false;
  var currentView = 'request';
  var jobsTimer = null;
  var jobsSearch = '';
  var jobsStatus = 'All';
  var estSearch = ''; // estimates search text, kept while typing
  var custSearch = ''; // customers search text, kept while typing
  var loanSearch = ''; // loan cars search text, kept while typing
  var jobsErr = ''; // last jobs error, shown inline above the jobs table
  var editCustomerId = null; // customer being edited, null = adding
  var delJobId = null; // job id awaiting an in-page delete confirmation
  var delEstId = null; // estimate id awaiting an in-page delete confirmation
  var delCustId = null; // customer id awaiting an in-page delete confirmation
  var delCarId = null; // loan car id awaiting an in-page delete confirmation
  var clearJobsConfirm = false; // true while the clear-all-jobs confirmation is open
  var clearEstConfirm = false; // true while the clear-all-estimates confirmation is open
  var clearCustConfirm = false; // true while the clear-all-customers confirmation is open
  var clearCarConfirm = false; // true while the clear-all-loan-cars confirmation is open
  var estStatus = ''; // last estimate action, shown above the estimates table

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* Thousands separators, no trailing .00: $1,800 / $1,800.50. */
  function money(n) {
    var v = Number(n || 0);
    var neg = v < 0;
    var s = Math.abs(v).toFixed(2).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-$' : '$') + s[0] + (s[1] === '00' ? '' : '.' + s[1]);
  }
  /* System kill switch (Admin menu 4 -> Systems On/Off): when Yently
     switches this system off, visitors see it as unavailable and the
     shop data is never loaded, while the Setup tab stays reachable.
     Any error, missing row, or missing RPC means the system stays ON
     (fail open). */
  var systemOff = false;
  var shopOff = false;
  /* Per-shop switch (Admin → menu 4 → Shops On/Off): true when this
     shop alone is switched off. Same fail-open shape as
     checkSystemOff — an RPC error or a missing row means On. */
  function checkShopOff() {
    try {
      if (typeof rpc !== 'function' || !SLUG) return Promise.resolve(false);
      return rpc('shop_is_visible', { p_system: 'bodyshop', p_slug: SLUG }).then(function (v) {
        return v === false;
      }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  function checkSystemOff() {
    try {
      if (typeof rpc !== 'function') return Promise.resolve(false);
      return rpc('list_system_switches', {}).then(function (rows) {
        if (!rows || !rows.length) return false;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].system === 'bodyshop') return rows[i].visible === false;
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
      /* Some calls (save/upload/delete) return no body at all — read text
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
  /* Best-effort owner email via the shared send-notification function.
     A failed email never fails the action it belongs to. */
  function notifyEmail(subject, table, record) {
    try {
      fetch(SUPABASE_URL + '/functions/v1/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
        body: JSON.stringify({ subject: subject, table: table, record: record })
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
  /* Rows come back snake_case from the database — accept camelCase too,
     so a future shape change does not break the page. */
  function normJob(j) {
    return { id: j.id, number: j.number || '', customer: j.customer || '', vehicle: j.vehicle || '',
      insurer: j.insurer || '', estimateNumber: j.estimate_number || j.estimateNumber || '',
      total: Number(j.total) || 0, status: j.status || 'In progress' };
  }
  function normEstimate(e) {
    return { id: e.id, number: e.number || '', customer: e.customer || '', vehicle: e.vehicle || '',
      parts: Number(e.parts) || 0, labour: Number(e.labour) || 0,
      status: e.status || 'Pending', note: e.note || '' };
  }
  function normCustomer(c) {
    return { id: c.id, name: c.name || '', phone: c.phone || '', email: c.email || '',
      vehicle: c.vehicle || '', insurer: c.insurer || '' };
  }
  function normLoanCar(c) {
    return { id: c.id, number: c.number || '', vehicle: c.vehicle || '',
      status: c.status || 'Available', jobNumber: c.job_number || c.jobNumber || '' };
  }
  function loadData(quiet) {
    return rpc('list_bodyshop_data', { p_slug: SLUG, p_epass: empPass }).then(function (d) {
      d = d || {};
      shopData = {
        jobs: (d.jobs || []).map(normJob),
        estimates: (d.estimates || []).map(normEstimate),
        customers: (d.customers || []).map(normCustomer),
        loancars: (d.loancars || []).map(normLoanCar)
      };
      return shopData;
    }).catch(function (e) { if (!quiet) throw e; });
  }

  /* ---------- views ---------- */
  function show(view) {
    currentView = view;
    if (view !== 'setup') stopShopChat();
    if (jobsTimer) { clearInterval(jobsTimer); jobsTimer = null; }
    ['request', 'jobs', 'estimates', 'customers', 'loancars', 'setup'].forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.hidden = v !== view;
    });
    var tabs = document.querySelectorAll('#tabs button');
    tabs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view); });
    if (view === 'request') renderRequest();
    /* One 5s timer shared by the four working tabs (jobsTimer is
       cleared at the top of show() on every view switch). Each tab
       refetches loadData(true) and re-renders only its own rows, and
       only while no delete confirmation is open in that tab, so a
       poll never clobbers an in-progress confirm. */
    if (view === 'jobs') {
      renderJobs();
      jobsTimer = setInterval(function () {
        if (currentView === 'jobs' && empUnlocked && delJobId === null) {
          loadData(true).then(function () { if (currentView === 'jobs' && delJobId === null) renderJobsRows(); });
        }
      }, 5000);
    }
    if (view === 'estimates') {
      renderEstimates();
      jobsTimer = setInterval(function () {
        if (currentView === 'estimates' && empUnlocked && delEstId === null) {
          loadData(true).then(function () { if (currentView === 'estimates' && delEstId === null) renderEstimatesRows(); });
        }
      }, 5000);
    }
    if (view === 'customers') {
      renderCustomers();
      jobsTimer = setInterval(function () {
        if (currentView === 'customers' && empUnlocked && delCustId === null) {
          loadData(true).then(function () { if (currentView === 'customers' && delCustId === null) renderCustomersRows(); });
        }
      }, 5000);
    }
    if (view === 'loancars') {
      renderLoanCars();
      jobsTimer = setInterval(function () {
        if (currentView === 'loancars' && empUnlocked && delCarId === null) {
          loadData(true).then(function () { if (currentView === 'loancars' && delCarId === null) renderLoanCarsRows(); });
        }
      }, 5000);
    }
    if (view === 'setup') renderSetup();
    window.scrollTo(0, 0);
  }

  function setHeader() {
    $('site-name').textContent = shop ? shop.name : 'Bodyshop';
    renderHeaderIcon(shop && shop.icon ? shop.icon : '');
    $('site-about').textContent = shop ? (shop.about || '') : '';
    $('site-footer').innerHTML = shop
      ? [esc(shop.address), esc(shop.phone)].filter(Boolean).join('<br>') + '<br>' + YENTLY_BADGE_HTML
      : YENTLY_BADGE_HTML;
    showYentlyBadgeTop();
    hideYentlyBadgeIfRemoved();
    document.title = (shop ? shop.name : 'Bodyshop') + ' — Bodyshop';
  }

  /* ---------- employee gate (working tabs) ---------- */
  /* Employee gate (working tabs). The prompt is rendered into
     whichever view container it is given, so the lookups MUST stay
     scoped to that container: all four working views live in the
     DOM at once, and a global getElementById would wire the first
     copy's button and leave the other copies' Unlock dead. */
  function empGate(el, heading, after) {
    el.innerHTML = '<h2>' + heading + '</h2><div class="card">' +
      '<p class="info">Enter the employee password for this shop to open the working tabs.</p>' +
      '<label>Employee password</label><input id="emp-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="emp-go">Unlock</button></div>' +
      '<p class="error" id="emp-err" hidden></p></div>';
    el.querySelector('#emp-go').addEventListener('click', function () {
      var pw = el.querySelector('#emp-pass').value;
      rpc('check_bodyshop_employee_pass', { p_slug: SLUG, p_password: pw }).then(function (ok) {
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

  /* ---------- Request Estimate (public) ---------- */
  function renderRequest() {
    var el = $('view-request');
    if (!shop) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var h = '<h2>Request an estimate — ' + esc(shop.name) + '</h2>';
    var bits = [];
    if (shop.address) bits.push(esc(shop.address));
    if (shop.phone) bits.push(esc(shop.phone));
    if (shop.hours) bits.push(esc(shop.hours));
    if (bits.length) h += '<div class="card info">' + bits.join('<br>') + '</div>';
    h += '<div class="card"><p class="info">Tell us about the damage and we will come back with an estimate. No account needed.</p>' +
      '<label>Name</label><input id="req-name" type="text">' +
      '<label>Phone</label><input id="req-phone" type="tel">' +
      '<label>Email (optional)</label><input id="req-email" type="email">' +
      '<label>Vehicle</label><input id="req-vehicle" type="text" placeholder="Toyota Corolla 2021">' +
      '<label>Insurer (optional)</label><input id="req-insurer" type="text">' +
      '<label>Damage / notes (optional)</label><textarea id="req-note"></textarea>' +
      '<div class="row"><button id="req-send">Request estimate</button></div>' +
      '<p class="error" id="req-err" hidden></p>' +
      '<div id="req-out" style="margin-top:12px"></div></div>';
    el.innerHTML = h;
    $('req-send').addEventListener('click', submitEstimate);
  }
  function submitEstimate() {
    var err = $('req-err');
    var name = $('req-name').value.trim();
    var phone = $('req-phone').value.trim();
    var vehicle = $('req-vehicle').value.trim();
    if (!name || !phone || !vehicle) {
      err.hidden = false;
      err.textContent = 'Name, phone, and vehicle are required.';
      return;
    }
    err.hidden = true;
    var email = $('req-email').value.trim();
    var insurer = $('req-insurer').value.trim();
    var note = $('req-note').value.trim();
    rpc('place_bodyshop_estimate', {
      p_slug: SLUG, p_name: name, p_phone: phone, p_vehicle: vehicle,
      p_email: email, p_insurer: insurer, p_note: note
    }).then(function (res) {
      /* The call returns the new estimate's id; its number is EST-<id>. */
      var id = res;
      if (res && typeof res === 'object') id = res.id || res.estimate_id || res.number || '';
      var num = 'EST-' + String(id == null ? '' : id).replace(/^EST-/i, '');
      $('req-out').innerHTML = '<p class="note">✓ Requested — estimate #' + esc(num) + ': ' + esc(vehicle) + ' for ' + esc(name) + '. The shop will be in touch.</p>';
      notifyEmail('Bodyshop estimate: ' + vehicle + ' (' + name + ')', 'bodyshop_estimate',
        { slug: SLUG, name: name, phone: phone, email: email, vehicle: vehicle, insurer: insurer, note: note });
      ['req-name', 'req-phone', 'req-email', 'req-vehicle', 'req-insurer', 'req-note'].forEach(function (id2) { $(id2).value = ''; });
    }).catch(function (e) {
      err.hidden = false;
      err.textContent = 'Error: ' + e.message;
    });
  }

  /* ---------- Jobs (employee password, polls every 5s) ---------- */
  function jobStatusOptions(selected) {
    return ['In progress', 'Completed', 'Invoiced'].map(function (s) {
      return '<option' + (s === selected ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
  }
  function filteredJobs() {
    return (shopData.jobs || []).filter(function (j) {
      if (jobsStatus !== 'All' && j.status !== jobsStatus) return false;
      var q = jobsSearch.trim().toLowerCase();
      if (q && String(j.number).toLowerCase().indexOf(q) === -1 &&
        String(j.customer).toLowerCase().indexOf(q) === -1 &&
        String(j.vehicle).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }
  function renderJobs() {
    var el = $('view-jobs');
    if (!shop) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (passLocked && !empUnlocked) { empGate(el, 'Jobs', renderJobs); return; }
    if (!shopData) {
      el.innerHTML = '<h2>Jobs — ' + esc(shop.name) + '</h2><p class="info">Loading…</p>';
      loadData().then(function () { if (currentView === 'jobs') renderJobs(); })
        .catch(function (e) { el.innerHTML = '<h2>Jobs</h2><p class="error">Error: ' + esc(e.message) + '</p>'; });
      return;
    }
    var finishedJobs = (shopData.jobs || []).filter(function (j) { return j.status === 'Completed' || j.status === 'Invoiced'; }).length;
    var stayingJobs = (shopData.jobs || []).length - finishedJobs;
    el.innerHTML = '<h2>Jobs — ' + esc(shop.name) + '</h2>' +
      '<div class="note">The workflow is estimate, then job, then invoice: an accepted estimate becomes a job here, and a finished job is marked Invoiced. The list refreshes on its own every few seconds.</div>' +
      '<div id="jobs-msg"></div>' +
      (clearJobsConfirm
        ? '<p><b>Clear all ' + finishedJobs + ' finished job' + (finishedJobs === 1 ? '' : 's') + ' (Completed or Invoiced)?</b> ' + stayingJobs + ' job' + (stayingJobs === 1 ? '' : 's') + ' in progress will stay.</p><div class="row"><button class="small danger" data-clear-jobs-yes>Yes, clear all</button><button class="small secondary" data-clear-jobs-no>Keep them</button></div>'
        : ((shopData.jobs || []).length ? '<div class="row"><button class="small danger" data-clear-jobs>Clear all jobs</button></div>' : '')) +
      '<label>Search jobs</label><input id="jobs-search" type="text" value="' + esc(jobsSearch) + '" placeholder="Job number, customer, or vehicle…">' +
      '<label>Status</label><select id="jobs-status"><option' + (jobsStatus === 'All' ? ' selected' : '') + '>All</option>' + jobStatusOptions(jobsStatus) + '</select>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>Job no.</th><th>Customer</th><th>Vehicle</th><th>Insurer</th><th>Estimate no.</th><th>Total</th><th>Status</th><th></th></tr></thead>' +
      '<tbody id="jobs-rows"></tbody></table></div>' +
      '<div class="card"><h3>Add a job</h3>' +
      '<label>Customer</label><input id="job-customer" type="text">' +
      '<label>Vehicle</label><input id="job-vehicle" type="text">' +
      '<label>Insurer</label><input id="job-insurer" type="text">' +
      '<label>Estimate no. (optional)</label><input id="job-estimate" type="text" placeholder="EST-101">' +
      '<label>Total ($)</label><input id="job-total" type="number" min="0" step="0.01" inputmode="decimal">' +
      '<label>Status</label><select id="job-status">' + jobStatusOptions('In progress') + '</select>' +
      '<div class="row"><button id="job-add">Add job</button></div>' +
      '<p class="error" id="job-err" hidden></p></div>';
    renderJobsRows();
    $('jobs-search').addEventListener('input', function (e) { jobsSearch = e.target.value; renderJobsRows(); });
    $('jobs-status').addEventListener('change', function (e) { jobsStatus = e.target.value; renderJobsRows(); });
    $('job-add').addEventListener('click', addJob);
    el.querySelectorAll('[data-clear-jobs]').forEach(function (b) {
      b.addEventListener('click', function () { clearJobsConfirm = true; jobsErr = ''; renderJobs(); });
    });
    el.querySelectorAll('[data-clear-jobs-no]').forEach(function (b) {
      b.addEventListener('click', function () { clearJobsConfirm = false; renderJobs(); });
    });
    el.querySelectorAll('[data-clear-jobs-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        rpc('clear_bodyshop_jobs', { p_slug: SLUG, p_epass: empPass })
          .then(function () { clearJobsConfirm = false; jobsErr = ''; return loadData(true); })
          .then(function () { renderJobs(); })
          .catch(function (e) { clearJobsConfirm = false; jobsErr = 'Error: ' + e.message; renderJobs(); });
      });
    });
  }
  function renderJobsRows() {
    var tb = $('jobs-rows');
    if (!tb) return;
    var msg = $('jobs-msg');
    if (msg) msg.innerHTML = jobsErr ? '<p class="error">' + esc(jobsErr) + '</p>' : '';
    var rows = filteredJobs().map(function (j) {
      return '<tr><td>' + esc(j.number) + '</td><td>' + esc(j.customer) + '</td><td>' + esc(j.vehicle) + '</td>' +
        '<td>' + esc(j.insurer) + '</td><td>' + esc(j.estimateNumber) + '</td><td>' + money(j.total) + '</td>' +
        '<td><select data-status-job="' + j.id + '">' + jobStatusOptions(j.status) + '</select></td>' +
        '<td>' + (delJobId === j.id
          ? '<span><b>Delete "' + esc(j.number) + '"?</b> <button class="small danger" data-del-job-yes="' + j.id + '">Yes, delete</button> <button class="small secondary" data-del-job-no="' + j.id + '">Keep it</button></span>'
          : '<button class="small danger" data-del-job="' + j.id + '">Delete</button>') + '</td></tr>';
    }).join('');
    tb.innerHTML = rows || '<tr><td colspan="8">No jobs match.</td></tr>';
    tb.querySelectorAll('[data-status-job]').forEach(function (sel) {
      sel.addEventListener('change', function (e) {
        var s = e.target;
        var id = Number(s.getAttribute('data-status-job'));
        rpc('update_bodyshop_job_status', { p_slug: SLUG, p_epass: empPass, p_job_id: id, p_status: s.value })
          .then(function () { jobsErr = ''; return loadData(true); })
          .then(function () { renderJobsRows(); })
          .catch(function (err) { jobsErr = 'Error: ' + err.message; renderJobsRows(); });
      });
    });
    tb.querySelectorAll('[data-del-job]').forEach(function (b) {
      b.addEventListener('click', function () {
        delJobId = Number(b.getAttribute('data-del-job'));
        jobsErr = '';
        renderJobsRows();
      });
    });
    tb.querySelectorAll('[data-del-job-no]').forEach(function (b) {
      b.addEventListener('click', function () { delJobId = null; renderJobsRows(); });
    });
    tb.querySelectorAll('[data-del-job-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-del-job-yes'));
        b.disabled = true;
        rpc('delete_bodyshop_job', { p_slug: SLUG, p_epass: empPass, p_job_id: id })
          .then(function () { delJobId = null; return loadData(true); })
          .then(function () { renderJobs(); })
          .catch(function (e) { delJobId = null; jobsErr = 'Error: ' + e.message; renderJobsRows(); });
      });
    });
  }
  function addJob() {
    var err = $('job-err');
    var customer = $('job-customer').value.trim();
    var vehicle = $('job-vehicle').value.trim();
    if (!customer || !vehicle) {
      err.hidden = false;
      err.textContent = 'Customer and vehicle are required.';
      return;
    }
    err.hidden = true;
    var job = { customer: customer, vehicle: vehicle, insurer: $('job-insurer').value.trim(),
      estimate_number: $('job-estimate').value.trim(),
      total: parseFloat($('job-total').value) || 0, status: $('job-status').value };
    rpc('save_bodyshop_job', { p_slug: SLUG, p_epass: empPass, p_job: job })
      .then(function () { return loadData(true); })
      .then(function () { renderJobs(); })
      .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
  }

  /* ---------- Estimates (employee password) ---------- */
  function estMatches(e, q) {
    if (!q) return true;
    var hay = [e.number, e.customer, e.vehicle, e.status, e.note].map(function (x) { return String(x == null ? '' : x).toLowerCase(); }).join(' ');
    return hay.indexOf(q) !== -1;
  }
  /* The estimates table alone, re-rendered as the visitor types in the
     search box, so the search input never loses focus. */
  function renderEstimatesRows() {
    var tb = $('est-rows');
    if (!tb) return;
    var q = (estSearch || '').toLowerCase();
    var rows = (shopData.estimates || []).filter(function (e) { return estMatches(e, q); }).map(function (e) {
      var total = (Number(e.parts) || 0) + (Number(e.labour) || 0);
      var actions = e.status === 'Pending'
        ? '<button class="small" data-accept="' + e.id + '">Accept</button> <button class="small secondary" data-decline="' + e.id + '">Decline</button> ' : '';
      return '<tr><td>' + esc(e.number) + '</td><td>' + esc(e.customer) + '</td><td>' + esc(e.vehicle) + '</td>' +
        '<td>' + money(e.parts) + '</td><td>' + money(e.labour) + '</td><td>' + money(total) + '</td>' +
        '<td>' + esc(e.status) + '</td><td>' + esc(e.note) + '</td>' +
        '<td>' + actions + (delEstId === e.id
          ? '<span><b>Delete "' + esc(e.number) + '"?</b> <button class="small danger" data-del-est-yes="' + e.id + '">Yes, delete</button> <button class="small secondary" data-del-est-no="' + e.id + '">Keep it</button></span>'
          : '<button class="small danger" data-del-est="' + e.id + '">Delete</button>') + '</td></tr>';
    }).join('');
    tb.innerHTML = rows || '<tr><td colspan="9">' + (estSearch ? 'No estimates match your search.' : 'No estimates yet.') + '</td></tr>';
    tb.querySelectorAll('[data-accept]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-accept'));
        b.disabled = true;
        rpc('accept_bodyshop_estimate', { p_slug: SLUG, p_epass: empPass, p_estimate_id: id })
          .then(function (res) {
            /* The call returns the new job's id; its number is JOB-<id>. */
            var jobNo = null;
            if (typeof res === 'number') jobNo = 'JOB-' + res;
            else if (typeof res === 'string') jobNo = /^JOB-/i.test(res) ? res : 'JOB-' + res;
            else if (res && typeof res === 'object') jobNo = res.job_number || res.number || (res.id != null ? 'JOB-' + res.id : null);
            estStatus = jobNo ? 'Accepted — raised job ' + jobNo + '.' : 'Accepted — the job is on the Jobs tab.';
            return loadData(true);
          })
          .then(function () { renderEstimates(); })
          .catch(function (e) { estStatus = 'Error: ' + e.message; renderEstimates(); });
      });
    });
    tb.querySelectorAll('[data-decline]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-decline'));
        b.disabled = true;
        rpc('update_bodyshop_estimate_status', { p_slug: SLUG, p_epass: empPass, p_estimate_id: id, p_status: 'Declined' })
          .then(function () { estStatus = 'Declined — no job raised.'; return loadData(true); })
          .then(function () { renderEstimates(); })
          .catch(function (e) { estStatus = 'Error: ' + e.message; renderEstimates(); });
      });
    });
    tb.querySelectorAll('[data-del-est]').forEach(function (b) {
      b.addEventListener('click', function () {
        delEstId = Number(b.getAttribute('data-del-est'));
        renderEstimatesRows();
      });
    });
    tb.querySelectorAll('[data-del-est-no]').forEach(function (b) {
      b.addEventListener('click', function () { delEstId = null; renderEstimatesRows(); });
    });
    tb.querySelectorAll('[data-del-est-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-del-est-yes'));
        b.disabled = true;
        rpc('delete_bodyshop_estimate', { p_slug: SLUG, p_epass: empPass, p_estimate_id: id })
          .then(function () { delEstId = null; estStatus = ''; return loadData(true); })
          .then(function () { renderEstimates(); })
          .catch(function (e) { delEstId = null; estStatus = 'Error: ' + e.message; renderEstimates(); });
      });
    });
  }
  function renderEstimates() {
    var el = $('view-estimates');
    if (!shop) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (passLocked && !empUnlocked) { empGate(el, 'Estimates', renderEstimates); return; }
    if (!shopData) {
      el.innerHTML = '<h2>Estimates — ' + esc(shop.name) + '</h2><p class="info">Loading…</p>';
      loadData().then(function () { if (currentView === 'estimates') renderEstimates(); })
        .catch(function (e) { el.innerHTML = '<h2>Estimates</h2><p class="error">Error: ' + esc(e.message) + '</p>'; });
      return;
    }
    var finishedEst = (shopData.estimates || []).filter(function (e) { return e.status === 'Accepted' || e.status === 'Declined'; }).length;
    var stayingEst = (shopData.estimates || []).length - finishedEst;
    el.innerHTML = '<h2>Estimates — ' + esc(shop.name) + '</h2>' +
      '<div class="note">Accepting a pending estimate marks it Accepted and raises a job for it on the Jobs tab. Declining closes it without a job. Staff can also add an estimate below — a customer asking in person, or one that came in by phone.</div>' +
      (clearEstConfirm
        ? '<p><b>Clear all ' + finishedEst + ' finished estimate' + (finishedEst === 1 ? '' : 's') + ' (Accepted or Declined)?</b> ' + stayingEst + ' pending estimate' + (stayingEst === 1 ? '' : 's') + ' will stay.</p><div class="row"><button class="small danger" data-clear-est-yes>Yes, clear all</button><button class="small secondary" data-clear-est-no>Keep them</button></div>'
        : ((shopData.estimates || []).length ? '<div class="row"><button class="small danger" data-clear-est>Clear all estimates</button></div>' : '')) +
      (estStatus ? '<p class="info" id="est-status">' + esc(estStatus) + '</p>' : '') +
      '<label>Search estimates</label><input id="est-search" type="text" value="' + esc(estSearch) + '" placeholder="Estimate no., customer, or vehicle…">' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>Estimate no.</th><th>Customer</th><th>Vehicle</th><th>Parts</th><th>Labour</th><th>Total</th><th>Status</th><th>Note</th><th></th></tr></thead>' +
      '<tbody id="est-rows"></tbody></table></div>' +
      '<div class="card"><h3>Add an estimate</h3>' +
      '<label>Customer</label><input id="est-customer" type="text">' +
      '<label>Vehicle</label><input id="est-vehicle" type="text">' +
      '<label>Parts ($)</label><input id="est-parts" type="number" min="0" step="0.01" inputmode="decimal">' +
      '<label>Labour ($)</label><input id="est-labour" type="number" min="0" step="0.01" inputmode="decimal">' +
      '<label>Note</label><input id="est-note" type="text">' +
      '<div class="row"><button id="est-add">Add estimate</button></div>' +
      '<p class="error" id="est-err" hidden></p></div>';
    renderEstimatesRows();
    $('est-search').addEventListener('input', function (e) { estSearch = e.target.value; renderEstimatesRows(); });
    el.querySelectorAll('[data-clear-est]').forEach(function (b) {
      b.addEventListener('click', function () { clearEstConfirm = true; renderEstimates(); });
    });
    el.querySelectorAll('[data-clear-est-no]').forEach(function (b) {
      b.addEventListener('click', function () { clearEstConfirm = false; renderEstimates(); });
    });
    el.querySelectorAll('[data-clear-est-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        rpc('clear_bodyshop_estimates', { p_slug: SLUG, p_epass: empPass })
          .then(function () { clearEstConfirm = false; estStatus = ''; return loadData(true); })
          .then(function () { renderEstimates(); })
          .catch(function (e) { clearEstConfirm = false; estStatus = 'Error: ' + e.message; renderEstimates(); });
      });
    });
    $('est-add').addEventListener('click', function () {
      var err = $('est-err');
      var customer = $('est-customer').value.trim();
      var vehicle = $('est-vehicle').value.trim();
      if (!customer || !vehicle) {
        err.hidden = false;
        err.textContent = 'Customer and vehicle are required.';
        return;
      }
      err.hidden = true;
      var rec = { customer: customer, vehicle: vehicle,
        parts: parseFloat($('est-parts').value) || 0,
        labour: parseFloat($('est-labour').value) || 0,
        status: 'Pending', note: $('est-note').value.trim() };
      rpc('save_bodyshop_estimate', { p_slug: SLUG, p_epass: empPass, p_estimate: rec })
        .then(function () { estStatus = ''; return loadData(true); })
        .then(function () { renderEstimates(); })
        .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
    });
  }

  /* ---------- Customers (employee password) ---------- */
  function custMatches(c, q) {
    if (!q) return true;
    var hay = [c.name, c.phone, c.email, c.vehicle, c.insurer].map(function (x) { return String(x == null ? '' : x).toLowerCase(); }).join(' ');
    return hay.indexOf(q) !== -1;
  }
  /* The customers table alone, re-rendered as the visitor types in the
     search box, so the search input never loses focus. */
  function renderCustomersRows() {
    var tb = $('cust-rows');
    if (!tb) return;
    var q = (custSearch || '').toLowerCase();
    var rows = (shopData.customers || []).filter(function (c) { return custMatches(c, q); }).map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(c.name) + '</td><td>' + esc(c.phone) + '</td>' +
        '<td>' + esc(c.email) + '</td><td>' + esc(c.vehicle) + '</td><td>' + esc(c.insurer) + '</td>' +
        '<td><button class="small secondary" data-edit-cust="' + c.id + '">Edit</button></td>' +
        '<td>' + (delCustId === c.id
          ? '<span><b>Delete "' + esc(c.name) + '"?</b> <button class="small danger" data-del-cust-yes="' + c.id + '">Yes, delete</button> <button class="small secondary" data-del-cust-no="' + c.id + '">Keep it</button></span>'
          : '<button class="small danger" data-del-cust="' + c.id + '">Delete</button>') + '</td></tr>';
    }).join('');
    tb.innerHTML = rows || '<tr><td colspan="8">' + (custSearch ? 'No customers match your search.' : 'No customers yet.') + '</td></tr>';
    tb.querySelectorAll('[data-edit-cust]').forEach(function (b) {
      b.addEventListener('click', function () {
        editCustomerId = Number(b.getAttribute('data-edit-cust'));
        renderCustomers();
      });
    });
    tb.querySelectorAll('[data-del-cust]').forEach(function (b) {
      b.addEventListener('click', function () {
        delCustId = Number(b.getAttribute('data-del-cust'));
        renderCustomersRows();
      });
    });
    tb.querySelectorAll('[data-del-cust-no]').forEach(function (b) {
      b.addEventListener('click', function () { delCustId = null; renderCustomersRows(); });
    });
    tb.querySelectorAll('[data-del-cust-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-del-cust-yes'));
        b.disabled = true;
        rpc('delete_bodyshop_customer', { p_slug: SLUG, p_epass: empPass, p_customer_id: id })
          .then(function () {
            delCustId = null;
            if (editCustomerId === id) editCustomerId = null;
            return loadData(true);
          })
          .then(function () { renderCustomers(); })
          .catch(function (e) {
            delCustId = null;
            var er = $('cust-err');
            if (er) { er.hidden = false; er.textContent = 'Error: ' + e.message; }
            renderCustomers();
          });
      });
    });
  }
  function renderCustomers() {
    var el = $('view-customers');
    if (!shop) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (passLocked && !empUnlocked) { empGate(el, 'Customers', renderCustomers); return; }
    if (!shopData) {
      el.innerHTML = '<h2>Customers — ' + esc(shop.name) + '</h2><p class="info">Loading…</p>';
      loadData().then(function () { if (currentView === 'customers') renderCustomers(); })
        .catch(function (e) { el.innerHTML = '<h2>Customers</h2><p class="error">Error: ' + esc(e.message) + '</p>'; });
      return;
    }
    var editing = (shopData.customers || []).filter(function (c) { return c.id === editCustomerId; })[0];
    el.innerHTML = '<h2>Customers — ' + esc(shop.name) + '</h2>' +
      (clearCustConfirm
        ? '<p><b>Clear all customers?</b> This deletes every customer for this shop and cannot be undone.</p><div class="row"><button class="small danger" data-clear-cust-yes>Yes, clear all</button><button class="small secondary" data-clear-cust-no>Keep them</button></div>'
        : ((shopData.customers || []).length ? '<div class="row"><button class="small danger" data-clear-cust>Clear all customers</button></div>' : '')) +
      '<label>Search customers</label><input id="cust-search" type="text" value="' + esc(custSearch) + '" placeholder="Name, phone, email, or vehicle…">' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>No.</th><th>Name</th><th>Phone</th><th>Email</th><th>Vehicle</th><th>Insurer</th><th></th><th></th></tr></thead>' +
      '<tbody id="cust-rows"></tbody></table></div>' +
      '<div class="card"><h3>' + (editing ? 'Edit customer' : 'Add a customer') + '</h3>' +
      '<label>Name</label><input id="cust-name" type="text" value="' + esc(editing ? editing.name : '') + '">' +
      '<label>Phone</label><input id="cust-phone" type="tel" value="' + esc(editing ? editing.phone : '') + '">' +
      '<label>Email</label><input id="cust-email" type="email" value="' + esc(editing ? editing.email : '') + '">' +
      '<label>Vehicle</label><input id="cust-vehicle" type="text" value="' + esc(editing ? editing.vehicle : '') + '">' +
      '<label>Insurer</label><input id="cust-insurer" type="text" value="' + esc(editing ? editing.insurer : '') + '">' +
      '<div class="row"><button id="cust-save">' + (editing ? 'Save changes' : 'Add customer') + '</button>' +
      (editing ? '<button id="cust-cancel" class="secondary">Cancel</button>' : '') + '</div>' +
      '<p class="error" id="cust-err" hidden></p></div>';
    renderCustomersRows();
    $('cust-search').addEventListener('input', function (e) { custSearch = e.target.value; renderCustomersRows(); });
    el.querySelectorAll('[data-clear-cust]').forEach(function (b) {
      b.addEventListener('click', function () { clearCustConfirm = true; renderCustomers(); });
    });
    el.querySelectorAll('[data-clear-cust-no]').forEach(function (b) {
      b.addEventListener('click', function () { clearCustConfirm = false; renderCustomers(); });
    });
    el.querySelectorAll('[data-clear-cust-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        rpc('clear_bodyshop_customers', { p_slug: SLUG, p_epass: empPass })
          .then(function () {
            clearCustConfirm = false;
            if (editCustomerId != null) editCustomerId = null;
            return loadData(true);
          })
          .then(function () { renderCustomers(); })
          .catch(function (e) {
            clearCustConfirm = false;
            renderCustomers();
            var er = $('cust-err');
            if (er) { er.hidden = false; er.textContent = 'Error: ' + e.message; }
          });
      });
    });
    $('cust-save').addEventListener('click', function () {
      var err = $('cust-err');
      var name = $('cust-name').value.trim();
      if (!name) {
        err.hidden = false;
        err.textContent = 'Customer name is required.';
        return;
      }
      err.hidden = true;
      var rec = { name: name, phone: $('cust-phone').value.trim(), email: $('cust-email').value.trim(),
        vehicle: $('cust-vehicle').value.trim(), insurer: $('cust-insurer').value.trim() };
      if (editCustomerId) rec.id = editCustomerId;
      rpc('save_bodyshop_customer', { p_slug: SLUG, p_epass: empPass, p_customer: rec })
        .then(function () { editCustomerId = null; return loadData(true); })
        .then(function () { renderCustomers(); })
        .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
    });
    if (editing) $('cust-cancel').addEventListener('click', function () { editCustomerId = null; renderCustomers(); });
  }

  /* ---------- Loan Cars (employee password) ---------- */
  function loanStatusOptions(selected) {
    return ['Available', 'On loan'].map(function (s) {
      return '<option' + (s === selected ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
  }
  function loanMatches(c, q) {
    if (!q) return true;
    var hay = [c.number, c.vehicle, c.status, c.jobNumber].map(function (x) { return String(x == null ? '' : x).toLowerCase(); }).join(' ');
    return hay.indexOf(q) !== -1;
  }
  /* The loan cars table alone, re-rendered as the visitor types in the
     search box, so the search input never loses focus. */
  function renderLoanCarsRows() {
    var tb = $('loan-rows');
    if (!tb) return;
    var q = (loanSearch || '').toLowerCase();
    var rows = (shopData.loancars || []).filter(function (c) { return loanMatches(c, q); }).map(function (c) {
      return '<tr><td>' + esc(c.number) + '</td><td>' + esc(c.vehicle) + '</td>' +
        '<td><select data-loan-status="' + c.id + '">' + loanStatusOptions(c.status) + '</select></td>' +
        '<td><input type="text" data-loan-job="' + c.id + '" value="' + esc(c.jobNumber) + '" placeholder="JOB-201"></td>' +
        '<td><button class="small" data-loan-update="' + c.id + '">Update</button> ' +
        (delCarId === c.id
          ? '<span><b>Delete "' + esc(c.number) + '"?</b> <button class="small danger" data-del-car-yes="' + c.id + '">Yes, delete</button> <button class="small secondary" data-del-car-no="' + c.id + '">Keep it</button></span>'
          : '<button class="small danger" data-del-car="' + c.id + '">Delete</button>') + '</td></tr>';
    }).join('');
    tb.innerHTML = rows || '<tr><td colspan="5">' + (loanSearch ? 'No loan cars match your search.' : 'No loan cars yet.') + '</td></tr>';
    var view = $('view-loancars');
    tb.querySelectorAll('[data-loan-update]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-loan-update'));
        var sel = view.querySelector('[data-loan-status="' + id + '"]');
        var inp = view.querySelector('[data-loan-job="' + id + '"]');
        var status = sel ? sel.value : 'Available';
        var jobNo = status === 'On loan' ? (inp ? inp.value.trim() : '') : '';
        b.disabled = true;
        rpc('update_bodyshop_loancar_status', { p_slug: SLUG, p_epass: empPass, p_car_id: id, p_status: status, p_job_number: jobNo })
          .then(function () { return loadData(true); })
          .then(function () { renderLoanCars(); })
          .catch(function (e) {
            b.disabled = false;
            var er = $('car-err');
            if (er) { er.hidden = false; er.textContent = 'Error: ' + e.message; }
          });
      });
    });
    tb.querySelectorAll('[data-del-car]').forEach(function (b) {
      b.addEventListener('click', function () {
        delCarId = Number(b.getAttribute('data-del-car'));
        renderLoanCarsRows();
      });
    });
    tb.querySelectorAll('[data-del-car-no]').forEach(function (b) {
      b.addEventListener('click', function () { delCarId = null; renderLoanCarsRows(); });
    });
    tb.querySelectorAll('[data-del-car-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-del-car-yes'));
        b.disabled = true;
        rpc('delete_bodyshop_loancar', { p_slug: SLUG, p_epass: empPass, p_car_id: id })
          .then(function () { delCarId = null; return loadData(true); })
          .then(function () { renderLoanCars(); })
          .catch(function (e) {
            delCarId = null;
            var er = $('car-err');
            if (er) { er.hidden = false; er.textContent = 'Error: ' + e.message; }
            renderLoanCars();
          });
      });
    });
  }
  function renderLoanCars() {
    var el = $('view-loancars');
    if (!shop) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (passLocked && !empUnlocked) { empGate(el, 'Loan Cars', renderLoanCars); return; }
    if (!shopData) {
      el.innerHTML = '<h2>Loan Cars — ' + esc(shop.name) + '</h2><p class="info">Loading…</p>';
      loadData().then(function () { if (currentView === 'loancars') renderLoanCars(); })
        .catch(function (e) { el.innerHTML = '<h2>Loan Cars</h2><p class="error">Error: ' + esc(e.message) + '</p>'; });
      return;
    }
    el.innerHTML = '<h2>Loan Cars — ' + esc(shop.name) + '</h2>' +
      '<div class="note">Cars lent to customers while their own car is in the shop. Change the status and job number in the row, then tap Update — setting a car back to Available clears its job.</div>' +
      (clearCarConfirm
        ? '<p><b>Clear all loan cars?</b> This deletes every loan car for this shop and cannot be undone.</p><div class="row"><button class="small danger" data-clear-car-yes>Yes, clear all</button><button class="small secondary" data-clear-car-no>Keep them</button></div>'
        : ((shopData.loancars || []).length ? '<div class="row"><button class="small danger" data-clear-car>Clear all loan cars</button></div>' : '')) +
      '<label>Search loan cars</label><input id="loan-search" type="text" value="' + esc(loanSearch) + '" placeholder="Car number, vehicle, or job…">' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>Car number</th><th>Vehicle</th><th>Status</th><th>Job</th><th></th></tr></thead>' +
      '<tbody id="loan-rows"></tbody></table></div>' +
      '<div class="card"><h3>Add a loan car</h3>' +
      '<label>Car number</label><input id="loan-new-number" type="text">' +
      '<label>Vehicle</label><input id="loan-new-vehicle" type="text">' +
      '<div class="row"><button id="loan-add">Add loan car</button></div>' +
      '<p class="error" id="car-err" hidden></p></div>';
    renderLoanCarsRows();
    $('loan-search').addEventListener('input', function (e) { loanSearch = e.target.value; renderLoanCarsRows(); });
    el.querySelectorAll('[data-clear-car]').forEach(function (b) {
      b.addEventListener('click', function () { clearCarConfirm = true; renderLoanCars(); });
    });
    el.querySelectorAll('[data-clear-car-no]').forEach(function (b) {
      b.addEventListener('click', function () { clearCarConfirm = false; renderLoanCars(); });
    });
    el.querySelectorAll('[data-clear-car-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        rpc('clear_bodyshop_loancars', { p_slug: SLUG, p_epass: empPass })
          .then(function () { clearCarConfirm = false; return loadData(true); })
          .then(function () { renderLoanCars(); })
          .catch(function (e) {
            clearCarConfirm = false;
            renderLoanCars();
            var er = $('car-err');
            if (er) { er.hidden = false; er.textContent = 'Error: ' + e.message; }
          });
      });
    });
    $('loan-add').addEventListener('click', function () {
      var err = $('car-err');
      var number = $('loan-new-number').value.trim();
      var vehicle = $('loan-new-vehicle').value.trim();
      if (!number || !vehicle) {
        err.hidden = false;
        err.textContent = 'Car number and vehicle are required.';
        return;
      }
      err.hidden = true;
      rpc('save_bodyshop_loancar', { p_slug: SLUG, p_epass: empPass, p_car: { number: number, vehicle: vehicle } })
        .then(function () { return loadData(true); })
        .then(function () { renderLoanCars(); })
        .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
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
  var REPORTS_SYSTEM = 'bodyshop';
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

  function loadShop() {
    return rpc('get_bodyshop_live', { p_slug: SLUG }).then(function (d) {
      shop = d;
      setHeader();
      return d;
    });
  }

  function renderSetup() {
    stopShopChat(); // re-render destroys the inbox container; stop its poll first
    var el = $('view-setup');
    /* Setup while Off (2026-11-26): Setup stays reachable while the
       system or this shop is switched off — the other 17 apps
       already worked this way; these 4 showed only a notice
       because the shop was never loaded at boot. Load it now, for
       Setup only: the boot gate is untouched, init() never runs
       while off, and customer pages stay down. The login still
       gates every edit. */
    var offNotice = shopOff ? '<p class="error">This shop is currently switched off in Yently Admin — visitors see it as unavailable. Your data is still here.</p>' : systemOff ? '<p class="error">This system is currently switched off in Yently Admin — visitors see it as unavailable. Your data is still here.</p>' : '';
    if ((systemOff || shopOff) && !shop) {
      el.innerHTML = offNotice + '<p class="info">Loading your setup…</p>';
      loadShop().then(function (d) {
        if (!d || !d.name) {
          el.innerHTML = offNotice + '<p class="error">Shop not found.</p>';
          return;
        }
        renderSetup();
      }).catch(function (e) {
        el.innerHTML = offNotice + '<p class="error">Error: ' + esc(e.message) + '</p>';
      });
      return;
    }
    if (!shop) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (!ownerCreds) {
      el.innerHTML = offNotice + '<h2>Setup</h2><div class="card">' +
        '<p class="info">Enter the username and password Yently gave this shop.</p>' +
        '<label>Username</label><input id="st-user" type="text" autocomplete="username">' +
        '<label>Password</label><input id="st-pass" type="password" autocomplete="current-password">' +
        '<div class="row"><button id="st-go">Log in</button></div>' +
        '<p class="error" id="st-err" hidden></p></div>';
      $('st-go').addEventListener('click', function () {
        var u = $('st-user').value.trim();
        var p = $('st-pass').value;
        rpc('check_bodyshop_login', { p_slug: SLUG, p_u: u, p_p: p }).then(function (ok) {
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
    el.innerHTML = offNotice + '<h2>Setup — ' + esc(shop.name) + '</h2>' +
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
      '<div class="card"><h3>Business details</h3>' +
      '<p class="info">' + (directUploadOn ? 'Direct Upload is on for this page — your changes go live the moment you upload them.' : 'Changes save as a draft. Upload for approval and the admin makes them live.') + '</p>' +
      '<label>Business name</label><input id="d-name" type="text" value="' + esc(draft.name || '') + '">' +
      '<label>Icon picture</label>' +
      '<div class="icon-field">' +
      '<img id="setup-icon-preview" class="icon-preview" src="' + esc(draft.icon || '') + '" alt=""' + (draft.icon ? '' : ' hidden') + '>' +
      '<input id="setup-icon-file" type="file" accept="image/*">' +
      '<button type="button" id="setup-icon-remove" class="small secondary">Remove icon</button>' +
      '</div>' +
      '<p class="info" id="setup-icon-out">One small picture shown next to the shop name. It is shrunk to 200px before uploading.</p>' +
      '<label>About</label><textarea id="d-about">' + esc(draft.about || '') + '</textarea>' +
      '<label>Address</label><input id="d-address" type="text" value="' + esc(draft.address || '') + '">' +
      '<label>Phone</label><input id="d-phone" type="tel" value="' + esc(draft.phone || '') + '">' +
      '<label>Hours</label><input id="d-hours" type="text" value="' + esc(draft.hours || '') + '">' +
      '<div class="row"><button id="d-save">Save draft</button>' +
      '<button id="d-upload" class="secondary">' + (directUploadOn ? 'Upload — goes live right away' : 'Upload for approval') + '</button></div>' +
      '<p class="info" id="d-status">Draft status: ' + esc(draftStatus) + (draftStatus === 'pending' ? ' — waiting for Yently to approve it.' : draftStatus === 'approved' ? ' — approved, live now.' : ' — not sent yet.') + '</p>' +
      '<p class="error" id="d-err" hidden></p>' +
      '</div>';
    /* Add-ons section: the ☰ menu, the details panel and the
       active list (see renderAddonsSection). Replaces the old
       one-line-per-add-on Setup lines and the Chats card. */
    renderAddonsSection();
    $('d-save').addEventListener('click', function () { saveDraft(false); });
    $('d-upload').addEventListener('click', function () { saveDraft(true); });
    wireIconField();
  }
  function collectDraft() {
    return {
      name: $('d-name').value.trim(),
      about: $('d-about').value,
      address: $('d-address').value.trim(),
      phone: $('d-phone').value.trim(),
      hours: $('d-hours').value.trim(),
      icon: draft.icon || ''
    };
  }
  function saveDraft(upload) {
    var d = collectDraft();
    var err = $('d-err');
    if (!d.name) {
      err.hidden = false;
      err.textContent = 'Business name is required.';
      return;
    }
    err.hidden = true;
    rpc('save_bodyshop_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_draft: d })
      .then(function () {
        draft = d;
        draftStatus = 'editing';
        if (!upload) {
          $('d-status').textContent = 'Draft status: editing — saved, not sent yet.';
          return;
        }
        return rpc('submit_bodyshop_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p }).then(function () {
          draftStatus = directUploadOn ? 'approved' : 'pending';
          $('d-status').textContent = directUploadOn ? 'Draft status: approved — live right away.' : 'Draft status: pending — waiting for Yently to approve it.';
          notifyEmail((directUploadOn ? 'Bodyshop upload — live right away: ' : 'Bodyshop draft for approval: ') + d.name, 'bodyshop_draft', { slug: SLUG, name: d.name, status: directUploadOn ? 'Live right away — no approval needed' : undefined });
        });
      })
      .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
  }
  function loadDraft() {
    rpc('get_bodyshop_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p })
      .then(function (d) {
        /* The call returns { draft, live, status }; the draft falls back
           to the live details so Setup always has something to edit. */
        if (d && d.draft) {
          draft = d.draft || {};
          draftStatus = d.status || 'editing';
        } else {
          draft = d || {};
          draftStatus = 'editing';
        }
        /* Direct Upload switch: see the note by directUploadOn. */
        return rpc('direct_upload_enabled', { p_owner_type: 'bodyshop', p_owner_key: SLUG }).then(function (on) {
          directUploadOn = (on === true);
        }).catch(function () { directUploadOn = false; }).then(function () {
          /* Reports switch: see the note by reportsOn. */
          return rpc('reports_enabled', { p_owner_type: 'bodyshop', p_owner_key: SLUG }).then(function (on) {
            reportsOn = (on === true);
          }).catch(function () { reportsOn = false; });
        }).then(function () {
          /* TV Gallery switch: see the note by tvGalleryOn. */
          return rpc('tv_gallery_enabled', { p_owner_type: 'bodyshop', p_owner_key: SLUG }).then(function (on) {
            tvGalleryOn = (on === true);
          }).catch(function () { tvGalleryOn = false; });
        }).then(function () {
          /* Live Chat switch: see the note by chatOn. */
          return rpc('shop_chat_enabled', { p_owner_type: 'bodyshop', p_owner_key: SLUG }).then(function (on) {
            chatOn = (on === true);
          }).catch(function () { chatOn = false; });
        }).then(function () {
          /* Clean Link: whether the shop already has one
             (clean_link_exists, public RPC) — for the Add-ons
             section's Clean Link panel and active list. */
          return rpc('clean_link_exists', { p_system: 'bodyshop', p_slug: SLUG }).then(function (has) {
            hasCleanLink = (has === true);
          }).catch(function () { hasCleanLink = false; });
        }).then(function () {
          /* Remove Branding switch: whether Yently switched the
             "Powered by YENTLY.com" banners off for this shop
             (branding_removed, public RPC) — for the Add-ons
             section's Remove Branding panel and active list. */
          return rpc('branding_removed', { p_owner_type: 'bodyshop', p_owner_key: SLUG }).then(function (on) {
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
  document.querySelectorAll('#tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () { show(btn.getAttribute('data-view')); });
  });
  /* Black ↑ Top pill at the bottom-left, exactly like the shop pages:
     always visible, tap it to jump back to the top. */
  var toTop = $('to-top');
  if (toTop) {
    toTop.addEventListener('click', function () { window.scrollTo(0, 0); });
  }
  function init() {
    if (!SLUG) {
      $('site-name').textContent = 'Bodyshop';
      $('view-request').innerHTML = '<div class="card"><h2>Shop not found</h2><p class="info">This bodyshop page needs a shop link. Ask Yently for your shop link.</p></div>';
      return;
    }
    rpc('get_bodyshop_live', { p_slug: SLUG }).then(function (d) {
      if (!d || !d.name) {
        $('site-name').textContent = 'Bodyshop';
        $('view-request').innerHTML = '<div class="card"><h2>Shop not found</h2><p class="info">No bodyshop with this link yet. Ask Yently to set it up.</p></div>';
        return;
      }
      shop = d;
      setHeader();
      mountShopChatBubble(d.name, '');
      return rpc('bodyshop_pass_status', { p_slug: SLUG }).then(function (st) {
        passLocked = st === 'locked';
        empUnlocked = !passLocked;
        renderRequest();
      }).catch(function () {
        /* If the status check itself is unreachable, stay open rather
           than locking everyone out of a working shop. */
        empUnlocked = true;
        renderRequest();
      });
    }).catch(function (e) {
      $('view-request').innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
    });
  }
  resolveSlug().then(function () { return Promise.all([checkSystemOff(), checkShopOff()]); }).then(function (res) { var off = res[0] || res[1];
    if (off) {
      systemOff = res[0]; shopOff = res[1];
      $('site-name').textContent = 'Bodyshop';
      $('view-request').innerHTML = shopOff ? '<div class="error">This shop is currently unavailable. Yently has switched it off for now — please check back later, or contact Yently if you need help.</div>' : '<div class="error">This system is currently unavailable. Yently has switched it off for now — please check back later, or contact Yently if you need help.</div>';
      return;
    }
    init();
  });
})();
