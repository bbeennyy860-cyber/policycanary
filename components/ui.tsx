import type { ReactNode } from "react";

const STATE_TONE: Record<string, string> = {
  PROMOTED: "good", PROMOTE: "good", CANARY: "accent", EXPANDING: "accent", EVALUATING: "accent",
  ROLLED_BACK: "bad", ROLLBACK: "bad", HOLD: "warn", ABANDONED: "dim", DRAFT: "dim", CONTINUE: "dim",
};
const TONE_CLASS: Record<string, string> = {
  good: "text-good border-good/30 bg-good/10",
  bad: "text-bad border-bad/30 bg-bad/10",
  warn: "text-warn border-warn/30 bg-warn/10",
  accent: "text-accent border-accent/30 bg-accent/10",
  dim: "text-muted border-line-strong bg-surface-2",
};

export function toneFor(value: string): string { return STATE_TONE[value] ?? "dim"; }

export function Badge({ value, tone }: { value: string; tone?: string }) {
  return <span className={`pill ${TONE_CLASS[tone ?? toneFor(value)]}`}>{value.replaceAll("_", " ")}</span>;
}

export function Card({ title, subtitle, action, children, className = "", bodyClass = "p-5" }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-[14px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function ErrorNotice({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-[13px] text-bad">
      <span>{children}</span>
      {onRetry && <button type="button" className="btn btn-sm" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-8 text-center text-[13px] text-muted">{children}</div>;
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-4" style={{ width: `${92 - i * 11}%` }} />)}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad" | "accent" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "accent" ? "text-accent" : "text-ink";
  return (
    <div className="card px-5 py-4">
      <div className="label">{label}</div>
      <div className={`num mt-2 text-[26px] font-semibold leading-none tracking-tight ${color}`}>{value}</div>
      {hint && <div className="mt-2 text-[12px] text-muted">{hint}</div>}
    </div>
  );
}
