import { spawn } from "child_process";
import { readdir } from "fs/promises";
import path from "path";
import { MSG_UNSUPPORTED } from "./messages";
import {
  createJobDir,
  createJobId,
  registerEntry,
  type DownloadEntry,
} from "./temp-store";

const DOWNLOAD_TIMEOUT_MS = Number(process.env.DOWNLOAD_TIMEOUT_MS ?? 120_000);

function ytDlpInvocation(extraArgs: string[]): {
  command: string;
  args: string[];
} {
  const fromEnv = process.env.YT_DLP_PATH?.trim();
  if (fromEnv) {
    return { command: fromEnv, args: extraArgs };
  }
  return { command: "python3", args: ["-m", "yt_dlp", ...extraArgs] };
}

type YtResult<T> = { ok: true; data: T } | { ok: false; reason: "unsupported" | "error" };

function runYtDlp(
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const { command, args: spawnArgs } = ytDlpInvocation(args);
    const child = spawn(/* turbopackIgnore: true */ command, spawnArgs, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

function isUnsupported(stderr: string, stdout: string): boolean {
  const text = `${stderr}\n${stdout}`.toLowerCase();
  const markers = [
    "private video",
    "login required",
    "sign in",
    "not available",
    "video unavailable",
    "content isn't available",
    "this content isn't available",
    "cannot parse",
    "unsupported url",
    "no video formats",
    "requested format is not available",
  ];
  return markers.some((m) => text.includes(m));
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120);
}

export async function probeFacebookVideo(
  url: string,
): Promise<YtResult<{ title: string }>> {
  const { stdout, stderr, code } = await runYtDlp(
    [
      "--no-playlist",
      "--no-warnings",
      "--socket-timeout",
      "30",
      "--dump-single-json",
      url,
    ],
    45_000,
  );

  if (code !== 0 || !stdout.trim()) {
    if (isUnsupported(stderr, stdout)) {
      return { ok: false, reason: "unsupported" };
    }
    return { ok: false, reason: "unsupported" };
  }

  try {
    const meta = JSON.parse(stdout) as { title?: string };
    return { ok: true, data: { title: meta.title?.trim() || "facebook-video" } };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function downloadFacebookVideo(
  url: string,
  title: string,
): Promise<YtResult<DownloadEntry>> {
  const jobId = createJobId();
  const dir = await createJobDir(jobId);
  const outputTemplate = path.join(dir, "video.%(ext)s");

  const { stderr, code } = await runYtDlp(
    [
      "--no-playlist",
      "--no-warnings",
      "--socket-timeout",
      "30",
      "-f",
      "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best",
      "--merge-output-format",
      "mp4",
      "-o",
      outputTemplate,
      url,
    ],
    DOWNLOAD_TIMEOUT_MS,
  );

  if (code !== 0) {
    if (isUnsupported(stderr, "")) {
      return { ok: false, reason: "unsupported" };
    }
    return { ok: false, reason: "unsupported" };
  }

  const files = await readdir(dir);
  const videoFile = files.find((f) => f.startsWith("video.") && !f.endsWith(".part"));
  if (!videoFile) {
    return { ok: false, reason: "unsupported" };
  }

  const filePath = path.join(dir, videoFile);
  const safeTitle = sanitizeFilename(title);
  const entry: DownloadEntry = {
    id: jobId,
    dir,
    filePath,
    title: safeTitle,
    createdAt: Date.now(),
  };
  registerEntry(entry);
  return { ok: true, data: entry };
}

export function unsupportedError(): Error {
  const err = new Error(MSG_UNSUPPORTED);
  return err;
}