function getCryptoSubtle() {
  return globalThis.crypto?.subtle || globalThis.crypto?.webcrypto?.subtle;
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const output = {};
    Object.keys(value).sort().forEach(key => {
      output[key] = canonicalize(value[key]);
    });
    return output;
  }
  return value;
}

export function canonicalJSONString(value) {
  return JSON.stringify(canonicalize(value));
}

export async function sha256Hex(value) {
  const subtle = getCryptoSubtle();
  if (!subtle) throw new Error('SHA-256 is not available in this browser.');
  const bytes = new TextEncoder().encode(String(value));
  const hash = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function compressString(value) {
  try {
    if (typeof CompressionStream === 'function' && typeof Blob === 'function') {
      const stream = new Blob([value], { type: 'application/json' })
        .stream()
        .pipeThrough(new CompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
  } catch {}
  try {
    return new TextEncoder().encode(value);
  } catch {
    return new Uint8Array();
  }
}

export async function decompressBytes(bytes) {
  try {
    if (typeof DecompressionStream === 'function' && typeof Blob === 'function') {
      const stream = new Blob([bytes], { type: 'application/octet-stream' })
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
      return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
  } catch {}
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

export async function encodeProjectForUrl(project) {
  const bytes = await compressString(canonicalJSONString(project));
  return encodeURIComponent(bytesToBase64(bytes));
}

export async function decodeProjectFromUrl(encoded) {
  const bytes = base64ToBytes(decodeURIComponent(encoded));
  return JSON.parse(await decompressBytes(bytes));
}
