# Wanderlusst Travel — travel organizer

A local-first web app for planning trips: a sidebar of all your trips, a day-by-day
itinerary, a task board, bookings and paperwork, saved ideas, and a map of everything
you have pinned.

Everything is stored on your own computer — there is no account, cloud sync or
external database.

## Features

- **Trips sidebar** — create, search and switch between trips. Each trip has a
  destination, dates, description, an optional icon and header photo, and a progress
  percentage calculated automatically from the task checklist.
- **Trip overview** — progress ring, stat cards, a mini task board, an itinerary
  preview, transport summary, upcoming bookings, recent documents and a map.
- **Transport** — flights, trains, buses, ferries and cars, split into getting there,
  getting around and getting home. The next legs appear on the overview.
- **Day-by-day itinerary** — one card per day with activities, times, categories,
  places, notes and a done toggle. Activities can be pinned to the map.
- **Task board** — to-do / in-progress / done columns with drag-and-drop, categories,
  due dates and notes. Completing or reopening tasks updates the trip progress.
- **Bookings** — hotels, flights, trains, car rental, visas, insurance and more.
  Store confirmation codes, amounts, addresses and attach documents.
- **Documents** — upload PDFs, images and spreadsheets (up to 30 MB each), preview
  them in the browser and attach them to bookings.
- **Ideas & recommendations** — save places, restaurants, experiences and tips,
  optionally pinned on the map with a link.
- **Map** — Leaflet + OpenStreetMap with itinerary routes per day, booking markers
  and idea pins. The destination can be geocoded by name.

## Requirements

- Python 3.10+ (tested with 3.14)
- Internet access for map tiles, geocoding, Leaflet and web fonts. The rest of the
  app works without a connection.

## Setup

```bash
cd organize-travel-app
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run

```bash
.venv/bin/python app.py
```

Open <http://127.0.0.1:5000>.

To use a different port:

```bash
PORT=5055 .venv/bin/python app.py
```

## Where your data lives

| What | Location |
| --- | --- |
| SQLite database | `data/wayfarer.db` |
| Uploaded files | `data/uploads/` |

Both are created automatically on first run. Back up the `data/` folder to keep a
copy of your trips, and delete it to start completely fresh.

## Notes on local use

This app is designed to run on your own machine and binds to `127.0.0.1` by default.
It has no authentication, so do not expose it to the public internet as-is. Uploaded
files are served through the app and stored unencrypted on disk.
