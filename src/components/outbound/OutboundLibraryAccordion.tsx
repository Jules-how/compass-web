'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  FileText,
  Layers,
  LayoutTemplate,
  MessageSquareText,
  MousePointerClick,
  Package,
  Sparkles,
  Type
} from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import { LIBRARY_NAV } from '@/lib/outbound-copy'
import { cn } from '@/lib/utils'

const ICON_MAP: Record<
  string,
  { icon: LucideIcon; textColor: string; bgColor: string }
> = {
  offers: { icon: Package, textColor: 'text-[#e85d2a]', bgColor: 'bg-[#e85d2a]/10' },
  expressions: { icon: MessageSquareText, textColor: 'text-amber-700', bgColor: 'bg-amber-500/10' },
  structures: { icon: Layers, textColor: 'text-stone-600', bgColor: 'bg-stone-500/10' },
  ctas: { icon: MousePointerClick, textColor: 'text-emerald-700', bgColor: 'bg-emerald-500/10' },
  subjects: { icon: Type, textColor: 'text-sky-700', bgColor: 'bg-sky-500/10' },
  openers: { icon: Sparkles, textColor: 'text-violet-700', bgColor: 'bg-violet-500/10' },
  templates: { icon: LayoutTemplate, textColor: 'text-rose-700', bgColor: 'bg-rose-500/10' }
}

export function OutboundLibraryAccordion({
  className,
  compact = false,
  onPick,
  defaultOpen = 'offers'
}: {
  className?: string
  /** When true, omit outer card chrome (for editor sidebar). */
  compact?: boolean
  /** Optional click handler for editor insert mode — when set, links are suppressed for primary action. */
  onPick?: (key: string) => void
  defaultOpen?: string
}) {
  const body = (
    <Accordion className="w-full -space-y-px" defaultValue={[defaultOpen]} type="multiple">
      {LIBRARY_NAV.map((item) => {
        const meta = ICON_MAP[item.key] ?? {
          icon: FileText,
          textColor: 'text-neutral-600',
          bgColor: 'bg-stone-500/10'
        }
        const Icon = meta.icon
        return (
          <AccordionItem
            key={item.key}
            value={item.key}
            className="border border-stone-200/80 bg-white px-4 first:rounded-t-2xl last:rounded-b-2xl last:border-b"
          >
            <AccordionTrigger className="hover:no-underline py-3.5">
              <div className="flex items-center gap-3">
                <div className={cn('rounded-xl p-2.5', meta.bgColor, meta.textColor)}>
                  <Icon className="size-5" size={20} />
                </div>
                <div className="flex flex-col items-start text-left">
                  <span className="text-[13px] font-semibold text-neutral-900">{item.label}</span>
                  <span className="text-[12px] font-normal text-neutral-500">{item.blurb}</span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="ps-14">
              <p className="text-[12px] leading-relaxed text-neutral-500">
                Browse and fork {item.label.toLowerCase()} into campaign drafts. Library text is
                always copied — never live-bound.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {onPick ? (
                  <button
                    type="button"
                    onClick={() => onPick(item.key)}
                    className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-[12px] font-semibold text-neutral-800 shadow-soft hover:bg-white"
                  >
                    Use in editor
                  </button>
                ) : null}
                <Link
                  href={item.href}
                  className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-800 shadow-soft hover:border-stone-300"
                >
                  Open library
                </Link>
              </div>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )

  if (compact) {
    return <div className={cn('w-full', className)}>{body}</div>
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-stone-200/70 bg-white p-4 shadow-soft',
        className
      )}
    >
      <div className="mb-3 px-1">
        <h2 className="text-[15px] font-semibold text-neutral-900">Email components</h2>
        <p className="mt-0.5 text-[12px] text-neutral-500">
          Offers, expressions, structures, CTAs, subjects, openers, and templates
        </p>
      </div>
      {body}
    </div>
  )
}
