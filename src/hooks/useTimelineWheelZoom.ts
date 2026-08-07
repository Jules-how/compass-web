'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import {
  dateToX,
  stepTimelineZoom,
  xToDate,
  type TimelineRange,
  type TimelineZoom
} from '@/lib/campaign-timeline'

/** Pinch deltas are tiny; accumulate a short gesture before stepping a level. */
const WHEEL_ZOOM_THRESHOLD = 10
/** Prevent one continuous pinch from skipping Year → Week in a single flick. */
const ZOOM_COOLDOWN_MS = 120
/** Drop leftover accumulation once the gesture pauses. */
const ACCUM_IDLE_MS = 180

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
 * Trackpad pinch / ctrl|meta+wheel zooms the timeline through discrete Year→Week levels,
 * keeping the date under the cursor anchored in place.
 */
export function useTimelineWheelZoom({
  scrollRef,
  zoom,
  range,
  labelWidth,
  onZoomChange,
  onBeforeZoom,
  enabled = true
}: {
  scrollRef: RefObject<HTMLDivElement | null>
  zoom: TimelineZoom
  range: TimelineRange
  labelWidth: number
  onZoomChange: (zoom: TimelineZoom) => void
  /** Called before a wheel-driven zoom so callers can skip "center on today" resets. */
  onBeforeZoom?: () => void
  /** When false, listeners detach (e.g. list/board view). */
  enabled?: boolean
}) {
  const zoomRef = useRef(zoom)
  const rangeRef = useRef(range)
  const labelWidthRef = useRef(labelWidth)
  const onZoomChangeRef = useRef(onZoomChange)
  const onBeforeZoomRef = useRef(onBeforeZoom)
  const accumRef = useRef(0)
  const cooldownUntilRef = useRef(0)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const anchorRef = useRef<ZoomAnchor | null>(null)
  const gestureScaleRef = useRef(1)

  zoomRef.current = zoom
  rangeRef.current = range
  labelWidthRef.current = labelWidth
  onZoomChangeRef.current = onZoomChange
  onBeforeZoomRef.current = onBeforeZoom

  useEffect(() => {
    if (!enabled) return
    const el = scrollRef.current
    if (!el) return

    function clearIdleTimer() {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
    }

    function scheduleIdleReset() {
      clearIdleTimer()
      idleTimerRef.current = setTimeout(() => {
        accumRef.current = 0
        idleTimerRef.current = null
      }, ACCUM_IDLE_MS)
    }

    function applyZoomStep(direction: 1 | -1, clientX: number) {
      const container = scrollRef.current
      if (!container) return

      const now = performance.now()
      if (now < cooldownUntilRef.current) return

      const current = zoomRef.current
      const next = stepTimelineZoom(current, direction)
      if (next === current) return

      const rect = container.getBoundingClientRect()
      const viewportX = clientX - rect.left
      const timelineX = container.scrollLeft + viewportX - labelWidthRef.current
      const anchorX = Math.max(0, timelineX)
      anchorRef.current = {
        date: xToDate(anchorX, rangeRef.current, current),
        viewportX
      }
      cooldownUntilRef.current = now + ZOOM_COOLDOWN_MS
      accumRef.current = 0
      onBeforeZoomRef.current?.()
      onZoomChangeRef.current(next)
    }

    function onWheel(e: WheelEvent) {
      // Trackpad pinch emits ctrlKey; cmd/ctrl+wheel is the explicit zoom modifier.
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      accumRef.current += e.deltaY
      scheduleIdleReset()
      if (Math.abs(accumRef.current) < WHEEL_ZOOM_THRESHOLD) return

      const direction: 1 | -1 = accumRef.current < 0 ? 1 : -1
      applyZoomStep(direction, e.clientX)
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
      // Safari pinch: scale > 1 zooms in (more detail), < 1 zooms out.
      const delta = scale - prev
      if (Math.abs(delta) < 0.08) return
      gestureScaleRef.current = scale
      const direction: 1 | -1 = delta > 0 ? 1 : -1
      const rect = scrollRef.current?.getBoundingClientRect()
      const clientX =
        typeof gesture.clientX === 'number'
          ? gesture.clientX
          : (rect ? rect.left + rect.width / 2 : 0)
      applyZoomStep(direction, clientX)
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
      clearIdleTimer()
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
    const x = dateToX(anchor.date, range, zoom)
    el.scrollLeft = Math.max(0, x - (anchor.viewportX - labelWidth))
  }, [zoom, range, labelWidth, scrollRef])
}
