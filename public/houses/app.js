/* Houses page app — ONE folder for every agency.
   The agency comes from its own private link, and its info,
   listings, and inquiries live in the database — there is no data.json
   file here. Every agency has its own listings and inquiries, but
   they all use this same page.
   Visitors browse the homes, search by city and price, save
   favorites, work out a mortgage, or ask about a home. Inquiries are
   emailed to Yently. The Inquiries tab needs the agency's shared
   employee password (one password for all staff, set by the admin;
   agencies with none set stay fully open). Setup needs the owner's
   own username + password. Setup edits save as a draft, and the
   Upload button sends the draft to the admin for approval — approval
   makes it live instantly. Listings are different: the owner adds,
   edits, and deletes listings live in Setup, no approval needed. All
   credentials live in memory only: a reload asks again, exactly like
   the diner, barbershop, and POS pages. */
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
  var SLUG = String(params.h || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
  var SLUG_FROM_PATH = false;
  var slugResolved = false;
  if (!SLUG) {
    // Clean link (yently.com/<slug>): the middleware rewrites the
    // page server-side, so location.search is empty in the browser.
    // The shop slug is then the last path segment. Ignore this
    // system's own folder name, so a bare /houses visit still
    // shows "not found" by design.
    var segs = location.pathname.split('/').filter(function (s) { return s; });
    var lastSeg = (segs[segs.length - 1] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
    if (lastSeg && lastSeg !== 'houses') { SLUG = lastSeg; SLUG_FROM_PATH = true; }
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

  var FAV_KEY = 'houses-fav-' + SLUG;
  var FEATURES = ['Central Air', 'Fireplace', 'Swimming Pool', 'Basement',
    'Cul-de-sac', 'Waterfront', 'Fenced Yard', 'Golf Course', 'Patio',
    'Tennis Court', 'Deck', 'Porch', 'Water View'];

  var house = null; // live agency info + listings (visitors)
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
    window.ShopChat.mountBubble(wrap, { ownerType: 'houses', ownerKey: SLUG, shopName: shopName || 'this shop', ownerEmail: ownerEmail || '' });
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
  var ADDONS_SYSTEM = 'houses';
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
    if (name === 'TV Gallery') return ' · <a href="#" data-addon-link="tv">Details</a>';
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
      if (cleanAdd) cleanAdd.onclick = function () { var t = $('setup-addons-clean-type'); window.location.href = '/?add=' + encodeURIComponent(t ? t.value : 'clean:website') + '&shop=houses&slug=' + encodeURIComponent(SLUG) + '&addon=1'; };
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
          window.ShopChat.mountInbox(inbox, { ownerType: 'houses', ownerKey: SLUG, creds: { u: ownerCreds.u, p: ownerCreds.p } });
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
      fetch(SUPABASE_URL + '/rest/v1/clean_links?system=eq.houses&shop_slug=eq.' + encodeURIComponent(SLUG) + '&select=slug', {
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
  var empUnlocked = false; // true once the employee password is entered, or when the agency has none set
  var passLocked = false;
  var bookings = [];
  var bookingsTimer = null;
  var currentView = 'homes';
  var listingEditId = null; // listing being edited in Setup, null = adding
  var cancelConfirmId = null; // inquiry id awaiting an in-page cancel confirmation
  var delInqConfirmId = null; // inquiry id awaiting an in-page delete confirmation
  var clearInqConfirm = false; // true while the clear-all-inquiries confirmation is open
  var bookingsErr = ''; // last inquiries error, shown inline above the list
  var delConfirmId = null; // listing id awaiting an in-page delete confirmation
  var slideIdx = {}; // listing id -> current slideshow picture index
  var detailListingId = null; // listing id shown in the details popup
  var listingPics = []; // picture URLs for the listing being added/edited in Setup
  var favorites = loadFavorites();
  var searchState = { text: '', city: '', minPrice: '', maxPrice: '', minBeds: '', favOnly: false };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* Home prices use thousands separators: $289,000, not $289000.00.
     Whole amounts stay plain; amounts with cents show two decimals. */
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
  /* Best-effort owner email, same shape as the diner and POS pages: the
     table differs per call (inquiry, draft approval). */
  function notifyEmail(subject, table, record) {
    try {
      fetch(SUPABASE_URL + '/functions/v1/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
        body: JSON.stringify({ subject: subject, table: table, record: record })
      }).catch(function () {});
    } catch (e) {}
  }
  /* ---------- "?" help popups (request forms) ----------
     Same pattern as the Direct Upload page: a "?" next to the field
     label, tap once to open the explanation, tap again — or tap
     anywhere else — to close it. Only one help is open at a time.
     The popup anchors to the field label (.direct-help CSS), so it
     can never run past the page edge and zoom the page on a phone. */
  function helpHtml(text) {
    return '<span class="help"><button type="button" class="help-btn" data-help-btn aria-label="Help">?</button>' +
      '<span class="help-pop" hidden>' + esc(text) + '</span></span>';
  }
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-help-btn]') : null;
    var pops = document.querySelectorAll('.help-pop');
    if (btn) {
      var pop = btn.parentNode ? btn.parentNode.querySelector('.help-pop') : null;
      var wasHidden = pop ? pop.hidden : true;
      pops.forEach(function (p) { p.hidden = true; });
      if (pop) pop.hidden = !wasHidden;
      e.stopPropagation();
      return;
    }
    var inside = e.target && e.target.closest ? e.target.closest('.help') : null;
    if (!inside) pops.forEach(function (p) { p.hidden = true; });
  });
  /* ---------- Icon picture (one small square image) ---------- */
  /* The icon lives in the draft/live data as `icon` — a public URL or ''.
     It is uploaded to the product-images bucket, shrunk to 200px on its
     long edge first (same rules as the shop picture uploads: JPEG 0.8,
     PNGs stay PNG, small pictures untouched, any failure falls back to
     the original file). Same pattern as the POS, diner, barbershop, and
     dealer pages. */
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
  function loadFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveFavorites() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); } catch (e) {}
  }
  function isFav(id) { return favorites.indexOf(Number(id)) !== -1; }
  function toggleFav(id) {
    var n = Number(id);
    var i = favorites.indexOf(n);
    if (i === -1) favorites.push(n); else favorites.splice(i, 1);
    saveFavorites();
  }
  function listingById(id) {
    return (house.listings || []).filter(function (l) { return String(l.id) === String(id); })[0] || null;
  }
  function listingLabel(l) {
    return [l.address, l.city].filter(function (x) { return x; }).join(', ');
  }
  /* Listing pictures are either full URLs (uploaded in Setup) or plain
     filenames in this folder (the demo listings use standard_house.jpg).
     Filenames resolve against this folder's own address, so they keep
     working under any domain or clean link. */
  function listingPicSrc(p) {
    if (!p) return '';
    if (/^(https?:)?\/\//i.test(p) || p.charAt(0) === '/') return p;
    return BASE + p;
  }
  function listingPicsOf(l) { return (l && Array.isArray(l.pics)) ? l.pics : []; }
  function loadHouse() {
    return rpc('get_houses_live', { p_slug: SLUG }).then(function (d) {
      house = d;
      setHeader();
      return d;
    });
  }

  /* ---------- views ---------- */
  function show(view) {
    currentView = view;
    if (view !== 'setup') stopShopChat();
    ['homes', 'favorites', 'inquiries', 'setup', 'detail'].forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.hidden = v !== view;
    });
    var tabs = document.querySelectorAll('#tabs button');
    tabs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view); });
    if (bookingsTimer) { clearInterval(bookingsTimer); bookingsTimer = null; }
    if (view === 'homes') renderHomes();
    if (view === 'favorites') renderFavorites();
    if (view === 'inquiries') { renderInquiries(); bookingsTimer = setInterval(function () { if (currentView === 'inquiries' && empUnlocked) loadBookings(true); }, 5000); }
    if (view === 'setup') renderSetup();
    if (view === 'detail') renderDetail();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-view')); });
  });
  $('to-top').addEventListener('click', function () { window.scrollTo(0, 0); });

  function setHeader() {
    $('site-name').textContent = house ? house.name : 'Houses';
    renderHeaderIcon(house && house.icon ? house.icon : '');
    $('site-about').innerHTML = house
      ? [esc(house.address), esc(house.phone)].filter(Boolean).join('<br>')
      : '';
    $('site-footer').innerHTML = house
      ? [esc(house.address), esc(house.phone)].filter(Boolean).join('<br>') + '<br>' + YENTLY_BADGE_HTML
      : YENTLY_BADGE_HTML;
    hideYentlyBadgeIfRemoved();
    document.title = (house ? house.name : 'Houses') + ' — Houses for sale';
  }

  /* ---------- Homes (public listings + search) ---------- */
  function cities() {
    var out = [];
    (house.listings || []).forEach(function (l) {
      if (l.city && out.indexOf(l.city) === -1) out.push(l.city);
    });
    return out.sort();
  }
  function filteredListings() {
    return (house.listings || []).filter(function (l) {
      if (searchState.favOnly && !isFav(l.id)) return false;
      if (searchState.city && l.city !== searchState.city) return false;
      if (searchState.minPrice !== '' && Number(l.price) < Number(searchState.minPrice)) return false;
      if (searchState.maxPrice !== '' && Number(l.price) > Number(searchState.maxPrice)) return false;
      if (searchState.minBeds !== '' && Number(l.bedrooms) < Number(searchState.minBeds)) return false;
      if (searchState.text) {
        var hay = ((l.address || '') + ' ' + (l.city || '') + ' ' + (l.zip || '') + ' ' +
          (l.description || '')).toLowerCase();
        if (hay.indexOf(searchState.text.toLowerCase()) === -1) return false;
      }
      return true;
    });
  }
  /* One picture shows static, 2+ get ‹ › arrows and a "1 of N" counter,
     none gets a plain grey placeholder block. The arrows keep their
     position per listing in slideIdx, so flipping through one home does
     not reset the others. */
  function listingSlideshowHtml(l) {
    var pics = listingPicsOf(l);
    if (!pics.length) return '<div class="slideshow"><div class="slide-empty">No picture yet</div></div>';
    var idx = slideIdx[l.id] || 0;
    if (idx >= pics.length) idx = 0;
    var h = '<div class="slideshow"><img class="slide-img" src="' + esc(listingPicSrc(pics[idx])) + '" alt="' + esc(listingLabel(l)) + '">';
    if (pics.length > 1) {
      h += '<button class="slide-btn prev" data-slide-prev="' + l.id + '" aria-label="Previous picture">‹</button>' +
        '<button class="slide-btn next" data-slide-next="' + l.id + '" aria-label="Next picture">›</button>' +
        '<span class="slide-count">' + (idx + 1) + ' of ' + pics.length + '</span>';
    }
    h += '</div>';
    return h;
  }
  function listingCardHtml(l) {
    var specs = [];
    if (l.bedrooms != null && l.bedrooms !== '') specs.push(l.bedrooms + ' beds');
    if (l.bathrooms != null && l.bathrooms !== '') specs.push(l.bathrooms + ' baths');
    if (l.sqft) specs.push(fmtNum(l.sqft) + ' sq ft');
    return '<div class="item-card">' + listingSlideshowHtml(l) +
      '<span class="price">' + money(l.price) + '</span>' +
      '<h3>' + esc(l.address) + '</h3>' +
      '<span class="stock">' + esc(l.city || '') + (l.zip ? ', ' + esc(l.zip) : '') + '</span>' +
      (specs.length ? '<span class="stock">' + esc(specs.join(' · ')) + '</span>' : '') +
      (l.description ? '<p class="info">' + esc(l.description) + '</p>' : '') +
      '<div class="row"><button data-view-detail="' + l.id + '">View home</button>' +
      '<button class="secondary" data-fav="' + l.id + '">' + (isFav(l.id) ? '♥ Saved' : '♡ Save') + '</button></div>' +
      '</div>';
  }
  function renderListingsGrid() {
    var grid = $('homes-grid');
    if (!grid) return;
    var list = filteredListings();
    if (!list.length) {
      grid.innerHTML = '<div class="card"><p class="info">No homes match that search yet. Try widening the price or clearing the filters.</p></div>';
      return;
    }
    var h = '<div class="item-grid">';
    list.forEach(function (l) { h += listingCardHtml(l); });
    h += '</div>';
    grid.innerHTML = h;
  }
  function attachListingCardListeners(root) {
    root.querySelectorAll('[data-slide-prev]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-slide-prev');
        var pics = listingPicsOf(listingById(id));
        if (!pics.length) return;
        slideIdx[id] = ((slideIdx[id] || 0) - 1 + pics.length) % pics.length;
        if (currentView === 'homes') renderHomesGridOnly();
        else if (currentView === 'favorites') renderFavorites();
        else if (currentView === 'detail') renderDetail();
      });
    });
    root.querySelectorAll('[data-slide-next]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-slide-next');
        var pics = listingPicsOf(listingById(id));
        if (!pics.length) return;
        slideIdx[id] = ((slideIdx[id] || 0) + 1) % pics.length;
        if (currentView === 'homes') renderHomesGridOnly();
        else if (currentView === 'favorites') renderFavorites();
        else if (currentView === 'detail') renderDetail();
      });
    });
    root.querySelectorAll('[data-view-detail]').forEach(function (b) {
      b.addEventListener('click', function () {
        detailListingId = Number(b.getAttribute('data-view-detail'));
        show('detail');
      });
    });
    root.querySelectorAll('[data-fav]').forEach(function (b) {
      b.addEventListener('click', function () {
        toggleFav(b.getAttribute('data-fav'));
        if (currentView === 'homes') renderHomes();
        else if (currentView === 'favorites') renderFavorites();
        else if (currentView === 'detail') renderDetail();
      });
    });
  }
  /* Re-render the homes grid without stealing the cursor from the
     search field being typed in. */
  function renderHomesGridOnly() {
    renderListingsGrid();
    attachListingCardListeners($('view-homes'));
  }
  function renderHomes() {
    var el = $('view-homes');
    if (!house) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var h = '<h2>' + esc(house.name) + '</h2>';
    if (house.about) h += '<p class="info">' + esc(house.about) + '</p>';
    if (house.address || house.phone || house.hours) {
      h += '<div class="card info">';
      if (house.address) h += '<p>📍 ' + esc(house.address) + '</p>';
      if (house.phone) h += '<p>📞 ' + esc(house.phone) + '</p>';
      if (house.hours) h += '<p>🕐 ' + esc(house.hours) + '</p>';
      h += '</div>';
    }
    if (!(house.listings || []).length) {
      h += '<div class="card"><p class="info">No homes yet — the owner adds homes in Setup.</p></div>';
      el.innerHTML = h;
      return;
    }
    var cityOpts = '<option value="">All cities</option>' +
      cities().map(function (c) {
        return '<option value="' + esc(c) + '"' + (searchState.city === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
    h += '<div class="card search-bar">' +
      '<input id="search-text" type="text" placeholder="Search address or keyword…" value="' + esc(searchState.text) + '">' +
      '<div class="row wrap">' +
      '<select id="search-city">' + cityOpts + '</select>' +
      '<input id="search-minprice" type="number" placeholder="Min price" value="' + esc(searchState.minPrice) + '">' +
      '<input id="search-maxprice" type="number" placeholder="Max price" value="' + esc(searchState.maxPrice) + '">' +
      '<input id="search-minbeds" type="number" placeholder="Min beds" value="' + esc(searchState.minBeds) + '">' +
      '<label class="check"><input id="search-favonly" type="checkbox"' + (searchState.favOnly ? ' checked' : '') + '> Saved only</label>' +
      '</div></div>';
    h += '<div id="homes-grid"></div>';
    el.innerHTML = h;
    var keepFocus = function (id) {
      var pos = null;
      var active = document.getElementById(id);
      if (active) pos = active.selectionStart;
      renderHomesGridOnly();
      var again = document.getElementById(id);
      if (again) {
        again.focus();
        if (pos !== null) { try { again.setSelectionRange(pos, pos); } catch (e) {} }
      }
    };
    $('search-text').addEventListener('input', function (e) { searchState.text = e.target.value; keepFocus('search-text'); });
    $('search-city').addEventListener('change', function (e) { searchState.city = e.target.value; renderHomes(); });
    $('search-minprice').addEventListener('input', function (e) { searchState.minPrice = e.target.value; keepFocus('search-minprice'); });
    $('search-maxprice').addEventListener('input', function (e) { searchState.maxPrice = e.target.value; keepFocus('search-maxprice'); });
    $('search-minbeds').addEventListener('input', function (e) { searchState.minBeds = e.target.value; keepFocus('search-minbeds'); });
    $('search-favonly').addEventListener('change', function (e) { searchState.favOnly = e.target.checked; renderHomes(); });
    renderHomesGridOnly();
  }

  /* ---------- Favorites (saved in this browser only) ---------- */
  function renderFavorites() {
    var el = $('view-favorites');
    if (!house) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    var saved = (house.listings || []).filter(function (l) { return isFav(l.id); });
    var h = '<h2>Saved homes — ' + esc(house.name) + '</h2>';
    if (!saved.length) {
      h += '<div class="card"><p class="info">No saved homes yet — tap ♡ Save on any home to keep it here, in this browser only.</p></div>';
      el.innerHTML = h;
      return;
    }
    h += '<div class="item-grid">';
    saved.forEach(function (l) { h += listingCardHtml(l); });
    h += '</div>';
    el.innerHTML = h;
    attachListingCardListeners(el);
  }

  /* ---------- Detail popup (photos, info, mortgage, ask) ---------- */
  /* Details popup, modelled on the Cars "I'm interested" popup and the
     dealer details popup: an overlay that closes on a backdrop tap, a
     card with a ✕ button, the pictures up top and every field below.
     It lives in the #view-detail section, shown in place of the tabs. */
  function monthlyMortgage(price, down, ratePct, years) {
    var principal = Math.max(0, Number(price || 0) - Number(down || 0));
    var n = Math.max(1, Math.floor(Number(years || 0)) * 12);
    var j = Number(ratePct || 0) / 1200;
    if (j === 0) return round2(principal / n);
    return round2(principal * (j / (1 - Math.pow(1 + j, -n))));
  }
  function renderDetail() {
    var el = $('view-detail');
    var l = detailListingId != null ? listingById(detailListingId) : null;
    if (!l) {
      el.innerHTML = '<p class="info">That home is no longer listed.</p>' +
        '<div class="row"><button class="secondary" id="detail-back">← Back to homes</button></div>';
      $('detail-back').addEventListener('click', function () { show('homes'); });
      return;
    }
    var rows = [
      ['Bedrooms', l.bedrooms], ['Bathrooms', l.bathrooms],
      ['Square feet', l.sqft ? fmtNum(l.sqft) : ''],
      ['Home age', (l.age != null && l.age !== '') ? l.age + ' years' : ''],
      ['Stories', l.stories]
    ];
    var feats = (l.features || []).map(function (f) {
      return '<span class="chip">' + esc(f) + '</span>';
    }).join(' ');
    var h = '<div class="modal-overlay" data-close-detail><div class="modal">' +
      '<button class="modal-close" data-close-detail aria-label="Close">✕</button>' +
      listingSlideshowHtml(l) +
      '<span class="price">' + money(l.price) + '</span>' +
      '<h3>' + esc(l.address) + '</h3>' +
      '<p class="info">' + esc(l.city || '') + (l.zip ? ', ' + esc(l.zip) : '') + '</p>' +
      (l.description ? '<p>' + esc(l.description) + '</p>' : '') +
      '<h3>Home info</h3><div class="detail-list">';
    rows.forEach(function (r) {
      if (r[1] === '' || r[1] == null) return;
      h += '<div class="detail-row"><span>' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>';
    });
    h += '</div>' +
      (feats ? '<h3>Features</h3><p>' + feats + '</p>' : '') +
      '<h3>Mortgage calculator</h3>' +
      '<p class="info">Estimate only — taxes, insurance, and fees are not included.</p>' +
      '<label>Price of home</label><input id="mort-price" type="number" min="0" value="' + esc(l.price == null ? '' : l.price) + '">' +
      '<label>Down payment</label><input id="mort-down" type="number" min="0" value="0">' +
      '<label>Years</label><input id="mort-years" type="number" min="1" max="50" value="30">' +
      '<label>Annual interest rate (%)</label><input id="mort-rate" type="number" step="0.01" min="0" value="7.5">' +
      '<div class="row"><button id="mort-calc">Calculate</button></div>' +
      '<p class="error" id="mort-err" hidden></p>' +
      '<div id="mort-out" style="margin-top:12px"></div>' +
      '<h3>Ask about this home</h3>' +
      '<form class="direct-help" id="ask-form">' +
      '<div class="field"><span class="field-label">Your name ' + helpHtml('Your own name — the person asking about this home. The agency uses it to know who the question is from, and to address you in the reply. Type your first and last name.') + '</span>' +
      '<input id="ask-name" type="text" placeholder="Full name"></div>' +
      '<div class="field"><span class="field-label">Phone ' + helpHtml('Your phone number, so the agency can call you back about this home. Digits only is fine — spaces or dashes do no harm.') + '</span>' +
      '<input id="ask-phone" type="tel" placeholder="Phone number"></div>' +
      '<div class="field"><span class="field-label">Email (optional) ' + helpHtml('Your email address — only if you would rather be reached by email than by phone. You can leave it empty.') + '</span>' +
      '<input id="ask-email" type="email" placeholder="Email address"></div>' +
      '<div class="field"><span class="field-label">Message ' + helpHtml('Anything you want to ask about this home — a viewing, the price, the area, or anything else. The more you say, the better the answer.') + '</span>' +
      '<textarea id="ask-message" rows="4" placeholder="Anything you want to ask about this home?"></textarea></div>' +
      '<div class="row"><button type="submit" id="ask-go">Send question</button>' +
      '<button type="button" class="secondary" id="detail-fav">' + (isFav(l.id) ? '♥ Saved' : '♡ Save this home') + '</button></div>' +
      '<p class="error" id="ask-err" hidden></p>' +
      '<div id="ask-out" style="margin-top:12px"></div></form>' +
      '</div></div>';
    el.innerHTML = h;
    attachListingCardListeners(el);
    el.querySelectorAll('[data-close-detail]').forEach(function (n) {
      n.addEventListener('click', function (e) {
        if (e && e.target && e.target !== n) return;
        detailListingId = null;
        show('homes');
      });
    });
    $('detail-fav').addEventListener('click', function () {
      toggleFav(l.id);
      renderDetail();
    });
    $('mort-calc').addEventListener('click', function () {
      var err = $('mort-err');
      var out = $('mort-out');
      var price = Number($('mort-price').value) || 0;
      var down = Number($('mort-down').value) || 0;
      var years = Number($('mort-years').value) || 0;
      var rate = Number($('mort-rate').value) || 0;
      if (price <= 0 || years <= 0 || years > 50 || down < 0 || down >= price) {
        err.hidden = false;
        err.textContent = 'Check the numbers: price above zero, down payment below the price, years between 1 and 50.';
        return;
      }
      err.hidden = true;
      var m = monthlyMortgage(price, down, rate, years);
      var n = years * 12;
      var principal = price - down;
      var paymentsTotal = m * n;
      var total = paymentsTotal + down;
      var interest = total - down - principal;
      out.innerHTML = '<div class="total">Monthly payment: <span class="big">' + money(m) + '</span></div>' +
        '<p>Total of ' + n + ' payments: ' + money(Math.round(paymentsTotal)) +
        '<br>Total cost including down payment: ' + money(Math.round(total)) +
        '<br>Total interest: ' + money(Math.round(interest)) + '</p>' +
        '<button class="secondary" id="mort-schedule">Show full schedule</button><div id="mort-schedule-out"></div>';
      $('mort-schedule').addEventListener('click', function () {
        var bal = principal;
        var j = rate / 1200;
        var rowsHtml = '<table class="info-table"><tr><th>Month</th><th>Interest</th><th>Principal</th><th>Balance</th></tr>';
        for (var k = 1; k <= n; k++) {
          var intr = bal * j;
          var prin = m - intr;
          bal = bal - prin;
          if (bal < 0) bal = 0;
          rowsHtml += '<tr><td>' + k + '</td><td>' + money(round2(intr)) +
            '</td><td>' + money(round2(prin)) +
            '</td><td>' + money(round2(bal)) + '</td></tr>';
        }
        rowsHtml += '</table>';
        $('mort-schedule-out').innerHTML = rowsHtml;
      });
    });
    $('ask-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('ask-err');
      var out = $('ask-out');
      var name = $('ask-name').value.trim();
      var phone = $('ask-phone').value.trim();
      var email = $('ask-email').value.trim();
      var message = $('ask-message').value.trim();
      if (!name) { err.hidden = false; err.textContent = 'Your name is required.'; return; }
      if (!phone) { err.hidden = false; err.textContent = 'Your phone number is required.'; return; }
      err.hidden = true;
      var label = listingLabel(l);
      rpc('place_houses_inquiry', { p_slug: SLUG, p_listing: label, p_name: name, p_phone: phone, p_email: email, p_message: message }).then(function (res) {
        var id = (res && typeof res === 'object') ? (res.id != null ? res.id : res.inquiry_id) : res;
        out.innerHTML = '<p class="info">✓ Sent — inquiry #' + esc(id) + ' about ' + esc(label) + '. Thanks, ' + esc(name) + ' — the agency will be in touch.</p>';
        notifyEmail('Houses inquiry: ' + label, 'houses_inquiry', { slug: SLUG, name: name, phone: phone, email: email, listing: label, message: message });
      }).catch(function (err2) {
        err.hidden = false;
        err.textContent = 'Error: ' + err2.message;
      });
    });
  }

  /* ---------- Inquiries (employee password) ---------- */
  /* Employee password gate (Inquiries). The prompt is rendered
     into the view container it is given, so the lookups MUST stay
     scoped to that container: every view lives in the DOM at once,
     and a global getElementById would wire the first copy's button
     and leave any other copy's Unlock dead. (Only Inquiries calls
     this today, but the scoping keeps it safe if a second tab does.) */
  function empGate(el, heading, after) {
    el.innerHTML = '<h2>' + heading + '</h2><div class="card">' +
      '<p class="info">Enter the employee password for this agency to see inquiries.</p>' +
      '<label>Employee password</label><input id="emp-pass" type="password" autocomplete="current-password">' +
      '<div class="row"><button id="emp-go">Unlock</button></div>' +
      '<p class="error" id="emp-err" hidden></p></div>';
    el.querySelector('#emp-go').addEventListener('click', function () {
      var pw = el.querySelector('#emp-pass').value;
      rpc('check_houses_employee_pass', { p_slug: SLUG, p_password: pw }).then(function (ok) {
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
  function loadBookings(quiet) {
    return rpc('list_houses_bookings', { p_slug: SLUG, p_epass: empPass }).then(function (d) {
      bookings = d || [];
      if (currentView === 'inquiries' && cancelConfirmId === null && delInqConfirmId === null && !clearInqConfirm) renderBookingsList();
      return bookings;
    }).catch(function (e) { if (!quiet) throw e; });
  }
  function renderInquiries() {
    var el = $('view-inquiries');
    if (!house) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (passLocked && !empUnlocked) { empGate(el, 'Inquiries', renderInquiries); return; }
    el.innerHTML = '<h2>Inquiries — ' + esc(house.name) + '</h2><p class="info">Questions about homes refresh on their own every few seconds.</p><div id="bookings-list"><p class="info">Loading…</p></div>';
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
    if (d.listing) lines.push('Home: ' + esc(d.listing));
    if (d.message) lines.push('Message: ' + esc(d.message));
    return lines.join('<br>');
  }
  function renderBookingsList() {
    var el = $('bookings-list');
    if (!el) return;
    if (!bookings.length) { el.innerHTML = '<div class="card"><p class="info">No inquiries yet.</p></div>'; return; }
    var h = '';
    var finishedCount = bookings.filter(function (b) { return b.status === 'done' || b.status === 'cancelled'; }).length;
    var stayingCount = bookings.length - finishedCount;
    if (bookingsErr) h += '<p class="error">' + esc(bookingsErr) + '</p>';
    if (clearInqConfirm) {
      h += '<p><b>Clear all ' + finishedCount + ' finished inquir' + (finishedCount === 1 ? 'y' : 'ies') + '?</b> ' + stayingCount + ' active inquir' + (stayingCount === 1 ? 'y' : 'ies') + ' will stay.</p><div class="row"><button class="small danger" data-clear-inq-yes>Yes, clear all</button><button class="small secondary" data-clear-inq-no>Keep them</button></div>';
    } else if (bookings.length) {
      h += '<div class="row"><button class="small danger" data-clear-inq>Clear all inquiries</button></div>';
    }
    bookings.forEach(function (b) {
      var actions = '';
      if (cancelConfirmId === b.id) {
        actions = '<p><b>Cancel this inquiry?</b></p><div class="row"><button class="small danger" data-cancel-yes="' + b.id + '" data-kind="' + b.kind + '">Yes, cancel</button><button class="small secondary" data-cancel-no="' + b.id + '">Keep it</button></div>';
      } else if (delInqConfirmId === b.id) {
        actions = '<p><b>Delete this inquiry?</b></p><div class="row"><button class="small danger" data-del-inq-yes="' + b.id + '" data-kind="' + b.kind + '">Yes, delete</button><button class="small secondary" data-del-inq-no="' + b.id + '">Keep it</button></div>';
      } else if (b.status === 'active') {
        actions = '<div class="row"><button class="small" data-done="' + b.id + '" data-kind="' + b.kind + '">Mark done</button><button class="small danger" data-cancel="' + b.id + '" data-kind="' + b.kind + '">Cancel</button><button class="small danger" data-del-inq="' + b.id + '">Delete</button></div>';
      } else {
        actions = '<div class="row"><button class="small danger" data-del-inq="' + b.id + '">Delete</button></div>';
      }
      h += '<div class="card"><h3>Inquiry #' + esc(b.id) +
        (b.status && b.status !== 'active' ? ' <span class="voided">(' + esc(b.status) + ')</span>' : '') + '</h3>' +
        '<p class="info">' + esc(fmtDT(b.created_at)) + '</p>' +
        '<p>' + bookingDetails(b) + '</p>' +
        actions +
        '</div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-done]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-done'));
        var kind = btn.getAttribute('data-kind');
        btn.disabled = true;
        rpc('update_houses_booking', { p_slug: SLUG, p_epass: empPass, p_kind: kind, p_id: id, p_status: 'done' })
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
        var kind = btn.getAttribute('data-kind');
        btn.disabled = true;
        rpc('update_houses_booking', { p_slug: SLUG, p_epass: empPass, p_kind: kind, p_id: id, p_status: 'cancelled' })
          .then(function () { cancelConfirmId = null; bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { cancelConfirmId = null; bookingsErr = 'Error: ' + e.message; renderBookingsList(); });
      });
    });
    el.querySelectorAll('[data-del-inq]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        delInqConfirmId = Number(btn.getAttribute('data-del-inq'));
        bookingsErr = '';
        renderBookingsList();
      });
    });
    el.querySelectorAll('[data-del-inq-no]').forEach(function (btn) {
      btn.addEventListener('click', function () { delInqConfirmId = null; renderBookingsList(); });
    });
    el.querySelectorAll('[data-del-inq-yes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-del-inq-yes'));
        var kind = btn.getAttribute('data-kind');
        btn.disabled = true;
        rpc('delete_houses_inquiry', { p_slug: SLUG, p_epass: empPass, p_kind: kind, p_id: id })
          .then(function () { delInqConfirmId = null; bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { delInqConfirmId = null; bookingsErr = 'Error: ' + e.message; renderBookingsList(); });
      });
    });
    el.querySelectorAll('[data-clear-inq]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearInqConfirm = true;
        bookingsErr = '';
        renderBookingsList();
      });
    });
    el.querySelectorAll('[data-clear-inq-no]').forEach(function (btn) {
      btn.addEventListener('click', function () { clearInqConfirm = false; renderBookingsList(); });
    });
    el.querySelectorAll('[data-clear-inq-yes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        rpc('clear_houses_inquiries', { p_slug: SLUG, p_epass: empPass })
          .then(function () { clearInqConfirm = false; bookingsErr = ''; return loadBookings(); })
          .catch(function (e) { clearInqConfirm = false; bookingsErr = 'Error: ' + e.message; renderBookingsList(); });
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
  var REPORTS_SYSTEM = 'houses';
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
    if (!house) { el.innerHTML = '<p class="info">Loading…</p>'; return; }
    if (!ownerCreds) {
      el.innerHTML = '<h2>Setup</h2><div class="card">' +
        '<p class="info">Enter the username and password Yently gave this agency.</p>' +
        '<label>Username</label><input id="st-user" type="text" autocomplete="username">' +
        '<label>Password</label><input id="st-pass" type="password" autocomplete="current-password">' +
        '<div class="row"><button id="st-go">Log in</button></div>' +
        '<p class="error" id="st-err" hidden></p></div>';
      $('st-go').addEventListener('click', function () {
        var u = $('st-user').value.trim();
        var p = $('st-pass').value;
        rpc('check_houses_login', { p_slug: SLUG, p_u: u, p_p: p }).then(function (ok) {
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
    var featChecks = FEATURES.map(function (f) {
      return '<label class="check"><input type="checkbox" data-feat="' + esc(f) + '"> ' + esc(f) + '</label>';
    }).join(' ');
    var h = '<h2>Setup — ' + esc(house.name) + '</h2>' +
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
      '<div class="card"><h3>Agency details</h3>' +
      '<p class="info">' + (directUploadOn ? 'Direct Upload is on for this page — your changes go live the moment you upload them.' : 'Changes save as a draft. Upload for approval and the admin makes them live.') + '</p>' +
      '<label>Agency name</label><input id="d-name" type="text" value="' + esc(draft.name || '') + '">' +
      '<label>Icon picture</label>' +
      '<div class="icon-field">' +
      '<img id="setup-icon-preview" class="icon-preview" src="' + esc(draft.icon || '') + '" alt=""' + (draft.icon ? '' : ' hidden') + '>' +
      '<input id="setup-icon-file" type="file" accept="image/*">' +
      '<button type="button" id="setup-icon-remove" class="small secondary">Remove icon</button>' +
      '</div>' +
      '<p class="info" id="setup-icon-out">One small picture shown next to the agency name. It is shrunk to 200px before uploading.</p>' +
      '<label>Address</label><input id="d-address" type="text" value="' + esc(draft.address || '') + '">' +
      '<label>Phone</label><input id="d-phone" type="tel" value="' + esc(draft.phone || '') + '">' +
      '<label>Hours</label><input id="d-hours" type="text" value="' + esc(draft.hours || '') + '">' +
      '<label>About</label><textarea id="d-about">' + esc(draft.about || '') + '</textarea>' +
      '<div class="row"><button id="d-save">Save draft</button>' +
      '<button id="d-upload" class="secondary">' + (directUploadOn ? 'Upload — goes live right away' : 'Upload for approval') + '</button></div>' +
      '<p class="info" id="d-status">Draft status: ' + esc(draftStatus) + (draftStatus === 'pending' ? ' — waiting for Yently to approve it.' : draftStatus === 'approved' ? ' — approved, live now.' : ' — not sent yet.') + '</p>' +
      '<p class="error" id="d-err" hidden></p>' +
      '</div>' +
      '<div class="card"><h3>Listings</h3>' +
      '<p class="info">Listings go live right away — no approval needed.</p>' +
      '<div id="listings-list"></div>' +
      '<h3 id="listing-form-title">Add a listing</h3>' +
      '<label>Street address</label><input id="l-address" type="text" placeholder="e.g. 12 Maple Street">' +
      '<label>City</label><input id="l-city" type="text">' +
      '<label>ZIP</label><input id="l-zip" type="text">' +
      '<label>Price</label><input id="l-price" type="number" min="0" step="0.01" inputmode="decimal">' +
      '<label>Bedrooms</label><input id="l-bedrooms" type="number" min="0" step="1" inputmode="numeric">' +
      '<label>Bathrooms</label><input id="l-bathrooms" type="number" min="0" step="1" inputmode="numeric">' +
      '<label>Square feet</label><input id="l-sqft" type="number" min="0" step="1" inputmode="numeric">' +
      '<label>Home age (years)</label><input id="l-age" type="number" min="0" step="1" inputmode="numeric">' +
      '<label>Stories</label><input id="l-stories" type="number" min="0" step="1" inputmode="numeric">' +
      '<label>Description</label><textarea id="l-desc" rows="3"></textarea>' +
      '<label>Features</label><div class="row wrap" id="l-features">' + featChecks + '</div>' +
      '<label>Pictures (up to 7)</label>' +
      '<input id="l-pics" type="file" accept="image/*" multiple>' +
      '<div id="l-pics-list"></div>' +
      '<p class="error" id="l-pics-status" hidden></p>' +
      '<div class="row"><button id="l-save">Save listing</button>' +
      '<button id="l-cancel" class="secondary" hidden>Cancel edit</button></div>' +
      '<p class="error" id="l-err" hidden></p></div>';
    el.innerHTML = h;
    /* Add-ons section: the ☰ menu, the details panel and the
       active list (see renderAddonsSection). Replaces the old
       one-line-per-add-on Setup lines and the Chats card. */
    renderAddonsSection();
    renderListingsList();
    $('d-save').addEventListener('click', function () { saveDraft(false); });
    $('d-upload').addEventListener('click', function () { saveDraft(true); });
    $('l-save').addEventListener('click', saveListing);
    $('l-cancel').addEventListener('click', function () { listingEditId = null; renderSetup(); });
    if (!listingEditId) listingPics = [];
    renderListingPics();
    $('l-pics').addEventListener('change', onListingPicsChosen);
    wireIconField();
  }
  function renderListingsList() {
    var el = $('listings-list');
    if (!el) return;
    var listings = house.listings || [];
    if (!listings.length) { el.innerHTML = '<p class="info">No listings yet.</p>'; return; }
    var h = '';
    listings.forEach(function (l) {
      h += '<div class="cart-line"><div><b>' + esc(listingLabel(l)) + '</b><br><span class="info">' + money(l.price) + (l.bedrooms != null && l.bedrooms !== '' ? ' · ' + l.bedrooms + ' beds' : '') + (l.sqft ? ' · ' + fmtNum(l.sqft) + ' sq ft' : '') + '</span></div>' +
        '<div class="row"><button class="small secondary" data-edit="' + l.id + '">Edit</button>' +
        (delConfirmId === l.id
          ? '<span><b>Delete "' + esc(listingLabel(l)) + '"?</b> <button class="small danger" data-del-yes="' + l.id + '">Yes, delete</button> <button class="small secondary" data-del-no="' + l.id + '">Keep it</button></span>'
          : '<button class="small danger" data-del="' + l.id + '">Delete</button>') + '</div></div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var l = listingById(Number(b.getAttribute('data-edit')));
        if (!l) return;
        listingEditId = l.id;
        $('l-address').value = l.address || '';
        $('l-city').value = l.city || '';
        $('l-zip').value = l.zip || '';
        $('l-price').value = l.price == null ? '' : l.price;
        $('l-bedrooms').value = l.bedrooms == null ? '' : l.bedrooms;
        $('l-bathrooms').value = l.bathrooms == null ? '' : l.bathrooms;
        $('l-sqft').value = l.sqft == null ? '' : l.sqft;
        $('l-age').value = l.age == null ? '' : l.age;
        $('l-stories').value = l.stories == null ? '' : l.stories;
        $('l-desc').value = l.description || '';
        document.querySelectorAll('#l-features [data-feat]').forEach(function (box) {
          box.checked = (l.features || []).indexOf(box.getAttribute('data-feat')) !== -1;
        });
        listingPics = (l.pics || []).slice();
        renderListingPics();
        $('listing-form-title').textContent = 'Edit listing — ' + listingLabel(l);
        $('l-cancel').hidden = false;
        window.scrollTo(0, document.getElementById('listing-form-title').offsetTop - 80);
      });
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        delConfirmId = Number(b.getAttribute('data-del'));
        renderListingsList();
      });
    });
    el.querySelectorAll('[data-del-no]').forEach(function (b) {
      b.addEventListener('click', function () { delConfirmId = null; renderListingsList(); });
    });
    el.querySelectorAll('[data-del-yes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var l = listingById(Number(b.getAttribute('data-del-yes')));
        if (!l) return;
        b.disabled = true;
        rpc('delete_houses_listing', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_listing_id: l.id })
          .then(function () { delConfirmId = null; return loadHouse(); })
          .then(function () { renderSetup(); })
          .catch(function (e) { delConfirmId = null; renderListingsList(); var er = $('l-err'); if (er) { er.hidden = false; er.textContent = 'Error: ' + e.message; } });
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
    if (!d.name) { err.hidden = false; err.textContent = 'Agency name is required.'; return; }
    err.hidden = true;
    rpc('save_houses_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_draft: d })
      .then(function () {
        draft = d;
        draftStatus = 'editing';
        if (!upload) {
          $('d-status').textContent = 'Draft status: editing — saved, not sent yet.';
          return;
        }
        return rpc('submit_houses_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p }).then(function () {
          draftStatus = directUploadOn ? 'approved' : 'pending';
          $('d-status').textContent = directUploadOn ? 'Draft status: approved — live right away.' : 'Draft status: pending — waiting for Yently to approve it.';
          notifyEmail((directUploadOn ? 'Houses upload — live right away: ' : 'Houses draft for approval: ') + d.name, 'houses_draft', { slug: SLUG, name: d.name, status: directUploadOn ? 'Live right away — no approval needed' : undefined });
        });
      })
      .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
  }
  /* ---------- Listing pictures (Setup) ---------- */
  /* Shrink a picture in the browser before it is stored. Listing
     pictures are shrunk to 800px on the long edge at JPEG quality 0.8
     — big enough to see the home, not high quality. PNGs stay PNG,
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
  /* Upload one picture to the product-images bucket, under store/houses/,
     and return its public URL. Anon uploads are only allowed under
     store/ — this path qualifies, and the bucket is publicly readable. */
  function uploadListingPicture(file) {
    return shrinkImage(file, 800, 0.8).then(function (up) {
      var safe = up.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      var path = 'store/houses/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe;
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
  function renderListingPics() {
    var el = $('l-pics-list');
    if (!el) return;
    var h = '<p class="info">' + listingPics.length + ' of 7 pictures</p>';
    if (listingPics.length) {
      h += '<div class="pic-thumbs">';
      listingPics.forEach(function (url, i) {
        h += '<div class="pic-thumb"><img src="' + esc(listingPicSrc(url)) + '" alt="Listing picture ' + (i + 1) + '"><button class="small danger" data-pic-remove="' + i + '">Remove</button></div>';
      });
      h += '</div>';
    }
    el.innerHTML = h;
    el.querySelectorAll('[data-pic-remove]').forEach(function (b) {
      b.addEventListener('click', function () {
        listingPics.splice(Number(b.getAttribute('data-pic-remove')), 1);
        renderListingPics();
      });
    });
  }
  function onListingPicsChosen() {
    var input = $('l-pics');
    var status = $('l-pics-status');
    var files = (input && input.files) ? Array.prototype.slice.call(input.files) : [];
    if (!files.length) return;
    var room = 7 - listingPics.length;
    if (room <= 0) {
      if (status) { status.hidden = false; status.textContent = 'This listing already has 7 pictures — remove one to add another.'; }
      input.value = '';
      return;
    }
    if (files.length > room) {
      if (status) { status.hidden = false; status.textContent = 'Only 7 pictures per listing — the extra ' + (files.length - room) + ' picture(s) were not added.'; }
    } else if (status) { status.hidden = true; }
    input.value = '';
    var chain = Promise.resolve();
    files.slice(0, room).forEach(function (file) {
      chain = chain.then(function () { return uploadListingPicture(file); }).then(function (url) {
        listingPics.push(url);
        renderListingPics();
      }).catch(function (err) {
        if (status) { status.hidden = false; status.textContent = 'Upload failed: ' + err.message; }
      });
    });
  }
  function collectListing() {
    var num = function (id) {
      var v = $(id).value.trim();
      return v === '' ? null : Number(v);
    };
    var feats = [];
    document.querySelectorAll('#l-features [data-feat]').forEach(function (box) {
      if (box.checked) feats.push(box.getAttribute('data-feat'));
    });
    return {
      address: $('l-address').value.trim(),
      city: $('l-city').value.trim(),
      zip: $('l-zip').value.trim(),
      price: num('l-price') == null ? 0 : num('l-price'),
      bedrooms: num('l-bedrooms'),
      bathrooms: num('l-bathrooms'),
      sqft: num('l-sqft'),
      stories: num('l-stories'),
      age: num('l-age'),
      description: $('l-desc').value.trim(),
      features: feats,
      pics: listingPics.slice()
    };
  }
  function saveListing() {
    var err = $('l-err');
    var l = collectListing();
    if (!l.address) { err.hidden = false; err.textContent = 'Street address is required.'; return; }
    if (!(l.price >= 0)) { err.hidden = false; err.textContent = 'Price must be 0 or more.'; return; }
    err.hidden = true;
    if (listingEditId) l.id = listingEditId;
    rpc('save_houses_listing', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p, p_listing: l })
      .then(function () { listingEditId = null; return loadHouse(); })
      .then(function () { renderSetup(); })
      .catch(function (e) { err.hidden = false; err.textContent = 'Error: ' + e.message; });
  }
  function loadDraft() {
    rpc('get_houses_draft', { p_slug: SLUG, p_u: ownerCreds.u, p_p: ownerCreds.p })
      .then(function (d) {
        draft = d || {};
        draftStatus = 'editing';
        /* Direct Upload switch: see the note by directUploadOn. */
        return rpc('direct_upload_enabled', { p_owner_type: 'houses', p_owner_key: SLUG }).then(function (on) {
          directUploadOn = (on === true);
        }).catch(function () { directUploadOn = false; }).then(function () {
          /* Reports switch: see the note by reportsOn. */
          return rpc('reports_enabled', { p_owner_type: 'houses', p_owner_key: SLUG }).then(function (on) {
            reportsOn = (on === true);
          }).catch(function () { reportsOn = false; });
        }).then(function () {
          /* TV Gallery switch: see the note by tvGalleryOn. */
          return rpc('tv_gallery_enabled', { p_owner_type: 'houses', p_owner_key: SLUG }).then(function (on) {
            tvGalleryOn = (on === true);
          }).catch(function () { tvGalleryOn = false; });
        }).then(function () {
          /* Live Chat switch: see the note by chatOn. */
          return rpc('shop_chat_enabled', { p_owner_type: 'houses', p_owner_key: SLUG }).then(function (on) {
            chatOn = (on === true);
          }).catch(function () { chatOn = false; });
        }).then(function () {
          /* Clean Link: whether the shop already has one
             (clean_link_exists, public RPC) — for the Add-ons
             section's Clean Link panel and active list. */
          return rpc('clean_link_exists', { p_system: 'houses', p_slug: SLUG }).then(function (has) {
            hasCleanLink = (has === true);
          }).catch(function () { hasCleanLink = false; });
        }).then(function () {
          /* Remove Branding switch: whether Yently switched the
             "Powered by Yently" banner off for this shop
             (branding_removed, public RPC) — for the Add-ons
             section's Remove Branding panel and active list. */
          return rpc('branding_removed', { p_owner_type: 'houses', p_owner_key: SLUG }).then(function (on) {
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
      $('site-name').textContent = 'Houses';
      $('view-homes').innerHTML = '<div class="card"><h2>Houses not found</h2><p class="info">This houses page needs your own agency link — ask Yently for it.</p></div>';
      return;
    }
    loadHouse().then(function (d) {
      if (!d) {
        $('site-name').textContent = 'Houses';
        $('view-homes').innerHTML = '<div class="card"><h2>Houses not found</h2><p class="info">No agency with this link yet. Ask Yently to set it up.</p></div>';
        return;
      }
      mountShopChatBubble(d.name, '');
      return rpc('houses_pass_status', { p_slug: SLUG }).then(function (st) {
        passLocked = st === 'locked';
        empUnlocked = !passLocked;
        renderHomes();
      });
    }).catch(function (e) {
      $('view-homes').innerHTML = '<p class="error">Error: ' + esc(e.message) + '</p>';
    });
  }
  resolveSlug().then(function () { init(); });
})();
