import React, { useMemo, useSyncExternalStore } from 'react'
const originalPush = window.history.pushState.bind(window.history)
const originalReplace = window.history.replaceState.bind(window.history)
window.history.pushState = (...args) => { originalPush(...args); window.dispatchEvent(new Event('fixture-location')) }
window.history.replaceState = (...args) => { originalReplace(...args); window.dispatchEvent(new Event('fixture-location')) }
function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback)
  window.addEventListener('fixture-location', callback)
  return () => { window.removeEventListener('popstate', callback); window.removeEventListener('fixture-location', callback) }
}
function useLocation() { return useSyncExternalStore(subscribe, () => location.pathname + location.search, () => '/inbox') }
export default function Link({ children, href, prefetch, onClick, ...props }: any) {
  return <a href={typeof href === 'string' ? href : '#'} {...props} onClick={(event) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    event.preventDefault()
    if (typeof href === 'string' && href.startsWith('/')) history.pushState(null, '', href)
  }}>{children}</a>
}
const router = { push: (href: string) => history.pushState(null, '', href), replace: (href: string) => history.replaceState(null, '', href), refresh: () => {}, back: () => history.back(), prefetch: () => Promise.resolve() }
export function useRouter() { return router }
export function usePathname() { return useLocation().split('?')[0] }
export function useSearchParams() { const value = useLocation(); return useMemo(() => new URLSearchParams(value.split('?')[1] ?? ''), [value]) }
