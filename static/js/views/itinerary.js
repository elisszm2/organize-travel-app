/* Day-by-day itinerary builder. */

import { api } from "../api.js";
import { confirmDialog, toast } from "../ui.js";
import { openDayModal, openActivityModal, openTripModal } from "../forms.js";
import { renderTripMap } from "../map.js";
import {
  esc,
  icon,
  fmtDate,
  fmtWeekday,
  activityCategory,
} from "../utils.js";

function activityRow(activity) {
  const category = activityCategory(activity.category);
  return `
    <div class="activity-row ${activity.done ? "done" : ""}" data-activity-id="${activity.id}">
      <div class="activity-time ${activity.time ? "" : "empty"}">${activity.time ? esc(activity.time) : "—"}</div>
      <div class="activity-icon ${category.tone}">${icon(category.icon)}</div>
      <div class="activity-main">
        <div class="activity-title">${esc(activity.title)}</div>
        <div class="activity-sub">
          <span>${icon(category.icon)} ${category.label}</span>
          ${activity.location ? `<span>${icon("pin")} ${esc(activity.location)}</span>` : ""}
        </div>
        ${activity.notes ? `<div class="activity-notes">${esc(activity.notes)}</div>` : ""}
      </div>
      <div class="activity-actions">
        <button type="button" class="activity-check" data-activity-toggle title="${activity.done ? "Marcar como pendiente" : "Marcar como hecha"}" aria-label="${activity.done ? "Marcar como pendiente" : "Marcar como hecha"}">${icon("check")}</button>
        <button type="button" class="icon-btn" data-activity-edit title="Editar actividad" aria-label="Editar actividad">${icon("edit")}</button>
        <button type="button" class="icon-btn danger" data-activity-delete title="Eliminar actividad" aria-label="Eliminar actividad">${icon("trash")}</button>
      </div>
    </div>`;
}

function dayCard(day) {
  const activities = day.activities || [];
  const done = activities.filter((activity) => activity.done).length;
  const weekday = day.date ? fmtWeekday(day.date) : "";
  return `
    <section class="card day-card" id="day-${day.id}" data-day-id="${day.id}">
      <div class="day-card-head">
        <div class="day-number">
          <div>
            <strong>${day.day_number}</strong>
            <small>día</small>
          </div>
        </div>
        <div class="day-head-main">
          <div class="day-head-title">
            <h3>${esc(day.title || `Día ${day.day_number}`)}</h3>
            ${day.date ? `<span class="day-date">${icon("calendar")} ${esc(weekday)}, ${esc(fmtDate(day.date, "short"))}</span>` : ""}
            ${activities.length ? `<span class="pill ${done === activities.length ? "pill-green" : "pill-teal"}">${done}/${activities.length} hechas</span>` : ""}
          </div>
          ${day.notes ? `<div class="day-notes">${esc(day.notes)}</div>` : ""}
        </div>
        <div class="day-head-actions">
          <button type="button" class="icon-btn" data-day-edit title="Editar día" aria-label="Editar día">${icon("edit")}</button>
          <button type="button" class="icon-btn danger" data-day-delete title="Eliminar día" aria-label="Eliminar día">${icon("trash")}</button>
        </div>
      </div>
      <div class="activity-list">
        ${activities.map(activityRow).join("")}
        ${
          !activities.length
            ? `<div class="activity-empty">
                 Aún no hay nada planificado. Añade la primera parada, comida o trayecto.
                 <div><button type="button" class="btn btn-soft btn-sm" data-activity-add>${icon("plus")} Añadir actividad</button></div>
               </div>`
            : ""
        }
      </div>
      <div class="day-foot">
        <button type="button" class="btn btn-ghost btn-sm" data-activity-add>${icon("plus")} Añadir actividad</button>
      </div>
    </section>`;
}

export function renderItinerary(root, trip, ctx) {
  const days = trip.days || [];
  const pinned = days.reduce(
    (total, day) =>
      total + (day.activities || []).filter((activity) => activity.lat !== null && activity.lng !== null).length,
    0,
  );

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Itinerario</h2>
        <p>Dale forma a cada día, parada a parada. Añade horarios, lugares y notas.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost" data-add-day>${icon("plus")} Añadir día</button>
      </div>
    </div>

    <div class="itinerary-layout">
      <div class="itinerary-main">
        ${
          days.length
            ? days.map(dayCard).join("")
            : `<div class="card">${`<div class="empty-state">
                 <div class="empty-icon">${icon("calendar")}</div>
                 <div class="empty-title">Tu itinerario es una página en blanco</div>
                 <p class="empty-text">Añade un día para empezar a planificar qué hacer, ver y comer.</p>
                 <button type="button" class="btn btn-primary btn-sm" data-add-day>${icon("plus")} Añadir el primer día</button>
               </div>`}</div>`
        }
      </div>

      <aside class="map-sticky">
        <section class="card map-card">
          <div class="card-head">
            <div>
              <div class="card-title">${icon("map")} Mapa de la ruta</div>
              <div class="card-subtitle">${pinned} lugar${pinned === 1 ? "" : "es"} fijado${pinned === 1 ? "" : "s"} · pulsa un marcador para ver los detalles</div>
            </div>
          </div>
          <div class="map-wrap">
            <div class="map" data-trip-map></div>
          </div>
          <div class="map-legend">
            <span><i class="legend-dot" style="background:#e2663f"></i>Itinerario</span>
            <span><i class="legend-dot" style="background:#d9a441"></i>Reservas</span>
            <span><i class="legend-dot" style="background:#2f8f83"></i>Ideas</span>
          </div>
        </section>

        <section class="card">
          <div class="card-body" style="padding-top:18px">
            <div class="fact" style="margin-bottom:10px">
              <span class="fact-label">${icon("calendar")} Días</span>
              <span class="fact-value">${days.length}</span>
            </div>
            <div class="fact" style="margin-bottom:10px">
              <span class="fact-label">${icon("camera")} Actividades</span>
              <span class="fact-value">${trip.activity_count || 0}</span>
            </div>
            <div class="fact" style="margin-bottom:10px">
              <span class="fact-label">${icon("check-circle")} Completadas</span>
              <span class="fact-value">${trip.activity_done || 0}/${trip.activity_count || 0}</span>
            </div>
            <div class="fact">
              <span class="fact-label">${icon("pin")} Lugares en el mapa</span>
              <span class="fact-value">${pinned}</span>
            </div>
          </div>
        </section>
      </aside>
    </div>`;

  root.querySelectorAll("[data-add-day]").forEach((button) => {
    button.addEventListener("click", () => openDayModal({ trip, onSaved: ctx.refresh }));
  });

  root.querySelectorAll(".day-card").forEach((card) => {
    const day = days.find((item) => item.id === Number(card.dataset.dayId));
    if (!day) return;

    card.querySelector("[data-day-edit]")?.addEventListener("click", () => {
      openDayModal({ trip, day, onSaved: ctx.refresh });
    });
    card.querySelector("[data-day-delete]")?.addEventListener("click", async () => {
      await confirmDialog({
        title: "¿Eliminar este día?",
        message: `El día ${day.day_number} y todas sus actividades se eliminarán.`,
        confirmLabel: "Eliminar día",
        onConfirm: async () => {
          await api.deleteDay(day.id);
          await ctx.refresh();
          toast("Día eliminado.");
        },
      });
    });

    card.querySelectorAll("[data-activity-add]").forEach((button) => {
      button.addEventListener("click", () => {
        openActivityModal({ trip, day, onSaved: ctx.refresh });
      });
    });

    card.querySelectorAll("[data-activity-id]").forEach((row) => {
      const activity = (day.activities || []).find((item) => item.id === Number(row.dataset.activityId));
      if (!activity) return;

      row.querySelector("[data-activity-toggle]")?.addEventListener("click", async (event) => {
        event.stopPropagation();
        try {
          await api.updateActivity(activity.id, { done: !activity.done });
          await ctx.refresh();
        } catch (error) {
          toast(error.message || "No se pudo actualizar la actividad.", "error");
        }
      });
      row.querySelector("[data-activity-edit]")?.addEventListener("click", (event) => {
        event.stopPropagation();
        openActivityModal({ trip, day, activity, onSaved: ctx.refresh });
      });
      row.querySelector("[data-activity-delete]")?.addEventListener("click", async (event) => {
        event.stopPropagation();
        await confirmDialog({
          title: "¿Eliminar la actividad?",
          message: `“${activity.title}” se quitará de este día.`,
          confirmLabel: "Eliminar actividad",
          onConfirm: async () => {
            await api.deleteActivity(activity.id);
            await ctx.refresh();
            toast("Actividad eliminada.");
          },
        });
      });
    });
  });

  renderTripMap(root.querySelector("[data-trip-map]"), trip, {
    onLocate: () => openTripModal({ trip, onSaved: ctx.refresh }),
  });

  // If we arrived from the overview by clicking a specific day, scroll to it.
  const target = Number(sessionStorage.getItem("wayfarer-scroll-day") || 0);
  if (target) {
    sessionStorage.removeItem("wayfarer-scroll-day");
    requestAnimationFrame(() => {
      document.getElementById(`day-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}
