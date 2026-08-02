/**
 * Unit tests for Gap #50 – Protection Zone Overlay on the One-Line Diagram.
 *
 * These tests exercise the pure logic functions extracted from oneline.js
 * without requiring a DOM or SVG environment.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PROTECTION_ZONE_COLORS as ZONE_COLORS,
  computeProtectionZoneBounds as computeZoneBounds,
  createProtectionZone,
  deleteProtectionZone,
  getProtectionZones,
  renameProtectionZone,
  setProtectionZoneColor as setZoneColor,
  setProtectionZoneVisibility as setZoneVisibility,
  toggleProtectionZoneComponent as toggleComponentInZone,
} from '../src/one-line/protectionZones.mjs';

function makeSheet() {
  return { name: 'Sheet 1', components: [], connections: [], layers: [] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Protection Zone – CRUD operations', () => {

  it('createProtectionZone creates a zone with unique ID, default name, color, empty componentIds', () => {
    const sheet = makeSheet();
    const zone = createProtectionZone(sheet, '');
    assert.ok(zone.id.startsWith('zone_'), 'id should start with zone_');
    assert.equal(zone.name, 'Zone 1');
    assert.ok(ZONE_COLORS.includes(zone.color), 'color should be from palette');
    assert.deepEqual(zone.componentIds, []);
    assert.equal(zone.visible, true);
    assert.equal(getProtectionZones(sheet).length, 1);
  });

  it('createProtectionZone uses provided name when given', () => {
    const sheet = makeSheet();
    const zone = createProtectionZone(sheet, 'Feeder A');
    assert.equal(zone.name, 'Feeder A');
  });

  it('createProtectionZone cycles through color palette for successive zones', () => {
    const sheet = makeSheet();
    const colors = [];
    for (let i = 0; i < ZONE_COLORS.length + 2; i++) {
      colors.push(createProtectionZone(sheet, `Zone ${i + 1}`).color);
    }
    assert.equal(colors[0], ZONE_COLORS[0]);
    assert.equal(colors[ZONE_COLORS.length], ZONE_COLORS[0], 'palette wraps around');
  });

  it('deleteProtectionZone removes the zone from the array', () => {
    const sheet = makeSheet();
    const z1 = createProtectionZone(sheet, 'Z1');
    createProtectionZone(sheet, 'Z2');
    assert.equal(getProtectionZones(sheet).length, 2);
    const result = deleteProtectionZone(sheet, z1.id);
    assert.equal(result, true);
    assert.equal(getProtectionZones(sheet).length, 1);
    assert.equal(getProtectionZones(sheet)[0].name, 'Z2');
  });

  it('deleteProtectionZone is a no-op for an unknown zone ID', () => {
    const sheet = makeSheet();
    createProtectionZone(sheet, 'Z1');
    const result = deleteProtectionZone(sheet, 'zone_nonexistent');
    assert.equal(result, false);
    assert.equal(getProtectionZones(sheet).length, 1);
  });

  it('renameProtectionZone updates the zone name', () => {
    const sheet = makeSheet();
    const zone = createProtectionZone(sheet, 'Old Name');
    const result = renameProtectionZone(sheet, zone.id, 'New Name');
    assert.equal(result, true);
    assert.equal(zone.name, 'New Name');
  });

  it('renameProtectionZone rejects an empty string', () => {
    const sheet = makeSheet();
    const zone = createProtectionZone(sheet, 'Original');
    const result = renameProtectionZone(sheet, zone.id, '   ');
    assert.equal(result, false);
    assert.equal(zone.name, 'Original');
  });

  it('setZoneVisibility toggles the visible flag', () => {
    const sheet = makeSheet();
    const zone = createProtectionZone(sheet, 'Z');
    assert.equal(zone.visible, true);
    setZoneVisibility(sheet, zone.id, false);
    assert.equal(zone.visible, false);
    setZoneVisibility(sheet, zone.id, true);
    assert.equal(zone.visible, true);
  });

  it('setZoneColor updates the color string', () => {
    const sheet = makeSheet();
    const zone = createProtectionZone(sheet, 'Z');
    setZoneColor(sheet, zone.id, '#abcdef');
    assert.equal(zone.color, '#abcdef');
  });

  it('toggleComponentInZone adds a compId when absent, removes when present', () => {
    const sheet = makeSheet();
    const zone = createProtectionZone(sheet, 'Z');
    toggleComponentInZone(sheet, zone.id, 'n1');
    assert.deepEqual(zone.componentIds, ['n1']);
    toggleComponentInZone(sheet, zone.id, 'n2');
    assert.deepEqual(zone.componentIds, ['n1', 'n2']);
    toggleComponentInZone(sheet, zone.id, 'n1');
    assert.deepEqual(zone.componentIds, ['n2']);
  });

  it('getProtectionZones initialises an empty array when the property is missing', () => {
    const sheet = makeSheet();
    assert.equal(sheet.protectionZones, undefined);
    const zones = getProtectionZones(sheet);
    assert.ok(Array.isArray(zones));
    assert.equal(zones.length, 0);
    assert.ok(sheet.protectionZones !== undefined, 'property should now exist on sheet');
  });

});

describe('Protection Zone – Bounding Box Computation', () => {

  it('computeZoneBounds covers all assigned components with padding', () => {
    const sheet = makeSheet();
    const zone = createProtectionZone(sheet, 'Z');
    toggleComponentInZone(sheet, zone.id, 'n1');
    toggleComponentInZone(sheet, zone.id, 'n2');

    const components = [
      { id: 'n1', x: 100, y: 200, width: 50, height: 50 },
      { id: 'n2', x: 300, y: 150, width: 60, height: 60 }
    ];

    const pad = 12;
    const bounds = computeZoneBounds(zone, components, pad);
    assert.ok(bounds !== null);
    // minX = 100, minY = 150, maxX = 360, maxY = 250
    assert.equal(bounds.x, 100 - pad);
    assert.equal(bounds.y, 150 - pad);
    assert.equal(bounds.width, (360 - 100) + pad * 2);
    assert.equal(bounds.height, (250 - 150) + pad * 2);
  });

  it('computeZoneBounds returns null when all componentIds are orphaned (not in component list)', () => {
    const sheet = makeSheet();
    const zone = createProtectionZone(sheet, 'Z');
    toggleComponentInZone(sheet, zone.id, 'ghost1');
    toggleComponentInZone(sheet, zone.id, 'ghost2');

    const bounds = computeZoneBounds(zone, [], 12);
    assert.equal(bounds, null);
  });

  it('computeZoneBounds uses default dimensions for components without width/height', () => {
    const sheet = makeSheet();
    const zone = createProtectionZone(sheet, 'Z');
    toggleComponentInZone(sheet, zone.id, 'n1');

    const components = [{ id: 'n1', x: 50, y: 80 }]; // no width/height
    const pad = 12;
    const bounds = computeZoneBounds(zone, components, pad);
    assert.ok(bounds !== null);
    // default 50×50 box
    assert.equal(bounds.x, 50 - pad);
    assert.equal(bounds.y, 80 - pad);
    assert.equal(bounds.width, 50 + pad * 2);
    assert.equal(bounds.height, 50 + pad * 2);
  });

  it('two zones with overlapping components compute independent bounding boxes', () => {
    const sheet = makeSheet();
    const zA = createProtectionZone(sheet, 'A');
    const zB = createProtectionZone(sheet, 'B');
    toggleComponentInZone(sheet, zA.id, 'n1');
    toggleComponentInZone(sheet, zA.id, 'n2');
    toggleComponentInZone(sheet, zB.id, 'n2'); // shared component
    toggleComponentInZone(sheet, zB.id, 'n3');

    const components = [
      { id: 'n1', x: 0,   y: 0,   width: 50, height: 50 },
      { id: 'n2', x: 100, y: 100, width: 50, height: 50 },
      { id: 'n3', x: 300, y: 300, width: 50, height: 50 }
    ];

    const boundsA = computeZoneBounds(zA, components, 0);
    const boundsB = computeZoneBounds(zB, components, 0);
    assert.ok(boundsA !== null);
    assert.ok(boundsB !== null);
    // Zone A: covers n1 (0-50) and n2 (100-150)
    assert.equal(boundsA.x, 0);
    assert.equal(boundsA.width, 150);
    // Zone B: covers n2 (100-150) and n3 (300-350)
    assert.equal(boundsB.x, 100);
    assert.equal(boundsB.width, 250);
  });

});

describe('Protection Zone – Data Persistence', () => {

  it('zone data round-trips through JSON stringify/parse without loss', () => {
    const sheet = makeSheet();
    const zone = createProtectionZone(sheet, 'Feeder Zone');
    toggleComponentInZone(sheet, zone.id, 'n1');
    toggleComponentInZone(sheet, zone.id, 'n2');
    setZoneColor(sheet, zone.id, '#ff0000');
    setZoneVisibility(sheet, zone.id, false);

    const serialized = JSON.stringify(sheet);
    const restored = JSON.parse(serialized);

    assert.ok(Array.isArray(restored.protectionZones));
    assert.equal(restored.protectionZones.length, 1);
    const rz = restored.protectionZones[0];
    assert.equal(rz.id, zone.id);
    assert.equal(rz.name, 'Feeder Zone');
    assert.equal(rz.color, '#ff0000');
    assert.equal(rz.visible, false);
    assert.deepEqual(rz.componentIds, ['n1', 'n2']);
  });

});
