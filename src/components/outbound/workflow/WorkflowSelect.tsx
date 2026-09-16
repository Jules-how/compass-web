"use client";
import { Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
export function WorkflowSelect({ value, onChange, options, label, id }: {
  value: string; onChange: (value: string) => void; label: string; id?: string;
  options: readonly { value: string; label: string }[];
}) {
  return <Select.Root value={value} onValueChange={onChange}>
    <Select.Trigger id={id} className="wf-select-trigger" aria-label={label}>
      <Select.Value /><Select.Icon><ChevronDown size={14} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content className="wf-select-menu" position="popper" sideOffset={5} collisionPadding={12}>
      <Select.ScrollUpButton className="wf-select-scroll">↑</Select.ScrollUpButton>
      <Select.Viewport>{options.map(o => <Select.Item className="wf-select-option" key={o.value} value={o.value}>
        <Select.ItemText>{o.label}</Select.ItemText><Select.ItemIndicator><Check size={14} /></Select.ItemIndicator>
      </Select.Item>)}</Select.Viewport>
      <Select.ScrollDownButton className="wf-select-scroll">↓</Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
