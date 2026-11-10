/* Recommendations: quick ideas and comparison tables. */

import { api } from "../api.js";
import { confirmDialog, toast } from "../ui.js";
import { openRecommendationModal } from "../forms.js";
import { esc, icon, recommendationCategory, safeUrl } from "../utils.js";

function recCard(rec) {
  const category = recommendationCategory(rec.category);
  const url = safeUrl(rec.url);
  const pinned = rec.lat !== null && rec.lat !== undefined && rec.lng !== null && rec.lng !== undefined;
  return `
    <article class="rec-card" data-rec-id="${rec.id}">
      <div class="rec-top">
        <div class="rec-icon ${category.tone}">${icon(category.icon)}</div>
        <div class="rec-main">
          <div class="rec-title">${esc(rec.title)}</div>
          ${rec.address ? `<div class="rec-address">${icon("pin")} <span>${esc(rec.address)}</span></div>` : ""}
        </div>
        <div class="rec-actions">
          <button type="button" class="icon-btn" data-rec-edit title="Editar idea" aria-label="Editar idea">${icon("edit")}</button>
          <button type="button" class="icon-btn danger" data-rec-delete title="Eliminar idea" aria-label="Eliminar idea">${icon("trash")}</button>
        </div>
      </div>
      ${rec.notes ? `<div class="rec-notes">${esc(rec.notes)}</div>` : ""}
      <div class="rec-foot">
        <span class="pill ${category.tone}">${icon(category.icon)} ${category.label}${pinned ? " · en el mapa" : ""}</span>
        ${
          url
            ? `<a class="rec-link" href="${esc(url)}" target="_blank" rel="noreferrer">Abrir enlace ${icon("external")}</a>`
            : ""
        }
      </div>
    </article>`;
}

function tableCard(rec) {
  const category = recommendationCategory(rec.category);
  const url = safeUrl(rec.url);
  const columns = Array.isArray(rec.table_columns) ? rec.table_columns : [];
  const rows = Array.isArray(rec.table_rows) ? rec.table_rows : [];
  return `
    <article class="rec-card table-card" data-rec-id="${rec.id}">
      <div class="rec-top">
        <div class="rec-icon ${category.tone}">${icon("layers")}</div>
        <div class="rec-main">
          <div class="rec-title">${esc(rec.title)}</div>
        </div>
        <div class="rec-actions">
          <button type="button" class="icon-btn" data-rec-edit title="Editar tabla" aria-label="Editar tabla">${icon("edit")}</button>
          <button type="button" class="icon-btn danger" data-rec-delete title="Eliminar tabla" aria-label="Eliminar tabla">${icon("trash")}</button>
        </div>
      </div>
      ${
        columns.length
          ? `<div class="rec-table-wrap">
              <table class="rec-table">
                <thead>
                  <tr>${columns.map((column) => `<th>${esc(column)}</th>`).join("")}</tr>
                </thead>
                <tbody>
                  ${rows
                    .map(
                      (cells) =>
                        `<tr>${columns
                          .map((_, index) => `<td>${esc(cells[index] ?? "")}</td>`)
                          .join("")}</tr>`,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : ""
      }
      ${rec.notes ? `<div class="rec-notes">${esc(rec.notes)}</div>` : ""}
      <div class="rec-foot">
        <span class="pill ${category.tone}">${icon("layers")} Tabla comparativa</span>
        ${
          url
            ? `<a class="rec-link" href="${esc(url)}" target="_blank" rel="noreferrer">Abrir enlace ${icon("external")}</a>`
            : ""
        }
      </div>
    </article>`;
}

export function renderRecommendations(root, trip, ctx) {
  const recommendations = trip.recommendations || [];
  const ideas = recommendations.filter((rec) => rec.kind !== "table");
  const tables = recommendations.filter((rec) => rec.kind === "table");

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Ideas y recomendaciones</h2>
        <p>Lugares, restaurantes, experiencias y tablas para comparar opciones · ${recommendations.length} guardada${recommendations.length === 1 ? "" : "s"}</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-primary" data-add-rec>${icon("plus")} Guardar una idea</button>
        <button type="button" class="btn btn-ghost" data-add-table>${icon("layers")} Tabla comparativa</button>
      </div>
    </div>

    ${
      recommendations.length
        ? `
          ${tables.length ? `<div class="rec-section-title">${icon("layers")} Tablas comparativas</div>` : ""}
          ${tables.length ? `<div class="rec-table-list">${tables.map(tableCard).join("")}</div>` : ""}
          ${ideas.length ? `<div class="rec-section-title">${icon("sparkles")} Ideas</div>` : ""}
          ${ideas.length ? `<div class="rec-grid">${ideas.map(recCard).join("")}</div>` : ""}
        `
        : `<div class="card">${`<div class="empty-state">
             <div class="empty-icon">${icon("sparkles")}</div>
             <div class="empty-title">Recoge lo bueno</div>
             <p class="empty-text">Guarda restaurantes, miradores, museos y consejos que encuentres mientras planificas, o crea una tabla para comparar seguros, hoteles o viajes. Las ideas fijadas en el mapa aparecen en el mapa del viaje.</p>
             <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:6px">
               <button type="button" class="btn btn-primary btn-sm" data-add-rec>${icon("plus")} Guardar la primera idea</button>
               <button type="button" class="btn btn-ghost btn-sm" data-add-table>${icon("layers")} Crear una tabla</button>
             </div>
           </div>`}</div>`
    }`;

  root.querySelectorAll("[data-add-rec]").forEach((button) => {
    button.addEventListener("click", () =>
      openRecommendationModal({ trip, mode: "idea", onSaved: ctx.refresh }),
    );
  });

  root.querySelectorAll("[data-add-table]").forEach((button) => {
    button.addEventListener("click", () =>
      openRecommendationModal({ trip, mode: "table", onSaved: ctx.refresh }),
    );
  });

  root.querySelectorAll("[data-rec-id]").forEach((card) => {
    const rec = recommendations.find((item) => item.id === Number(card.dataset.recId));
    if (!rec) return;
    const isTable = rec.kind === "table";
    card.querySelector("[data-rec-edit]")?.addEventListener("click", () => {
      openRecommendationModal({ trip, recommendation: rec, onSaved: ctx.refresh });
    });
    card.querySelector("[data-rec-delete]")?.addEventListener("click", async () => {
      await confirmDialog({
        title: isTable ? "¿Eliminar la tabla?" : "¿Eliminar la idea?",
        message: `“${rec.title}” se eliminará de este viaje.`,
        confirmLabel: isTable ? "Eliminar tabla" : "Eliminar idea",
        onConfirm: async () => {
          await api.deleteRecommendation(rec.id);
          await ctx.refresh();
          toast(isTable ? "Tabla eliminada." : "Idea eliminada.");
        },
      });
    });
  });
}
