# Website Gaps & Missing Functionality Audit

**Date:** 2026-03-16
**Scope:** Full website audit covering navigation, forms, accessibility, SEO, and code quality

---

## Executive Summary

The CableTrayRoute website is a mature, feature-complete electrical design platform. Accessibility and SEO are strong (9/10). The main gaps are: **inconsistent navigation across pages**, **missing signup password confirmation**, **excessive use of `alert()` for error handling**, and **silent error swallowing** in several modules.

---

## 1. Navigation Inconsistencies

### CRITICAL: Pages missing the Studies section in navigation

The dynamic navigation component (`src/components/navigation.js`) defines 21 routes across 5 sections, but several pages use hardcoded nav HTML that is out of sync:

| Page | Missing Links |
|------|--------------|
| `index.html` | TCC, Harmonics, Motor Start, Load Flow, Short Circuit, Arc Flash, Custom Components, Account |
| `help.html` | TCC, Harmonics, Motor Start, Load Flow, Short Circuit, Arc Flash, Custom Components, Account |
| `404.html` | TCC, Harmonics, Motor Start, Load Flow, Short Circuit, Arc Flash, Custom Components, Account |
| `500.html` | TCC, Harmonics, Motor Start, Load Flow, Short Circuit, Arc Flash, Custom Components, Account |

**Root cause:** These pages have manually-written nav HTML instead of using the shared `navigation.js` component. The 6 Studies pages and Custom Components are entirely absent from their nav bars.

### Medium: Orphaned / unlinked pages

- **`library.html`** - Exists and is in `sitemap.xml` but is NOT linked from any navigation menu
- **`account.html`** - In navigation.js but missing from `sitemap.xml`
- **`forgot-password.html`** and **`reset-password.html`** - Not in `sitemap.xml`

### Minor: Manifest / deployment path issues

- `manifest.json` uses absolute `start_url: "/index.html"` which may break in subdirectory deployments
- `robots.txt` sitemap URL hardcoded to `https://ee-twister.github.io/CableTrayRoute/sitemap.xml`

---

## 2. Forms & Authentication Gaps

### CRITICAL: Signup form missing password confirmation

**File:** `login.html` (lines 45-61)
The signup form has username and password fields but **no confirm-password field**. Users could mistype their password and be locked out. Compare with `account.html` and `reset-password.html` which both correctly include password confirmation.

### Medium: Login/signup buttons not disabled during submission

**File:** `auth.js`
The signup and login form handlers do not disable the submit button during the fetch request, allowing duplicate submissions. Compare with `account.js` (line 45) and `forgot-password.html` (line 89) which properly disable buttons during requests.

### Medium: No client-side username format validation

**File:** `login.html`
Username inputs lack an HTML `pattern` attribute. The server enforces `/^[a-zA-Z0-9_-]{1,100}$/` (`server.mjs` line 28), but users get a server error instead of immediate client feedback.

---

## 3. Error Handling Issues

### Alert-based error handling (should use modal dialogs)

Over **50 instances** of `alert()` used for error messages instead of the existing modal component:

| File | Count | Examples |
|------|-------|---------|
| `cabletrayfill.js` | 40+ | Various validation and routing errors |
| `src/panelSchedule.js` | 13 | Breaker configuration, circuit errors |
| `src/racewayschedule.js` | 1 | "Raceway tables not initialized" |
| `src/scenarios.js` | 1 | "No revisions" |
| `src/projectManager.js` | 1 | Generic error fallback |

### Silent error swallowing (empty catch blocks)

Multiple locations silently discard errors with `catch {}` or `catch(e) {}`:

| File | Count | Notes |
|------|-------|-------|
| `tableUtils.mjs` | 7 | Various parse/format operations |
| `src/projectManager.js` | 2 | Project state retrieval |
| `src/panelSchedule.js` | 1 | URL update |
| `src/racewayschedule.js` | 1 | E2E test cleanup (intentional) |
| `cableschedule.js` | ~5 | Session storage operations |
| `ductbankroute.js` | 2 | Session save/load |

### Console-only error reporting

Several modules log errors to `console.error()` without any user-facing feedback:

- `ductbankroute.js` - Session save/load failures, data loading errors
- `analysis/tcc.js` - Device data loading failures
- `exportPanelSchedule.js` - XLSX library not loaded

---

## 4. Accessibility & SEO (Score: 9/10)

### Strengths (well-implemented)

- Skip-to-content links on all pages
- Proper `<label>` and `aria-describedby` on forms
- Single `<h1>` per page with logical heading hierarchy
- `role="dialog"`, `aria-modal`, `aria-labelledby` on modals
- `role="progressbar"` with proper value attributes
- `:focus-visible` with blue ring + box-shadow on buttons
- `@media (prefers-reduced-motion: reduce)` disables all animations
- High-contrast theme with 21:1 ratio and gold focus rings
- `.visually-hidden` / `.sr-only` classes properly implemented
- 44px minimum touch targets on coarse pointer devices
- Dark mode respects `prefers-color-scheme` + manual override
- Comprehensive Open Graph, Twitter cards, canonical URLs, JSON-LD structured data
- Proper `<html lang="en">`, `<meta charset>`, `<meta viewport>`

### Minor issues

- Form label patterns vary (some use wrapping `<label>`, others use `for` attribute) - should standardize on explicit `for` pattern
- `og:image` uses relative paths that may not resolve correctly in all sharing contexts
- Help icon tooltips could add `aria-pressed` for toggle state indication

---

## 5. Feature Completeness

### All core modules fully implemented

- `src/panelSchedule.js` - Full implementation (2900+ lines)
- `src/racewayschedule.js` - Full implementation
- `src/conduitfill.js` - Wrapper delegating to main module (functional)
- `src/voltageDrop.js` - Full calculation logic
- `src/pullCalc.js` - Full cable tension calculations

### Intentional stubs (documented)

- `site.js:744` `initHistory()` - Empty no-op, retained to preserve external references. History/autosave removed to avoid localStorage quota issues (documented in comments).

### No TODO/FIXME markers found in `src/` files

---

## 6. Service Worker & PWA

- `sw.js` properly configured with network-first HTML strategy, API bypass, and offline fallback
- Precache list is minimal but covers critical shell assets
- `manifest.json` is comprehensive with shortcuts and maskable icons

---

## Prioritized Recommendations

### P0 - Critical

1. **Sync navigation across all pages** - Either render nav from `navigation.js` on all pages, or update hardcoded nav HTML in `index.html`, `help.html`, `404.html`, `500.html` to include Studies section and all 21 routes
2. **Add password confirmation to signup form** in `login.html` with matching validation in `auth.js`

### P1 - Important

3. **Disable submit buttons during auth requests** in `auth.js` to prevent duplicate submissions
4. **Add `pattern` attribute** to username inputs: `pattern="[a-zA-Z0-9_-]{1,100}"`
5. **Add `account.html` to `sitemap.xml`**
6. **Replace `alert()` calls with modal dialogs** in `cabletrayfill.js` and `src/panelSchedule.js` (50+ instances)

### P2 - Improvement

7. **Add logging to silent catch blocks** or document why they're intentionally empty
8. **Link `library.html`** from navigation or remove from sitemap
9. **Use relative paths** in `manifest.json` start_url for subdirectory deployment support
10. **Standardize form label pattern** to explicit `<label for="id">` across all pages
