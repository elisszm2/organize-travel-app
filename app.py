"""Wanderlusst Travel — a local-first travel organizer.

Run with:  .venv/bin/python app.py
Then open: http://127.0.0.1:5000
"""

from __future__ import annotations

import os
import re
import sqlite3
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "wayfarer.db"
STATIC_DIR = BASE_DIR / "static"

MAX_UPLOAD_BYTES = 30 * 1024 * 1024  # 30 MB

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

STARTER_TASKS = [
    ("Book accommodation", "hotel"),
    ("Check visa requirements", "visa"),
    ("Book transport (flights / trains)", "transport"),
    ("Get travel insurance", "documents"),
]


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript(
        """
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS trips (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            location    TEXT NOT NULL,
            description TEXT DEFAULT '',
            status      INTEGER NOT NULL DEFAULT 0,
            start_date  TEXT,
            end_date    TEXT,
            lat         REAL,
            lng         REAL,
            icon_image  TEXT DEFAULT '',
            cover_image TEXT DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS days (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            day_number  INTEGER NOT NULL,
            date        TEXT,
            title       TEXT DEFAULT '',
            notes       TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS activities (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            day_id      INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
            time        TEXT DEFAULT '',
            title       TEXT NOT NULL,
            category    TEXT DEFAULT 'activity',
            location    TEXT DEFAULT '',
            lat         REAL,
            lng         REAL,
            notes       TEXT DEFAULT '',
            done        INTEGER NOT NULL DEFAULT 0,
            sort_order  INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            category    TEXT DEFAULT 'other',
            status      TEXT NOT NULL DEFAULT 'todo',
            due_date    TEXT,
            notes       TEXT DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS bookings (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id       INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            type          TEXT DEFAULT 'hotel',
            title         TEXT NOT NULL,
            provider      TEXT DEFAULT '',
            confirmation  TEXT DEFAULT '',
            start_date    TEXT,
            end_date      TEXT,
            amount        REAL,
            currency      TEXT DEFAULT 'EUR',
            address       TEXT DEFAULT '',
            lat           REAL,
            lng           REAL,
            notes         TEXT DEFAULT '',
            created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS documents (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id      INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            booking_id   INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
            name         TEXT NOT NULL,
            stored_name  TEXT NOT NULL,
            mimetype     TEXT DEFAULT '',
            size         INTEGER DEFAULT 0,
            uploaded_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS recommendations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            category    TEXT DEFAULT 'place',
            url         TEXT DEFAULT '',
            address     TEXT DEFAULT '',
            lat         REAL,
            lng         REAL,
            notes       TEXT DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS transport (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id       INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            scope         TEXT NOT NULL DEFAULT 'arrival',
            type          TEXT NOT NULL DEFAULT 'flight',
            title         TEXT NOT NULL,
            provider      TEXT DEFAULT '',
            confirmation  TEXT DEFAULT '',
            from_place    TEXT DEFAULT '',
            to_place      TEXT DEFAULT '',
            depart_date   TEXT,
            depart_time   TEXT DEFAULT '',
            arrive_date   TEXT,
            arrive_time   TEXT DEFAULT '',
            amount        REAL,
            currency      TEXT DEFAULT 'EUR',
            notes         TEXT DEFAULT '',
            created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_days_trip ON days(trip_id);
        CREATE INDEX IF NOT EXISTS idx_activities_trip ON activities(trip_id);
        CREATE INDEX IF NOT EXISTS idx_activities_day ON activities(day_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_trip ON tasks(trip_id);
        CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
        CREATE INDEX IF NOT EXISTS idx_documents_trip ON documents(trip_id);
        CREATE INDEX IF NOT EXISTS idx_recommendations_trip ON recommendations(trip_id);
        CREATE INDEX IF NOT EXISTS idx_transport_trip ON transport(trip_id);
        """
    )
    db.commit()
    ensure_columns(
        db,
        "trips",
        {
            "icon_image": "TEXT DEFAULT ''",
            "cover_image": "TEXT DEFAULT ''",
        },
    )
    ensure_columns(
        db,
        "bookings",
        {
            "address": "TEXT DEFAULT ''",
            "lat": "REAL",
            "lng": "REAL",
        },
    )
    db.close()


def ensure_columns(db: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {r["name"] for r in db.execute(f"PRAGMA table_info({table})").fetchall()}
    for name, definition in columns.items():
        if name not in existing:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
    db.commit()


def rows(query: str, params: tuple = ()) -> list[dict]:
    return [dict(r) for r in get_db().execute(query, params).fetchall()]


def row(query: str, params: tuple = ()) -> dict | None:
    r = get_db().execute(query, params).fetchone()
    return dict(r) if r else None


def with_task_progress(trip: dict) -> dict:
    """Organization progress is derived from the trip checklist."""
    total = int(trip.get("task_total") or 0)
    done = int(trip.get("task_done") or 0)
    trip["status"] = round((done / total) * 100) if total else 0
    return trip


TRANSPORT_SCOPES = ("arrival", "internal", "return")
TRANSPORT_TYPES = ("flight", "train", "bus", "ferry", "car", "other")


def clean(value, default=""):
    if value is None:
        return default
    return str(value).strip()


def parse_float(value):
    if value in (None, "", "null"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def trip_summary(trip_id: int) -> dict | None:
    trip = row(
        """
        SELECT t.*,
            (SELECT COUNT(*) FROM days d WHERE d.trip_id = t.id) AS day_count,
            (SELECT COUNT(*) FROM tasks k WHERE k.trip_id = t.id) AS task_total,
            (SELECT COUNT(*) FROM tasks k WHERE k.trip_id = t.id AND k.status = 'done') AS task_done,
            (SELECT COUNT(*) FROM tasks k WHERE k.trip_id = t.id AND k.status = 'doing') AS task_doing,
            (SELECT COUNT(*) FROM activities a WHERE a.trip_id = t.id) AS activity_count,
            (SELECT COUNT(*) FROM activities a WHERE a.trip_id = t.id AND a.done = 1) AS activity_done,
            (SELECT COUNT(*) FROM bookings b WHERE b.trip_id = t.id) AS booking_count,
            (SELECT COUNT(*) FROM documents x WHERE x.trip_id = t.id) AS doc_count,
            (SELECT COUNT(*) FROM recommendations r WHERE r.trip_id = t.id) AS recommendation_count,
            (SELECT COUNT(*) FROM transport tr WHERE tr.trip_id = t.id) AS transport_count
        FROM trips t
        WHERE t.id = ?
        """,
        (trip_id,),
    )
    return with_task_progress(trip) if trip else None


def document_dict(doc: dict) -> dict:
    doc = dict(doc)
    doc["url"] = f"/api/documents/{doc['id']}/download"
    return doc


def delete_stored_file(stored_name: str) -> None:
    if not stored_name:
        return
    target = (UPLOAD_DIR / stored_name).resolve()
    if target.parent == UPLOAD_DIR.resolve() and target.exists():
        try:
            target.unlink()
        except OSError:
            pass


def add_days_for_trip(trip_id: int, start: str | None, end: str | None, count: int | None) -> int:
    """Create day rows for a new trip. Returns the number of days created."""
    db = get_db()
    dates: list[str | None] = []
    try:
        if start and end:
            start_d = date.fromisoformat(start)
            end_d = date.fromisoformat(end)
            if end_d < start_d:
                raise ValueError("The end date cannot be before the start date.")
            dates = [(start_d + timedelta(days=i)).isoformat() for i in range((end_d - start_d).days + 1)]
        elif start and count:
            start_d = date.fromisoformat(start)
            dates = [(start_d + timedelta(days=i)).isoformat() for i in range(count)]
        elif count:
            dates = [None] * count
    except ValueError as exc:
        raise ValueError(str(exc)) from exc

    for index, day_date in enumerate(dates, start=1):
        db.execute(
            "INSERT INTO days (trip_id, day_number, date, title) VALUES (?, ?, ?, ?)",
            (trip_id, index, day_date, f"Day {index}"),
        )
    return len(dates)


def next_day_number(trip_id: int) -> int:
    result = get_db().execute(
        "SELECT COALESCE(MAX(day_number), 0) + 1 FROM days WHERE trip_id = ?", (trip_id,)
    ).fetchone()
    return int(result[0])


def renumber_days(trip_id: int) -> None:
    db = get_db()
    days = db.execute(
        "SELECT id FROM days WHERE trip_id = ? ORDER BY day_number, id", (trip_id,)
    ).fetchall()
    for index, day in enumerate(days, start=1):
        db.execute("UPDATE days SET day_number = ? WHERE id = ?", (index, day["id"]))


def json_body() -> dict:
    return request.get_json(silent=True) or {}


# ---------------------------------------------------------------------------
# Trips
# ---------------------------------------------------------------------------


@app.get("/api/trips")
def list_trips():
    trips = rows(
        """
        SELECT t.*,
            (SELECT COUNT(*) FROM days d WHERE d.trip_id = t.id) AS day_count,
            (SELECT COUNT(*) FROM tasks k WHERE k.trip_id = t.id) AS task_total,
            (SELECT COUNT(*) FROM tasks k WHERE k.trip_id = t.id AND k.status = 'done') AS task_done,
            (SELECT COUNT(*) FROM tasks k WHERE k.trip_id = t.id AND k.status = 'doing') AS task_doing,
            (SELECT COUNT(*) FROM activities a WHERE a.trip_id = t.id) AS activity_count,
            (SELECT COUNT(*) FROM activities a WHERE a.trip_id = t.id AND a.done = 1) AS activity_done,
            (SELECT COUNT(*) FROM bookings b WHERE b.trip_id = t.id) AS booking_count,
            (SELECT COUNT(*) FROM documents x WHERE x.trip_id = t.id) AS doc_count,
            (SELECT COUNT(*) FROM recommendations r WHERE r.trip_id = t.id) AS recommendation_count,
            (SELECT COUNT(*) FROM transport tr WHERE tr.trip_id = t.id) AS transport_count
        FROM trips t
        ORDER BY (t.start_date IS NULL), t.start_date ASC, t.created_at DESC
        """
    )
    return jsonify({"trips": [with_task_progress(trip) for trip in trips]})


@app.post("/api/trips")
def create_trip():
    data = json_body()
    location = clean(data.get("location"))
    if not location:
        return jsonify({"error": "A destination is required."}), 400

    title = clean(data.get("title")) or f"Trip to {location}"
    start_date = clean(data.get("start_date")) or None
    end_date = clean(data.get("end_date")) or None
    count = None
    if data.get("duration_days") not in (None, ""):
        try:
            count = max(1, min(365, int(data.get("duration_days"))))
        except (TypeError, ValueError):
            count = None

    if start_date and end_date:
        try:
            start_d = date.fromisoformat(start_date)
            end_d = date.fromisoformat(end_date)
        except ValueError:
            return jsonify({"error": "Dates must use the YYYY-MM-DD format."}), 400
        if end_d < start_d:
            return jsonify({"error": "The end date cannot be before the start date."}), 400
        count = (end_d - start_d).days + 1
    elif start_date and not count:
        count = 1
    elif count is None:
        count = 1

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO trips (title, location, description, status, start_date, end_date, lat, lng)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            title,
            location,
            clean(data.get("description")),
            0,
            start_date,
            end_date,
            parse_float(data.get("lat")),
            parse_float(data.get("lng")),
        ),
    )
    trip_id = cur.lastrowid
    try:
        add_days_for_trip(trip_id, start_date, end_date, count)
    except ValueError as exc:
        db.rollback()
        return jsonify({"error": str(exc)}), 400

    for task_title, category in STARTER_TASKS:
        db.execute(
            "INSERT INTO tasks (trip_id, title, category, status) VALUES (?, ?, ?, 'todo')",
            (trip_id, task_title, category),
        )

    db.commit()
    return jsonify({"trip": trip_summary(trip_id)}), 201


@app.get("/api/trips/<int:trip_id>")
def get_trip(trip_id: int):
    trip = trip_summary(trip_id)
    if not trip:
        return jsonify({"error": "Trip not found."}), 404

    days = rows("SELECT * FROM days WHERE trip_id = ? ORDER BY day_number, id", (trip_id,))
    activities = rows(
        """
        SELECT * FROM activities WHERE trip_id = ?
        ORDER BY (time IS NULL OR time = ''), time, sort_order, id
        """,
        (trip_id,),
    )
    by_day: dict[int, list[dict]] = {}
    for activity in activities:
        by_day.setdefault(activity["day_id"], []).append(activity)
    for day in days:
        day["activities"] = by_day.get(day["id"], [])

    tasks = rows(
        """
        SELECT * FROM tasks WHERE trip_id = ?
        ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END,
                 (due_date IS NULL), due_date, created_at DESC
        """,
        (trip_id,),
    )
    bookings = rows(
        "SELECT * FROM bookings WHERE trip_id = ? ORDER BY (start_date IS NULL), start_date, created_at",
        (trip_id,),
    )
    documents = [
        document_dict(d)
        for d in rows(
            "SELECT * FROM documents WHERE trip_id = ? ORDER BY uploaded_at DESC, id DESC", (trip_id,)
        )
    ]
    docs_by_booking: dict[int, list[dict]] = {}
    for document in documents:
        if document["booking_id"]:
            docs_by_booking.setdefault(document["booking_id"], []).append(document)
    for booking in bookings:
        booking["documents"] = docs_by_booking.get(booking["id"], [])

    recommendations = rows(
        "SELECT * FROM recommendations WHERE trip_id = ? ORDER BY created_at DESC, id DESC", (trip_id,)
    )
    transport = rows(
        """
        SELECT * FROM transport WHERE trip_id = ?
        ORDER BY (depart_date IS NULL), depart_date, depart_time, created_at, id
        """,
        (trip_id,),
    )

    return jsonify(
        {
            "trip": trip,
            "days": days,
            "tasks": tasks,
            "bookings": bookings,
            "documents": documents,
            "recommendations": recommendations,
            "transport": transport,
        }
    )


@app.put("/api/trips/<int:trip_id>")
@app.patch("/api/trips/<int:trip_id>")
def update_trip(trip_id: int):
    if not trip_summary(trip_id):
        return jsonify({"error": "Trip not found."}), 404
    data = json_body()
    db = get_db()

    fields = []
    params: list = []
    for key in ("title", "location", "description", "start_date", "end_date"):
        if key in data:
            value = clean(data.get(key))
            fields.append(f"{key} = ?")
            if key in ("start_date", "end_date"):
                params.append(value or None)
            else:
                params.append(value)
    for key in ("lat", "lng"):
        if key in data:
            fields.append(f"{key} = ?")
            params.append(parse_float(data.get(key)))

    if fields:
        params.append(trip_id)
        db.execute(f"UPDATE trips SET {', '.join(fields)} WHERE id = ?", tuple(params))
        db.commit()
    return jsonify({"trip": trip_summary(trip_id)})


@app.delete("/api/trips/<int:trip_id>")
def delete_trip(trip_id: int):
    trip = trip_summary(trip_id)
    if not trip:
        return jsonify({"error": "Trip not found."}), 404
    docs = rows("SELECT stored_name FROM documents WHERE trip_id = ?", (trip_id,))
    get_db().execute("DELETE FROM trips WHERE id = ?", (trip_id,))
    get_db().commit()
    for doc in docs:
        delete_stored_file(doc["stored_name"])
    delete_stored_file(trip.get("icon_image"))
    delete_stored_file(trip.get("cover_image"))
    return jsonify({"ok": True})


TRIP_IMAGE_COLUMNS = {"icon": "icon_image", "cover": "cover_image"}
TRIP_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}


@app.post("/api/trips/<int:trip_id>/images")
def upload_trip_image(trip_id: int):
    trip = row("SELECT * FROM trips WHERE id = ?", (trip_id,))
    if not trip:
        return jsonify({"error": "Trip not found."}), 404

    kind = clean(request.form.get("kind"))
    if kind not in TRIP_IMAGE_COLUMNS:
        return jsonify({"error": "Choose either an icon or a cover image."}), 400

    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "No image was uploaded."}), 400

    original = secure_filename(file.filename) or "image"
    extension = Path(original).suffix.lower()
    if extension not in TRIP_IMAGE_EXTENSIONS:
        return jsonify({"error": "Use a PNG, JPG, WebP, GIF or AVIF image."}), 400
    if file.mimetype and not file.mimetype.startswith("image/"):
        return jsonify({"error": "That file does not look like an image."}), 400

    stored = f"trip-{trip_id}-{kind}-{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / stored
    file.save(destination)

    column = TRIP_IMAGE_COLUMNS[kind]
    old_name = trip.get(column)
    get_db().execute(f"UPDATE trips SET {column} = ? WHERE id = ?", (stored, trip_id))
    get_db().commit()
    delete_stored_file(old_name)
    return jsonify({"trip": trip_summary(trip_id)})


@app.get("/api/trips/<int:trip_id>/images/<kind>")
def get_trip_image(trip_id: int, kind: str):
    if kind not in TRIP_IMAGE_COLUMNS:
        return jsonify({"error": "Image not found."}), 404
    column = TRIP_IMAGE_COLUMNS[kind]
    trip = row(f"SELECT {column} AS stored FROM trips WHERE id = ?", (trip_id,))
    if not trip or not trip["stored"]:
        return jsonify({"error": "Image not found."}), 404
    return send_from_directory(UPLOAD_DIR, trip["stored"], max_age=31536000)


@app.delete("/api/trips/<int:trip_id>/images/<kind>")
def delete_trip_image(trip_id: int, kind: str):
    if kind not in TRIP_IMAGE_COLUMNS:
        return jsonify({"error": "Image not found."}), 404
    trip = row("SELECT * FROM trips WHERE id = ?", (trip_id,))
    if not trip:
        return jsonify({"error": "Trip not found."}), 404
    column = TRIP_IMAGE_COLUMNS[kind]
    old_name = trip.get(column)
    get_db().execute(f"UPDATE trips SET {column} = '' WHERE id = ?", (trip_id,))
    get_db().commit()
    delete_stored_file(old_name)
    return jsonify({"trip": trip_summary(trip_id)})


# ---------------------------------------------------------------------------
# Days
# ---------------------------------------------------------------------------


@app.post("/api/trips/<int:trip_id>/days")
def create_day(trip_id: int):
    if not trip_summary(trip_id):
        return jsonify({"error": "Trip not found."}), 404
    data = json_body()
    number = next_day_number(trip_id)
    db = get_db()
    cur = db.execute(
        "INSERT INTO days (trip_id, day_number, date, title, notes) VALUES (?, ?, ?, ?, ?)",
        (
            trip_id,
            number,
            clean(data.get("date")) or None,
            clean(data.get("title")) or f"Day {number}",
            clean(data.get("notes")),
        ),
    )
    db.commit()
    return jsonify({"day": row("SELECT * FROM days WHERE id = ?", (cur.lastrowid,))}), 201


@app.put("/api/days/<int:day_id>")
@app.patch("/api/days/<int:day_id>")
def update_day(day_id: int):
    day = row("SELECT * FROM days WHERE id = ?", (day_id,))
    if not day:
        return jsonify({"error": "Day not found."}), 404
    data = json_body()
    fields, params = [], []
    for key in ("title", "notes"):
        if key in data:
            fields.append(f"{key} = ?")
            params.append(clean(data.get(key)))
    if "date" in data:
        fields.append("date = ?")
        params.append(clean(data.get("date")) or None)
    if fields:
        params.append(day_id)
        get_db().execute(f"UPDATE days SET {', '.join(fields)} WHERE id = ?", tuple(params))
        get_db().commit()
    return jsonify({"day": row("SELECT * FROM days WHERE id = ?", (day_id,))})


@app.delete("/api/days/<int:day_id>")
def delete_day(day_id: int):
    day = row("SELECT * FROM days WHERE id = ?", (day_id,))
    if not day:
        return jsonify({"error": "Day not found."}), 404
    db = get_db()
    db.execute("DELETE FROM days WHERE id = ?", (day_id,))
    renumber_days(day["trip_id"])
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------


@app.post("/api/days/<int:day_id>/activities")
def create_activity(day_id: int):
    day = row("SELECT * FROM days WHERE id = ?", (day_id,))
    if not day:
        return jsonify({"error": "Day not found."}), 404
    data = json_body()
    title = clean(data.get("title"))
    if not title:
        return jsonify({"error": "An activity title is required."}), 400
    db = get_db()
    order = db.execute(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM activities WHERE day_id = ?", (day_id,)
    ).fetchone()[0]
    cur = db.execute(
        """
        INSERT INTO activities
            (trip_id, day_id, time, title, category, location, lat, lng, notes, done, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            day["trip_id"],
            day_id,
            clean(data.get("time")),
            title,
            clean(data.get("category")) or "activity",
            clean(data.get("location")),
            parse_float(data.get("lat")),
            parse_float(data.get("lng")),
            clean(data.get("notes")),
            1 if data.get("done") else 0,
            order,
        ),
    )
    db.commit()
    return jsonify({"activity": row("SELECT * FROM activities WHERE id = ?", (cur.lastrowid,))}), 201


@app.put("/api/activities/<int:activity_id>")
@app.patch("/api/activities/<int:activity_id>")
def update_activity(activity_id: int):
    activity = row("SELECT * FROM activities WHERE id = ?", (activity_id,))
    if not activity:
        return jsonify({"error": "Activity not found."}), 404
    data = json_body()
    fields, params = [], []
    for key in ("time", "title", "category", "location", "notes"):
        if key in data:
            fields.append(f"{key} = ?")
            params.append(clean(data.get(key)))
    for key in ("lat", "lng"):
        if key in data:
            fields.append(f"{key} = ?")
            params.append(parse_float(data.get(key)))
    if "done" in data:
        fields.append("done = ?")
        params.append(1 if data.get("done") else 0)
    if "sort_order" in data:
        fields.append("sort_order = ?")
        params.append(int(data.get("sort_order") or 0))
    if fields:
        params.append(activity_id)
        get_db().execute(f"UPDATE activities SET {', '.join(fields)} WHERE id = ?", tuple(params))
        get_db().commit()
    return jsonify({"activity": row("SELECT * FROM activities WHERE id = ?", (activity_id,))})


@app.delete("/api/activities/<int:activity_id>")
def delete_activity(activity_id: int):
    if not row("SELECT id FROM activities WHERE id = ?", (activity_id,)):
        return jsonify({"error": "Activity not found."}), 404
    get_db().execute("DELETE FROM activities WHERE id = ?", (activity_id,))
    get_db().commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


@app.post("/api/trips/<int:trip_id>/tasks")
def create_task(trip_id: int):
    if not trip_summary(trip_id):
        return jsonify({"error": "Trip not found."}), 404
    data = json_body()
    title = clean(data.get("title"))
    if not title:
        return jsonify({"error": "A task title is required."}), 400
    status = clean(data.get("status")) or "todo"
    if status not in ("todo", "doing", "done"):
        status = "todo"
    db = get_db()
    cur = db.execute(
        """
        INSERT INTO tasks (trip_id, title, category, status, due_date, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            trip_id,
            title,
            clean(data.get("category")) or "other",
            status,
            clean(data.get("due_date")) or None,
            clean(data.get("notes")),
        ),
    )
    db.commit()
    return jsonify({"task": row("SELECT * FROM tasks WHERE id = ?", (cur.lastrowid,))}), 201


@app.put("/api/tasks/<int:task_id>")
@app.patch("/api/tasks/<int:task_id>")
def update_task(task_id: int):
    task = row("SELECT * FROM tasks WHERE id = ?", (task_id,))
    if not task:
        return jsonify({"error": "Task not found."}), 404
    data = json_body()
    fields, params = [], []
    for key in ("title", "category", "notes"):
        if key in data:
            fields.append(f"{key} = ?")
            params.append(clean(data.get(key)))
    if "status" in data:
        status = clean(data.get("status"))
        if status not in ("todo", "doing", "done"):
            return jsonify({"error": "Invalid task status."}), 400
        fields.append("status = ?")
        params.append(status)
    if "due_date" in data:
        fields.append("due_date = ?")
        params.append(clean(data.get("due_date")) or None)
    if fields:
        params.append(task_id)
        get_db().execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?", tuple(params))
        get_db().commit()
    return jsonify({"task": row("SELECT * FROM tasks WHERE id = ?", (task_id,))})


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id: int):
    if not row("SELECT id FROM tasks WHERE id = ?", (task_id,)):
        return jsonify({"error": "Task not found."}), 404
    get_db().execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    get_db().commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------


def booking_payload(data: dict) -> dict:
    amount = data.get("amount")
    try:
        amount = float(amount) if amount not in (None, "") else None
    except (TypeError, ValueError):
        amount = None
    return {
        "type": clean(data.get("type")) or "hotel",
        "title": clean(data.get("title")),
        "provider": clean(data.get("provider")),
        "confirmation": clean(data.get("confirmation")),
        "start_date": clean(data.get("start_date")) or None,
        "end_date": clean(data.get("end_date")) or None,
        "amount": amount,
        "currency": clean(data.get("currency")) or "EUR",
        "address": clean(data.get("address")),
        "lat": parse_float(data.get("lat")),
        "lng": parse_float(data.get("lng")),
        "notes": clean(data.get("notes")),
    }


@app.post("/api/trips/<int:trip_id>/bookings")
def create_booking(trip_id: int):
    if not trip_summary(trip_id):
        return jsonify({"error": "Trip not found."}), 404
    payload = booking_payload(json_body())
    if not payload["title"]:
        return jsonify({"error": "A booking title is required."}), 400
    db = get_db()
    cur = db.execute(
        """
        INSERT INTO bookings
            (trip_id, type, title, provider, confirmation, start_date, end_date, amount, currency, address, lat, lng, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            trip_id,
            payload["type"],
            payload["title"],
            payload["provider"],
            payload["confirmation"],
            payload["start_date"],
            payload["end_date"],
            payload["amount"],
            payload["currency"],
            payload["address"],
            payload["lat"],
            payload["lng"],
            payload["notes"],
        ),
    )
    db.commit()
    booking = row("SELECT * FROM bookings WHERE id = ?", (cur.lastrowid,))
    booking["documents"] = []
    return jsonify({"booking": booking}), 201


@app.put("/api/bookings/<int:booking_id>")
@app.patch("/api/bookings/<int:booking_id>")
def update_booking(booking_id: int):
    if not row("SELECT id FROM bookings WHERE id = ?", (booking_id,)):
        return jsonify({"error": "Booking not found."}), 404
    payload = booking_payload(json_body())
    get_db().execute(
        """
        UPDATE bookings SET type = ?, title = ?, provider = ?, confirmation = ?,
            start_date = ?, end_date = ?, amount = ?, currency = ?, address = ?, lat = ?, lng = ?, notes = ?
        WHERE id = ?
        """,
        (
            payload["type"],
            payload["title"] or "Untitled booking",
            payload["provider"],
            payload["confirmation"],
            payload["start_date"],
            payload["end_date"],
            payload["amount"],
            payload["currency"],
            payload["address"],
            payload["lat"],
            payload["lng"],
            payload["notes"],
            booking_id,
        ),
    )
    get_db().commit()
    booking = row("SELECT * FROM bookings WHERE id = ?", (booking_id,))
    booking["documents"] = [
        document_dict(d) for d in rows("SELECT * FROM documents WHERE booking_id = ?", (booking_id,))
    ]
    return jsonify({"booking": booking})


@app.delete("/api/bookings/<int:booking_id>")
def delete_booking(booking_id: int):
    if not row("SELECT id FROM bookings WHERE id = ?", (booking_id,)):
        return jsonify({"error": "Booking not found."}), 404
    db = get_db()
    db.execute("UPDATE documents SET booking_id = NULL WHERE booking_id = ?", (booking_id,))
    db.execute("DELETE FROM bookings WHERE id = ?", (booking_id,))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------


def transport_payload(data: dict) -> dict:
    amount = data.get("amount")
    try:
        amount = float(amount) if amount not in (None, "") else None
    except (TypeError, ValueError):
        amount = None
    scope = clean(data.get("scope")) or "arrival"
    if scope not in TRANSPORT_SCOPES:
        scope = "arrival"
    transport_type = clean(data.get("type")) or "flight"
    if transport_type not in TRANSPORT_TYPES:
        transport_type = "other"
    return {
        "scope": scope,
        "type": transport_type,
        "title": clean(data.get("title")),
        "provider": clean(data.get("provider")),
        "confirmation": clean(data.get("confirmation")),
        "from_place": clean(data.get("from_place")),
        "to_place": clean(data.get("to_place")),
        "depart_date": clean(data.get("depart_date")) or None,
        "depart_time": clean(data.get("depart_time")),
        "arrive_date": clean(data.get("arrive_date")) or None,
        "arrive_time": clean(data.get("arrive_time")),
        "amount": amount,
        "currency": clean(data.get("currency")) or "EUR",
        "notes": clean(data.get("notes")),
    }


@app.post("/api/trips/<int:trip_id>/transport")
def create_transport(trip_id: int):
    if not trip_summary(trip_id):
        return jsonify({"error": "Trip not found."}), 404
    payload = transport_payload(json_body())
    if not payload["title"]:
        return jsonify({"error": "A transport title is required."}), 400
    db = get_db()
    cur = db.execute(
        """
        INSERT INTO transport
            (trip_id, scope, type, title, provider, confirmation, from_place, to_place,
             depart_date, depart_time, arrive_date, arrive_time, amount, currency, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            trip_id,
            payload["scope"],
            payload["type"],
            payload["title"],
            payload["provider"],
            payload["confirmation"],
            payload["from_place"],
            payload["to_place"],
            payload["depart_date"],
            payload["depart_time"],
            payload["arrive_date"],
            payload["arrive_time"],
            payload["amount"],
            payload["currency"],
            payload["notes"],
        ),
    )
    db.commit()
    return jsonify({"transport": row("SELECT * FROM transport WHERE id = ?", (cur.lastrowid,))}), 201


@app.put("/api/transport/<int:transport_id>")
@app.patch("/api/transport/<int:transport_id>")
def update_transport(transport_id: int):
    if not row("SELECT id FROM transport WHERE id = ?", (transport_id,)):
        return jsonify({"error": "Transport not found."}), 404
    payload = transport_payload(json_body())
    get_db().execute(
        """
        UPDATE transport SET scope = ?, type = ?, title = ?, provider = ?, confirmation = ?,
            from_place = ?, to_place = ?, depart_date = ?, depart_time = ?, arrive_date = ?,
            arrive_time = ?, amount = ?, currency = ?, notes = ?
        WHERE id = ?
        """,
        (
            payload["scope"],
            payload["type"],
            payload["title"] or "Untitled transport",
            payload["provider"],
            payload["confirmation"],
            payload["from_place"],
            payload["to_place"],
            payload["depart_date"],
            payload["depart_time"],
            payload["arrive_date"],
            payload["arrive_time"],
            payload["amount"],
            payload["currency"],
            payload["notes"],
            transport_id,
        ),
    )
    get_db().commit()
    return jsonify({"transport": row("SELECT * FROM transport WHERE id = ?", (transport_id,))})


@app.delete("/api/transport/<int:transport_id>")
def delete_transport(transport_id: int):
    if not row("SELECT id FROM transport WHERE id = ?", (transport_id,)):
        return jsonify({"error": "Transport not found."}), 404
    get_db().execute("DELETE FROM transport WHERE id = ?", (transport_id,))
    get_db().commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


@app.post("/api/trips/<int:trip_id>/documents")
def upload_document(trip_id: int):
    if not trip_summary(trip_id):
        return jsonify({"error": "Trip not found."}), 404
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "No file was uploaded."}), 400

    booking_id = request.form.get("booking_id") or None
    if booking_id:
        booking = row("SELECT id FROM bookings WHERE id = ? AND trip_id = ?", (booking_id, trip_id))
        if not booking:
            booking_id = None
        else:
            booking_id = int(booking_id)

    original = secure_filename(file.filename) or "document"
    stored = f"{uuid.uuid4().hex}{Path(original).suffix.lower()}"
    destination = UPLOAD_DIR / stored
    file.save(destination)
    size = destination.stat().st_size
    mimetype = file.mimetype or ""

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO documents (trip_id, booking_id, name, stored_name, mimetype, size)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (trip_id, booking_id, original, stored, mimetype, size),
    )
    db.commit()
    document = document_dict(row("SELECT * FROM documents WHERE id = ?", (cur.lastrowid,)))
    return jsonify({"document": document}), 201


@app.get("/api/documents/<int:document_id>/download")
def download_document(document_id: int):
    document = row("SELECT * FROM documents WHERE id = ?", (document_id,))
    if not document:
        return jsonify({"error": "Document not found."}), 404
    return send_from_directory(
        UPLOAD_DIR,
        document["stored_name"],
        as_attachment=request.args.get("download") == "1",
        download_name=document["name"],
        mimetype=document["mimetype"] or None,
    )


@app.delete("/api/documents/<int:document_id>")
def delete_document(document_id: int):
    document = row("SELECT * FROM documents WHERE id = ?", (document_id,))
    if not document:
        return jsonify({"error": "Document not found."}), 404
    get_db().execute("DELETE FROM documents WHERE id = ?", (document_id,))
    get_db().commit()
    delete_stored_file(document["stored_name"])
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------


def recommendation_payload(data: dict) -> dict:
    return {
        "title": clean(data.get("title")),
        "category": clean(data.get("category")) or "place",
        "url": clean(data.get("url")),
        "address": clean(data.get("address")),
        "lat": parse_float(data.get("lat")),
        "lng": parse_float(data.get("lng")),
        "notes": clean(data.get("notes")),
    }


@app.post("/api/trips/<int:trip_id>/recommendations")
def create_recommendation(trip_id: int):
    if not trip_summary(trip_id):
        return jsonify({"error": "Trip not found."}), 404
    payload = recommendation_payload(json_body())
    if not payload["title"]:
        return jsonify({"error": "A name is required."}), 400
    db = get_db()
    cur = db.execute(
        """
        INSERT INTO recommendations (trip_id, title, category, url, address, lat, lng, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            trip_id,
            payload["title"],
            payload["category"],
            payload["url"],
            payload["address"],
            payload["lat"],
            payload["lng"],
            payload["notes"],
        ),
    )
    db.commit()
    return jsonify(
        {"recommendation": row("SELECT * FROM recommendations WHERE id = ?", (cur.lastrowid,))}
    ), 201


@app.put("/api/recommendations/<int:recommendation_id>")
@app.patch("/api/recommendations/<int:recommendation_id>")
def update_recommendation(recommendation_id: int):
    if not row("SELECT id FROM recommendations WHERE id = ?", (recommendation_id,)):
        return jsonify({"error": "Recommendation not found."}), 404
    payload = recommendation_payload(json_body())
    get_db().execute(
        """
        UPDATE recommendations SET title = ?, category = ?, url = ?, address = ?, lat = ?, lng = ?, notes = ?
        WHERE id = ?
        """,
        (
            payload["title"] or "Untitled",
            payload["category"],
            payload["url"],
            payload["address"],
            payload["lat"],
            payload["lng"],
            payload["notes"],
            recommendation_id,
        ),
    )
    get_db().commit()
    return jsonify(
        {"recommendation": row("SELECT * FROM recommendations WHERE id = ?", (recommendation_id,))}
    )


@app.delete("/api/recommendations/<int:recommendation_id>")
def delete_recommendation(recommendation_id: int):
    if not row("SELECT id FROM recommendations WHERE id = ?", (recommendation_id,)):
        return jsonify({"error": "Recommendation not found."}), 404
    get_db().execute("DELETE FROM recommendations WHERE id = ?", (recommendation_id,))
    get_db().commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Geocoding (Nominatim proxy)
# ---------------------------------------------------------------------------


@app.get("/api/geocode")
def geocode():
    query = clean(request.args.get("q"))
    if not query:
        return jsonify({"results": []})
    params = urlencode({"format": "jsonv2", "q": query, "limit": 5, "addressdetails": 1})
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = Request(
        url,
        headers={
            "User-Agent": "WanderlusstTravelOrganizer/1.0 (local personal app)",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=8) as response:
            import json

            data = json.loads(response.read().decode("utf-8"))
    except Exception as exc:  # pragma: no cover - network dependent
        return jsonify({"error": f"Could not reach the geocoding service: {exc}", "results": []}), 502
    results = [
        {
            "name": item.get("display_name", ""),
            "short_name": item.get("name", ""),
            "lat": float(item["lat"]),
            "lng": float(item["lon"]),
        }
        for item in data
        if item.get("lat") and item.get("lon")
    ]
    return jsonify({"results": results})


# ---------------------------------------------------------------------------
# Static SPA
# ---------------------------------------------------------------------------


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/<path:path>")
def static_files(path: str):
    candidate = STATIC_DIR / path
    if candidate.is_file():
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, "index.html")


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "That file is too large. The limit is 30 MB."}), 413


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG") == "1"
    print(f"\n  Wanderlusst Travel is running at http://127.0.0.1:{port}\n")
    app.run(host="127.0.0.1", port=port, debug=debug)
