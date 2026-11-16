import { randomUUID } from "crypto";
import { mkdir, readdir, rm, stat } from "fs/promises";
import path from "path";
import os from "os";

const TEMP_ROOT = path.join(os.tmpdir(), "gan-hadar");
const MAX_AGE_MS = 60 * 60 * 1000;

export type DownloadEntry = {
  id: string;
  dir: string;
  filePath: string;
  title: string;
  createdAt: number;
};

const pending = new Map<string, DownloadEntry>();

export async function ensureTempRoot(): Promise<void> {
  await mkdir(TEMP_ROOT, { recursive: true });
}

export function createJobId(): string {
  return randomUUID().replace(/-/g, "");
}

export async function createJobDir(jobId: string): Promise<string> {
  await ensureTempRoot();
  const dir = path.join(TEMP_ROOT, jobId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function registerEntry(entry: DownloadEntry): void {
  pending.set(entry.id, entry);
}

export function getEntry(id: string): DownloadEntry | undefined {
  return pending.get(id);
}

export async function removeEntry(id: string): Promise<void> {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  await rm(entry.dir, { recursive: true, force: true }).catch(() => undefined);
}

export async function cleanupStaleJobs(): Promise<void> {
  await ensureTempRoot();
  const now = Date.now();
  for (const [id, entry] of pending) {
    if (now - entry.createdAt > MAX_AGE_MS) {
      await removeEntry(id);
    }
  }

  let names: string[] = [];
  try {
    names = await readdir(TEMP_ROOT);
  } catch {
    return;
  }

  for (const name of names) {
    if (pending.has(name)) continue;
    const full = path.join(TEMP_ROOT, name);
    try {
      const info = await stat(full);
      if (now - info.mtimeMs > MAX_AGE_MS) {
        await rm(full, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  }
}