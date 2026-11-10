"""Extract cards from Quizlet "print to PDF" pages.

Usage:
  pip install pdfplumber
  python3 tools/quizlet_pdf_extract.py set1.pdf set2.pdf ... out.txt

Writes a text file in the app's import format (# Section, then English<TAB>Vietnamese).
Load it in the app via Import -> "Load .txt file". Each card is oriented so the
English side is the front and the Vietnamese side is the back.
"""
import pdfplumber, sys, re, json, logging
logging.disable(logging.WARNING)
VI = re.compile(r'[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]', re.I)
SPLIT_X = 250

def join_lines(lines):
    out = ''
    for ln in lines:
        if not out: out = ln; continue
        if re.search(r'\([^)]*\)\s*$', out) or ln.startswith('('):
            out += '\n' + ln
        else:
            out += ' ' + ln
    out = re.sub(r'\s+/', ' /', re.sub(r'/(?=\S)', '/ ', out)).replace(' ,', ',')
    out = re.sub(r'\(([^()]*)\)', lambda m: '(' + m.group(1).replace('/ ', '/').replace(' /', '/') + ')', out)
    return out.strip()

def extract(path):
    words_all = []; title = None; started = False; yoff = 0
    with pdfplumber.open(path) as pdf:
        for p in pdf.pages:
            ws = p.extract_words(x_tolerance=1.5)
            if title is None:
                title = ' '.join(w['text'] for w in ws if w['top'] < 25)
            for w in sorted(ws, key=lambda w: (w['top'], w['x0'])):
                if not started:
                    if w['text'] == 'Terms' and w['x0'] < 40: started = True; hdr = w['top']
                    continue
                if w['top'] < 30 or w['top'] > 760: continue
                if 'hdr' in dir() and hdr is not None and w['top'] <= hdr + 2: continue
                if w['text'] in ("Don't", 'know?'): continue
                words_all.append(dict(w, y=w['top'] + yoff))
            hdr = None
            yoff += 1000
    # cluster into cards by vertical gap
    words_all.sort(key=lambda w: w['y'])
    cards = []; last = None
    for w in words_all:
        if last is None or w['y'] - last > 24: cards.append([])
        cards[-1].append(w); last = w['y']
    result = []
    for c in cards:
        sides = []
        for left in (True, False):
            ws = [w for w in c if (w['x0'] < SPLIT_X) == left]
            ws.sort(key=lambda w: w['y'])
            lines = []; ly = None
            for w in ws:
                if ly is None or w['y'] - ly > 7: lines.append([])
                lines[-1].append(w); ly = w['y'] if ly is None or w['y'] - ly > 7 else ly
            sides.append(join_lines([' '.join(x['text'] for x in sorted(l, key=lambda w: w['x0'])) for l in lines]))
        L, R = sides
        if not L or not R: print('WARN incomplete', path, sides, file=sys.stderr)
        # front = English, back = Vietnamese
        lv, rv = len(VI.findall(L)), len(VI.findall(R))
        en, vi = (R, L) if lv >= rv else (L, R)
        result.append({'front': en, 'back': vi})
    title = re.sub(r'^.*?(AM|PM)\s+', '', title)
    title = re.sub(r'\s*Flashcards \| Quizlet$', '', title)
    return title, result

sets = []
for f in sys.argv[1:-1]:
    t, cards = extract(f)
    sets.append({'name': t, 'cards': cards})
out = sys.argv[-1]
if out.endswith('.json'):
    json.dump(sets, open(out, 'w'), ensure_ascii=False, indent=1)
else:
    with open(out, 'w') as fh:
        for s in sets:
            fh.write('# ' + s['name'] + '\n')
            for c in s['cards']:
                # multi-line answers are kept on one line with " / " so each card is one row
                fh.write(c['front'].replace('\n', ' / ') + '\t' + c['back'].replace('\n', ' / ') + '\n')
            fh.write('\n')
for s in sets:
    print(s['name'], '-', len(s['cards']), 'cards')
