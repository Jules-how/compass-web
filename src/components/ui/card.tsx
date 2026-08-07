'use client'

/**
 * Compass card primitive — LOCKED visual language.
 * Keep rounded-2xl, soft borders, shadow-soft, and airy padding (p-5).
 * Do not flatten elevation or tighten radii/spacing unless explicitly asked.
 * See .cursor/rules/compass-ui-lock.mdc
 */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

type CardContextType = {
  variant: 'default' | 'accent'
}

const CardContext = React.createContext<CardContextType>({
  variant: 'default'
})

const useCardContext = () => React.useContext(CardContext)

const cardVariants = cva('flex flex-col items-stretch rounded-2xl text-neutral-900', {
  variants: {
    variant: {
      default: 'border border-stone-200/70 bg-white shadow-soft',
      accent: 'bg-stone-100/70 p-1 shadow-soft'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
})

const cardHeaderVariants = cva(
  'flex min-h-[3.25rem] flex-wrap items-center justify-between gap-2.5 px-5 py-3.5',
  {
    variants: {
      variant: {
        default: 'border-b border-stone-100',
        accent: ''
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

const cardContentVariants = cva('grow p-5', {
  variants: {
    variant: {
      default: '',
      accent: 'rounded-xl bg-white [&:last-child]:rounded-b-xl'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
})

const cardFooterVariants = cva('flex min-h-14 items-center px-5', {
  variants: {
    variant: {
      default: 'border-t border-stone-100',
      accent: 'mt-[2px] rounded-b-xl bg-white'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
})

function Card({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>) {
  return (
    <CardContext.Provider value={{ variant: variant || 'default' }}>
      <div data-slot="card" className={cn(cardVariants({ variant }), className)} {...props} />
    </CardContext.Provider>
  )
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { variant } = useCardContext()
  return (
    <div data-slot="card-header" className={cn(cardHeaderVariants({ variant }), className)} {...props} />
  )
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { variant } = useCardContext()
  return (
    <div data-slot="card-content" className={cn(cardContentVariants({ variant }), className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { variant } = useCardContext()
  return (
    <div data-slot="card-footer" className={cn(cardFooterVariants({ variant }), className)} {...props} />
  )
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      data-slot="card-title"
      className={cn('text-[15px] font-semibold leading-none tracking-tight text-neutral-900', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-description"
      className={cn('mt-1 text-sm leading-snug text-neutral-500', className)}
      {...props}
    />
  )
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
