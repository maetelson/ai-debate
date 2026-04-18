import * as React from "react";

import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "outline" | "danger";
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        variant === "default" && "border-zinc-900 bg-zinc-900 text-white",
        variant === "secondary" && "border-zinc-200 bg-zinc-100 text-zinc-700",
        variant === "outline" && "border-zinc-300 bg-white text-zinc-700",
        variant === "danger" && "border-orange-200 bg-orange-50 text-orange-800",
        className
      )}
      {...props}
    />
  );
}
