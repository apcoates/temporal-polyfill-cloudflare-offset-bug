# Bug: `new Date()` at Module Scope Breaks Time Zone Offsets in Cloudflare Workers

`maxPossibleTransition` is computed at module load time using `new Date()`. In Cloudflare Workers, [`new Date()` returns epoch 0 (1970-01-01)][1] during module initialization. This causes `maxPossibleTransition` to be set to 1980, and all dates after 1980 get clamped, returning incorrect timezone offsets.

## Cause

**File:** `timeZoneConfig.ts:9`

```typescript
export const maxPossibleTransition = isoArgsToEpochSec(getCurrentYearPlus10())

function getCurrentYearPlus10() {
  const currentDate = /*@__PURE__*/ new Date()
  const currentYear = /*@__PURE__*/ currentDate.getUTCFullYear()
  return currentYear + 10
}
```

**Cause**
1. Cloudflare Workers returns epoch 0 for `new Date()` at module/global scope [1]
2. `getCurrentYearPlus10()` thus returns `1970 + 10 = 1980`
3. `maxPossibleTransition` becomes 1980-01-01
4. In `getOffsetSec()`, all epoch times are clamped: `clampNumber(epochSec, minTransition, maxTransition)`
5. Any offsets, then are computed as in 1980

## Reproduction

Deploy the minimal worker in this repo to Cloudflare Workers:

```bash
bun install
bun run deploy
# Visit the deployed/preview URL
```

## Output

```json
{
  "bug_demo": {
    "april2026": {
      "input": "2026-04-15T09:00:00",
      "result": "2026-04-15T09:00:00-08:00[America/Los_Angeles]",
      "offset": "-08:00",
      "expected": "-07:00",
      "correct": false
    },
    "january2026": {
      "input": "2026-01-20T09:00:00",
      "result": "2026-01-20T09:00:00-08:00[America/Los_Angeles]",
      "offset": "-08:00",
      "expected": "-08:00",
      "correct": true
    }
  },
  "intl_proof": {
    "description": "Direct Intl.DateTimeFormat works correctly",
    "input": "2026-04-15T16:00:00Z",
    "hour": "09",
    "expected": "09",
    "correct": true
  }
}
```

Note that this won't reproduce in local environments (wrangler dev).

## Extra Info

I modified polyfill to capture some internals during testing with a deployed CF Worker, yielding these values:
```json
{
  "input_epochSec": 1776268800,       // April 15, 2026
  "maxTransition": 315532800,         // 1980-01-01T00:00:00Z
  "clamped_epochSec": 315532800,      // Clamped to 1980
  "wasClamped": true,
  "startOffset": -28800,              // -8 hours (1980 PST)
  "endOffset": -28800,                // -8 hours (no DST in 1980 period)
  "needsBinarySearch": false          // No transition found
}
```

## Temporary Fix

I've temporarily ~~patched~~ hacked my install with bun patch to initialize maxPossibleTransition with
isoArgsToEpochSec(FIXED_FUTURE_YEAR) and have verified that resolves the issue. Presumably setting
FIXED_FUTURE_YEAR far enough out creates a speed hit, but ideally we will have native support for Temporal before
I have to push it out too far :)

## Files

- `index.ts` - Minimal reproducer worker
- `wrangler.toml` - Cloudflare Workers config

## References
[1]: https://community.cloudflare.com/t/date-in-worker-is-reporting-thu-jan-01-1970-0000-gmt-0000/236503
