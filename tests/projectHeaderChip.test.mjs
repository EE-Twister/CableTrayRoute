import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNoProjectSaveState, shouldShowCloudStatus } from '../src/components/navigation.js';
import { describeProjectSaveState } from '../src/projectSaveState.js';

describe('header project chip', () => {
  it('treats only saved and unsaved states as an open project', () => {
    assert.equal(isNoProjectSaveState({ state: 'unnamed' }), true);
    assert.equal(isNoProjectSaveState({ state: 'saved' }), false);
    assert.equal(isNoProjectSaveState({ state: 'unsaved' }), false);
    // Before the save-state tracker reports, the chip keeps its name.
    assert.equal(isNoProjectSaveState(null), false);
  });

  it('labels the no-project state once: "No project", with no cloud chip', () => {
    assert.equal(describeProjectSaveState({ state: 'unnamed' }).label, 'No project');
    const notSavedYet = { label: 'Not saved yet', state: 'dirty' };
    assert.equal(shouldShowCloudStatus(notSavedYet, { noProject: true }), false);
    assert.equal(shouldShowCloudStatus({ label: 'Synced', state: 'saved' }, { noProject: true }), false);
  });

  it('shows the cloud chip only for cloud results the local badge does not cover', () => {
    assert.equal(shouldShowCloudStatus({ label: 'Not saved yet', state: 'dirty' }), false);
    assert.equal(shouldShowCloudStatus({ label: 'Saved locally · 1/1/2026', state: 'local' }), false);
    assert.equal(shouldShowCloudStatus({ label: 'Synced', state: 'saved' }), true);
    assert.equal(shouldShowCloudStatus({ label: 'Save failed', state: 'error' }), true);
    assert.equal(shouldShowCloudStatus({ state: 'saved' }), false);
    assert.equal(shouldShowCloudStatus(null), false);
  });
});
