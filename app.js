/* Thẻ Học — offline flashcards. All data lives in localStorage; use Backup to save a file. */
(function () {
  'use strict';
  const M = window.Matcher;
  const DB_KEY = 'thehoc.db.v1';
  const LANGS = { vi: 'Vietnamese', en: 'English' };

  // ---------------------------------------------------------------- storage
  const DEFAULT_SETTINGS = {
    answerLang: 'vi',          // 'vi' | 'en' | 'mixed'
    filter: 'all',             // 'all' | 'starred' | 'missed'
    shuffle: true,
    ignoreTones: false,
    typoTolerance: false,
    optionalClassifiers: false,
    autoAdvance: true,
  };
  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        d.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
        d.sets = d.sets || [];
        return d;
      }
    } catch (e) { console.error(e); }
    const seeds = seedSets();
    return { version: 1, sets: seeds.length ? seeds : [sampleSet()], settings: Object.assign({}, DEFAULT_SETTINGS) };
  }
  let saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    const write = () => {
      try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
      catch (e) { toast('Could not save! Storage may be full — use Backup.'); }
    };
    if (now) write(); else saveTimer = setTimeout(write, 250);
  }
  window.addEventListener('beforeunload', () => save(true));

  function seedSets() { return JSON.parse(JSON.stringify(window.SEED_SETS || [])); }
  function missingSeeds() { return seedSets().filter(s => !db.sets.some(x => x.id === s.id)); }
  function sampleSet() {
    const pairs = [
      ['hello', 'xin chào, chào'], ['goodbye', 'tạm biệt'], ['thank you', 'cảm ơn, cám ơn'],
      ['yes', 'vâng, dạ, có'], ['no', 'không'], ['(to) eat', 'ăn'], ['(to) drink', 'uống'],
      ['water', 'nước'], ['car', 'xe (hơi), ô tô'], ['cat', '(con) mèo'], ['How are you?', '(anh/chị/bạn) khỏe không?'],
      ['peace', 'hòa bình'],
    ];
    return newSet('Sample — Greetings & basics', pairs.map(([f, b]) => newCard(f, b)));
  }

  // ---------------------------------------------------------------- utils
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function newCard(front = '', back = '') { return { id: uid(), front, back, starred: false, right: 0, wrong: 0, lastWrong: false }; }
  function newSet(name, cards = []) { const t = Date.now(); return { id: uid(), name, frontLang: 'en', backLang: 'vi', cards, createdAt: t, updatedAt: t }; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function getSet(id) { return db.sets.find(s => s.id === id); }
  function touch(set) { set.updatedAt = Date.now(); save(); }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const app = $('#app');
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2200); }
  function download(name, text, type = 'text/plain') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function langAttr(l) { return l === 'vi' ? 'vi' : 'en'; }

  // Which side is the prompt and which is the answer for this card.
  function orient(set, card, answerLang) {
    let want = answerLang === 'mixed' ? (Math.random() < 0.5 ? 'vi' : 'en') : answerLang;
    let answerSide;
    if (set.backLang === want) answerSide = 'back';
    else if (set.frontLang === want) answerSide = 'front';
    else answerSide = 'back';
    const promptSide = answerSide === 'back' ? 'front' : 'back';
    return {
      prompt: card[promptSide], answer: card[answerSide],
      promptLang: set[promptSide + 'Lang'], answerLang: set[answerSide + 'Lang'],
    };
  }
  function matchOpts(lang) {
    const s = db.settings;
    return { lang, ignoreTones: s.ignoreTones, typoTolerance: s.typoTolerance, optionalClassifiers: s.optionalClassifiers };
  }
  function record(card, correct) {
    if (correct) { card.right++; card.lastWrong = false; } else { card.wrong++; card.lastWrong = true; }
    save();
  }

  // Cards for a study session across one or more sets.
  function sessionItems(setIds) {
    const f = db.settings.filter;
    let items = [];
    for (const id of setIds) {
      const set = getSet(id); if (!set) continue;
      for (const card of set.cards) {
        if (!card.front.trim() && !card.back.trim()) continue;
        if (f === 'starred' && !card.starred) continue;
        if (f === 'missed' && !card.lastWrong) continue;
        items.push({ set, card });
      }
    }
    return db.settings.shuffle ? shuffle(items) : items;
  }

  function diffHtml(user, expected) {
    return '<span class="diff">' + M.diff(user, expected).map(p =>
      p.t === 'same' ? esc(p.s) : `<span class="${p.t}">${esc(p.s)}</span>`).join('') + '</span>';
  }

  // ---------------------------------------------------------------- router
  let cleanup = null;
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const [view, a, b] = parts;
    window.scrollTo(0, 0);
    if (!view) return renderHome();
    if (view === 'new') { const s = newSet('Untitled set', [newCard(), newCard(), newCard()]); db.sets.unshift(s); save(); location.replace('#/set/' + s.id); return; }
    if (view === 'set') return renderSet(a);
    if (view === 'import') return renderImport(a);
    if (view === 'study') {
      const ids = (b || '').split(',').filter(Boolean);
      if (a === 'flash') return renderFlash(ids);
      if (a === 'write') return renderWrite(ids);
      if (a === 'test') return renderTest(ids);
    }
    renderHome();
  }
  window.addEventListener('hashchange', route);
  function studyLink(mode, ids) { return `#/study/${mode}/${ids.map(encodeURIComponent).join(',')}`; }

  // ---------------------------------------------------------------- home
  const selected = new Set();
  function renderHome() {
    const sets = db.sets.slice().sort((x, y) => y.updatedAt - x.updatedAt);
    for (const id of Array.from(selected)) if (!getSet(id)) selected.delete(id);
    app.innerHTML = `
      <div class="row"><div><h1>Your sets</h1><div class="muted small">${sets.length} sets · ${sets.reduce((n, s) => n + s.cards.length, 0)} cards · saved in this browser</div></div>
        <div class="spacer"></div>
        ${missingSeeds().length ? `<button id="addseeds" title="Re-add the built-in 140A sets you don't have">+ Add built-in sets (${missingSeeds().length})</button>` : ''}
        <button id="backup">⬇ Backup</button>
        <label class="btn">⬆ Restore<input id="restore" type="file" accept=".json,application/json" hidden></label>
      </div>
      <div style="margin:18px 0"><input type="search" id="search" placeholder="Search all cards (English or Vietnamese, tones optional)…"></div>
      <div id="results" class="search-results panel" hidden></div>
      ${sets.length ? `<div class="sets">${sets.map(setCardHtml).join('')}</div>` :
        `<div class="panel empty-state"><h2>No sets yet</h2><p class="muted">Create a set or import your Quizlet vocab.</p>
         <a class="btn primary" href="#/import">Import vocab</a> <a class="btn" href="#/new">New set</a></div>`}
      <p class="muted small" style="margin-top:20px">Tip: tick several sets to study them together.</p>
      <div id="selbar"></div>`;
    renderSelbar();

    $$('.set-card').forEach(el => {
      el.addEventListener('click', e => {
        const id = el.dataset.id;
        if (e.target.matches('.pick')) { e.target.checked ? selected.add(id) : selected.delete(id); renderSelbar(); return; }
        const act = e.target.closest('[data-act]');
        if (act) { e.preventDefault(); location.hash = act.dataset.act === 'edit' ? '#/set/' + id : studyLink(act.dataset.act, [id]); return; }
        location.hash = '#/set/' + id;
      });
    });
    if ($('#addseeds')) $('#addseeds').onclick = () => { const m = missingSeeds(); db.sets.push(...m); save(true); toast(`Added ${m.length} set(s)`); renderHome(); };
    $('#backup').onclick = () => {
      download(`thehoc-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 2), 'application/json');
    };
    $('#restore').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.sets)) throw new Error('not a backup');
        let added = 0, replaced = 0;
        for (const s of data.sets) {
          const i = db.sets.findIndex(x => x.id === s.id);
          if (i >= 0) { db.sets[i] = s; replaced++; } else { db.sets.push(s); added++; }
        }
        if (data.settings) db.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
        save(true); toast(`Restored: ${added} added, ${replaced} replaced`); renderHome();
      } catch (err) { toast('That file is not a valid backup.'); }
    };
    const search = $('#search'), results = $('#results');
    search.oninput = () => {
      const q = M.fold(M.clean(search.value));
      if (!q) { results.hidden = true; return; }
      const hits = [];
      for (const s of db.sets) for (const c of s.cards) {
        if (M.fold(M.clean(c.front + ' ' + c.back)).includes(q)) hits.push({ s, c });
        if (hits.length >= 50) break;
      }
      results.hidden = false;
      results.innerHTML = hits.length ? hits.map(({ s, c }) => `<div class="hit"><div>${esc(c.front)}</div><div>${esc(c.back)}</div><a href="#/set/${s.id}" class="small">${esc(s.name)}</a></div>`).join('') : '<span class="muted">No matches.</span>';
    };
  }
  function setCardHtml(s) {
    const starred = s.cards.filter(c => c.starred).length, missed = s.cards.filter(c => c.lastWrong).length;
    return `<div class="panel set-card" data-id="${s.id}" role="link" tabindex="0">
      <input type="checkbox" class="pick" ${selected.has(s.id) ? 'checked' : ''} title="Select to study together">
      <h3>${esc(s.name)}</h3>
      <div class="muted small">${s.cards.length} cards${starred ? ` · ★ ${starred}` : ''}${missed ? ` · ${missed} missed` : ''}</div>
      <div class="actions"><button data-act="flash">Flashcards</button><button data-act="write">Write</button><button data-act="test">Test</button></div>
    </div>`;
  }
  function renderSelbar() {
    const el = $('#selbar'); if (!el) return;
    if (!selected.size) { el.innerHTML = ''; return; }
    const ids = Array.from(selected), n = ids.reduce((k, id) => k + (getSet(id)?.cards.length || 0), 0);
    el.innerHTML = `<div class="selbar"><span>${ids.length} sets · ${n} cards</span>
      <a class="btn" href="${studyLink('flash', ids)}" style="color:inherit;background:transparent">Flashcards</a>
      <a class="btn" href="${studyLink('write', ids)}" style="color:inherit;background:transparent">Write</a>
      <a class="btn" href="${studyLink('test', ids)}" style="color:inherit;background:transparent">Test</a>
      <button id="merge">Combine into new set</button><button id="clearsel">✕</button></div>`;
    $('#clearsel').onclick = () => { selected.clear(); renderHome(); };
    $('#merge').onclick = () => {
      const srcs = ids.map(getSet);
      const s = newSet(srcs.map(x => x.name).join(' + ').slice(0, 80), srcs.flatMap(x => x.cards.map(c => newCard(c.front, c.back))));
      s.frontLang = srcs[0].frontLang; s.backLang = srcs[0].backLang;
      db.sets.unshift(s); save(); selected.clear(); location.hash = '#/set/' + s.id;
    };
  }

  // ---------------------------------------------------------------- set editor
  function renderSet(id) {
    const set = getSet(id);
    if (!set) { app.innerHTML = '<p>Set not found. <a href="#/">Home</a></p>'; return; }
    const langSel = (side) => `<select data-lang="${side}">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${set[side + 'Lang'] === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
    app.innerHTML = `
      <div class="row"><a href="#/">← All sets</a></div>
      <div class="row" style="margin:10px 0 6px"><input type="text" id="setname" value="${esc(set.name)}" style="font-size:22px;font-weight:700;flex:1;min-width:220px"></div>
      <div class="row" style="margin-bottom:16px">
        <a class="btn primary" href="${studyLink('flash', [id])}">Flashcards</a>
        <a class="btn primary" href="${studyLink('write', [id])}">Write</a>
        <a class="btn primary" href="${studyLink('test', [id])}">Test</a>
        <div class="spacer"></div>
        <a class="btn" href="#/import/${id}">Bulk add</a>
        <button id="swap" title="Swap front and back on every card">⇄ Swap sides</button>
        <button id="export">Export text</button>
        <button id="resetstats">Reset stats</button>
        <button id="delset" class="danger">Delete set</button>
      </div>
      <div class="panel">
        <div class="card-head"><span class="num">#</span><span>Front · ${langSel('front')}</span><span>Back · ${langSel('back')}</span><span></span></div>
        <div id="rows"></div>
        <div class="row" style="margin-top:12px"><button id="addcard" class="primary">+ Add card</button>
          <span class="muted small">Separate alternative answers with <kbd>,</kbd> <kbd>;</kbd> or <kbd>/</kbd> — any one is accepted. <kbd>( )</kbd> = optional, <kbd>[ ]</kbd> = note.</span></div>
      </div>`;
    const rows = $('#rows');
    const rowHtml = (c, i) => `<div class="card-row" data-cid="${c.id}">
      <span class="num">${i + 1}</span>
      <textarea data-f="front" lang="${langAttr(set.frontLang)}" placeholder="Front">${esc(c.front)}</textarea>
      <textarea data-f="back" lang="${langAttr(set.backLang)}" placeholder="Back">${esc(c.back)}</textarea>
      <span class="tools"><button class="ghost star ${c.starred ? 'on' : ''}" data-a="star" title="Star">★</button>
        <button class="ghost" data-a="del" title="Delete card">🗑</button></span>
      ${c.right || c.wrong ? `<span class="stats">✓ ${c.right} · ✗ ${c.wrong}${c.lastWrong ? ' · missed last time' : ''}</span>` : ''}
    </div>`;
    const draw = () => { rows.innerHTML = set.cards.map(rowHtml).join(''); $$('textarea', rows).forEach(autosize); };
    draw();

    rows.addEventListener('input', e => {
      const ta = e.target; if (!ta.dataset.f) return;
      const card = set.cards.find(c => c.id === ta.closest('.card-row').dataset.cid);
      card[ta.dataset.f] = ta.value; autosize(ta); touch(set);
    });
    rows.addEventListener('keydown', e => {
      // Tab out of the last back field -> new card
      if (e.key === 'Tab' && !e.shiftKey && e.target.dataset.f === 'back' && e.target.closest('.card-row') === rows.lastElementChild) {
        e.preventDefault(); addCard();
      }
    });
    rows.addEventListener('click', e => {
      const btn = e.target.closest('[data-a]'); if (!btn) return;
      const row = btn.closest('.card-row'), idx = set.cards.findIndex(c => c.id === row.dataset.cid);
      if (btn.dataset.a === 'star') { set.cards[idx].starred = !set.cards[idx].starred; btn.classList.toggle('on'); touch(set); }
      if (btn.dataset.a === 'del') {
        const [removed] = set.cards.splice(idx, 1); touch(set); draw();
        toastUndo('Card deleted', () => { set.cards.splice(idx, 0, removed); touch(set); draw(); });
      }
    });
    function addCard() { set.cards.push(newCard()); touch(set); draw(); $('textarea', rows.lastElementChild).focus(); }
    $('#addcard').onclick = addCard;
    $('#setname').oninput = e => { set.name = e.target.value || 'Untitled set'; touch(set); };
    $$('[data-lang]').forEach(sel => sel.onchange = () => { set[sel.dataset.lang + 'Lang'] = sel.value; touch(set); draw(); });
    $('#swap').onclick = () => {
      set.cards.forEach(c => ([c.front, c.back] = [c.back, c.front]));
      [set.frontLang, set.backLang] = [set.backLang, set.frontLang]; touch(set); renderSet(id);
    };
    $('#export').onclick = () => download(set.name.replace(/[^\p{L}\p{N} _-]/gu, '') + '.txt',
      '# ' + set.name + '\n' + set.cards.map(c => `${c.front.replace(/\s*\n\s*/g, ' ')}\t${c.back.replace(/\s*\n\s*/g, ' ')}`).join('\n') + '\n');
    $('#resetstats').onclick = () => { if (confirm('Reset right/wrong counts for this set?')) { set.cards.forEach(c => { c.right = c.wrong = 0; c.lastWrong = false; }); touch(set); draw(); } };
    $('#delset').onclick = () => {
      if (!confirm(`Delete "${set.name}" and its ${set.cards.length} cards?`)) return;
      const i = db.sets.indexOf(set); db.sets.splice(i, 1); save(true); location.hash = '#/';
      toastUndo('Set deleted', () => { db.sets.splice(i, 0, set); save(true); route(); });
    };
  }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(40, ta.scrollHeight + 2) + 'px'; }
  function toastUndo(msg, undo) {
    const t = $('#toast'); t.innerHTML = `${esc(msg)} <button class="ghost" style="color:inherit;text-decoration:underline">Undo</button>`;
    t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 5000);
    $('button', t).onclick = () => { undo(); t.hidden = true; };
  }

  // ---------------------------------------------------------------- import
  const TERM_SEPS = { auto: 'Auto-detect', tab: 'Tab (Quizlet default)', dash: ' - (dash)', colon: ': (colon)', eq: '= (equals)', comma: ', (first comma)', custom: 'Custom…' };
  function splitLine(line, mode, custom) {
    const tryOne = sep => { const i = line.indexOf(sep); return i > 0 ? [line.slice(0, i), line.slice(i + sep.length)] : null; };
    if (mode === 'tab') return tryOne('\t');
    if (mode === 'dash') return tryOne(' - ') || tryOne(' – ') || tryOne(' — ');
    if (mode === 'colon') return tryOne(':');
    if (mode === 'eq') return tryOne('=');
    if (mode === 'comma') return tryOne(',');
    if (mode === 'custom') return custom ? tryOne(custom) : null;
    return tryOne('\t') || tryOne(' - ') || tryOne(' – ') || tryOne(' — ') || tryOne(' = ') || tryOne(' : ') || tryOne(': ') || tryOne('=');
  }
  function parseImport(text, termMode, customTerm, cardSep, defaultName) {
    const sections = []; let cur = null; const skipped = [];
    const ensure = () => { if (!cur) { cur = { name: defaultName, cards: [] }; sections.push(cur); } };
    const chunks = cardSep && cardSep !== '\\n' ? text.split(cardSep) : text.split(/\r?\n/);
    for (let raw of chunks) {
      const line = raw.replace(/\r/g, '').trim();
      if (!line) continue;
      const h = /^#+\s*(.+)$/.exec(line);
      if (h) { cur = { name: h[1].trim(), cards: [] }; sections.push(cur); continue; }
      const pair = splitLine(line, termMode, customTerm);
      if (!pair || !pair[0].trim() || !pair[1].trim()) { skipped.push(line); continue; }
      ensure(); cur.cards.push({ front: pair[0].trim(), back: pair[1].trim() });
    }
    for (const s of sections) {
      let vf = 0, vb = 0;
      s.cards.forEach(c => { if (M.looksVietnamese(c.front)) vf++; if (M.looksVietnamese(c.back)) vb++; });
      s.frontLang = vf > vb ? 'vi' : 'en'; s.backLang = vf > vb ? 'en' : 'vi';
    }
    return { sections: sections.filter(s => s.cards.length), skipped };
  }
  function renderImport(targetId) {
    const target = targetId && getSet(targetId);
    app.innerHTML = `
      <div class="row"><a href="${target ? '#/set/' + target.id : '#/'}">← Back</a></div>
      <h1>${target ? 'Add cards to “' + esc(target.name) + '”' : 'Import vocab'}</h1>
      <p class="muted">Paste one card per line. In Quizlet: <i>⋯ → Export</i>, keep “Tab” between term and definition and “New line” between rows.
        Start a line with <kbd>#</kbd> to begin a new section — each section becomes its own set.</p>
      <div class="panel stack">
        <textarea id="src" rows="14" lang="vi" placeholder="# Lesson 1 — Greetings&#10;hello&#9;xin chào, chào&#10;thank you - cảm ơn&#10;&#10;# Lesson 2 — Food&#10;(to) eat = ăn&#10;rice : cơm"></textarea>
        <div class="row">
          <label>Between term &amp; definition <select id="tsep">${Object.entries(TERM_SEPS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <input type="text" id="tcustom" placeholder="custom" style="width:90px" hidden>
          <label>Between cards <select id="csep"><option value="\\n">New line</option><option value=";">;</option><option value="|">|</option></select></label>
          ${target ? '' : '<label>Name if no # header <input type="text" id="dname" value="Imported set" style="width:200px"></label>'}
        </div>
        <div id="preview" class="small"></div>
        <div class="row"><button id="doimport" class="primary" disabled>Import</button>
          <label class="btn">Load .txt / .csv file<input type="file" id="file" accept=".txt,.csv,.tsv,text/plain" hidden></label></div>
      </div>`;
    let parsed = { sections: [], skipped: [] };
    const update = () => {
      const tsep = $('#tsep').value; $('#tcustom').hidden = tsep !== 'custom';
      parsed = parseImport($('#src').value, tsep, $('#tcustom').value, $('#csep').value, target ? target.name : ($('#dname').value || 'Imported set'));
      const total = parsed.sections.reduce((n, s) => n + s.cards.length, 0);
      $('#doimport').disabled = !total;
      $('#doimport').textContent = target ? `Add ${total} cards` : `Import ${total} cards into ${parsed.sections.length} set${parsed.sections.length === 1 ? '' : 's'}`;
      $('#preview').innerHTML = parsed.sections.map(s => `<div><b>${esc(s.name)}</b> — ${s.cards.length} cards
          <span class="muted">(front looks ${LANGS[s.frontLang]}, back ${LANGS[s.backLang]}) · e.g. “${esc(s.cards[0].front)}” → “${esc(s.cards[0].back)}”</span></div>`).join('') +
        (parsed.skipped.length ? `<div style="color:var(--warn);margin-top:6px">Skipped ${parsed.skipped.length} line(s) with no separator: ${parsed.skipped.slice(0, 5).map(l => '“' + esc(l) + '”').join(', ')}${parsed.skipped.length > 5 ? '…' : ''}</div>` : '');
    };
    app.addEventListener('input', update);
    app.addEventListener('change', update);
    cleanup = () => { app.removeEventListener('input', update); app.removeEventListener('change', update); };
    $('#file').onchange = async e => { const f = e.target.files[0]; if (f) { $('#src').value = await f.text(); update(); } };
    $('#doimport').onclick = () => {
      if (target) {
        parsed.sections.forEach(s => s.cards.forEach(c => target.cards.push(newCard(c.front, c.back))));
        touch(target); save(true); location.hash = '#/set/' + target.id; return;
      }
      const created = parsed.sections.map(s => { const set = newSet(s.name, s.cards.map(c => newCard(c.front, c.back))); set.frontLang = s.frontLang; set.backLang = s.backLang; return set; });
      db.sets.unshift(...created); save(true);
      toast(`Imported ${created.length} set(s)`);
      location.hash = created.length === 1 ? '#/set/' + created[0].id : '#/';
    };
  }

  // ---------------------------------------------------------------- study options bar
  function optionsHtml(opts = {}) {
    const s = db.settings;
    return `<div class="panel options">
      ${opts.noAnswer ? '' : `<label>Answer in <select data-s="answerLang"><option value="vi" ${s.answerLang === 'vi' ? 'selected' : ''}>Vietnamese</option><option value="en" ${s.answerLang === 'en' ? 'selected' : ''}>English</option><option value="mixed" ${s.answerLang === 'mixed' ? 'selected' : ''}>Both (mixed)</option></select></label>`}
      <label>Cards <select data-s="filter"><option value="all" ${s.filter === 'all' ? 'selected' : ''}>All</option><option value="starred" ${s.filter === 'starred' ? 'selected' : ''}>★ Starred</option><option value="missed" ${s.filter === 'missed' ? 'selected' : ''}>Missed last time</option></select></label>
      <label class="check"><input type="checkbox" data-s="shuffle" ${s.shuffle ? 'checked' : ''}> Shuffle</label>
      ${opts.checking ? `
      <label class="check" title="Accept ma for má"><input type="checkbox" data-s="ignoreTones" ${s.ignoreTones ? 'checked' : ''}> Ignore tone marks</label>
      <label class="check" title="Accept 1 typo (2 on long answers)"><input type="checkbox" data-s="typoTolerance" ${s.typoTolerance ? 'checked' : ''}> Allow small typos</label>
      <label class="check" title="Accept mèo for con mèo, chuẩn mực for các chuẩn mực"><input type="checkbox" data-s="optionalClassifiers" ${s.optionalClassifiers ? 'checked' : ''}> con/cái/các… optional</label>` : ''}
      ${opts.advance ? `<label class="check"><input type="checkbox" data-s="autoAdvance" ${s.autoAdvance ? 'checked' : ''}> Auto-advance when right</label>` : ''}
    </div>`;
  }
  function bindOptions(restart, liveKeys = []) {
    $$('[data-s]').forEach(el => el.onchange = () => {
      const k = el.dataset.s; db.settings[k] = el.type === 'checkbox' ? el.checked : el.value; save();
      if (!liveKeys.includes(k)) restart();
    });
  }
  function studyHeader(ids, mode) {
    const names = ids.map(id => getSet(id)?.name).filter(Boolean);
    const back = ids.length === 1 ? '#/set/' + ids[0] : '#/';
    const modes = { flash: 'Flashcards', write: 'Write', test: 'Test' };
    return `<div class="study-head"><a href="${back}">← ${esc(names.length === 1 ? names[0] : names.length + ' sets')}</a>
      <div class="spacer"></div>${Object.entries(modes).map(([k, v]) => `<a class="btn ${k === mode ? 'primary' : ''}" href="${studyLink(k, ids)}">${v}</a>`).join('')}</div>`;
  }
  function noCardsHtml() {
    const f = db.settings.filter;
    return `<div class="panel empty-state"><h2>No cards to study</h2><p class="muted">${f === 'starred' ? 'No starred cards — star some, or switch to “All”.' : f === 'missed' ? 'Nothing missed last time. 🎉 Switch to “All”.' : 'This set is empty.'}</p></div>`;
  }

  // ---------------------------------------------------------------- flashcards
  function renderFlash(ids) {
    const items = sessionItems(ids);
    let i = 0, flipped = false, know = new Set(), learning = new Set();
    const s = db.settings;
    // Flashcards show the "prompt" side first (the side you are NOT answering in).
    const oriented = items.map(it => ({ ...it, o: orient(it.set, it.card, s.answerLang) }));
    function draw() {
      if (!items.length) { app.innerHTML = studyHeader(ids, 'flash') + optionsHtml({}) + noCardsHtml(); bindOptions(() => renderFlash(ids)); return; }
      if (i >= items.length) {
        const again = oriented.filter(x => learning.has(x.card.id));
        app.innerHTML = studyHeader(ids, 'flash') + `<div class="panel empty-state"><h2>Deck finished</h2>
          <p>✓ Know: <b>${know.size}</b> · Still learning: <b>${learning.size}</b></p>
          <div class="row" style="justify-content:center">${again.length ? '<button class="primary" id="again">Study the ones still learning</button>' : ''}<button id="restart">Restart</button>
          <a class="btn" href="${studyLink('write', ids)}">Practice writing →</a></div></div>`;
        $('#restart').onclick = () => renderFlash(ids);
        if (again.length) $('#again').onclick = () => { oriented.splice(0, oriented.length, ...again); items.splice(0, items.length, ...again); i = 0; flipped = false; know.clear(); learning.clear(); draw(); };
        return;
      }
      const it = oriented[i];
      app.innerHTML = studyHeader(ids, 'flash') + optionsHtml({}) + `
        <div class="progress"><div style="width:${(i / items.length) * 100}%"></div></div>
        <div class="flash ${flipped ? 'flipped' : ''}" id="card"><div class="flash-inner">
          <div class="flash-face front" lang="${langAttr(it.o.promptLang)}"><span class="lang">${LANGS[it.o.promptLang]}</span>${esc(it.o.prompt)}</div>
          <div class="flash-face back" lang="${langAttr(it.o.answerLang)}"><span class="lang">${LANGS[it.o.answerLang]}</span>${esc(it.o.answer)}</div>
        </div></div>
        <div class="flash-controls">
          <button id="prev" ${i === 0 ? 'disabled' : ''}>←</button>
          <button id="learning">✗ Still learning <kbd>1</kbd></button>
          <span class="muted">${i + 1} / ${items.length}</span>
          <button id="know">✓ Know it <kbd>2</kbd></button>
          <button id="next">→</button>
          <button class="ghost star ${it.card.starred ? 'on' : ''}" id="star" title="Star (S)">★</button>
        </div>
        <p class="muted small" style="text-align:center"><kbd>Space</kbd> flip · <kbd>←</kbd><kbd>→</kbd> move · <kbd>1</kbd>/<kbd>2</kbd> sort · <kbd>S</kbd> star</p>`;
      bindOptions(() => renderFlash(ids));
      $('#card').onclick = flip;
      $('#prev').onclick = () => go(-1); $('#next').onclick = () => go(1);
      $('#know').onclick = () => mark(true); $('#learning').onclick = () => mark(false);
      $('#star').onclick = star;
    }
    function flip() { flipped = !flipped; $('#card').classList.toggle('flipped', flipped); }
    function go(d) { i = Math.max(0, Math.min(items.length, i + d)); flipped = false; draw(); }
    function mark(k) { const c = oriented[i].card; (k ? know : learning).add(c.id); (k ? learning : know).delete(c.id); if (!k) { c.lastWrong = true; save(); } else if (c.lastWrong) { c.lastWrong = false; save(); } go(1); }
    function star() { const c = oriented[i].card; c.starred = !c.starred; save(); $('#star').classList.toggle('on', c.starred); }
    const onKey = e => {
      if (e.target.matches('input, textarea, select') || i >= items.length) return;
      if (e.key === ' ') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === '1') mark(false);
      else if (e.key === '2') mark(true);
      else if (e.key.toLowerCase() === 's') star();
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => document.removeEventListener('keydown', onKey);
    draw();
  }

  // ---------------------------------------------------------------- write (learn until all correct)
  function renderWrite(ids) {
    let queue = sessionItems(ids).map(it => ({ ...it, o: orient(it.set, it.card, db.settings.answerLang) }));
    const total = queue.length;
    let idx = 0, round = 1, missed = [], firstTryRight = 0, phase = 'ask', last = null, timer = null;
    const mastered = new Set();

    function draw() {
      clearTimeout(timer);
      const head = studyHeader(ids, 'write') + optionsHtml({ checking: true, advance: true });
      if (!total) { app.innerHTML = head + noCardsHtml(); bind(); return; }
      if (idx >= queue.length) return roundEnd(head);
      const it = queue[idx];
      app.innerHTML = head + `
        <div class="row small muted"><span>Round ${round}</span><div class="spacer"></div><span>${mastered.size} / ${total} learned</span></div>
        <div class="progress"><div style="width:${(mastered.size / total) * 100}%"></div></div>
        <div class="panel">
          <div class="prompt" lang="${langAttr(it.o.promptLang)}"><span class="lang">${LANGS[it.o.promptLang]} → type the ${LANGS[it.o.answerLang]}</span>${esc(it.o.prompt)}</div>
          <form id="f" autocomplete="off"><input class="answer-input" type="text" id="ans" lang="${langAttr(it.o.answerLang)}" placeholder="Type the ${LANGS[it.o.answerLang]} answer…" ${phase !== 'ask' ? 'disabled' : ''} value="${phase !== 'ask' ? esc(last.typed) : ''}" autocapitalize="off" spellcheck="false"></form>
          <div class="row" style="margin-top:10px">${phase === 'ask' ? `<button class="primary" id="submit">Check <kbd>Enter</kbd></button><button id="dunno">Don't know</button>` : ''}
            <div class="spacer"></div><button class="ghost star ${it.card.starred ? 'on' : ''}" id="star" title="Star">★</button></div>
          <div id="fb">${phase === 'feedback' ? feedbackHtml(last, it) : ''}</div>
        </div>`;
      bind();
      if (phase === 'ask') $('#ans').focus();
      if (phase === 'feedback') {
        $('#continue')?.focus();
        if (last.r.status === 'correct' && db.settings.autoAdvance && !last.overridden) timer = setTimeout(next, 900);
      }
    }
    function feedbackHtml(l, it) {
      const r = l.r, alts = r.alternatives;
      const titles = { correct: l.overridden ? 'Marked correct' : 'Correct!', almost: 'Almost!', wrong: 'Not quite', empty: "Here's the answer" };
      const other = alts.length > 1 ? `<div class="small muted">Accepted answers: ${alts.map(esc).join(' · ')}</div>` : '';
      return `<div class="feedback ${r.status}">
        <div class="title">${titles[r.status]}</div>
        ${r.note ? `<div>${esc(r.note)}</div>` : ''}
        <div class="body">
          ${r.status !== 'correct' && l.typed ? `<div class="small muted">You wrote</div><div class="answer">${r.status === 'almost' ? diffHtml(l.typed, pickDisplay(alts, r.matched)) : esc(l.typed)}</div>` : ''}
          <div class="small muted" style="margin-top:6px">Answer</div><div class="answer" lang="${langAttr(it.o.answerLang)}">${esc(it.o.answer)}</div>
          ${other}
        </div>
        <div class="row" style="margin-top:12px">
          <button class="primary" id="continue">Continue <kbd>Enter</kbd></button>
          ${r.status !== 'correct' && l.typed ? '<button id="override">I was right <kbd>O</kbd></button>' : ''}
          <button id="editcard">Edit card <kbd>E</kbd></button>
        </div>
        <div id="editbox"></div>
      </div>`;
    }
    function bind() {
      bindOptions(() => renderWrite(ids), ['ignoreTones', 'typoTolerance', 'optionalClassifiers', 'autoAdvance']);
      const f = $('#f'); if (f) f.onsubmit = e => { e.preventDefault(); if (phase === 'ask') submit($('#ans').value); };
      $('#submit') && ($('#submit').onclick = () => submit($('#ans').value));
      $('#dunno') && ($('#dunno').onclick = () => submit(''));
      $('#continue') && ($('#continue').onclick = next);
      $('#override') && ($('#override').onclick = override);
      $('#editcard') && ($('#editcard').onclick = editCard);
      $('#star') && ($('#star').onclick = () => { const c = queue[idx].card; c.starred = !c.starred; save(); $('#star').classList.toggle('on', c.starred); });
    }
    function submit(typed) {
      const it = queue[idx];
      const r = M.check(typed, it.o.answer, matchOpts(it.o.answerLang));
      last = { typed, r, overridden: false };
      const ok = r.status === 'correct';
      record(it.card, ok);
      if (ok) { mastered.add(it.card.id); if (round === 1) firstTryRight++; } else missed.push(it);
      phase = 'feedback'; draw();
    }
    function override() {
      const it = queue[idx];
      it.card.wrong = Math.max(0, it.card.wrong - 1); record(it.card, true);
      missed = missed.filter(x => x !== it); mastered.add(it.card.id); if (round === 1) firstTryRight++;
      last.r = Object.assign({}, last.r, { status: 'correct', note: '' }); last.overridden = true; draw();
    }
    function editCard() {
      clearTimeout(timer);
      const it = queue[idx], box = $('#editbox');
      box.innerHTML = `<div class="edit-inline"><textarea id="ef" lang="${langAttr(it.set.frontLang)}">${esc(it.card.front)}</textarea><textarea id="eb" lang="${langAttr(it.set.backLang)}">${esc(it.card.back)}</textarea>
        <div class="row"><button class="primary" id="esave">Save &amp; re-check</button><span class="muted small">Fixes the card everywhere.</span></div></div>`;
      $('#ef').focus();
      $('#esave').onclick = () => {
        it.card.front = $('#ef').value; it.card.back = $('#eb').value; touch(it.set);
        // re-orient with the same direction and re-check the typed answer
        const answerSide = it.o.answerLang === it.set.backLang ? 'back' : 'front';
        it.o = { ...it.o, prompt: it.card[answerSide === 'back' ? 'front' : 'back'], answer: it.card[answerSide] };
        const wasOk = last.r.status === 'correct';
        const r = M.check(last.typed, it.o.answer, matchOpts(it.o.answerLang));
        if (r.status === 'correct' && !wasOk) { it.card.wrong = Math.max(0, it.card.wrong - 1); record(it.card, true); missed = missed.filter(x => x !== it); mastered.add(it.card.id); if (round === 1) firstTryRight++; }
        last.r = r; toast('Card saved'); draw();
      };
    }
    function next() {
      clearTimeout(timer);
      if (phase !== 'feedback') return;
      phase = 'ask'; idx++; draw();
    }
    function roundEnd(head) {
      if (!missed.length) {
        app.innerHTML = head + `<div class="panel empty-state"><h2>🎉 All ${total} learned!</h2>
          <p>${firstTryRight} / ${total} right on the first try (${Math.round(firstTryRight / total * 100)}%).</p>
          <div class="row" style="justify-content:center"><button class="primary" id="again">Go again</button><a class="btn" href="${studyLink('test', ids)}">Take a test →</a></div></div>`;
        bind(); $('#again').onclick = () => renderWrite(ids); return;
      }
      app.innerHTML = head + `<div class="panel empty-state"><h2>Round ${round} done</h2>
        <p>${mastered.size} / ${total} learned. ${missed.length} to go — let's review them.</p>
        <div style="text-align:left;max-width:520px;margin:0 auto 16px">${missed.map(m => `<div class="hit" style="padding:4px 0;border-bottom:1px solid var(--line)">${esc(m.o.prompt)} → <b>${esc(m.o.answer)}</b></div>`).join('')}</div>
        <button class="primary" id="go">Continue <kbd>Enter</kbd></button></div>`;
      bind();
      $('#go').onclick = startRound; $('#go').focus();
    }
    function startRound() { queue = shuffle(missed); missed = []; idx = 0; round++; phase = 'ask'; draw(); }
    const onKey = e => {
      if (phase !== 'feedback' || e.target.matches('textarea, input[type=text]:not([disabled]), select')) return;
      if (e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key.toLowerCase() === 'o' && $('#override')) override();
      else if (e.key.toLowerCase() === 'e') { e.preventDefault(); editCard(); }
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => { document.removeEventListener('keydown', onKey); clearTimeout(timer); };
    draw();
  }
  // Show the alternative that best matched for the diff (fallback: full answer).
  function pickDisplay(alts, matchedClean) {
    for (const a of alts) if (M.acceptedForms(a).includes(matchedClean)) return a;
    return alts.join(', ');
  }

  // ---------------------------------------------------------------- test
  function renderTest(ids) {
    const pool = sessionItems(ids);
    const s = db.settings;
    const cfg = Object.assign({ count: Math.min(20, pool.length), written: true, mc: false, tf: false }, s.testCfg || {});
    cfg.count = Math.min(cfg.count || 20, pool.length) || pool.length;
    const head = studyHeader(ids, 'test');
    if (!pool.length) { app.innerHTML = head + optionsHtml({ checking: true }) + noCardsHtml(); bindOptions(() => renderTest(ids)); return; }
    app.innerHTML = head + optionsHtml({ checking: true }) + `
      <div class="panel stack" style="margin-top:14px"><h2 style="margin:0">Set up your test</h2>
        <label>Questions <input type="number" id="count" min="1" max="${pool.length}" value="${cfg.count}" style="width:90px"> <span class="muted">of ${pool.length}</span></label>
        <div class="row"><label class="check"><input type="checkbox" id="t-written" ${cfg.written ? 'checked' : ''}> Written</label>
          <label class="check"><input type="checkbox" id="t-mc" ${cfg.mc ? 'checked' : ''}> Multiple choice</label>
          <label class="check"><input type="checkbox" id="t-tf" ${cfg.tf ? 'checked' : ''}> True / False</label></div>
        <div><button class="primary" id="start">Start test</button></div></div>`;
    bindOptions(() => renderTest(ids));
    $('#start').onclick = () => {
      const c = { count: Math.max(1, Math.min(pool.length, +$('#count').value || 1)), written: $('#t-written').checked, mc: $('#t-mc').checked, tf: $('#t-tf').checked };
      if (!c.written && !c.mc && !c.tf) c.written = true;
      s.testCfg = c; save();
      runTest(ids, pool.slice(0, c.count), c, pool);
    };
  }
  function runTest(ids, items, cfg, pool) {
    const types = ['written', 'mc', 'tf'].filter(t => cfg[t]);
    const questions = items.map((it, n) => {
      const o = orient(it.set, it.card, db.settings.answerLang);
      // distractors: other cards' answers in the same language
      const others = shuffle(pool.filter(x => x.card.id !== it.card.id).map(x => orient(x.set, x.card, o.answerLang)).filter(x => x.answerLang === o.answerLang && M.clean(x.answer) !== M.clean(o.answer)).map(x => x.answer));
      const uniq = Array.from(new Set(others));
      let type = types[n % types.length];
      if (type === 'mc' && uniq.length < 3) type = uniq.length >= 1 ? 'tf' : 'written';
      if (type === 'tf' && !uniq.length) type = 'written';
      const q = { it, o, type, user: null };
      if (type === 'mc') q.choices = shuffle([o.answer, ...uniq.slice(0, 3)]);
      if (type === 'tf') { q.truth = Math.random() < 0.5; q.shown = q.truth ? o.answer : uniq[0]; }
      return q;
    });
    const ordered = shuffle(questions).sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type));
    let graded = false;

    function qHtml(q, n) {
      const res = graded ? q.result : null;
      const cls = res ? (res.status === 'correct' ? 'correct' : 'wrong') : '';
      let body = '';
      if (q.type === 'written') {
        body = `<input type="text" class="answer-input" data-q="${n}" lang="${langAttr(q.o.answerLang)}" placeholder="Type the ${LANGS[q.o.answerLang]} answer…" value="${esc(q.user || '')}" ${graded ? 'disabled' : ''} autocomplete="off" autocapitalize="off" spellcheck="false">`;
        if (res) body += `<div class="feedback ${res.status}"><div class="title">${res.status === 'correct' ? (q.overridden ? 'Marked correct' : 'Correct') : res.status === 'almost' ? 'Almost' : res.status === 'empty' ? 'Skipped' : 'Incorrect'}</div>
          ${res.note ? `<div>${esc(res.note)}</div>` : ''}
          <div class="body">${res.status === 'almost' ? `<div class="small muted">You wrote</div><div class="answer">${diffHtml(q.user, pickDisplay(res.alternatives, res.matched))}</div>` : ''}
          <div class="small muted">Answer</div><div class="answer">${esc(q.o.answer)}</div></div>
          ${res.status !== 'correct' && q.user ? `<button data-override="${n}" style="margin-top:8px">I was right</button>` : ''}</div>`;
      } else if (q.type === 'mc') {
        body = `<div class="choices">${q.choices.map((c, k) => {
          let st = q.user === k ? 'sel' : '';
          if (graded) st = c === q.o.answer ? 'right' : q.user === k ? 'bad' : '';
          return `<button class="choice ${st}" data-q="${n}" data-c="${k}" ${graded ? 'disabled' : ''} lang="${langAttr(q.o.answerLang)}">${esc(c)}</button>`;
        }).join('')}</div>`;
      } else {
        body = `<div class="qprompt" style="font-size:18px">= <b lang="${langAttr(q.o.answerLang)}">${esc(q.shown)}</b></div>
          <div class="choices">${[true, false].map(v => {
          let st = q.user === v ? 'sel' : '';
          if (graded) st = v === q.truth ? 'right' : q.user === v ? 'bad' : '';
          return `<button class="choice ${st}" data-q="${n}" data-tf="${v}" ${graded ? 'disabled' : ''}>${v ? 'True' : 'False'}</button>`;
        }).join('')}</div>${graded && !q.truth ? `<div class="small muted" style="margin-top:6px">Correct answer: <b>${esc(q.o.answer)}</b></div>` : ''}`;
      }
      const label = { written: 'Written', mc: 'Multiple choice', tf: 'True or false' }[q.type];
      return `<div class="panel q ${cls}" id="q${n}"><div class="qnum">${n + 1} of ${ordered.length} · ${label}</div>
        <div class="qprompt" lang="${langAttr(q.o.promptLang)}">${esc(q.o.prompt)}</div>${body}</div>`;
    }
    function draw() {
      const score = graded ? ordered.filter(q => q.result.status === 'correct').length : 0;
      const wrongQs = graded ? ordered.filter(q => q.result.status !== 'correct') : [];
      app.innerHTML = studyHeader(ids, 'test') + (graded ? `
        <div class="panel row" style="margin-bottom:14px"><div class="score">${Math.round(score / ordered.length * 100)}%</div>
          <div><b>${score} / ${ordered.length} correct</b><div class="muted small">${wrongQs.length ? wrongQs.length + ' to review below' : 'Perfect! 🎉'}</div></div>
          <div class="spacer"></div>${wrongQs.length ? '<button class="primary" id="retake">Retest missed</button>' : ''}<button id="newtest">New test</button></div>` :
        `<p class="muted">Press <kbd>Enter</kbd> in a written answer to jump to the next question.</p>`) +
        ordered.map(qHtml).join('') +
        (graded ? '' : `<div class="row" style="margin-top:16px"><button class="primary" id="submit">Submit test</button><span class="muted small" id="left"></span></div>`);
      bindTest();
      if (!graded) $('input[data-q]')?.focus();
    }
    function bindTest() {
      $$('input[data-q]').forEach(inp => {
        inp.oninput = () => { ordered[+inp.dataset.q].user = inp.value; };
        inp.onkeydown = e => {
          if (e.key !== 'Enter') return; e.preventDefault();
          const all = $$('input[data-q]'), k = all.indexOf(inp);
          if (k < all.length - 1) all[k + 1].focus(); else $('#submit')?.focus();
        };
      });
      $$('button[data-c]').forEach(b => b.onclick = () => { ordered[+b.dataset.q].user = +b.dataset.c; refreshQ(+b.dataset.q); });
      $$('button[data-tf]').forEach(b => b.onclick = () => { ordered[+b.dataset.q].user = b.dataset.tf === 'true'; refreshQ(+b.dataset.q); });
      $$('button[data-override]').forEach(b => b.onclick = () => {
        const q = ordered[+b.dataset.override]; q.overridden = true;
        q.result = Object.assign({}, q.result, { status: 'correct', note: '' });
        q.it.card.wrong = Math.max(0, q.it.card.wrong - 1); record(q.it.card, true); draw();
      });
      $('#submit') && ($('#submit').onclick = grade);
      $('#retake') && ($('#retake').onclick = () => runTest(ids, ordered.filter(q => q.result.status !== 'correct').map(q => q.it), cfg, pool));
      $('#newtest') && ($('#newtest').onclick = () => renderTest(ids));
    }
    function refreshQ(n) {
      const el = $('#q' + n); el.outerHTML = qHtml(ordered[n], n); bindTest();
    }
    function grade() {
      const blank = ordered.filter(q => q.user === null || q.user === '').length;
      if (blank && !confirm(`${blank} question(s) unanswered. Submit anyway?`)) return;
      for (const q of ordered) {
        if (q.type === 'written') q.result = M.check(q.user || '', q.o.answer, matchOpts(q.o.answerLang));
        else if (q.type === 'mc') q.result = { status: q.user !== null && q.choices[q.user] === q.o.answer ? 'correct' : 'wrong' };
        else q.result = { status: q.user === q.truth ? 'correct' : 'wrong' };
        record(q.it.card, q.result.status === 'correct');
      }
      graded = true; draw(); window.scrollTo(0, 0);
    }
    draw();
  }

  route();
})();
