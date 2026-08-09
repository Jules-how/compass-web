import type { ReactNode, SVGProps } from 'react'
import type { FunctionKind } from '@/lib/function-identity'
import { cn } from '@/lib/utils'

type GlyphProps = SVGProps<SVGSVGElement> & {
  kind: FunctionKind
}

function GlyphShell({
  className,
  children,
  ...props
}: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
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
      // Rising chart + tip — revenue / pipeline
      return (
        <GlyphShell className={className} {...props}>
          <path d="M4.5 16.5 9 12l3.2 3.2L19.5 7.5" />
          <path d="M14.5 7.5h5v5" />
          <path d="M4.5 19.5h15" />
        </GlyphShell>
      )
    case 'marketing':
      // Megaphone
      return (
        <GlyphShell className={className} {...props}>
          <path d="M4.5 10.5v3a1.5 1.5 0 0 0 1.5 1.5h1.2L11 18.5V5.5L7.2 9H6a1.5 1.5 0 0 0-1.5 1.5Z" />
          <path d="M11 8.2c2.4.7 4.4 2.1 5.8 4" />
          <path d="M11 15.8c2.4-.7 4.4-2.1 5.8-4" />
          <path d="M6.8 15v2.2a1.3 1.3 0 0 0 2.1 1l.9-1" />
        </GlyphShell>
      )
    case 'product':
      // Stacked modules / systems
      return (
        <GlyphShell className={className} {...props}>
          <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.4" />
          <rect x="13" y="4.5" width="6.5" height="6.5" rx="1.4" />
          <rect x="4.5" y="13" width="6.5" height="6.5" rx="1.4" />
          <path d="M13 15.2h6.5" />
          <path d="M13 18.2h4.5" />
        </GlyphShell>
      )
    case 'delivery':
      // Package / handoff
      return (
        <GlyphShell className={className} {...props}>
          <path d="M12 3.8 19.2 7.6v8.8L12 20.2 4.8 16.4V7.6L12 3.8Z" />
          <path d="M12 12v8.2" />
          <path d="M4.8 7.6 12 12l7.2-4.4" />
          <path d="M8.2 5.8 15.8 9.8" />
        </GlyphShell>
      )
    case 'strategy':
      // Compass needle / thinking
      return (
        <GlyphShell className={className} {...props}>
          <circle cx="12" cy="12" r="7.25" />
          <path d="M12 6.2 13.2 10.8 17.8 12 13.2 13.2 12 17.8 10.8 13.2 6.2 12 10.8 10.8Z" />
        </GlyphShell>
      )
    case 'operations':
      // Gear
      return (
        <GlyphShell className={className} {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4.2v2" />
          <path d="M12 17.8v2" />
          <path d="M4.2 12h2" />
          <path d="M17.8 12h2" />
          <path d="M6.4 6.4l1.4 1.4" />
          <path d="M16.2 16.2l1.4 1.4" />
          <path d="M6.4 17.6l1.4-1.4" />
          <path d="M16.2 7.8l1.4-1.4" />
        </GlyphShell>
      )
    default:
      // Network nodes — generic module
      return (
        <GlyphShell className={className} {...props}>
          <circle cx="12" cy="5.8" r="2" />
          <circle cx="6.5" cy="17.2" r="2" />
          <circle cx="17.5" cy="17.2" r="2" />
          <path d="M12 7.8v3.2L7.2 15.2" />
          <path d="M12 11l4.8 4.2" />
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
      className={cn(
        'flex shrink-0 items-center justify-center shadow-soft ring-1 ring-inset',
        dim,
        className
      )}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 16%, white)`,
        color,
        // ring uses currentColor via box-shadow fallback when ring-inset color is hard;
        // set border-like outline with mix for soft brand framing.
        boxShadow: `0 1px 2px rgba(15, 18, 23, 0.05), inset 0 0 0 1px color-mix(in srgb, ${color} 28%, transparent)`
      }}
      aria-hidden
    >
      <FunctionGlyph kind={kind} className={glyph} />
    </div>
  )
}
