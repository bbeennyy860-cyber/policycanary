import type { ReactNode } from "react";
export function Badge({ value }: { value: string }) { return <span className={`badge badge-${value.toLowerCase().replaceAll("_", "-")}`}><span />{value.replaceAll("_", " ")}</span>; }
export function ErrorNotice({ children }: { children: ReactNode }) { return <div className="error-notice" role="alert">{children}</div>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty-state">{children}</div>; }
export function Panel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}><div className="panel-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{action}</div>{children}</section>; }
