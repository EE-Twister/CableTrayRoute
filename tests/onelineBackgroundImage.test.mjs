/**
 * Unit tests for Gap #52 – Background Image / Site Plan Underlay.
 *
 * These tests exercise the pure logic functions mirroring oneline.js behaviour
 * without requiring a DOM environment.
 */

import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Pure helper functions mirroring oneline.js logic for testability
// ---------------------------------------------------------------------------

/** Create a minimal sheet object, optionally with a background image. */
function makeSheet(name = 'Sheet 1', backgroundImage = undefined) {
  const sheet = { name, components: [], connections: [], layers: [] };
  if (backgroundImage !== undefined) sheet.backgroundImage = backgroundImage;
  return sheet;
}

/** Create a sample backgroundImage object. */
function makeBg(overrides = {}) {
  return { url: 'data:image/png;base64,abc123==', opacity: 0.4, visible: true, ...overrides };
}

/**
 * Simulate uploadBackground: attach a backgroundImage record to a sheet.
 * Returns the new backgroundImage object.
 */
function uploadBackground(sheet, url, opacity = 0.4) {
  sheet.backgroundImage = { url, opacity, visible: true };
  return sheet.backgroundImage;
}

/** Simulate clearBackground: remove backgroundImage from sheet. */
function clearBackground(sheet) {
  delete sheet.backgroundImage;
}

/**
 * Determine whether a background image should be rendered.
 * Mirrors the render() guard: bg && bg.visible !== false && bg.url
 */
function shouldRenderBg(sheet) {
  const bg = sheet.backgroundImage;
  return !!(bg && bg.visible !== false && bg.url);
}

/**
 * Toggle visible state, mirroring the click handler:
 *   bg.visible = bg.visible === false  (false → true, true/undefined → false)
 */
function toggleBgVisibility(sheet) {
  const bg = sheet.backgroundImage;
  if (!bg) return;
  bg.visible = bg.visible === false;
}

/**
 * Simulate the save() function preserving backgroundImage through sheet
 * serialization and deserialization (JSON round-trip).
 */
function serializeSheet(sheet) {
  return JSON.parse(JSON.stringify({
    name: sheet.name,
    components: sheet.components,
    connections: sheet.connections,
    layers: sheet.layers,
    ...(sheet.backgroundImage ? { backgroundImage: sheet.backgroundImage } : {})
  }));
}

/**
 * Simulate getOneLine() in dataStore.mjs – maps raw stored data to clean
 * sheet objects, passing through backgroundImage when present.
 */
function deserializeSheet(raw) {
  return {
    name: raw.name,
    components: Array.isArray(raw.components) ? raw.components : [],
    connections: Array.isArray(raw.connections) ? raw.connections : [],
    layers: Array.isArray(raw.layers) ? raw.layers : [],
    ...(raw.backgroundImage ? { backgroundImage: raw.backgroundImage } : {})
  };
}

/**
 * Simulate opacity update: clamp value to [0, 1] and apply to bg.
 */
function setOpacity(sheet, value) {
  const bg = sheet.backgroundImage;
  if (!bg) return;
  bg.opacity = Math.min(1, Math.max(0, value));
}

// ---------------------------------------------------------------------------
// Test 1: uploadBackground populates sheet.backgroundImage
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 1: uploadBackground populates backgroundImage');
  const sheet = makeSheet();
  const url = 'data:image/png;base64,iVBORw0KGgo=';
  uploadBackground(sheet, url);
  assert.ok(sheet.backgroundImage, 'backgroundImage is set');
  assert.equal(sheet.backgroundImage.url, url, 'url stored correctly');
  assert.equal(sheet.backgroundImage.opacity, 0.4, 'default opacity is 0.4');
  assert.equal(sheet.backgroundImage.visible, true, 'default visible is true');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 2: clearBackground removes the backgroundImage field
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 2: clearBackground removes backgroundImage');
  const sheet = makeSheet('Sheet 1', makeBg());
  assert.ok(sheet.backgroundImage, 'precondition: backgroundImage is set');
  clearBackground(sheet);
  assert.equal(sheet.backgroundImage, undefined, 'backgroundImage removed');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 3: shouldRenderBg returns true for a valid, visible background
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 3: shouldRenderBg true for visible bg');
  const sheet = makeSheet('Sheet 1', makeBg({ visible: true }));
  assert.equal(shouldRenderBg(sheet), true, 'visible bg → render');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 4: shouldRenderBg returns false when visible is false
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 4: shouldRenderBg false when visible is false');
  const sheet = makeSheet('Sheet 1', makeBg({ visible: false }));
  assert.equal(shouldRenderBg(sheet), false, 'hidden bg → no render');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 5: shouldRenderBg returns false when backgroundImage is absent
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 5: shouldRenderBg false when no backgroundImage');
  const sheet = makeSheet();
  assert.equal(shouldRenderBg(sheet), false, 'no backgroundImage → no render');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 6: shouldRenderBg returns false when url is empty
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 6: shouldRenderBg false when url is empty string');
  const sheet = makeSheet('Sheet 1', { url: '', opacity: 0.4, visible: true });
  assert.equal(shouldRenderBg(sheet), false, 'empty url → no render');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 7: toggleBgVisibility hides a visible background
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 7: toggleBgVisibility hides visible bg');
  const sheet = makeSheet('Sheet 1', makeBg({ visible: true }));
  toggleBgVisibility(sheet);
  assert.equal(sheet.backgroundImage.visible, false, 'visible → false after toggle');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 8: toggleBgVisibility shows a hidden background
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 8: toggleBgVisibility shows hidden bg');
  const sheet = makeSheet('Sheet 1', makeBg({ visible: false }));
  toggleBgVisibility(sheet);
  assert.equal(sheet.backgroundImage.visible, true, 'false → true after toggle');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 9: toggleBgVisibility hides a background with undefined visible
// (undefined is treated as true = visible)
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 9: toggleBgVisibility hides bg with visible=undefined');
  const sheet = makeSheet('Sheet 1', { url: 'data:image/png;base64,abc', opacity: 0.4 });
  // visible is undefined → treated as visible
  assert.equal(shouldRenderBg(sheet), true, 'undefined visible → rendered');
  toggleBgVisibility(sheet);
  assert.equal(sheet.backgroundImage.visible, false, 'undefined → false after toggle');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 10: JSON round-trip preserves all backgroundImage fields
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 10: backgroundImage survives JSON round-trip');
  const sheet = makeSheet('Sheet 1', makeBg({ opacity: 0.6, visible: false }));
  const serialized = serializeSheet(sheet);
  assert.ok(serialized.backgroundImage, 'backgroundImage present after serialize');
  assert.equal(serialized.backgroundImage.url, sheet.backgroundImage.url, 'url preserved');
  assert.equal(serialized.backgroundImage.opacity, 0.6, 'opacity preserved');
  assert.equal(serialized.backgroundImage.visible, false, 'visible preserved');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 11: Sheet without backgroundImage serializes without that field
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 11: sheet without backgroundImage serializes cleanly');
  const sheet = makeSheet();
  const serialized = serializeSheet(sheet);
  assert.equal(serialized.backgroundImage, undefined, 'no backgroundImage in output');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 12: deserializeSheet passes through backgroundImage
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 12: deserializeSheet preserves backgroundImage');
  const raw = {
    name: 'Sheet 1',
    components: [],
    connections: [],
    layers: [],
    backgroundImage: { url: 'data:image/jpeg;base64,abc', opacity: 0.3, visible: true }
  };
  const sheet = deserializeSheet(raw);
  assert.ok(sheet.backgroundImage, 'backgroundImage present');
  assert.equal(sheet.backgroundImage.url, raw.backgroundImage.url, 'url preserved');
  assert.equal(sheet.backgroundImage.opacity, 0.3, 'opacity preserved');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 13: deserializeSheet handles missing backgroundImage gracefully
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 13: deserializeSheet handles missing backgroundImage');
  const raw = { name: 'Sheet 1', components: [], connections: [], layers: [] };
  const sheet = deserializeSheet(raw);
  assert.equal(sheet.backgroundImage, undefined, 'no backgroundImage → undefined');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 14: Each sheet has its own independent backgroundImage (sheet isolation)
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 14: each sheet has independent backgroundImage');
  const sheet1 = makeSheet('Sheet 1');
  const sheet2 = makeSheet('Sheet 2');
  uploadBackground(sheet1, 'data:image/png;base64,SHEET1');
  // sheet2 should not be affected
  assert.ok(sheet1.backgroundImage, 'sheet1 has background');
  assert.equal(sheet2.backgroundImage, undefined, 'sheet2 unaffected');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 15: Opacity clamp – values are clamped to [0, 1]
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 15: opacity clamped to [0, 1] range');
  const sheet = makeSheet('Sheet 1', makeBg({ opacity: 0.4 }));
  setOpacity(sheet, 1.5);
  assert.equal(sheet.backgroundImage.opacity, 1, 'clamped to max 1');
  setOpacity(sheet, -0.3);
  assert.equal(sheet.backgroundImage.opacity, 0, 'clamped to min 0');
  setOpacity(sheet, 0.75);
  assert.equal(sheet.backgroundImage.opacity, 0.75, 'valid value unchanged');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 16: clearBackground is a no-op when no backgroundImage exists
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 16: clearBackground no-op on sheet without background');
  const sheet = makeSheet();
  assert.doesNotThrow(() => clearBackground(sheet), 'no error when backgroundImage is absent');
  assert.equal(sheet.backgroundImage, undefined, 'still undefined after clear');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 17: Multiple toggle cycles restore original state
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 17: two toggles restore original visible state');
  const sheet = makeSheet('Sheet 1', makeBg({ visible: true }));
  toggleBgVisibility(sheet);
  assert.equal(sheet.backgroundImage.visible, false, 'first toggle hides');
  toggleBgVisibility(sheet);
  assert.equal(sheet.backgroundImage.visible, true, 'second toggle shows again');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 18: uploadBackground preserves opacity when re-uploading
// (new upload always resets to default opacity 0.4)
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 18: re-upload resets opacity to 0.4');
  const sheet = makeSheet('Sheet 1', makeBg({ opacity: 0.8 }));
  uploadBackground(sheet, 'data:image/png;base64,NEW');
  assert.equal(sheet.backgroundImage.opacity, 0.4, 'new upload resets opacity to 0.4');
  assert.equal(sheet.backgroundImage.url, 'data:image/png;base64,NEW', 'url updated');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 19: Backward compatibility – existing diagrams without backgroundImage
// load correctly (no crashes, no background rendered)
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 19: backward compat – old diagram with no backgroundImage field');
  const legacySheet = {
    name: 'Legacy Sheet',
    components: [{ id: 'c1', type: 'bus', x: 0, y: 0 }],
    connections: [],
    layers: []
    // no backgroundImage field
  };
  const loaded = deserializeSheet(legacySheet);
  assert.equal(loaded.backgroundImage, undefined, 'no backgroundImage → undefined');
  assert.equal(shouldRenderBg(loaded), false, 'no background rendered for legacy sheets');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 20: shouldRenderBg handles an incomplete backgroundImage object safely
// ---------------------------------------------------------------------------
{
  console.log('Gap #52 – Test 20: shouldRenderBg safe with incomplete backgroundImage');
  // Case: backgroundImage exists but has no url
  const sheet = makeSheet('Sheet 1', { opacity: 0.4, visible: true });
  assert.equal(shouldRenderBg(sheet), false, 'backgroundImage without url → no render');
  console.log('  PASS');
}

console.log('\nAll Gap #52 background image underlay tests passed.');
