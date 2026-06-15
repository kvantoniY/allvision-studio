import { cn } from "@/lib/utils"

// Серый «светящийся» прелоудер: базовая заливка + бегущий по ней блик (shimmer).
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-muted/60", className)}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
    </div>
  )
}

export { Skeleton }
