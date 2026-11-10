/* Reusable form fields and modal forms. */

import { api } from "./api.js";
import { openModal, toast } from "./ui.js";
import {
  esc,
  icon,
  todayISO,
  ACTIVITY_CATEGORIES,
  TASK_CATEGORIES,
  BOOKING_TYPES,
  BOOKING_FALLBACK,
  RECOMMENDATION_CATEGORIES,
  TRANSPORT_SCOPES,
  TRANSPORT_TYPES,
  tripIconUrl,
  tripCoverUrl,
} from "./utils.js";

/* --------------------------------------------------------------------------
   Field builders
   -------------------------------------------------------------------------- */

export function inputField({
  label,
  name,
  type = "text",
  value = "",
  placeholder = "",
  required = false,
  full = false,
  hint = "",
  min,
  max,
  step,
}) {
  const extras = [
    min !== undefined ? `min="${esc(min)}"` : "",
    max !== undefined ? `max="${esc(max)}"` : "",
    step !== undefined ? `step="${esc(step)}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `
    <div class="field ${full ? "full" : ""}">
      <label for="f-${esc(name)}">${esc(label)}${required ? " *" : ""}</label>
      <input id="f-${esc(name)}" type="${esc(type)}" name="${esc(name)}" value="${esc(value ?? "")}"
        placeholder="${esc(placeholder)}" ${required ? "required" : ""} ${extras}>
      ${hint ? `<span class="field-hint">${esc(hint)}</span>` : ""}
    </div>`;
}

export function selectField({ label, name, value = "", options = {}, full = false, hint = "" }) {
  const entries = Array.isArray(options)
    ? options.map((item) => [item.value, item.label])
    : Object.entries(options).map(([key, meta]) => [key, typeof meta === "string" ? meta : meta.label]);
  return `
    <div class="field ${full ? "full" : ""}">
      <label for="f-${esc(name)}">${esc(label)}</label>
      <select id="f-${esc(name)}" name="${esc(name)}">
        ${entries
          .map(
            ([key, labelText]) =>
              `<option value="${esc(key)}" ${String(key) === String(value) ? "selected" : ""}>${esc(labelText)}</option>`,
          )
          .join("")}
      </select>
      ${hint ? `<span class="field-hint">${esc(hint)}</span>` : ""}
    </div>`;
}

export function textareaField({ label, name, value = "", placeholder = "", full = true, rows = 3 }) {
  return `
    <div class="field ${full ? "full" : ""}">
      <label for="f-${esc(name)}">${esc(label)}</label>
      <textarea id="f-${esc(name)}" name="${esc(name)}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value ?? "")}</textarea>
    </div>`;
}

export function checkboxField({ label, name, checked = false }) {
  return `
    <div class="field full">
      <label class="check-field">
        <input type="checkbox" name="${esc(name)}" ${checked ? "checked" : ""}>
        <span>${esc(label)}</span>
      </label>
    </div>`;
}

export function placeFieldHTML({
  label = "Ubicación",
  name = "location",
  value = "",
  lat = "",
  lng = "",
  placeholder = "Ciudad, hotel, dirección…",
  hint = "Pulsa Buscar para fijarlo en el mapa.",
}) {
  const pinned =
    lat !== "" && lat !== null && lat !== undefined && lng !== "" && lng !== null && lng !== undefined;
  return `
    <div class="field full">
      <label for="f-${esc(name)}">${esc(label)}</label>
      <div class="place-picker" data-place-picker>
        <div class="place-search-row">
          <input id="f-${esc(name)}" type="text" name="${esc(name)}" data-place-input
            value="${esc(value ?? "")}" placeholder="${esc(placeholder)}" autocomplete="off">
          <button type="button" class="btn btn-soft btn-sm" data-place-search>${icon("search")} Buscar</button>
        </div>
        <input type="hidden" name="lat" data-place-lat value="${esc(lat ?? "")}">
        <input type="hidden" name="lng" data-place-lng value="${esc(lng ?? "")}">
        <div class="place-results" data-place-results hidden></div>
        <div class="place-selected ${pinned ? "" : "none"}" data-place-selected>
          ${pinned ? `${icon("pin")} Fijado en el mapa` : hint}
        </div>
      </div>
    </div>`;
}

export function wirePlacePickers(root) {
  root.querySelectorAll("[data-place-picker]").forEach((picker) => {
    const input = picker.querySelector("[data-place-input]");
    const latInput = picker.querySelector("[data-place-lat]");
    const lngInput = picker.querySelector("[data-place-lng]");
    const resultsBox = picker.querySelector("[data-place-results]");
    const selected = picker.querySelector("[data-place-selected]");
    const searchBtn = picker.querySelector("[data-place-search]");
    let items = [];

    const setPinned = (lat, lng) => {
      latInput.value = lat ?? "";
      lngInput.value = lng ?? "";
      const pinned = lat !== null && lat !== undefined && lng !== null && lng !== undefined;
      selected.classList.toggle("none", !pinned);
      selected.innerHTML = pinned ? `${icon("pin")} Fijado en el mapa` : "Pulsa Buscar para fijarlo en el mapa.";
    };

    const runSearch = async () => {
      const query = input.value.trim();
      if (!query) {
        toast("Escribe primero un lugar para buscar.", "error");
        return;
      }
      const original = searchBtn.innerHTML;
      searchBtn.disabled = true;
      searchBtn.textContent = "Buscando…";
      try {
        const data = await api.geocode(query);
        items = data.results || [];
        resultsBox.hidden = false;
        resultsBox.innerHTML = items.length
          ? items
              .map(
                (item, index) =>
                  `<button type="button" class="place-result" data-result-index="${index}">${esc(item.name)}</button>`,
              )
              .join("")
          : `<div class="place-result">No se encontraron lugares. Aún puedes guardar la ubicación como texto.</div>`;
      } catch (error) {
        toast(error.message || "Error al buscar.", "error");
      } finally {
        searchBtn.disabled = false;
        searchBtn.innerHTML = original;
      }
    };

    searchBtn?.addEventListener("click", runSearch);
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch();
      }
    });
    input?.addEventListener("input", () => {
      if (latInput.value || lngInput.value) setPinned(null, null);
      resultsBox.hidden = true;
      items = [];
      resultsBox.innerHTML = "";
    });
    resultsBox?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-result-index]");
      if (!button) return;
      const item = items[Number(button.dataset.resultIndex)];
      if (!item) return;
      input.value = item.short_name || item.name;
      setPinned(item.lat, item.lng);
      resultsBox.hidden = true;
      resultsBox.innerHTML = "";
      items = [];
    });
  });
}

export function fileFieldHTML({ label = "Adjuntar un documento", accept = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*" } = {}) {
  return `
    <div class="field full">
      <label>${esc(label)}</label>
      <label class="file-drop">
        ${icon("upload")}
        <div class="file-drop-main">
          <div class="file-drop-title">Elegir un archivo</div>
          <div class="file-drop-name" data-file-name>PDF, imagen u hoja de cálculo · hasta 30 MB</div>
        </div>
        <input type="file" name="file" data-file-input accept="${esc(accept)}">
      </label>
    </div>`;
}

export function wireFileField(root) {
  const input = root.querySelector("[data-file-input]");
  const label = root.querySelector("[data-file-name]");
  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (label) label.textContent = file ? file.name : "PDF, imagen u hoja de cálculo · hasta 30 MB";
  });
}

function imageFieldHTML({ label, kind, trip = null, hint = "" }) {
  const existing = kind === "icon" ? tripIconUrl(trip) : tripCoverUrl(trip);
  const fallback = kind === "icon" ? icon("camera") : icon("map");
  return `
    <div class="field full">
      <label>${esc(label)}</label>
      <div class="image-field" data-image-field data-kind="${esc(kind)}">
        <div class="image-preview ${esc(kind)}" data-image-preview>
          ${existing ? `<img src="${esc(existing)}" alt="">` : fallback}
        </div>
        <div class="image-field-main">
          <label class="file-drop">
            ${icon("upload")}
            <div class="file-drop-main">
              <div class="file-drop-title">Elegir una imagen</div>
              <div class="file-drop-name" data-image-name>${existing ? "Imagen actual — elige otra para reemplazarla" : "PNG, JPG, WebP, GIF o AVIF · hasta 30 MB"}</div>
            </div>
            <input type="file" data-image-input="${esc(kind)}" accept="image/png,image/jpeg,image/webp,image/gif,image/avif">
          </label>
          ${
            existing
              ? `<label class="check-field image-remove"><input type="checkbox" name="remove_${esc(kind)}"> Quitar la imagen actual</label>`
              : ""
          }
        </div>
      </div>
      ${hint ? `<span class="field-hint">${esc(hint)}</span>` : ""}
    </div>`;
}

function wireImageFields(root) {
  root.querySelectorAll("[data-image-field]").forEach((field) => {
    const input = field.querySelector("[data-image-input]");
    const label = field.querySelector("[data-image-name]");
    const preview = field.querySelector("[data-image-preview]");
    const remove = field.querySelector('input[name^="remove_"]');
    input?.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      if (label) label.textContent = file.name;
      if (remove) remove.checked = false;
      if (preview) {
        const image = document.createElement("img");
        image.src = URL.createObjectURL(file);
        image.alt = "";
        preview.replaceChildren(image);
      }
    });
  });
}

function fd(fdObj, key) {
  return String(fdObj.get(key) ?? "").trim();
}

/* --------------------------------------------------------------------------
   Comparison table editor (ideas shown as tables, like a spreadsheet)
   -------------------------------------------------------------------------- */

const DEFAULT_TABLE_COLUMNS = ["Opción", "Precio", "Notas"];

function tableEditorHTML(rec) {
  const isTable = rec?.kind === "table";
  const columns =
    isTable && Array.isArray(rec.table_columns) && rec.table_columns.length
      ? rec.table_columns
      : [...DEFAULT_TABLE_COLUMNS];
  const rows =
    isTable && Array.isArray(rec.table_rows) && rec.table_rows.length
      ? rec.table_rows.map((cells) => cells.map((cell) => String(cell ?? "")))
      : [["", "", ""]];
  return `
    <div class="field full" data-table-editor>
      <label>Comparación</label>
      <div class="table-editor" data-table-grid>
        <div class="table-scroll">
          <table>
            <thead><tr data-te-head-row></tr></thead>
            <tbody data-te-body></tbody>
          </table>
        </div>
        <div class="table-editor-actions">
          <button type="button" class="btn btn-soft btn-sm" data-te-add-row>${icon("plus")} Añadir fila</button>
          <button type="button" class="btn btn-soft btn-sm" data-te-add-col>${icon("plus")} Añadir columna</button>
        </div>
        <span class="field-hint">Usa la primera columna para el nombre de cada opción (p. ej. cada hotel o seguro) y una fila por opción.</span>
      </div>
    </div>`;
}

function wireTableEditor(root) {
  root.querySelectorAll("[data-table-grid]").forEach((grid) => {
    const headRow = grid.querySelector("[data-te-head-row]");
    const body = grid.querySelector("[data-te-body]");
    let columns = [];
    let rows = [];

    const collect = () => {
      columns = Array.from(headRow.querySelectorAll("[data-te-col]")).map((input) => input.value);
      rows = Array.from(body.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("[data-te-cell]")).map((input) => input.value),
      );
    };

    const render = () => {
      headRow.innerHTML = columns
        .map((column, index) => {
          return `
          <th>
            <span class="te-col-wrap">
              <input type="text" data-te-col value="${esc(column)}" placeholder="Columna ${index + 1}"
                aria-label="Nombre de la columna ${index + 1}">
              <button type="button" class="icon-btn danger te-col-del" data-te-del-col="${index}"
                title="Eliminar columna" aria-label="Eliminar columna">${icon("x")}</button>
            </span>
          </th>`;
        })
        .join("");
      body.innerHTML = rows.length
        ? rows
            .map(
              (cells, index) => `
          <tr>
            ${columns
              .map(
                (_, c) =>
                  `<td><input type="text" data-te-cell value="${esc(cells[c] ?? "")}" aria-label="Celda"></td>`,
              )
              .join("")}
            <td class="te-row-del">
              <button type="button" class="icon-btn danger" data-te-del-row="${index}"
                title="Eliminar fila" aria-label="Eliminar fila">${icon("x")}</button>
            </td>
          </tr>`,
            )
            .join("")
        : `<tr class="te-empty-row"><td class="te-empty-cell" colspan="${columns.length + 1}">Sin filas todavía — pulsa «Añadir fila».</td></tr>`;
    };

    grid.addEventListener("click", (event) => {
      const addRow = event.target.closest("[data-te-add-row]");
      if (addRow) {
        collect();
        rows.push(Array(columns.length).fill(""));
        render();
        body.querySelector(`tr:last-child [data-te-cell]`)?.focus();
        return;
      }
      const addCol = event.target.closest("[data-te-add-col]");
      if (addCol) {
        collect();
        columns.push("");
        rows = rows.map((cells) => [...cells, ""]);
        render();
        headRow.querySelector(`[data-te-col]:last-child`)?.focus();
        return;
      }
      const delCol = event.target.closest("[data-te-del-col]");
      if (delCol) {
        collect();
        const index = Number(delCol.dataset.teDelCol);
        if (columns.length <= 1) {
          toast("Debe quedar al menos una columna.", "error");
          return;
        }
        columns.splice(index, 1);
        rows = rows.map((cells) => cells.filter((_, c) => c !== index));
        render();
        return;
      }
      const delRow = event.target.closest("[data-te-del-row]");
      if (delRow) {
        collect();
        rows.splice(Number(delRow.dataset.teDelRow), 1);
        render();
      }
    });

    render();
  });
}

function readTableEditor(form) {
  const grid = form.querySelector("[data-table-grid]");
  if (!grid) return { columns: [], rows: [] };
  const columns = Array.from(grid.querySelectorAll("[data-te-col]")).map((input) => input.value.trim());
  const rows = Array.from(grid.querySelectorAll("[data-te-body] tr"))
    .filter((tr) => !tr.classList.contains("te-empty-row"))
    .map((tr) => Array.from(tr.querySelectorAll("[data-te-cell]")).map((input) => input.value.trim()));
  return { columns, rows };
}

/* --------------------------------------------------------------------------
   Trip
   -------------------------------------------------------------------------- */

export function openTripModal({ trip = null, onSaved = null } = {}) {
  const editing = Boolean(trip);
  const body = `
    <div class="form-grid">
      ${placeFieldHTML({
        label: "Destino",
        name: "location",
        value: trip?.location || "",
        lat: trip?.lat ?? "",
        lng: trip?.lng ?? "",
        placeholder: "p. ej. Lisboa, Portugal",
      })}
      ${inputField({
        label: "Nombre del viaje",
        name: "title",
        value: trip?.title || "",
        placeholder: trip?.location ? `Viaje a ${trip.location}` : "Déjalo vacío para nombrarlo automáticamente",
        full: true,
      })}
      ${inputField({ label: "Fecha de inicio", name: "start_date", type: "date", value: trip?.start_date || "" })}
      ${inputField({ label: "Fecha de fin", name: "end_date", type: "date", value: trip?.end_date || "" })}
      ${inputField({
        label: "Duración (días)",
        name: "duration_days",
        type: "number",
        value: trip?.day_count ?? "",
        placeholder: "p. ej. 7",
        min: 1,
        max: 365,
        hint: editing ? "Solo se usa al crear los días." : "Solo se usa si no hay fecha de fin.",
      })}
      ${textareaField({
        label: "Descripción",
        name: "description",
        value: trip?.description || "",
        placeholder: "¿De qué va este viaje? Cualquier cosa que quieras recordar.",
        rows: 3,
      })}
      ${imageFieldHTML({
        label: "Icono del viaje (imagen pequeña)",
        kind: "icon",
        trip,
        hint: "Se muestra junto al nombre del viaje en la barra lateral.",
      })}
      ${imageFieldHTML({
        label: "Imagen de cabecera",
        kind: "cover",
        trip,
        hint: "Se muestra como el banner ancho de la parte superior del viaje.",
      })}
      ${
        editing
          ? `<p class="field-hint" style="grid-column:1/-1">Cambiar las fechas aquí no regenera los días del itinerario. Añade o quita días en la pestaña Itinerario.</p>`
          : ""
      }
    </div>`;

  openModal({
    title: editing ? "Editar viaje" : "Planificar un viaje nuevo",
    subtitle: editing
      ? "Actualiza el destino, las fechas y las imágenes de este viaje."
      : "Dale un nombre y un destino — crearemos una página para cada día.",
    body,
    submitLabel: editing ? "Guardar cambios" : "Crear viaje",
    size: "lg",
    onMount: ({ form }) => {
      wirePlacePickers(form);
      wireImageFields(form);
      const start = form.querySelector('[name="start_date"]');
      const end = form.querySelector('[name="end_date"]');
      const duration = form.querySelector('[name="duration_days"]');
      const syncDuration = () => {
        if (start.value && end.value) {
          const a = new Date(`${start.value}T00:00:00`);
          const b = new Date(`${end.value}T00:00:00`);
          const days = Math.round((b - a) / 86400000) + 1;
          if (days > 0) duration.value = days;
        }
      };
      start?.addEventListener("change", syncDuration);
      end?.addEventListener("change", syncDuration);
    },
    onSubmit: async (form) => {
      const data = new FormData(form);
      const location = fd(data, "location");
      if (!location) {
        toast("Añade un destino.", "error");
        return false;
      }
      const files = {
        icon: form.querySelector('[data-image-input="icon"]')?.files?.[0] || null,
        cover: form.querySelector('[data-image-input="cover"]')?.files?.[0] || null,
      };
      const payload = {
        location,
        title: fd(data, "title"),
        description: fd(data, "description"),
        start_date: fd(data, "start_date"),
        end_date: fd(data, "end_date"),
        duration_days: fd(data, "duration_days"),
        lat: fd(data, "lat"),
        lng: fd(data, "lng"),
      };
      const result = editing
        ? await api.updateTrip(trip.id, payload)
        : await api.createTrip(payload);
      let saved = result.trip;
      let imageError = false;
      for (const kind of ["icon", "cover"]) {
        try {
          if (files[kind]) {
            saved = (await api.uploadTripImage(saved.id, kind, files[kind])).trip;
          } else if (data.get(`remove_${kind}`) === "on" && trip?.[`${kind}_image`]) {
            saved = (await api.deleteTripImage(saved.id, kind)).trip;
          }
        } catch (error) {
          imageError = true;
          toast(
            `Viaje guardado, pero no se pudo actualizar la imagen ${kind === "icon" ? "del icono" : "de cabecera"}: ${error.message}`,
            "error",
          );
        }
      }
      if (!imageError) {
        toast(editing ? "Viaje actualizado." : "Viaje creado. Tu itinerario está listo.");
      }
      await onSaved?.(saved);
    },
  });
}

/* --------------------------------------------------------------------------
   Day
   -------------------------------------------------------------------------- */

export function openDayModal({ trip, day = null, onSaved = null } = {}) {
  const editing = Boolean(day);
  const body = `
    <div class="form-grid">
      ${inputField({
        label: "Título del día",
        name: "title",
        value: day?.title || "",
        placeholder: "p. ej. Casco antiguo y atardecer junto al río",
        full: true,
      })}
      ${inputField({ label: "Fecha", name: "date", type: "date", value: day?.date || "" })}
      ${textareaField({
        label: "Notas del día",
        name: "notes",
        value: day?.notes || "",
        placeholder: "Ideas, recordatorios, horarios…",
      })}
    </div>`;

  openModal({
    title: editing ? "Editar día" : "Añadir un día",
    subtitle: editing ? `Día ${day.day_number} de ${trip.title}` : "Añade un día extra a tu itinerario.",
    body,
    submitLabel: editing ? "Guardar día" : "Añadir día",
    onSubmit: async (form) => {
      const data = new FormData(form);
      const payload = {
        title: fd(data, "title"),
        date: fd(data, "date"),
        notes: fd(data, "notes"),
      };
      if (editing) {
        await api.updateDay(day.id, payload);
        toast("Día actualizado.");
      } else {
        await api.createDay(trip.id, payload);
        toast("Día añadido.");
      }
      await onSaved?.();
    },
  });
}

/* --------------------------------------------------------------------------
   Activity
   -------------------------------------------------------------------------- */

export function openActivityModal({ trip, day, activity = null, onSaved = null } = {}) {
  const editing = Boolean(activity);
  const body = `
    <div class="form-grid">
      ${inputField({
        label: "¿Qué vas a hacer?",
        name: "title",
        value: activity?.title || "",
        placeholder: "p. ej. Visitar la Torre de Belém",
        required: true,
        full: true,
      })}
      ${inputField({ label: "Hora", name: "time", type: "time", value: activity?.time || "" })}
      ${selectField({
        label: "Categoría",
        name: "category",
        value: activity?.category || "sightseeing",
        options: ACTIVITY_CATEGORIES,
      })}
      ${placeFieldHTML({
        label: "Ubicación",
        name: "location",
        value: activity?.location || "",
        lat: activity?.lat ?? "",
        lng: activity?.lng ?? "",
        placeholder: "Dirección o nombre del lugar",
      })}
      ${textareaField({
        label: "Notas",
        name: "notes",
        value: activity?.notes || "",
        placeholder: "Entradas, horarios, número de reserva…",
      })}
      ${checkboxField({ label: "Marcar como hecha", name: "done", checked: Boolean(activity?.done) })}
    </div>`;

  openModal({
    title: editing ? "Editar actividad" : "Añadir actividad",
    subtitle: `${day.title || `Día ${day.day_number}`}${day.date ? ` · ${day.date}` : ""}`,
    body,
    submitLabel: editing ? "Guardar actividad" : "Añadir actividad",
    size: "lg",
    onMount: ({ form }) => wirePlacePickers(form),
    onSubmit: async (form) => {
      const data = new FormData(form);
      const title = fd(data, "title");
      if (!title) {
        toast("Da un título a la actividad.", "error");
        return false;
      }
      const payload = {
        title,
        time: fd(data, "time"),
        category: fd(data, "category") || "sightseeing",
        location: fd(data, "location"),
        lat: fd(data, "lat"),
        lng: fd(data, "lng"),
        notes: fd(data, "notes"),
        done: data.get("done") === "on",
      };
      if (editing) {
        await api.updateActivity(activity.id, payload);
        toast("Actividad actualizada.");
      } else {
        await api.createActivity(day.id, payload);
        toast("Actividad añadida.");
      }
      await onSaved?.();
    },
  });
}

/* --------------------------------------------------------------------------
   Task
   -------------------------------------------------------------------------- */

export function openTaskModal({ trip, task = null, status = "todo", onSaved = null } = {}) {
  const editing = Boolean(task);
  const body = `
    <div class="form-grid">
      ${inputField({
        label: "Tarea",
        name: "title",
        value: task?.title || "",
        placeholder: "p. ej. Reservar el hotel en Alfama",
        required: true,
        full: true,
      })}
      ${selectField({ label: "Categoría", name: "category", value: task?.category || "booking", options: TASK_CATEGORIES })}
      ${selectField({
        label: "Estado",
        name: "status",
        value: task?.status || status,
        options: { todo: "Pendiente", doing: "En curso", done: "Hecha" },
      })}
      ${inputField({ label: "Fecha límite", name: "due_date", type: "date", value: task?.due_date || "" })}
      ${textareaField({
        label: "Notas",
        name: "notes",
        value: task?.notes || "",
        placeholder: "Enlaces, referencias, quién se encarga…",
      })}
    </div>`;

  openModal({
    title: editing ? "Editar tarea" : "Añadir tarea",
    subtitle: "Mantén la planificación en marcha — paso a paso.",
    body,
    submitLabel: editing ? "Guardar tarea" : "Añadir tarea",
    onSubmit: async (form) => {
      const data = new FormData(form);
      const title = fd(data, "title");
      if (!title) {
        toast("Da un título a la tarea.", "error");
        return false;
      }
      const payload = {
        title,
        category: fd(data, "category") || "other",
        status: fd(data, "status") || "todo",
        due_date: fd(data, "due_date"),
        notes: fd(data, "notes"),
      };
      if (editing) {
        await api.updateTask(task.id, payload);
        toast("Tarea actualizada.");
      } else {
        await api.createTask(trip.id, payload);
        toast("Tarea añadida.");
      }
      await onSaved?.();
    },
  });
}

/* --------------------------------------------------------------------------
   Booking
   -------------------------------------------------------------------------- */

export function openBookingModal({ trip, booking = null, onSaved = null } = {}) {
  const editing = Boolean(booking);
  // Bookings created before the type list was reduced still keep their type
  // when opened, so saving an edit does not silently rewrite it to "hotel".
  const legacyType = editing && booking.type && !BOOKING_TYPES[booking.type];
  const typeOptions = legacyType ? { ...BOOKING_TYPES, [booking.type]: BOOKING_FALLBACK } : BOOKING_TYPES;
  const body = `
    <div class="form-grid">
      ${selectField({ label: "Tipo", name: "type", value: booking?.type || "hotel", options: typeOptions })}
      ${inputField({
        label: "Título",
        name: "title",
        value: booking?.title || "",
        placeholder: "p. ej. Hotel Alfama — 3 noches",
        required: true,
      })}
      ${inputField({ label: "Proveedor / empresa", name: "provider", value: booking?.provider || "", placeholder: "Booking.com, Air Europa, …" })}
      ${inputField({
        label: "Código de confirmación",
        name: "confirmation",
        value: booking?.confirmation || "",
        placeholder: "Número de referencia",
      })}
      ${inputField({ label: "Entrada", name: "start_date", type: "date", value: booking?.start_date || "" })}
      ${inputField({ label: "Salida", name: "end_date", type: "date", value: booking?.end_date || "" })}
      ${inputField({ label: "Importe", name: "amount", type: "number", value: booking?.amount ?? "", placeholder: "0,00", min: 0, step: "0.01" })}
      ${inputField({ label: "Moneda", name: "currency", value: booking?.currency || "EUR", placeholder: "EUR" })}
      ${placeFieldHTML({
        label: "Dirección",
        name: "address",
        value: booking?.address || "",
        lat: booking?.lat ?? "",
        lng: booking?.lng ?? "",
        placeholder: "Dirección del hotel, estación, punto de encuentro…",
      })}
      ${textareaField({
        label: "Notas",
        name: "notes",
        value: booking?.notes || "",
        placeholder: "Tipo de habitación, política de cancelación, desayuno incluido…",
      })}
      ${fileFieldHTML({ label: editing ? "Adjuntar otro documento" : "Adjuntar un PDF o documento" })}
    </div>`;

  openModal({
    title: editing ? "Editar reserva" : "Añadir una reserva",
    subtitle: "Alojamientos y viajes o excursiones — ten el papeleo junto.",
    body,
    submitLabel: editing ? "Guardar reserva" : "Añadir reserva",
    size: "lg",
    onMount: ({ form }) => {
      wirePlacePickers(form);
      wireFileField(form);
    },
    onSubmit: async (form) => {
      const data = new FormData(form);
      const title = fd(data, "title");
      if (!title) {
        toast("Da un título a la reserva.", "error");
        return false;
      }
      const payload = {
        type: fd(data, "type") || "hotel",
        title,
        provider: fd(data, "provider"),
        confirmation: fd(data, "confirmation"),
        start_date: fd(data, "start_date"),
        end_date: fd(data, "end_date"),
        amount: fd(data, "amount"),
        currency: fd(data, "currency") || "EUR",
        address: fd(data, "address"),
        lat: fd(data, "lat"),
        lng: fd(data, "lng"),
        notes: fd(data, "notes"),
      };
      let saved;
      if (editing) {
        saved = (await api.updateBooking(booking.id, payload)).booking;
        toast("Reserva actualizada.");
      } else {
        saved = (await api.createBooking(trip.id, payload)).booking;
        toast("Reserva añadida.");
      }
      const fileInput = form.querySelector("[data-file-input]");
      const file = fileInput?.files?.[0];
      if (file) {
        await api.uploadDocument(trip.id, file, saved.id);
        toast(`“${file.name}” adjuntado a la reserva.`);
      }
      await onSaved?.(saved);
    },
  });
}

/* --------------------------------------------------------------------------
   Transport
   -------------------------------------------------------------------------- */

export function openTransportModal({ trip, transport = null, onSaved = null } = {}) {
  const editing = Boolean(transport);
  const body = `
    <div class="form-grid">
      ${selectField({
        label: "Tramo",
        name: "scope",
        value: transport?.scope || "arrival",
        options: TRANSPORT_SCOPES,
      })}
      ${selectField({
        label: "Medio",
        name: "type",
        value: transport?.type || "flight",
        options: TRANSPORT_TYPES,
      })}
      ${inputField({
        label: "Título",
        name: "title",
        value: transport?.title || "",
        placeholder: "p. ej. Vuelo a Nueva York",
        required: true,
        full: true,
      })}
      ${inputField({
        label: "Proveedor / empresa",
        name: "provider",
        value: transport?.provider || "",
        placeholder: "Iberia, Renfe, Flixbus…",
      })}
      ${inputField({
        label: "Código de confirmación",
        name: "confirmation",
        value: transport?.confirmation || "",
        placeholder: "Número de referencia",
      })}
      ${inputField({
        label: "Origen",
        name: "from_place",
        value: transport?.from_place || "",
        placeholder: "Ciudad, aeropuerto o estación",
      })}
      ${inputField({
        label: "Destino",
        name: "to_place",
        value: transport?.to_place || "",
        placeholder: "Ciudad, aeropuerto o estación",
      })}
      ${inputField({
        label: "Fecha de salida",
        name: "depart_date",
        type: "date",
        value: transport?.depart_date || "",
      })}
      ${inputField({
        label: "Hora de salida",
        name: "depart_time",
        type: "time",
        value: transport?.depart_time || "",
      })}
      ${inputField({
        label: "Fecha de llegada",
        name: "arrive_date",
        type: "date",
        value: transport?.arrive_date || "",
      })}
      ${inputField({
        label: "Hora de llegada",
        name: "arrive_time",
        type: "time",
        value: transport?.arrive_time || "",
      })}
      ${inputField({
        label: "Importe",
        name: "amount",
        type: "number",
        value: transport?.amount ?? "",
        placeholder: "0,00",
        min: 0,
        step: "0.01",
      })}
      ${inputField({
        label: "Moneda",
        name: "currency",
        value: transport?.currency || "EUR",
        placeholder: "EUR",
      })}
      ${textareaField({
        label: "Notas",
        name: "notes",
        value: transport?.notes || "",
        placeholder: "Asiento, andén, equipaje, conexiones…",
      })}
      ${fileFieldHTML({ label: "Adjuntar un documento (billete, PDF…)" })}
    </div>`;

  openModal({
    title: editing ? "Editar transporte" : "Añadir transporte",
    subtitle: "El viaje hasta tu destino y los trayectos intermedios.",
    body,
    submitLabel: editing ? "Guardar transporte" : "Añadir transporte",
    size: "lg",
    onMount: ({ form }) => wireFileField(form),
    onSubmit: async (form) => {
      const data = new FormData(form);
      const title = fd(data, "title");
      if (!title) {
        toast("Da un título a este transporte.", "error");
        return false;
      }
      const payload = {
        scope: fd(data, "scope") || "arrival",
        type: fd(data, "type") || "flight",
        title,
        provider: fd(data, "provider"),
        confirmation: fd(data, "confirmation"),
        from_place: fd(data, "from_place"),
        to_place: fd(data, "to_place"),
        depart_date: fd(data, "depart_date"),
        depart_time: fd(data, "depart_time"),
        arrive_date: fd(data, "arrive_date"),
        arrive_time: fd(data, "arrive_time"),
        amount: fd(data, "amount"),
        currency: fd(data, "currency") || "EUR",
        notes: fd(data, "notes"),
      };
      let saved;
      if (editing) {
        saved = (await api.updateTransport(transport.id, payload)).transport;
        toast("Transporte actualizado.");
      } else {
        saved = (await api.createTransport(trip.id, payload)).transport;
        toast("Transporte añadido.");
      }
      const fileInput = form.querySelector("[data-file-input]");
      const file = fileInput?.files?.[0];
      if (file) {
        await api.uploadDocument(trip.id, file, null, saved.id);
        toast(`“${file.name}” añadido a los documentos del viaje.`);
      }
      await onSaved?.(saved);
    },
  });
}

/* --------------------------------------------------------------------------
   Recommendation (idea or comparison table)
   -------------------------------------------------------------------------- */

export function openRecommendationModal({ trip, recommendation = null, mode = "idea", onSaved = null } = {}) {
  const editing = Boolean(recommendation);
  const initialMode = recommendation?.kind === "table" || (!editing && mode === "table") ? "table" : "idea";
  const isTable = initialMode === "table";
  const body = `
    <div class="form-grid">
      ${selectField({
        label: "Tipo de entrada",
        name: "mode",
        value: initialMode,
        options: { idea: "Idea", table: "Tabla comparativa" },
        hint: "Las tablas sirven para comparar opciones (seguros, hoteles, viajes…) como en una hoja de cálculo.",
      })}
      ${inputField({
        label: isTable ? "Nombre de la tabla" : "Nombre",
        name: "title",
        value: recommendation?.title || "",
        placeholder: isTable ? "p. ej. Comparativa de seguros de viaje" : "p. ej. Time Out Market",
        required: true,
        full: true,
      })}
      ${selectField({
        label: "Categoría",
        name: "category",
        value: recommendation?.category || "place",
        options: RECOMMENDATION_CATEGORIES,
      })}
      ${inputField({
        label: "Enlace",
        name: "url",
        type: "url",
        value: recommendation?.url || "",
        placeholder: "https://…",
      })}
      <div class="mode-fields ${isTable ? "mode-hidden" : ""}" data-mode-fields="idea">
        ${placeFieldHTML({
          label: "Dirección",
          name: "address",
          value: recommendation?.address || "",
          lat: recommendation?.lat ?? "",
          lng: recommendation?.lng ?? "",
          placeholder: "¿Dónde está?",
        })}
      </div>
      ${textareaField({
        label: "Notas",
        name: "notes",
        value: recommendation?.notes || "",
        placeholder: isTable ? "Conclusiones, a quién preguntar, en qué te basas…" : "Qué pedir, cuándo ir, quién lo recomendó…",
      })}
      <div class="mode-fields ${isTable ? "" : "mode-hidden"}" data-mode-fields="table">
        ${tableEditorHTML(recommendation)}
      </div>
    </div>`;

  openModal({
    title: editing ? (isTable ? "Editar tabla" : "Editar idea") : "Guardar una idea",
    subtitle: isTable
      ? "Compara opciones en una tabla, fila por fila, como en una hoja de cálculo."
      : "Lugares, restaurantes y experiencias que no quieres olvidar.",
    body,
    submitLabel: isTable ? "Guardar tabla" : "Guardar idea",
    size: "lg",
    onMount: ({ form }) => {
      wirePlacePickers(form);
      wireTableEditor(form);
      const titleInput = form.querySelector('[name="title"]');
      const notesInput = form.querySelector('[name="notes"]');
      const modeSelect = form.querySelector('[name="mode"]');
      modeSelect?.addEventListener("change", () => {
        const table = modeSelect.value === "table";
        form.querySelector('[data-mode-fields="idea"]')?.classList.toggle("mode-hidden", table);
        form.querySelector('[data-mode-fields="table"]')?.classList.toggle("mode-hidden", !table);
        if (titleInput) {
          const label = form.querySelector('label[for="f-title"]');
          if (label) label.textContent = table ? "Nombre de la tabla *" : "Nombre *";
          titleInput.placeholder = table
            ? "p. ej. Comparativa de seguros de viaje"
            : "p. ej. Time Out Market";
        }
        if (notesInput) {
          notesInput.placeholder = table
            ? "Conclusiones, a quién preguntar, en qué te basas…"
            : "Qué pedir, cuándo ir, quién lo recomendó…";
        }
      });
    },
    onSubmit: async (form) => {
      const data = new FormData(form);
      const tableMode = fd(data, "mode") === "table";
      const title = fd(data, "title");
      if (!title) {
        toast(tableMode ? "Da un nombre a la tabla." : "Da un nombre a la idea.", "error");
        return false;
      }
      const payload = {
        title,
        category: fd(data, "category") || "place",
        url: fd(data, "url"),
        notes: fd(data, "notes"),
        kind: tableMode ? "table" : "idea",
      };
      if (tableMode) {
        const table = readTableEditor(form);
        if (!table.columns.filter(Boolean).length) {
          toast("Añade al menos una columna con nombre.", "error");
          return false;
        }
        payload.table_columns = table.columns;
        payload.table_rows = table.rows;
        payload.address = "";
        payload.lat = "";
        payload.lng = "";
      } else {
        payload.address = fd(data, "address");
        payload.lat = fd(data, "lat");
        payload.lng = fd(data, "lng");
      }
      if (editing) {
        await api.updateRecommendation(recommendation.id, payload);
        toast(tableMode ? "Tabla actualizada." : "Idea actualizada.");
      } else {
        await api.createRecommendation(trip.id, payload);
        toast(tableMode ? "Tabla guardada." : "Idea guardada.");
      }
      await onSaved?.();
    },
  });
}

export { todayISO };
