'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Calendar, GripVertical, MessageCircle, Paperclip, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type KanbanTask = {
  id: string
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high'
  badge?: string
  assignee?: {
    name: string
    avatar?: string
  }
  tags?: string[]
  dueDate?: string
  attachments?: number
  comments?: number
  metrics?: Array<{ label: string; value: number | string }>
  href?: string
  externalHref?: string
  externalLabel?: string
  draggable?: boolean
}

export type KanbanColumn = {
  id: string
  title: string
  color?: string
  tasks: KanbanTask[]
  hint?: string
  emptyText?: string
  onAdd?: () => void
}

type DragPayload = {
  task: KanbanTask
  sourceColumnId: string
}

export function KanbanBoard({
  columns,
  onMove,
  onTaskClick,
  className
}: {
  columns: KanbanColumn[]
  onMove?: (taskId: string, fromColumnId: string, toColumnId: string) => void
  onTaskClick?: (taskId: string, columnId: string) => void
  className?: string
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const keyboardMove = useRef<{ taskId: string; targetId: string } | null>(null)
  useEffect(() => {
    const pending = keyboardMove.current
    if (!pending || !columns.find(column => column.id === pending.targetId)?.tasks.some(task => task.id === pending.taskId)) return
    const control = Array.from(boardRef.current?.querySelectorAll<HTMLSelectElement>('select[data-task-id]') ?? [])
      .find(select => select.dataset.taskId === pending.taskId)
    control?.focus()
    keyboardMove.current = null
  }, [columns])
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  function handleDragStart(event: DragEvent, task: KanbanTask, columnId: string) {
    if (task.draggable === false) {
      event.preventDefault()
      return
    }
    const payload: DragPayload = { task, sourceColumnId: columnId }
    event.dataTransfer.setData('text/plain', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(event: DragEvent, columnId: string) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(columnId)
  }

  function handleDrop(event: DragEvent, targetColumnId: string) {
    event.preventDefault()
    setDropTarget(null)
    const raw = event.dataTransfer.getData('text/plain')
    if (!raw) return
    let payload: DragPayload
    try {
      payload = JSON.parse(raw) as DragPayload
    } catch {
      return
    }
    if (!payload?.task?.id || !payload.sourceColumnId) return
    if (payload.sourceColumnId === targetColumnId) return
    onMove?.(payload.task.id, payload.sourceColumnId, targetColumnId)
  }

  return (
    <div ref={boardRef} className={cn('folio-kanban grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4', className)}>
      {columns.map((column) => (
        <div
          key={column.id}
          data-column-id={column.id}
          className={cn(
            'rounded-2xl border border-stone-200/70 bg-white p-5 shadow-soft',
            dropTarget === column.id && 'ring-2 ring-[#e85d2a]/40'
          )}
          onDragOver={(event) => handleDragOver(event, column.id)}
          onDragLeave={() => setDropTarget((current) => (current === column.id ? null : current))}
          onDrop={(event) => handleDrop(event, column.id)}
        >
          <div className="mb-5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <div
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: column.color || '#d6d3d1' }}
                  aria-hidden
                />
                <h3 className="text-[13px] font-semibold text-neutral-900">{column.title}</h3>
                <Badge variant="secondary" size="sm">
                  {column.tasks.length}
                </Badge>
              </div>
              {column.hint ? <p className="mt-1 text-[11px] text-neutral-400">{column.hint}</p> : null}
            </div>
            {column.onAdd ? (
              <button
                type="button"
                onClick={column.onAdd}
                className="rounded-full p-1.5 text-neutral-500 transition hover:bg-stone-100 hover:text-neutral-800"
                aria-label={`Add to ${column.title}`}
              >
                <Plus className="size-4" />
              </button>
            ) : null}
          </div>

          <div className="space-y-3">
            {column.tasks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-200 px-3 py-6 text-[12px] text-neutral-400">
                {column.emptyText || 'Drop a card here.'}
              </p>
            ) : (
              column.tasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    'rounded-xl border border-stone-200/80 bg-stone-50/70 p-4',
                    task.draggable === false || !onMove ? 'cursor-default' : 'cursor-move'
                  )}
                  draggable={Boolean(onMove) && task.draggable !== false}
                  onDragStart={(event) => handleDragStart(event, task, column.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="min-w-0 text-[13px] font-semibold leading-snug text-neutral-900">
                      {task.href ? (
                        <Link href={task.href} title={task.title} className="line-clamp-2 break-words hover:text-[#c2410c] hover:underline">
                          {task.title}
                        </Link>
                      ) : onTaskClick ? (
                        <button
                          type="button"
                          onClick={() => onTaskClick(task.id, column.id)}
                          title={task.title}
                          className="line-clamp-2 break-words text-left hover:text-[#c2410c] hover:underline"
                        >
                          {task.title}
                        </button>
                      ) : (
                        <span className="line-clamp-2 break-words" title={task.title}>{task.title}</span>
                      )}
                    </h4>
                    {task.draggable === false || !onMove ? null : (
                      <GripVertical className="size-4 shrink-0 text-neutral-400" aria-hidden />
                    )}
                  </div>

                  {task.description ? (
                    <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-pretty text-neutral-500">
                      {task.description}
                    </p>
                  ) : null}

                  {task.tags?.length || task.badge ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {task.badge ? (
                        <Badge variant="primary" appearance="light" size="sm">
                          {task.badge}
                        </Badge>
                      ) : null}
                      {task.tags?.map((tag) => (
                        <Badge key={tag} variant="secondary" appearance="light" size="sm">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  {task.metrics?.length ? (
                    <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-neutral-600">
                      {task.metrics.map((metric) => (
                        <div key={metric.label}>
                          <dt>{metric.label}</dt>
                          <dd className="font-semibold tabular-nums text-neutral-800">{metric.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {task.dueDate || task.comments != null || task.attachments != null || task.externalHref ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-neutral-500">
                      {task.dueDate ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="size-3.5" />
                          <span className="text-[11px] font-medium tabular-nums">{task.dueDate}</span>
                        </div>
                      ) : null}
                      {task.comments != null ? (
                        <div className="flex items-center gap-1">
                          <MessageCircle className="size-3.5" aria-hidden />
                          <span className="text-[11px] font-medium tabular-nums">{task.comments}<span className="sr-only"> comments</span></span>
                        </div>
                      ) : null}
                      {task.attachments != null ? (
                        <div className="flex items-center gap-1">
                          <Paperclip className="size-3.5" aria-hidden />
                          <span className="text-[11px] font-medium tabular-nums">{task.attachments}<span className="sr-only"> attachments</span></span>
                        </div>
                      ) : null}
                      {task.externalHref ? (
                        <a
                          href={task.externalHref}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="flex items-center gap-0.5 text-[11px] font-medium text-[#c2410c] hover:underline"
                        >
                          {task.externalLabel || 'Instantly'}
                          <ArrowUpRight className="size-3" />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  {onMove && task.draggable !== false ? (
                    <label className="mt-3 flex items-center gap-2 text-[11px] text-neutral-600">
                      <span>Move to</span>
                      <select
                        data-task-id={task.id}
                        aria-label={`Move ${task.title} to`}
                        value={column.id}
                        onChange={(event) => {
                          if (event.target.value !== column.id) {
                            keyboardMove.current = { taskId: task.id, targetId: event.target.value }
                            onMove(task.id, column.id, event.target.value)
                          }
                        }}
                        className="min-h-9 min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-xs"
                      >
                        {columns.map((target) => <option key={target.id} value={target.id}>{target.title}</option>)}
                      </select>
                    </label>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default KanbanBoard
