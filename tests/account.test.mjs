import assert from 'node:assert/strict';
import { formatLocalProjectCount, formatSessionExpiry } from '../account.js';

function check(name, fn) {
  try {
    fn();
    console.log('  OK', name);
  } catch (err) {
    console.error('  FAIL', name);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('account page helpers');

check('formats local project counts', () => {
  assert.equal(formatLocalProjectCount([]), '0 saved projects');
  assert.equal(formatLocalProjectCount(['Plant Upgrade']), '1 saved project');
  assert.equal(formatLocalProjectCount(['A', 'B']), '2 saved projects');
});

check('reports local project storage errors', () => {
  assert.equal(formatLocalProjectCount(['A'], new Error('blocked')), 'Unavailable');
});

check('formats future session expiry with remaining time', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const value = formatSessionExpiry(now + 30 * 60000, now);
  assert.match(value, /30 min left/);
});

check('formats expired session timestamps', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const value = formatSessionExpiry(now - 60000, now);
  assert.match(value, /^Expired /);
});
