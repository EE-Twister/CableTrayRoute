# Sharing Snapshot Security

The server now supports project snapshot links with explicit access modes:

- **Read-only** links allow consumers to fetch project data through `/shared/:token`.
- **Editable** links allow both read and write access through `/shared/:token`.

## Security behavior

- Snapshot tokens are generated using cryptographic random bytes and persisted only as SHA-256 token hashes in `snapshots.json`.
- Authenticated users create, list, and revoke snapshots via:
  - `POST /projects/:project/snapshots`
  - `GET /projects/:project/snapshots`
  - `DELETE /projects/:project/snapshots/:snapshotId`
- Snapshot creation/revocation uses the existing server authentication model:
  - `Authorization: Bearer <token>`
  - `x-csrf-token: <csrf-token>` on mutating requests.
- Revoked snapshots are immediately denied (`404`).
- Read-only snapshots reject writes with `403`.

## Token expiry

- Snapshot expiry follows `AUTH_TOKEN_TTL_MS`.
- `expiresAt` is returned in snapshot metadata responses.
- Expired snapshots are denied from `/shared/:token` with `404`.

## Rate limiting

- `/shared` routes are rate limited using the same request ceiling and reset window configuration as `/projects`.
