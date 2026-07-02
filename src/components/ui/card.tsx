import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card/85 text-card-foreground shadow-sm transition-all duration-200 ease-out hover:shadow-md",
        className,
      )}
      {...props}
    />
  );
}
