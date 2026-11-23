/** Shared synchronous lossless byte codec for bounded design-synthesis evidence. */
export function encodeBase64(bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  return btoa(chunks.join(''));
}

export function decodeBase64(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  try { return Uint8Array.from(atob(value), character => character.charCodeAt(0)); } catch { return null; }
}

export function encodeDesignSynthesisFaultScenarioBytes(bytes) {
  const chunks = []; const chunkSize = 0x8000; let bits = 0; let bitCount = 0; let chunk = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const end = Math.min(bytes.length, offset + chunkSize);
    for (let index = offset; index < end; index += 1) {
      bits |= bytes[index] << bitCount; bitCount += 8;
      while (bitCount >= 15) {
        chunk += String.fromCharCode(0x100 + (bits & 0x7fff)); bits >>>= 15; bitCount -= 15;
        if (chunk.length >= chunkSize) { chunks.push(chunk); chunk = ''; }
      }
    }
  }
  if (bitCount) chunk += String.fromCharCode(0x100 + bits);
  if (chunk) chunks.push(chunk);
  return chunks.join('');
}

export function decodeDesignSynthesisFaultScenarioBytes(value, expectedLength) {
  if (typeof value !== 'string' || !Number.isSafeInteger(expectedLength) || expectedLength < 0
    || value.length !== Math.ceil(expectedLength * 8 / 15)) return null;
  const bytes = new Uint8Array(expectedLength); let outputOffset = 0; let bits = 0; let bitCount = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x100 || code > 0x80ff) return null;
    bits |= (code - 0x100) << bitCount; bitCount += 15;
    while (bitCount >= 8 && outputOffset < expectedLength) { bytes[outputOffset++] = bits & 0xff; bits >>>= 8; bitCount -= 8; }
  }
  if (outputOffset !== expectedLength || bits !== 0) return null;
  return bytes;
}

export function compressFaultBytes(bytes) {
  const output = []; const positionsByPrefix = new Map(); let literals = [];
  const prefixAt = offset => (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
  const remember = offset => {
    if (offset + 2 >= bytes.length) return;
    const key = prefixAt(offset); const positions = positionsByPrefix.get(key) || []; positions.push(offset);
    while (positions.length && offset - positions[0] > 0xffff) positions.shift();
    if (positions.length > 64) positions.shift();
    positionsByPrefix.set(key, positions);
  };
  const flushLiterals = () => { while (literals.length) { const chunk = literals.splice(0, 128); output.push(chunk.length - 1, ...chunk); } };
  for (let offset = 0; offset < bytes.length;) {
    let bestLength = 0; let bestDistance = 0;
    if (offset + 2 < bytes.length) {
      const candidates = positionsByPrefix.get(prefixAt(offset)) || [];
      for (let candidateIndex = candidates.length - 1, checked = 0; candidateIndex >= 0 && checked < 64; candidateIndex -= 1, checked += 1) {
        const candidate = candidates[candidateIndex]; const distance = offset - candidate;
        if (distance > 0xffff) continue;
        let length = 0;
        while (length < 130 && offset + length < bytes.length && bytes[candidate + (length % distance)] === bytes[offset + length]) length += 1;
        if (length >= 3 && length > bestLength) { bestLength = length; bestDistance = distance; }
        if (bestLength === 130) break;
      }
    }
    if (bestLength >= 3) {
      flushLiterals(); output.push(0x80 | (bestLength - 3), bestDistance & 0xff, bestDistance >>> 8);
      for (let index = 0; index < bestLength; index += 1) remember(offset + index);
      offset += bestLength;
    } else {
      literals.push(bytes[offset]); remember(offset); offset += 1;
      if (literals.length === 128) flushLiterals();
    }
  }
  flushLiterals();
  return Uint8Array.from(output);
}

export function decompressFaultBytes(bytes, expectedLength) {
  if (!Number.isSafeInteger(expectedLength) || expectedLength < 0) return null;
  const output = new Uint8Array(expectedLength); let inputOffset = 0; let outputOffset = 0;
  while (inputOffset < bytes.length && outputOffset < expectedLength) {
    const control = bytes[inputOffset++];
    if (control & 0x80) {
      if (inputOffset + 2 > bytes.length) return null;
      const length = (control & 0x7f) + 3; const distance = bytes[inputOffset++] | (bytes[inputOffset++] << 8);
      if (!distance || distance > outputOffset || outputOffset + length > expectedLength) return null;
      for (let index = 0; index < length; index += 1) output[outputOffset + index] = output[outputOffset + index - distance];
      outputOffset += length;
    } else {
      const length = control + 1;
      if (inputOffset + length > bytes.length || outputOffset + length > expectedLength) return null;
      output.set(bytes.subarray(inputOffset, inputOffset + length), outputOffset); inputOffset += length; outputOffset += length;
    }
  }
  return inputOffset === bytes.length && outputOffset === expectedLength ? output : null;
}
