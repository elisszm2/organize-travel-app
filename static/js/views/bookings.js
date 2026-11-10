/* Bookings and reservations, with attached documents. */

import { api } from "../api.js";
import { confirmDialog, previewDocument, toast } from "../ui.js";
import { openBookingModal } from "../forms.js";
import {
  esc,
  icon,
  fmtDateRange,
  bookingType,
  BOOKING_TYPES,
  BOOKING_FALLBACK,
  copyText,
  fileIconName,
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

function bookingCard(booking) {
  const type = bookingType(booking.type);
  const amount = money(booking.amount, booking.currency);
  const dateLabel = fmtDateRange(booking.start_date, booking.end_date);
  return `
    <article class="booking-card" data-booking-id="${booking.id}">
      <div class="booking-card-top">
        <div class="booking-icon ${esc(booking.type)}">${icon(type.icon)}</div>
        <div class="booking-head-main">
          <div class="booking-title">${esc(booking.title)}</div>
          ${booking.provider ? `<div class="booking-provider">${esc(booking.provider)}</div>` : ""}
        </div>
        <div class="booking-actions">
          <button type="button" class="icon-btn" data-booking-edit title="Editar reserva" aria-label="Editar reserva">${icon("edit")}</button>
          <button type="button" class="icon-btn danger" data-booking-delete title="Eliminar reserva" aria-label="Eliminar reserva">${icon("trash")}</button>
        </div>
      </div>

      <div class="booking-meta">
        <span>${icon("calendar")} ${esc(dateLabel)}</span>
        ${booking.address ? `<span>${icon("pin")} ${esc(booking.address)}</span>` : ""}
      </div>

      ${
        booking.confirmation
          ? `<div class="booking-confirmation">
               ${icon("ticket")}
               <span>Confirmación</span>
               <strong>${esc(booking.confirmation)}</strong>
               <button type="button" class="icon-btn" data-copy="${esc(booking.confirmation)}" title="Copiar código de confirmación" aria-label="Copiar código de confirmación">${icon("copy")}</button>
             </div>`
          : ""
      }

      ${booking.notes ? `<div class="booking-notes">${esc(booking.notes)}</div>` : ""}

      ${
        (booking.documents || []).length
          ? `<div class="booking-docs">
               ${(booking.documents || [])
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
        <button type="button" class="btn btn-soft btn-sm" data-booking-attach>${icon("upload")} Adjuntar archivo</button>
      </div>
    </article>`;
}

export function renderBookings(root, trip, ctx) {
  const bookings = trip.bookings || [];
  const groups = Object.keys(BOOKING_TYPES)
    .map((key) => ({
      key,
      meta: BOOKING_TYPES[key],
      items: bookings.filter((booking) => booking.type === key),
    }))
    .filter((group) => group.items.length);
  // Older rows with types that are no longer offered still show up here.
  const legacy = bookings.filter((booking) => !BOOKING_TYPES[booking.type]);
  if (legacy.length) {
    groups.push({ key: "other", meta: BOOKING_FALLBACK, items: legacy });
  }

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Reservas</h2>
        <p>Alojamientos (hoteles, apartamentos, hostales…) y viajes o excursiones · ${bookings.length} guardada${bookings.length === 1 ? "" : "s"}</p>
      </div>
      <button type="button" class="btn btn-primary" data-add-booking>${icon("plus")} Añadir reserva</button>
    </div>

    ${
      groups.length
        ? `<div class="booking-groups">
            ${groups
              .map(
                (group) => `
                  <section>
                    <div class="booking-group-head">${icon(group.meta.icon)} ${esc(group.meta.plural)} <span style="opacity:.6">${group.items.length}</span></div>
                    <div class="booking-grid">${group.items.map(bookingCard).join("")}</div>
                  </section>`,
              )
              .join("")}
          </div>`
        : `<div class="card">${`<div class="empty-state">
             <div class="empty-icon">${icon("ticket")}</div>
             <div class="empty-title">Sin reservas guardadas</div>
             <p class="empty-text">Añade tu hotel, apartamento, hostal o la excursión contratada y adjunta el PDF de confirmación.</p>
             <button type="button" class="btn btn-primary btn-sm" data-add-booking>${icon("plus")} Añadir la primera reserva</button>
           </div>`}</div>`
    }

    <input type="file" data-booking-file hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*">`;

  root.querySelectorAll("[data-add-booking]").forEach((button) => {
    button.addEventListener("click", () => openBookingModal({ trip, onSaved: ctx.refresh }));
  });

  const fileInput = root.querySelector("[data-booking-file]");
  let attachTarget = null;

  root.querySelectorAll("[data-booking-id]").forEach((card) => {
    const booking = bookings.find((item) => item.id === Number(card.dataset.bookingId));
    if (!booking) return;

    card.querySelector("[data-booking-edit]")?.addEventListener("click", () => {
      openBookingModal({ trip, booking, onSaved: ctx.refresh });
    });

    card.querySelector("[data-booking-delete]")?.addEventListener("click", async () => {
      await confirmDialog({
        title: "¿Eliminar la reserva?",
        message: `“${booking.title}” se eliminará. Los documentos adjuntos permanecen en la pestaña Documentos.`,
        confirmLabel: "Eliminar reserva",
        onConfirm: async () => {
          await api.deleteBooking(booking.id);
          await ctx.refresh();
          toast("Reserva eliminada.");
        },
      });
    });

    card.querySelector("[data-copy]")?.addEventListener("click", async (event) => {
      const value = event.currentTarget.dataset.copy;
      const ok = await copyText(value);
      toast(ok ? "Código de confirmación copiado." : "No se pudo copiar el código.", ok ? "success" : "error");
    });

    card.querySelector("[data-booking-attach]")?.addEventListener("click", () => {
      attachTarget = booking;
      fileInput.value = "";
      fileInput.click();
    });

    card.querySelectorAll("[data-preview-doc]").forEach((button) => {
      button.addEventListener("click", () => {
        const doc = (booking.documents || []).find((item) => item.id === Number(button.dataset.previewDoc));
        if (doc) previewDocument(doc);
      });
    });
  });

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file || !attachTarget) return;
    try {
      await api.uploadDocument(trip.id, file, attachTarget.id);
      toast(`“${file.name}” adjuntado.`);
      await ctx.refresh();
    } catch (error) {
      toast(error.message || "No se pudo subir el archivo.", "error");
    } finally {
      attachTarget = null;
      fileInput.value = "";
    }
  });
}
