const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const context = vm.createContext({ Date, Intl });
for (const file of ['lib/taipei-time.ts', 'lib/video-booking-window.ts']) {
  let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  if (file.includes('video-booking')) source = source.replace('const TAIPEI_TIME_ZONE = "Asia/Taipei";', '');
  vm.runInContext(stripTypeScriptTypes(source), context);
}
test('Oct 5 plus seven excluded days first allows Oct 13 Tuesday', () => {
  const now = new Date('2026-10-05T12:00:00+08:00');
  assert.equal(context.earliestVideoBookingDate(now, 7), '2026-10-13');
  assert.equal(context.videoBookingDateLabel('2026-10-13'), '10/13(二)');
  assert.equal(context.isAllowedVideoSlot('2026-10-12T23:59:59+08:00', now, 7), false);
  assert.equal(context.isAllowedVideoSlot('2026-10-13T00:00:00+08:00', now, 7), true);
});
test('Taipei midnight moves cutoff regardless of server timezone', () => {
  assert.equal(context.earliestVideoBookingDate(new Date('2026-10-05T15:59:59Z'), 7), '2026-10-13');
  assert.equal(context.earliestVideoBookingDate(new Date('2026-10-05T16:00:00Z'), 7), '2026-10-14');
});
test('zero, default, year end and leap day follow calendar arithmetic', () => {
  assert.equal(context.earliestVideoBookingDate(new Date('2026-10-05T00:00:00+08:00'), 0), '2026-10-06');
  assert.equal(context.earliestVideoBookingDate(new Date('2026-10-05T00:00:00+08:00')), '2026-10-09');
  assert.equal(context.earliestVideoBookingDate(new Date('2026-12-31T00:00:00+08:00'), 0), '2027-01-01');
  assert.equal(context.earliestVideoBookingDate(new Date('2028-02-28T00:00:00+08:00'), 0), '2028-02-29');
});
test('reject nonnumeric, negative, fractional and excessive settings', () => {
  for (const value of ['', '7', null, -1, 1.5, NaN, Infinity, 36501]) assert.equal(context.validVideoLeadDays(value), false);
  for (const value of [0, 7, 36500]) assert.equal(context.validVideoLeadDays(value), true);
});
