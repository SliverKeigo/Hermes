// src/utils/hash.util.ts
export const sha256 = (data: string): string => {
  if (typeof Bun !== 'undefined' && Bun.hash && (Bun.hash as any).sha256) {
    return (Bun.hash as any).sha256(data) as string;
  }
  // Fallback for non-Bun environments or if Bun.hash is unavailable
  // This might happen in certain test environments or if running outside Bun
  // For production, Bun.hash is expected to be available
  console.warn("Bun.hash.sha256 is not available. Using a simple placeholder hash.");
  return `fallback-hash-${data}`; // Use a placeholder for non-Bun or problematic test environments
};