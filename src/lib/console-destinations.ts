'use client'

function once<T>(loader: () => Promise<T>) {
  let pending: Promise<T> | undefined
  return () => pending ??= loader().catch((error) => { pending = undefined; throw error })
}

export const loadHomeDashboard = once(() => import('@/components/home/HomeDashboard').then((m) => ({ default: m.HomeDashboard })))
export const loadInboxPanel = once(() => import('@/components/InboxPanel').then((m) => ({ default: m.InboxPanel })))
export const loadSalesOverview = once(() => import('@/components/sales/SalesOverview').then((m) => ({ default: m.SalesOverview })))
export const loadOffersDesk = once(() => import('@/components/offers/OffersDesk').then((m) => ({ default: m.OffersDesk })))
export const loadOutboundDesk = once(() => import('@/components/outbound/OutboundDesk').then((m) => ({ default: m.OutboundDesk })))
export const loadLeadsPanel = once(() => import('@/components/LeadsPanel').then((m) => ({ default: m.LeadsPanel })))
export const loadTasksPanel = once(() => import('@/components/TasksPanel').then((m) => ({ default: m.TasksPanel })))
export const loadProjectsPanel = once(() => import('@/components/ProjectsPanel').then((m) => ({ default: m.ProjectsPanel })))
export const loadFunctionsPanel = once(() => import('@/components/FunctionsPanel').then((m) => ({ default: m.FunctionsPanel })))
export const loadClientsPanel = once(() => import('@/components/ClientsPanel').then((m) => ({ default: m.ClientsPanel })))
export const loadExpenseBoard = once(() => import('@/components/finances/ExpenseBoard').then((m) => ({ default: m.ExpenseBoard })))
export const loadInstallKanban = once(() => import('@/components/delivery-dept/InstallKanban').then((m) => ({ default: m.InstallKanban })))
export const loadCsDeptBoard = once(() => import('@/components/cs-dept/CsDeptBoard').then((m) => ({ default: m.CsDeptBoard })))
export const loadPlanningDesk = once(() => import('@/components/planning/PlanningDesk').then((m) => ({ default: m.PlanningDesk })))
export const loadOutboundRhythm = once(() => import('@/components/outbound/rhythm/OutboundRhythm').then((m) => ({ default: m.OutboundRhythm })))

export const destinationLoaders = {
  home: loadHomeDashboard,
  inbox: loadInboxPanel,
  sales: loadSalesOverview,
  offers: loadOffersDesk,
  outbound: loadOutboundDesk,
  leads: loadLeadsPanel,
  tasks: loadTasksPanel,
  projects: loadProjectsPanel,
  functions: loadFunctionsPanel,
  clients: loadClientsPanel,
  finances: loadExpenseBoard,
  installs: loadInstallKanban,
  retention: loadCsDeptBoard,
  planning: loadPlanningDesk, rhythm: loadOutboundRhythm
}
