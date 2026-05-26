# Website Gaps & Missing Functionality Audit

**Date:** 2026-05-26 (refresh of 2026-03-16 audit)
**Scope:** Full website audit covering navigation, forms, accessibility, SEO, error handling, component library, and code quality

---

## Executive Summary

The CableTrayRoute website has matured significantly since the previous audit. The Phase 0–6 refactors (PRs #1776–#1781) plus subsequent UX work closed every P0 and P1 item from the 2026-03-16 audit. Accessibility and SEO remain strong (9/10).

The remaining gaps are smaller in scope: a handful of silent `catch {}` blocks, a partial sitemap, one missing component type (`pv_array`), attribute holes in the component library, and the final acceptance-test rollout phase.

---

## What was fixed since 2026-03-16

| Previous audit item | Status | Evidence |
|---|---|---|
| P0 — Nav inconsistencies on `index.html` / `help.html` / `404.html` / `500.html` | ✅ Fixed | All four use the dynamic `<div id="nav-links">` placeholder populated by `src/components/navigation.js` via the `dist/index.*.js` bundle. |
| P0 — Signup form missing password confirmation | ✅ Fixed | `login.html:61-67` adds confirm field; `auth.js:18-34` validates match. |
| P1 — Submit buttons not disabled during auth | ✅ Fixed | `auth.js:62,79,89,112` disable in `try` / re-enable in `finally`. |
| P1 — Missing `pattern` attribute on username inputs | ✅ Fixed | `login.html:50,79` add `pattern="[a-zA-Z0-9_\-]{1,100}"`. |
| P1 — `account.html` missing from `sitemap.xml` | ✅ Fixed | `sitemap.xml:61`. |
| P1 — 50+ `alert()` calls in `cabletrayfill.js` / `src/panelSchedule.js` | ✅ Fixed | 0 `alert()` calls remain in either file. Only 1 occurrence in non-dist code, and it is a string literal (`ductbankroute.js:3154`) not a function call. |
| P2 — `manifest.json` used absolute `start_url` | ✅ Fixed | Now `./index.html`. |
| P2 — `library.html` not linked in nav | ✅ Fixed | `src/components/navigation.js:77` (Library section). |

---

## 1. Navigation

### State
All 88 root-level HTML pages either:
- Use the shared `<nav class="top-nav">` placeholder hydrated by `src/components/navigation.js`, OR
- Are intentionally standalone (`login.html`, `forgot-password.html`, `reset-password.html`, `oidc-relay.html`, `offline.html`).

`navigation.js` defines 85 routes across 6 sections (Home, Workflow, Studies, Library, Support) plus the admin-only `admin.html`.

### Minor gaps

- `robots.txt` `Sitemap:` directive is the GitHub Pages canonical URL. Per the sitemaps.org protocol the URL must be absolute, so it cannot be parameterized at runtime. A comment in `robots.txt` documents this and tells forks/mirrors to update it (added 2026-05-26).

---

## 2. Sitemap Coverage

`sitemap.xml` contains 64 `<loc>` entries. All publicly reachable pages are now indexed.

Intentionally excluded:
- `admin.html` — admin-only (gated by `adminOnly: true` in `src/components/navigation.js:84`). Excluding from the public sitemap avoids advertising the admin surface to crawlers.
- `login.html` is listed (entry point) but `forgot-password.html` / `reset-password.html` are kept at low priority (0.2) since they are transient flows.

Other correctly excluded pages: `oidc-relay.html`, `offline.html`, `500.html`.

---

## 3. Forms & Authentication

All previous P0/P1 form items are resolved. No outstanding gaps detected in the auth flow.

Minor observations (no action required):
- `forgot-password.html` and `reset-password.html` already use submit-button disable patterns.
- `account.html` requires the current password before changing it (`account.js:45`).

---

## 4. Error Handling

### Silent `catch {}` blocks (single-line)

All seven previously-silent single-line catches now carry a one-line
comment documenting why suppression is intentional (closed 2026-05-26):

| File | Line | Reason documented |
|---|---|---|
| `app.mjs` | 9 | DOM/window unavailable in test sandboxes; readiness flag is best-effort. |
| `ductbankroute.js` | 19 | Same as `app.mjs`. |
| `optimalRoute.js` | 94 | `sessionStorage` may throw in sandboxed/private contexts. |
| `oneline.js` | 5192 | Tour modal may detach between render and focus; tour still works without focus ring. |
| `projectStorage.js` | 960 | Already inside quota-recovery branch; failure means storage is fully unavailable. |
| `reports/labels.mjs` | 36 | Template fetch optional; inline default is the fallback. |
| `utils/safeEvents.mjs` | 7 | Defensive event dispatch — callers cannot act on dispatch failure in non-DOM contexts. |

### Multi-line catch blocks

~284 multi-line catch blocks across the non-test codebase. Most include `console.error` logging or user-facing modal messages; spot checks show no systemic silent-swallow pattern. Worth a targeted re-audit only if a specific incident traces back to one.

### Console-only error reporting

`console.error()` is widely used as the secondary log path with user-facing modals as the primary signal. No new console-only-with-no-UI-signal cases detected since the previous audit's `ductbankroute.js` / `analysis/tcc.js` callouts were resolved.

---

## 5. Component Library Gaps

Per `docs/component-gap-analysis.md` (2026-05-22 snapshot), `componentLibrary.json` covers 31 component types.

### Missing component type

- ~~`pv_array`~~ — ✅ Closed 2026-05-26. Added as DC source in `componentLibrary.json` with STC rating, module geometry, temperature coefficient, and design-irradiance fields. Wired into `oneline.js` palette category map (`sources`) and `scripts/componentCoverageAudit.mjs` DC-baseline set.

### Attribute coverage holes (baseline schema)

| Component type | Missing common attributes |
|---|---|
| `cable` | `size`, `insulation`, `ampacity`, `length` |
| `mcc` | `kw`, `efficiency`, `power_factor` |
| `motor` | `kw`, `efficiency`, `power_factor` |
| `panel` | `kw`, `kvar`, `demand_factor` |
| `switchboard` | `kw`, `kvar`, `demand_factor` |
| `generator` | `efficiency`, `power_factor` |
| `load` | `kw`, `demand_factor` |
| `breaker` / `fuse` / `recloser` | `time_dial` |

These are heuristic gaps from `scripts/componentCoverageAudit.mjs`. Each should be confirmed against the canonical schema in `analysis/componentBaseline.mjs` before bulk-filling.

---

## 6. Acceptance Testing

`docs/next-features-acceptance.md` rollout is complete through phase 7.

Phase 7 closed 2026-05-26: a new `acceptance-lanes` job in
`.github/workflows/ci.yml` runs the four next-features acceptance commands
(`e2e:next-features-cost`, `e2e:next-features-emf`,
`e2e:next-features-export`, `e2e:heat-trace`) on every push / PR after
build, using the same `dist` artifact as the critical E2E lane.
`docs/test-lanes.md` was extended with a CI workflow mapping table so the
lane-to-workflow relationship is documented in one place.

---

## 7. Accessibility & SEO (Score: 9/10)

Unchanged from the previous audit — all strengths preserved. Minor items remain:

- Form label patterns vary (some wrap, some use `for`). Not a regression.
- `og:image` uses absolute `https://cabletrayroute.com/icons/og-preview.png` consistently across pages — the previous audit's "relative paths" concern no longer applies.
- Help icon tooltips could add `aria-pressed` for toggle state.

---

## 8. Service Worker & PWA

`sw.js` and `manifest.json` configuration is unchanged and still correct. `manifest.json` now uses relative `start_url: "./index.html"`, addressing the previous deployment-path concern.

---

## Prioritized Recommendations

### P1 — Important

_None remaining._ All P1 items from the 2026-03-16 audit and the
follow-up refresh are closed.

### P2 — Improvement

1. **Fill component baseline attribute gaps** (cable / mcc / motor / panel / switchboard / generator / load / breaker / fuse / recloser). Cross-check against `analysis/componentBaseline.mjs` before edits.

### P3 — Polish

4. Standardize form label pattern across pages to explicit `<label for="id">`.
5. Add `aria-pressed` to help-icon toggle controls.
