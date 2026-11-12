"""총무팀 비품 신청·재고 관리 앱.

Python 표준 라이브러리만 사용합니다. 신청 데이터는 SQLite 파일(supplies.db)에
저장되므로 서버를 재시작해도 남아 있습니다.

실행: python app.py  →  http://localhost:8000
"""

import json
import os
import sqlite3
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = Path(os.environ.get("SUPPLY_DB_PATH", BASE_DIR / "supplies.db"))
PORT = int(os.environ.get("PORT", "8000"))

STATUSES = ["접수", "승인", "지급 완료"]

STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
}


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                requester TEXT NOT NULL,
                item TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                reason TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT '접수',
                created_at TEXT NOT NULL
            )
            """
        )


def row_to_dict(row):
    return {key: row[key] for key in row.keys()}


def list_requests():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM requests ORDER BY id DESC").fetchall()
    return [row_to_dict(r) for r in rows]


def create_request(data):
    requester = str(data.get("requester", "")).strip()
    item = str(data.get("item", "")).strip()
    reason = str(data.get("reason", "")).strip()
    try:
        quantity = int(data.get("quantity", 0))
    except (TypeError, ValueError):
        quantity = 0
    if not requester or not item:
        raise ValueError("신청자와 비품명을 입력해 주세요.")
    if quantity <= 0:
        raise ValueError("수량은 1 이상이어야 합니다.")
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO requests (requester, item, quantity, reason, status, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (requester, item, quantity, reason, STATUSES[0], created_at),
        )
        row = conn.execute("SELECT * FROM requests WHERE id = ?", (cur.lastrowid,)).fetchone()
    return row_to_dict(row)


def update_status(request_id, status):
    if status not in STATUSES:
        raise ValueError("알 수 없는 상태입니다.")
    with get_conn() as conn:
        cur = conn.execute("UPDATE requests SET status = ? WHERE id = ?", (status, request_id))
        if cur.rowcount == 0:
            return None
        row = conn.execute("SELECT * FROM requests WHERE id = ?", (request_id,)).fetchone()
    return row_to_dict(row)


def delete_request(request_id):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM requests WHERE id = ?", (request_id,))
    return cur.rowcount > 0


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("요청 형식이 올바르지 않습니다.")
        if not isinstance(data, dict):
            raise ValueError("요청 형식이 올바르지 않습니다.")
        return data

    def request_id(self):
        """'/api/requests/<id>' 형태의 경로에서 id를 꺼냅니다."""
        parts = self.path.split("?")[0].strip("/").split("/")
        if len(parts) == 3 and parts[:2] == ["api", "requests"] and parts[2].isdigit():
            return int(parts[2])
        return None

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/requests":
            return self.send_json(200, list_requests())
        if path == "/":
            path = "/index.html"
        file_path = (STATIC_DIR / path.lstrip("/")).resolve()
        if (
            STATIC_DIR.resolve() in file_path.parents
            and file_path.is_file()
            and file_path.suffix in STATIC_TYPES
        ):
            body = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", STATIC_TYPES[file_path.suffix])
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_json(404, {"error": "페이지를 찾을 수 없습니다."})

    def do_POST(self):
        if self.path.split("?")[0] != "/api/requests":
            return self.send_json(404, {"error": "페이지를 찾을 수 없습니다."})
        try:
            created = create_request(self.read_json())
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        self.send_json(201, created)

    def do_PATCH(self):
        request_id = self.request_id()
        if request_id is None:
            return self.send_json(404, {"error": "페이지를 찾을 수 없습니다."})
        try:
            updated = update_status(request_id, self.read_json().get("status"))
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        if updated is None:
            return self.send_json(404, {"error": "해당 신청을 찾을 수 없습니다."})
        self.send_json(200, updated)

    def do_DELETE(self):
        request_id = self.request_id()
        if request_id is None:
            return self.send_json(404, {"error": "페이지를 찾을 수 없습니다."})
        if not delete_request(request_id):
            return self.send_json(404, {"error": "해당 신청을 찾을 수 없습니다."})
        self.send_json(200, {"ok": True})


def main():
    init_db()
    server = ThreadingHTTPServer(("", PORT), Handler)
    print(f"비품 신청 앱 실행 중: http://localhost:{PORT}  (DB: {DB_PATH})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
