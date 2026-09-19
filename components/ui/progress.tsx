import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const progressTrackVariants = cva(
  "relative w-full overflow-hidden rounded-4xl bg-muted",
  {
    variants: {
      size: {
        default: "h-1.5",
        sm: "h-1",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function Progress({
  className,
  size,
  value,
  ...props
}: ProgressPrimitive.Root.Props & VariantProps<typeof progressTrackVariants>) {
  return (
    <ProgressPrimitive.Root data-slot="progress" value={value} {...props}>
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className={cn(progressTrackVariants({ size }), className)}
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="block h-full rounded-4xl bg-primary transition-[width] duration-300 ease-out"
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Progress, progressTrackVariants }
