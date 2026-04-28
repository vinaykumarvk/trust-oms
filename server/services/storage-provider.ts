/**
 * Storage Provider (Phase 3B/3C)
 *
 * Abstraction layer for file storage. In production this can be backed by
 * S3, Azure Blob Storage, GCS, or a local disk provider.  The default
 * implementation reads from the local filesystem relative to a configurable
 * base path, which is suitable for development and testing.
 */

import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface StorageProvider {
  /** Read a file by its reference key and return the raw bytes. */
  read(reference: string): Promise<Buffer>;
  /** Write bytes under a reference key. Returns the stored reference. */
  write(reference: string, data: Buffer): Promise<string>;
  /** Delete a file by reference key. No-op if the file does not exist. */
  delete(reference: string): Promise<void>;
  /** Check whether a file exists. */
  exists(reference: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Local filesystem provider (default)
// ---------------------------------------------------------------------------

const STORAGE_BASE_PATH = process.env.STORAGE_BASE_PATH ?? path.join(process.cwd(), '.storage');

class LocalStorageProvider implements StorageProvider {
  private basePath: string;
  private basePathReady: Promise<void>;

  constructor(basePath: string) {
    this.basePath = basePath;
    // Ensure the base storage directory exists at provider creation time.
    // This is non-blocking — callers await basePathReady inside write().
    this.basePathReady = fs.mkdir(basePath, { recursive: true }).then(() => undefined);
  }

  private resolve(reference: string): string {
    // Prevent path traversal: decode percent-encoding, normalize unicode (NFC),
    // strip null bytes, then normalize the path and reject any remaining ../ segments.
    const decoded = decodeURIComponent(reference).normalize('NFC').replace(/\0/g, '');
    const safe = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
    const resolved = path.join(this.basePath, safe);
    // Final check: resolved path must be within basePath
    if (!resolved.startsWith(this.basePath + path.sep) && resolved !== this.basePath) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  async read(reference: string): Promise<Buffer> {
    const filePath = this.resolve(reference);
    try {
      return await fs.readFile(filePath);
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        throw new Error(`Storage file not found: ${reference}`);
      }
      throw err;
    }
  }

  async write(reference: string, data: Buffer): Promise<string> {
    await this.basePathReady;
    const filePath = this.resolve(reference);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return reference;
  }

  async delete(reference: string): Promise<void> {
    const filePath = this.resolve(reference);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'ENOENT') throw err;
    }
  }

  async exists(reference: string): Promise<boolean> {
    const filePath = this.resolve(reference);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!_provider) {
    _provider = new LocalStorageProvider(STORAGE_BASE_PATH);
  }
  return _provider;
}

/** Override the provider (useful for tests or alternative backends). */
export function setStorageProvider(provider: StorageProvider): void {
  _provider = provider;
}
