import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PREVIEW_SHAPE_DASH_PATTERNS,
  buildAnnotationPreviewLines,
  createAnnotationId,
  exportAnnotation,
  normalizeAnnotationPreview,
  sanitizeAnnotation
} from '../../analysis/tcc/annotationModel.mjs';

console.log('TCC annotation model');

{
  const preview = normalizeAnnotationPreview({
    type: 'annotation',
    subtype: 'note',
    props: {
      shapeType: 'rounded_rectangle',
      strokeStyle: 'dashed',
      strokeWidth: 3,
      fillOpacity: 2,
      text: 'Review setting'
    }
  });
  assert.deepEqual(preview, {
    subtype: 'note',
    shapeType: 'rounded',
    strokeStyle: 'dashed',
    strokeColor: '#333333',
    fillColor: '#ffffff',
    fillOpacity: 1,
    strokeWidth: 3,
    cornerRadius: 12,
    text: 'Review setting'
  });
  assert.equal(PREVIEW_SHAPE_DASH_PATTERNS.dashed, '8 4');
  assert.equal(normalizeAnnotationPreview({ type: 'breaker' }), null);
  console.log('  ✓ preserves annotation preview normalization and bounded style defaults');
}

{
  assert.deepEqual(buildAnnotationPreviewLines(' First \n\n Second '), ['First', 'Second']);
  assert.equal(buildAnnotationPreviewLines(Array.from({ length: 30 }, (_, i) => `L${i}`).join('\n')).length, 24);
  console.log('  ✓ preserves trimmed and bounded preview line generation');
}

{
  const id = createAnnotationId({ now: () => 1000, random: () => 0.5 });
  assert.equal(id, 'note-rs-i');
  const annotation = sanitizeAnnotation({
    current: '1200',
    time: '0.25',
    text: ' Coordination note ',
    offsetX: 12,
    offsetY: Number.NaN
  }, () => 'fixed-id');
  assert.deepEqual(annotation, {
    id: 'fixed-id', current: 1200, time: 0.25, text: 'Coordination note', offsetX: 12
  });
  assert.deepEqual(exportAnnotation(annotation), annotation);
  assert.equal(sanitizeAnnotation({ current: 0, time: 1, text: 'bad' }), null);
  assert.equal(sanitizeAnnotation({ current: 1, time: 1, text: ' ' }), null);
  console.log('  ✓ preserves annotation identity, numeric normalization, export, and invalid-input withholding');
}

{
  const source = await readFile(new URL('../../analysis/tcc/annotationModel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:document|window|HTMLElement|HTMLCanvasElement|d3)\b/);
  console.log('  ✓ remains independent of browser and chart APIs');
}
