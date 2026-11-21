# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting for this repository (Security tab, "Report a vulnerability") and include:

- the affected page, route, or file;
- steps to reproduce, and the version or commit you tested;
- the impact you observed.

You will get an acknowledgement, and a fix or mitigation plan once the report is triaged.

## Scope

In scope: the bundled Express server (`server.mjs`: authentication, sessions, CSRF protection, project and library storage, sharing, collaboration WebSocket, OIDC sign-in) and the browser application.

Out of scope: results of engineering calculations. Study outputs are screening aids and are not a substitute for review by a licensed engineer; report calculation errors as ordinary issues.

## Security design notes

See [Secure Authentication & API Hardening](README.md#secure-authentication--api-hardening), [docs/api-reference.md](docs/api-reference.md), [docs/enterprise-auth.md](docs/enterprise-auth.md), and [docs/sharing_security.md](docs/sharing_security.md) for how sessions, CSRF tokens, rate limiting, and share links work.
