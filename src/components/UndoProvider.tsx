'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode
} from 'react'

export type UndoCommand = {
  label: string
  undo: () => void | Promise<void>
  redo?: () => void | Promise<void>
}

type UndoApi = {
  push: (command: UndoCommand) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
}

const UndoContext = createContext<UndoApi | null>(null)

function isNativeEditTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const stack = useRef<UndoCommand[]>([])
  const index = useRef(-1)
  const busy = useRef(false)

  const push = useCallback((command: UndoCommand) => {
    stack.current = stack.current.slice(0, index.current + 1)
    stack.current.push(command)
    if (stack.current.length > 80) stack.current.shift()
    index.current = stack.current.length - 1
  }, [])

  const undo = useCallback(async () => {
    if (busy.current || index.current < 0) return
    const command = stack.current[index.current]
    busy.current = true
    try {
      await command.undo()
      index.current -= 1
    } finally {
      busy.current = false
    }
  }, [])

  const redo = useCallback(async () => {
    if (busy.current || index.current >= stack.current.length - 1) return
    const command = stack.current[index.current + 1]
    if (!command.redo) return
    busy.current = true
    try {
      await command.redo()
      index.current += 1
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      if (event.key !== 'z' && event.key !== 'Z') return
      if (isNativeEditTarget(event.target)) return
      event.preventDefault()
      if (event.shiftKey) void redo()
      else void undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [redo, undo])

  const api = useMemo(() => ({ push, undo, redo }), [push, undo, redo])
  return <UndoContext.Provider value={api}>{children}</UndoContext.Provider>
}

export function useUndo(): UndoApi {
  const ctx = useContext(UndoContext)
  if (!ctx) {
    return {
      push: () => undefined,
      undo: async () => undefined,
      redo: async () => undefined
    }
  }
  return ctx
}
