// Run: node tests/matcher.test.js
const assert = require('assert');
const M = require('../matcher.js');

let pass = 0, fail = 0;
function t(user, expected, status, opts, label) {
  const r = M.check(user, expected, opts);
  const name = label || `"${user}" vs "${expected}" ${opts ? JSON.stringify(opts) : ''}`;
  try { assert.strictEqual(r.status, status); pass++; }
  catch (e) { fail++; console.log(`FAIL ${name}: expected ${status}, got ${r.status} (${r.note})`); }
}
const en = { lang: 'en' };

// basics
t('xin chào', 'xin chào', 'correct');
t('  Xin   Chào! ', 'xin chào', 'correct', null, 'case, spaces, punctuation');
t('', 'xin chào', 'empty');
t('tạm biệt', 'xin chào', 'wrong');

// unicode: decomposed (macOS) vs composed input
t('xin chào'.normalize('NFD'), 'xin chào', 'correct', null, 'NFD vs NFC');
t('khỏe', 'khoẻ'.normalize('NFD'), 'correct', null, 'NFD expected');

// tone placement (old vs new style)
t('hòa bình', 'hoà bình', 'correct');
t('thuý', 'thúy', 'correct');
t('khoẽ', 'khỏe', 'almost', null, 'wrong tone still caught');
t('hoa', 'hoà', 'almost');

// alternatives: comma, semicolon, slash, pipe, newline
t('chào', 'xin chào, chào', 'correct');
t('xin chào', 'xin chào, chào', 'correct');
t('xin chào, chào', 'xin chào, chào', 'correct', null, 'typed full answer');
t('chào, xin chào', 'xin chào, chào', 'correct', null, 'typed both, other order');
t('chào, tạm biệt', 'xin chào, chào', 'wrong', null, 'one of typed parts wrong');
t('vâng', 'vâng; dạ', 'correct');
t('dạ', 'vâng / dạ', 'correct');
t('dạ', 'vâng | dạ', 'correct');
t('dạ', 'vâng\ndạ', 'correct');
t('hi', 'hello, hi', 'correct', en);

// parentheses optional
t('eat', '(to) eat', 'correct', en);
t('to eat', '(to) eat', 'correct', en);
t('xe', 'xe (hơi)', 'correct');
t('xe hơi', 'xe (hơi)', 'correct');
t('anh khỏe không', '(anh/chị) khỏe không', 'correct');
t('chị khỏe không', '(anh/chị) khỏe không', 'correct');
t('khỏe không', '(anh/chị) khỏe không', 'correct');
t('bạn', 'bạn (friend, you)', 'correct', null, 'commas inside parens do not split');
t('friend', 'bạn (friend, you)', 'wrong', null, 'paren contents alone are not an answer');

// [notes] ignored
t('ăn', 'ăn [informal]', 'correct');

// English: leading to / a / an / the optional
t('eat', 'to eat', 'correct', en);
t('to eat', 'eat', 'correct', en);
t('apple', 'an apple', 'correct', en);
t('the teacher', 'teacher', 'correct', en);
t('dont know', "don't know", 'correct', en, 'apostrophes');
t('don’t know', "don't know", 'correct', en, 'curly apostrophe');
t('email', 'e-mail', 'correct', en, 'hyphen');

// Vietnamese "to" (= big) is not stripped
t('lớn', 'to lớn', 'wrong', { lang: 'vi' });

// tone marks
t('ma', 'má', 'almost');
t('ma', 'má', 'correct', { ignoreTones: true });
t('di', 'đi', 'almost', null, 'đ vs d');
t('xin chao', 'xin chào', 'almost');
t('xin chao', 'xin chào', 'correct', { ignoreTones: true });

// typos
t('beautifull', 'beautiful', 'almost', en);
t('beautifull', 'beautiful', 'correct', { lang: 'en', typoTolerance: true });
t('cat', 'car', 'wrong', { lang: 'en', typoTolerance: true }, 'short words need exact');

// spacing
t('xinchào', 'xin chào', 'correct', null, 'missing space');

// ellipsis patterns
t('vừa...vừa', 'vừa ... vừa ...', 'correct');

// classifiers
t('mèo', 'con mèo', 'wrong');
t('mèo', 'con mèo', 'correct', { optionalClassifiers: true });
t('con mèo', 'mèo', 'correct', { optionalClassifiers: true });

// odd whitespace / zero-width
t('xin chào​', 'xin chào', 'correct', null, 'nbsp + zero-width');

// ---- edge cases from the real 140A sets ----
t('trầm cảm', 'trầm cảm (a) - chầm kẽm (lóng)', 'correct', null, 'standard word of " - " pair');
t('chầm kẽm', 'trầm cảm (a) - chầm kẽm (lóng)', 'correct', null, 'slang word of " - " pair');
t('bà láp bà xàm', 'vớ vẩn - bà láp bà xàm (lóng)', 'correct');
t('quê', 'xấu hổ (a) - quê (lóng)', 'correct');
t('đẹp trai', 'điển trai (n) = đẹp trai', 'correct', null, '" = " pair');
t('điển trai', 'điển trai (n) = đẹp trai', 'correct');
t('hoàn thành', 'hoàn thiện = hoàn thành', 'correct');
t('kỳ vọng', 'kỳ vọng (v)\nkỳ vọng (n)', 'correct', null, 'multi-line + POS');
t('kì vọng', 'kỳ vọng (v)', 'correct', null, 'i/y variant');
t('lí do', 'lý do', 'correct');
t('tui', 'tuy', 'wrong', null, 'tuy != tui');
t('kỳ vọng (n)', 'kỳ vọng (v)\nkỳ vọng (n)', 'correct', null, 'typed with POS');
t('địa phương', 'địa phương (a/n)', 'correct');
t('thiết kế', 'thiết kế (verb/noun)', 'correct');
t('ở đâu đó', 'ở đâu đó (phrase)', 'correct');
t('dù là', 'Dù là...', 'correct');
t('hay không bằng hên', '"hay không bằng hên"', 'correct', null, 'quotes');
t('minh họa', 'minh hoạ (v/n)', 'correct', null, 'hoạ vs họa');
t('thoả hiệp', 'thỏa hiệp', 'correct');
t('tận tụy', 'tận tâm / tận tuỵ', 'correct');
t('ngôn ngữ mẹ đẻ', 'tiếng mẹ đẻ (n)\nngôn ngữ mẹ đẻ (n)', 'correct');
t('kế sinh nhai', 'sinh kế / kế sinh nhai', 'correct');
t('màn trình diễn', 'tiết mục / màn biểu diễn / màn trình diễn', 'correct');
t('chuẩn mực', 'các chuẩn mực', 'correct', { optionalClassifiers: true });
t('chuẩn mực', 'các chuẩn mực', 'wrong');
t('tham gia', 'tham gia', 'correct');
t('khong truc tiep', 'không trực tiếp', 'almost');
t('to collaborate', 'to cooperate, collaborate', 'correct', en);
t('mandatory', 'to be forced/ mandatory/ compulsory', 'correct', en);
t('to inject a fresh perspective', 'to inject a fresh perspective (lit. blow a fresh brezze)', 'correct', en);
t('expectation', '(v) to expect\n(N) expectation', 'correct', en);
t('purity of Vietnamese language', 'the purity of Vietnamese language', 'correct', en);
t('e-mail', 'e mail - thư', 'correct', en, 'in-word hyphen is not a separator');

// helpers
assert.deepStrictEqual(M.splitTopLevel('a, b (c, d); e'), ['a', 'b (c, d)', 'e']); pass++;
assert.ok(M.looksVietnamese('cảm ơn')); assert.ok(!M.looksVietnamese('thank you')); pass++;

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
