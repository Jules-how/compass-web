'use client'

/**
 * Compass sidebar (sidecar) — LOCKED UI + animations.
 * Desktop: hover expand 72 ↔ 248px (0.22s, ease [0.22, 1, 0.36, 1]).
 * Links: label/badge fade (~0.15s); active = white pill + shadow-soft + orange rail.
 * Mobile: full-screen slide-in (~0.28s easeInOut).
 * Do not rewrite motion, widths, or active chrome unless explicitly asked.
 * See .cursor/rules/compass-ui-lock.mdc
 */
import { cn } from '@/lib/utils'
import Link from 'next/link'
import React, { createContext, useContext, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { ModalFrame } from '@/components/ui/ModalFrame'

interface Links {
  label: string
  href: string
  icon: React.JSX.Element | React.ReactNode
}

interface SidebarContextProps {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  animate: boolean
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined)

export const useSidebar = () => {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}

function useSidebarOptional(): SidebarContextProps {
  return useContext(SidebarContext) ?? { open: true, setOpen: () => {}, animate: false }
}

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true
}: {
  children: React.ReactNode
  open?: boolean
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>
  animate?: boolean
}) => {
  const [openState, setOpenState] = useState(false)
  const open = openProp !== undefined ? openProp : openState
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>{children}</SidebarContext.Provider>
  )
}

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate
}: {
  children: React.ReactNode
  open?: boolean
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>
  animate?: boolean
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  )
}

export const SidebarBody = (props: React.ComponentProps<typeof motion.aside>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<'div'>)} />
    </>
  )
}

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.aside>) => {
  const { open, setOpen, animate } = useSidebar()
  return (
    <motion.aside
      className={cn(
        'compass-sidebar sticky top-0 hidden h-[100dvh] max-h-[100dvh] shrink-0 flex-col overflow-hidden border-r border-stone-200/60 px-2.5 pb-0 pt-4 md:flex',
        className
      )}
      initial={false}
      animate={{
        width: animate ? (open ? 248 : 72) : 248
      }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={animate ? () => setOpen(true) : undefined}
      onMouseLeave={animate ? () => setOpen(false) : undefined}
      {...props}
    >
      {children}
    </motion.aside>
  )
}

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) => {
  const { open, setOpen } = useSidebar()
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false) }
    closeOnDesktop()
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [setOpen])
  return (
    <>
      <div
        className={cn(
          'compass-sidebar flex w-full shrink-0 items-center justify-between border-b border-stone-200/70 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden'
        )}
        {...props}
      >
        <div className="flex w-full items-center justify-between gap-3">
          <Link href="/home" className="flex items-center gap-2.5 rounded-xl px-1 py-0.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-[#f3e4d8] text-[#e85d2a]"
              aria-hidden
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M12 5.4 13.35 10.65 18.6 12 13.35 13.35 12 18.6 10.65 13.35 5.4 12 10.65 10.65Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <div className="leading-tight">
              <span className="text-[15px] font-semibold tracking-tight text-neutral-900">
                switchflow
              </span>{' '}
              <span className="text-[15px] font-medium tracking-tight text-neutral-500">compass</span>
            </div>
          </Link>
          <button
            type="button"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
            aria-controls="compass-mobile-nav"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-neutral-700 transition hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d2a]/40"
            onClick={() => setOpen(!open)}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <ModalFrame
          open={open}
          onClose={() => setOpen(false)}
          label="Navigation"
          overlayClassName="md:hidden"
          contentClassName={cn(
            'compass-sidebar compass-mobile-drawer fixed inset-0 z-[100] flex h-[100dvh] w-full flex-col p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]',
            className
          )}
        >
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute right-4 top-4 z-50 flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-neutral-700 transition hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d2a]/40"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <div id="compass-mobile-nav" className="flex min-h-0 flex-1 flex-col justify-between gap-6">
            {children}
          </div>
        </ModalFrame>
      </div>
    </>
  )
}

export const SidebarLink = ({
  link,
  className,
  active,
  badge,
  onClick,
  ...props
}: {
  link: Links
  className?: string
  active?: boolean
  badge?: React.ReactNode
} & Omit<React.ComponentProps<typeof Link>, 'href'>) => {
  const { open, animate, setOpen } = useSidebarOptional()
  return (
    <Link
      href={link.href}
      prefetch
      onClick={(event) => {
        if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) setOpen(false)
        onClick?.(event)
      }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group/sidebar relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[14px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d2a]/40',
        active
          ? 'bg-white text-neutral-900 shadow-soft ring-1 ring-black/[0.03]'
          : 'text-neutral-600 hover:bg-white/75 hover:text-neutral-900',
        className
      )}
      {...props}
    >
      {active ? (
        <span
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[#e85d2a]"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center transition',
          active ? 'text-[#e85d2a]' : 'text-neutral-500 group-hover/sidebar:text-neutral-700'
        )}
      >
        {link.icon}
      </span>
      <motion.span
        initial={false}
        animate={{
          opacity: animate ? (open ? 1 : 0) : 1,
          width: animate ? (open ? 'auto' : 0) : 'auto'
        }}
        transition={{ duration: 0.15 }}
        className="!m-0 min-w-0 flex-1 overflow-hidden truncate whitespace-nowrap !p-0"
      >
        {link.label}
      </motion.span>
      {badge ? (
        <motion.span
          initial={false}
          animate={{ opacity: animate ? (open ? 1 : 0) : 1 }}
          className="shrink-0"
        >
          {badge}
        </motion.span>
      ) : null}
    </Link>
  )
}

export const SidebarLabel = ({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) => {
  const { open, animate } = useSidebarOptional()
  return (
    <motion.div
      initial={false}
      animate={{
        opacity: animate ? (open ? 1 : 0) : 1,
        height: animate ? (open ? 'auto' : 0) : 'auto'
      }}
      className={cn(
        'overflow-hidden px-2.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500',
        className
      )}
    >
      {children}
    </motion.div>
  )
}
