import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_VIEW_ATTRIBUTE_COUNT,
  MAX_VIEW_ATTRIBUTE_LENGTH,
  datablockFormatLabels,
  datablockFormatPresets,
  drawingModeLabels,
  isKnownOption,
  sanitizeViewAttributeKey,
  sanitizeViewAttributeList
} from '../src/one-line/viewSettingsModel.mjs';

describe('One-Line view settings model', () => {
  it('accepts only stored options that exist in the label table', () => {
    assert.equal(isKnownOption(drawingModeLabels, 'edit'), true);
    assert.equal(isKnownOption(drawingModeLabels, 'engineeringPrint'), true);
    assert.equal(isKnownOption(drawingModeLabels, 'toString'), false, 'prototype keys are not options');
    assert.equal(isKnownOption(drawingModeLabels, null), false);
    assert.equal(isKnownOption(drawingModeLabels, 'unknown'), false);
  });

  it('gives every datablock preset a menu label', () => {
    Object.keys(datablockFormatPresets).forEach(key => assert.ok(isKnownOption(datablockFormatLabels, key), key));
  });

  it('trims attribute keys and rejects blank, non-string, and over-long keys', () => {
    assert.equal(sanitizeViewAttributeKey('  voltage '), 'voltage');
    assert.equal(sanitizeViewAttributeKey(''), '');
    assert.equal(sanitizeViewAttributeKey(42), '');
    assert.equal(sanitizeViewAttributeKey('x'.repeat(MAX_VIEW_ATTRIBUTE_LENGTH + 1)), '');
  });

  it('de-duplicates, caps, and sorts stored attribute lists', () => {
    assert.deepEqual(sanitizeViewAttributeList(['kva', ' voltage', 'kva', '', null]), ['kva', 'voltage']);
    assert.deepEqual(sanitizeViewAttributeList('voltage'), []);
    const many = Array.from({ length: MAX_VIEW_ATTRIBUTE_COUNT + 10 }, (_, index) => `k${index}`);
    assert.equal(sanitizeViewAttributeList(many).length, MAX_VIEW_ATTRIBUTE_COUNT);
  });
});
