import assert from 'node:assert/strict';

globalThis.__CTR_SUPABASE_CONFIG__ = {
  supabaseUrl: 'https://project-ref.supabase.co',
  supabaseAnonKey: 'anon-key'
};

const calls = [];

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body
  };
}

globalThis.fetch = async (url, options = {}) => {
  const call = { url: String(url), options };
  calls.push(call);
  if (call.url.includes('/auth/v1/token?grant_type=password')) {
    return jsonResponse({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      user: {
        id: 'user-1',
        email: 'test@example.com',
        app_metadata: { role: 'engineer' }
      }
    });
  }
  if (call.url.includes('/auth/v1/token?grant_type=refresh_token')) {
    return jsonResponse({
      access_token: 'access-token-2',
      refresh_token: 'refresh-token-2',
      expires_in: 7200,
      user: {
        id: 'user-1',
        email: 'test@example.com',
        app_metadata: { role: 'engineer' }
      }
    });
  }
  if (call.url.includes('/rest/v1/projects') && call.options.method === 'POST') {
    return jsonResponse({}, { status: 201 });
  }
  if (call.url.includes('/rest/v1/projects') && call.url.includes('select=name')) {
    return jsonResponse([{ name: 'Alpha' }, { name: 'Beta' }]);
  }
  if (call.url.includes('/rest/v1/projects') && call.url.includes('select=data')) {
    return jsonResponse([{ data: { meta: { version: 1 }, cables: [] } }]);
  }
  return jsonResponse({});
};

const {
  createAuthContextFromSupabaseSession,
  supabaseListProjects,
  supabaseLoadProject,
  supabaseRefreshSession,
  supabaseSaveProject,
  supabaseSignIn
} = await import('../src/supabaseBackend.js');

function check(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('supabase backend client');

let auth;

await checkAsync('signs in with Supabase password grant and normalizes session context', async () => {
  const session = await supabaseSignIn({ email: 'test@example.com', password: 'TestPass123!' });
  auth = createAuthContextFromSupabaseSession(session);
  assert.equal(auth.provider, 'supabase');
  assert.equal(auth.accessToken, 'access-token');
  assert.equal(auth.refreshToken, 'refresh-token');
  assert.equal(auth.user, 'test@example.com');
  assert.equal(auth.userId, 'user-1');
  assert.equal(auth.role, 'engineer');
});

check('sends anon key on auth requests', () => {
  const authCall = calls.find(call => call.url.includes('/auth/v1/token?grant_type=password'));
  assert.equal(authCall.options.headers.apikey, 'anon-key');
});

await checkAsync('upserts project rows with user_id conflict target', async () => {
  await supabaseSaveProject(auth, 'Alpha', { cables: [{ tag: 'C-1' }] });
  const saveCall = calls.find(call => call.options.method === 'POST' && call.url.includes('/rest/v1/projects'));
  assert.ok(saveCall.url.includes('on_conflict=user_id%2Cname'));
  assert.equal(saveCall.options.headers.Authorization, 'Bearer access-token');
  assert.equal(saveCall.options.headers.Prefer, 'resolution=merge-duplicates,return=minimal');
  const body = JSON.parse(saveCall.options.body);
  assert.equal(body.user_id, 'user-1');
  assert.equal(body.name, 'Alpha');
  assert.deepEqual(body.data.cables, [{ tag: 'C-1' }]);
});

await checkAsync('lists project names from Supabase REST', async () => {
  const names = await supabaseListProjects(auth);
  assert.deepEqual(names, ['Alpha', 'Beta']);
});

await checkAsync('loads a project data payload by name', async () => {
  const data = await supabaseLoadProject(auth, 'Alpha');
  assert.deepEqual(data, { meta: { version: 1 }, cables: [] });
});

await checkAsync('refreshes a Supabase session with refresh token', async () => {
  const session = await supabaseRefreshSession(auth);
  const refreshed = createAuthContextFromSupabaseSession(session);
  assert.equal(refreshed.accessToken, 'access-token-2');
  assert.equal(refreshed.refreshToken, 'refresh-token-2');
});
