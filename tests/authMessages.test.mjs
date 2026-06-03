import assert from 'node:assert/strict';
import { authFailureMessage, isAccountExistsError } from '../src/authMessages.js';
import { SupabaseRequestError } from '../src/supabaseBackend.js';

function check(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('auth messages');

check('detects Supabase existing-account signup errors', () => {
  const err = new SupabaseRequestError('User already registered', { status: 400 });
  assert.equal(isAccountExistsError(err), true);
  assert.match(authFailureMessage(err, 'fallback'), /account already exists/i);
});

check('does not label generic client auth errors as existing accounts', () => {
  const err = new SupabaseRequestError('Invalid login credentials', { status: 400 });
  assert.equal(isAccountExistsError(err), false);
  assert.equal(authFailureMessage(err, 'fallback'), 'Invalid login credentials');
});

check('formats signup rate-limit cooldowns with retry timing', () => {
  const err = new SupabaseRequestError('For security purposes, you can only request this after 54 seconds.', {
    status: 429,
    retryAfterSeconds: 54
  });
  assert.match(authFailureMessage(err, 'fallback'), /Wait 54 seconds/);
});
