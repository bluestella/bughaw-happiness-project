"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full border border-line rounded-md px-2.5 py-2 text-[13px] focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20 bg-white disabled:opacity-60",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";

