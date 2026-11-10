/* Shared helpers, icons and category metadata. */

const ICONS = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 5-4.9 2 2.1-5 4.9-2Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  pin: '<path d="M20 10c0 5.5-8 12-8 12s-8-6.5-8-12a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  ticket: '<path d="M3 9a2 2 0 0 0 0 4v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 0 1 0-4V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 11v2M13 17v2"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/>',
  sparkles: '<path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M4 3h16"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.9 1.7l5.3 3.4-2 2-2.4-.4a1 1 0 0 0-.9 1.7l3 1.7 1.7 3a1 1 0 0 0 1.7-.9l-.4-2.4 2-2 3.4 5.3a1 1 0 0 0 1.7-.9Z"/>',
  bed: '<path d="M3 18v-7"/><path d="M21 18v-7a3 3 0 0 0-3-3H9v7"/><path d="M3 18h18"/><path d="M3 14h18"/>',
  train: '<rect x="5" y="3" width="14" height="13" rx="3"/><path d="M8 8h8"/><path d="M8 12h.01M16 12h.01"/><path d="m7 16-2 4M17 16l2 4"/>',
  bus: '<rect x="4" y="4" width="16" height="13" rx="3"/><path d="M4 10h16"/><path d="M8 17v2M16 17v2"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/>',
  ferry: '<path d="M4 16h16l-2 4H6l-2-4Z"/><path d="M6 16V9h12v7"/><path d="M9 9V5h6v4"/><path d="M12 3v2"/>',
  car: '<path d="M5 17h14l1-5-2-5H6L4 12l1 5Z"/><path d="M5 17v2M19 17v2"/><circle cx="7.5" cy="14" r="1"/><circle cx="16.5" cy="14" r="1"/>',
  shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  passport: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 16h6"/>',
  wallet: '<path d="M20 7V6a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6"/><path d="M16 13h.01"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  external: '<path d="M14 3h7v7"/><path d="M21 3 11 13"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  flag: '<path d="M4 21V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
  utensils: '<path d="M6 3v7a2 2 0 0 0 4 0V3"/><path d="M8 10v11"/><path d="M17 3c-2 1-3 3-3 6 0 2 1 3 3 3v9"/>',
  camera: '<path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h4a4 4 0 0 0 0-8H8a4 4 0 0 1 0-8h4"/>',
  luggage: '<rect x="6" y="7" width="12" height="13" rx="2"/><path d="M9 7V4h6v3"/><path d="M9 20v1M15 20v1"/><path d="M10 11v5M14 11v5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.5 3 14.5 0 18-3-3.5-3-14.5 0-18Z"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.8"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
};

export function icon(name, className = "") {
  const body = ICONS[name] || ICONS.info;
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function nl2br(value) {
  return esc(value).replace(/\n/g, "<br>");
}

export function safeUrl(url) {
  const value = String(url ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return "";
}

export function fmtDate(iso, style = "medium") {
  if (!iso) return "";
  const d = parseDate(iso);
  if (!d) return "";
  const opts =
    style === "short"
      ? { day: "numeric", month: "short" }
      : style === "long"
        ? { weekday: "short", day: "numeric", month: "long", year: "numeric" }
        : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("es-ES", opts).format(d);
}

export function fmtWeekday(iso) {
  if (!iso) return "";
  const d = parseDate(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(d);
}

export function parseDate(iso) {
  if (!iso) return null;
  const value = String(iso);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDateRange(start, end) {
  if (!start && !end) return "Fechas por decidir";
  if (start && !end) return fmtDate(start);
  if (!start && end) return `Hasta ${fmtDate(end)}`;
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return `${fmtDate(start)} – ${fmtDate(end)}`;
  const sameYear = a.getFullYear() === b.getFullYear();
  const sameMonth = sameYear && a.getMonth() === b.getMonth();
  const fmt = (d, opts) => new Intl.DateTimeFormat("es-ES", opts).format(d);
  if (sameMonth) {
    return `${fmt(a, { day: "numeric" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  if (sameYear) {
    return `${fmt(a, { day: "numeric", month: "short" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return `${fmt(a, { day: "numeric", month: "short", year: "numeric" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function durationLabel(trip) {
  const count = Number(trip?.day_count || 0);
  return `${count} ${count === 1 ? "día" : "días"}`;
}

export function fmtDateTime(value) {
  const d = parseDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function fmtBytes(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function dueLabel(iso) {
  if (!iso) return "";
  const d = parseDate(iso);
  if (!d) return "";
  const today = parseDate(todayISO());
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0) return { text: `Vencida hace ${Math.abs(diff)} d`, overdue: true };
  if (diff === 0) return { text: "Vence hoy", overdue: false, soon: true };
  if (diff === 1) return { text: "Vence mañana", overdue: false, soon: true };
  if (diff <= 7) return { text: `Vence en ${diff} d`, overdue: false, soon: true };
  return { text: fmtDate(iso, "short"), overdue: false };
}

export function tripCover(id) {
  return `cover-${Math.abs(Number(id) || 0) % 6}`;
}

export function tripIconUrl(trip) {
  if (!trip?.icon_image) return "";
  return `/api/trips/${trip.id}/images/icon?v=${encodeURIComponent(trip.icon_image)}`;
}

export function tripCoverUrl(trip) {
  if (!trip?.cover_image) return "";
  return `/api/trips/${trip.id}/images/cover?v=${encodeURIComponent(trip.cover_image)}`;
}

export function fileKind(mimetype = "", name = "") {
  const type = String(mimetype).toLowerCase();
  const ext = String(name).split(".").pop().toLowerCase();
  if (type.includes("pdf") || ext === "pdf") return "pdf";
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image";
  if (["csv", "xls", "xlsx", "numbers", "ods"].includes(ext) || type.includes("sheet") || type.includes("excel"))
    return "sheet";
  return "file";
}

export function fileIconName(mimetype, name) {
  const kind = fileKind(mimetype, name);
  if (kind === "image") return "camera";
  if (kind === "sheet") return "list";
  return "file";
}

export const ACTIVITY_CATEGORIES = {
  sightseeing: { label: "Visitas", icon: "camera", tone: "sightseeing" },
  food: { label: "Comida y bebida", icon: "utensils", tone: "food" },
  transport: { label: "Transporte", icon: "plane", tone: "transport" },
  lodging: { label: "Alojamiento", icon: "bed", tone: "lodging" },
  shopping: { label: "Compras", icon: "wallet", tone: "shopping" },
  activity: { label: "Actividad", icon: "sparkles", tone: "activity" },
  other: { label: "Otra", icon: "flag", tone: "other" },
};

export const TASK_CATEGORIES = {
  booking: { label: "Reserva", icon: "ticket", tone: "pill-accent" },
  hotel: { label: "Hotel", icon: "bed", tone: "pill-plum" },
  visa: { label: "Visado", icon: "passport", tone: "pill-green" },
  transport: { label: "Transporte", icon: "plane", tone: "pill-teal" },
  documents: { label: "Documentos", icon: "file", tone: "pill-gold" },
  other: { label: "Otra", icon: "flag", tone: "" },
};

/* Bookings only cover accommodations and trips/excursions. Older rows with
   other types still render, grouped under a generic fallback. */
export const BOOKING_TYPES = {
  hotel: { label: "Hotel", icon: "bed", plural: "Hoteles" },
  apartment: { label: "Apartamento", icon: "home", plural: "Apartamentos" },
  hostel: { label: "Hostal", icon: "bed", plural: "Hostales" },
  house: { label: "Casa / alquiler", icon: "home", plural: "Casas y alquileres" },
  trip: { label: "Viaje / excursión", icon: "route", plural: "Viajes y excursiones" },
};

export const BOOKING_FALLBACK = { label: "Otra reserva", icon: "ticket", plural: "Otras reservas" };

export const RECOMMENDATION_CATEGORIES = {
  place: { label: "Lugar", icon: "pin", tone: "" },
  food: { label: "Comida", icon: "utensils", tone: "food" },
  experience: { label: "Experiencia", icon: "sparkles", tone: "experience" },
  tip: { label: "Consejo", icon: "info", tone: "tip" },
};

export const TRANSPORT_SCOPES = {
  arrival: { label: "Llegada", icon: "plane" },
  internal: { label: "Desplazamientos", icon: "route" },
  return: { label: "Vuelta", icon: "home" },
};

export const TRANSPORT_TYPES = {
  flight: { label: "Vuelo", icon: "plane" },
  train: { label: "Tren", icon: "train" },
  bus: { label: "Bus", icon: "bus" },
  ferry: { label: "Ferry / barco", icon: "ferry" },
  car: { label: "Coche", icon: "car" },
  other: { label: "Otro", icon: "route" },
};

export function taskCategory(key) {
  return TASK_CATEGORIES[key] || TASK_CATEGORIES.other;
}

export function bookingType(key) {
  return BOOKING_TYPES[key] || BOOKING_FALLBACK;
}

export function activityCategory(key) {
  return ACTIVITY_CATEGORIES[key] || ACTIVITY_CATEGORIES.activity;
}

export function recommendationCategory(key) {
  return RECOMMENDATION_CATEGORIES[key] || RECOMMENDATION_CATEGORIES.place;
}

export function transportType(key) {
  return TRANSPORT_TYPES[key] || TRANSPORT_TYPES.other;
}

export function transportScope(key) {
  return TRANSPORT_SCOPES[key] || TRANSPORT_SCOPES.arrival;
}

export function taskProgress(trip) {
  const total = Number(trip?.task_total || 0);
  const done = Number(trip?.task_done || 0);
  return total ? Math.round((done / total) * 100) : 0;
}

export function debounce(fn, wait = 220) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
