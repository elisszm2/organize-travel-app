/* Documents: upload PDFs, images and spreadsheets. */

import { api } from "../api.js";
import { confirmDialog, previewDocument, toast } from "../ui.js";
import {
  esc,
  icon,
  fmtBytes,
  fmtDateTime,
  fileKind,
  fileIconName,
} from "../utils.js";

function docCard(doc, bookingName) {
  const kind = fileKind(doc.mimetype, doc.name);
  return `
    <article class="doc-card" data-doc-id="${doc.id}">
      <div class="doc-type ${kind}">${icon(fileIconName(doc.mimetype, doc.name))}</div>
      <div class="doc-main">
        <div class="doc-name" title="${esc(doc.name)}">${esc(doc.name)}</div>
        <div class="doc-meta">${esc(fmtBytes(doc.size))} · ${esc(fmtDateTime(doc.uploaded_at))}</div>
        ${bookingName ? `<div class="doc-link">${icon("ticket")} ${esc(bookingName)}</div>` : ""}
      </div>
      <div class="doc-actions">
        <button type="button" class="icon-btn" data-doc-preview title="Preview" aria-label="Preview">${icon("eye")}</button>
        <a class="icon-btn" href="${esc(doc.url)}?download=1" title="Download" aria-label="Download">${icon("download")}</a>
        <button type="button" class="icon-btn danger" data-doc-delete title="Delete" aria-label="Delete">${icon("trash")}</button>
      </div>
    </article>`;
}

export function renderDocuments(root, trip, ctx) {
  const documents = trip.documents || [];
  const bookings = trip.bookings || [];
  const totalSize = documents.reduce((sum, doc) => sum + Number(doc.size || 0), 0);

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Documents</h2>
        <p>Booking confirmations, tickets, visas and PDFs · ${documents.length} file${documents.length === 1 ? "" : "s"} · ${fmtBytes(totalSize)}</p>
      </div>
    </div>

    <div class="upload-controls">
      <span class="select-inline">
        ${icon("ticket")} Attach new files to
        <select data-booking-select>
          <option value="">No booking</option>
          ${bookings.map((booking) => `<option value="${booking.id}">${esc(booking.title)}</option>`).join("")}
        </select>
      </span>
      <span class="field-hint">PDF, images or spreadsheets · up to 30 MB each</span>
    </div>

    <div class="upload-zone" data-upload-zone role="button" tabindex="0">
      <div class="upload-icon">${icon("upload")}</div>
      <div class="upload-title" data-upload-title>Drop files here, or click to browse</div>
      <div class="upload-hint" data-upload-hint>Everything is stored locally on this computer.</div>
      <input type="file" data-doc-input multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*">
    </div>

    ${
      documents.length
        ? `<div class="doc-grid">
            ${documents
              .map((doc) => {
                const booking = bookings.find((item) => item.id === doc.booking_id);
                return docCard(doc, booking?.title || "");
              })
              .join("")}
          </div>`
        : `<div class="card" style="margin-top:18px">${`<div class="empty-state">
             <div class="empty-icon">${icon("folder")}</div>
             <div class="empty-title">No documents yet</div>
             <p class="empty-text">Upload your booking confirmations and tickets so they're always at hand.</p>
           </div>`}</div>`
    }`;

  const zone = root.querySelector("[data-upload-zone]");
  const input = root.querySelector("[data-doc-input]");
  const select = root.querySelector("[data-booking-select]");
  const title = root.querySelector("[data-upload-title]");
  const hint = root.querySelector("[data-upload-hint]");

  const uploadFiles = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    const bookingId = select?.value ? Number(select.value) : null;
    zone.classList.add("drag-over");
    title.textContent = `Uploading ${list.length} file${list.length === 1 ? "" : "s"}…`;
    hint.textContent = "Please keep this page open.";
    let uploaded = 0;
    let failed = 0;
    for (const file of list) {
      try {
        await api.uploadDocument(trip.id, file, bookingId);
        uploaded += 1;
      } catch (error) {
        failed += 1;
        toast(`${file.name}: ${error.message}`, "error");
      }
    }
    if (uploaded) {
      toast(`${uploaded} file${uploaded === 1 ? "" : "s"} uploaded.`);
      await ctx.refresh();
    } else {
      title.textContent = "Drop files here, or click to browse";
      hint.textContent = "Everything is stored locally on this computer.";
    }
    if (failed && !uploaded) {
      title.textContent = "Drop files here, or click to browse";
      hint.textContent = "Everything is stored locally on this computer.";
    }
    zone.classList.remove("drag-over");
  };

  zone?.addEventListener("click", (event) => {
    if (event.target === input) return;
    input?.click();
  });
  zone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input?.click();
    }
  });
  input?.addEventListener("change", () => uploadFiles(input.files));

  ["dragenter", "dragover"].forEach((name) => {
    zone?.addEventListener(name, (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach((name) => {
    zone?.addEventListener(name, (event) => {
      event.preventDefault();
      if (name === "dragleave" && zone.contains(event.relatedTarget)) return;
      zone.classList.remove("drag-over");
    });
  });
  zone?.addEventListener("drop", (event) => {
    uploadFiles(event.dataTransfer?.files);
  });

  root.querySelectorAll("[data-doc-id]").forEach((card) => {
    const doc = documents.find((item) => item.id === Number(card.dataset.docId));
    if (!doc) return;
    card.querySelector("[data-doc-preview]")?.addEventListener("click", () => previewDocument(doc));
    card.querySelector(".doc-name")?.addEventListener("click", () => previewDocument(doc));
    card.querySelector("[data-doc-delete]")?.addEventListener("click", async () => {
      await confirmDialog({
        title: "Delete document?",
        message: `“${doc.name}” will be permanently deleted from this computer.`,
        confirmLabel: "Delete file",
        onConfirm: async () => {
          await api.deleteDocument(doc.id);
          await ctx.refresh();
          toast("Document deleted.");
        },
      });
    });
  });
}
