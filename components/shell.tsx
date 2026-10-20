"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const REPO = "https://github.com/bbeennyy860-cyber/policycanary";

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const nav = [
    { href: "/", label: "Overview", active: pathname === "/" || pathname.startsWith("/rollouts") },
    { href: "/leaderboard", label: "Leaderboard", active: pathname.startsWith("/leaderboard") },
  ];
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-8 px-6">
          <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-ink">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <rect x="1" y="1" width="18" height="18" rx="5" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
              <path d="M5 12.5 L8.5 9 L11 11 L15 6.5" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            PolicyCanary
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-[13px]">
            {nav.map(item => (
              <Link key={item.href} href={item.href}
                className={`rounded-md px-3 py-1.5 transition-colors ${item.active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-[13px]">
            <span className="hidden text-dim md:inline">Replay mode</span>
            <a href={REPO} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-muted hover:text-ink">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
              GitHub
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-6 py-5 text-[12px] text-dim">
          <span>Replay of real RoboArena evaluation sessions (MIT licence). Not live fleet telemetry.</span>
          <span>AI proposes, statistics disposes, a human approves.</span>
        </div>
      </footer>
    </div>
  );
}
