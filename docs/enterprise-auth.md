# Enterprise Authentication & Audit Log

CableTrayRoute supports OIDC single sign-on, role-based access control, and a tamper-evident audit log for enterprise deployments.

---

## Role-Based Access Control

Four roles are supported, in ascending privilege order:

| Role | Can read projects | Can save/delete projects | Can access admin panel |
|---|---|---|---|
| `read-only` | ✅ | ❌ | ❌ |
| `reviewer` | ✅ | ❌ | ❌ |
| `engineer` | ✅ | ✅ | ❌ |
| `admin` | ✅ | ✅ | ✅ |

New password-signup users are assigned the `engineer` role by default. OIDC-provisioned users are assigned `reviewer` by default (safer for new federated identities).

Roles are stored in `server_data/users.json`. An existing deployment can bootstrap an admin by editing that file directly before starting the server, or by using the Admin page once an admin account exists.

---

## Admin Panel

Navigate to **Support → Admin** (visible only to `admin` role users) to:

- View all users, their roles, auth method (Password or SSO), and last-login time
- Change any user's role (takes effect on their next login)
- Browse and filter the audit log
- Export the audit log as CSV

---

## Audit Log

Every CRUD operation on projects, login events, and role changes are appended to `server_data/auditLog.ndjson` (newline-delimited JSON).

Each entry contains:

| Field | Description |
|---|---|
| `id` | UUID for this entry |
| `ts` | ISO 8601 timestamp |
| `actor` | Username who performed the action |
| `action` | `CREATE`, `UPDATE`, `DELETE`, `READ_SENSITIVE`, `LOGIN`, `LOGOUT`, `ROLE_CHANGE` |
| `entityType` | `project`, `session`, `user`, etc. |
| `entityId` | ID of the affected entity |
| `projectId` | Project name (for project mutations) |
| `diff` | JSON-patch array for `ROLE_CHANGE` entries |
| `reqHash` | SHA-256 tamper-detection hash |

### Tamper detection

Each entry's `reqHash` is computed as `SHA-256("id|actor|ts|action|entityId")`. Any modification to a persisted entry will cause `verifyEntry(entry)` (from `analysis/auditLog.mjs`) to return `false`.

To verify the entire log:

```js
import { queryAuditLog, verifyEntry } from './analysis/auditLog.mjs';

const entries = await queryAuditLog('server_data/auditLog.ndjson');
const tampered = entries.filter(e => !verifyEntry(e));
if (tampered.length) {
  console.error('Tampered entries:', tampered.map(e => e.id));
}
```

---

## OIDC Single Sign-On

CableTrayRoute implements the OAuth 2.0 authorization code flow with PKCE (RFC 7636). No external library is required — the implementation uses Node.js built-in `crypto` and `fetch`.

### Supported identity providers

Any OIDC-compliant provider that supports:
- Authorization code flow
- PKCE (S256)
- `/.well-known/openid-configuration` discovery
- `userinfo` endpoint

Tested with: Microsoft Entra ID (Azure AD), Okta, Google Workspace, Keycloak.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `OIDC_ISSUER` | Yes | The provider's issuer URL, e.g. `https://login.microsoftonline.com/<tenant>/v2.0` |
| `OIDC_CLIENT_ID` | Yes | The application/client ID registered with the provider |
| `OIDC_CLIENT_SECRET` | Recommended | Client secret (omit only for public clients) |
| `OIDC_REDIRECT_URI` | Optional | Override the callback URL. Defaults to `<request origin>/auth/oidc/callback` |

### Setup steps

1. Register CableTrayRoute as an OIDC application in your IdP.
2. Set the redirect URI to `https://<your-domain>/auth/oidc/callback`.
3. Copy the client ID and secret.
4. Set the environment variables and start (or restart) the server.
5. The **Sign in with SSO** button will appear on the login page automatically.

### Just-in-time provisioning

When a user signs in via SSO for the first time, a new CableTrayRoute account is created automatically:
- Username is derived from the `email` claim's local part (e.g. `alice.smith` from `alice.smith@company.com`), sanitized to `[a-zA-Z0-9_-]`.
- A numeric suffix is appended if the derived username is already taken.
- The initial role is `reviewer`. Promote to `engineer` or `admin` via the Admin panel.

On subsequent logins, the existing account is reused (matched by the OIDC `sub` claim).

### OIDC routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/oidc/login` | Initiates the authorization code flow; redirects to IdP |
| `GET` | `/auth/oidc/callback` | Receives the code from IdP; provisions user; redirects to `/oidc-relay.html` |
| `POST` | `/auth/oidc/logout` | Revokes the server-side session (requires auth + CSRF) |

All three routes are rate-limited to 20 requests per window (same window as other auth endpoints).

---

## API endpoints

### `GET /api/v1/admin/users`

Requires: `admin` role.

Returns the list of all users with their role, email, auth type, creation date, and last-login date.

```json
{
  "users": [
    {
      "username": "alice",
      "role": "engineer",
      "email": "alice@example.com",
      "createdAt": "2026-05-01T10:00:00.000Z",
      "lastLogin": "2026-05-06T08:30:00.000Z",
      "oidc": false
    }
  ]
}
```

### `PATCH /api/v1/admin/users/:username/role`

Requires: `admin` role + CSRF token.

Body: `{ "role": "engineer" }` — valid values: `read-only`, `reviewer`, `engineer`, `admin`.

Returns: `{ "username": "alice", "role": "engineer" }`

### `GET /api/v1/admin/audit-log`

Requires: `admin` role.

Query parameters:

| Parameter | Description |
|---|---|
| `actor` | Filter by username |
| `action` | Filter by action type |
| `entityType` | Filter by entity type |
| `after` | Unix timestamp ms — return entries after this time |
| `before` | Unix timestamp ms — return entries before this time |
| `limit` | Max entries to return (default 200, max 500) |

Returns: `{ "entries": [...], "total": <count> }`
