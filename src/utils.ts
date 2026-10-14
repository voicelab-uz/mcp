/**
 * Cross-platform utilities for Node and Cloudflare Workers
 */

// Check if Buffer is available (Node environment)
const hasBuffer = typeof globalThis !== 'undefined' && 'Buffer' in globalThis;

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function base64Encode(data: ArrayBuffer | Uint8Array): string {
  if (hasBuffer) {
    const Buffer = (globalThis as any).Buffer;
    return Buffer.from(data).toString('base64');
  }
  // Workers environment
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64Decode(base64: string): Uint8Array {
  if (hasBuffer) {
    const Buffer = (globalThis as any).Buffer;
    return Buffer.from(base64, 'base64');
  }
  // Workers environment
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error('Invalid namespace UUID');
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * RFC 4122 / 9562 name-based UUID (version 5, SHA-1). Deterministic: the same
 * (namespace, name) always yields the same UUID. Uses WebCrypto (Node 20+ and Workers).
 */
export async function uuidV5(name: string, namespace: string): Promise<string> {
  const ns = uuidToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(ns.length + nameBytes.length);
  input.set(ns, 0);
  input.set(nameBytes, ns.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', input));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
