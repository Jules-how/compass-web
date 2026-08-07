'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import {
  dateToX,
  stepTimelineZoom,
  xToDate,
  type TimelineRange,
  type TimelineZoom
} from '@/lib/campaign-timeline'

const WHEEL_ZOOM_THRESHOLD = 55

type ZoomAnchor = {
  date: Date
  /** Distance from the scroll container's left edge to the pointer. */
  viewportX: number
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
  onBeforeZoom
}: {
  scrollRef: RefObject<HTMLDivElement | null>
  zoom: TimelineZoom
  range: TimelineRange
  labelWidth: number
  onZoomChange: (zoom: TimelineZoom) => void
  /** Called before a wheel-driven zoom so callers can skip "center on today" resets. */
  onBeforeZoom?: () => void
}) {
  const zoomRef = useRef(zoom)
  const rangeRef = useRef(range)
  const labelWidthRef = useRef(labelWidth)
  const onZoomChangeRef = useRef(onZoomChange)
  const onBeforeZoomRef = useRef(onBeforeZoom)
  const accumRef = useRef(0)
  const anchorRef = useRef<ZoomAnchor | null>(null)

  zoomRef.current = zoom
  rangeRef.current = range
  labelWidthRef.current = labelWidth
  onZoomChangeRef.current = onZoomChange
  onBeforeZoomRef.current = onBeforeZoom

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function onWheel(e: WheelEvent) {
      const container = scrollRef.current
      if (!container) return
      // Trackpad pinch emits ctrlKey; cmd/ctrl+wheel is the explicit zoom modifier.
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      accumRef.current += e.deltaY
      if (Math.abs(accumRef.current) < WHEEL_ZOOM_THRESHOLD) return

      const direction: 1 | -1 = accumRef.current < 0 ? 1 : -1
      accumRef.current = 0

      const current = zoomRef.current
      const next = stepTimelineZoom(current, direction)
      if (next === current) return

      const rect = container.getBoundingClientRect()
      const viewportX = e.clientX - rect.left
      const timelineX = container.scrollLeft + viewportX - labelWidthRef.current
      const anchorX = Math.max(0, timelineX)
      anchorRef.current = {
        date: xToDate(anchorX, rangeRef.current, current),
        viewportX
      }
      onBeforeZoomRef.current?.()
      onZoomChangeRef.current(next)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [scrollRef])

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const el = scrollRef.current
    if (!anchor || !el) return
    anchorRef.current = null
    const x = dateToX(anchor.date, range, zoom)
    el.scrollLeft = Math.max(0, x - (anchor.viewportX - labelWidth))
  }, [zoom, range, labelWidth, scrollRef])
}
