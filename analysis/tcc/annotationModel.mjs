export const PREVIEW_SHAPE_DASH_PATTERNS = {
  solid: '',
  dashed: '8 4',
  dotted: '2 2'
};
const MAX_PREVIEW_ANNOTATION_TEXT_LENGTH = 4000;
const MAX_PREVIEW_ANNOTATION_LINES = 24;

export function normalizeAnnotationPreview(comp) {
  if (!comp || comp.type !== 'annotation') return null;
  const subtype = typeof comp.subtype === 'string' ? comp.subtype.trim() : '';
  const rawProps = comp.props && typeof comp.props === 'object' ? comp.props : {};
  const pick = key => {
    const direct = comp[key];
    if (direct !== undefined && direct !== null && direct !== '') return direct;
    return rawProps[key];
  };
  let shapeType = typeof pick('shapeType') === 'string' ? pick('shapeType').trim().toLowerCase() : '';
  if (shapeType === 'rounded_rectangle') shapeType = 'rounded';
  if (!['rectangle', 'rounded', 'circle'].includes(shapeType)) shapeType = 'rectangle';
  let strokeStyle = typeof pick('strokeStyle') === 'string' ? pick('strokeStyle').trim().toLowerCase() : 'solid';
  if (!['solid', 'dashed', 'dotted'].includes(strokeStyle)) strokeStyle = 'solid';
  let cornerRadius = Number(pick('cornerRadius'));
  if (!Number.isFinite(cornerRadius) || cornerRadius < 0) cornerRadius = 12;
  let strokeWidth = Number(pick('strokeWidth'));
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) strokeWidth = 2;
  let fillOpacity = Number(pick('fillOpacity'));
  if (!Number.isFinite(fillOpacity)) fillOpacity = 1;
  fillOpacity = Math.max(0, Math.min(1, fillOpacity));
  const strokeColor = typeof pick('strokeColor') === 'string' && pick('strokeColor').trim()
    ? pick('strokeColor').trim()
    : '#333333';
  const fillColor = typeof pick('fillColor') === 'string' && pick('fillColor').trim()
    ? pick('fillColor').trim()
    : '#ffffff';
  const rawText = typeof pick('text') === 'string' ? pick('text') : (typeof comp.text === 'string' ? comp.text : '');
  return {
    subtype,
    shapeType,
    strokeStyle,
    strokeColor,
    fillColor,
    fillOpacity,
    strokeWidth,
    cornerRadius,
    text: rawText.slice(0, MAX_PREVIEW_ANNOTATION_TEXT_LENGTH)
  };
}

export function buildAnnotationPreviewLines(content) {
  if (!content) return [];
  return content
    .slice(0, MAX_PREVIEW_ANNOTATION_TEXT_LENGTH)
    .split(/\r?\n/, MAX_PREVIEW_ANNOTATION_LINES)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, MAX_PREVIEW_ANNOTATION_LINES);
}

export function createAnnotationId({ now = Date.now, random = Math.random } = {}) {
  return `note-${now().toString(36)}-${random().toString(36).slice(2, 8)}`;
}

export function sanitizeAnnotation(raw, idFactory = createAnnotationId) {
  if (!raw || typeof raw !== 'object') return null;
  const current = Number(raw.current);
  const time = Number(raw.time);
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!Number.isFinite(current) || current <= 0) return null;
  if (!Number.isFinite(time) || time <= 0) return null;
  if (!text) return null;
  const annotation = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : idFactory(),
    current,
    time,
    text
  };
  if (Number.isFinite(raw.offsetX)) annotation.offsetX = Number(raw.offsetX);
  if (Number.isFinite(raw.offsetY)) annotation.offsetY = Number(raw.offsetY);
  return annotation;
}

export function exportAnnotation(annotation) {
  const base = {
    id: annotation.id,
    current: annotation.current,
    time: annotation.time,
    text: annotation.text
  };
  if (Number.isFinite(annotation.offsetX)) base.offsetX = annotation.offsetX;
  if (Number.isFinite(annotation.offsetY)) base.offsetY = annotation.offsetY;
  return base;
}
