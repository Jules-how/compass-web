export function reviewReadiness({
  control,
  challenger,
  controlMetrics,
  challengerMetrics,
  note,
  reviewDate,
  today,
  comparable,
  mature,
}) {
  const reasons = [];
  if (!control || !challenger) reasons.push("Choose both arms.");
  if (
    !control?.instantly_campaign_id ||
    !challenger?.instantly_campaign_id ||
    control.instantly_campaign_id === challenger.instantly_campaign_id
  )
    reasons.push("Each arm needs a different Instantly campaign.");
  for (const [label, campaign, metrics] of [
    ["Control", control, controlMetrics],
    ["Challenger", challenger, challengerMetrics],
  ]) {
    const delivered = metrics
      ? Math.max(0, metrics.sendCount - (metrics.bouncedCount || 0))
      : 0;
    if (
      !metrics ||
      !campaign?.sample_size_target ||
      delivered < campaign.sample_size_target
    )
      reasons.push(`${label} has not met its planned delivered sample.`);
  }
  if (!reviewDate || reviewDate > today)
    reasons.push("The planned review date has not arrived.");
  if (!comparable || !mature)
    reasons.push("Confirm comparable cohorts and a complete outcome window.");
  if (!note?.trim()) reasons.push("Record the evidence and limitations.");
  return reasons;
}
