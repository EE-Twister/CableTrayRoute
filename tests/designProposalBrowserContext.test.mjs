import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

globalThis.window = {
  currentProjectId: 'default',
  location: { href: 'http://127.0.0.1:51362/designsynthesis.html', search: '' },
  navigator: { userAgent: 'Chrome' },
  addEventListener() {},
  dispatchEvent() {},
};

const store = await import('../dataStore.mjs');
const { generateDesignProposal } = await import('../analysis/designSynthesis.mjs');
const { previewDesignProposal } = await import('../src/design-synthesis/applyProposal.mjs');

test('browser unnamed/default identity cannot preview an applicable project context', () => {
  assert.equal(store.hasNamedProjectContext(), false);
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const proposal = generateDesignProposal(input);
  const preview = previewDesignProposal(proposal);
  assert.equal(preview.context.projectId, null);
  assert.ok(preview.errors.some(error => error.code === 'project_required'));
  assert.equal(preview.ok, false);
});

