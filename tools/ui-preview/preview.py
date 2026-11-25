"""Local mock display preview. Serve firmware pixels or export native-size review sheets."""
import argparse
import io
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
STATES = ['Offline', 'Idle', 'Thinking', 'Generating', 'Working', 'Permission',
          'Input needed', 'Success', 'Error', 'Compacting', 'Retrying', 'Interrupted']
SCREENS = ['Buddy', 'Session', 'Tokens', 'Tools', 'MCP Radar', 'System']


def frame(screen, state, profile=0, quiet=0, time=960, age=960, previous=1, page_age=960):
    args = [screen, state, profile, quiet, time, age, previous, page_age]
    pixels = subprocess.check_output([HERE / '.build/preview', *map(str, args)])
    return Image.open(io.BytesIO(pixels)).convert('RGB')


def sheets():
    destination = HERE.parents[1] / 'docs/design/previews'
    for name, labels, columns in [('expressions', STATES, 4), ('screens', SCREENS, 3)]:
        sheet = Image.new('RGB', (columns * 260, len(labels)//columns * 274), '#10151e')
        pen = ImageDraw.Draw(sheet)
        for i, label in enumerate(labels):
            x, y = i % columns * 260, i // columns * 274
            pixels = frame(0, i) if name == 'expressions' else frame(i, 2)
            mask = Image.new('L', pixels.size)
            ImageDraw.Draw(mask).ellipse((0, 0, 239, 239), fill=255)
            sheet.paste(pixels, (x+10, y+6), mask)
            pen.text((x+130, y+258), label, fill='#cad3df', anchor='mm')
        sheet.save(destination / (name + '.png'))


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/':
            body = (HERE / 'index.html').read_bytes()
            kind = 'text/html; charset=utf-8'
        elif url.path == '/frame':
            try:
                values = list(map(int, parse_qs(url.query)['v'][0].split(',')))
                limits = (5, 11, 3, 1, 2**30, 2**30, 11, 2**30)
                if len(values) != 8 or any(v < 0 or v > n for v, n in zip(values, limits)):
                    raise ValueError()
                output = io.BytesIO()
                frame(*values).save(output, 'PNG', compress_level=1)
                body, kind = output.getvalue(), 'image/png'
            except (KeyError, ValueError):
                self.send_error(400)
                return
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # Tab closed before its frame arrived.

    def log_message(self, fmt, *args):
        if args[1] != '200':
            super().log_message(fmt, *args)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sheets', action='store_true')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    subprocess.run(['make', '-s', '-j4'], cwd=HERE, check=True)
    if args.sheets:
        sheets()
    else:
        with HTTPServer(('127.0.0.1', args.port), Handler) as server:
            print(f'MOCK display preview · http://127.0.0.1:{server.server_port}/', flush=True)
            server.serve_forever()
