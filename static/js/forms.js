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
  label = "Location",
  name = "location",
  value = "",
  lat = "",
  lng = "",
  placeholder = "City, hotel, address…",
  hint = "Press Find to pin it on the map.",
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
          <button type="button" class="btn btn-soft btn-sm" data-place-search>${icon("search")} Find</button>
        </div>
        <input type="hidden" name="lat" data-place-lat value="${esc(lat ?? "")}">
        <input type="hidden" name="lng" data-place-lng value="${esc(lng ?? "")}">
        <div class="place-results" data-place-results hidden></div>
        <div class="place-selected ${pinned ? "" : "none"}" data-place-selected>
          ${pinned ? `${icon("pin")} Pinned on the map` : hint}
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
      selected.innerHTML = pinned ? `${icon("pin")} Pinned on the map` : "Press Find to pin it on the map.";
    };

    const runSearch = async () => {
      const query = input.value.trim();
      if (!query) {
        toast("Type a place to search first.", "error");
        return;
      }
      const original = searchBtn.innerHTML;
      searchBtn.disabled = true;
      searchBtn.textContent = "Searching…";
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
          : `<div class="place-result">No places found. You can still save the location as text.</div>`;
      } catch (error) {
        toast(error.message || "Search failed.", "error");
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

export function fileFieldHTML({ label = "Attach a document", accept = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*" } = {}) {
  return `
    <div class="field full">
      <label>${esc(label)}</label>
      <label class="file-drop">
        ${icon("upload")}
        <div class="file-drop-main">
          <div class="file-drop-title">Choose a file</div>
          <div class="file-drop-name" data-file-name>PDF, image or spreadsheet · up to 30 MB</div>
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
    if (label) label.textContent = file ? file.name : "PDF, image or spreadsheet · up to 30 MB";
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
              <div class="file-drop-title">Choose an image</div>
              <div class="file-drop-name" data-image-name>${existing ? "Current image — choose a new one to replace it" : "PNG, JPG, WebP, GIF or AVIF · up to 30 MB"}</div>
            </div>
            <input type="file" data-image-input="${esc(kind)}" accept="image/png,image/jpeg,image/webp,image/gif,image/avif">
          </label>
          ${
            existing
              ? `<label class="check-field image-remove"><input type="checkbox" name="remove_${esc(kind)}"> Remove current image</label>`
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
   Trip
   -------------------------------------------------------------------------- */

export function openTripModal({ trip = null, onSaved = null } = {}) {
  const editing = Boolean(trip);
  const body = `
    <div class="form-grid">
      ${placeFieldHTML({
        label: "Destination",
        name: "location",
        value: trip?.location || "",
        lat: trip?.lat ?? "",
        lng: trip?.lng ?? "",
        placeholder: "e.g. Lisbon, Portugal",
      })}
      ${inputField({
        label: "Trip name",
        name: "title",
        value: trip?.title || "",
        placeholder: trip?.location ? `Trip to ${trip.location}` : "Leave empty to auto-name it",
        full: true,
      })}
      ${inputField({ label: "Start date", name: "start_date", type: "date", value: trip?.start_date || "" })}
      ${inputField({ label: "End date", name: "end_date", type: "date", value: trip?.end_date || "" })}
      ${inputField({
        label: "Duration (days)",
        name: "duration_days",
        type: "number",
        value: trip?.day_count ?? "",
        placeholder: "e.g. 7",
        min: 1,
        max: 365,
        hint: editing ? "Used only when creating days." : "Used only if no end date is set.",
      })}
      ${textareaField({
        label: "Description",
        name: "description",
        value: trip?.description || "",
        placeholder: "What is this trip about? Anything you want to remember.",
        rows: 3,
      })}
      ${imageFieldHTML({
        label: "Trip icon (small picture)",
        kind: "icon",
        trip,
        hint: "Shown next to the trip name in the sidebar.",
      })}
      ${imageFieldHTML({
        label: "Header cover image",
        kind: "cover",
        trip,
        hint: "Shown as the wide banner at the top of this trip.",
      })}
      ${
        editing
          ? `<p class="field-hint" style="grid-column:1/-1">Changing dates here does not regenerate itinerary days. Add or remove days from the Itinerary tab.</p>`
          : ""
      }
    </div>`;

  openModal({
    title: editing ? "Edit trip" : "Plan a new trip",
    subtitle: editing
      ? "Update the destination, dates and the images for this trip."
      : "Give it a name and a destination — we'll create a page for every day.",
    body,
    submitLabel: editing ? "Save changes" : "Create trip",
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
        toast("Please add a destination.", "error");
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
          toast(`Trip saved, but the ${kind} image could not be updated: ${error.message}`, "error");
        }
      }
      if (!imageError) {
        toast(editing ? "Trip updated." : "Trip created. Your itinerary is ready.");
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
        label: "Day title",
        name: "title",
        value: day?.title || "",
        placeholder: "e.g. Old town & sunset at the river",
        full: true,
      })}
      ${inputField({ label: "Date", name: "date", type: "date", value: day?.date || "" })}
      ${textareaField({
        label: "Notes for the day",
        name: "notes",
        value: day?.notes || "",
        placeholder: "Ideas, reminders, opening hours…",
      })}
    </div>`;

  openModal({
    title: editing ? "Edit day" : "Add a day",
    subtitle: editing ? `Day ${day.day_number} of ${trip.title}` : "Add an extra day to your itinerary.",
    body,
    submitLabel: editing ? "Save day" : "Add day",
    onSubmit: async (form) => {
      const data = new FormData(form);
      const payload = {
        title: fd(data, "title"),
        date: fd(data, "date"),
        notes: fd(data, "notes"),
      };
      if (editing) {
        await api.updateDay(day.id, payload);
        toast("Day updated.");
      } else {
        await api.createDay(trip.id, payload);
        toast("Day added.");
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
        label: "What are you doing?",
        name: "title",
        value: activity?.title || "",
        placeholder: "e.g. Visit the Belém Tower",
        required: true,
        full: true,
      })}
      ${inputField({ label: "Time", name: "time", type: "time", value: activity?.time || "" })}
      ${selectField({
        label: "Category",
        name: "category",
        value: activity?.category || "sightseeing",
        options: ACTIVITY_CATEGORIES,
      })}
      ${placeFieldHTML({
        label: "Location",
        name: "location",
        value: activity?.location || "",
        lat: activity?.lat ?? "",
        lng: activity?.lng ?? "",
        placeholder: "Address or place name",
      })}
      ${textareaField({
        label: "Notes",
        name: "notes",
        value: activity?.notes || "",
        placeholder: "Tickets, opening hours, reservation number…",
      })}
      ${checkboxField({ label: "Mark as done", name: "done", checked: Boolean(activity?.done) })}
    </div>`;

  openModal({
    title: editing ? "Edit activity" : "Add activity",
    subtitle: `${day.title || `Day ${day.day_number}`}${day.date ? ` · ${day.date}` : ""}`,
    body,
    submitLabel: editing ? "Save activity" : "Add activity",
    size: "lg",
    onMount: ({ form }) => wirePlacePickers(form),
    onSubmit: async (form) => {
      const data = new FormData(form);
      const title = fd(data, "title");
      if (!title) {
        toast("Give the activity a title.", "error");
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
        toast("Activity updated.");
      } else {
        await api.createActivity(day.id, payload);
        toast("Activity added.");
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
        label: "Task",
        name: "title",
        value: task?.title || "",
        placeholder: "e.g. Book the hotel in Alfama",
        required: true,
        full: true,
      })}
      ${selectField({ label: "Category", name: "category", value: task?.category || "booking", options: TASK_CATEGORIES })}
      ${selectField({
        label: "Status",
        name: "status",
        value: task?.status || status,
        options: { todo: "To do", doing: "In progress", done: "Done" },
      })}
      ${inputField({ label: "Due date", name: "due_date", type: "date", value: task?.due_date || "" })}
      ${textareaField({
        label: "Notes",
        name: "notes",
        value: task?.notes || "",
        placeholder: "Links, references, who is handling it…",
      })}
    </div>`;

  openModal({
    title: editing ? "Edit task" : "Add task",
    subtitle: "Keep the planning moving — one small step at a time.",
    body,
    submitLabel: editing ? "Save task" : "Add task",
    onSubmit: async (form) => {
      const data = new FormData(form);
      const title = fd(data, "title");
      if (!title) {
        toast("Give the task a title.", "error");
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
        toast("Task updated.");
      } else {
        await api.createTask(trip.id, payload);
        toast("Task added.");
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
  const body = `
    <div class="form-grid">
      ${selectField({ label: "Type", name: "type", value: booking?.type || "hotel", options: BOOKING_TYPES })}
      ${inputField({
        label: "Title",
        name: "title",
        value: booking?.title || "",
        placeholder: "e.g. Hotel Alfama — 3 nights",
        required: true,
      })}
      ${inputField({ label: "Provider / company", name: "provider", value: booking?.provider || "", placeholder: "Booking.com, TAP, …" })}
      ${inputField({
        label: "Confirmation code",
        name: "confirmation",
        value: booking?.confirmation || "",
        placeholder: "Reference number",
      })}
      ${inputField({ label: "Check-in / start", name: "start_date", type: "date", value: booking?.start_date || "" })}
      ${inputField({ label: "Check-out / end", name: "end_date", type: "date", value: booking?.end_date || "" })}
      ${inputField({ label: "Amount", name: "amount", type: "number", value: booking?.amount ?? "", placeholder: "0.00", min: 0, step: "0.01" })}
      ${inputField({ label: "Currency", name: "currency", value: booking?.currency || "EUR", placeholder: "EUR" })}
      ${placeFieldHTML({
        label: "Address",
        name: "address",
        value: booking?.address || "",
        lat: booking?.lat ?? "",
        lng: booking?.lng ?? "",
        placeholder: "Hotel address, airport, station…",
      })}
      ${textareaField({
        label: "Notes",
        name: "notes",
        value: booking?.notes || "",
        placeholder: "Room type, cancellation policy, breakfast included…",
      })}
      ${fileFieldHTML({ label: editing ? "Attach another document" : "Attach a PDF or document" })}
    </div>`;

  openModal({
    title: editing ? "Edit booking" : "Add a booking",
    subtitle: "Hotels, flights, trains, visas, insurance — keep the paperwork together.",
    body,
    submitLabel: editing ? "Save booking" : "Add booking",
    size: "lg",
    onMount: ({ form }) => {
      wirePlacePickers(form);
      wireFileField(form);
    },
    onSubmit: async (form) => {
      const data = new FormData(form);
      const title = fd(data, "title");
      if (!title) {
        toast("Give the booking a title.", "error");
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
        toast("Booking updated.");
      } else {
        saved = (await api.createBooking(trip.id, payload)).booking;
        toast("Booking added.");
      }
      const fileInput = form.querySelector("[data-file-input]");
      const file = fileInput?.files?.[0];
      if (file) {
        await api.uploadDocument(trip.id, file, saved.id);
        toast(`“${file.name}” attached to the booking.`);
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
        label: "Leg",
        name: "scope",
        value: transport?.scope || "arrival",
        options: TRANSPORT_SCOPES,
      })}
      ${selectField({
        label: "Mode",
        name: "type",
        value: transport?.type || "flight",
        options: TRANSPORT_TYPES,
      })}
      ${inputField({
        label: "Title",
        name: "title",
        value: transport?.title || "",
        placeholder: "e.g. Flight to Lisbon",
        required: true,
        full: true,
      })}
      ${inputField({
        label: "Provider / company",
        name: "provider",
        value: transport?.provider || "",
        placeholder: "TAP, Renfe, Flixbus…",
      })}
      ${inputField({
        label: "Confirmation code",
        name: "confirmation",
        value: transport?.confirmation || "",
        placeholder: "Reference number",
      })}
      ${inputField({
        label: "From",
        name: "from_place",
        value: transport?.from_place || "",
        placeholder: "City, airport or station",
      })}
      ${inputField({
        label: "To",
        name: "to_place",
        value: transport?.to_place || "",
        placeholder: "City, airport or station",
      })}
      ${inputField({
        label: "Departure date",
        name: "depart_date",
        type: "date",
        value: transport?.depart_date || "",
      })}
      ${inputField({
        label: "Departure time",
        name: "depart_time",
        type: "time",
        value: transport?.depart_time || "",
      })}
      ${inputField({
        label: "Arrival date",
        name: "arrive_date",
        type: "date",
        value: transport?.arrive_date || "",
      })}
      ${inputField({
        label: "Arrival time",
        name: "arrive_time",
        type: "time",
        value: transport?.arrive_time || "",
      })}
      ${inputField({
        label: "Amount",
        name: "amount",
        type: "number",
        value: transport?.amount ?? "",
        placeholder: "0.00",
        min: 0,
        step: "0.01",
      })}
      ${inputField({
        label: "Currency",
        name: "currency",
        value: transport?.currency || "EUR",
        placeholder: "EUR",
      })}
      ${textareaField({
        label: "Notes",
        name: "notes",
        value: transport?.notes || "",
        placeholder: "Seat, platform, baggage, connection details…",
      })}
    </div>`;

  openModal({
    title: editing ? "Edit transport" : "Add transport",
    subtitle: "The journey to your destination and the legs in between.",
    body,
    submitLabel: editing ? "Save transport" : "Add transport",
    size: "lg",
    onSubmit: async (form) => {
      const data = new FormData(form);
      const title = fd(data, "title");
      if (!title) {
        toast("Give this transport a title.", "error");
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
      if (editing) {
        await api.updateTransport(transport.id, payload);
        toast("Transport updated.");
      } else {
        await api.createTransport(trip.id, payload);
        toast("Transport added.");
      }
      await onSaved?.();
    },
  });
}

/* --------------------------------------------------------------------------
   Recommendation
   -------------------------------------------------------------------------- */

export function openRecommendationModal({ trip, recommendation = null, onSaved = null } = {}) {
  const editing = Boolean(recommendation);
  const body = `
    <div class="form-grid">
      ${inputField({
        label: "Name",
        name: "title",
        value: recommendation?.title || "",
        placeholder: "e.g. Time Out Market",
        required: true,
        full: true,
      })}
      ${selectField({
        label: "Category",
        name: "category",
        value: recommendation?.category || "place",
        options: RECOMMENDATION_CATEGORIES,
      })}
      ${inputField({
        label: "Link",
        name: "url",
        type: "url",
        value: recommendation?.url || "",
        placeholder: "https://…",
      })}
      ${placeFieldHTML({
        label: "Address",
        name: "address",
        value: recommendation?.address || "",
        lat: recommendation?.lat ?? "",
        lng: recommendation?.lng ?? "",
        placeholder: "Where is it?",
      })}
      ${textareaField({
        label: "Notes / why it's worth it",
        name: "notes",
        value: recommendation?.notes || "",
        placeholder: "What to order, best time to go, who recommended it…",
      })}
    </div>`;

  openModal({
    title: editing ? "Edit idea" : "Save an idea",
    subtitle: "Places, restaurants and experiences you don't want to forget.",
    body,
    submitLabel: editing ? "Save idea" : "Save idea",
    size: "lg",
    onMount: ({ form }) => wirePlacePickers(form),
    onSubmit: async (form) => {
      const data = new FormData(form);
      const title = fd(data, "title");
      if (!title) {
        toast("Give the idea a name.", "error");
        return false;
      }
      const payload = {
        title,
        category: fd(data, "category") || "place",
        url: fd(data, "url"),
        address: fd(data, "address"),
        lat: fd(data, "lat"),
        lng: fd(data, "lng"),
        notes: fd(data, "notes"),
      };
      if (editing) {
        await api.updateRecommendation(recommendation.id, payload);
        toast("Idea updated.");
      } else {
        await api.createRecommendation(trip.id, payload);
        toast("Idea saved.");
      }
      await onSaved?.();
    },
  });
}

export { todayISO };
