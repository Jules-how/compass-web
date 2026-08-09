'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ClientDetailPanel } from '@/components/clients/ClientDetailPanel'

const easeOut = [0.22, 1, 0.36, 1] as const

interface ClientDetailModalProps {
  clientId: string
  clientName?: string
  onClose: () => void
  onArchived?: () => void
  onChanged?: () => void | Promise<void>
}

export function ClientDetailModal({
  clientId,
  clientName,
  onClose,
  onArchived,
  onChanged
}: ClientDetailModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={clientId}
        className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-neutral-950/40"
          aria-label="Close client"
          onClick={onClose}
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-detail-title"
          className="relative z-10 flex h-[min(100dvh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-stone-200/80 bg-[var(--compass-wash)] shadow-soft sm:h-[min(92vh,920px)] sm:rounded-2xl"
          initial={{ opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.985 }}
          transition={{ duration: 0.22, ease: easeOut }}
        >
          <ClientDetailPanel
            clientId={clientId}
            mode="modal"
            clientNameHint={clientName}
            onClose={onClose}
            onArchived={onArchived}
            onChanged={onChanged}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
