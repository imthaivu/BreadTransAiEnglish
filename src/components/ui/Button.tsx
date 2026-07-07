"use client";

import { cn } from "@/utils";
import { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?:
    | "primary"
    | "secondary"
    | "ghost"
    | "outline"
    | "destructive"
    | "warning"
    | "info"
    | "success";
  size?: "sm" | "md" | "lg" | "icon";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer min-w-fit";
  const variants = {
    primary: " bg-primary text-primary-foreground hover: bg-primary/90",
    secondary:
      "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/90",
    ghost: "bg-transparent text-foreground hover:bg-border/50",
    outline: "bg-transparent border border-border hover:bg-border/50",
    destructive:
      "bg-red-600 text-white hover:bg-red-700",
    warning: "bg-red-400 text-white hover:bg-red-500",
    info: " bg-primary text-white hover: bg-primary/90",
    success: "bg-green-500 text-white hover:bg-green-600",
  } as const;
  const sizes = {
    sm: "h-9 px-3 text-sm md:text-base",
    md: "h-10 px-4 text-sm md:text-base",
    lg: "h-12 px-6 text-base",
    icon: "h-9 w-9",
  } as const;
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
