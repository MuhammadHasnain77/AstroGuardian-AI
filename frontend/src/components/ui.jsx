import { Loader2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

// ------------------------------------------------------------------ buttons ---

const BTN = {
  primary: "bg-action text-white hover:bg-action-hover",
  secondary: "bg-surface-2 text-ink-1 ring-1 ring-line hover:bg-surface-3",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink-1",
};

export function Button({ variant = "secondary", size = "md", loading, icon: Icon, children, className = "", ...rest }) {
  const sz = size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-4";
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sz} ${BTN[variant]} ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

// Square icon button with a 44×44 hit area even though the glyph is small.
export function IconButton({ icon: Icon, label, className = "", ...rest }) {
  return (
    <button {...rest} aria-label={label} title={label}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink-1 ${className}`}>
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}

// -------------------------------------------------------------------- drawer ---

/** Side sheet built on <dialog>: native focus trap, Escape to close, focus returns on close. */
export function Drawer({ open, onClose, title, subtitle, children, width = "max-w-2xl" }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`drawer m-0 ml-auto h-dvh max-h-dvh w-full ${width} bg-surface-0 p-0 text-ink-1 shadow-[-12px_0_32px_rgb(0_0_0/0.45)]`}
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3">
            <div className="min-w-0 pt-2">
              <h2 id={titleId} className="truncate text-lg font-semibold">{title}</h2>
              {subtitle && <p className="text-sm text-ink-3">{subtitle}</p>}
            </div>
            <IconButton icon={X} label="Close" onClick={onClose} />
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------------- tabs ---

export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line">
      {tabs.map(([id, text, count]) => (
        <button key={id} role="tab" aria-selected={value === id} onClick={() => onChange(id)}
                className={`-mb-px flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors ${
                  value === id ? "border-series text-ink-1" : "border-transparent text-ink-3 hover:text-ink-1"
                }`}>
          {text}
          {count ? <span className="rounded-full bg-surface-3 px-1.5 text-xs text-ink-2">{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------- sparkline ---

/**
 * Small trend line over daily values, with the personal normal band (mean ± 2σ)
 * shaded behind it. Decorative to assistive tech: the adjacent text carries
 * the value; `label` gives a one-sentence summary for screen readers.
 */
export function Sparkline({ values, band, height = 32, label, color = "#3987e5" }) {
  const pts = (values ?? []).filter((v) => v != null);
  if (pts.length < 2) return <div style={{ height }} />;
  const lo = Math.min(...pts, band?.[0] ?? Infinity);
  const hi = Math.max(...pts, band?.[1] ?? -Infinity);
  const pad = (hi - lo) * 0.12 || 1;
  const y = (v) => height - 2 - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (height - 4);
  const x = (i) => (i / (pts.length - 1)) * 100;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }}
         role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {band && (
        <rect x="0" width="100" y={y(band[1])} height={Math.max(1, y(band[0]) - y(band[1]))} fill={color} opacity="0.14" />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"
            strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts.at(-1))} r="2.5" fill={color} />
    </svg>
  );
}

export const normalBand = (b) =>
  b?.reliable ? [+(b.mean - 2 * b.std).toFixed(1), +(b.mean + 2 * b.std).toFixed(1)] : null;

// ------------------------------------------------------------------ headings ---

export function SectionHeading({ children, aside }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold text-ink-1">{children}</h2>
      {aside && <div className="text-sm text-ink-3">{aside}</div>}
    </div>
  );
}
