/* Thin fetch wrapper around the Flask API. */

async function request(url, options = {}) {
  const opts = { ...options };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    opts.body = JSON.stringify(opts.body);
  }
  let response;
  try {
    response = await fetch(url, opts);
  } catch {
    throw new Error("Could not reach the server. Is Wanderlusst Travel still running?");
  }
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    throw new Error(data.error || `Something went wrong (${response.status}).`);
  }
  return data;
}

export const api = {
  listTrips: () => request("/api/trips"),
  getTrip: (id) => request(`/api/trips/${id}`),
  createTrip: (payload) => request("/api/trips", { method: "POST", body: payload }),
  updateTrip: (id, payload) => request(`/api/trips/${id}`, { method: "PATCH", body: payload }),
  deleteTrip: (id) => request(`/api/trips/${id}`, { method: "DELETE" }),
  uploadTripImage: (tripId, kind, file) => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    return request(`/api/trips/${tripId}/images`, { method: "POST", body: form });
  },
  deleteTripImage: (tripId, kind) =>
    request(`/api/trips/${tripId}/images/${kind}`, { method: "DELETE" }),

  createDay: (tripId, payload) => request(`/api/trips/${tripId}/days`, { method: "POST", body: payload }),
  updateDay: (id, payload) => request(`/api/days/${id}`, { method: "PATCH", body: payload }),
  deleteDay: (id) => request(`/api/days/${id}`, { method: "DELETE" }),

  createActivity: (dayId, payload) =>
    request(`/api/days/${dayId}/activities`, { method: "POST", body: payload }),
  updateActivity: (id, payload) => request(`/api/activities/${id}`, { method: "PATCH", body: payload }),
  deleteActivity: (id) => request(`/api/activities/${id}`, { method: "DELETE" }),

  createTask: (tripId, payload) => request(`/api/trips/${tripId}/tasks`, { method: "POST", body: payload }),
  updateTask: (id, payload) => request(`/api/tasks/${id}`, { method: "PATCH", body: payload }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: "DELETE" }),

  createBooking: (tripId, payload) =>
    request(`/api/trips/${tripId}/bookings`, { method: "POST", body: payload }),
  updateBooking: (id, payload) => request(`/api/bookings/${id}`, { method: "PATCH", body: payload }),
  deleteBooking: (id) => request(`/api/bookings/${id}`, { method: "DELETE" }),

  createTransport: (tripId, payload) =>
    request(`/api/trips/${tripId}/transport`, { method: "POST", body: payload }),
  updateTransport: (id, payload) =>
    request(`/api/transport/${id}`, { method: "PATCH", body: payload }),
  deleteTransport: (id) => request(`/api/transport/${id}`, { method: "DELETE" }),

  uploadDocument: (tripId, file, bookingId = null) => {
    const form = new FormData();
    form.append("file", file);
    if (bookingId) form.append("booking_id", String(bookingId));
    return request(`/api/trips/${tripId}/documents`, { method: "POST", body: form });
  },
  deleteDocument: (id) => request(`/api/documents/${id}`, { method: "DELETE" }),

  createRecommendation: (tripId, payload) =>
    request(`/api/trips/${tripId}/recommendations`, { method: "POST", body: payload }),
  updateRecommendation: (id, payload) =>
    request(`/api/recommendations/${id}`, { method: "PATCH", body: payload }),
  deleteRecommendation: (id) => request(`/api/recommendations/${id}`, { method: "DELETE" }),

  geocode: (query) => request(`/api/geocode?q=${encodeURIComponent(query)}`),
};
