"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark">P<span /></span>PolicyCanary</Link>
      <div className="workspace"><span className="workspace-icon">R</span><div>Robotics workspace<small>Evaluation control plane</small></div></div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Main navigation">
        <Link className={pathname === "/" ? "active" : ""} href="/"><span>▦</span>Overview</Link>
        <Link className={pathname.startsWith("/rollouts") ? "active" : ""} href="/#rollouts"><span>↗</span>Rollouts</Link>
        <Link className={pathname === "/leaderboard" ? "active" : ""} href="/leaderboard"><span>≡</span>Fleet leaderboard</Link>
      </nav>
      <div className="sidebar-footer"><span className="live-dot" /> Historical evaluation replay<small>RoboArena · MIT licence</small><p>AI proposes. Statistics decides.<br />A human approves.</p></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div>Workspace <span>/</span> <strong>{pathname.startsWith("/rollouts") ? "Rollout detail" : pathname === "/leaderboard" ? "Fleet leaderboard" : "Overview"}</strong></div><span className="topbar-tag">ROBOT POLICY OPERATIONS</span></header><main>{children}</main><footer className="page-footer">Replay of real RoboArena evaluation sessions (MIT licence)<span>PolicyCanary / Release intelligence</span></footer></div>
  </div>;
}
