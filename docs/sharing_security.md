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
- Saves through an editable link must name the version they replace (`baseVersion`); a missing or stale value returns `409`, so a link holder cannot overwrite changes the owner saved in the meantime.

## Token expiry

- Snapshot expiry follows `AUTH_TOKEN_TTL_MS`.
- `expiresAt` is returned in snapshot metadata responses.
- Expired snapshots are denied from `/shared/:token` with `404`.

## Rate limiting

- `/shared` routes are rate limited using the same request ceiling and reset window configuration as `/projects`.

## Opening a share link in the app

Share links open `oneline.html?snapshotToken=<token>` (any page works). When the page loads it:

1. Fetches the project through `GET /shared/:token`. An invalid, expired, or revoked link shows an explanation and nothing is changed.
2. Asks for confirmation before replacing the project open in this browser. A named project is saved under its own name first, and the shared project opens as `shared-<project>`, so opening a link never overwrites one of your saved projects.
3. Shows a banner with the project name, whether the link is editable or read-only, the live-collaboration status, and **Leave shared project**. Editable links also get **Save to shared project**, and saves made while editing are uploaded automatically after a short delay.
4. Starts live collaboration through `POST /ws/ticket/shared`. The shared session is remembered for the browser tab (session storage), so the banner and collaboration continue as you move between pages; **Leave shared project** ends it.

Read-only links can look around and change their own local copy, but nothing is sent back: the server refuses their saves and live patches. If the shared project changes on the server while you edit, your next save is refused with a conflict message and you reload the page to get the latest version; your local edits are not merged.
