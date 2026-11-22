import "../loadEnv.js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { runTryonLook } from "../lib/runTryonLook.js";
import { assertReferenceImageQuality } from "../lib/referenceImageQuality.js";
import { reviewBridePhoto } from "../lib/bridePhotoReview.js";

async function main() {
  if (!(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY)) {
    throw new Error("The live synthetic fitting check requires a configured Gemini key.");
  }
  if (process.env.TRYON_QUALITY_GATE?.toLowerCase() === "off") {
    throw new Error("The synthetic fitting check requires the garment quality judge.");
  }
  const source = path.resolve("samples/tryon");
  const [subject, front] = await Promise.all(["subject.jpg", "gown-front.jpg"].map(file => readFile(path.join(source, file))));
  if (!subject || !front) throw new Error("Missing synthetic fixture");
  const quality = await assertReferenceImageQuality({ buffer: subject, minEdgePx: 256, profile: "couple", label: "Synthetic subject" });
  const review = await reviewBridePhoto(subject, quality);
  if (!review.ok) throw new Error(review.reason);
  const start = Date.now();
  const result = await runTryonLook({
    sessionId: 0,
    dress: { styleName: "Satin study", neckline: "square", fabric: "satin with asymmetric floral lace", silhouette: "A-line", color: "ivory" },
    brideReferences: [{ buffer: subject, mimeType: "image/jpeg" }],
    dressReferences: [{ buffer: front, mimeType: "image/jpeg", coverage: "front" }],
  });
  const dir = path.join("qa-output", "tryon", new Date().toISOString().replaceAll(":", "-"));
  await mkdir(dir, {recursive: true});
  const hash = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
  await writeFile(path.join(dir, "look.jpg"), result.polished);
  await writeFile(path.join(dir, "report.json"), JSON.stringify({
    synthetic: true, published: false, model: result.model, attempts: result.attempts,
    elapsedMs: Date.now() - start, meetsTarget: !result.consultantReview, scores: result.report,
    subjectSha256: hash(subject), gownSha256: hash(front), outputSha256: hash(result.polished),
  }, null, 2));
  console.log(`Saved synthetic fitting and report in ${dir}`);
  if (result.consultantReview) throw new Error("Generated look fell below the publication target.");
}
main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "Synthetic fitting check failed.");
  process.exitCode = 1;
});
