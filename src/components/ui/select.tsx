"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "w-full border border-line rounded-md px-2.5 py-2 text-[13px] focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20 bg-white disabled:opacity-60",
        className
      )}
      {...props}
    />
  )
);

Select.displayName = "Select";

