import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

// A native <select> styled to match Input. `className` sizes the wrapper
// (width, max-width); the select itself always fills it.
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div data-slot="native-select-wrapper" className={cn("relative w-full", className)}>
      <select
        data-slot="native-select"
        className="h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-card pr-9 pl-3 text-base transition-[color,border-color,box-shadow] outline-none hover:border-foreground/20 focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/8 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/10 md:text-sm dark:bg-input/30"
        {...props}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { NativeSelect }
