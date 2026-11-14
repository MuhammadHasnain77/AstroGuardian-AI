// Thin API client. Cookies (the signed session) are sent automatically on same-origin requests.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Listeners told when (a) the session is gone, (b) data was served from the offline cache.
const listeners = { unauthorized: new Set(), cache: new Set() };
export function on(event, fn) {
  listeners[event].add(fn);
  return () => listeners[event].delete(fn);
}
const emit = (event, payload) => listeners[event].forEach((fn) => fn(payload));

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      ...options,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the AstroGuardian server.");
  }
  if (!options.method || options.method === "GET") {
    const cachedAt = res.headers.get("x-ag-cached-at");
    emit("cache", cachedAt);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch { /* keep statusText */ }
    if (res.status === 401 && !path.startsWith("/auth/")) emit("unauthorized");
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

const post = (path, body) => request(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

export const api = {
  authState: () => request("/auth/state"),
  unlock: (password) => post("/auth/unlock", { password }),
  chooseRole: (role, astronaut_id) => post("/auth/role", { role, astronaut_id }),
  switchRole: () => post("/auth/switch-role"),
  logout: () => post("/auth/logout"),

  config: () => request("/config"),
  crew: () => request("/crew"),
  astronaut: (id) => request(`/astronauts/${id}`),
  readings: (id, limit = 21) => request(`/astronauts/${id}/readings?limit=${limit}`),
  addReading: (id, body) => post(`/astronauts/${id}/readings`, body),
  explain: (id) => post(`/astronauts/${id}/explain`),
  chat: (id, question, history) => post(`/astronauts/${id}/chat`, { question, history }),
  alerts: () => request("/alerts"),
  spaceWeather: () => request("/space-weather"),
  labs: () => request("/labs"),
  ackAlert: (id) => post(`/alerts/${id}/acknowledge`),
  noteAlert: (id, note) => post(`/alerts/${id}/note`, { note }),
  syncComplete: () => post("/sync/complete"),
};

// Remove cached API responses (called on logout / role switch so the next
// person on a shared device can't see the previous role's data offline).
export async function clearApiCache() {
  try {
    if ("caches" in window) await caches.delete("ag-api-v1");
  } catch { /* ignore */ }
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("ag-chat-")).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
