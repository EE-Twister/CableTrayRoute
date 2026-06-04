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
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
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
        user_metadata: { username: 'designer01' },
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
  if (call.url.includes('/auth/v1/signup')) {
    return jsonResponse({
      message: 'For security purposes, you can only request this after 54 seconds.'
    }, { ok: false, status: 429 });
  }
  if (call.url.includes('/auth/v1/resend')) {
    return jsonResponse({ message: 'Confirmation email sent.' });
  }
  if (call.url.includes('/auth/v1/logout')) {
    return jsonResponse({});
  }
  if (call.url.includes('/auth/v1/user')) {
    const body = JSON.parse(call.options.body || '{}');
    if (body.password) {
      return jsonResponse({ user: { id: 'user-1' } });
    }
    return jsonResponse({
      id: 'user-1',
      email: body.email || 'test@example.com',
      user_metadata: body.data || {}
    });
  }
  if (call.url.includes('/rest/v1/account_deletion_requests') && call.options.method === 'POST') {
    const body = JSON.parse(call.options.body || '{}');
    return jsonResponse([{
      id: 'delete-request-1',
      user_id: body.user_id,
      status: body.status,
      requested_at: body.requested_at
    }]);
  }
  if (call.url.includes('/rest/v1/account_deletion_requests') && call.options.method === 'PATCH') {
    const body = JSON.parse(call.options.body || '{}');
    return jsonResponse([{
      id: 'delete-request-1',
      user_id: 'user-1',
      email: 'test@example.com',
      status: body.status,
      updated_at: body.updated_at
    }]);
  }
  if (call.url.includes('/rest/v1/account_deletion_requests') && call.url.includes('select=')) {
    return jsonResponse([{
      id: 'delete-request-1',
      user_id: 'user-1',
      email: 'test@example.com',
      status: 'requested',
      reason: null,
      requested_at: '2026-06-04T12:00:00.000Z',
      updated_at: '2026-06-04T12:00:00.000Z'
    }]);
  }
  if (call.url.includes('/rest/v1/projects') && call.options.method === 'POST') {
    return jsonResponse({}, { status: 201 });
  }
  if (call.url.includes('/rest/v1/projects') && call.url.includes('select=name%2Ccreated_at%2Cupdated_at')) {
    return jsonResponse([
      { name: 'Beta', created_at: '2026-06-03T12:00:00.000Z', updated_at: '2026-06-04T12:00:00.000Z' },
      { name: 'Alpha', created_at: '2026-06-01T12:00:00.000Z', updated_at: '2026-06-02T12:00:00.000Z' }
    ]);
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
  SupabaseRequestError,
  supabaseAdminListAccountDeletionRequests,
  supabaseAdminUpdateAccountDeletionRequest,
  supabaseListAccountDeletionRequests,
  supabaseDeleteProject,
  supabaseListProjects,
  supabaseListProjectSummaries,
  supabaseLoadProject,
  supabaseRefreshSession,
  supabaseResendEmailConfirmation,
  supabaseRequestAccountDeletion,
  supabaseSaveProject,
  supabaseSignIn,
  supabaseSignOut,
  supabaseSignUp,
  supabaseUpdateProfile
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
  assert.equal(auth.user, 'designer01');
  assert.equal(auth.email, 'test@example.com');
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
  const listCall = calls.find(call => call.url.includes('/rest/v1/projects') && call.url.includes('select=name') && call.url.includes('order=name.asc'));
  const params = new URL(listCall.url).searchParams;
  assert.equal(params.get('user_id'), 'eq.user-1');
  assert.equal(params.get('select'), 'name');
});

await checkAsync('lists project summaries scoped to the signed-in user', async () => {
  const summaries = await supabaseListProjectSummaries(auth);
  assert.deepEqual(summaries, [
    {
      name: 'Beta',
      createdAt: '2026-06-03T12:00:00.000Z',
      updatedAt: '2026-06-04T12:00:00.000Z',
      source: 'cloud'
    },
    {
      name: 'Alpha',
      createdAt: '2026-06-01T12:00:00.000Z',
      updatedAt: '2026-06-02T12:00:00.000Z',
      source: 'cloud'
    }
  ]);
  const summaryCall = calls.find(call => call.url.includes('/rest/v1/projects') && call.url.includes('select=name%2Ccreated_at%2Cupdated_at'));
  const params = new URL(summaryCall.url).searchParams;
  assert.equal(params.get('user_id'), 'eq.user-1');
  assert.equal(params.get('order'), 'updated_at.desc');
});

await checkAsync('loads a project data payload by name', async () => {
  const data = await supabaseLoadProject(auth, 'Alpha');
  assert.deepEqual(data, { meta: { version: 1 }, cables: [] });
  const loadCall = calls.find(call => call.url.includes('/rest/v1/projects') && call.url.includes('select=data'));
  const params = new URL(loadCall.url).searchParams;
  assert.equal(params.get('name'), 'eq.Alpha');
  assert.equal(params.get('user_id'), 'eq.user-1');
});

await checkAsync('deletes projects with the signed-in user filter', async () => {
  await supabaseDeleteProject(auth, 'Alpha');
  const deleteCall = calls.find(call => call.url.includes('/rest/v1/projects') && call.options.method === 'DELETE');
  const params = new URL(deleteCall.url).searchParams;
  assert.equal(params.get('name'), 'eq.Alpha');
  assert.equal(params.get('user_id'), 'eq.user-1');
});

await checkAsync('refreshes a Supabase session with refresh token', async () => {
  const session = await supabaseRefreshSession(auth);
  const refreshed = createAuthContextFromSupabaseSession(session);
  assert.equal(refreshed.accessToken, 'access-token-2');
  assert.equal(refreshed.refreshToken, 'refresh-token-2');
});

await checkAsync('updates profile username and email through signed-in user endpoint', async () => {
  const result = await supabaseUpdateProfile(auth, {
    username: 'lead_designer',
    email: 'lead@example.com'
  });
  const updateCall = calls.find(call => call.url.includes('/auth/v1/user') && call.options.method === 'PUT');
  assert.equal(updateCall.options.headers.Authorization, 'Bearer access-token');
  const body = JSON.parse(updateCall.options.body);
  assert.equal(body.email, 'lead@example.com');
  assert.equal(body.data.username, 'lead_designer');
  assert.equal(result.email, 'lead@example.com');
  assert.equal(result.user_metadata.username, 'lead_designer');
});

await checkAsync('resends hosted account confirmation by email', async () => {
  await supabaseResendEmailConfirmation('lead@example.com');
  const resendCall = calls.find(call => call.url.includes('/auth/v1/resend'));
  assert.equal(resendCall.options.method, 'POST');
  assert.equal(resendCall.options.headers.apikey, 'anon-key');
  const body = JSON.parse(resendCall.options.body);
  assert.equal(body.type, 'signup');
  assert.equal(body.email, 'lead@example.com');
});

await checkAsync('supports global Supabase logout scope', async () => {
  await supabaseSignOut(auth, { scope: 'global' });
  const logoutCall = calls.find(call => call.url.includes('/auth/v1/logout?scope=global'));
  assert.equal(logoutCall.options.method, 'POST');
  assert.equal(logoutCall.options.headers.Authorization, 'Bearer access-token');
});

await checkAsync('submits and reads account deletion requests through RLS table', async () => {
  const request = await supabaseRequestAccountDeletion(auth);
  const requestCall = calls.find(call => call.url.includes('/rest/v1/account_deletion_requests') && call.options.method === 'POST');
  assert.equal(requestCall.options.headers.Authorization, 'Bearer access-token');
  assert.equal(requestCall.options.headers.Prefer, 'return=representation');
  const body = JSON.parse(requestCall.options.body);
  assert.equal(body.user_id, 'user-1');
  assert.equal(body.email, 'test@example.com');
  assert.equal(body.status, 'requested');
  assert.equal(request.status, 'requested');

  const latest = await supabaseListAccountDeletionRequests(auth);
  const listCall = calls.find(call => call.url.includes('/rest/v1/account_deletion_requests') && call.url.includes('select='));
  assert.equal(listCall.options.headers.Authorization, 'Bearer access-token');
  assert.equal(latest.status, 'requested');
});

await checkAsync('allows hosted admins to review and update deletion requests', async () => {
  const adminAuth = { ...auth, role: 'admin' };
  const requests = await supabaseAdminListAccountDeletionRequests(adminAuth, { status: 'requested', limit: 25 });
  const adminListCall = calls.find(call =>
    call.url.includes('/rest/v1/account_deletion_requests') &&
    call.url.includes('status=eq.requested') &&
    call.url.includes('limit=25')
  );
  assert.equal(adminListCall.options.headers.Authorization, 'Bearer access-token');
  assert.equal(requests[0].email, 'test@example.com');

  const updated = await supabaseAdminUpdateAccountDeletionRequest(adminAuth, 'delete-request-1', 'reviewing');
  const adminUpdateCall = calls.find(call =>
    call.url.includes('/rest/v1/account_deletion_requests') &&
    call.options.method === 'PATCH'
  );
  assert.equal(adminUpdateCall.options.headers.Authorization, 'Bearer access-token');
  assert.equal(adminUpdateCall.options.headers.Prefer, 'return=representation');
  assert.ok(adminUpdateCall.url.includes('id=eq.delete-request-1'));
  const body = JSON.parse(adminUpdateCall.options.body);
  assert.equal(body.status, 'reviewing');
  assert.equal(updated.status, 'reviewing');
});

await checkAsync('blocks non-admin deletion request review helpers before REST calls', async () => {
  await assert.rejects(
    () => supabaseAdminListAccountDeletionRequests(auth),
    /Admin role required/
  );
});

await checkAsync('preserves Supabase signup rate-limit metadata', async () => {
  await assert.rejects(
    () => supabaseSignUp({ email: 'rate-limited@example.com', password: 'TestPass123!', username: 'designer01' }),
    err => {
      assert.ok(err instanceof SupabaseRequestError);
      assert.equal(err.status, 429);
      assert.equal(err.retryAfterSeconds, 54);
      assert.match(err.message, /only request this after 54 seconds/i);
      return true;
    }
  );
  const signupCall = calls.find(call => call.url.includes('/auth/v1/signup'));
  const body = JSON.parse(signupCall.options.body);
  assert.equal(body.data.username, 'designer01');
});
