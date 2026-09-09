import React from 'react'
import { useConsoleViewPath } from '@/components/ConsoleNav'
function Placeholder() { const path = useConsoleViewPath(); return <section className="compass-panel m-4 p-6"><h1 className="text-xl font-semibold">Fixture destination: {path}</h1><p className="mt-2">This destination is a fixture placeholder. Sidebar, navigation, keep-alive boundaries and Inbox are actual components.</p><button className="compass-btn-secondary mt-4">Destination focus target</button></section> }
export const HomeDashboard = Placeholder, SalesOverview = Placeholder, OffersDesk = Placeholder, OutboundDesk = Placeholder, LeadsPanel = Placeholder, TasksPanel = Placeholder, ProjectsPanel = Placeholder, FunctionsPanel = Placeholder, ClientsPanel = Placeholder, ExpenseBoard = Placeholder, InstallKanban = Placeholder, CsDeptBoard = Placeholder
export function useAuth() { return { signOut: async () => {}, user: null, profile: null, loading: false } }
