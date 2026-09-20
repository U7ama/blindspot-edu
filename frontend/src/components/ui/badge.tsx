import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-primary/40 bg-primary/20 text-[#fca5a5] hover:bg-primary/30",
        secondary:
          "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10",
        destructive:
          "border-destructive/40 bg-destructive/20 text-red-300 hover:bg-destructive/30",
        outline: "border-white/10 text-neutral-300",
        success:
          "border-emerald-500/30 bg-emerald-950/30 text-emerald-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
