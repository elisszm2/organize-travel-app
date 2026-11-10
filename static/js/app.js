/* Wanderlusst Travel app controller: routing, sidebar, trip hero and views. */

import { api } from "./api.js";
import { openDrawer, closeDrawer, toast, confirmDialog } from "./ui.js";
import { openTripModal } from "./forms.js";
import {
  icon,
  esc,
  fmtDateRange,
  durationLabel,
  tripCover,
  tripIconUrl,
  tripCoverUrl,
  parseDate,
  todayISO,
} from "./utils.js";
import { renderOverview } from "./views/overview.js";
import { renderItinerary } from "./views/itinerary.js";
import { renderTransport } from "./views/transport.js";
import { renderTasks } from "./views/tasks.js";
import { renderBookings } from "./views/bookings.js";
import { renderDocuments } from "./views/documents.js";
import { renderRecommendations } from "./views/recommendations.js";

const TABS = [
  { key: "overview", label: "Resumen", icon: "compass" },
  { key: "itinerary", label: "Itinerario", icon: "route", count: (trip) => trip.day_count },
  { key: "transport", label: "Transporte", icon: "plane", count: (trip) => trip.transport_count },
  { key: "tasks", label: "Tareas", icon: "kanban", count: (trip) => trip.task_total },
  { key: "bookings", label: "Reservas", icon: "ticket", count: (trip) => trip.booking_count },
  { key: "documents", label: "Documentos", icon: "folder", count: (trip) => trip.doc_count },
  { key: "recommendations", label: "Ideas", icon: "sparkles", count: (trip) => trip.recommendation_count },
];

const VIEWS = {
  overview: renderOverview,
  itinerary: renderItinerary,
  transport: renderTransport,
  tasks: renderTasks,
  bookings: renderBookings,
  documents: renderDocuments,
  recommendations: renderRecommendations,
};

const state = {
  trips: [],
  tripId: null,
  trip: null,
  tab: "overview",
  search: "",
};

const main = document.getElementById("main");

/* --------------------------------------------------------------------------
   Shell
   -------------------------------------------------------------------------- */

function setupShell() {
  const setIcon = (id, name) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = icon(name);
  };
  setIcon("brand-mark", "compass");
  setIcon("mobile-brand-mark", "compass");
  setIcon("search-icon", "search");
  setIcon("new-trip-icon", "plus");
  setIcon("mobile-menu", "menu");

  document.getElementById("new-trip-btn")?.addEventListener("click", () => {
    openTripModal({
      onSaved: async (trip) => {
        await refreshTrips();
        navigate(trip.id, "overview");
      },
    });
  });

  document.getElementById("trip-search")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderTripList();
  });

  document.getElementById("mobile-menu")?.addEventListener("click", openDrawer);
  document.getElementById("drawer-overlay")?.addEventListener("click", closeDrawer);
  window.addEventListener("resize", () => {
    if (window.innerWidth > 960) closeDrawer();
  });
}

/* --------------------------------------------------------------------------
   Routing
   -------------------------------------------------------------------------- */

function parseHash() {
  const match = window.location.hash.match(/^#\/trip\/(\d+)(?:\/([a-z]+))?/);
  if (!match) return { tripId: null, tab: "overview" };
  return { tripId: Number(match[1]), tab: match[2] || "overview" };
}

function navigate(tripId, tab = "overview", options = {}) {
  const hash = tripId ? `#/trip/${tripId}/${tab}` : "#/";
  if (window.location.hash === hash) {
    loadRoute();
    return;
  }
  if (options.replace) {
    history.replaceState(null, "", hash);
    loadRoute();
  } else {
    window.location.hash = hash;
  }
}

async function loadRoute() {
  const { tripId, tab } = parseHash();
  const validTab = VIEWS[tab] ? tab : "overview";

  if (!tripId) {
    if (state.trips.length) {
      navigate(state.trips[0].id, "overview", { replace: true });
      return;
    }
    state.trip = null;
    state.tripId = null;
    renderWelcome();
    return;
  }

  if (state.tripId === tripId && state.trip) {
    if (state.tab === validTab) {
      renderMain({ keepScroll: true });
    } else {
      state.tab = validTab;
      renderMain();
    }
    renderTripList();
    return;
  }

  await loadTrip(tripId, validTab);
}

function tripDetail(data) {
  return {
    ...data.trip,
    days: data.days || [],
    tasks: data.tasks || [],
    bookings: data.bookings || [],
    documents: data.documents || [],
    recommendations: data.recommendations || [],
    transport: data.transport || [],
  };
}

async function loadTrip(tripId, tab = "overview") {
  try {
    const data = await api.getTrip(tripId);
    state.trip = tripDetail(data);
    state.tripId = tripId;
    state.tab = VIEWS[tab] ? tab : "overview";
    renderMain();
    renderTripList();
    closeDrawer();
  } catch (error) {
    toast(error.message || "No se pudo abrir este viaje.", "error");
    await refreshTrips();
    const next = state.trips[0];
    if (next) {
      navigate(next.id, "overview", { replace: true });
    } else {
      history.replaceState(null, "", "#/");
      state.trip = null;
      state.tripId = null;
      renderWelcome();
    }
  }
}

async function refreshTrips() {
  try {
    const data = await api.listTrips();
    state.trips = data.trips || [];
    renderTripList();
  } catch (error) {
    toast(error.message || "No se pudieron cargar tus viajes.", "error");
  }
}

async function refreshTrip() {
  if (!state.tripId) return;
  try {
    const data = await api.getTrip(state.tripId);
    state.trip = tripDetail(data);
    state.trips = state.trips.map((trip) =>
      trip.id === state.tripId ? { ...trip, ...data.trip } : trip,
    );
    renderTripList();
    renderMain({ keepScroll: true });
  } catch (error) {
    toast(error.message || "No se pudo actualizar este viaje.", "error");
  }
}

function navigateTab(tab, options = {}) {
  if (!state.tripId) return;
  if (options.dayId) sessionStorage.setItem("wayfarer-scroll-day", String(options.dayId));
  navigate(state.tripId, tab);
}

/* --------------------------------------------------------------------------
   Sidebar
   -------------------------------------------------------------------------- */

function renderTripList() {
  const list = document.getElementById("trip-list");
  const count = document.getElementById("trip-count");
  if (!list || !count) return;

  const query = state.search.trim().toLowerCase();
  const trips = query
    ? state.trips.filter(
        (trip) =>
          String(trip.title || "").toLowerCase().includes(query) ||
          String(trip.location || "").toLowerCase().includes(query),
      )
    : state.trips;

  count.textContent = String(query ? trips.length : state.trips.length);

  if (!trips.length) {
    list.innerHTML = `
      <div class="sidebar-empty">
        <strong>${query ? "Ningún viaje coincide" : "Aún no hay viajes"}</strong>
        ${query ? "Prueba con otro destino." : "Tu primera aventura empieza con un clic."}
      </div>`;
    return;
  }

  list.innerHTML = trips
    .map((trip) => {
      const active = trip.id === state.tripId;
      const meta = fmtDateRange(trip.start_date, trip.end_date);
      const iconUrl = tripIconUrl(trip);
      const thumb = iconUrl
        ? `<div class="trip-thumb"><img src="${esc(iconUrl)}" alt=""></div>`
        : `<div class="trip-thumb ${tripCover(trip.id)}">${icon("pin")}</div>`;
      return `
        <button type="button" class="trip-item ${active ? "active" : ""}" data-trip-id="${trip.id}" title="${esc(trip.title)}">
          ${thumb}
          <div class="trip-item-main">
            <div class="trip-item-title">${esc(trip.title)}</div>
            <div class="trip-item-meta">${esc(meta)}</div>
            <div class="trip-item-progress">
              <div class="progress-track"><div class="progress-fill" style="width:${Number(trip.status) || 0}%"></div></div>
              <span>${Number(trip.status) || 0}%</span>
            </div>
          </div>
        </button>`;
    })
    .join("");

  list.querySelectorAll("[data-trip-id]").forEach((button) => {
    button.addEventListener("click", () => {
      navigate(Number(button.dataset.tripId), "overview");
      closeDrawer();
    });
  });
}

/* --------------------------------------------------------------------------
   Main / hero / tabs
   -------------------------------------------------------------------------- */

function tripTiming(trip) {
  if (!trip.start_date) return "Tu viaje";
  const start = parseDate(trip.start_date);
  if (!start) return "Tu viaje";
  const today = parseDate(todayISO());
  const days = Math.ceil((start - today) / 86400000);
  if (days > 1) return `Quedan ${days} días`;
  if (days === 1) return "Mañana";
  if (days === 0) return "Hoy";
  if (trip.end_date && trip.end_date >= todayISO()) return "En marcha";
  return "Viaje pasado";
}

function renderMain({ keepScroll = false } = {}) {
  const trip = state.trip;
  if (!trip) {
    renderWelcome();
    return;
  }

  const scrollY = window.scrollY;
  document.title = `${trip.title} · Wanderlusst Travel`;
  const coverUrl = tripCoverUrl(trip);

  main.innerHTML = `
    <header class="trip-hero ${coverUrl ? "has-cover" : tripCover(trip.id)}"${
      coverUrl ? ` style="--cover:url('${esc(coverUrl)}')"` : ""
    }>
      <div class="hero-actions">
        <button type="button" class="icon-btn on-hero" data-edit-trip title="Editar viaje" aria-label="Editar viaje">${icon("edit")}</button>
        <button type="button" class="icon-btn on-hero" data-delete-trip title="Eliminar viaje" aria-label="Eliminar viaje">${icon("trash")}</button>
      </div>
      <div class="trip-hero-content">
        <div class="hero-eyebrow"><span class="dot"></span>${esc(tripTiming(trip))}</div>
        <h1>${esc(trip.title)}</h1>
        ${trip.description ? `<p class="hero-description">${esc(trip.description)}</p>` : ""}
        <div class="hero-meta">
          <span>${icon("pin")} ${esc(trip.location)}</span>
          <span>${icon("calendar")} ${esc(fmtDateRange(trip.start_date, trip.end_date))}</span>
          <span>${icon("sun")} ${esc(durationLabel(trip))}</span>
        </div>
      </div>
      <div class="hero-side">
        <div class="status-ring" style="--p:${Number(trip.status) || 0}">
          <div class="status-ring-inner">
            <div class="status-ring-value">${Number(trip.status) || 0}%</div>
            <div class="status-ring-label">organizado</div>
          </div>
        </div>
      </div>
    </header>

    <nav class="tabs" aria-label="Secciones del viaje">
      ${TABS.map((tab) => {
        const count = tab.count ? Number(tab.count(trip) || 0) : 0;
        return `
          <button type="button" class="tab ${state.tab === tab.key ? "active" : ""}" data-tab="${tab.key}">
            ${icon(tab.icon)} ${tab.label}
            ${tab.count && count ? `<span class="tab-count">${count}</span>` : ""}
          </button>`;
      }).join("")}
    </nav>

    <div class="view" id="view"></div>`;

  const view = main.querySelector("#view");
  const ctx = { navigate: navigateTab, refresh: refreshTrip };
  VIEWS[state.tab]?.(view, trip, ctx);

  main.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.tab === state.tab) return;
      navigate(state.tripId, button.dataset.tab);
    });
  });

  main.querySelector("[data-edit-trip]")?.addEventListener("click", () => {
    openTripModal({ trip, onSaved: refreshTrip });
  });

  main.querySelector("[data-delete-trip]")?.addEventListener("click", () => {
    deleteTrip(trip);
  });

  if (keepScroll) {
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  } else {
    window.scrollTo(0, 0);
  }
}

async function deleteTrip(trip) {
  await confirmDialog({
    title: "¿Eliminar este viaje?",
    message: `“${trip.title}”, su itinerario, tareas, reservas y documentos subidos se eliminarán permanentemente.`,
    confirmLabel: "Eliminar viaje",
    onConfirm: async () => {
      await api.deleteTrip(trip.id);
      state.trip = null;
      state.tripId = null;
      await refreshTrips();
      const next = state.trips[0];
      if (next) {
        navigate(next.id, "overview", { replace: true });
      } else {
        history.replaceState(null, "", "#/");
        renderWelcome();
      }
      toast("Viaje eliminado.");
    },
  });
}

/* --------------------------------------------------------------------------
   Welcome
   -------------------------------------------------------------------------- */

function renderWelcome() {
  document.title = "Wanderlusst Travel — Organizador de viajes";
  main.innerHTML = `
    <div class="welcome">
      <div class="welcome-inner">
        <div class="welcome-art">${icon("compass")}</div>
        <h1>¿Y ahora, a dónde?</h1>
        <p>Planifica los días, ten reservas y documentos a mano y ve de un vistazo lo que queda por organizar.</p>
        <button type="button" class="btn btn-primary" data-welcome-new>${icon("plus")} Planifica tu primer viaje</button>

        <div class="welcome-features">
          <div class="welcome-feature">
            <div class="mini-icon accent">${icon("route")}</div>
            <strong>Itinerario día a día</strong>
            <span>Construye cada día con horarios, lugares y notas.</span>
          </div>
          <div class="welcome-feature">
            <div class="mini-icon teal">${icon("kanban")}</div>
            <strong>Tablero de tareas</strong>
            <span>Arrastra tareas de pendiente a hecha.</span>
          </div>
          <div class="welcome-feature">
            <div class="mini-icon gold">${icon("ticket")}</div>
            <strong>Reservas y PDF</strong>
            <span>Hoteles, excursiones y confirmaciones.</span>
          </div>
          <div class="welcome-feature">
            <div class="mini-icon">${icon("map")}</div>
            <strong>Todo en un mapa</strong>
            <span>Tu ruta, alojamientos e ideas guardadas.</span>
          </div>
        </div>
      </div>
    </div>`;

  main.querySelector("[data-welcome-new]")?.addEventListener("click", () => {
    openTripModal({
      onSaved: async (trip) => {
        await refreshTrips();
        navigate(trip.id, "overview");
      },
    });
  });
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

async function boot() {
  setupShell();
  try {
    const data = await api.listTrips();
    state.trips = data.trips || [];
    renderTripList();
    await loadRoute();
  } catch (error) {
    main.innerHTML = `<div class="loading-screen"><p>${esc(error.message || "No se pudo conectar con el servidor.")}</p></div>`;
  }
  window.addEventListener("hashchange", loadRoute);
}

boot();
