import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Route fetch calls to a table of handlers: { "GET /api/x": body | (req) => [status, body] }.
export function mockApi(routes) {
  const calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opts = {}) => {
    const key = `${opts.method ?? "GET"} ${String(url).split("?")[0]}`;
    calls.push({ key, body: opts.body ? JSON.parse(opts.body) : undefined });
    if (!(key in routes)) return new Response(JSON.stringify({ detail: `unmocked ${key}` }), { status: 404 });
    let r = routes[key];
    if (typeof r === "function") r = r(opts);
    const [status, body] = Array.isArray(r) && typeof r[0] === "number" ? r : [200, r];
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}
