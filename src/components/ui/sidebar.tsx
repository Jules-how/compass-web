'use client'

import { cn } from '@/lib/utils'
import Link from 'next/link'
import React, { createContext, useContext, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'

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
        'compass-sidebar sticky top-0 hidden h-[100dvh] max-h-[100dvh] shrink-0 flex-col overflow-hidden border-r border-neutral-200/80 px-2 pb-0 pt-3 md:flex',
        className
      )}
      initial={false}
      animate={{
        width: animate ? (open ? 232 : 68) : 232
      }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
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
  return (
    <>
      <div
        className={cn(
          'compass-sidebar flex w-full items-center justify-between border-b border-neutral-200/80 px-3 py-3 md:hidden'
        )}
        {...props}
      >
        <div className="flex w-full items-center justify-between gap-3">
          <Link href="/home" className="flex items-center gap-2.5 rounded-lg px-1 py-0.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f3e4d8] text-[#e85d2a]"
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
            aria-label="Open navigation"
            className="rounded-lg p-1.5 text-neutral-700 hover:bg-white/70"
            onClick={() => setOpen(!open)}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className={cn(
                'compass-sidebar fixed inset-0 z-[100] flex h-full w-full flex-col p-6',
                className
              )}
            >
              <button
                type="button"
                aria-label="Close navigation"
                className="absolute right-6 top-6 z-50 rounded-lg p-1.5 text-neutral-700 hover:bg-white/70"
                onClick={() => setOpen(!open)}
              >
                <X className="h-5 w-5" />
              </button>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}

export const SidebarLink = ({
  link,
  className,
  active,
  badge,
  ...props
}: {
  link: Links
  className?: string
  active?: boolean
  badge?: React.ReactNode
} & Omit<React.ComponentProps<typeof Link>, 'href'>) => {
  const { open, animate } = useSidebarOptional()
  return (
    <Link
      href={link.href}
      prefetch
      className={cn(
        'group/sidebar flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[15px] font-medium transition',
        active
          ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-black/[0.04]'
          : 'text-neutral-600 hover:bg-white/70 hover:text-neutral-900',
        className
      )}
      {...props}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{link.icon}</span>
      <motion.span
        initial={false}
        animate={{
          opacity: animate ? (open ? 1 : 0) : 1,
          width: animate ? (open ? 'auto' : 0) : 'auto'
        }}
        transition={{ duration: 0.15 }}
        className="min-w-0 flex-1 truncate whitespace-nowrap !p-0 !m-0 overflow-hidden"
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
        'overflow-hidden px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500',
        className
      )}
    >
      {children}
    </motion.div>
  )
}
