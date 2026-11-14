/* Kids content library — ONE shared script for all 9 Kids subject apps.
   Mounted ONLY in Setup (the owner view), never in public play.
   Shows the ready-to-use levels Yently prepared for this subject:
   3 categories (Beginner / Intermediate / Advanced) x 7 levels.
   The owner picks a level and adds it to their own school — nothing
   is removed, new items are added to the school's current list.
   The level files live at /kids-library/<subject>/<category>-<n>.json
   and are fetched lazily: counts load per cell, and the full file is
   fetched again when the owner taps Add. Adding goes through the
   apply_kids_library RPC with the owner's own login, exactly like
   the other Setup calls in these apps. Plain vanilla JS, no
   dependencies. If anything is missing (no container, no login,
   file not found) the section degrades quietly instead of breaking
   Setup. No window.confirm / alert anywhere — the confirm step is
   an in-page box, like the other folder apps. */
(function () {
  'use strict';

  /* Public by design: the same publishable key the main Yently site
     ships in its own pages, and the same RPC call shape the Kids
     apps use (plain fetch to /rest/v1/rpc/). */
  var SUPABASE_URL = 'https://deykvlxikzwwrygmkdly.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_e2uwGgFB0SvVQS-TZahArQ_mjypz9Vr';

  var CATEGORIES = [
    { key: 'beginner', label: 'Beginner' },
    { key: 'intermediate', label: 'Intermediate' },
    { key: 'advanced', label: 'Advanced' }
  ];
  var LEVEL_NUMBERS = [1, 2, 3, 4, 5, 6, 7];

  /* Which key inside each level file holds the items to count/add. */
  var CONTENT_KEY = {
    arabic: 'words', english: 'words', french: 'words', spanish: 'words',
    geography: 'countries', science: 'topics', reading: 'books',
    coding: 'puzzles', math: 'wordProblems'
  };
  /* Singular / plural unit words for the counts and messages. */
  var UNIT = {
    arabic: ['word', 'words'], english: ['word', 'words'],
    french: ['word', 'words'], spanish: ['word', 'words'],
    geography: ['country', 'countries'], science: ['topic', 'topics'],
    reading: ['book', 'books'], coding: ['puzzle', 'puzzles'],
    math: ['problem', 'problems']
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function unitWord(subject, count) {
    var u = UNIT[subject] || ['item', 'items'];
    return count === 1 ? u[0] : u[1];
  }
  function fileUrl(subject, categoryKey, n) {
    return '/kids-library/' + subject + '/' + categoryKey + '-' + n + '.json';
  }
  function fetchLevelFile(subject, categoryKey, n) {
    return fetch(fileUrl(subject, categoryKey, n)).then(function (res) {
      if (!res.ok) throw new Error('Level file not found');
      return res.json();
    });
  }
  function countItems(subject, json) {
    var key = CONTENT_KEY[subject];
    var arr = json ? json[key] : null;
    return Array.isArray(arr) ? arr.length : null;
  }
  function rpc(name, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!res.ok) throw new Error((j && j.message) || 'request failed');
        return j;
      });
    });
  }

  window.KidsLibrary = {
    mount: function (opts) {
      if (!opts || !opts.container) return;
      var subject = opts.subject;
      var slug = opts.slug;
      var creds = opts.creds;
      var container = opts.container;
      if (!subject || !CONTENT_KEY[subject] || !slug || !creds || !creds.u) return;

      /* Counts already loaded, keyed 'beginner-3' etc., so the
         confirm box can show them without fetching again. */
      var counts = {};

      var box = document.createElement('div');
      box.style.cssText = 'background:#fff;border:1px solid #e7e5e4;border-radius:16px;padding:18px;margin:0 0 16px;box-shadow:0 2px 10px rgba(0,0,0,.06);';
      box.innerHTML =
        '<h2 style="margin:0 0 6px;font-size:22px;">📚 Content library</h2>' +
        '<p style="margin:0 0 14px;color:#57534e;font-size:16px;line-height:1.5;">Ready-to-use content from Yently. Pick a level to add it to your school — nothing is removed, new items are added to your current list.</p>' +
        '<div class="kids-lib-table-wrap" style="overflow-x:auto;">' +
        '<table style="border-collapse:collapse;width:100%;min-width:560px;">' +
        '<thead><tr><th style="text-align:left;padding:8px 6px;font-size:15px;color:#57534e;"></th>' +
        LEVEL_NUMBERS.map(function (n) {
          return '<th style="text-align:center;padding:8px 6px;font-size:15px;color:#57534e;">Level ' + n + '</th>';
        }).join('') + '</tr></thead><tbody></tbody></table></div>' +
        '<div class="kids-lib-confirm" style="margin-top:14px;"></div>' +
        '<div class="kids-lib-msg" style="margin-top:10px;font-size:16px;line-height:1.5;"></div>';
      container.appendChild(box);

      var tbody = box.querySelector('tbody');
      var confirmEl = box.querySelector('.kids-lib-confirm');
      var msgEl = box.querySelector('.kids-lib-msg');

      function showMessage(text, isError) {
        msgEl.textContent = text;
        msgEl.style.color = isError ? '#b91c1c' : '#15803d';
      }

      function showConfirm(category, n) {
        var key = category.key + '-' + n;
        var count = counts[key];
        var label = category.label + ' Level ' + n +
          (count != null ? ' (' + count + ' ' + unitWord(subject, count) + ')' : '');
        confirmEl.innerHTML = '';
        var wrap = document.createElement('div');
        wrap.style.cssText = 'background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:14px;';
        var text = document.createElement('p');
        text.style.cssText = 'margin:0 0 12px;font-size:16px;line-height:1.5;';
        text.textContent = 'Add ' + label + ' to your school? Nothing is removed — new items are added to your current list.';
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:10px;';
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.textContent = 'Add';
        addBtn.style.cssText = 'padding:10px 22px;font-size:17px;';
        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'secondary';
        cancelBtn.style.cssText = 'padding:10px 22px;font-size:17px;';
        cancelBtn.addEventListener('click', function () { confirmEl.innerHTML = ''; });
        addBtn.addEventListener('click', function () {
          addBtn.disabled = true;
          cancelBtn.disabled = true;
          addBtn.textContent = 'Adding…';
          fetchLevelFile(subject, category.key, n).then(function (json) {
            var total = countItems(subject, json);
            return rpc('apply_kids_library', {
              p_subject: subject, p_slug: slug,
              p_u: creds.u, p_p: creds.p, p_content: json
            }).then(function (res) {
              return { res: res, total: total };
            });
          }).then(function (out) {
            var res = out.res || {};
            var added = (res.added != null) ? Number(res.added) : null;
            var already = (res.already != null) ? Number(res.already) : null;
            var total = (res.total != null) ? Number(res.total) : out.total;
            confirmEl.innerHTML = '';
            if (added != null && already != null && total != null) {
              showMessage('Added ' + total + ' ' + unitWord(subject, total) + ' — ' + added + ' new, ' + already + ' already had', false);
            } else if (added != null) {
              showMessage('Added ' + added + ' ' + unitWord(subject, added) + ' to your school.', false);
            } else if (total != null) {
              showMessage('Added ' + total + ' ' + unitWord(subject, total) + ' to your school.', false);
            } else {
              showMessage('Added to your school.', false);
            }
            /* Refresh the Setup list so the new items show up. A
               short pause first, so the owner can read the line
               above before Setup re-renders. */
            if (typeof opts.onAdded === 'function') {
              setTimeout(function () { opts.onAdded(); }, 1200);
            }
          }).catch(function (err) {
            confirmEl.innerHTML = '';
            showMessage('Could not add: ' + (err && err.message ? err.message : 'request failed'), true);
          });
        });
        row.appendChild(addBtn);
        row.appendChild(cancelBtn);
        wrap.appendChild(text);
        wrap.appendChild(row);
        confirmEl.appendChild(wrap);
      }

      /* One row per category, one cell per level. Counts load lazily
         per cell; a file that is missing just leaves its cell without
         a count — tapping it still works (the file is fetched again
         when the owner taps Add). */
      CATEGORIES.forEach(function (category) {
        var tr = document.createElement('tr');
        var th = document.createElement('th');
        th.style.cssText = 'text-align:left;padding:8px 6px;font-size:16px;';
        th.textContent = category.label;
        tr.appendChild(th);
        LEVEL_NUMBERS.forEach(function (n) {
          var td = document.createElement('td');
          td.style.cssText = 'text-align:center;padding:4px;';
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.style.cssText = 'width:100%;padding:10px 4px;font-size:15px;line-height:1.35;';
          var title = document.createElement('span');
          title.textContent = 'Level ' + n;
          var countSpan = document.createElement('span');
          countSpan.style.cssText = 'display:block;font-size:13px;color:#57534e;';
          countSpan.textContent = '…';
          btn.appendChild(title);
          btn.appendChild(countSpan);
          btn.addEventListener('click', function () { showConfirm(category, n); });
          td.appendChild(btn);
          tr.appendChild(td);
          fetchLevelFile(subject, category.key, n).then(function (json) {
            var c = countItems(subject, json);
            if (c == null) { countSpan.textContent = ''; return; }
            counts[category.key + '-' + n] = c;
            countSpan.textContent = c + ' ' + unitWord(subject, c);
          }).catch(function () {
            /* File not there yet: leave the cell as plain "Level N".
               Tapping it still works — the file is fetched again. */
            countSpan.textContent = '';
          });
        });
        tbody.appendChild(tr);
      });
    }
  };
})();
