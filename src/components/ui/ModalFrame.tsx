'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { useConsoleViewPath } from '@/components/ConsoleNav'

type ModalFrameProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  overlayClassName?: string
  contentClassName?: string
  motion?: 'dialog' | 'sheet'
} & ({ label: string; labelledBy?: string } | { label?: string; labelledBy: string })

/** Shared modal boundary; callers retain the layout and appearance of their panel. */
export function ModalFrame({
  open,
  onClose,
  label,
  labelledBy,
  children,
  overlayClassName,
  contentClassName,
  motion
}: ModalFrameProps) {
  const opener = useRef<HTMLElement | null>(null)
  const content = useRef<HTMLDivElement | null>(null)
  const viewPath = useConsoleViewPath()
  const previousPath = useRef(viewPath)
  useEffect(() => {
    // Keep-alive pages remain mounted; their portals must not cover a new route.
    if (previousPath.current !== viewPath && open) onClose()
    previousPath.current = viewPath
  }, [viewPath, open, onClose])

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className={`${overlayClassName ?? ''} ${motion ? 'planning-motion-overlay' : ''}`}>
          <Dialog.Content
            ref={content}
            className={`${contentClassName ?? ''} ${motion ? `planning-motion-${motion}` : ''}`}
            {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
              const input = content.current?.querySelector<HTMLElement>('[data-autofocus]')
              if (input) { event.preventDefault(); input.focus({ preventScroll: true }) }
            }}
            onCloseAutoFocus={(event) => {
              // These controlled panels do not use Dialog.Trigger.
              event.preventDefault()
              if (opener.current?.isConnected && !opener.current.closest('[inert], [aria-hidden="true"]')) {
                opener.current.focus({ preventScroll: true })
              } else {
                document.getElementById('compass-main')?.focus({ preventScroll: true })
              }
            }}
          >
            <Dialog.Title className="sr-only">{label ?? 'Details'}</Dialog.Title>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
