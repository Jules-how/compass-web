'use client'

import { useState, type DragEvent } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Calendar, GripVertical, MessageCircle, Paperclip, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export type KanbanTask = {
  id: string
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high'
  assignee?: {
    name: string
    avatar?: string
  }
  tags?: string[]
  dueDate?: string
  attachments?: number
  comments?: number
  href?: string
  externalHref?: string
  draggable?: boolean
}

export type KanbanColumn = {
  id: string
  title: string
  color?: string
  tasks: KanbanTask[]
  hint?: string
  onAdd?: () => void
}

type DragPayload = {
  task: KanbanTask
  sourceColumnId: string
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function priorityLabel(priority: KanbanTask['priority']): string | null {
  if (priority === 'high') return 'High'
  if (priority === 'medium') return 'Medium'
  if (priority === 'low') return 'Low'
  return null
}

export function KanbanBoard({
  columns,
  onMove,
  className
}: {
  columns: KanbanColumn[]
  onMove?: (taskId: string, fromColumnId: string, toColumnId: string) => void
  className?: string
}) {
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
    <div className={cn('grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4', className)}>
      {columns.map((column) => (
        <div
          key={column.id}
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
                Drop a campaign here.
              </p>
            ) : (
              column.tasks.map((task) => (
                <Card
                  key={task.id}
                  className={cn(
                    'border-stone-200/80',
                    task.draggable === false ? 'cursor-default' : 'cursor-move'
                  )}
                  draggable={task.draggable !== false}
                  onDragStart={(event) => handleDragStart(event, task, column.id)}
                >
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-[13px] font-semibold leading-snug text-neutral-900">
                        {task.href ? (
                          <Link href={task.href} className="hover:text-[#c2410c] hover:underline">
                            {task.title}
                          </Link>
                        ) : (
                          task.title
                        )}
                      </h4>
                      {task.draggable === false ? null : (
                        <GripVertical className="size-4 shrink-0 text-neutral-400" aria-hidden />
                      )}
                    </div>

                    {task.description ? (
                      <p className="line-clamp-2 text-[12px] leading-relaxed text-neutral-500">
                        {task.description}
                      </p>
                    ) : null}

                    {task.tags?.length || priorityLabel(task.priority) ? (
                      <div className="flex flex-wrap gap-1.5">
                        {priorityLabel(task.priority) ? (
                          <Badge
                            variant={task.priority === 'high' ? 'primary' : 'secondary'}
                            appearance="light"
                            size="sm"
                          >
                            {priorityLabel(task.priority)}
                          </Badge>
                        ) : null}
                        {task.tags?.map((tag) => (
                          <Badge key={tag} variant="secondary" appearance="light" size="sm">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-3">
                      <div className="flex flex-wrap items-center gap-3 text-neutral-500">
                        {task.dueDate ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="size-3.5" />
                            <span className="text-[11px] font-medium">{task.dueDate}</span>
                          </div>
                        ) : null}
                        {task.comments != null ? (
                          <div className="flex items-center gap-1">
                            <MessageCircle className="size-3.5" />
                            <span className="text-[11px] font-medium">{task.comments}</span>
                          </div>
                        ) : null}
                        {task.attachments != null ? (
                          <div className="flex items-center gap-1">
                            <Paperclip className="size-3.5" />
                            <span className="text-[11px] font-medium">{task.attachments}</span>
                          </div>
                        ) : null}
                        {task.externalHref ? (
                          <a
                            href={task.externalHref}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-0.5 text-[11px] font-medium text-[#c2410c] hover:underline"
                          >
                            Instantly
                            <ArrowUpRight className="size-3" />
                          </a>
                        ) : null}
                      </div>
                      {task.assignee ? (
                        <Avatar className="size-8 ring-2 ring-white">
                          {task.assignee.avatar ? (
                            <AvatarImage src={task.assignee.avatar} alt="" />
                          ) : null}
                          <AvatarFallback>{initials(task.assignee.name)}</AvatarFallback>
                        </Avatar>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default KanbanBoard
