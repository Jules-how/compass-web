'use client'

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

const cardVariants = cva('flex flex-col items-stretch rounded-xl text-neutral-900', {
  variants: {
    variant: {
      default: 'border border-stone-200/80 bg-white shadow-sm',
      accent: 'bg-stone-100/80 p-1 shadow-sm'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
})

const cardHeaderVariants = cva('flex min-h-14 flex-wrap items-center justify-between gap-2.5 px-5', {
  variants: {
    variant: {
      default: 'border-b border-stone-200/80',
      accent: ''
    }
  },
  defaultVariants: {
    variant: 'default'
  }
})

const cardContentVariants = cva('grow p-5', {
  variants: {
    variant: {
      default: '',
      accent: 'rounded-t-xl bg-white [&:last-child]:rounded-b-xl'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
})

const cardFooterVariants = cva('flex min-h-14 items-center px-5', {
  variants: {
    variant: {
      default: 'border-t border-stone-200/80',
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
  return <div data-slot="card-header" className={cn(cardHeaderVariants({ variant }), className)} {...props} />
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
      className={cn('text-base font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="card-description" className={cn('text-sm text-neutral-500', className)} {...props} />
  )
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
