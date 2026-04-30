import assert from 'node:assert/strict';
import {
  buildCloudLibraryAdoptionPreview,
  buildCloudLibraryGovernancePackage,
  diffCloudLibraryReleases,
  normalizeCloudLibraryDescriptor,
  normalizeCloudLibraryRelease,
  renderCloudLibraryGovernanceHTML,
  validateCloudLibraryRelease,
} from '../analysis/cloudComponentLibraryGovernance.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

const baseLibrary = {
  categories: ['power', 'protection'],
  components: [
    { subtype: 'switchboard', label: 'Switchboard', icon: 'swbd', category: 'power', ports: 2, schema: {} },
    { subtype: 'breaker', label: 'Breaker', icon: 'breaker', category: 'protection', ports: 2, schema: {} },
  ],
  icons: { swbd: 'icons/components/Switchboard.svg', breaker: 'icons/components/Breaker.svg' },
};

const nextLibrary = {
  categories: ['power', 'protection', 'metering'],
  components: [
    { subtype: 'switchboard', label: 'Switchboard Updated', icon: 'swbd', category: 'power', ports: 4, schema: {} },
    { subtype: 'meter', label: 'Meter', icon: 'meter', category: 'metering', ports: 1, schema: {} },
  ],
  icons: { swbd: 'icons/components/Switchboard.svg', meter: 'icons/components/Meter.svg' },
};

describe('Cloud component library governance helpers', () => {
  it('normalizes descriptors and releases with deterministic defaults', () => {
    const descriptor = normalizeCloudLibraryDescriptor({ workspaceId: 'plant-a', name: 'Plant A Library' });
    assert.equal(descriptor.workspaceId, 'plant-a');
    assert.equal(descriptor.name, 'Plant A Library');
    assert(descriptor.id.startsWith('cloud-library-'));

    const release = normalizeCloudLibraryRelease({
      workspaceId: 'plant-a',
      releaseTag: 'R2',
      name: 'Plant <A> Release',
      createdAt: '2026-04-28T10:00:00.000Z',
      data: baseLibrary,
    });
    assert.equal(release.workspaceId, 'plant-a');
    assert.equal(release.releaseTag, 'R2');
    assert.equal(release.summary.componentCount, 2);
    assert.equal(release.validation.status, 'pass');
    assert(release.id.startsWith('cloud-library-release-'));
  });

  it('validates duplicate components, missing icons/categories, schema shape, and approval state', () => {
    const invalid = validateCloudLibraryRelease({
      workspaceId: 'plant-a',
      releaseTag: 'bad',
      status: 'released',
      approvalStatus: 'not-valid',
      data: {
        categories: ['power', 'power'],
        components: [
          { subtype: 'breaker', label: 'Breaker', icon: '', category: 'power', schema: [] },
          { subtype: 'breaker', label: 'Breaker 2', icon: 'breaker', category: 'missing' },
        ],
        icons: { breaker: '' },
      },
    });
    assert.equal(invalid.valid, false);
    assert(invalid.errors.some(message => message.includes('Invalid approval status')));
    assert(invalid.errors.some(message => message.includes('Duplicate subtype')));
    assert(invalid.errors.some(message => message.includes('Duplicate category')));
    assert(invalid.errors.some(message => message.includes('icon is required')));
    assert(invalid.errors.some(message => message.includes('schema must be a JSON object')));
    assert(invalid.warnings.some(message => message.includes('category "missing"')));
  });

  it('diffs added, removed, and changed components, categories, and icons', () => {
    const diff = diffCloudLibraryReleases({ data: baseLibrary }, { data: nextLibrary });
    assert.equal(diff.summary.addedComponents, 1);
    assert.equal(diff.summary.removedComponents, 1);
    assert.equal(diff.summary.changedComponents, 1);
    assert(diff.categories.added.some(row => row.value === 'metering'));
    assert(diff.icons.removed.some(row => row.key === 'breaker'));
    assert(diff.icons.added.some(row => row.key === 'meter'));
  });

  it('builds adoption previews without mutating the current project library', () => {
    const projectLibrary = structuredClone(baseLibrary);
    const release = normalizeCloudLibraryRelease({
      workspaceId: 'plant-a',
      releaseTag: 'R3',
      approvalStatus: 'approved',
      approvedBy: 'Reviewer',
      approvedAt: '2026-04-28T11:00:00.000Z',
      data: nextLibrary,
    });
    const preview = buildCloudLibraryAdoptionPreview({
      projectLibrary,
      release,
      mergeMode: 'merge',
    });
    assert.equal(preview.status, 'review');
    assert.equal(preview.summary.conflictCount, 1);
    assert(preview.previewData.components.some(row => row.subtype === 'meter'));
    assert.deepEqual(projectLibrary, baseLibrary);

    const replacePreview = buildCloudLibraryAdoptionPreview({
      projectLibrary,
      release,
      mergeMode: 'replace',
    });
    assert.equal(replacePreview.status, 'ready');
    assert.equal(replacePreview.previewData.components.length, 2);
  });

  it('builds governance packages with release, subscription, warning, and validation summaries', () => {
    const release = normalizeCloudLibraryRelease({
      workspaceId: 'plant-a',
      releaseTag: 'R4',
      status: 'released',
      approvalStatus: 'approved',
      approvedBy: 'Reviewer',
      approvedAt: '2026-04-28T12:00:00.000Z',
      data: nextLibrary,
    });
    const pkg = buildCloudLibraryGovernancePackage({
      projectName: 'Plant A',
      workspaceId: 'plant-a',
      releases: [release],
      componentLibrarySubscription: { workspaceId: 'plant-a', releaseId: release.id, releaseTag: release.releaseTag, pinnedVersion: 'R4' },
      projectLibrary: baseLibrary,
      generatedAt: '2026-04-28T12:05:00.000Z',
    });
    assert.equal(pkg.summary.releaseCount, 1);
    assert.equal(pkg.summary.approvedReleaseCount, 1);
    assert.equal(pkg.summary.activeReleaseTag, 'R4');
    assert.equal(pkg.summary.subscribed, true);
    assert.equal(pkg.adoptionPreview.releaseId, release.id);
    assert(pkg.validationRows.length >= 1);
  });

  it('flags personal-only libraries and escapes rendered HTML', () => {
    const pkg = buildCloudLibraryGovernancePackage({
      workspaceId: 'plant-a',
      projectLibrary: {
        categories: ['x'],
        components: [{ subtype: 'x', label: 'X <custom>', icon: 'x', category: 'x', ports: 1, schema: {} }],
        icons: { x: 'icons/x.svg' },
      },
      releases: [],
    });
    assert(pkg.warningRows.some(row => row.id === 'personal-only-library'));
    const html = renderCloudLibraryGovernanceHTML({
      ...pkg,
      releases: [{
        releaseTag: 'R<5>',
        name: 'Library <Name>',
        status: 'released',
        approvalStatus: 'approved',
        createdBy: 'Author <A>',
        summary: { componentCount: 1 },
        validation: { status: 'pass' },
      }],
      warningRows: [{ message: 'Review <warning>' }],
    });
    assert(html.includes('R&lt;5&gt;'));
    assert(html.includes('Library &lt;Name&gt;'));
    assert(html.includes('Author &lt;A&gt;'));
    assert(html.includes('Review &lt;warning&gt;'));
    assert(!html.includes('Library <Name>'));
  });
});
