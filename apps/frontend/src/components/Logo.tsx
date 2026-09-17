import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Logo — light aur dark mode ke liye alag files.
 *   public/logo_light.png  → light mode
 *   public/logo_dark.png   → dark mode / collapsed sidebar / small spaces
 * Bas in files ko replace karo, code change nahi chahiye.
 * `force` sidebar jaise hamesha-dark surfaces ke liye hai.
 */
export function Logo({ className, mark = false, force }: { className?: string; mark?: boolean; force?: "light" | "dark" }) {
  const { resolved } = useTheme();
  const mode = force ?? resolved;
  const src = mark ? "/logo_dark.png" : mode === "dark" ? "/logo_dark.png" : "/logo_light.png";
  // shrink-0: prevents flex row/column containers from squashing the image below its size.
  // Callers inside a flex-col container (e.g. Login's side panel) should also add "self-start" —
  // it can't be baked in here since it would misalign the logo in flex-row headers (items-center).
  return <img src={src} alt="Zalgo HRMS" className={cn("shrink-0 object-contain", mark ? "h-8 w-8" : "h-9 w-auto", className)} draggable={false} />;
}
