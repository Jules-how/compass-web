'use client'

import { useRef } from 'react'
import { useActivePane } from '@/components/ActivePane'
import dynamic from 'next/dynamic'
import { usePathname, useSearchParams } from 'next/navigation'
import { OperatorShell } from '@/components/OperatorShell'

const PlanningBoard = dynamic(() => import('./PlanningBoard').then(m => m.PlanningBoard))
const PlanningRecords = dynamic(() => import('./PlanningRecords').then(m => m.PlanningRecords))
const PathfinderBoard = dynamic(() => import('@/components/pathfinder/PathfinderBoard').then(m => m.PathfinderBoard))

export function PlanningDesk() {
  const params = useSearchParams()
  const active = useActivePane()
  const pathname = usePathname()
  const route = useRef({ view: params.get('view'), goal: params.get('goal') })
  if (active && pathname === '/planning') route.current = { view: params.get('view'), goal: params.get('goal') }
  const { view, goal } = route.current
  return <OperatorShell width="full">
    {view === 'records' ? <PlanningBoard /> : view === 'activity' ? <PlanningRecords /> : <PathfinderBoard initialGoalId={goal ?? undefined} />}
  </OperatorShell>
}
