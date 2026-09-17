"use client";
import { useId, useState } from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, Plus, Search } from "lucide-react";

/** Searchable single-choice popover; Radix owns focus return, outside-click and Escape. */
export function PipelinePicker({ label, value, options, onChange, placeholder, disabled, onCreate, createLabel }: {
  label: string; value: string; options: { value: string; label: string; description?: string }[];
  onChange: (value: string) => void; placeholder: string; disabled?: boolean;
  onCreate?: () => void; createLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const id = useId();
  const selected = options.find(option => option.value === value);
  const matching = options.filter(option => `${option.label} ${option.description || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="op-picker">
    <span id={id} className="op-control-label">{label}</span>
    <Popover.Root open={open} onOpenChange={next => { setOpen(next); setSearch(""); }}>
      <Popover.Trigger asChild><button type="button" disabled={disabled} className="op-picker-trigger" aria-labelledby={id}>
        <span>{selected?.label || placeholder}</span><ChevronDown size={14} aria-hidden="true" />
      </button></Popover.Trigger>
      <Popover.Portal><Popover.Content className="op-picker-menu" sideOffset={6} align="start" collisionPadding={12} aria-label={label}>
        <div className="op-picker-search"><Search size={15} aria-hidden="true" /><input aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}…`} value={search} onChange={event => setSearch(event.target.value)} /></div>
        <div className="op-picker-options" role="group" aria-label={`${label} choices`}>
          {matching.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => { onChange(option.value); setOpen(false); }}>
            <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span><Check size={14} aria-hidden="true" style={{ visibility: value === option.value ? "visible" : "hidden" }} />
          </button>)}
          {!matching.length && <p>No matching options.</p>}
        </div>
        {onCreate && <button type="button" className="op-picker-create" onClick={() => { setOpen(false); onCreate(); }}><Plus size={14} aria-hidden="true" />{createLabel || `Create ${label.toLowerCase()}`}</button>}
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </div>;
}
