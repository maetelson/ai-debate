import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
};

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "default" &&
          "bg-zinc-900 text-white shadow hover:bg-zinc-800",
        variant === "outline" &&
          "border border-zinc-300 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50",
        variant === "ghost" && "text-zinc-700 hover:bg-zinc-100",
        size === "sm" && "h-8 rounded-md px-3 text-xs",
        size === "default" && "h-9 px-4 py-2",
        size === "lg" && "h-10 rounded-md px-8",
        className
      )}
      {...props}
    />
  );
}
