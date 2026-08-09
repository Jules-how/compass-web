import type { ReactNode, SVGProps } from 'react'
import type { FunctionKind } from '@/lib/function-identity'
import { cn } from '@/lib/utils'

type GlyphProps = SVGProps<SVGSVGElement> & {
  kind: FunctionKind
}

function GlyphShell({
  className,
  children,
  filled = false,
  ...props
}: SVGProps<SVGSVGElement> & { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? undefined : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('h-6 w-6 shrink-0', className)}
      {...props}
    >
      {children}
    </svg>
  )
}

/** Unique logo mark per business-function kind. */
export function FunctionGlyph({ kind, className, ...props }: GlyphProps) {
  switch (kind) {
    case 'sales':
      // Solid rising bars + tip
      return (
        <GlyphShell className={className} filled {...props}>
          <rect x="3.5" y="14" width="3.2" height="6" rx="1" opacity="0.45" />
          <rect x="8.2" y="10.5" width="3.2" height="9.5" rx="1" opacity="0.7" />
          <rect x="12.9" y="7" width="3.2" height="13" rx="1" />
          <path d="M17.2 8.2 20.5 4.8" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M16.8 4.8h3.7v3.7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </GlyphShell>
      )
    case 'marketing':
      // Megaphone (filled)
      return (
        <GlyphShell className={className} filled {...props}>
          <path d="M3.8 9.6v4.8c0 .9.7 1.6 1.6 1.6h1.1l3.8 3.2c.55.45 1.35.06 1.35-.65V6.05c0-.71-.8-1.1-1.35-.65L6.5 8H5.4c-.9 0-1.6.7-1.6 1.6Z" />
          <path d="M13.2 8.4c2.1.55 3.85 1.75 5.05 3.35" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
          <path d="M13.2 15.6c2.1-.55 3.85-1.75 5.05-3.35" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
          <path d="M6.4 16v2.4a1.35 1.35 0 0 0 2.2 1.05l.7-.7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </GlyphShell>
      )
    case 'product':
      // Module stack / systems board
      return (
        <GlyphShell className={className} filled {...props}>
          <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.75" />
          <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.75" opacity="0.55" />
          <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.75" opacity="0.55" />
          <rect x="13" y="13" width="7.5" height="3.1" rx="1.2" />
          <rect x="13" y="17.4" width="5" height="3.1" rx="1.2" opacity="0.7" />
        </GlyphShell>
      )
    case 'delivery':
      // Package with check
      return (
        <GlyphShell className={className} filled {...props}>
          <path d="M12 3.2 20 7.4v9.2L12 20.8 4 16.6V7.4L12 3.2Z" opacity="0.22" />
          <path
            d="M12 3.2 20 7.4v9.2L12 20.8 4 16.6V7.4L12 3.2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.65"
          />
          <path d="M4 7.4 12 11.6 20 7.4" fill="none" stroke="currentColor" strokeWidth="1.65" />
          <path d="M12 11.6V20.8" fill="none" stroke="currentColor" strokeWidth="1.65" />
          <path
            d="M8.6 12.8 11.1 15.2 15.6 10.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </GlyphShell>
      )
    case 'strategy':
      return (
        <GlyphShell className={className} filled {...props}>
          <circle cx="12" cy="12" r="8" opacity="0.18" />
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.65" />
          <path d="M12 5.4 13.35 10.65 18.6 12 13.35 13.35 12 18.6 10.65 13.35 5.4 12 10.65 10.65Z" />
        </GlyphShell>
      )
    case 'operations':
      return (
        <GlyphShell className={className} filled {...props}>
          <path d="M19.4 13.1a7.6 7.6 0 0 0 .05-1.1 7.6 7.6 0 0 0-.05-1.1l2-1.55-1.9-3.3-2.35.75a7.7 7.7 0 0 0-1.9-1.1L14.9 2h-3.8l-.35 2.45a7.7 7.7 0 0 0-1.9 1.1L6.5 4.8l-1.9 3.3 2 1.55a7.6 7.6 0 0 0-.05 1.1 7.6 7.6 0 0 0 .05 1.1l-2 1.55 1.9 3.3 2.35-.75a7.7 7.7 0 0 0 1.9 1.1L11.1 22h3.8l.35-2.45a7.7 7.7 0 0 0 1.9-1.1l2.35.75 1.9-3.3-2-1.55ZM13 15.2A3.2 3.2 0 1 1 13 8.8a3.2 3.2 0 0 1 0 6.4Z" />
        </GlyphShell>
      )
    default:
      return (
        <GlyphShell className={className} filled {...props}>
          <circle cx="12" cy="5.6" r="2.2" />
          <circle cx="6.2" cy="17.4" r="2.2" />
          <circle cx="17.8" cy="17.4" r="2.2" />
          <path
            d="M12 7.8v3L7.4 15.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M12 10.8l4.6 4.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </GlyphShell>
      )
  }
}

export function FunctionMark({
  kind,
  color,
  size = 'md',
  className
}: {
  kind: FunctionKind
  color: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const dim =
    size === 'lg' ? 'h-14 w-14 rounded-2xl' : size === 'sm' ? 'h-10 w-10 rounded-xl' : 'h-12 w-12 rounded-2xl'
  const glyph = size === 'lg' ? 'h-7 w-7' : size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'

  return (
    <div
      className={cn('flex shrink-0 items-center justify-center', dim, className)}
      style={{
        background: `linear-gradient(145deg, color-mix(in srgb, ${color} 22%, white), color-mix(in srgb, ${color} 10%, white))`,
        color,
        boxShadow: `0 1px 2px rgba(15, 18, 23, 0.05), inset 0 0 0 1px color-mix(in srgb, ${color} 32%, transparent)`
      }}
      aria-hidden
    >
      <FunctionGlyph kind={kind} className={glyph} />
    </div>
  )
}
