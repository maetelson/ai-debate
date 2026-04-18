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
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "default" &&
          "bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800",
        variant === "outline" &&
          "border border-zinc-300 bg-white px-4 py-2 text-zinc-900 hover:bg-zinc-50",
        variant === "ghost" && "px-3 py-2 text-zinc-700 hover:bg-zinc-100",
        size === "sm" && "h-8 px-3 text-xs",
        size === "default" && "h-10",
        size === "lg" && "h-11 px-5",
        className
      )}
      {...props}
    />
  );
}
