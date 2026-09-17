import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { ReactNode } from "react";

export function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line px-6 py-4 flex items-center justify-between">
        <Logo />
        <ThemeToggle />
      </header>
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Link to="/signup" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-6"><ArrowLeft size={14} /> Back to signup</Link>
        <div className="rounded-md bg-warn/10 text-warn text-sm px-4 py-3 mb-6">
          Draft template — Zalgo Infotech should have this reviewed by legal counsel before relying on it as a binding document.
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-sm text-muted mt-1">Last updated: {updated}</p>
        <div className="prose-legal mt-6 space-y-5 text-sm leading-relaxed text-ink">{children}</div>
      </div>
    </div>
  );
}
