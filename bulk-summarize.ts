#!/usr/bin/env bun
/**
 * bulk-summarize - Bulk YouTube video summarizer for research
 *
 * Scans YouTube channels/playlists for videos matching keywords,
 * then uses AI to create detailed summaries. Perfect for podcast research,
 * conference talk digests, tutorial compilations, etc.
 *
 * Requires: bun, yt-dlp, summarize (https://summarize.sh)
 */

import { $ } from "bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";

const VERSION = "0.1.0";

// Paths (can be overridden via CLI)
let CONFIG_PATH = "bulk-summarize.json";
let OUTPUT_DIR = "summaries";
let COMBINED_FILE = "all-summaries.md";

// ============================================================================
// Types
// ============================================================================

interface Source {
  id: string;
  name: string;
  url: string;
  type?: "channel" | "playlist";
  enabled?: boolean;
  tags?: string[];
}

interface Config {
  name: string;
  description?: string;
  keywords: string[];
  sources: Source[];
  settings: {
    maxVideosPerSource: number;
    summaryLength: "short" | "medium" | "long" | "xl" | "xxl";
    summaryPrompt: string;
    outputDir?: string;
  };
}

interface VideoInfo {
  id: string;
  title: string;
  url: string;
  uploadDate?: string;
  duration?: number;
  description?: string;
}

interface VideoRecord {
  status: "pending" | "summarized" | "skipped" | "error";
  title: string;
  url: string;
  error?: string;
  processedAt?: string;
}

interface SourceCheckpoint {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  lastScanned?: string;
  videos: Record<string, VideoRecord>;
}

// ============================================================================
// Path Helpers
// ============================================================================

function getOutputDir(config: Config): string {
  return config.settings?.outputDir || OUTPUT_DIR;
}

function getSourceDir(config: Config, sourceId: string): string {
  return join(getOutputDir(config), sourceId);
}

function getSourceCheckpointPath(config: Config, sourceId: string): string {
  return join(getSourceDir(config, sourceId), ".checkpoint.json");
}

function getSummaryPath(config: Config, sourceId: string, videoId: string): string {
  return join(getSourceDir(config, sourceId), `${videoId}.md`);
}

// ============================================================================
// Config & Checkpoint Management
// ============================================================================

function loadConfig(path: string): Config {
  if (!existsSync(path)) {
    console.error(`❌ Config not found: ${path}`);
    console.error(`   Run 'bulk-summarize init' to create a starter config`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

function ensureSourceDir(config: Config, sourceId: string): void {
  const dir = getSourceDir(config, sourceId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadSourceCheckpoint(config: Config, source: Source): SourceCheckpoint {
  ensureSourceDir(config, source.id);
  const path = getSourceCheckpointPath(config, source.id);

  if (!existsSync(path)) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      videos: {},
    };
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

function saveSourceCheckpoint(config: Config, checkpoint: SourceCheckpoint): void {
  ensureSourceDir(config, checkpoint.sourceId);
  const path = getSourceCheckpointPath(config, checkpoint.sourceId);
  writeFileSync(path, JSON.stringify(checkpoint, null, 2));
}

// ============================================================================
// YouTube Scanning
// ============================================================================

async function scanSource(
  source: Source,
  keywords: string[],
  maxResults: number
): Promise<VideoInfo[]> {
  console.log(`\n📺 Scanning: ${source.name}`);
  console.log(`   URL: ${source.url}`);

  let scanUrl = source.url;
  if (source.type !== "playlist" && !source.url.includes("/playlist")) {
    if (!scanUrl.endsWith("/videos")) {
      scanUrl = scanUrl.replace(/\/$/, "") + "/videos";
    }
  }

  try {
    const result = await $`yt-dlp \
      --flat-playlist \
      --print-json \
      --no-warnings \
      --playlist-end ${maxResults} \
      ${scanUrl}`.quiet();

    const lines = result.stdout.toString().trim().split("\n").filter(Boolean);
    const allVideos: VideoInfo[] = [];

    for (const line of lines) {
      try {
        const video = JSON.parse(line);
        allVideos.push({
          id: video.id,
          title: video.title || "Untitled",
          url: `https://www.youtube.com/watch?v=${video.id}`,
          uploadDate: video.upload_date,
          duration: video.duration,
          description: video.description,
        });
      } catch {
        // Skip malformed JSON
      }
    }

    let relevantVideos = allVideos;
    if (keywords.length > 0) {
      const keywordRegex = new RegExp(keywords.join("|"), "i");
      relevantVideos = allVideos.filter(
        (v) => keywordRegex.test(v.title) || keywordRegex.test(v.description || "")
      );
    }

    console.log(`   Found ${allVideos.length} videos, ${relevantVideos.length} match keywords`);
    return relevantVideos;
  } catch (error: any) {
    console.error(`   ❌ Error scanning: ${error.message}`);
    return [];
  }
}

// ============================================================================
// Summarization
// ============================================================================

async function summarizeVideo(
  video: VideoInfo,
  config: Config,
  sourceId: string
): Promise<{ success: boolean; error?: string }> {
  const summaryFile = getSummaryPath(config, sourceId, video.id);

  if (existsSync(summaryFile)) {
    console.log(`   ⏭️  Already exists: ${video.title.substring(0, 50)}...`);
    return { success: true };
  }

  console.log(`   📝 Summarizing: ${video.title.substring(0, 55)}...`);

  const prompt = config.settings.summaryPrompt
    .replace("{title}", video.title)
    .replace("{source}", sourceId);

  try {
    const result = await $`summarize \
      --length ${config.settings.summaryLength} \
      --prompt ${prompt} \
      ${video.url}`.quiet();

    const summary = result.stdout.toString();

    const content = `---
video_id: ${video.id}
title: "${video.title.replace(/"/g, '\\"')}"
url: ${video.url}
source: ${sourceId}
summarized_at: ${new Date().toISOString()}
---

# ${video.title}

**Source:** [Watch Video](${video.url})

---

${summary}
`;

    writeFileSync(summaryFile, content);
    console.log(`   ✅ Saved`);
    return { success: true };
  } catch (error: any) {
    const errorMsg = error.stderr?.toString() || error.message;
    console.error(`   ❌ Error: ${errorMsg.substring(0, 100)}`);
    return { success: false, error: errorMsg };
  }
}

// ============================================================================
// Commands
// ============================================================================

async function cmdInit(name?: string): Promise<void> {
  const configName = name || "bulk-summarize.json";

  if (existsSync(configName)) {
    console.error(`❌ Config already exists: ${configName}`);
    process.exit(1);
  }

  const starterConfig: Config = {
    name: "My Research Project",
    description: "YouTube video summaries for research",
    keywords: [],
    sources: [
      {
        id: "example-channel",
        name: "Example Channel",
        url: "https://www.youtube.com/@ExampleChannel",
        enabled: true,
        tags: ["example"],
      },
    ],
    settings: {
      maxVideosPerSource: 50,
      summaryLength: "xl",
      summaryPrompt:
        "Create a comprehensive summary of this video. Extract key insights, practical tips, and important information. Ignore ads, sponsors, and promotional content.\n\nTitle: {title}\nSource: {source}",
      outputDir: "summaries",
    },
  };

  writeFileSync(configName, JSON.stringify(starterConfig, null, 2));
  console.log(`✅ Created config: ${configName}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Edit ${configName} to add your sources and keywords`);
  console.log(`  2. Run: bulk-summarize scan`);
  console.log(`  3. Run: bulk-summarize summarize`);
}

async function cmdScan(options: { source?: string }): Promise<void> {
  const config = loadConfig(CONFIG_PATH);

  console.log(`🔍 Scanning sources for: ${config.name}\n`);

  if (config.keywords.length > 0) {
    console.log(`Keywords: ${config.keywords.join(", ")}\n`);
  } else {
    console.log(`Keywords: (none - fetching all videos)\n`);
  }

  let sources = config.sources.filter((s) => s.enabled !== false);

  if (options.source) {
    sources = sources.filter(
      (s) =>
        s.id === options.source ||
        s.id.includes(options.source!) ||
        s.name.toLowerCase().includes(options.source!.toLowerCase())
    );
    if (sources.length === 0) {
      console.error(`❌ No source found matching: ${options.source}`);
      return;
    }
  }

  for (const source of sources) {
    const checkpoint = loadSourceCheckpoint(config, source);

    const videos = await scanSource(
      source,
      config.keywords,
      config.settings.maxVideosPerSource
    );

    let newCount = 0;
    for (const video of videos) {
      if (!checkpoint.videos[video.id]) {
        checkpoint.videos[video.id] = {
          status: "pending",
          title: video.title,
          url: video.url,
        };
        newCount++;
      }
    }

    checkpoint.lastScanned = new Date().toISOString();
    console.log(`   Added ${newCount} new videos to queue`);
    saveSourceCheckpoint(config, checkpoint);
  }

  console.log(`\n✅ Scan complete! Run 'bulk-summarize summarize' to process.`);
}

async function cmdSummarize(options: {
  limit?: number;
  source?: string;
  delay?: number;
  parallel?: number;
}): Promise<void> {
  const config = loadConfig(CONFIG_PATH);
  const delay = options.delay ?? 1000;
  const parallel = options.parallel ?? 1;

  console.log(`📝 Summarizing videos for: ${config.name}`);
  if (parallel > 1) console.log(`   Parallel: ${parallel} concurrent`);
  if (delay !== 1000) console.log(`   Delay: ${delay}ms`);
  console.log();

  let processed = 0;
  const maxProcess = options.limit || Infinity;

  let sources = config.sources.filter((s) => s.enabled !== false);

  if (options.source) {
    sources = sources.filter(
      (s) => s.id === options.source || s.id.includes(options.source!)
    );
  }

  for (const source of sources) {
    if (processed >= maxProcess) break;

    const checkpoint = loadSourceCheckpoint(config, source);
    const pendingVideos = Object.entries(checkpoint.videos)
      .filter(([_, v]) => v.status === "pending")
      .slice(0, maxProcess - processed);

    if (pendingVideos.length === 0) continue;

    console.log(`\n📺 ${source.name}: ${pendingVideos.length} pending`);

    if (parallel > 1) {
      // Parallel processing
      for (let i = 0; i < pendingVideos.length; i += parallel) {
        if (processed >= maxProcess) break;

        const batch = pendingVideos.slice(i, Math.min(i + parallel, maxProcess - processed + i));
        const promises = batch.map(async ([videoId, videoData]) => {
          const result = await summarizeVideo(
            { id: videoId, title: videoData.title, url: videoData.url },
            config,
            source.id
          );
          return { videoId, result };
        });

        const results = await Promise.all(promises);

        for (const { videoId, result } of results) {
          if (result.success) {
            checkpoint.videos[videoId].status = "summarized";
            checkpoint.videos[videoId].processedAt = new Date().toISOString();
          } else {
            checkpoint.videos[videoId].status = "error";
            checkpoint.videos[videoId].error = result.error;
          }
          processed++;
        }

        saveSourceCheckpoint(config, checkpoint);

        if (delay > 0 && i + parallel < pendingVideos.length) {
          await Bun.sleep(delay);
        }
      }
    } else {
      // Sequential processing
      for (const [videoId, videoData] of pendingVideos) {
        if (processed >= maxProcess) break;

        const result = await summarizeVideo(
          { id: videoId, title: videoData.title, url: videoData.url },
          config,
          source.id
        );

        if (result.success) {
          checkpoint.videos[videoId].status = "summarized";
          checkpoint.videos[videoId].processedAt = new Date().toISOString();
        } else {
          checkpoint.videos[videoId].status = "error";
          checkpoint.videos[videoId].error = result.error;
        }

        saveSourceCheckpoint(config, checkpoint);
        processed++;

        if (delay > 0) {
          await Bun.sleep(delay);
        }
      }
    }
  }

  console.log(`\n✅ Processed ${processed} videos`);
}

async function cmdCombine(options: { output?: string }): Promise<void> {
  const config = loadConfig(CONFIG_PATH);
  const outputFile = options.output || COMBINED_FILE;
  const outputDir = getOutputDir(config);

  console.log(`📚 Combining summaries...\n`);

  if (!existsSync(outputDir)) {
    console.log("No summaries directory found.");
    return;
  }

  const summaryFiles: { source: string; path: string }[] = [];

  // Walk source directories
  const sourceDirs = readdirSync(outputDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const sourceId of sourceDirs) {
    const sourceDir = join(outputDir, sourceId);
    const files = readdirSync(sourceDir)
      .filter((f) => f.endsWith(".md") && !f.startsWith("."))
      .map((f) => ({ source: sourceId, path: join(sourceDir, f) }));
    summaryFiles.push(...files);
  }

  if (summaryFiles.length === 0) {
    console.log("No summaries found to combine.");
    return;
  }

  // Sort by source then filename
  summaryFiles.sort((a, b) => {
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return a.path.localeCompare(b.path);
  });

  let combined = `# ${config.name} - Video Summaries

Generated: ${new Date().toISOString()}

This document contains ${summaryFiles.length} summarized videos.

---

## Table of Contents

`;

  // Group by source in TOC
  let currentSource = "";
  for (const { source, path } of summaryFiles) {
    if (source !== currentSource) {
      currentSource = source;
      const sourceName = config.sources.find((s) => s.id === source)?.name || source;
      combined += `\n### ${sourceName}\n\n`;
    }

    const content = readFileSync(path, "utf-8");
    const titleMatch = content.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1] : basename(path);
    const anchor = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    combined += `- [${title}](#${anchor})\n`;
  }

  combined += "\n---\n\n";

  // Add all summaries
  currentSource = "";
  for (const { source, path } of summaryFiles) {
    if (source !== currentSource) {
      currentSource = source;
      const sourceName = config.sources.find((s) => s.id === source)?.name || source;
      combined += `\n# Source: ${sourceName}\n\n---\n\n`;
    }

    const content = readFileSync(path, "utf-8");
    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, "");
    combined += withoutFrontmatter;
    combined += "\n\n---\n\n";
  }

  writeFileSync(outputFile, combined);
  console.log(`✅ Combined ${summaryFiles.length} summaries into: ${outputFile}`);
}

function cmdStatus(): void {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`❌ Config not found: ${CONFIG_PATH}`);
    console.error(`   Run 'bulk-summarize init' to create one`);
    return;
  }

  const config = loadConfig(CONFIG_PATH);

  console.log(`📊 Status: ${config.name}\n`);
  console.log(`Config: ${CONFIG_PATH}`);
  console.log(`Output: ${getOutputDir(config)}/\n`);

  let totalPending = 0;
  let totalSummarized = 0;
  let totalErrors = 0;

  for (const source of config.sources) {
    const enabled = source.enabled !== false;
    const checkpointPath = getSourceCheckpointPath(config, source.id);

    if (!existsSync(checkpointPath)) {
      console.log(`${enabled ? "○" : "⏸"} ${source.name}: Not scanned`);
      continue;
    }

    const checkpoint = loadSourceCheckpoint(config, source);
    const pending = Object.values(checkpoint.videos).filter((v) => v.status === "pending").length;
    const summarized = Object.values(checkpoint.videos).filter((v) => v.status === "summarized").length;
    const errors = Object.values(checkpoint.videos).filter((v) => v.status === "error").length;

    totalPending += pending;
    totalSummarized += summarized;
    totalErrors += errors;

    const lastScanned = checkpoint.lastScanned
      ? new Date(checkpoint.lastScanned).toLocaleDateString()
      : "never";

    console.log(
      `${enabled ? "●" : "⏸"} ${source.name}: ${summarized} done, ${pending} pending` +
        (errors > 0 ? `, ${errors} errors` : "") +
        ` (scanned: ${lastScanned})`
    );
  }

  console.log(
    `\n📈 Total: ${totalSummarized} summarized, ${totalPending} pending` +
      (totalErrors > 0 ? `, ${totalErrors} errors` : "")
  );
}

function cmdReset(target?: string): void {
  const config = loadConfig(CONFIG_PATH);

  if (target) {
    const checkpointPath = getSourceCheckpointPath(config, target);
    if (existsSync(checkpointPath)) {
      const checkpoint = loadSourceCheckpoint(config, { id: target, name: target, url: "" });
      checkpoint.videos = {};
      checkpoint.lastScanned = undefined;
      saveSourceCheckpoint(config, checkpoint);
      console.log(`✅ Reset: ${target}`);
    } else {
      console.log(`❌ Source not found or not scanned: ${target}`);
    }
  } else {
    // Reset all sources
    for (const source of config.sources) {
      const checkpointPath = getSourceCheckpointPath(config, source.id);
      if (existsSync(checkpointPath)) {
        const checkpoint = loadSourceCheckpoint(config, source);
        checkpoint.videos = {};
        checkpoint.lastScanned = undefined;
        saveSourceCheckpoint(config, checkpoint);
      }
    }
    console.log(`✅ Reset all source checkpoints`);
  }
}

function cmdList(): void {
  const config = loadConfig(CONFIG_PATH);

  console.log(`📋 Sources in ${CONFIG_PATH}:\n`);

  for (const source of config.sources) {
    const enabled = source.enabled !== false;
    console.log(`${enabled ? "●" : "○"} ${source.id}`);
    console.log(`  Name: ${source.name}`);
    console.log(`  URL: ${source.url}`);
    if (source.tags?.length) {
      console.log(`  Tags: ${source.tags.join(", ")}`);
    }
    console.log();
  }
}

// ============================================================================
// CLI Parser
// ============================================================================

function printHelp(): void {
  console.log(`
bulk-summarize v${VERSION} - Bulk YouTube video summarizer

Usage: bulk-summarize [options] <command> [args]

Commands:
  init [name]              Create a starter config file
  scan                     Scan sources for videos matching keywords
  summarize                Summarize pending videos
  combine                  Combine all summaries into one document
  status                   Show progress for all sources
  list                     List configured sources
  reset [source]           Reset checkpoint (all or specific source)
  help                     Show this help message

Options:
  -c, --config <file>      Config file (default: bulk-summarize.json)
  -o, --output-dir <dir>   Output directory (overrides config)
  -s, --source <id>        Target specific source by ID
  -n, --limit <n>          Limit number of videos to process
  -d, --delay <ms>         Delay between videos in ms (default: 1000)
  -p, --parallel <n>       Number of concurrent summarizations (default: 1)
  --output <file>          Output file for combine command

Output Structure:
  summaries/
    source-id/
      .checkpoint.json     # Tracks pending/done for this source
      video-id-1.md        # Individual summaries
      video-id-2.md
    another-source/
      .checkpoint.json
      video-id-3.md

Examples:
  bulk-summarize init
  bulk-summarize scan
  bulk-summarize scan -s my-podcast
  bulk-summarize summarize -n 10
  bulk-summarize summarize -p 3 -d 500    # 3 parallel, 500ms delay
  bulk-summarize combine --output notes.md

Dependencies:
  - bun: https://bun.sh
  - yt-dlp: https://github.com/yt-dlp/yt-dlp
  - summarize: https://summarize.sh (https://github.com/steipete/summarize)
`);
}

interface ParsedArgs {
  command: string;
  config?: string;
  outputDir?: string;
  source?: string;
  limit?: number;
  output?: string;
  target?: string;
  delay?: number;
  parallel?: number;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = { command: "help" };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-c" || arg === "--config") {
      result.config = args[++i];
    } else if (arg === "-o" || arg === "--output-dir") {
      result.outputDir = args[++i];
    } else if (arg === "-s" || arg === "--source") {
      result.source = args[++i];
    } else if (arg === "-n" || arg === "--limit") {
      result.limit = parseInt(args[++i]);
    } else if (arg === "--output") {
      result.output = args[++i];
    } else if (arg === "-d" || arg === "--delay") {
      result.delay = parseInt(args[++i]);
    } else if (arg === "-p" || arg === "--parallel") {
      result.parallel = parseInt(args[++i]);
    } else if (arg === "-h" || arg === "--help") {
      result.command = "help";
    } else if (arg === "-v" || arg === "--version") {
      result.command = "version";
    } else if (!arg.startsWith("-")) {
      if (!result.command || result.command === "help") {
        result.command = arg;
      } else {
        result.target = arg;
      }
    }
  }

  return result;
}

// ============================================================================
// Main
// ============================================================================

const args = parseArgs(process.argv.slice(2));

if (args.config) CONFIG_PATH = args.config;
if (args.outputDir) OUTPUT_DIR = args.outputDir;

switch (args.command) {
  case "init":
    await cmdInit(args.target);
    break;
  case "scan":
    await cmdScan({ source: args.source });
    break;
  case "summarize":
    await cmdSummarize({
      limit: args.limit,
      source: args.source,
      delay: args.delay,
      parallel: args.parallel,
    });
    break;
  case "combine":
    await cmdCombine({ output: args.output });
    break;
  case "status":
    cmdStatus();
    break;
  case "list":
    cmdList();
    break;
  case "reset":
    cmdReset(args.target);
    break;
  case "version":
    console.log(`bulk-summarize v${VERSION}`);
    break;
  case "help":
  default:
    printHelp();
}
