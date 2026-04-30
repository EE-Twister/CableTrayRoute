import { validateLibraryPayload } from '../src/validation/librarySchema.mjs';

export const CLOUD_COMPONENT_LIBRARY_GOVERNANCE_VERSION = 'cloud-component-library-governance-v1';

const RELEASE_STATUSES = new Set(['draft', 'released', 'archived']);
const APPROVAL_STATUSES = new Set(['draft', 'pending', 'approved', 'revoked']);
const MERGE_MODES = new Set(['replace', 'merge']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(value = '') {
  return String(value ?? '').trim();
}

function normalizeStatus(value, allowed, fallback) {
  const normalized = stringValue(value || fallback).toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value = '') {
  let result = 2166136261;
  const input = String(value);
  for (let index = 0; index < input.length; index += 1) {
    result ^= input.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function makeId(prefix, parts = []) {
  return `${prefix}-${hash(stableStringify(parts))}`;
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeLibraryData(data = {}) {
  const source = asObject(data);
  return {
    categories: asArray(source.categories).map(stringValue).filter(Boolean),
    components: asArray(source.components).map(component => ({ ...asObject(component) })),
    icons: Object.fromEntries(Object.entries(asObject(source.icons)).map(([key, value]) => [stringValue(key), stringValue(value)]).filter(([key]) => key)),
  };
}

function summarizeLibraryData(data = {}) {
  const normalized = normalizeLibraryData(data);
  return {
    categoryCount: normalized.categories.length,
    componentCount: normalized.components.length,
    iconCount: Object.keys(normalized.icons).length,
  };
}

function componentKey(component = {}) {
  return stringValue(component.subtype || component.id || component.label).toLowerCase();
}

function diffMap(previousRows = [], nextRows = [], keyFn = row => row.id || row.key || row.name) {
  const previous = new Map(asArray(previousRows).map(row => [keyFn(row), row]).filter(([key]) => key));
  const next = new Map(asArray(nextRows).map(row => [keyFn(row), row]).filter(([key]) => key));
  const added = [];
  const removed = [];
  const changed = [];
  next.forEach((row, key) => {
    if (!previous.has(key)) {
      added.push(row);
      return;
    }
    const before = previous.get(key);
    if (stableStringify(before) !== stableStringify(row)) changed.push({ key, previous: before, next: row });
  });
  previous.forEach((row, key) => {
    if (!next.has(key)) removed.push(row);
  });
  return { added, removed, changed };
}

export function normalizeCloudLibraryDescriptor(input = {}) {
  const source = asObject(input);
  const workspaceId = stringValue(source.workspaceId || source.workspace || source.owner || 'personal-workspace') || 'personal-workspace';
  const descriptor = {
    id: stringValue(source.id) || makeId('cloud-library', [workspaceId, source.name || 'Organization Component Library']),
    version: stringValue(source.version || CLOUD_COMPONENT_LIBRARY_GOVERNANCE_VERSION),
    workspaceId,
    name: stringValue(source.name || 'Organization Component Library'),
    description: stringValue(source.description || ''),
    owner: stringValue(source.owner || source.createdBy || ''),
    activeReleaseId: stringValue(source.activeReleaseId || ''),
    createdAt: stringValue(source.createdAt || ''),
    updatedAt: stringValue(source.updatedAt || ''),
    warnings: asArray(source.warnings).map(stringValue).filter(Boolean),
    assumptions: asArray(source.assumptions).map(stringValue).filter(Boolean),
  };
  const warnings = [...descriptor.warnings];
  if (descriptor.version !== CLOUD_COMPONENT_LIBRARY_GOVERNANCE_VERSION) warnings.push(`Descriptor version ${descriptor.version || 'blank'} differs from ${CLOUD_COMPONENT_LIBRARY_GOVERNANCE_VERSION}.`);
  return {
    ...descriptor,
    warnings,
    assumptions: descriptor.assumptions.length ? descriptor.assumptions : [
      'Organization libraries are server-local governance records, not a hosted SaaS marketplace.',
      'Project libraries are updated only after explicit user adoption.',
    ],
  };
}

export function normalizeCloudLibraryRelease(input = {}) {
  const source = asObject(input);
  const data = normalizeLibraryData(source.data || source.library || {});
  const createdAt = stringValue(source.createdAt || '');
  const workspaceId = stringValue(source.workspaceId || source.workspace || 'personal-workspace') || 'personal-workspace';
  const releaseTag = stringValue(source.releaseTag || source.tag || source.versionTag || 'R1') || 'R1';
  const release = {
    id: stringValue(source.id) || makeId('cloud-library-release', [workspaceId, releaseTag, createdAt, data]),
    version: stringValue(source.version || CLOUD_COMPONENT_LIBRARY_GOVERNANCE_VERSION),
    workspaceId,
    name: stringValue(source.name || 'Organization Component Library Release'),
    releaseTag,
    status: normalizeStatus(source.status, RELEASE_STATUSES, 'draft'),
    createdAt,
    createdBy: stringValue(source.createdBy || source.author || ''),
    description: stringValue(source.description || ''),
    approvalStatus: normalizeStatus(source.approvalStatus || source.approvedStatus, APPROVAL_STATUSES, 'pending'),
    approvedBy: stringValue(source.approvedBy || ''),
    approvedAt: stringValue(source.approvedAt || ''),
    sourcePersonalVersion: stringValue(source.sourcePersonalVersion || source.personalVersion || ''),
    data,
    summary: summarizeLibraryData(data),
    validation: source.validation || null,
    diffFromPrevious: source.diffFromPrevious || null,
    warnings: asArray(source.warnings).map(stringValue).filter(Boolean),
    assumptions: asArray(source.assumptions).map(stringValue).filter(Boolean),
  };
  return {
    ...release,
    validation: release.validation || validateCloudLibraryRelease(release),
    assumptions: release.assumptions.length ? release.assumptions : [
      'Release governance is file-backed and local to this CableTrayRoute server.',
      'Approval metadata is an engineering governance marker, not formal document control.',
    ],
  };
}

export function validateCloudLibraryRelease(release = {}) {
  const normalized = {
    ...asObject(release),
    data: normalizeLibraryData(asObject(release).data || {}),
  };
  const errors = [];
  const warnings = [];
  if (normalized.version && normalized.version !== CLOUD_COMPONENT_LIBRARY_GOVERNANCE_VERSION) errors.push(`Unsupported cloud library governance version: ${normalized.version}.`);
  if (!stringValue(normalized.workspaceId)) errors.push('workspaceId is required.');
  if (!stringValue(normalized.name)) errors.push('release name is required.');
  if (!stringValue(normalized.releaseTag)) errors.push('releaseTag is required.');
  if (normalized.status && !RELEASE_STATUSES.has(stringValue(normalized.status).toLowerCase())) errors.push(`Invalid release status: ${normalized.status}.`);
  if (normalized.approvalStatus && !APPROVAL_STATUSES.has(stringValue(normalized.approvalStatus).toLowerCase())) errors.push(`Invalid approval status: ${normalized.approvalStatus}.`);
  const libraryValidation = validateLibraryPayload(normalized.data);
  libraryValidation.errors.forEach(entry => {
    const message = `${entry.path || 'library'}: ${entry.message}`;
    if (entry.severity === 'warning') warnings.push(message);
    else errors.push(message);
  });
  if (normalized.approvalStatus === 'approved' && !stringValue(normalized.approvedBy)) warnings.push('Approved releases should include approvedBy.');
  if (normalized.approvalStatus === 'approved' && !stringValue(normalized.approvedAt)) warnings.push('Approved releases should include approvedAt.');
  return {
    valid: errors.length === 0,
    status: errors.length ? 'fail' : warnings.length ? 'warn' : 'pass',
    errors,
    warnings,
  };
}

export function diffCloudLibraryReleases(previousRelease = null, nextRelease = null) {
  const previousData = normalizeLibraryData(asObject(previousRelease).data || previousRelease || {});
  const nextData = normalizeLibraryData(asObject(nextRelease).data || nextRelease || {});
  const categoryDiff = diffMap(
    previousData.categories.map(value => ({ value })),
    nextData.categories.map(value => ({ value })),
    row => row.value,
  );
  const componentDiff = diffMap(previousData.components, nextData.components, componentKey);
  const previousIcons = Object.entries(previousData.icons).map(([key, value]) => ({ key, value }));
  const nextIcons = Object.entries(nextData.icons).map(([key, value]) => ({ key, value }));
  const iconDiff = diffMap(previousIcons, nextIcons, row => row.key);
  return {
    categories: categoryDiff,
    components: componentDiff,
    icons: iconDiff,
    summary: {
      added: categoryDiff.added.length + componentDiff.added.length + iconDiff.added.length,
      removed: categoryDiff.removed.length + componentDiff.removed.length + iconDiff.removed.length,
      changed: categoryDiff.changed.length + componentDiff.changed.length + iconDiff.changed.length,
      addedComponents: componentDiff.added.length,
      removedComponents: componentDiff.removed.length,
      changedComponents: componentDiff.changed.length,
    },
  };
}

export function buildCloudLibraryAdoptionPreview({ projectLibrary = {}, release = {}, mergeMode = 'merge' } = {}) {
  const mode = MERGE_MODES.has(stringValue(mergeMode)) ? stringValue(mergeMode) : 'merge';
  const current = normalizeLibraryData(projectLibrary);
  const target = normalizeCloudLibraryRelease(release);
  const incoming = normalizeLibraryData(target.data);
  const conflicts = [];
  const currentComponents = new Map(current.components.map(component => [componentKey(component), component]).filter(([key]) => key));
  const nextComponents = new Map(currentComponents);
  incoming.components.forEach(component => {
    const key = componentKey(component);
    if (!key) return;
    if (mode === 'merge' && currentComponents.has(key) && stableStringify(currentComponents.get(key)) !== stableStringify(component)) {
      conflicts.push({ type: 'component', key, current: currentComponents.get(key), incoming: component });
    }
    nextComponents.set(key, component);
  });
  const mergedData = mode === 'replace'
    ? incoming
    : {
      categories: [...new Set([...current.categories, ...incoming.categories])],
      components: [...nextComponents.values()],
      icons: { ...current.icons, ...incoming.icons },
    };
  const diff = diffCloudLibraryReleases(current, mergedData);
  return {
    version: CLOUD_COMPONENT_LIBRARY_GOVERNANCE_VERSION,
    mergeMode: mode,
    releaseId: target.id,
    releaseTag: target.releaseTag,
    workspaceId: target.workspaceId,
    status: conflicts.length ? 'review' : 'ready',
    conflicts,
    diff,
    previewData: mergedData,
    summary: {
      conflictCount: conflicts.length,
      added: diff.summary.added,
      removed: diff.summary.removed,
      changed: diff.summary.changed,
      resultingComponentCount: mergedData.components.length,
    },
    warnings: [
      ...(target.approvalStatus !== 'approved' ? ['Selected organization library release is not approved.'] : []),
      ...(conflicts.length ? [`${conflicts.length} component subtype conflict(s) require review before adoption.`] : []),
    ],
    assumptions: [
      'Adoption preview does not mutate the current project library.',
      'Replace mode uses the release payload as the next project library; merge mode keeps local rows unless release rows share a subtype.',
    ],
  };
}

export function normalizeComponentLibrarySubscription(input = {}) {
  const source = asObject(input);
  return {
    workspaceId: stringValue(source.workspaceId || ''),
    libraryId: stringValue(source.libraryId || source.descriptorId || ''),
    releaseId: stringValue(source.releaseId || ''),
    releaseTag: stringValue(source.releaseTag || ''),
    pinnedVersion: stringValue(source.pinnedVersion || source.version || ''),
    adoptedAt: stringValue(source.adoptedAt || ''),
    adoptedBy: stringValue(source.adoptedBy || ''),
    mergeMode: MERGE_MODES.has(stringValue(source.mergeMode)) ? stringValue(source.mergeMode) : 'merge',
    lastDiffSummary: asObject(source.lastDiffSummary || {}),
    approvalStatus: stringValue(source.approvalStatus || ''),
    status: stringValue(source.status || ''),
  };
}

export function buildCloudLibraryGovernancePackage(context = {}) {
  const releases = asArray(context.releases || context.cloudLibraryReleases).map(normalizeCloudLibraryRelease)
    .sort((a, b) => `${b.createdAt}|${b.releaseTag}`.localeCompare(`${a.createdAt}|${a.releaseTag}`));
  const descriptor = normalizeCloudLibraryDescriptor(context.descriptor || {
    workspaceId: context.workspaceId || releases[0]?.workspaceId || 'personal-workspace',
    name: context.name || 'Organization Component Library',
    activeReleaseId: context.activeReleaseId || context.componentLibrarySubscription?.releaseId || '',
  });
  const subscription = normalizeComponentLibrarySubscription(context.subscription || context.componentLibrarySubscription || {});
  const activeRelease = releases.find(row => row.id === (subscription.releaseId || descriptor.activeReleaseId)) || releases.find(row => row.approvalStatus === 'approved') || releases[0] || null;
  const adoptionPreview = activeRelease ? buildCloudLibraryAdoptionPreview({
    projectLibrary: context.projectLibrary || context.currentLibrary || {},
    release: activeRelease,
    mergeMode: subscription.mergeMode || 'merge',
  }) : null;
  const validationRows = releases.map(row => ({
    id: `${row.id}-validation`,
    releaseId: row.id,
    releaseTag: row.releaseTag,
    status: row.validation.status,
    errorCount: asArray(row.validation.errors).length,
    warningCount: asArray(row.validation.warnings).length,
    detail: [...asArray(row.validation.errors), ...asArray(row.validation.warnings)].join('; '),
  }));
  const warningRows = [
    ...releases.flatMap(row => asArray(row.warnings).map((message, index) => ({ id: `${row.id}-warning-${index + 1}`, releaseId: row.id, severity: 'review', message }))),
    ...validationRows.filter(row => row.status !== 'pass').map(row => ({ id: `${row.releaseId}-validation-warning`, releaseId: row.releaseId, severity: row.status === 'fail' ? 'error' : 'warning', message: row.detail })),
    ...(subscription.releaseId && !releases.some(row => row.id === subscription.releaseId) ? [{ id: 'subscription-stale', releaseId: subscription.releaseId, severity: 'warning', message: 'Project is pinned to a cloud library release that is not available in the current workspace package.' }] : []),
    ...(!releases.length && (asArray(context.projectLibrary?.components).length || asArray(context.currentLibrary?.components).length) ? [{ id: 'personal-only-library', releaseId: '', severity: 'warning', message: 'Project uses a custom component library without an organization release record.' }] : []),
    ...(adoptionPreview?.conflicts?.length ? [{ id: 'adoption-conflicts', releaseId: activeRelease?.id || '', severity: 'warning', message: `${adoptionPreview.conflicts.length} adoption merge conflict(s) need review.` }] : []),
  ];
  return {
    version: CLOUD_COMPONENT_LIBRARY_GOVERNANCE_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName: context.projectName || 'Untitled Project',
    descriptor,
    releases,
    subscription,
    activeRelease,
    adoptionPreview,
    validationRows,
    warningRows,
    warnings: warningRows.map(row => row.message),
    assumptions: [
      'Organization component libraries are local server records with approval metadata.',
      'A public hosted marketplace and multi-tenant SaaS catalog are out of scope for V1.',
      'Adoption is explicit and review-only; project libraries are not overwritten automatically.',
    ],
    summary: {
      releaseCount: releases.length,
      approvedReleaseCount: releases.filter(row => row.approvalStatus === 'approved').length,
      draftReleaseCount: releases.filter(row => row.status === 'draft').length,
      validationFailureCount: validationRows.filter(row => row.status === 'fail').length,
      warningCount: warningRows.length,
      subscribed: Boolean(subscription.releaseId),
      activeReleaseTag: activeRelease?.releaseTag || '',
      adoptionConflictCount: adoptionPreview?.summary?.conflictCount || 0,
      status: validationRows.some(row => row.status === 'fail') ? 'action-required' : warningRows.length ? 'review' : releases.length ? 'ready' : 'not-run',
    },
  };
}

export function renderCloudLibraryGovernanceHTML(pkg = {}) {
  const summary = pkg.summary || {};
  return `<section class="report-section" id="rpt-cloud-component-library-governance">
  <h2>Cloud Component Library Governance</h2>
  <p class="report-note">Organization/workspace component library release records, approval basis, and project adoption state.</p>
  <dl class="report-dl">
    <dt>Workspace</dt><dd>${escapeHtml(pkg.descriptor?.workspaceId || '')}</dd>
    <dt>Releases</dt><dd>${escapeHtml(summary.releaseCount || 0)}</dd>
    <dt>Approved</dt><dd>${escapeHtml(summary.approvedReleaseCount || 0)}</dd>
    <dt>Active Release</dt><dd>${escapeHtml(summary.activeReleaseTag || '')}</dd>
    <dt>Status</dt><dd>${escapeHtml(summary.status || 'review')}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Release</th><th>Status</th><th>Approval</th><th>Author</th><th>Components</th><th>Validation</th></tr></thead>
      <tbody>${asArray(pkg.releases).length ? asArray(pkg.releases).map(row => `<tr>
        <td>${escapeHtml(row.releaseTag)} - ${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.approvalStatus)}</td>
        <td>${escapeHtml(row.createdBy)}</td>
        <td>${escapeHtml(row.summary?.componentCount || 0)}</td>
        <td>${escapeHtml(row.validation?.status || 'review')}</td>
      </tr>`).join('') : '<tr><td colspan="6">No organization library releases.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Check</th><th>Release</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${asArray(pkg.validationRows).length ? asArray(pkg.validationRows).map(row => `<tr>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(row.releaseTag)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('') : '<tr><td colspan="4">No validation rows.</td></tr>'}</tbody>
    </table>
  </div>
  ${asArray(pkg.warningRows).length ? `<h3>Warnings</h3><ul>${asArray(pkg.warningRows).map(row => `<li>${escapeHtml(row.message)}</li>`).join('')}</ul>` : ''}
</section>`;
}
