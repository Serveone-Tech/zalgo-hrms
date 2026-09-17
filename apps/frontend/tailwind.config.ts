import type { Config } from "tailwindcss";
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Manrope", "system-ui", "sans-serif"] },
      colors: {
        bg: "hsl(var(--bg) / <alpha-value>)",
        surface: "hsl(var(--surface) / <alpha-value>)",
        "surface-2": "hsl(var(--surface-2) / <alpha-value>)",
        line: "hsl(var(--line) / <alpha-value>)",
        ink: "hsl(var(--ink) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        brand: "hsl(var(--brand) / <alpha-value>)",
        "brand-ink": "hsl(var(--brand-ink) / <alpha-value>)",
        "brand-soft": "hsl(var(--brand-soft) / <alpha-value>)",
        danger: "hsl(var(--danger) / <alpha-value>)",
        warn: "hsl(var(--warn) / <alpha-value>)",
        good: "hsl(var(--good) / <alpha-value>)",
        side: "hsl(var(--side) / <alpha-value>)",
        "side-ink": "hsl(var(--side-ink) / <alpha-value>)",
      },
      borderRadius: { md: "10px", lg: "14px", xl: "20px" },
    },
  },
  plugins: [],
} satisfies Config;
