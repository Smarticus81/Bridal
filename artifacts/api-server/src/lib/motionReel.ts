import { spawn } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { logger } from "./logger.js";

const REEL_WIDTH = 1280;
const REEL_HEIGHT = 720;
const MIN_REEL_BYTES = 20_000;
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

interface MotionReelBrandingOptions {
  venueName?: string | null;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function buildReelTitleCard(options: MotionReelBrandingOptions): Promise<Buffer | null> {
  const venueName = options.venueName?.trim();
  if (!venueName) return null;

  const safeVenueName = escapeSvgText(venueName.slice(0, 90));
  const svg = `
    <svg width="${REEL_WIDTH}" height="${REEL_HEIGHT}" viewBox="0 0 ${REEL_WIDTH} ${REEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="1280" height="720" fill="#241d35"/>
      <path fill="#3e2b6c" d="M965 0h155L705 720H550zm250 0h155L955 720H800z"/>
      <path transform="translate(80 70) scale(1.7)" fill="#d3fa52" d="M0 28 15 2h9L9 28zm14 0L29 2h9L23 28zm12 0 6-10 6 10z"/>
      <g font-family="Arial, Helvetica, sans-serif" fill="#ffffff">
        <text x="160" y="110" font-size="44" font-weight="bold" letter-spacing="-2">aislework</text>
        <text x="80" y="380" font-size="23" letter-spacing="3" fill="#d3fa52">YOUR VENUE GALLERY</text>
        <text x="80" y="472" font-size="${Math.min(65, 1800 / Math.max(1, venueName.length))}" font-weight="bold">${safeVenueName}</text>
      </g>
    </svg>`;

  return sharp(Buffer.from(svg))
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

export function assertUsableMotionReel(buffer: Buffer): void {
  if (buffer.length < MIN_REEL_BYTES) {
    throw new Error(`Motion reel is unusably small (${buffer.length} bytes).`);
  }
  if (buffer.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new Error("Motion reel is not a valid MP4 file.");
  }
}

export function ffmpegExecutable(): string {
  const explicit = process.env.FFMPEG_PATH?.trim();
  if (explicit) return explicit;

  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates = [
    path.resolve(process.cwd(), "bin", binaryName),
    path.resolve(process.cwd(), "artifacts", "api-server", "bin", binaryName),
    path.resolve(process.cwd(), "artifacts", "api-server", "dist", "bin", binaryName),
    path.resolve(MODULE_DIR, "bin", binaryName),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? "ffmpeg";
}

export function checkFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegExecutable(), ["-version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const executable = ffmpegExecutable();
    const proc = spawn(executable, ["-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      reject(
        new Error(
          `ffmpeg executable not available (${executable}). Install ffmpeg or set FFMPEG_PATH. ${err.message}`,
        ),
      );
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function tmpFile(suffix: string): Promise<string> {
  return path.join(
    os.tmpdir(),
    `glimpse-reel-${crypto.randomBytes(6).toString("hex")}${suffix}`,
  );
}

async function concatClips(clips: Buffer[]): Promise<Buffer> {
  if (clips.length === 0) throw new Error("concatClips: no clips provided");
  if (clips.length === 1) return clips[0]!;

  const clipPaths: string[] = [];
  const listPath = await tmpFile(".txt");
  const outPath = await tmpFile(".mp4");
  try {
    for (const buffer of clips) {
      const clipPath = await tmpFile(".mp4");
      await fs.writeFile(clipPath, buffer);
      clipPaths.push(clipPath);
    }

    const listContent = clipPaths
      .map((clipPath) => `file '${clipPath.replace(/'/g, "'\\''")}'`)
      .join("\n");
    await fs.writeFile(listPath, listContent);

    await runFfmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outPath,
    ]);

    const stitched = await fs.readFile(outPath);
    logger.info({ clipCount: clips.length, stitchedBytes: stitched.length }, "Stitched gallery reel clips");
    return stitched;
  } finally {
    fs.unlink(listPath).catch(() => {});
    fs.unlink(outPath).catch(() => {});
    for (const clipPath of clipPaths) fs.unlink(clipPath).catch(() => {});
  }
}

export async function buildKenBurnsSlideshow(
  slides: Buffer[],
  secondsPerSlide = 4,
  branding: MotionReelBrandingOptions = {},
): Promise<Buffer> {
  if (slides.length === 0) throw new Error("buildKenBurnsSlideshow: no slides provided");

  const clipBuffers: Buffer[] = [];
  const clipPaths: string[] = [];
  const titleCard = await buildReelTitleCard(branding);
  const reelSlides = titleCard ? [titleCard, ...slides] : slides;

  try {
    for (let i = 0; i < reelSlides.length; i++) {
      const clipPath = await tmpFile(`-clip-${i}.mp4`);
      clipPaths.push(clipPath);
      await renderKenBurnsClip(reelSlides[i]!, secondsPerSlide, i % 2 === 0, clipPath);
      clipBuffers.push(await fs.readFile(clipPath));
    }

    const reel = await concatClips(clipBuffers);
    assertUsableMotionReel(reel);
    logger.info(
      {
        slideCount: slides.length,
        titleCard: Boolean(titleCard),
        reelBytes: reel.length,
      },
      "Built gallery motion reel",
    );
    return reel;
  } finally {
    for (const clipPath of clipPaths) fs.unlink(clipPath).catch(() => {});
  }
}

async function renderKenBurnsClip(
  slide: Buffer,
  secondsPerSlide: number,
  zoomIn: boolean,
  outPath: string,
): Promise<void> {
  const fps = 30;
  const frames = secondsPerSlide * fps;
  const imgPath = await tmpFile(".jpg");

  // zoompan rounds its pan position to whole pixels of the working frame, so
  // panning at output resolution makes the slow zoom shake. Supersample: run
  // zoompan on a 4x frame (rounding error becomes 1/4 output pixel), and
  // drive the zoom linearly off the output frame counter instead of the
  // recursive form, which stalled when it hit its cap mid-clip.
  const superWidth = REEL_WIDTH * 4;
  const superHeight = REEL_HEIGHT * 4;
  const zoomExpr = zoomIn
    ? `1+0.1*on/${frames - 1}`
    : `1.1-0.1*on/${frames - 1}`;

  try {
    await fs.writeFile(imgPath, slide);
    await runFfmpeg([
      "-i",
      imgPath,
      "-vf",
      `scale=${superWidth}:${superHeight}:force_original_aspect_ratio=increase,crop=${superWidth}:${superHeight},` +
        `zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${REEL_WIDTH}x${REEL_HEIGHT}:fps=${fps}`,
      "-frames:v",
      String(frames),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outPath,
    ]);
  } finally {
    fs.unlink(imgPath).catch(() => {});
  }
}
