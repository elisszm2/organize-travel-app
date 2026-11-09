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
  copyText,
  fileIconName,
} from "../utils.js";

function money(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "";
  try {
    return new Intl.NumberFormat("en-GB", {
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
          <button type="button" class="icon-btn" data-booking-edit title="Edit booking" aria-label="Edit booking">${icon("edit")}</button>
          <button type="button" class="icon-btn danger" data-booking-delete title="Delete booking" aria-label="Delete booking">${icon("trash")}</button>
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
               <span>Confirmation</span>
               <strong>${esc(booking.confirmation)}</strong>
               <button type="button" class="icon-btn" data-copy="${esc(booking.confirmation)}" title="Copy confirmation code" aria-label="Copy confirmation code">${icon("copy")}</button>
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
                     <button type="button" class="doc-chip" data-preview-doc="${doc.id}" title="Preview ${esc(doc.name)}">
                       ${icon(fileIconName(doc.mimetype, doc.name))}<span>${esc(doc.name)}</span>
                     </button>`,
                 )
                 .join("")}
             </div>`
          : ""
      }

      <div class="booking-foot">
        <span class="booking-amount">${esc(amount || "—")}</span>
        <button type="button" class="btn btn-soft btn-sm" data-booking-attach>${icon("upload")} Attach file</button>
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

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Bookings &amp; paperwork</h2>
        <p>Hotels, flights, trains, visas and insurance · ${bookings.length} saved</p>
      </div>
      <button type="button" class="btn btn-primary" data-add-booking>${icon("plus")} Add booking</button>
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
             <div class="empty-title">No bookings saved</div>
             <p class="empty-text">Add your hotel, flight, train, visa or insurance details and attach the confirmation PDF.</p>
             <button type="button" class="btn btn-primary btn-sm" data-add-booking>${icon("plus")} Add first booking</button>
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
        title: "Delete booking?",
        message: `“${booking.title}” will be removed. Attached documents stay in the Documents tab.`,
        confirmLabel: "Delete booking",
        onConfirm: async () => {
          await api.deleteBooking(booking.id);
          await ctx.refresh();
          toast("Booking deleted.");
        },
      });
    });

    card.querySelector("[data-copy]")?.addEventListener("click", async (event) => {
      const value = event.currentTarget.dataset.copy;
      const ok = await copyText(value);
      toast(ok ? "Confirmation code copied." : "Could not copy the code.", ok ? "success" : "error");
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
      toast(`“${file.name}” attached.`);
      await ctx.refresh();
    } catch (error) {
      toast(error.message || "Could not upload the file.", "error");
    } finally {
      attachTarget = null;
      fileInput.value = "";
    }
  });
}
