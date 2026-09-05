"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-semibold transition duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30 focus-visible:border-coir border",
  {
    variants: {
      intent: {
        primary:
          "bg-coir text-white border-coir shadow-card hover:bg-coir-dark hover:border-coir-dark",
        secondary: "bg-white text-ink border-line shadow-card hover:border-ink-soft",
        danger: "bg-danger-bg text-danger border-danger-border hover:border-danger",
        ghost: "bg-transparent text-ink border-transparent hover:bg-paper",
      },
      size: {
        sm: "text-[12px] px-3 py-1.5",
        md: "text-[13px] px-4 py-2",
      },
    },
    defaultVariants: { intent: "secondary", size: "md" },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, intent, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ intent, size }), className)} {...props} />
  )
);

Button.displayName = "Button";

