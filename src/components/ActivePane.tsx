'use client'

import { createContext, useContext, type ReactNode } from 'react'

const ActivePaneContext = createContext(true)
export function useActivePane() { return useContext(ActivePaneContext) }

/** Nested desks are active only while their parent surface is also visible. */
export function ActivePane({ active, children }: { active: boolean; children: ReactNode }) {
  const parentActive = useActivePane()
  return <ActivePaneContext.Provider value={parentActive && active}>{children}</ActivePaneContext.Provider>
}
