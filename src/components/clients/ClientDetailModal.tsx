'use client'

import { ModalFrame } from '@/components/ui/ModalFrame'
import { ClientDetailPanel } from '@/components/clients/ClientDetailPanel'

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
  return (
    <ModalFrame
      open
      onClose={onClose}
      label={clientName ? `${clientName} client details` : 'Client details'}
      overlayClassName="fixed inset-0 z-[80] flex items-end justify-center bg-neutral-950/40 sm:items-center sm:p-6"
      contentClassName="relative z-10 flex h-[min(100dvh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-stone-200/80 bg-[var(--compass-wash)] shadow-soft sm:h-[min(92vh,920px)] sm:rounded-2xl"
    >
          <ClientDetailPanel
            clientId={clientId}
            mode="modal"
            clientNameHint={clientName}
            onClose={onClose}
            onArchived={onArchived}
            onChanged={onChanged}
          />
    </ModalFrame>
  )
}
