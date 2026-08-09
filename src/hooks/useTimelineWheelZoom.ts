'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import {
  dateToX,
  scalePxPerDay,
  xToDate,
  type TimelineRange
} from '@/lib/campaign-timeline'

type ZoomAnchor = {
  date: Date
  /** Distance from the scroll container's left edge to the pointer. */
  viewportX: number
}

type GestureEventLike = Event & {
  scale: number
  clientX?: number
  clientY?: number
}

/**
 * Trackpad pinch / ctrl|meta+wheel zooms the timeline continuously (Year↔Week envelope),
 * keeping the date under the cursor anchored in place.
 */
export function useTimelineWheelZoom({
  scrollRef,
  density,
  range,
  labelWidth,
  onDensityChange,
  onBeforeZoom,
  enabled = true
}: {
  scrollRef: RefObject<HTMLDivElement | null>
  /** Continuous pixels-per-day. */
  density: number
  range: TimelineRange
  labelWidth: number
  onDensityChange: (pxPerDay: number) => void
  /** Called before a wheel-driven zoom so callers can skip "center on today" resets. */
  onBeforeZoom?: () => void
  /** When false, listeners detach (e.g. list/board view). */
  enabled?: boolean
}) {
  const densityRef = useRef(density)
  const rangeRef = useRef(range)
  const labelWidthRef = useRef(labelWidth)
  const onDensityChangeRef = useRef(onDensityChange)
  const onBeforeZoomRef = useRef(onBeforeZoom)
  const anchorRef = useRef<ZoomAnchor | null>(null)
  const gestureScaleRef = useRef(1)
  const rafRef = useRef(0)
  const pendingDensityRef = useRef<number | null>(null)

  densityRef.current = density
  rangeRef.current = range
  labelWidthRef.current = labelWidth
  onDensityChangeRef.current = onDensityChange
  onBeforeZoomRef.current = onBeforeZoom

  useEffect(() => {
    if (!enabled) return
    const el = scrollRef.current
    if (!el) return

    function flushDensity() {
      rafRef.current = 0
      const next = pendingDensityRef.current
      pendingDensityRef.current = null
      if (next == null) return
      if (Math.abs(next - densityRef.current) < 0.0005) return
      onBeforeZoomRef.current?.()
      onDensityChangeRef.current(next)
    }

    function scheduleDensity(next: number, clientX: number) {
      const container = scrollRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const viewportX = clientX - rect.left
      const timelineX = container.scrollLeft + viewportX - labelWidthRef.current
      const anchorX = Math.max(0, timelineX)
      anchorRef.current = {
        date: xToDate(anchorX, rangeRef.current),
        viewportX
      }
      pendingDensityRef.current = next
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(flushDensity)
      }
    }

    function onWheel(e: WheelEvent) {
      // Trackpad pinch emits ctrlKey; cmd/ctrl+wheel is the explicit zoom modifier.
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      const base = pendingDensityRef.current ?? densityRef.current
      const next = scalePxPerDay(base, e.deltaY)
      if (next === base) return
      scheduleDensity(next, e.clientX)
    }

    function onGestureStart(e: Event) {
      const gesture = e as GestureEventLike
      gestureScaleRef.current = gesture.scale || 1
      e.preventDefault()
    }

    function onGestureChange(e: Event) {
      const gesture = e as GestureEventLike
      e.preventDefault()
      const prev = gestureScaleRef.current || 1
      const scale = gesture.scale || 1
      if (prev <= 0) {
        gestureScaleRef.current = scale
        return
      }
      // Safari pinch: scale > 1 zooms in (more detail), < 1 zooms out.
      // Convert scale ratio into a wheel-equivalent delta for scalePxPerDay.
      const ratio = scale / prev
      gestureScaleRef.current = scale
      if (Math.abs(ratio - 1) < 0.002) return
      const deltaY = -Math.log(ratio) / 0.0018
      const rect = scrollRef.current?.getBoundingClientRect()
      const clientX =
        typeof gesture.clientX === 'number'
          ? gesture.clientX
          : rect
            ? rect.left + rect.width / 2
            : 0
      const base = pendingDensityRef.current ?? densityRef.current
      const next = scalePxPerDay(base, deltaY)
      if (next === base) return
      scheduleDensity(next, clientX)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    // Safari / some WebKit builds expose pinch as gesture* instead of ctrl+wheel.
    el.addEventListener('gesturestart', onGestureStart as EventListener, {
      passive: false
    } as AddEventListenerOptions)
    el.addEventListener('gesturechange', onGestureChange as EventListener, {
      passive: false
    } as AddEventListenerOptions)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      pendingDensityRef.current = null
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', onGestureStart as EventListener)
      el.removeEventListener('gesturechange', onGestureChange as EventListener)
    }
  }, [scrollRef, enabled])

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const el = scrollRef.current
    if (!anchor || !el) return
    anchorRef.current = null
    const x = dateToX(anchor.date, range)
    el.scrollLeft = Math.max(0, x - (anchor.viewportX - labelWidth))
  }, [density, range, labelWidth, scrollRef])
}
