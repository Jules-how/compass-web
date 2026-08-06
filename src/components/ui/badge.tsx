import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center border border-transparent font-medium [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-[#e85d2a] text-white',
        secondary: 'bg-stone-100 text-neutral-700',
        success: 'bg-emerald-600 text-white',
        warning: 'bg-amber-500 text-white',
        outline: 'border-stone-200 bg-transparent text-neutral-700',
        destructive: 'bg-red-600 text-white'
      },
      appearance: {
        default: '',
        light: '',
        outline: '',
        ghost: 'border-transparent bg-transparent'
      },
      size: {
        lg: 'h-7 min-w-7 gap-1.5 rounded-md px-2 text-xs [&_svg]:size-3.5',
        md: 'h-6 min-w-6 gap-1.5 rounded-md px-[0.45rem] text-xs [&_svg]:size-3.5',
        sm: 'h-5 min-w-5 gap-1 rounded-sm px-[0.325rem] text-[0.6875rem] leading-[0.75rem] [&_svg]:size-3',
        xs: 'h-4 min-w-4 gap-1 rounded-sm px-1 text-[0.625rem] leading-[0.5rem] [&_svg]:size-3'
      },
      shape: {
        default: '',
        circle: 'rounded-full'
      }
    },
    compoundVariants: [
      {
        variant: 'primary',
        appearance: 'light',
        className: 'bg-orange-50 text-[#c2410c]'
      },
      {
        variant: 'success',
        appearance: 'light',
        className: 'bg-emerald-50 text-emerald-800'
      },
      {
        variant: 'warning',
        appearance: 'light',
        className: 'bg-amber-50 text-amber-800'
      },
      {
        variant: 'destructive',
        appearance: 'light',
        className: 'bg-red-50 text-red-700'
      },
      {
        variant: 'secondary',
        appearance: 'light',
        className: 'bg-stone-100 text-neutral-600'
      }
    ],
    defaultVariants: {
      variant: 'primary',
      appearance: 'default',
      size: 'md'
    }
  }
)

function Badge({
  className,
  variant,
  size,
  appearance,
  shape,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, appearance, shape }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
