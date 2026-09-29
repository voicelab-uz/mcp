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
