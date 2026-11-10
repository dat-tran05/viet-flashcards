# Thẻ Học — offline Vietnamese ⇄ English flashcards

A small, fast, offline alternative to Quizlet. You can make sets with a front and back for each card, study with flashcards, practise by typing your answers in Vietnamese, take tests, and edit any card whenever you need to.

**No install, no server, no internet.** Open `index.html` in Chrome, Firefox or Safari.

It comes with the 5 sets from **140A — Fall 2026** (112 cards):

| Set | Cards |
| --- | --- |
| Tiếng Việt - Ngôn ngữ kết nối các thế hệ | 20 |
| Việc sử dụng tiếng lóng | 31 |
| Nhạc trẻ ở Việt Nam - Ca sĩ HIEUTHUHAI | 25 |
| Dự án: Chiếc nón kể chuyện | 20 |
| Chương trình truyền hình thực tế (Meeting 9.11.2026) | 16 |

On every card the front is English and the back is Vietnamese. By default you're shown the English and you type the Vietnamese.

## Quick start

```bash
git clone <this repo> ~/code/personal/viet-flashcards
```

```bash
open ~/code/personal/viet-flashcards/index.html
```

On Linux, use `xdg-open` instead of `open`. You can bookmark the page.

## Features

- **Sets**: create, rename, delete (with undo), combine several sets into a new one, and search across all your cards. The search ignores tone marks.
- **Editor**: front and back side by side, with every change saved as you type. Press Tab in the last field to add a new card. You can star cards, swap the front and back of every card, and see right/wrong counts for each card.
- **Flashcards**: click or press Space to flip, ←/→ to move, `1` for still learning and `2` for know it. At the end you can restudy only the cards you were still learning.
- **Write**: you type each answer, Learn-style. Cards you miss come back in later rounds until you get every one right.
  - `Enter` checks your answer and moves on.
  - `O` means "I was right" (it overrides a wrong grade).
  - `E` lets you edit a card in the middle of a quiz. The card is fixed everywhere and your answer is checked again.
- **Test**: choose how many questions and which types: written, multiple choice or true/false. You get a score, can review each question, override written answers you got right, and retest only the ones you missed.
- **Study several sets at once**: tick sets on the home page and pick Flashcards, Write or Test.
- **Filters**: study all cards, only ★ starred cards, or only cards you missed last time.
- **Answer in** Vietnamese, English, or a random mix of both.
- **Import** from Quizlet exports or pasted text (see below). **Backup/Restore** saves everything to a `.json` file and loads it back.

Your data lives in your browser's `localStorage`. Click **⬇ Backup** now and then to keep a copy as a file. If you clear your browser data, delete a built-in set, or open the app in a different browser, **+ Add built-in sets** brings the 140A sets back.

## Answer-checking rules (the edge cases)

The checker is in `matcher.js` and the tests are in `tests/matcher.test.js` (87 cases). To run them:

```bash
node tests/matcher.test.js
```

Most of these cases came from your real cards.

### Alternatives: you only need to get one right

| Card says | You can type |
| --- | --- |
| `xin chào, chào` | `chào` or `xin chào` |
| `vâng; dạ` · `vâng / dạ` · `vâng \| dạ` | either word |
| `trầm cảm (a) - chầm kẽm (lóng)` | `trầm cảm` **or** the slang `chầm kẽm`. A ` - ` with spaces around it separates alternatives. |
| `điển trai (n) = đẹp trai` | `điển trai` or `đẹp trai`. So does ` = `. |
| `tiếng mẹ đẻ (n)` *(new line)* `ngôn ngữ mẹ đẻ (n)` | either line |
| `tiết mục / màn biểu diễn / màn trình diễn` | any one of the three |
| `xin chào, chào` | `chào, xin chào` also works: if you type several answers, each one must be on the list |

A hyphen inside a word (`e-mail`) does **not** separate alternatives. Commas inside parentheses (`bạn (friend, you)`) don't either.

### Optional parts

| Card says | Accepted |
| --- | --- |
| `kỳ vọng (v)`, `địa phương (a/n)`, `ở đâu đó (phrase)`, `thiết kế (verb/noun)`, `quê (lóng)` | without the tag, or with it |
| `xe (hơi)` | `xe` or `xe hơi` |
| `(anh/chị) khỏe không` | `khỏe không`, `anh khỏe không`, `chị khỏe không` |
| `ăn [informal]` | `ăn`. Text in `[brackets]` is a note and is never required. |
| English: `to eat`, `an expert`, `the purity of…` | `eat`, `expert`, `purity of…`, and the other way round |

### Vietnamese spelling and typing

| Situation | Result |
| --- | --- |
| Old vs new tone-mark placement: `hoà`/`hòa`, `khoẻ`/`khỏe`, `thuý`/`thúy`, `minh hoạ`/`minh họa`, `tận tuỵ`/`tận tụy` | ✅ correct, because only *which* tone it is matters, not which vowel carries it |
| i/y variants: `kỳ`/`kì`, `lý`/`lí`, `mỹ`/`mĩ`, `quy`/`qui` | ✅ correct (`tuy` and `tui` are still treated as different words) |
| macOS and some keyboards produce *decomposed* Unicode (`ò` stored as `o` plus a separate accent) | ✅ handled by Unicode normalisation |
| Wrong or missing tones: `ma` for `má`, `di` for `đi`, `xin chao` | 🟡 **Almost**, which counts as wrong. You see what was off, marked letter by letter. Tick *Ignore tone marks* to accept these. |
| Small typo (`beautifull`) | 🟡 Almost. Tick *Allow small typos* to accept 1 typo (2 if the answer is 12+ letters). Answers under 5 letters must be exact. |
| `con mèo` → `mèo`, `các chuẩn mực` → `chuẩn mực` | 🟡 Off by default. Tick *con/cái/các… optional* to accept. |
| `to lớn` → `lớn` | ❌ the English "drop *to*" rule is never applied to Vietnamese |

### Always ignored

Capital letters, extra spaces, punctuation (`?`, `!`, `…`, `"quotes"`), curly vs straight apostrophes (`don’t` = `don't` = `dont`), a missing space (`xinchào`), hyphens (`e-mail` = `email`), and invisible characters such as non-breaking spaces from copy-paste.

### Override

If you think you were right, press **I was right** (`O`). Your stats are corrected. If the card itself is wrong, press **Edit card** (`E`).

## Importing more sets

**From Quizlet**: open the set, then ⋯ → **Export**, keep *Tab* between term and definition and *New line* between rows, copy the text, and paste it into **Import**.

**Pasting your own text**: put one card per line. A line starting with `#` starts a new section, and each section becomes its own set. Between the term and the definition you can use a Tab, ` - `, ` = `, ` : ` or `:`. Any of these will import:

```
# Lesson 6 — Food
(to) eat	ăn
rice - cơm
fish sauce = nước mắm
```

The importer detects which side is Vietnamese. Lines with no separator are skipped and listed so you can fix them.

**From Quizlet PDFs** (the "Print to PDF" pages, like the ones these sets came from):

```bash
pip install pdfplumber
```

```bash
python3 tools/quizlet_pdf_extract.py set1.pdf set2.pdf out.txt
```

Then load `out.txt` with **Import → Load .txt file**. `data/140A-fall-2026.txt` is the same data as the built-in sets, in this format.

## Files

```
index.html     page shell
styles.css     styles (light and dark mode follow your system)
app.js         the app: storage, routing, editor, import, flashcards, write, test
matcher.js     answer checking (works in the browser and in Node)
seed.js        built-in 140A sets
data/          the same sets as a text file you can import
tools/         Quizlet PDF → text extractor
tests/         matcher tests
```

## Typing Vietnamese

Use your computer's built-in Vietnamese keyboard. On macOS: System Settings → Keyboard → Input Sources → add **Vietnamese – Telex**. On Windows: Settings → Time & language → Language → add Vietnamese. Answer boxes have `lang="vi"` set and autocorrect turned off.

## Notes on the source data

The cards are copied exactly from the Quizlet sets, including two English typos: `despressed` (in *Việc sử dụng tiếng lóng*) and `brezze` (in *Dự án: Chiếc nón kể chuyện*). Typos on the English side only matter when you answer in English, and you can fix them in the editor.

## Ideas for later

- A built-in Telex input method, for computers without a Vietnamese keyboard
- Spaced repetition: show cards you often miss more often
- Audio using the browser's Vietnamese text-to-speech (`speechSynthesis`)
