"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full border border-line rounded-md px-2.5 py-2 text-[13px] focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20 bg-white disabled:opacity-60",
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";

