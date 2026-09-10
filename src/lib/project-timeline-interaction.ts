/** Date-grid coordinates measured from the stationary scroll viewport. */
export function projectTimelineX(clientX: number, viewportLeft: number, scrollLeft: number, labelWidth: number) {
  return clientX - viewportLeft + scrollLeft - labelWidth
}

export function projectTimelineLabelWidth(viewportWidth: number) {
  return viewportWidth < 640 ? 200 : 320
}

export function projectTimelineTodayScroll(todayX: number, viewportWidth: number, labelWidth: number) {
  return Math.max(0, todayX - Math.max(0, viewportWidth - labelWidth) * 0.35)
}
