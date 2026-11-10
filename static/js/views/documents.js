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

function docCard(doc, linked) {
  const kind = fileKind(doc.mimetype, doc.name);
  return `
    <article class="doc-card" data-doc-id="${doc.id}">
      <div class="doc-type ${kind}">${icon(fileIconName(doc.mimetype, doc.name))}</div>
      <div class="doc-main">
        <div class="doc-name" title="${esc(doc.name)}">${esc(doc.name)}</div>
        <div class="doc-meta">${esc(fmtBytes(doc.size))} · ${esc(fmtDateTime(doc.uploaded_at))}</div>
        ${linked ? `<div class="doc-link">${icon(linked.icon)} ${esc(linked.name)}</div>` : ""}
      </div>
      <div class="doc-actions">
        <button type="button" class="icon-btn" data-doc-preview title="Ver" aria-label="Ver">${icon("eye")}</button>
        <a class="icon-btn" href="${esc(doc.url)}?download=1" title="Descargar" aria-label="Descargar">${icon("download")}</a>
        <button type="button" class="icon-btn danger" data-doc-delete title="Eliminar" aria-label="Eliminar">${icon("trash")}</button>
      </div>
    </article>`;
}

export function renderDocuments(root, trip, ctx) {
  const documents = trip.documents || [];
  const bookings = trip.bookings || [];
  const transport = trip.transport || [];
  const totalSize = documents.reduce((sum, doc) => sum + Number(doc.size || 0), 0);

  const linkedFor = (doc) => {
    if (doc.booking_id) {
      const booking = bookings.find((item) => item.id === doc.booking_id);
      if (booking) return { name: booking.title, icon: "ticket" };
    }
    if (doc.transport_id) {
      const leg = transport.find((item) => item.id === doc.transport_id);
      if (leg) return { name: leg.title, icon: "plane" };
    }
    return null;
  };

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Documentos</h2>
        <p>Confirmaciones, billetes, visados y PDF · ${documents.length} archivo${documents.length === 1 ? "" : "s"} · ${fmtBytes(totalSize)}</p>
      </div>
    </div>

    <div class="upload-controls">
      <span class="select-inline">
        ${icon("link")} Enlazar archivos nuevos con
        <select data-attach-select>
          <option value="">Sin enlace</option>
          ${bookings.length ? `<optgroup label="Reservas">${bookings.map((booking) => `<option value="booking:${booking.id}">${esc(booking.title)}</option>`).join("")}</optgroup>` : ""}
          ${transport.length ? `<optgroup label="Transportes">${transport.map((leg) => `<option value="transport:${leg.id}">${esc(leg.title)}</option>`).join("")}</optgroup>` : ""}
        </select>
      </span>
      <span class="field-hint">PDF, imágenes u hojas de cálculo · hasta 30 MB cada uno</span>
    </div>

    <div class="upload-zone" data-upload-zone role="button" tabindex="0">
      <div class="upload-icon">${icon("upload")}</div>
      <div class="upload-title" data-upload-title>Suelta los archivos aquí o haz clic para explorar</div>
      <div class="upload-hint" data-upload-hint>Todo se guarda localmente en este ordenador.</div>
      <input type="file" data-doc-input multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*">
    </div>

    ${
      documents.length
        ? `<div class="doc-grid">
            ${documents.map((doc) => docCard(doc, linkedFor(doc))).join("")}
          </div>`
        : `<div class="card" style="margin-top:18px">${`<div class="empty-state">
             <div class="empty-icon">${icon("folder")}</div>
             <div class="empty-title">Sin documentos todavía</div>
             <p class="empty-text">Sube tus confirmaciones y billetes para tenerlos siempre a mano.</p>
           </div>`}</div>`
    }`;

  const zone = root.querySelector("[data-upload-zone]");
  const input = root.querySelector("[data-doc-input]");
  const select = root.querySelector("[data-attach-select]");
  const title = root.querySelector("[data-upload-title]");
  const hint = root.querySelector("[data-upload-hint]");
  const DEFAULT_TITLE = "Suelta los archivos aquí o haz clic para explorar";
  const DEFAULT_HINT = "Todo se guarda localmente en este ordenador.";

  const uploadFiles = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    const raw = select?.value || "";
    let bookingId = null;
    let transportId = null;
    if (raw.startsWith("booking:")) bookingId = Number(raw.split(":")[1]);
    if (raw.startsWith("transport:")) transportId = Number(raw.split(":")[1]);
    zone.classList.add("drag-over");
    title.textContent = `Subiendo ${list.length} archivo${list.length === 1 ? "" : "s"}…`;
    hint.textContent = "Mantén esta página abierta.";
    let uploaded = 0;
    let failed = 0;
    for (const file of list) {
      try {
        await api.uploadDocument(trip.id, file, bookingId, transportId);
        uploaded += 1;
      } catch (error) {
        failed += 1;
        toast(`${file.name}: ${error.message}`, "error");
      }
    }
    if (uploaded) {
      toast(`${uploaded} archivo${uploaded === 1 ? "" : "s"} subido${uploaded === 1 ? "" : "s"}.`);
      await ctx.refresh();
    }
    if (failed || !uploaded) {
      title.textContent = DEFAULT_TITLE;
      hint.textContent = DEFAULT_HINT;
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
        title: "¿Eliminar el documento?",
        message: `“${doc.name}” se eliminará permanentemente de este ordenador.`,
        confirmLabel: "Eliminar archivo",
        onConfirm: async () => {
          await api.deleteDocument(doc.id);
          await ctx.refresh();
          toast("Documento eliminado.");
        },
      });
    });
  });
}
