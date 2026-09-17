import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const styles = cva("inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap", {
  variants: {
    variant: {
      primary: "bg-brand text-brand-ink hover:bg-brand/90",
      secondary: "bg-surface border border-line text-ink hover:bg-surface-2",
      ghost: "text-ink hover:bg-surface-2",
      danger: "bg-danger text-white hover:bg-danger/90",
      link: "text-brand underline-offset-4 hover:underline h-auto px-0",
    },
    size: { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-11 px-5 text-sm" },
  },
  defaultVariants: { variant: "primary", size: "md" },
});
type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles> & { loading?: boolean };
export function Button({ className, variant, size, loading, children, disabled, ...p }: Props) {
  return (
    <button className={cn(styles({ variant, size }), className)} disabled={disabled || loading} {...p}>
      {loading && <Loader2 size={15} className="animate-spin" />}{children}
    </button>
  );
}
