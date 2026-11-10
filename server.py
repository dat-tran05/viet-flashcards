#!/usr/bin/env python3
"""Local server for Thẻ Học. Python 3 standard library only, no installs.

    python3 server.py            # serves http://127.0.0.1:8765 and opens your browser
    python3 server.py --port 9000 --no-open

Your data is plain JSON files:
    data/sets/<set-id>.json   one file per set (cards + right/wrong stats)
    data/settings.json        study settings

Edits made in the app are written back to these files (atomically). You can also
edit, add or delete the JSON files by hand — reload the page to pick them up.
Only listens on 127.0.0.1, so nothing is exposed to your network.
"""
import argparse
import json
import os
import re
import sys
import tempfile
import threading
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, 'data')
SETS = os.path.join(DATA, 'sets')
SETTINGS = os.path.join(DATA, 'settings.json')
ID_RE = re.compile(r'^[A-Za-z0-9_-]{1,80}$')
MAX_BODY = 5 * 1024 * 1024
LOCK = threading.Lock()


def write_json(path, obj):
    """Write atomically so a crash never leaves a half-written file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as fh:
            json.dump(obj, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def read_sets():
    sets, errors = [], []
    if not os.path.isdir(SETS):
        return sets, errors
    for name in sorted(os.listdir(SETS)):
        if not name.endswith('.json'):
            continue
        try:
            with open(os.path.join(SETS, name), encoding='utf-8') as fh:
                s = json.load(fh)
            s['id'] = name[:-5]  # the file name is the id
            s.setdefault('name', s['id'])
            s.setdefault('cards', [])
            sets.append(s)
        except (OSError, ValueError) as e:
            errors.append(f'{name}: {e}')
    return sets, errors


def valid_set(obj):
    return (isinstance(obj, dict) and isinstance(obj.get('name'), str)
            and isinstance(obj.get('cards'), list)
            and all(isinstance(c, dict) and isinstance(c.get('front', ''), str) and isinstance(c.get('back', ''), str)
                    for c in obj['cards']))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):  # quieter: only log API writes and errors
        if self.command != 'GET' or (len(args) > 1 and str(args[1])[0] in '45'):
            sys.stderr.write('%s %s\n' % (self.command, fmt % args))

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, obj, status=HTTPStatus.OK):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_BODY:
            raise ValueError('body too large')
        return json.loads(self.rfile.read(n).decode('utf-8') or 'null')

    def same_origin(self):
        # Block other websites from writing to your files via your browser.
        origin = self.headers.get('Origin')
        host = self.headers.get('Host', '')
        return origin is None or origin in (f'http://{host}',)

    def api_target(self):
        path = self.path.split('?', 1)[0]
        if path == '/api/sets':
            return 'sets', None
        if path == '/api/settings':
            return 'settings', None
        m = re.match(r'^/api/sets/([^/]+)$', path)
        if m and ID_RE.match(m.group(1)):
            return 'set', m.group(1)
        return None, None

    def do_GET(self):
        kind, _ = self.api_target()
        if kind == 'sets':
            with LOCK:
                sets, errors = read_sets()
            return self.send_json({'sets': sets, 'errors': errors})
        if kind == 'settings':
            try:
                with open(SETTINGS, encoding='utf-8') as fh:
                    return self.send_json(json.load(fh))
            except (OSError, ValueError):
                return self.send_json({})
        if self.path.startswith('/api/'):
            return self.send_json({'error': 'not found'}, HTTPStatus.NOT_FOUND)
        return super().do_GET()

    def do_PUT(self):
        if not self.same_origin():
            return self.send_json({'error': 'forbidden'}, HTTPStatus.FORBIDDEN)
        kind, sid = self.api_target()
        try:
            body = self.read_body()
        except (ValueError, UnicodeDecodeError) as e:
            return self.send_json({'error': f'bad json: {e}'}, HTTPStatus.BAD_REQUEST)
        if kind == 'set':
            if not valid_set(body):
                return self.send_json({'error': 'invalid set'}, HTTPStatus.BAD_REQUEST)
            body = dict(body, id=sid)
            with LOCK:
                write_json(os.path.join(SETS, sid + '.json'), body)
            return self.send_json({'ok': True})
        if kind == 'settings' and isinstance(body, dict):
            with LOCK:
                write_json(SETTINGS, body)
            return self.send_json({'ok': True})
        return self.send_json({'error': 'not found'}, HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        if not self.same_origin():
            return self.send_json({'error': 'forbidden'}, HTTPStatus.FORBIDDEN)
        kind, sid = self.api_target()
        if kind != 'set':
            return self.send_json({'error': 'not found'}, HTTPStatus.NOT_FOUND)
        path = os.path.join(SETS, sid + '.json')
        with LOCK:
            if os.path.exists(path):
                # keep a copy instead of destroying data
                trash = os.path.join(DATA, 'deleted')
                os.makedirs(trash, exist_ok=True)
                os.replace(path, os.path.join(trash, sid + '.json'))
        return self.send_json({'ok': True})


def main():
    ap = argparse.ArgumentParser(description='Serve Thẻ Học locally with JSON file storage.')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--no-open', action='store_true', help="don't open a browser")
    args = ap.parse_args()
    os.makedirs(SETS, exist_ok=True)
    srv = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    url = f'http://127.0.0.1:{args.port}/'
    n = len(read_sets()[0])
    print(f'Thẻ Học running at {url}  ({n} sets in {os.path.relpath(SETS)})  — Ctrl+C to stop')
    if not args.no_open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nbye')


if __name__ == '__main__':
    main()
