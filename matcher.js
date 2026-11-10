/*
 * Answer matcher for Vietnamese <-> English flashcards.
 * Works in the browser (window.Matcher) and in Node (require('./matcher')).
 *
 * See README.md "Answer-checking rules" for the full list of edge cases.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Matcher = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Separators that mean "any ONE of these answers is fine".
  // " - " and " = " (with spaces) also separate alternatives: "trầm cảm - chầm kẽm",
  // "điển trai = đẹp trai". A hyphen inside a word ("e-mail") does not.
  const ALT_SEPARATORS = [',', ';', '/', '|', '\n', '，', '、', '\u0001'];
  const SPACED_SEP_RE = /\s+[-\u2013\u2014=]\s+/g;

  // Vietnamese classifiers that can be dropped (only if the setting is on):
  // "con mèo" accepts "mèo", "cái bàn" accepts "bàn".
  // Plural markers "các" / "những" are treated the same way: "các chuẩn mực" accepts "chuẩn mực".
  const VI_CLASSIFIERS = ['con', 'cái', 'chiếc', 'quả', 'trái', 'cuốn', 'quyển', 'tờ', 'bức', 'ngôi', 'căn', 'tấm', 'các', 'những'];

  const EN_LEADING = ['to', 'a', 'an', 'the'];

  const DEFAULTS = {
    lang: 'vi',                 // language of the expected answer: 'vi' | 'en'
    ignoreTones: false,         // true: "ma" == "má"; false: counts as "almost" (wrong)
    typoTolerance: false,       // true: 1 typo (2 for long answers) counts as correct
    optionalClassifiers: false, // true: "con mèo" accepts "mèo"
  };

  // ---------- normalization ----------

  function baseNormalize(s) {
    return String(s == null ? '' : s)
      .normalize('NFC')
      .toLowerCase()
      .replace(/[​-‍﻿]/g, '')                       // zero-width chars
      .replace(/[  -   　\t]/g, ' ')  // odd spaces
      .replace(/[‘’ʼ`´]/g, "'")                // curly apostrophes
      .replace(/[“”„]/g, '"')
      .replace(/[–—−]/g, '-');
  }

  // Remove punctuation, keep letters (incl. Vietnamese), digits, spaces.
  function clean(s) {
    return baseNormalize(s)
      .replace(/\[[^\]]*\]/g, ' ')         // [notes] are never required
      .replace(/'/g, '')                   // don't == dont
      .replace(/[-_\/\\.]/g, ' ')          // e-mail == e mail, vừa...vừa == vừa vừa
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')  // also drops the \u0001 separator
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ').map(canonTone).join(' ')
      .normalize('NFC');
  }

  // Vietnamese tone marks (combining): grave, acute, tilde, hook above, dot below.
  const TONE_MARKS = /[\u0300\u0301\u0303\u0309\u0323]/gu;
  const TONE_TAGS = { '\u0300': '\uE001', '\u0301': '\uE002', '\u0303': '\uE003', '\u0309': '\uE004', '\u0323': '\uE005' };
  const TONE_TAG_RE = /[\uE001-\uE005]/gu;

  // Tone-mark placement varies ("khỏe" vs "khoẻ", "hòa" vs "hoà", "thúy" vs "thuý").
  // Move the tone off the vowel and append it as a tag at the end of the syllable,
  // so both spellings compare equal while the tone itself still matters.
  function canonTone(word) {
    const d = word.normalize('NFD');
    const tones = d.match(TONE_MARKS);
    let base = d.replace(TONE_MARKS, '').normalize('NFC');
    // i/y spelling variants: kỳ = kì, lý = lí, mỹ = mĩ, quy = qui ("tuy" vs "tui" stays different)
    base = base.replace(/^(qu|[bcdđghklmnprstvx]+)y$/, '$1i');
    return tones ? base + TONE_TAGS[tones[tones.length - 1]] : base;
  }

  // Strip tone marks / diacritics and đ -> d.
  function fold(s) {
    return s.replace(TONE_TAG_RE, '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').normalize('NFC');
  }

  function stripLeading(s, words) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const w of words) {
        if (s.startsWith(w + ' ') && s.length > w.length + 1) {
          s = s.slice(w.length + 1);
          changed = true;
        }
      }
    }
    return s;
  }

  // Language-specific "core" used on BOTH sides, so "to eat" == "eat" either way.
  function core(s, opts) {
    if (opts.lang === 'en') return stripLeading(s, EN_LEADING);
    // classifiers are compared in the same canonical (tone-tagged) form as answers
    if (opts.lang === 'vi' && opts.optionalClassifiers) return stripLeading(s, VI_CLASSIFIERS.map(clean));
    return s;
  }

  // ---------- parsing alternatives ----------

  // Split on separators that are NOT inside (), [] or {}.
  function splitTopLevel(text, seps) {
    seps = seps || ALT_SEPARATORS;
    const parts = [];
    let depth = 0, cur = '';
    for (const ch of String(text).replace(SPACED_SEP_RE, '\u0001')) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
      if (depth === 0 && seps.includes(ch)) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts.map(p => p.trim()).filter(Boolean);
  }

  // "(to) eat (food)" -> ["eat", "to eat", "eat food", "to eat food"]
  // "(anh/chị) khỏe không" -> ["khỏe không", "anh khỏe không", "chị khỏe không"]
  function expandParens(text) {
    const m = /\(([^()]*)\)/.exec(text);
    if (!m) return [text];
    const before = text.slice(0, m.index), after = text.slice(m.index + m[0].length);
    // optional: nothing, the whole inside ("v/n"), or any one alternative inside ("v" or "n")
    const options = Array.from(new Set(['', m[1]].concat(splitTopLevel(m[1]))));
    const out = [];
    for (const opt of options) {
      for (const rest of expandParens(after)) out.push(before + ' ' + opt + ' ' + rest);
      if (out.length > 64) break; // safety cap
    }
    return out;
  }

  // All accepted forms for an expected answer, cleaned.
  function acceptedForms(expected) {
    const alts = new Set();
    const pieces = [expected].concat(splitTopLevel(expected));
    for (const p of pieces) {
      for (const v of expandParens(p)) {
        const c = clean(v);
        if (c) alts.add(c);
      }
    }
    return Array.from(alts);
  }

  // Human-readable list of alternatives (for "also accepted: ...").
  function displayAlternatives(expected) {
    const parts = splitTopLevel(expected);
    return parts.length ? parts : [String(expected).trim()];
  }

  // ---------- distance ----------

  function levenshtein(a, b) {
    a = Array.from(a); b = Array.from(b);
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function allowedTypos(s) {
    const n = Array.from(s.replace(/ /g, '')).length;
    if (n >= 12) return 2;
    if (n >= 5) return 1;
    return 0;
  }

  // ---------- comparison ----------

  // Compare one cleaned user string against one cleaned accepted form.
  // Returns {level, note} where level: 3 exact, 2 tones-only, 1 typo, 0 none.
  function compareOne(user, form, opts) {
    const u = core(user, opts), f = core(form, opts);
    if (u === f || u.replace(/ /g, '') === f.replace(/ /g, '')) return { level: 3 };
    const uf = fold(u), ff = fold(f);
    if (uf === ff || uf.replace(/ /g, '') === ff.replace(/ /g, '')) return { level: 2, note: 'tones' };
    const d = levenshtein(u, f);
    if (d > 0 && d <= allowedTypos(f)) return { level: 1, note: 'typo' };
    const df = levenshtein(uf, ff);
    if (df > 0 && df <= allowedTypos(ff)) return { level: 1, note: 'typo+tones' };
    return { level: 0 };
  }

  function bestMatch(userClean, forms, opts) {
    let best = { level: 0 }, bestForm = null;
    for (const f of forms) {
      const r = compareOne(userClean, f, opts);
      if (r.level > best.level) { best = r; bestForm = f; if (r.level === 3) break; }
    }
    return Object.assign({ form: bestForm }, best);
  }

  function levelToStatus(level, opts) {
    if (level === 3) return 'correct';
    if (level === 2) return opts.ignoreTones ? 'correct' : 'almost';
    if (level === 1) return opts.typoTolerance ? 'correct' : 'almost';
    return 'wrong';
  }

  const NOTES = {
    tones: 'Check your tone marks / diacritics.',
    typo: 'Close — looks like a typo.',
    'typo+tones': 'Close — a typo and the tone marks differ.',
  };

  /**
   * check(userAnswer, expectedAnswer, options) ->
   *   { status: 'correct'|'almost'|'wrong'|'empty', note, matched, alternatives }
   */
  function check(userAnswer, expected, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    const alternatives = displayAlternatives(expected);
    const userClean = clean(userAnswer);
    if (!userClean) return { status: 'empty', note: '', matched: null, alternatives };

    const forms = acceptedForms(expected);
    if (!forms.length) return { status: 'wrong', note: 'This card has no answer.', matched: null, alternatives };

    // 1) whole answer vs any accepted form
    const whole = bestMatch(userClean, forms, opts);
    let level = whole.level, note = whole.note, matched = whole.form;

    // 2) user typed several answers ("chào, xin chào"): every part must be acceptable
    if (level < 3) {
      const userParts = splitTopLevel(userAnswer).map(clean).filter(Boolean);
      if (userParts.length > 1) {
        const results = userParts.map(p => bestMatch(p, forms, opts));
        const worst = results.reduce((a, b) => (b.level < a.level ? b : a));
        if (worst.level > level) { level = worst.level; note = worst.note; matched = results.map(r => r.form).join(', '); }
      }
    }

    const status = levelToStatus(level, opts);
    let msg = '';
    if (note && level < 3) msg = NOTES[note] + (status === 'correct' ? ' (accepted by your settings)' : '');
    return { status, note: msg, matched, alternatives };
  }

  // Character diff for showing what was off: returns [{t:'same'|'add'|'del', s}]
  function diff(user, expected) {
    const a = Array.from(String(user).normalize('NFC')), b = Array.from(String(expected).normalize('NFC'));
    const n = a.length, m = b.length;
    if (n * m > 40000) return [{ t: 'del', s: a.join('') }, { t: 'add', s: b.join('') }];
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = a[i].toLowerCase() === b[j].toLowerCase() ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = [];
    const push = (t, s) => { if (out.length && out[out.length - 1].t === t) out[out.length - 1].s += s; else out.push({ t, s }); };
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i].toLowerCase() === b[j].toLowerCase()) { push('same', b[j]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', a[i]); i++; }
      else { push('add', b[j]); j++; }
    }
    while (i < n) push('del', a[i++]);
    while (j < m) push('add', b[j++]);
    return out;
  }

  // Rough language guess: Vietnamese if it has Vietnamese-specific letters.
  const VI_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  function looksVietnamese(s) { return VI_RE.test(String(s).normalize('NFC')); }

  return { check, clean, fold, acceptedForms, splitTopLevel, expandParens, levenshtein, diff, looksVietnamese, DEFAULTS };
});
