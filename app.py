# -*- coding: utf-8 -*-
"""
비품 신청·재고 관리 앱 - 서버 프로그램

실행 방법:  python app.py
접속 주소:  http://localhost:8000

[지금 단계(step-0)의 특징]
- 이 서버는 static 폴더의 화면 파일(HTML/CSS/JS)을 브라우저에 보내 주기만 합니다.
- 데이터는 브라우저의 자바스크립트 변수에만 들어 있습니다.
  그래서 브라우저를 새로고침하면 등록한 신청이 사라지고 기본 데이터 25건만 다시 보입니다.
- 파이썬 기본 기능(표준 라이브러리)만 사용합니다. 따로 설치할 것이 없습니다.
"""

import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# 서버 주소와 포트 번호
HOST = "127.0.0.1"
PORT = 8000

# 화면 파일(HTML/CSS/JS)이 들어 있는 폴더 위치
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")


class AppHandler(SimpleHTTPRequestHandler):
    """브라우저의 요청을 받아 static 폴더의 파일을 돌려주는 담당자"""

    # 파일 종류별로 브라우저에 알려 줄 형식 (한글이 깨지지 않도록 utf-8 지정)
    extensions_map = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".otf": "font/otf",
        "": "application/octet-stream",
    }

    def __init__(self, *args, **kwargs):
        # static 폴더를 기준으로 파일을 찾도록 설정
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def end_headers(self):
        # 화면 파일을 고친 뒤 새로고침하면 바로 반영되도록 캐시를 끕니다.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print("=" * 50)
    print(" 비품 신청·재고 관리 앱이 시작되었습니다.")
    print(f" 브라우저에서 http://localhost:{PORT} 로 접속하세요.")
    print(" 종료하려면 이 창에서 Ctrl + C 를 누르세요.")
    print("=" * 50)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
