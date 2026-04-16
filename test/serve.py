#!/usr/bin/env python3
"""Simple HTTP server with CORS proxy for testing ShotStack templates."""
import http.server
import urllib.request
import urllib.error
import os
import sys

PORT = 8765
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # Extension root (parent of test/)


class CORSProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Add CORS headers to ALL responses
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # Proxy requests to /proxy?url=<encoded_url>
        if self.path.startswith('/proxy?url='):
            self.handle_proxy()
            return
        # Strip query parameters for static file serving (cache-busting ?v=2)
        if '?' in self.path and not self.path.startswith('/proxy'):
            self.path = self.path.split('?')[0]

        # Handle Range requests for video seeking
        range_header = self.headers.get('Range')
        if range_header:
            self.handle_range_request(range_header)
            return

        # Add Accept-Ranges header so browser knows it can seek
        super().do_GET()

    def handle_range_request(self, range_header):
        """Handle HTTP Range requests (required for video seeking in Chrome)."""
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.send_error(404)
            return

        file_size = os.path.getsize(path)
        # Parse "bytes=START-END"
        try:
            range_spec = range_header.replace('bytes=', '')
            parts = range_spec.split('-')
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if parts[1] else file_size - 1
        except (ValueError, IndexError):
            start = 0
            end = file_size - 1

        end = min(end, file_size - 1)
        length = end - start + 1

        self.send_response(206)
        ctype = self.guess_type(path)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', length)
        self.end_headers()

        with open(path, 'rb') as f:
            f.seek(start)
            self.wfile.write(f.read(length))

    def handle_proxy(self):
        from urllib.parse import unquote
        url = unquote(self.path[len('/proxy?url='):])
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                content_type = resp.headers.get('Content-Type', 'application/octet-stream')
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', len(data))
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(f'Proxy error: {e}'.encode())


if __name__ == '__main__':
    os.chdir(ROOT)
    with http.server.HTTPServer(('127.0.0.1', PORT), CORSProxyHandler) as httpd:
        print(f'Serving on http://127.0.0.1:{PORT}/ with CORS proxy at /proxy?url=...')
        httpd.serve_forever()
