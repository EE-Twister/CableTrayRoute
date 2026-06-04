import assert from 'node:assert/strict';
import { authProviderLabel, avatarColorForUser, initialsForUser } from '../src/authProfile.js';

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

console.log('auth profile');

check('builds initials from email local parts', () => {
  assert.equal(initialsForUser('derek.smith@example.com'), 'DS');
  assert.equal(initialsForUser('designer@example.com'), 'DE');
});

check('builds fallback initials for blank users', () => {
  assert.equal(initialsForUser(''), 'U');
  assert.equal(initialsForUser(null), 'U');
});

check('uses stable avatar colors for the same user', () => {
  assert.equal(avatarColorForUser('derek@example.com'), avatarColorForUser('derek@example.com'));
  assert.match(avatarColorForUser('derek@example.com'), /^#[0-9a-f]{6}$/i);
});

check('labels supported auth providers', () => {
  assert.equal(authProviderLabel(null), 'Signed out');
  assert.equal(authProviderLabel({ provider: 'supabase' }), 'CableTrayRoute account');
  assert.equal(authProviderLabel({ provider: 'server' }), 'CableTrayRoute account');
});
