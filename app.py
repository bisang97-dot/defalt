# -*- coding: utf-8 -*-
"""
비품 신청·재고 관리 앱 - 서버 프로그램

실행 방법:  python app.py
접속 주소:  http://localhost:8000

[지금 단계의 특징]
- 이 서버는 static 폴더의 화면 파일(HTML/CSS/JS)을 브라우저에 보내 줍니다.
- 신청 데이터는 SQLite 데이터베이스 파일(supplies.db)에 저장합니다.
  그래서 새로고침하거나 서버를 껐다 켜도 등록·변경·삭제한 내용이 그대로 남습니다.
- supplies.db 파일은 처음 실행할 때 app.py 옆에 자동으로 만들어지고,
  이때 연습용 가짜 데이터 25건이 한 번만 들어갑니다.
  (처음 상태로 되돌리고 싶으면 서버를 끄고 supplies.db 파일을 지운 뒤 다시 실행하세요.)
- 파이썬 기본 기능(표준 라이브러리)만 사용합니다. 따로 설치할 것이 없습니다.

[화면(app.js)과 주고받는 주소]
- GET    /api/requests        신청 목록 조회
- POST   /api/requests        새 신청 등록
- PATCH  /api/requests/번호   상태 변경
- DELETE /api/requests/번호   신청 삭제
"""

import json
import os
import sqlite3
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# 서버 주소와 포트 번호
HOST = "127.0.0.1"
PORT = 8000

# 화면 파일(HTML/CSS/JS)이 들어 있는 폴더 위치
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# 데이터베이스 파일 위치 (app.py와 같은 폴더)
DB_PATH = os.path.join(BASE_DIR, "supplies.db")

# 상태는 이 세 가지만 사용합니다. (순서: 접수 → 승인 → 지급 완료)
STATUSES = ["접수", "승인", "지급 완료"]

# 데이터베이스를 처음 만들 때 한 번만 넣는 가짜 데이터 25건
# (실제 사람·부서가 아닌 연습용 데이터)
# 순서: 신청자, 비품, 수량, 카테고리, 신청 부서, 사유, 상태, 신청일
SAMPLE_REQUESTS = [
    ("신청자 A", "A4 용지", 10, "사무용품", "가상팀1", "월간 보고서 출력용", "지급 완료", "2026-10-01"),
    ("신청자 B", "볼펜", 20, "사무용품", "가상팀2", "팀 공용 필기구 보충", "지급 완료", "2026-10-02"),
    ("신청자 C", "모니터 받침대", 2, "전산소모품", "가상팀3", "신규 자리 배치", "지급 완료", "2026-10-04"),
    ("신청자 D", "토너", 3, "전산소모품", "가상팀1", "복합기 토너 소진", "지급 완료", "2026-10-06"),
    ("신청자 E", "마우스", 1, "전산소모품", "가상팀4", "기존 마우스 고장", "지급 완료", "2026-10-07"),
    ("신청자 F", "포스트잇", 15, "사무용품", "가상팀2", "회의 자료 정리용", "지급 완료", "2026-10-09"),
    ("신청자 G", "종이컵", 5, "생활용품", "가상팀5", "탕비실 비치용", "지급 완료", "2026-10-10"),
    ("신청자 H", "클립", 10, "사무용품", "가상팀3", "서류 정리용", "승인", "2026-10-13"),
    ("신청자 I", "키보드", 1, "전산소모품", "가상팀4", "자판 일부 입력 불량", "지급 완료", "2026-10-14"),
    ("신청자 J", "물티슈", 6, "생활용품", "가상팀1", "회의실 비치용", "승인", "2026-10-15"),
    ("신청자 K", "형광펜", 12, "사무용품", "가상팀5", "교육 자료 표시용", "지급 완료", "2026-10-16"),
    ("신청자 L", "USB 메모리", 2, "전산소모품", "가상팀2", "자료 전달용", "승인", "2026-10-17"),
    ("신청자 M", "화이트보드 마커", 8, "사무용품", "가상팀3", "회의실 마커 교체", "승인", "2026-10-20"),
    ("신청자 N", "핸드타월", 4, "생활용품", "가상팀4", "화장실 비치용", "지급 완료", "2026-10-21"),
    ("신청자 O", "스테이플러", 2, "사무용품", "가상팀1", "팀 공용 비품", "승인", "2026-10-22"),
    ("신청자 P", "HDMI 케이블", 3, "전산소모품", "가상팀5", "회의실 발표 연결용", "접수", "2026-10-23"),
    ("신청자 Q", "커피 믹스", 3, "생활용품", "가상팀2", "탕비실 비치용", "승인", "2026-10-24"),
    ("신청자 R", "파일 바인더", 10, "사무용품", "가상팀3", "계약 서류 보관용", "접수", "2026-10-27"),
    ("신청자 S", "배터리(AA)", 20, "기타", "가상팀4", "무선 마우스·리모컨용", "접수", "2026-10-28"),
    ("신청자 T", "A4 용지", 5, "사무용품", "가상팀5", "교육 자료 출력용", "승인", "2026-10-29"),
    ("신청자 U", "멀티탭", 2, "기타", "가상팀1", "회의실 전원 부족", "접수", "2026-10-30"),
    ("신청자 V", "종이컵", 10, "생활용품", "가상팀2", "행사 준비용", "접수", "2026-11-02"),
    ("신청자 W", "토너", 2, "전산소모품", "가상팀3", "프린터 출력 흐림", "접수", "2026-11-03"),
    ("신청자 X", "볼펜", 30, "사무용품", "가상팀4", "신규 입사자 지급용", "접수", "2026-11-04"),
    ("신청자 Y", "마우스", 2, "전산소모품", "가상팀5", "예비용", "접수", "2026-11-05"),
]


# ---------------------------------------------------------------------
# 데이터베이스 다루기
# ---------------------------------------------------------------------

def connect():
    """데이터베이스 파일에 연결합니다."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row   # 결과를 이름(예: row["item"])으로 꺼낼 수 있게
    return conn


def init_db():
    """표(테이블)가 없으면 만들고, 처음 만들 때만 가짜 데이터 25건을 넣습니다."""
    with connect() as conn:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'requests'"
        ).fetchone()
        if exists:
            return
        conn.execute(
            """
            CREATE TABLE requests (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                requester  TEXT    NOT NULL,
                item       TEXT    NOT NULL,
                quantity   INTEGER NOT NULL,
                category   TEXT    NOT NULL,
                department TEXT    NOT NULL,
                reason     TEXT    NOT NULL DEFAULT '',
                status     TEXT    NOT NULL DEFAULT '접수',
                created_at TEXT    NOT NULL
            )
            """
        )
        conn.executemany(
            "INSERT INTO requests (requester, item, quantity, category, department, reason, status, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            SAMPLE_REQUESTS,
        )


def to_dict(row):
    """데이터베이스의 한 줄을 화면(app.js)이 쓰는 모양으로 바꿉니다."""
    return {
        "id": row["id"],
        "requester": row["requester"],
        "item": row["item"],
        "quantity": row["quantity"],
        "category": row["category"],
        "department": row["department"],
        "reason": row["reason"],
        "status": row["status"],
        "createdAt": row["created_at"],
    }


def get_all():
    with connect() as conn:
        rows = conn.execute("SELECT * FROM requests ORDER BY id DESC").fetchall()
    return [to_dict(r) for r in rows]


def get_one(conn, request_id):
    row = conn.execute("SELECT * FROM requests WHERE id = ?", (request_id,)).fetchone()
    return to_dict(row) if row else None


def add(data):
    """새 신청을 등록합니다. 잘못된 값이면 ValueError를 냅니다."""
    requester = str(data.get("requester", "")).strip()
    item = str(data.get("item", "")).strip()
    department = str(data.get("department", "")).strip()
    category = str(data.get("category", "")).strip() or "기타"
    reason = str(data.get("reason", "")).strip()
    quantity = data.get("quantity")

    if not requester or not item or not department:
        raise ValueError("신청자, 신청 부서, 비품을 입력해 주세요.")
    if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity < 1:
        raise ValueError("수량은 1 이상의 숫자로 입력해 주세요.")

    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO requests (requester, item, quantity, category, department, reason, status, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            # 새 신청은 항상 "접수" 상태로 시작
            (requester, item, quantity, category, department, reason, "접수", date.today().isoformat()),
        )
        return get_one(conn, cur.lastrowid)


def change_status(request_id, new_status):
    """상태를 바꿉니다. 해당 신청이 없으면 None을 돌려줍니다."""
    if new_status not in STATUSES:
        raise ValueError("상태는 접수, 승인, 지급 완료 중 하나여야 합니다.")
    with connect() as conn:
        conn.execute("UPDATE requests SET status = ? WHERE id = ?", (new_status, request_id))
        return get_one(conn, request_id)


def delete(request_id):
    """신청을 삭제합니다. 지운 것이 있으면 True."""
    with connect() as conn:
        cur = conn.execute("DELETE FROM requests WHERE id = ?", (request_id,))
        return cur.rowcount > 0


# ---------------------------------------------------------------------
# 브라우저 요청 처리
# ---------------------------------------------------------------------

class AppHandler(SimpleHTTPRequestHandler):
    """브라우저의 요청을 받아 화면 파일 또는 신청 데이터를 돌려주는 담당자"""

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

    # --- 도우미 ---

    def path_only(self):
        """주소에서 ? 뒤의 내용을 뺀 부분"""
        return self.path.split("?", 1)[0]

    def request_id(self):
        """'/api/requests/번호' 주소에서 번호를 꺼냅니다. 형식이 다르면 None."""
        prefix = "/api/requests/"
        path = self.path_only()
        if path.startswith(prefix) and path[len(prefix):].isdigit():
            return int(path[len(prefix):])
        return None

    def read_json(self):
        """브라우저가 보낸 JSON 내용을 읽습니다."""
        length = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("요청 내용을 읽을 수 없습니다.")
        if not isinstance(data, dict):
            raise ValueError("요청 내용을 읽을 수 없습니다.")
        return data

    def send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def not_found(self):
        self.send_json(404, {"error": "해당 신청을 찾을 수 없습니다."})

    # --- 요청 종류별 처리 ---

    def do_GET(self):
        if self.path_only() == "/api/requests":
            self.send_json(200, get_all())
        else:
            super().do_GET()          # 그 밖의 주소는 화면 파일을 보내 줍니다.

    def do_POST(self):
        if self.path_only() != "/api/requests":
            return self.not_found()
        try:
            self.send_json(201, add(self.read_json()))
        except ValueError as e:
            self.send_json(400, {"error": str(e)})

    def do_PATCH(self):
        request_id = self.request_id()
        if request_id is None:
            return self.not_found()
        try:
            updated = change_status(request_id, self.read_json().get("status"))
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        if updated is None:
            return self.not_found()
        self.send_json(200, updated)

    def do_DELETE(self):
        request_id = self.request_id()
        if request_id is None or not delete(request_id):
            return self.not_found()
        self.send_json(200, {"ok": True})


def main():
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print("=" * 50)
    print(" 비품 신청·재고 관리 앱이 시작되었습니다.")
    print(f" 브라우저에서 http://localhost:{PORT} 로 접속하세요.")
    print(f" 데이터 저장 위치: {DB_PATH}")
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
