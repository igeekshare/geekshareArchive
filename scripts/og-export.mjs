#!/usr/bin/env node
/**
 * OG/Twitter SVG -> PNG converter using Sharp
 *
 * Usage:
 *   node scripts/og-export.mjs
 *   node scripts/og-export.mjs --in ./public/og-image.svg --out ./public/og-image.png
 *   node scripts/og-export.mjs --size 1200x630
 *   node scripts/og-export.mjs --width 1200 --height 630 --density 240
 *
 * Defaults:
 *   --in     ../public/og-image.svg
 *   --out    ../public/og-image.png
 *   --size   1200x630
 *   --density 240   (controls rasterization quality from SVG; higher = sharper text, larger file)
 *
 * Notes:
 * - This script expects the project structure where this file lives under ./scripts,
 *   and the public assets live under ./public.
 * - For best compatibility on social platforms, PNG should be exactly 1200×630.
 */

import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";

/** Resolve project root (parent of ./scripts) */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

/** Simple args parser */
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else if (a.startsWith("-")) {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function printHelp() {
  const rel = (p) => path.relative(process.cwd(), p).replace(/\\/g, "/");
  console.log(
    [
      "OG/Twitter SVG -> PNG converter using Sharp",
      "",
      "Usage:",
      "  node scripts/og-export.mjs",
      "  node scripts/og-export.mjs --in ./public/og-image.svg --out ./public/og-image.png",
      "  node scripts/og-export.mjs --size 1200x630",
      "  node scripts/og-export.mjs --width 1200 --height 630 --density 240",
      "",
      "Defaults:",
      `  --in      ${rel(path.join(projectRoot, "public", "og-image.svg"))}`,
      `  --out     ${rel(path.join(projectRoot, "public", "og-image.png"))}`,
      "  --size    1200x630",
      "  --density 240",
      "",
      "Examples:",
      "  node scripts/og-export.mjs --size 1200x630",
      "  node scripts/og-export.mjs --in ./public/og-image.svg --out ./public/og-image.png --density 300",
      "",
    ].join("\n")
  );
}

const args = parseArgs(process.argv.slice(2));
if (args.h || args.help) {
  printHelp();
  process.exit(0);
}

/** Defaults */
const inDefault = path.join(projectRoot, "public", "og-image.svg");
const outDefault = path.join(projectRoot, "public", "og-image.png");

const inputPath = args.in ? path.resolve(process.cwd(), args.in) : inDefault;
const outputPath = args.out ? path.resolve(process.cwd(), args.out) : outDefault;
const density =
  args.density !== undefined ? Number(args.density) : 240;

let width = 1200;
let height = 630;

if (args.size) {
  const m = String(args.size).match(/^(\d+)[xX](\d+)$/);
  if (!m) {
    console.error(`Invalid --size value: "${args.size}". Expected format: WIDTHxHEIGHT (e.g., 1200x630).`);
    process.exit(1);
  }
  width = Number(m[1]);
  height = Number(m[2]);
} else {
  if (args.width) width = Number(args.width);
  if (args.height) height = Number(args.height);
}

if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
  console.error(`Invalid dimensions: width=${width}, height=${height}`);
  process.exit(1);
}

if (!Number.isFinite(density) || density <= 0) {
  console.error(`Invalid density: ${density}`);
  process.exit(1);
}

const relFromRoot = (p) => path.relative(projectRoot, p).replace(/\\/g, "/");

async function ensureSharp() {
  try {
    const mod = await import("sharp");
    return mod.default ?? mod;
  } catch (err) {
    console.error(
      [
        "Cannot load 'sharp'. Please install it in this project:",
        "",
        "  npm i -D sharp",
        "  # or",
        "  pnpm add -D sharp",
        "  # or",
        "  yarn add -D sharp",
        "",
        "Then re-run:",
        "  node scripts/og-export.mjs",
      ].join("\n")
    );
    process.exit(1);
  }
}

async function main() {
  console.log("== OG/Twitter SVG -> PNG export ==");
  console.log(`Project root: ${projectRoot}`);
  console.log(`Input SVG   : ${relFromRoot(inputPath)}`);
  console.log(`Output PNG  : ${relFromRoot(outputPath)}`);
  console.log(`Size        : ${width}x${height}`);
  console.log(`Density     : ${density} (higher = sharper, larger file)`);
  console.log("");

  // Validate input
  try {
    const stat = await fs.stat(inputPath);
    if (!stat.isFile()) {
      console.error(`Input is not a file: ${inputPath}`);
      process.exit(1);
    }
  } catch {
    console.error(`Input SVG not found: ${inputPath}`);
    process.exit(1);
  }

  // Ensure output directory
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const sharp = await ensureSharp();

  // Read SVG and rasterize with density
  const svgSource = await fs.readFile(inputPath);

  const started = Date.now();
  try {
    // Use density for crisp rasterization, resize to exact dimensions,
    // fit cover (crop if necessary), and flatten to remove any alpha for PNG.
    await sharp(svgSource, { density })
      .resize({
        width,
        height,
        fit: "cover",
        position: "center",
        withoutEnlargement: false,
      })
      .flatten({ background: "#ffffff" })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        force: true,
      })
      .toFile(outputPath);

    const tookMs = Date.now() - started;
    const outStat = await fs.stat(outputPath);
    const kb = Math.round(outStat.size / 1024);
    console.log(`✅ Exported ${relFromRoot(outputPath)} (${kb} KB) in ${tookMs} ms`);
    console.log("Done.");
  } catch (err) {
    console.error("❌ Export failed.");
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  }
}

main();
