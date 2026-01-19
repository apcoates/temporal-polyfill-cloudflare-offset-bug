/**
 * Minimal reproducer for temporal-polyfill bug in Cloudflare Workers
 *
 * Root Cause: temporal-polyfill computes maxPossibleTransition using new Date()
 * at module load time. CF Workers returns epoch 0 for new Date() at module scope,
 * causing maxPossibleTransition to be 1980. All dates after 1980 get clamped.
 *
 * See README.md
 */

import { Temporal } from 'temporal-polyfill';

export default {
  async fetch(): Promise<Response> {
    const results = {
      bug_demo: demonstrateBug(),
      intl_proof: proveIntlWorksCorrectly(),
    };

    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

function demonstrateBug() {
  // April 15, 2026 should be PDT (UTC-7), not PST (UTC-8)
  const april = Temporal.PlainDateTime.from('2026-04-15T09:00:00');
  const aprilZoned = april.toZonedDateTime('America/Los_Angeles');

  // January 20, 2026 should be PST (UTC-8) - this works correctly
  const january = Temporal.PlainDateTime.from('2026-01-20T09:00:00');
  const januaryZoned = january.toZonedDateTime('America/Los_Angeles');

  return {
    april2026: {
      input: '2026-04-15T09:00:00',
      result: aprilZoned.toString(),
      offset: aprilZoned.offset,
      expected: '-07:00',
      correct: aprilZoned.offset === '-07:00',
    },
    january2026: {
      input: '2026-01-20T09:00:00',
      result: januaryZoned.toString(),
      offset: januaryZoned.offset,
      expected: '-08:00',
      correct: januaryZoned.offset === '-08:00',
    },
  };
}

function proveIntlWorksCorrectly() {
  // Direct Intl.DateTimeFormat call returns correct hour
  // This proves the bug is in temporal-polyfill, not CF Workers' Intl
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
  });

  const aprilUtcMs = Date.UTC(2026, 3, 15, 16, 0, 0); // 16:00 UTC = 09:00 PDT
  const parts = format.formatToParts(aprilUtcMs);
  const hour = parts.find(p => p.type === 'hour')?.value;

  return {
    description: 'Direct Intl.DateTimeFormat works correctly',
    input: '2026-04-15T16:00:00Z',
    hour,
    expected: '09',
    correct: hour === '09',
  };
}

