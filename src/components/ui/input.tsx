import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

type InputSize = "sm" | "default" | "lg"

const inputVariants = cva(
  "w-full min-w-0 rounded-lg border border-input bg-transparent transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      size: {
        sm: "h-7 text-xs px-2 py-1",
        default: "h-8 px-2.5 py-1 text-base md:text-sm",
        lg: "h-10 px-3 py-2 text-base",
      } satisfies Record<InputSize, string>,
    },
    defaultVariants: {
      size: "default",
    },
  }
)

// Accept native HTML size (number) as well as our variant strings.
// Numeric values fall through to native HTML behavior; string values pick a variant.
type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  size?: InputSize | number
}

function Input({ className, type, size, ...props }: InputProps) {
  const variantSize: InputSize | undefined =
    typeof size === "string" ? size : undefined
  const nativeSize = typeof size === "number" ? size : undefined

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      size={nativeSize}
      className={cn(inputVariants({ size: variantSize }), className)}
      {...props}
    />
  )
}

export { Input }
