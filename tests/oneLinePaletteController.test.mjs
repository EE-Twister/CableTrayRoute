import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectPaletteEntries,
  getPaletteIdentity,
  normalizePaletteCategory,
  paletteEntryMatchesFilter,
  selectPinnedPaletteEntries
} from '../src/one-line/paletteController.mjs';

describe('One-Line palette controller model', () => {
  it('normalizes layout-only categories into user-facing filters', () => {
    assert.equal(normalizePaletteCategory('bus'), 'equipment');
    assert.equal(normalizePaletteCategory('busway'), 'equipment');
    assert.equal(normalizePaletteCategory('panel'), 'equipment');
    assert.equal(normalizePaletteCategory('load'), 'load');
    assert.equal(normalizePaletteCategory(''), 'equipment');
  });

  it('collapses utility aliases and duplicate labels into one canonical entry', () => {
    const componentTypes = {
      sources: ['utility', 'utility_source', 'generator'],
      equipment: ['duplicate_generator', 'hidden_panel']
    };
    const componentMeta = {
      utility: { type: 'utility_source', subtype: 'utility', category: 'sources', label: 'Utility' },
      utility_source: { type: 'utility_source', subtype: 'utility_source', category: 'sources', label: 'Utility Source' },
      generator: { type: 'generator', subtype: 'generator', category: 'sources', label: 'Generator' },
      duplicate_generator: { type: 'generator_alt', subtype: 'duplicate_generator', category: 'equipment', label: 'Generator' },
      hidden_panel: { type: 'panel', subtype: 'hidden_panel', category: 'equipment', label: 'Panel', hidden: true }
    };

    const entries = collectPaletteEntries(componentTypes, componentMeta);
    assert.deepEqual(entries.map(entry => entry.subtype), ['utility', 'generator']);
    assert.equal(getPaletteIdentity('utility_source', componentMeta.utility_source), 'sources:utility');
  });

  it('orders favorites before recent entries and removes overlap or stale subtypes', () => {
    const entries = [
      { category: 'sources', subtype: 'utility', meta: { label: 'Utility' } },
      { category: 'load', subtype: 'motor', meta: { label: 'Motor' } },
      { category: 'cable', subtype: 'cable', meta: { label: 'Cable' } }
    ];
    const pinned = selectPinnedPaletteEntries(
      entries,
      ['motor', 'missing'],
      ['utility', 'motor', 'missing', 'cable']
    );

    assert.deepEqual(
      pinned.map(entry => [entry.subtype, entry.pinnedKind]),
      [['motor', 'favorite'], ['utility', 'recent'], ['cable', 'recent']]
    );
  });

  it('combines text, category, and common-component filters', () => {
    const motor = {
      label: 'Motor Load',
      subtype: 'motor_load',
      type: 'motor_load',
      category: 'load',
      filterCategory: 'load',
      common: '1'
    };
    assert.equal(paletteEntryMatchesFilter(motor, '', 'common'), true);
    assert.equal(paletteEntryMatchesFilter(motor, 'motor', 'load'), true);
    assert.equal(paletteEntryMatchesFilter(motor, 'load', 'equipment'), false);
    assert.equal(paletteEntryMatchesFilter(motor, 'transformer', 'all'), false);
  });
});
