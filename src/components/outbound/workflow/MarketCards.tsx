"use client";
import { useState } from "react";
import { useEditorBuffer } from "./pipeline-client";
import { ArrowUpRight, Layers, MapPin, Plus } from "lucide-react";
import { MARKET_CITIES, marketSummary, type MarketCompany } from "@/lib/outbound-market";
import type { WorkflowVersion } from "@/lib/outbound-pipeline";
function MetricCard({ title, kind, records, profile, badge, onOpen }: { title: string; kind: 'city' | 'service'; records: MarketCompany[]; profile: string; badge: string; onOpen: () => void }) {
  const metric = marketSummary(records, profile);
  return <button type="button" className="op-market-card" onClick={onOpen} aria-label={`Open ${title}: ${metric.total} accounts`}>
    <div className="op-card-top"><span className="op-market-icon">{kind === 'city' ? <MapPin size={16} /> : <Layers size={16} />}</span><ArrowUpRight size={15} className="op-muted" aria-hidden="true" /></div>
    <h3>{title}</h3><span className="op-chip op-market-badge">{badge}</span>
    <div className="op-market-total">{metric.total.toLocaleString()}<span>accounts</span></div>
    <dl><div><dt>Contacted</dt><dd>{metric.contacted.toLocaleString()}</dd></div><div><dt>ICP match</dt><dd>{metric.matchRate === null ? 'Not assessed' : `${metric.matchRate}%`}</dd></div></dl>
    <div className="op-coverage-bar" aria-hidden="true"><span style={{ width: `${metric.total ? metric.assessed / metric.total * 100 : 0}%` }} /></div>
    <small>{metric.assessed} of {metric.total} assessed · {metric.unknown} unknown</small>
    <small>{metric.linked} accounts linked to contact history</small>
  </button>;
}
export function MarketCards({ records, profile, workflow, onCity, onService, loading, error, onRetry }: {
  records: MarketCompany[]; profile: string; workflow: WorkflowVersion | null; onCity: (city: string) => void; onService: (service: string) => void;
  loading: boolean; error: string; onRetry: () => void;
}) {
  const [extraCities, setExtraCities] = useEditorBuffer<string[]>("compass.pipeline.additional-cities", []);
  const [adding, setAdding] = useState(false);
  const [newCity, setNewCity] = useState('');
  const cities = [...new Set([...MARKET_CITIES, ...extraCities])];
  const serviceNames = [...new Set(records.flatMap(row => row.services))].sort();
  const badge = workflow?.policy.icp_name || workflow?.name || 'All profiles';
  if (error) return <section className="op-empty-state" role="alert"><h3>Market totals are unavailable</h3><p>{error}</p><p>No partial or estimated counts are shown.</p><button type="button" onClick={onRetry}>Retry market data</button></section>;
  if (loading) return <div className="op-market-grid" role="status" aria-label="Loading complete market counts">{cities.map(city => <div className="op-market-card op-market-skeleton" key={city}><h3>{city}</h3><span className="op-skeleton" /><span className="op-skeleton" /><span className="op-skeleton" /></div>)}</div>;
  return <div className="op-markets">
    <div className="op-section-heading"><div><h3>Markets by city</h3><p className="op-muted">{workflow ? `${workflow.name} · ${badge}` : 'Choose an ICP profile above to inspect its recorded fit.'}</p></div><button type="button" aria-expanded={adding} onClick={() => setAdding(value => !value)}><Plus size={14} aria-hidden="true" />Add city</button></div>
    {adding && <form className="op-inline op-add-city" onSubmit={event => { event.preventDefault(); const city = newCity.trim(); if (city && !cities.some(value => value.toLowerCase() === city.toLowerCase())) setExtraCities([...extraCities, city]); setNewCity(''); setAdding(false); }}><label>City name<input required maxLength={120} value={newCity} onChange={event => setNewCity(event.target.value)} placeholder="Canberra" /></label><button type="submit">Add card</button><button type="button" onClick={() => setAdding(false)}>Cancel</button><small>Saved in this browser tab. Uses recorded city names; does not scrape accounts.</small></form>}
    <div className="op-market-grid">{cities.map(city => <MetricCard key={city} title={city} kind="city" profile={profile} badge={badge} records={records.filter(row => row.locations.some(location => location.city?.trim().toLowerCase() === city.toLowerCase()))} onOpen={() => onCity(city)} />)}</div>
    <p className="op-metric-note">ICP match = likely or confirmed matches ÷ assessed accounts, not an estimate for unassessed accounts. Contacted counts recorded outbound interactions on uniquely linked accounts; missing history is not proof of no contact.</p>
    <div className="op-section-heading"><div><h3>Markets by recorded service</h3><p className="op-muted">A company can appear in several service cards. Each card counts unique accounts; totals across cards are not additive.</p></div></div>
    {serviceNames.length ? <div className="op-market-grid">{serviceNames.map(service => <MetricCard key={service} title={service} kind="service" profile={profile} badge="Evidence-backed service" records={records.filter(row => row.services.includes(service))} onOpen={() => onService(service)} />)}</div>
      : <div className="op-card-empty"><strong>No reviewed service labels yet</strong><p>Research can record multiple services or business types for an account. Plumbing or electrical names alone do not establish an air-conditioning service.</p></div>}
    <div className="op-market-footnote"><span>{records.filter(row => !row.locations.some(location => location.city)).length} accounts have no recorded city.</span><span>{records.filter(row => !row.services.length).length} accounts have no reviewed service labels.</span></div>
  </div>;
}
