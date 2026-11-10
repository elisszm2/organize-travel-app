/* Leaflet map rendering for a trip. */

import { esc, icon, fmtDate, bookingType, activityCategory } from "./utils.js";

const DAY_COLORS = ["#e2663f", "#2f8f83", "#d9a441", "#7c4f8f", "#327e9b", "#7c8a3f"];
let activeMap = null;

function hasCoords(item) {
  return (
    item &&
    item.lat !== null &&
    item.lat !== undefined &&
    item.lat !== "" &&
    item.lng !== null &&
    item.lng !== undefined &&
    item.lng !== "" &&
    Number.isFinite(Number(item.lat)) &&
    Number.isFinite(Number(item.lng))
  );
}

function marker(color, html, size = 26) {
  return window.L.divIcon({
    className: "wayfarer-marker",
    html: `<div class="map-marker" style="background:${color};width:${size}px;height:${size}px">${html}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

export function renderTripMap(el, trip, options = {}) {
  if (!el) return;
  const wrap = el.parentElement;
  wrap?.querySelector(".map-overlay-note")?.remove();

  // Tear down the previous map before drawing a new one so Leaflet doesn't
  // keep stale listeners or tiles attached to an element that is gone.
  if (activeMap) {
    try {
      activeMap.remove();
    } catch {
      /* ignore */
    }
    activeMap = null;
  }

  if (!window.L) {
    el.innerHTML = `<div class="map-fallback">${icon("map")}<div>No se pudo cargar el mapa.<br>Revisa tu conexión a internet y recarga la página.</div></div>`;
    return;
  }

  el.innerHTML = "";

  const map = window.L.map(el, {
    zoomControl: true,
    scrollWheelZoom: false,
    attributionControl: true,
    worldCopyJump: true,
  });
  activeMap = map;

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
  }).addTo(map);

  const bounds = window.L.latLngBounds();
  let pointCount = 0;
  const addPoint = (lat, lng) => {
    bounds.extend([Number(lat), Number(lng)]);
    pointCount += 1;
  };

  // Itinerary activities, grouped by day with a route line per day.
  (trip.days || []).forEach((day, dayIndex) => {
    const color = DAY_COLORS[dayIndex % DAY_COLORS.length];
    const points = (day.activities || []).filter(hasCoords);
    if (!points.length) return;
    const latlngs = [];
    points.forEach((activity, index) => {
      const lat = Number(activity.lat);
      const lng = Number(activity.lng);
      addPoint(lat, lng);
      latlngs.push([lat, lng]);
      const cat = activityCategory(activity.category);
      const popup = `
        <div>
          <div class="map-popup-title">${esc(activity.title)}</div>
          <div class="map-popup-meta">${esc(day.title || `Día ${day.day_number}`)}${day.date ? ` · ${esc(fmtDate(day.date, "short"))}` : ""}${activity.time ? ` · ${esc(activity.time)}` : ""}</div>
          ${activity.location ? `<div class="map-popup-meta">${esc(activity.location)}</div>` : ""}
          ${activity.notes ? `<div class="map-popup-notes">${esc(activity.notes)}</div>` : ""}
        </div>`;
      window.L.marker([lat, lng], {
        icon: marker(color, `<span>${index + 1}</span>`),
        title: activity.title,
        alt: `${cat.label}: ${activity.title}`,
      })
        .addTo(map)
        .bindPopup(popup);
    });
    if (latlngs.length > 1) {
      window.L.polyline(latlngs, {
        color,
        weight: 3,
        opacity: 0.72,
        dashArray: "7 7",
        lineCap: "round",
      }).addTo(map);
    }
  });

  // Bookings (hotels, flights with coordinates, etc.).
  (trip.bookings || []).forEach((booking) => {
    if (!hasCoords(booking)) return;
    const lat = Number(booking.lat);
    const lng = Number(booking.lng);
    addPoint(lat, lng);
    const type = bookingType(booking.type);
    const popup = `
      <div>
        <div class="map-popup-title">${esc(booking.title)}</div>
        <div class="map-popup-meta">${esc(type.label)}${booking.provider ? ` · ${esc(booking.provider)}` : ""}</div>
        ${booking.start_date ? `<div class="map-popup-meta">${esc(fmtDate(booking.start_date, "short"))}${booking.end_date ? ` – ${esc(fmtDate(booking.end_date, "short"))}` : ""}</div>` : ""}
        ${booking.address ? `<div class="map-popup-meta">${esc(booking.address)}</div>` : ""}
      </div>`;
    window.L.marker([lat, lng], {
      icon: marker("#d9a441", icon(type.icon), 26),
      title: booking.title,
    })
      .addTo(map)
      .bindPopup(popup);
  });

  // Recommendations / ideas.
  (trip.recommendations || []).forEach((rec) => {
    if (!hasCoords(rec)) return;
    const lat = Number(rec.lat);
    const lng = Number(rec.lng);
    addPoint(lat, lng);
    const popup = `
      <div>
        <div class="map-popup-title">${esc(rec.title)}</div>
        <div class="map-popup-meta">Idea${rec.address ? ` · ${esc(rec.address)}` : ""}</div>
        ${rec.notes ? `<div class="map-popup-notes">${esc(rec.notes)}</div>` : ""}
      </div>`;
    window.L.marker([lat, lng], {
      icon: marker("#2f8f83", icon("star"), 26),
      title: rec.title,
    })
      .addTo(map)
      .bindPopup(popup);
  });

  // Trip destination marker (only if it doesn't duplicate an itinerary point).
  if (hasCoords(trip)) {
    const lat = Number(trip.lat);
    const lng = Number(trip.lng);
    addPoint(lat, lng);
    window.L.marker([lat, lng], {
      icon: marker("#e2663f", icon("home"), 28),
      title: trip.location,
      zIndexOffset: 500,
    })
      .addTo(map)
      .bindPopup(
        `<div><div class="map-popup-title">${esc(trip.title)}</div><div class="map-popup-meta">${esc(trip.location)}</div></div>`,
      );
  }

  if (pointCount === 0) {
    map.setView([24, 12], 2);
    if (wrap && options.onLocate) {
      const note = document.createElement("div");
      note.className = "map-overlay-note";
      note.innerHTML = `${icon("pin")}<span>Aún no hay lugares fijados. Añade una ubicación a una actividad, reserva o idea — o localiza tu destino.</span><button type="button" class="btn btn-primary btn-sm" data-map-locate>${icon("pin")} Localizar el destino</button>`;
      wrap.appendChild(note);
      note.querySelector("[data-map-locate]")?.addEventListener("click", options.onLocate);
    }
  } else if (pointCount === 1) {
    map.setView(bounds.getCenter(), 12);
  } else {
    map.fitBounds(bounds, { padding: [38, 38], maxZoom: 13 });
  }

  setTimeout(() => {
    try {
      map.invalidateSize();
    } catch {
      /* ignore */
    }
  }, 80);

  return map;
}

export { DAY_COLORS };
