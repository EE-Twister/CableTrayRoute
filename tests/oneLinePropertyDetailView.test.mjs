import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPropertyDetailRenderer } from '../src/one-line/propertyDetailView.mjs';

describe('One-Line property detail view', () => {
  it('renders the empty selection state without invoking domain adapters', () => {
    const children = [];
    const propertyContainer = {
      innerHTML: 'old',
      classList: { remove: () => {} },
      appendChild: child => children.push(child)
    };
    const propertyHeading = { textContent: '' };
    const modal = { _applyChanges: () => {} };
    const renderProperties = createPropertyDetailRenderer({
      documentRef: {
        createElement: tagName => ({ tagName, className: '', textContent: '' })
      },
      modal,
      propertyContainer,
      propertyHeading
    });
    renderProperties(null);
    assert.equal(propertyContainer.innerHTML, '');
    assert.equal(propertyHeading.textContent, 'Properties');
    assert.equal(children[0].className, 'prop-property-empty view-modal-empty');
    assert.equal(children[0].textContent, 'Select a device to view its properties.');
    assert.equal(modal._applyChanges, null);
  });
});
