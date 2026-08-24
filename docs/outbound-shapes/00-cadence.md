# Shared: variable cadence

## Why

`QUEUE_WEEK_SLOT_MIN = 3` and `MAX = 5` leaked into the product as doctrine. Jules sets the week’s volume. The code should ask him.

## Files

- `src/lib/outbound-cadence.ts`
- `src/components/outbound/CadenceControl.tsx`

## Model

```ts
export type CadencePrefs = {
  target: number | null
  cap: number | null
}

export const CADENCE_STORAGE_KEY = 'compass.outbound.cadence.v1'
```

Rules: integers ≥ 0. `cap` if set must be ≥ `target` when target is set. Empty field = null (no target / no cap).

`weekLoad(slots, prefs)`:

- `overCapacity` only if `cap` is a number and `slots > cap`
- `underTarget` only if `target` is a number and `slots < target`
- Copy: `{slots} this week` plus ` · under target` or ` · over cap` when those flags fire. Never print a default band.

`rankNextSlots` in previews must take `prefs` instead of the 3/5 constants. `take` = remaining to hit target, bounded by remaining to cap. If target and cap are both null, return up to 3 ranked cards as suggestions with no fullness stop from cadence (inventory ranking only).

## Control

Compact header control: “This week” number input for target, optional cap. Labels: `Target` and `Cap`. Placeholder `none`. Save on blur.

## Tests

Update `test/campaign-queue.test.mjs` so preview helpers do not assert `QUEUE_WEEK_SLOT_MIN = 3`. Live `/sales/outbound` rail may still import the old constants until Jules picks a shape. Previews must not.
