import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const opts: { v: Theme; icon: typeof Sun; label: string }[] = [
  { v: "light", icon: Sun, label: "Light" }, { v: "dark", icon: Moon, label: "Dark" }, { v: "system", icon: Monitor, label: "System" },
];
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div className={cn("inline-flex rounded-md border border-line bg-surface-2 p-0.5", className)} role="radiogroup" aria-label="Theme">
      {opts.map(({ v, icon: I, label }) => (
        <button key={v} role="radio" aria-checked={theme === v} title={label} onClick={() => setTheme(v)}
          className={cn("h-7 w-8 grid place-items-center rounded transition-colors", theme === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
          <I size={15} />
        </button>
      ))}
    </div>
  );
}
