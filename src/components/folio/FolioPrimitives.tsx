'use client'
import { AlertCircle, ArrowRight, FolderOpen, RefreshCw, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { ModalFrame } from '@/components/ui/ModalFrame'

export function FolioDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      label={title}
      overlayClassName="folio-overlay"
      contentClassName="folio-dialog"
    >
      <button
        className="folio-icon-button folio-dialog-close"
        onClick={onClose}
        aria-label="Close dialog"
      >
        <X size={20} />
      </button>
      <p className="folio-caption">Compass / Your day</p>
      <h2>{title}</h2>
      {children}
    </ModalFrame>
  )
}
export function FolioState({
  loading,
  title,
  children,
  retry,
}: {
  loading?: boolean
  title: string
  children?: ReactNode
  retry?: () => void
}) {
  return (
    <section
      className="folio-paper folio-data-state"
      aria-busy={loading || undefined}
    >
      <div className="folio-state-icon">
        {loading ? (
          <RefreshCw size={22} />
        ) : retry ? (
          <AlertCircle size={22} />
        ) : (
          <FolderOpen size={22} />
        )}
      </div>
      <h2>{title}</h2>
      <div role={retry ? 'alert' : loading ? 'status' : undefined}>
        {children}
      </div>
      {loading ? (
        <div aria-hidden="true" className="folio-skeleton-lines">
          <span />
          <span />
          <span />
        </div>
      ) : retry ? (
        <button className="compass-btn-primary" onClick={retry}>
          Try again <ArrowRight size={15} />
        </button>
      ) : null}
    </section>
  )
}
export function FolioNotice({
  children,
  error = false,
}: {
  children: ReactNode
  error?: boolean
}) {
  return (
    <div
      className={`folio-notice ${error ? 'folio-notice-error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </div>
  )
}
export function FolioFolders<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { id: T; label: string; count?: number }[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <nav className="folio-folders" aria-label={label}>
      {items.map(({ id, label: caption, count }) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {caption}
          {count != null ? <span>{count}</span> : null}
        </button>
      ))}
    </nav>
  )
}
