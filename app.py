"""Wanderlusst Travel — a local-first travel organizer.

All user data lives under ``data/`` as readable JSON documents (one folder per
trip) plus a Markdown snapshot of each trip. Uploaded files stay in
``data/uploads/``.

Run with:  .venv/bin/python app.py
Then open: http://127.0.0.1:5000
"""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import threading
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
TRIPS_DIR = DATA_DIR / "trips"
BACKUP_DIR = DATA_DIR / "backups"
UPLOAD_DIR = DATA_DIR / "uploads"
META_PATH = DATA_DIR / "meta.json"
DB_PATH = DATA_DIR / "wayfarer.db"
STATIC_DIR = BASE_DIR / "static"

MAX_UPLOAD_BYTES = 30 * 1024 * 1024  # 30 MB

DATA_DIR.mkdir(parents=True, exist_ok=True)
TRIPS_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

STARTER_TASKS = [
    ("Reservar alojamiento", "hotel"),
    ("Revisar los requisitos de visado", "visa"),
    ("Reservar transporte (vuelos / trenes)", "transport"),
    ("Contratar el seguro de viaje", "documents"),
]

COLLECTIONS = ("trips", "days", "activities", "tasks", "bookings", "documents", "recommendations", "transport")

TRIP_FIELDS = (
    "id",
    "title",
    "location",
    "description",
    "status",
    "start_date",
    "end_date",
    "lat",
    "lng",
    "icon_image",
    "cover_image",
    "created_at",
)

DAY_FIELDS = ("id", "trip_id", "day_number", "date", "title", "notes")
ACTIVITY_FIELDS = (
    "id",
    "trip_id",
    "day_id",
    "time",
    "title",
    "category",
    "location",
    "lat",
    "lng",
    "notes",
    "done",
    "sort_order",
)
TASK_FIELDS = ("id", "trip_id", "title", "category", "status", "due_date", "notes", "created_at")
BOOKING_FIELDS = (
    "id",
    "trip_id",
    "type",
    "title",
    "provider",
    "confirmation",
    "start_date",
    "end_date",
    "amount",
    "currency",
    "address",
    "lat",
    "lng",
    "notes",
    "created_at",
)
DOCUMENT_FIELDS = (
    "id",
    "trip_id",
    "booking_id",
    "transport_id",
    "name",
    "stored_name",
    "mimetype",
    "size",
    "uploaded_at",
)
RECOMMENDATION_FIELDS = (
    "id",
    "trip_id",
    "title",
    "category",
    "url",
    "address",
    "lat",
    "lng",
    "notes",
    "kind",
    "table_columns",
    "table_rows",
    "created_at",
)
TRANSPORT_FIELDS = (
    "id",
    "trip_id",
    "scope",
    "type",
    "title",
    "provider",
    "confirmation",
    "from_place",
    "to_place",
    "depart_date",
    "depart_time",
    "arrive_date",
    "arrive_time",
    "amount",
    "currency",
    "notes",
    "created_at",
)

# A single process-wide lock keeps read-modify-write cycles safe. The app is
# designed for one local user, so this is enough (and avoids partial writes).
LOCK = threading.RLock()


# ---------------------------------------------------------------------------
# File storage helpers
# ---------------------------------------------------------------------------


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def _default_meta() -> dict:
    return {"next_ids": {name: 1 for name in COLLECTIONS}}


def _load_meta() -> dict:
    if META_PATH.exists():
        try:
            data = json.loads(META_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
    else:
        data = {}
    meta = _default_meta()
    next_ids = data.get("next_ids") if isinstance(data, dict) else None
    if isinstance(next_ids, dict):
        for name in COLLECTIONS:
            try:
                meta["next_ids"][name] = max(1, int(next_ids.get(name, 1)))
            except (TypeError, ValueError):
                pass
    return meta


def _save_meta(meta: dict) -> None:
    _atomic_write(META_PATH, json.dumps(meta, ensure_ascii=False, indent=2) + "\n")


def next_id(kind: str) -> int:
    with LOCK:
        meta = _load_meta()
        value = int(meta["next_ids"].get(kind, 1))
        meta["next_ids"][kind] = value + 1
        _save_meta(meta)
        return value


def trip_dir(trip_id: int) -> Path:
    return TRIPS_DIR / str(trip_id)


def trip_path(trip_id: int) -> Path:
    return trip_dir(trip_id) / "trip.json"


def _normalise_item(item: dict, fields: tuple[str, ...], defaults: dict | None = None) -> dict:
    result = {field: item.get(field) for field in fields}
    if defaults:
        for key, value in defaults.items():
            if result.get(key) in (None, ""):
                result[key] = value
    return result


def _normalise_trip(trip: dict) -> dict:
    trip = dict(trip)
    for field in TRIP_FIELDS:
        trip.setdefault(field, None)
    trip["description"] = trip.get("description") or ""
    trip["status"] = trip.get("status") or 0
    trip["icon_image"] = trip.get("icon_image") or ""
    trip["cover_image"] = trip.get("cover_image") or ""
    trip["created_at"] = trip.get("created_at") or utc_now()

    days = []
    for day in trip.get("days") or []:
        raw_activities = day.get("activities") or []
        day = _normalise_item(day, DAY_FIELDS, {"title": "", "notes": ""})
        day["trip_id"] = trip["id"]
        activities = []
        for activity in raw_activities:
            activity = _normalise_item(
                activity,
                ACTIVITY_FIELDS,
                {"time": "", "category": "activity", "location": "", "notes": "", "done": 0, "sort_order": 0},
            )
            activity["trip_id"] = trip["id"]
            activity["day_id"] = day["id"]
            activity["done"] = 1 if activity.get("done") else 0
            activities.append(activity)
        day["activities"] = activities
        days.append(day)
    trip["days"] = days

    trip["tasks"] = [
        _normalise_item(task, TASK_FIELDS, {"category": "other", "status": "todo", "notes": "", "created_at": utc_now()})
        for task in trip.get("tasks") or []
    ]
    trip["bookings"] = [
        _normalise_item(
            booking,
            BOOKING_FIELDS,
            {"type": "hotel", "provider": "", "confirmation": "", "currency": "EUR", "address": "", "notes": "", "created_at": utc_now()},
        )
        for booking in trip.get("bookings") or []
    ]
    trip["documents"] = [
        _normalise_item(
            document,
            DOCUMENT_FIELDS,
            {"mimetype": "", "size": 0, "uploaded_at": utc_now()},
        )
        for document in trip.get("documents") or []
    ]
    recommendations = []
    for rec in trip.get("recommendations") or []:
        rec = _normalise_item(
            rec,
            RECOMMENDATION_FIELDS,
            {"category": "place", "url": "", "address": "", "notes": "", "kind": "idea", "created_at": utc_now()},
        )
        rec["kind"] = rec.get("kind") or "idea"
        rec["table_columns"] = rec.get("table_columns") if isinstance(rec.get("table_columns"), list) else []
        rec["table_rows"] = rec.get("table_rows") if isinstance(rec.get("table_rows"), list) else []
        recommendations.append(rec)
    trip["recommendations"] = recommendations
    trip["transport"] = [
        _normalise_item(
            leg,
            TRANSPORT_FIELDS,
            {
                "scope": "arrival",
                "type": "flight",
                "provider": "",
                "confirmation": "",
                "from_place": "",
                "to_place": "",
                "depart_time": "",
                "arrive_time": "",
                "currency": "EUR",
                "notes": "",
                "created_at": utc_now(),
            },
        )
        for leg in trip.get("transport") or []
    ]
    return trip


def read_trip(trip_id: int) -> dict | None:
    path = trip_path(trip_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    return _normalise_trip(data)


def all_trips() -> list[dict]:
    trips = []
    for directory in sorted(TRIPS_DIR.iterdir(), key=lambda p: p.name):
        if not directory.is_dir() or not directory.name.isdigit():
            continue
        trip = read_trip(int(directory.name))
        if trip:
            trips.append(trip)
    return trips


def save_trip(trip: dict) -> None:
    with LOCK:
        trip = _normalise_trip(trip)
        _atomic_write(trip_path(trip["id"]), json.dumps(trip, ensure_ascii=False, indent=2) + "\n")
        _atomic_write(trip_dir(trip["id"]) / "viaje.md", trip_markdown(trip))


def delete_trip_dir(trip_id: int) -> None:
    directory = trip_dir(trip_id)
    if directory.exists():
        shutil.rmtree(directory, ignore_errors=True)


def find_item(collection: str, item_id: int) -> tuple[dict | None, dict | None]:
    for trip in all_trips():
        if collection == "trips":
            if trip["id"] == item_id:
                return trip, trip
        elif collection == "days":
            for day in trip["days"]:
                if day["id"] == item_id:
                    return trip, day
        elif collection == "activities":
            for day in trip["days"]:
                for activity in day["activities"]:
                    if activity["id"] == item_id:
                        return trip, activity
        else:
            for item in trip.get(collection, []):
                if item["id"] == item_id:
                    return trip, item
    return None, None


def _compute_maxima() -> dict:
    maxima = {name: 0 for name in COLLECTIONS}
    for trip in all_trips():
        maxima["trips"] = max(maxima["trips"], int(trip["id"]))
        for day in trip["days"]:
            maxima["days"] = max(maxima["days"], int(day["id"]))
            for activity in day["activities"]:
                maxima["activities"] = max(maxima["activities"], int(activity["id"]))
        for collection in ("tasks", "bookings", "documents", "recommendations", "transport"):
            for item in trip.get(collection, []):
                maxima[collection] = max(maxima[collection], int(item["id"]))
    return maxima


def bootstrap_meta() -> None:
    """Make sure the ID counters are above every existing record."""
    with LOCK:
        meta = _load_meta()
        maxima = _compute_maxima()
        changed = False
        for name in COLLECTIONS:
            wanted = maxima[name] + 1
            if int(meta["next_ids"].get(name, 1)) < wanted:
                meta["next_ids"][name] = wanted
                changed = True
        if changed or not META_PATH.exists():
            _save_meta(meta)


# ---------------------------------------------------------------------------
# One-time SQLite migration
# ---------------------------------------------------------------------------


def _sqlite_rows(db: sqlite3.Connection, table: str) -> list[dict]:
    try:
        return [dict(row) for row in db.execute(f"SELECT * FROM {table}").fetchall()]
    except sqlite3.Error:
        return []


def _json_list(value) -> list:
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value or "[]")
    except (TypeError, ValueError):
        return []
    return parsed if isinstance(parsed, list) else []


def migrate_sqlite_if_needed() -> None:
    """Import the old SQLite database once, then archive it."""
    if not DB_PATH.exists():
        return
    already_migrated = any(TRIPS_DIR.glob("*/trip.json"))
    if already_migrated:
        _archive_database()
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        trips = _sqlite_rows(conn, "trips")
        if not trips:
            _archive_database()
            return

        days = _sqlite_rows(conn, "days")
        activities = _sqlite_rows(conn, "activities")
        tasks = _sqlite_rows(conn, "tasks")
        bookings = _sqlite_rows(conn, "bookings")
        documents = _sqlite_rows(conn, "documents")
        recommendations = _sqlite_rows(conn, "recommendations")
        transport = _sqlite_rows(conn, "transport")
    finally:
        conn.close()

    for trip_row in trips:
        trip_id = int(trip_row["id"])
        trip = {field: trip_row.get(field) for field in TRIP_FIELDS}
        trip["days"] = []
        for day_row in sorted((d for d in days if int(d["trip_id"]) == trip_id), key=lambda d: (d.get("day_number") or 0, d["id"])):
            day = {field: day_row.get(field) for field in DAY_FIELDS}
            day["activities"] = []
            for activity_row in sorted(
                (a for a in activities if int(a["day_id"]) == int(day_row["id"])),
                key=lambda a: a["id"],
            ):
                day["activities"].append({field: activity_row.get(field) for field in ACTIVITY_FIELDS})
            trip["days"].append(day)

        trip["tasks"] = [{field: item.get(field) for field in TASK_FIELDS} for item in tasks if int(item["trip_id"]) == trip_id]
        trip["bookings"] = [
            {field: item.get(field) for field in BOOKING_FIELDS} for item in bookings if int(item["trip_id"]) == trip_id
        ]
        trip["documents"] = [
            {field: item.get(field) for field in DOCUMENT_FIELDS} for item in documents if int(item["trip_id"]) == trip_id
        ]
        trip["recommendations"] = []
        for item in recommendations:
            if int(item["trip_id"]) != trip_id:
                continue
            rec = {field: item.get(field) for field in RECOMMENDATION_FIELDS}
            rec["kind"] = item.get("kind") or "idea"
            rec["table_columns"] = _json_list(item.get("table_columns"))
            rec["table_rows"] = _json_list(item.get("table_rows"))
            trip["recommendations"].append(rec)
        trip["transport"] = [
            {field: item.get(field) for field in TRANSPORT_FIELDS} for item in transport if int(item["trip_id"]) == trip_id
        ]
        save_trip(trip)

    _archive_database()


def _archive_database() -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    destination = BACKUP_DIR / f"wayfarer-{stamp}.db"
    counter = 1
    while destination.exists():
        destination = BACKUP_DIR / f"wayfarer-{stamp}-{counter}.db"
        counter += 1
    try:
        shutil.move(str(DB_PATH), str(destination))
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Markdown snapshot
# ---------------------------------------------------------------------------


def _md(value) -> str:
    text = "" if value is None else str(value)
    return text.replace("|", "\\|").replace("\n", " ")


def trip_markdown(trip: dict) -> str:
    lines: list[str] = []
    title = trip.get("title") or f"Viaje {trip.get('id')}"
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"- **Destino:** {_md(trip.get('location'))}")
    lines.append(f"- **Inicio:** {_md(trip.get('start_date') or '—')}")
    lines.append(f"- **Fin:** {_md(trip.get('end_date') or '—')}")
    if trip.get("description"):
        lines.append("")
        lines.append(_md(trip["description"]))
    lines.append("")

    days = sorted(trip["days"], key=lambda d: (d.get("day_number") or 0, d["id"]))
    if days:
        lines.append("## Itinerario")
        lines.append("")
        for day in days:
            heading = f"### Día {day.get('day_number')} · {_md(day.get('date') or 'sin fecha')}"
            if day.get("title"):
                heading += f" · {_md(day['title'])}"
            lines.append(heading)
            if day.get("notes"):
                lines.append("")
                lines.append(_md(day["notes"]))
            activities = sort_activities(day["activities"])
            if activities:
                lines.append("")
                for activity in activities:
                    when = f"{activity['time']} — " if activity.get("time") else ""
                    mark = "x" if activity.get("done") else " "
                    details = []
                    if activity.get("location"):
                        details.append(_md(activity["location"]))
                    if activity.get("notes"):
                        details.append(_md(activity["notes"]))
                    suffix = f" ({'; '.join(details)})" if details else ""
                    lines.append(f"- [{mark}] {when}{_md(activity.get('title'))}{suffix}")
            lines.append("")

    if trip["tasks"]:
        lines.append("## Tareas")
        lines.append("")
        for task in sort_tasks(trip["tasks"]):
            mark = "x" if task.get("status") == "done" else " "
            status = "" if task.get("status") == "done" else f" [{task.get('status')}]"
            due = f" — vence {_md(task['due_date'])}" if task.get("due_date") else ""
            notes = f" ({_md(task['notes'])})" if task.get("notes") else ""
            lines.append(f"- [{mark}] {_md(task.get('title'))}{status}{due}{notes}")
        lines.append("")

    if trip["transport"]:
        lines.append("## Transporte")
        lines.append("")
        for leg in sort_transport(trip["transport"]):
            route = f"{_md(leg.get('from_place'))} → {_md(leg.get('to_place'))}"
            when = " ".join(part for part in (leg.get("depart_date"), leg.get("depart_time")) if part)
            lines.append(f"- **{_md(leg.get('title'))}** ({_md(leg.get('type'))}, {_md(leg.get('scope'))}) — {route} — {_md(when)}")
            extra = []
            if leg.get("provider"):
                extra.append(f"Proveedor: {_md(leg['provider'])}")
            if leg.get("confirmation"):
                extra.append(f"Confirmación: {_md(leg['confirmation'])}")
            if leg.get("amount") is not None:
                extra.append(f"Importe: {_md(leg['amount'])} {_md(leg.get('currency'))}")
            if extra:
                lines.append(f"  - {' · '.join(extra)}")
            if leg.get("notes"):
                lines.append(f"  - {_md(leg['notes'])}")
        lines.append("")

    if trip["bookings"]:
        lines.append("## Reservas")
        lines.append("")
        for booking in sort_bookings(trip["bookings"]):
            dates = ""
            if booking.get("start_date") or booking.get("end_date"):
                dates = f" — {_md(booking.get('start_date') or '?')} → {_md(booking.get('end_date') or '?')}"
            lines.append(f"- **{_md(booking.get('title'))}** ({_md(booking.get('type'))}){dates}")
            extra = []
            if booking.get("provider"):
                extra.append(f"Proveedor: {_md(booking['provider'])}")
            if booking.get("confirmation"):
                extra.append(f"Confirmación: {_md(booking['confirmation'])}")
            if booking.get("amount") is not None:
                extra.append(f"Importe: {_md(booking['amount'])} {_md(booking.get('currency'))}")
            if booking.get("address"):
                extra.append(f"Dirección: {_md(booking['address'])}")
            if extra:
                lines.append(f"  - {' · '.join(extra)}")
            if booking.get("notes"):
                lines.append(f"  - {_md(booking['notes'])}")
        lines.append("")

    if trip["recommendations"]:
        lines.append("## Ideas y comparativas")
        lines.append("")
        for rec in sort_recommendations(trip["recommendations"]):
            lines.append(f"### {_md(rec.get('title'))} ({_md(rec.get('category'))})")
            lines.append("")
            if rec.get("kind") == "table":
                columns = rec.get("table_columns") or []
                rows = rec.get("table_rows") or []
                if columns:
                    lines.append("| " + " | ".join(_md(column) for column in columns) + " |")
                    lines.append("|" + "|".join("---" for _ in columns) + "|")
                    for row in rows:
                        cells = list(row)[: len(columns)]
                        cells += [""] * (len(columns) - len(cells))
                        lines.append("| " + " | ".join(_md(cell) for cell in cells) + " |")
                    lines.append("")
            if rec.get("address"):
                lines.append(f"- **Dirección:** {_md(rec['address'])}")
            if rec.get("url"):
                lines.append(f"- **Enlace:** {_md(rec['url'])}")
            if rec.get("notes"):
                lines.append(f"- {_md(rec['notes'])}")
            if rec.get("kind") != "table":
                lines.append("")
        lines.append("")

    if trip["documents"]:
        lines.append("## Documentos")
        lines.append("")
        for document in sort_documents(trip["documents"]):
            size = document.get("size") or 0
            lines.append(f"- {_md(document.get('name'))} ({size} bytes) — `{_md(document.get('stored_name'))}`")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


# ---------------------------------------------------------------------------
# Shared presentation / sorting helpers
# ---------------------------------------------------------------------------


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


def sort_days(days: list[dict]) -> list[dict]:
    return sorted(days, key=lambda d: (d.get("day_number") or 0, d["id"]))


def sort_activities(activities: list[dict]) -> list[dict]:
    return sorted(
        activities,
        key=lambda a: (not bool(a.get("time")), a.get("time") or "", a.get("sort_order") or 0, a["id"]),
    )


def sort_tasks(tasks: list[dict]) -> list[dict]:
    rank = {"doing": 0, "todo": 1}
    ordered = sorted(tasks, key=lambda t: (t.get("created_at") or "", t["id"]), reverse=True)
    ordered.sort(key=lambda t: (rank.get(t.get("status"), 2), t.get("due_date") is None, t.get("due_date") or ""))
    return ordered


def sort_bookings(bookings: list[dict]) -> list[dict]:
    return sorted(
        bookings,
        key=lambda b: (b.get("start_date") is None, b.get("start_date") or "", b.get("created_at") or "", b["id"]),
    )


def sort_documents(documents: list[dict]) -> list[dict]:
    return sorted(documents, key=lambda d: (d.get("uploaded_at") or "", d["id"]), reverse=True)


def sort_recommendations(recommendations: list[dict]) -> list[dict]:
    return sorted(recommendations, key=lambda r: (r.get("created_at") or "", r["id"]), reverse=True)


def sort_transport(transport: list[dict]) -> list[dict]:
    return sorted(
        transport,
        key=lambda t: (
            t.get("depart_date") is None,
            t.get("depart_date") or "",
            t.get("depart_time") or "",
            t.get("created_at") or "",
            t["id"],
        ),
    )


def trip_summary(trip: dict) -> dict:
    activities = [activity for day in trip["days"] for activity in day["activities"]]
    summary = {field: trip.get(field) for field in TRIP_FIELDS}
    summary.update(
        {
            "day_count": len(trip["days"]),
            "task_total": len(trip["tasks"]),
            "task_done": sum(1 for task in trip["tasks"] if task.get("status") == "done"),
            "task_doing": sum(1 for task in trip["tasks"] if task.get("status") == "doing"),
            "activity_count": len(activities),
            "activity_done": sum(1 for activity in activities if activity.get("done")),
            "booking_count": len(trip["bookings"]),
            "doc_count": len(trip["documents"]),
            "recommendation_count": len(trip["recommendations"]),
            "transport_count": len(trip["transport"]),
        }
    )
    return with_task_progress(summary)


def document_dict(doc: dict) -> dict:
    doc = dict(doc)
    doc["url"] = f"/api/documents/{doc['id']}/download"
    return doc


def recommendation_dict(rec: dict) -> dict:
    rec = dict(rec)
    rec["kind"] = rec.get("kind") or "idea"
    rec["table_columns"] = rec.get("table_columns") if isinstance(rec.get("table_columns"), list) else []
    rec["table_rows"] = rec.get("table_rows") if isinstance(rec.get("table_rows"), list) else []
    return rec


def day_dict(day: dict, include_activities: bool = False) -> dict:
    result = {field: day.get(field) for field in DAY_FIELDS}
    if include_activities:
        result["activities"] = [dict(activity) for activity in sort_activities(day["activities"])]
    return result


def delete_stored_file(stored_name: str) -> None:
    if not stored_name:
        return
    target = (UPLOAD_DIR / stored_name).resolve()
    if target.parent == UPLOAD_DIR.resolve() and target.exists():
        try:
            target.unlink()
        except OSError:
            pass


def add_days_for_trip(trip: dict, start: str | None, end: str | None, count: int | None) -> int:
    """Create days for a new trip. Returns the number of days created."""
    dates: list[str | None] = []
    try:
        if start and end:
            start_d = date.fromisoformat(start)
            end_d = date.fromisoformat(end)
            if end_d < start_d:
                raise ValueError("La fecha de fin no puede ser anterior a la de inicio.")
            dates = [(start_d + timedelta(days=i)).isoformat() for i in range((end_d - start_d).days + 1)]
        elif start and count:
            start_d = date.fromisoformat(start)
            dates = [(start_d + timedelta(days=i)).isoformat() for i in range(count)]
        elif count:
            dates = [None] * count
    except ValueError as exc:
        raise ValueError(str(exc)) from exc

    for index, day_date in enumerate(dates, start=1):
        trip["days"].append(
            {
                "id": next_id("days"),
                "trip_id": trip["id"],
                "day_number": index,
                "date": day_date,
                "title": f"Día {index}",
                "notes": "",
                "activities": [],
            }
        )
    return len(dates)


def renumber_days(trip: dict) -> None:
    for index, day in enumerate(sort_days(trip["days"]), start=1):
        day["day_number"] = index


def json_body() -> dict:
    return request.get_json(silent=True) or {}


# ---------------------------------------------------------------------------
# Trips
# ---------------------------------------------------------------------------


@app.get("/api/trips")
def list_trips():
    trips = [trip_summary(trip) for trip in all_trips()]
    # created_at DESC first, then the SQL ordering on start_date (stable sorts)
    trips.sort(key=lambda t: (t.get("created_at") or "", t["id"]), reverse=True)
    trips.sort(key=lambda t: (t.get("start_date") is None, t.get("start_date") or ""))
    return jsonify({"trips": trips})


@app.post("/api/trips")
def create_trip():
    data = json_body()
    location = clean(data.get("location"))
    if not location:
        return jsonify({"error": "El destino es obligatorio."}), 400

    title = clean(data.get("title")) or f"Viaje a {location}"
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
            return jsonify({"error": "Las fechas deben tener el formato AAAA-MM-DD."}), 400
        if end_d < start_d:
            return jsonify({"error": "La fecha de fin no puede ser anterior a la de inicio."}), 400
        count = (end_d - start_d).days + 1
    elif start_date and not count:
        count = 1
    elif count is None:
        count = 1

    trip = {
        "id": next_id("trips"),
        "title": title,
        "location": location,
        "description": clean(data.get("description")),
        "status": 0,
        "start_date": start_date,
        "end_date": end_date,
        "lat": parse_float(data.get("lat")),
        "lng": parse_float(data.get("lng")),
        "icon_image": "",
        "cover_image": "",
        "created_at": utc_now(),
        "days": [],
        "tasks": [],
        "bookings": [],
        "documents": [],
        "recommendations": [],
        "transport": [],
    }
    try:
        add_days_for_trip(trip, start_date, end_date, count)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    for task_title, category in STARTER_TASKS:
        trip["tasks"].append(
            {
                "id": next_id("tasks"),
                "trip_id": trip["id"],
                "title": task_title,
                "category": category,
                "status": "todo",
                "due_date": None,
                "notes": "",
                "created_at": utc_now(),
            }
        )

    save_trip(trip)
    return jsonify({"trip": trip_summary(read_trip(trip["id"]))}), 201


@app.get("/api/trips/<int:trip_id>")
def get_trip(trip_id: int):
    trip = read_trip(trip_id)
    if not trip:
        return jsonify({"error": "No se ha encontrado el viaje."}), 404

    documents = [document_dict(document) for document in sort_documents(trip["documents"])]
    docs_by_booking: dict[int, list[dict]] = {}
    docs_by_transport: dict[int, list[dict]] = {}
    for document in documents:
        if document["booking_id"]:
            docs_by_booking.setdefault(document["booking_id"], []).append(document)
        if document.get("transport_id"):
            docs_by_transport.setdefault(document["transport_id"], []).append(document)

    bookings = []
    for booking in sort_bookings(trip["bookings"]):
        item = dict(booking)
        item["documents"] = docs_by_booking.get(item["id"], [])
        bookings.append(item)

    transport = []
    for leg in sort_transport(trip["transport"]):
        item = dict(leg)
        item["documents"] = docs_by_transport.get(item["id"], [])
        transport.append(item)

    return jsonify(
        {
            "trip": trip_summary(trip),
            "days": [day_dict(day, include_activities=True) for day in sort_days(trip["days"])],
            "tasks": [dict(task) for task in sort_tasks(trip["tasks"])],
            "bookings": bookings,
            "documents": documents,
            "recommendations": [recommendation_dict(rec) for rec in sort_recommendations(trip["recommendations"])],
            "transport": transport,
        }
    )


@app.put("/api/trips/<int:trip_id>")
@app.patch("/api/trips/<int:trip_id>")
def update_trip(trip_id: int):
    trip = read_trip(trip_id)
    if not trip:
        return jsonify({"error": "No se ha encontrado el viaje."}), 404
    data = json_body()

    for key in ("title", "location", "description"):
        if key in data:
            trip[key] = clean(data.get(key))
    for key in ("start_date", "end_date"):
        if key in data:
            trip[key] = clean(data.get(key)) or None
    for key in ("lat", "lng"):
        if key in data:
            trip[key] = parse_float(data.get(key))

    save_trip(trip)
    return jsonify({"trip": trip_summary(read_trip(trip_id))})


@app.delete("/api/trips/<int:trip_id>")
def delete_trip(trip_id: int):
    trip = read_trip(trip_id)
    if not trip:
        return jsonify({"error": "No se ha encontrado el viaje."}), 404
    documents = list(trip["documents"])
    icon_image = trip.get("icon_image")
    cover_image = trip.get("cover_image")
    delete_trip_dir(trip_id)
    for doc in documents:
        delete_stored_file(doc.get("stored_name"))
    delete_stored_file(icon_image)
    delete_stored_file(cover_image)
    return jsonify({"ok": True})


TRIP_IMAGE_COLUMNS = {"icon": "icon_image", "cover": "cover_image"}
TRIP_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}


@app.post("/api/trips/<int:trip_id>/images")
def upload_trip_image(trip_id: int):
    trip = read_trip(trip_id)
    if not trip:
        return jsonify({"error": "No se ha encontrado el viaje."}), 404

    kind = clean(request.form.get("kind"))
    if kind not in TRIP_IMAGE_COLUMNS:
        return jsonify({"error": "Elige un icono o una imagen de cabecera."}), 400

    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "No se ha subido ninguna imagen."}), 400

    original = secure_filename(file.filename) or "image"
    extension = Path(original).suffix.lower()
    if extension not in TRIP_IMAGE_EXTENSIONS:
        return jsonify({"error": "Usa una imagen PNG, JPG, WebP, GIF o AVIF."}), 400
    if file.mimetype and not file.mimetype.startswith("image/"):
        return jsonify({"error": "Ese archivo no parece una imagen."}), 400

    stored = f"trip-{trip_id}-{kind}-{uuid.uuid4().hex}{extension}"
    file.save(UPLOAD_DIR / stored)

    column = TRIP_IMAGE_COLUMNS[kind]
    old_name = trip.get(column)
    trip[column] = stored
    save_trip(trip)
    delete_stored_file(old_name)
    return jsonify({"trip": trip_summary(read_trip(trip_id))})


@app.get("/api/trips/<int:trip_id>/images/<kind>")
def get_trip_image(trip_id: int, kind: str):
    if kind not in TRIP_IMAGE_COLUMNS:
        return jsonify({"error": "No se ha encontrado la imagen."}), 404
    trip = read_trip(trip_id)
    stored = trip.get(TRIP_IMAGE_COLUMNS[kind]) if trip else ""
    if not stored:
        return jsonify({"error": "No se ha encontrado la imagen."}), 404
    return send_from_directory(UPLOAD_DIR, stored, max_age=31536000)


@app.delete("/api/trips/<int:trip_id>/images/<kind>")
def delete_trip_image(trip_id: int, kind: str):
    if kind not in TRIP_IMAGE_COLUMNS:
        return jsonify({"error": "No se ha encontrado la imagen."}), 404
    trip = read_trip(trip_id)
    if not trip:
        return jsonify({"error": "No se ha encontrado el viaje."}), 404
    column = TRIP_IMAGE_COLUMNS[kind]
    old_name = trip.get(column)
    trip[column] = ""
    save_trip(trip)
    delete_stored_file(old_name)
    return jsonify({"trip": trip_summary(read_trip(trip_id))})


# ---------------------------------------------------------------------------
# Days
# ---------------------------------------------------------------------------


@app.post("/api/trips/<int:trip_id>/days")
def create_day(trip_id: int):
    trip = read_trip(trip_id)
    if not trip:
        return jsonify({"error": "No se ha encontrado el viaje."}), 404
    data = json_body()
    number = max((int(day.get("day_number") or 0) for day in trip["days"]), default=0) + 1
    day = {
        "id": next_id("days"),
        "trip_id": trip_id,
        "day_number": number,
        "date": clean(data.get("date")) or None,
        "title": clean(data.get("title")) or f"Día {number}",
        "notes": clean(data.get("notes")),
        "activities": [],
    }
    trip["days"].append(day)
    save_trip(trip)
    return jsonify({"day": day_dict(day)}), 201


@app.put("/api/days/<int:day_id>")
@app.patch("/api/days/<int:day_id>")
def update_day(day_id: int):
    trip, day = find_item("days", day_id)
    if not day:
        return jsonify({"error": "No se ha encontrado el día."}), 404
    data = json_body()
    for key in ("title", "notes"):
        if key in data:
            day[key] = clean(data.get(key))
    if "date" in data:
        day["date"] = clean(data.get("date")) or None
    save_trip(trip)
    return jsonify({"day": day_dict(day)})


@app.delete("/api/days/<int:day_id>")
def delete_day(day_id: int):
    trip, day = find_item("days", day_id)
    if not day:
        return jsonify({"error": "No se ha encontrado el día."}), 404
    trip["days"] = [item for item in trip["days"] if item["id"] != day_id]
    renumber_days(trip)
    save_trip(trip)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------


@app.post("/api/days/<int:day_id>/activities")
def create_activity(day_id: int):
    trip, day = find_item("days", day_id)
    if not day:
        return jsonify({"error": "No se ha encontrado el día."}), 404
    data = json_body()
    title = clean(data.get("title"))
    if not title:
        return jsonify({"error": "El título de la actividad es obligatorio."}), 400
    order = max((int(activity.get("sort_order") or 0) for activity in day["activities"]), default=0) + 1
    activity = {
        "id": next_id("activities"),
        "trip_id": trip["id"],
        "day_id": day_id,
        "time": clean(data.get("time")),
        "title": title,
        "category": clean(data.get("category")) or "activity",
        "location": clean(data.get("location")),
        "lat": parse_float(data.get("lat")),
        "lng": parse_float(data.get("lng")),
        "notes": clean(data.get("notes")),
        "done": 1 if data.get("done") else 0,
        "sort_order": order,
    }
    day["activities"].append(activity)
    save_trip(trip)
    return jsonify({"activity": dict(activity)}), 201


@app.put("/api/activities/<int:activity_id>")
@app.patch("/api/activities/<int:activity_id>")
def update_activity(activity_id: int):
    trip, activity = find_item("activities", activity_id)
    if not activity:
        return jsonify({"error": "No se ha encontrado la actividad."}), 404
    data = json_body()
    for key in ("time", "title", "category", "location", "notes"):
        if key in data:
            activity[key] = clean(data.get(key))
    for key in ("lat", "lng"):
        if key in data:
            activity[key] = parse_float(data.get(key))
    if "done" in data:
        activity["done"] = 1 if data.get("done") else 0
    if "sort_order" in data:
        activity["sort_order"] = int(data.get("sort_order") or 0)
    save_trip(trip)
    return jsonify({"activity": dict(activity)})


@app.delete("/api/activities/<int:activity_id>")
def delete_activity(activity_id: int):
    trip, activity = find_item("activities", activity_id)
    if not activity:
        return jsonify({"error": "No se ha encontrado la actividad."}), 404
    for day in trip["days"]:
        day["activities"] = [item for item in day["activities"] if item["id"] != activity_id]
    save_trip(trip)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


@app.post("/api/trips/<int:trip_id>/tasks")
def create_task(trip_id: int):
    trip = read_trip(trip_id)
    if not trip:
        return jsonify({"error": "No se ha encontrado el viaje."}), 404
    data = json_body()
    title = clean(data.get("title"))
    if not title:
        return jsonify({"error": "El título de la tarea es obligatorio."}), 400
    status = clean(data.get("status")) or "todo"
    if status not in ("todo", "doing", "done"):
        status = "todo"
    task = {
        "id": next_id("tasks"),
        "trip_id": trip_id,
        "title": title,
        "category": clean(data.get("category")) or "other",
        "status": status,
        "due_date": clean(data.get("due_date")) or None,
        "notes": clean(data.get("notes")),
        "created_at": utc_now(),
    }
    trip["tasks"].append(task)
    save_trip(trip)
    return jsonify({"task": dict(task)}), 201


@app.put("/api/tasks/<int:task_id>")
@app.patch("/api/tasks/<int:task_id>")
def update_task(task_id: int):
    trip, task = find_item("tasks", task_id)
    if not task:
        return jsonify({"error": "No se ha encontrado la tarea."}), 404
    data = json_body()
    for key in ("title", "category", "notes"):
        if key in data:
            task[key] = clean(data.get(key))
    if "status" in data:
        status = clean(data.get("status"))
        if status not in ("todo", "doing", "done"):
            return jsonify({"error": "Estado de tarea no válido."}), 400
        task["status"] = status
    if "due_date" in data:
        task["due_date"] = clean(data.get("due_date")) or None
    save_trip(trip)
    return jsonify({"task": dict(task)})


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id: int):
    trip, task = find_item("tasks", task_id)
    if not task:
        return jsonify({"error": "No se ha encontrado la tarea."}), 404
    trip["tasks"] = [item for item in trip["tasks"] if item["id"] != task_id]
    save_trip(trip)
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
    trip = read_trip(trip_id)
    if not trip:
        return jsonify({"error": "No se ha encontrado el viaje."}), 404
    payload = booking_payload(json_body())
    if not payload["title"]:
        return jsonify({"error": "El título de la reserva es obligatorio."}), 400
    booking = {
        "id": next_id("bookings"),
        "trip_id": trip_id,
        **payload,
        "created_at": utc_now(),
    }
    trip["bookings"].append(booking)
    save_trip(trip)
    result = dict(booking)
    result["documents"] = []
    return jsonify({"booking": result}), 201


@app.put("/api/bookings/<int:booking_id>")
@app.patch("/api/bookings/<int:booking_id>")
def update_booking(booking_id: int):
    trip, booking = find_item("bookings", booking_id)
    if not booking:
        return jsonify({"error": "No se ha encontrado la reserva."}), 404
    payload = booking_payload(json_body())
    payload["title"] = payload["title"] or "Reserva sin título"
    booking.update(payload)
    save_trip(trip)
    result = dict(booking)
    result["documents"] = [
        document_dict(document) for document in trip["documents"] if document.get("booking_id") == booking_id
    ]
    return jsonify({"booking": result})


@app.delete("/api/bookings/<int:booking_id>")
def delete_booking(booking_id: int):
    trip, booking = find_item("bookings", booking_id)
    if not booking:
        return jsonify({"error": "No se ha encontrado la reserva."}), 404
    trip["bookings"] = [item for item in trip["bookings"] if item["id"] != booking_id]
    for document in trip["documents"]:
        if document.get("booking_id") == booking_id:
            document["booking_id"] = None
    save_trip(trip)
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
    trip = read_trip(trip_id)
    if not trip:
        return jsonify({"error": "No se ha encontrado el viaje."}), 404
    payload = transport_payload(json_body())
    if not payload["title"]:
        return jsonify({"error": "El título del transporte es obligatorio."}), 400
    leg = {
        "id": next_id("transport"),
        "trip_id": trip_id,
        **payload,
        "created_at": utc_now(),
    }
    trip["transport"].append(leg)
    save_trip(trip)
    return jsonify({"transport": dict(leg)}), 201


@app.put("/api/transport/<int:transport_id>")
@app.patch("/api/transport/<int:transport_id>")
def update_transport(transport_id: int):
    trip, leg = find_item("transport", transport_id)
    if not leg:
        return jsonify({"error": "No se ha encontrado el transporte."}), 404
    payload = transport_payload(json_body())
    payload["title"] = payload["title"] or "Transporte sin título"
    leg.update(payload)
    save_trip(trip)
    return jsonify({"transport": dict(leg)})


@app.delete("/api/transport/<int:transport_id>")
def delete_transport(transport_id: int):
    trip, leg = find_item("transport", transport_id)
    if not leg:
        return jsonify({"error": "No se ha encontrado el transporte."}), 404
    trip["transport"] = [item for item in trip["transport"] if item["id"] != transport_id]
    for document in trip["documents"]:
        if document.get("transport_id") == transport_id:
            document["transport_id"] = None
    save_trip(trip)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


@app.post("/api/trips/<int:trip_id>/documents")
def upload_document(trip_id: int):
    trip = read_trip(trip_id)
    if not trip:
        return jsonify({"error": "No se ha encontrado el viaje."}), 404
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "No se ha subido ningún archivo."}), 400

    booking_id = request.form.get("booking_id") or None
    if booking_id:
        try:
            booking_id = int(booking_id)
        except (TypeError, ValueError):
            booking_id = None
        if booking_id and not any(booking["id"] == booking_id for booking in trip["bookings"]):
            booking_id = None

    transport_id = request.form.get("transport_id") or None
    if transport_id:
        try:
            transport_id = int(transport_id)
        except (TypeError, ValueError):
            transport_id = None
        if transport_id and not any(leg["id"] == transport_id for leg in trip["transport"]):
            transport_id = None

    original = secure_filename(file.filename) or "document"
    stored = f"{uuid.uuid4().hex}{Path(original).suffix.lower()}"
    destination = UPLOAD_DIR / stored
    file.save(destination)
    size = destination.stat().st_size
    mimetype = file.mimetype or ""

    document = {
        "id": next_id("documents"),
        "trip_id": trip_id,
        "booking_id": booking_id,
        "transport_id": transport_id,
        "name": original,
        "stored_name": stored,
        "mimetype": mimetype,
        "size": size,
        "uploaded_at": utc_now(),
    }
    trip["documents"].append(document)
    save_trip(trip)
    return jsonify({"document": document_dict(document)}), 201


@app.get("/api/documents/<int:document_id>/download")
def download_document(document_id: int):
    _trip, document = find_item("documents", document_id)
    if not document:
        return jsonify({"error": "No se ha encontrado el documento."}), 404
    return send_from_directory(
        UPLOAD_DIR,
        document["stored_name"],
        as_attachment=request.args.get("download") == "1",
        download_name=document["name"],
        mimetype=document["mimetype"] or None,
    )


@app.delete("/api/documents/<int:document_id>")
def delete_document(document_id: int):
    trip, document = find_item("documents", document_id)
    if not document:
        return jsonify({"error": "No se ha encontrado el documento."}), 404
    trip["documents"] = [item for item in trip["documents"] if item["id"] != document_id]
    save_trip(trip)
    delete_stored_file(document["stored_name"])
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------


def recommendation_payload(data: dict) -> dict:
    kind = clean(data.get("kind")) or "idea"
    if kind not in ("idea", "table"):
        kind = "idea"

    table_columns: list[str] = []
    table_rows: list[list[str]] = []
    if kind == "table":
        raw_columns = data.get("table_columns")
        if isinstance(raw_columns, list):
            table_columns = [clean(column)[:60] for column in raw_columns][:12]
        raw_rows = data.get("table_rows")
        if isinstance(raw_rows, list):
            for raw_row in raw_rows[:80]:
                if isinstance(raw_row, list):
                    table_rows.append([clean(cell)[:300] for cell in raw_row[:12]])

    return {
        "title": clean(data.get("title")),
        "category": clean(data.get("category")) or "place",
        "url": clean(data.get("url")),
        "address": clean(data.get("address")),
        "lat": parse_float(data.get("lat")),
        "lng": parse_float(data.get("lng")),
        "notes": clean(data.get("notes")),
        "kind": kind,
        "table_columns": table_columns,
        "table_rows": table_rows,
    }


@app.post("/api/trips/<int:trip_id>/recommendations")
def create_recommendation(trip_id: int):
    trip = read_trip(trip_id)
    if not trip:
        return jsonify({"error": "No se ha encontrado el viaje."}), 404
    payload = recommendation_payload(json_body())
    if not payload["title"]:
        return jsonify({"error": "El nombre es obligatorio."}), 400
    recommendation = {
        "id": next_id("recommendations"),
        "trip_id": trip_id,
        **payload,
        "created_at": utc_now(),
    }
    trip["recommendations"].append(recommendation)
    save_trip(trip)
    return jsonify({"recommendation": recommendation_dict(recommendation)}), 201


@app.put("/api/recommendations/<int:recommendation_id>")
@app.patch("/api/recommendations/<int:recommendation_id>")
def update_recommendation(recommendation_id: int):
    trip, recommendation = find_item("recommendations", recommendation_id)
    if not recommendation:
        return jsonify({"error": "No se ha encontrado la idea."}), 404
    payload = recommendation_payload(json_body())
    payload["title"] = payload["title"] or "Sin título"
    recommendation.update(payload)
    save_trip(trip)
    return jsonify({"recommendation": recommendation_dict(recommendation)})


@app.delete("/api/recommendations/<int:recommendation_id>")
def delete_recommendation(recommendation_id: int):
    trip, recommendation = find_item("recommendations", recommendation_id)
    if not recommendation:
        return jsonify({"error": "No se ha encontrado la idea."}), 404
    trip["recommendations"] = [item for item in trip["recommendations"] if item["id"] != recommendation_id]
    save_trip(trip)
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
            data = json.loads(response.read().decode("utf-8"))
    except Exception as exc:  # pragma: no cover - network dependent
        return jsonify({"error": f"No se pudo contactar con el servicio de geocodificación: {exc}", "results": []}), 502
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
    return jsonify({"error": "Ese archivo es demasiado grande. El límite es 30 MB."}), 413


def startup() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TRIPS_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    migrate_sqlite_if_needed()
    bootstrap_meta()


startup()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG") == "1"
    print(f"\n  Wanderlusst Travel está funcionando en http://127.0.0.1:{port}\n")
    app.run(host="127.0.0.1", port=port, debug=debug)
