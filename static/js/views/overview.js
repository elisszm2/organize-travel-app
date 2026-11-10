/* Trip overview: stats, mini kanban, itinerary preview, progress, map. */

import {
  esc,
  icon,
  fmtDate,
  fmtDateRange,
  fmtWeekday,
  todayISO,
  taskProgress,
  bookingType,
  fileIconName,
  fmtBytes,
  fmtDateTime,
  transportType,
  transportScope,
} from "../utils.js";
import { kanbanColumnsHTML, wireKanban } from "../kanban.js";
import { renderTripMap } from "../map.js";
import { openTripModal } from "../forms.js";
import { previewDocument } from "../ui.js";

function statCard({ iconName, tone = "", value, label }) {
  return `
    <div class="stat-card">
      <div class="stat-icon ${tone}">${icon(iconName)}</div>
      <div>
        <div class="stat-value">${esc(value)}</div>
        <div class="stat-label">${esc(label)}</div>
      </div>
    </div>`;
}

function previewDay(day) {
  const chips = (day.activities || []).slice(0, 3).map(
    (activity) => `
      <span class="chip">
        ${activity.time ? `<span class="chip-time">${esc(activity.time)}</span>` : ""}
        ${esc(activity.title)}
      </span>`,
  );
  const extra = (day.activities || []).length - chips.length;
  const weekday = day.date ? fmtWeekday(day.date).slice(0, 3) : "Día";
  return `
    <div class="preview-day" data-goto-day="${day.id}" role="button" tabindex="0">
      <div class="day-badge">
        <strong>${day.day_number}</strong>
        <small>${esc(weekday)}</small>
      </div>
      <div class="preview-day-main">
        <div class="preview-day-title">
          ${esc(day.title || `Día ${day.day_number}`)}
          ${day.date ? `<span class="preview-day-date">${esc(fmtDate(day.date, "short"))}</span>` : ""}
        </div>
        <div class="preview-chips">
          ${chips.join("")}
          ${extra > 0 ? `<span class="chip">+${extra} más</span>` : ""}
          ${!chips.length ? `<span class="preview-empty">Aún no hay actividades planificadas</span>` : ""}
        </div>
      </div>
      <span class="preview-day-arrow">${icon("chevron-right")}</span>
    </div>`;
}

function transportRow(item) {
  const type = transportType(item.type);
  const scope = transportScope(item.scope);
  const route = [item.from_place, item.to_place].filter(Boolean).join(" → ");
  const when = [fmtDate(item.depart_date, "short"), item.depart_time].filter(Boolean).join(" · ");
  const tone = item.scope === "internal" ? "teal" : item.scope === "return" ? "accent" : "gold";
  return `
    <div class="mini-row">
      <div class="mini-icon ${tone}">${icon(type.icon)}</div>
      <div class="mini-main">
        <div class="mini-title">${esc(item.title)}</div>
        <div class="mini-sub">${esc([scope.label, route, when].filter(Boolean).join(" · "))}</div>
      </div>
    </div>`;
}

export function renderOverview(root, trip, ctx) {
  const tasks = trip.tasks || [];
  const doneTasks = tasks.filter((task) => task.status === "done").length;
  const today = todayISO();
  const upcoming = (trip.bookings || []).filter((booking) => !booking.start_date || booking.start_date >= today);
  const shownBookings = (upcoming.length ? upcoming : trip.bookings || []).slice(0, 3);
  const recentDocs = (trip.documents || []).slice(0, 3);
  const days = trip.days || [];
  const previewDays = days.slice(0, 5);
  const transport = trip.transport || [];
  const shownTransport = transport.slice(0, 4);

  root.innerHTML = `
    <div class="stat-grid">
      ${statCard({ iconName: "calendar", value: trip.day_count, label: "Días de itinerario" })}
      ${statCard({ iconName: "camera", tone: "teal", value: trip.activity_count, label: "Actividades" })}
      ${statCard({ iconName: "check-circle", tone: "gold", value: `${doneTasks}/${tasks.length}`, label: "Tareas completadas" })}
      ${statCard({ iconName: "file", tone: "plum", value: trip.doc_count, label: "Documentos" })}
    </div>

    <div class="overview-grid">
      <div class="overview-col">
        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${icon("kanban")} Lista de tareas del viaje</div>
              <div class="card-subtitle">Arrastra las tarjetas entre columnas · ${tasks.length} tarea${tasks.length === 1 ? "" : "s"}</div>
            </div>
            <button type="button" class="btn-link" data-goto="tasks">Ver tareas ${icon("arrow-right")}</button>
          </div>
          <div class="card-body">
            <div class="kanban">
              ${kanbanColumnsHTML(tasks, { mini: true, limit: 4 })}
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${icon("route")} Itinerario de un vistazo</div>
              <div class="card-subtitle">${days.length} día${days.length === 1 ? "" : "s"} · ${Number(trip.activity_count) || 0} ${Number(trip.activity_count) === 1 ? "actividad" : "actividades"}</div>
            </div>
            <button type="button" class="btn-link" data-goto="itinerary">Abrir itinerario ${icon("arrow-right")}</button>
          </div>
          <div class="card-body" style="padding-top:8px">
            ${
              previewDays.length
                ? `<div class="preview-days">${previewDays.map(previewDay).join("")}</div>`
                : `<div class="empty-state" style="padding:26px 16px">
                     <div class="empty-icon">${icon("calendar")}</div>
                     <div class="empty-title">Aún no hay días</div>
                     <p class="empty-text">Añade días para empezar a dar forma al viaje.</p>
                     <button type="button" class="btn btn-ghost btn-sm" data-goto="itinerary">${icon("plus")} Crear el itinerario</button>
                   </div>`
            }
            ${days.length > previewDays.length ? `<div style="padding-top:10px;text-align:center"><button type="button" class="btn-link" data-goto="itinerary">Ver los ${days.length} días ${icon("arrow-right")}</button></div>` : ""}
          </div>
        </section>
      </div>

      <div class="overview-col side">
        <section class="card progress-card">
          <div class="card-head">
            <div>
              <div class="card-title">${icon("check-circle")} Organización</div>
              <div class="card-subtitle">Calculada a partir de tu lista de tareas</div>
            </div>
            <button type="button" class="btn-link" data-goto="tasks">Ver tareas ${icon("arrow-right")}</button>
          </div>
          <div class="progress-card-body">
            <div class="donut" style="--p:${Number(trip.status) || 0}">
              <div class="donut-inner">
                <div class="donut-value">${Number(trip.status) || 0}%</div>
                <div class="donut-label">listo</div>
              </div>
            </div>
            <div class="progress-facts">
              <div class="fact">
                <span class="fact-label">${icon("kanban")} Tareas hechas</span>
                <span class="fact-value">${doneTasks}/${tasks.length}</span>
              </div>
              <div class="mini-track"><span style="width:${taskProgress(trip)}%"></span></div>
              <div class="fact">
                <span class="fact-label">${icon("ticket")} Reservas</span>
                <span class="fact-value">${trip.booking_count || 0}</span>
              </div>
              <div class="fact">
                <span class="fact-label">${icon("file")} Documentos</span>
                <span class="fact-value">${trip.doc_count || 0}</span>
              </div>
              <div class="field-hint">Marca tareas como hechas y este progreso se actualiza solo.</div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${icon("route")} Transporte</div>
              <div class="card-subtitle">${transport.length} trayecto${transport.length === 1 ? "" : "s"} · llegada y movimientos</div>
            </div>
            <button type="button" class="btn-link" data-goto="transport">Gestionar ${icon("arrow-right")}</button>
          </div>
          <div class="card-body" style="padding-top:6px">
            ${
              shownTransport.length
                ? `<div class="mini-list">${shownTransport.map(transportRow).join("")}</div>`
                : `<div class="mini-list-empty">Aún no hay transporte guardado. Añade el vuelo o tren de llegada y los trayectos internos para que aparezcan aquí.</div>`
            }
          </div>
        </section>

        <section class="card map-card">
          <div class="card-head">
            <div>
              <div class="card-title">${icon("map")} Mapa del viaje</div>
              <div class="card-subtitle">Tu itinerario, reservas e ideas</div>
            </div>
            <button type="button" class="btn-link" data-goto="itinerary">Planificar ${icon("arrow-right")}</button>
          </div>
          <div class="map-wrap">
            <div class="map map-short" data-trip-map></div>
          </div>
          <div class="map-legend">
            <span><i class="legend-dot" style="background:#e2663f"></i>Itinerario</span>
            <span><i class="legend-dot" style="background:#d9a441"></i>Reservas</span>
            <span><i class="legend-dot" style="background:#2f8f83"></i>Ideas</span>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${icon("ticket")} Próximas</div>
              <div class="card-subtitle">${trip.booking_count || 0} reserva${trip.booking_count === 1 ? "" : "s"} guardada${trip.booking_count === 1 ? "" : "s"}</div>
            </div>
            <button type="button" class="btn-link" data-goto="bookings">Ver todas ${icon("arrow-right")}</button>
          </div>
          <div class="card-body" style="padding-top:6px">
            ${
              shownBookings.length
                ? `<div class="mini-list">${shownBookings
                    .map((booking) => {
                      const type = bookingType(booking.type);
                      return `
                        <div class="mini-row">
                          <div class="mini-icon gold">${icon(type.icon)}</div>
                          <div class="mini-main">
                            <div class="mini-title">${esc(booking.title)}</div>
                            <div class="mini-sub">${esc(
                              [type.label, booking.provider, fmtDateRange(booking.start_date, booking.end_date)]
                                .filter(Boolean)
                                .join(" · "),
                            )}</div>
                          </div>
                        </div>`;
                    })
                    .join("")}</div>`
                : `<div class="mini-list-empty">Aún no hay reservas. Añade hoteles, apartamentos o excursiones en la pestaña Reservas.</div>`
            }
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${icon("folder")} Documentos</div>
              <div class="card-subtitle">${trip.doc_count || 0} archivo${trip.doc_count === 1 ? "" : "s"} guardado${trip.doc_count === 1 ? "" : "s"}</div>
            </div>
            <button type="button" class="btn-link" data-goto="documents">Ver todos ${icon("arrow-right")}</button>
          </div>
          <div class="card-body" style="padding-top:6px">
            ${
              recentDocs.length
                ? `<div class="mini-list">${recentDocs
                    .map(
                      (doc) => `
                        <button type="button" class="mini-row" data-preview-doc="${doc.id}" style="border:0;background:none;text-align:left;cursor:pointer;width:100%;padding-left:0;padding-right:0">
                          <div class="mini-icon accent">${icon(fileIconName(doc.mimetype, doc.name))}</div>
                          <div class="mini-main">
                            <div class="mini-title">${esc(doc.name)}</div>
                            <div class="mini-sub">${esc(fmtBytes(doc.size))} · ${esc(fmtDateTime(doc.uploaded_at))}</div>
                          </div>
                        </button>`,
                    )
                    .join("")}</div>`
                : `<div class="mini-list-empty">Guarda aquí PDF, billetes y confirmaciones de reserva.</div>`
            }
          </div>
        </section>
      </div>
    </div>`;

  wireKanban(root.querySelector(".kanban"), { trip, refresh: ctx.refresh, mini: true });

  root.querySelectorAll("[data-goto]").forEach((button) => {
    button.addEventListener("click", () => ctx.navigate(button.dataset.goto));
  });
  root.querySelectorAll("[data-goto-day]").forEach((row) => {
    const go = () => ctx.navigate("itinerary", { dayId: Number(row.dataset.gotoDay) });
    row.addEventListener("click", go);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        go();
      }
    });
  });
  root.querySelectorAll("[data-preview-doc]").forEach((button) => {
    button.addEventListener("click", () => {
      const doc = (trip.documents || []).find((item) => item.id === Number(button.dataset.previewDoc));
      if (doc) previewDocument(doc);
    });
  });

  const mapEl = root.querySelector("[data-trip-map]");
  renderTripMap(mapEl, trip, {
    onLocate: () => openTripModal({ trip, onSaved: ctx.refresh }),
  });
}
