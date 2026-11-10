/* Transport legs: arriving, getting around and heading home. */

import { api } from "../api.js";
import { confirmDialog, previewDocument, toast } from "../ui.js";
import { openTransportModal } from "../forms.js";
import {
  esc,
  icon,
  fmtDate,
  transportType,
  transportScope,
  copyText,
  fileIconName,
  TRANSPORT_SCOPES,
} from "../utils.js";

function money(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "";
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${Number(amount).toFixed(2)} ${currency || ""}`.trim();
  }
}

function stopHTML(place, date, time, label) {
  return `
    <div class="transport-stop">
      <span class="transport-stop-label">${esc(label)}</span>
      <strong>${esc(place || "—")}</strong>
      <small>${esc([fmtDate(date, "short"), time].filter(Boolean).join(" · ") || "Hora por decidir")}</small>
    </div>`;
}

function transportCard(item) {
  const type = transportType(item.type);
  const scope = transportScope(item.scope);
  const amount = money(item.amount, item.currency);
  return `
    <article class="booking-card transport-card" data-transport-id="${item.id}">
      <div class="booking-card-top">
        <div class="booking-head-main">
          <div class="booking-title">${esc(item.title)}</div>
          <div class="booking-provider">${esc([scope.label, type.label, item.provider].filter(Boolean).join(" · "))}</div>
        </div>
        <div class="booking-actions">
          <button type="button" class="icon-btn" data-transport-edit title="Editar transporte" aria-label="Editar transporte">${icon("edit")}</button>
          <button type="button" class="icon-btn danger" data-transport-delete title="Eliminar transporte" aria-label="Eliminar transporte">${icon("trash")}</button>
        </div>
      </div>

      <div class="transport-route">
        ${stopHTML(item.from_place, item.depart_date, item.depart_time, "Origen")}
        <div class="transport-arrow">${icon(type.icon)}<span></span></div>
        ${stopHTML(item.to_place, item.arrive_date || item.depart_date, item.arrive_time, "Destino")}
      </div>

      ${
        item.confirmation
          ? `<div class="booking-confirmation">
               <span>Confirmación</span>
               <strong>${esc(item.confirmation)}</strong>
               <button type="button" class="icon-btn" data-copy="${esc(item.confirmation)}" title="Copiar código de confirmación" aria-label="Copiar código de confirmación">${icon("copy")}</button>
             </div>`
          : ""
      }

      ${item.notes ? `<div class="booking-notes">${esc(item.notes)}</div>` : ""}

      ${
        (item.documents || []).length
          ? `<div class="booking-docs">
               ${(item.documents || [])
                 .map(
                   (doc) => `
                     <button type="button" class="doc-chip" data-preview-doc="${doc.id}" title="Ver ${esc(doc.name)}">
                       ${icon(fileIconName(doc.mimetype, doc.name))}<span>${esc(doc.name)}</span>
                     </button>`,
                 )
                 .join("")}
             </div>`
          : ""
      }

      <div class="booking-foot">
        <span class="booking-amount">${esc(amount || "—")}</span>
        <span class="pill ${item.scope === "internal" ? "pill-teal" : item.scope === "return" ? "pill-accent" : "pill-gold"}">${icon(scope.icon)} ${esc(scope.label)}</span>
      </div>
    </article>`;
}

export function renderTransport(root, trip, ctx) {
  const transport = trip.transport || [];

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Transporte</h2>
        <p>Cómo llegas, cómo te mueves por allí y cómo vuelves · ${transport.length} trayecto${transport.length === 1 ? "" : "s"} guardado${transport.length === 1 ? "" : "s"}</p>
      </div>
      <button type="button" class="btn btn-primary" data-add-transport>${icon("plus")} Añadir transporte</button>
    </div>

    ${
      transport.length
        ? `<div class="booking-groups">
            ${Object.keys(TRANSPORT_SCOPES)
              .map((key) => {
                const scope = TRANSPORT_SCOPES[key];
                const items = transport.filter((item) => item.scope === key);
                if (!items.length) return "";
                return `
                  <section>
                    <div class="booking-group-head">${icon(scope.icon)} ${esc(scope.label)} <span style="opacity:.6">${items.length}</span></div>
                    <div class="booking-grid">${items.map(transportCard).join("")}</div>
                  </section>`;
              })
              .join("")}
          </div>`
        : `<div class="card"><div class="empty-state">
             <div class="empty-icon">${icon("route")}</div>
             <div class="empty-title">Sin transportes guardados</div>
             <p class="empty-text">Añade el vuelo, tren o bus que te lleva a tu destino y, después, los trayectos internos. También aparecerán en el resumen del viaje.</p>
             <button type="button" class="btn btn-primary btn-sm" data-add-transport>${icon("plus")} Añadir el primer trayecto</button>
           </div></div>`
    }`;

  root.querySelectorAll("[data-add-transport]").forEach((button) => {
    button.addEventListener("click", () => openTransportModal({ trip, onSaved: ctx.refresh }));
  });

  root.querySelectorAll("[data-transport-id]").forEach((card) => {
    const item = transport.find((entry) => entry.id === Number(card.dataset.transportId));
    if (!item) return;

    card.querySelector("[data-transport-edit]")?.addEventListener("click", () => {
      openTransportModal({ trip, transport: item, onSaved: ctx.refresh });
    });

    card.querySelector("[data-transport-delete]")?.addEventListener("click", async () => {
      await confirmDialog({
        title: "¿Eliminar el transporte?",
        message: `“${item.title}” se eliminará de este viaje.`,
        confirmLabel: "Eliminar transporte",
        onConfirm: async () => {
          await api.deleteTransport(item.id);
          await ctx.refresh();
          toast("Transporte eliminado.");
        },
      });
    });

    card.querySelector("[data-copy]")?.addEventListener("click", async (event) => {
      const ok = await copyText(event.currentTarget.dataset.copy);
      toast(ok ? "Código de confirmación copiado." : "No se pudo copiar el código.", ok ? "success" : "error");
    });

    card.querySelectorAll("[data-preview-doc]").forEach((button) => {
      button.addEventListener("click", () => {
        const doc = (item.documents || []).find((entry) => entry.id === Number(button.dataset.previewDoc));
        if (doc) previewDocument(doc);
      });
    });
  });
}
