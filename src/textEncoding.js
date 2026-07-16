const WINDOWS_1252_BYTES = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
]);

const SUSPICIOUS_PATTERN = /[\u00c2\u00c3\u00e2]/g;
const REPAIRABLE_ATTRIBUTES = ['aria-label', 'aria-description', 'title', 'placeholder'];
const SKIP_TEXT_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function suspiciousCharacterCount(value) {
  return value.match(SUSPICIOUS_PATTERN)?.length || 0;
}

function decodeWindows1252Utf8(value) {
  const bytes = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }
    const mappedByte = WINDOWS_1252_BYTES.get(codePoint);
    if (mappedByte === undefined) return value;
    bytes.push(mappedByte);
  }

  try {
    return utf8Decoder.decode(Uint8Array.from(bytes));
  } catch {
    return value;
  }
}

export function repairMojibake(value) {
  if (typeof value !== 'string' || !SUSPICIOUS_PATTERN.test(value)) return value;
  SUSPICIOUS_PATTERN.lastIndex = 0;

  let repaired = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = decodeWindows1252Utf8(repaired);
    if (decoded === repaired || suspiciousCharacterCount(decoded) >= suspiciousCharacterCount(repaired)) break;
    repaired = decoded;
  }
  return repaired;
}

export function repairMojibakeDeep(value, seen = new WeakMap()) {
  if (typeof value === 'string') return repairMojibake(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const next = [];
    seen.set(value, next);
    value.forEach(item => next.push(repairMojibakeDeep(item, seen)));
    return next;
  }

  const next = {};
  seen.set(value, next);
  Object.entries(value).forEach(([key, item]) => {
    next[key] = repairMojibakeDeep(item, seen);
  });
  return next;
}

function repairTextNode(node) {
  if (!node?.parentElement || SKIP_TEXT_PARENTS.has(node.parentElement.tagName)) return;
  const repaired = repairMojibake(node.nodeValue);
  if (repaired !== node.nodeValue) node.nodeValue = repaired;
}

function repairElementAttributes(element) {
  if (!element?.getAttribute) return;
  REPAIRABLE_ATTRIBUTES.forEach(attribute => {
    const value = element.getAttribute(attribute);
    if (!value) return;
    const repaired = repairMojibake(value);
    if (repaired !== value) element.setAttribute(attribute, repaired);
  });
}

export function repairMojibakeDocument(root = globalThis.document) {
  const activeDocument = root?.ownerDocument || root;
  if (!root || !activeDocument?.createTreeWalker) return;
  const documentRoot = root.nodeType === 9 ? root.documentElement : root;
  if (!documentRoot) return;
  if (root.nodeType === 9) root.title = repairMojibake(root.title);
  if (documentRoot.nodeType === 1) repairElementAttributes(documentRoot);

  const showElement = globalThis.NodeFilter?.SHOW_ELEMENT || 1;
  const showText = globalThis.NodeFilter?.SHOW_TEXT || 4;
  const walker = activeDocument.createTreeWalker(documentRoot, showElement | showText);
  let node = walker.currentNode;
  while (node) {
    if (node.nodeType === 3) repairTextNode(node);
    else repairElementAttributes(node);
    node = walker.nextNode();
  }
}

export function observeMojibake(root = globalThis.document?.body) {
  if (!root || typeof MutationObserver === 'undefined') return null;
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'characterData') {
        repairTextNode(mutation.target);
        return;
      }
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 3) repairTextNode(node);
        else if (node.nodeType === 1) repairMojibakeDocument(node);
      });
    });
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return observer;
}
