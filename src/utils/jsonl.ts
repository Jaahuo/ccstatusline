import {
    mkdir,
    readFile,
    stat,
    writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { glob } from 'tinyglobby';

import type { BlockMetrics } from '../types';

import { getClaudeConfigDir } from './claude-settings';

// --- Block Cache Functions ---

interface BlockCache { startTime: string }

/**
 * Returns the path to the block cache file
 */
export function getBlockCachePath(): string {
    return path.join(os.homedir(), '.cache', 'ccstatusline', 'block-cache.json');
}

/**
 * Reads the block cache file and returns the cached start time
 * Returns null if cache doesn't exist or is invalid
 */
export async function readBlockCache(): Promise<Date | null> {
    try {
        const cachePath = getBlockCachePath();
        const content = await readFile(cachePath, 'utf-8');
        const cache = JSON.parse(content) as BlockCache;
        if (typeof cache.startTime !== 'string') {
            return null;
        }
        const date = new Date(cache.startTime);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        return date;
    } catch {
        return null;
    }
}

/**
 * Writes the block start time to the cache file
 * Creates the cache directory if it doesn't exist
 */
export async function writeBlockCache(startTime: Date): Promise<void> {
    try {
        const cachePath = getBlockCachePath();
        const cacheDir = path.dirname(cachePath);
        await mkdir(cacheDir, { recursive: true });
        const cache: BlockCache = { startTime: startTime.toISOString() };
        await writeFile(cachePath, JSON.stringify(cache), 'utf-8');
    } catch {
        // Silently fail - caching is best-effort
    }
}

/**
 * Gets block metrics with caching support
 * Returns cached result if still valid, otherwise recalculates
 */
export async function getCachedBlockMetrics(sessionDurationHours = 5): Promise<BlockMetrics | null> {
    const sessionDurationMs = sessionDurationHours * 60 * 60 * 1000;
    const now = new Date();

    // Check cache first
    const cachedStartTime = await readBlockCache();
    if (cachedStartTime) {
        const blockEndTime = new Date(cachedStartTime.getTime() + sessionDurationMs);
        if (now.getTime() <= blockEndTime.getTime()) {
            // Cache is valid - return cached result
            return {
                startTime: cachedStartTime,
                lastActivity: now // We don't cache lastActivity, use current time
            };
        }
        // Cache expired - need to recalculate
    }

    // Cache miss or expired - run full calculation
    const metrics = await getBlockMetrics();

    // Write to cache if we found a valid block
    if (metrics) {
        await writeBlockCache(metrics.startTime);
    }

    return metrics;
}

/**
 * Gets block metrics for the current 5-hour block from JSONL files
 */
export async function getBlockMetrics(): Promise<BlockMetrics | null> {
    const claudeDir: string | null = getClaudeConfigDir();

    if (!claudeDir)
        return null;

    try {
        return await findMostRecentBlockStartTime(claudeDir);
    } catch {
        return null;
    }
}

/**
 * Efficiently finds the most recent 5-hour block start time from JSONL files
 * Uses file modification times as hints to avoid unnecessary reads
 */
async function findMostRecentBlockStartTime(
    rootDir: string,
    sessionDurationHours = 5
): Promise<BlockMetrics | null> {
    const sessionDurationMs = sessionDurationHours * 60 * 60 * 1000;
    const now = new Date();

    // Step 1: Find all JSONL files with their modification times
    // Use forward slashes for glob patterns on all platforms (tinyglobby requirement)
    const pattern = path.posix.join(rootDir.replace(/\\/g, '/'), 'projects', '**', '*.jsonl');
    const files = await glob([pattern], {
        absolute: true,  // Ensure we get absolute paths
        cwd: rootDir     // Set working directory to rootDir
    });

    if (files.length === 0)
        return null;

    // Step 2: Get file stats and sort by modification time (most recent first)
    const filesWithStats = await Promise.all(files.map(async (file) => {
        const stats = await stat(file);
        return { file, mtime: stats.mtime };
    }));

    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Step 3: Progressive lookback - start small and expand if needed
    // Start with 2x session duration (10 hours), expand to 48 hours if needed
    const lookbackChunks = [
        10,  // 2x session duration - catches most cases
        20,  // 4x session duration - catches longer sessions
        48   // Maximum lookback for marathon sessions
    ];

    let timestamps: Date[] = [];
    let mostRecentTimestamp: Date | null = null;
    let continuousWorkStart: Date | null = null;
    let foundSessionGap = false;

    for (const lookbackHours of lookbackChunks) {
        const cutoffTime = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
        timestamps = [];

        // Collect timestamps for this lookback period
        for (const { file, mtime } of filesWithStats) {
            if (mtime.getTime() < cutoffTime.getTime()) {
                break;
            }
            const fileTimestamps = await getAllTimestampsFromFile(file);
            timestamps.push(...fileTimestamps);
        }

        if (timestamps.length === 0) {
            continue; // Try next chunk
        }

        // Sort timestamps (most recent first)
        timestamps.sort((a, b) => b.getTime() - a.getTime());

        // Get most recent timestamp (only set once)
        if (!mostRecentTimestamp && timestamps[0]) {
            mostRecentTimestamp = timestamps[0];

            // Check if the most recent activity is within the current session period
            const timeSinceLastActivity = now.getTime() - mostRecentTimestamp.getTime();
            if (timeSinceLastActivity > sessionDurationMs) {
                // No activity within the current session period
                return null;
            }
        }

        // Look for a session gap in this chunk
        continuousWorkStart = mostRecentTimestamp;
        for (let i = 1; i < timestamps.length; i++) {
            const currentTimestamp = timestamps[i];
            const previousTimestamp = timestamps[i - 1];

            if (!currentTimestamp || !previousTimestamp)
                continue;

            const gap = previousTimestamp.getTime() - currentTimestamp.getTime();

            if (gap >= sessionDurationMs) {
                // Found a true session boundary
                foundSessionGap = true;
                break;
            }

            continuousWorkStart = currentTimestamp;
        }

        // If we found a gap, we're done
        if (foundSessionGap) {
            break;
        }

        // If this was our last chunk, use what we have
        if (lookbackHours === lookbackChunks[lookbackChunks.length - 1]) {
            break;
        }
    }

    if (!mostRecentTimestamp || !continuousWorkStart) {
        return null;
    }

    // Build actual blocks from timestamps going forward
    const blocks: { start: Date; end: Date }[] = [];
    const sortedTimestamps = timestamps.slice().sort((a, b) => a.getTime() - b.getTime());

    let currentBlockStart: Date | null = null;
    let currentBlockEnd: Date | null = null;

    for (const timestamp of sortedTimestamps) {
        if (timestamp.getTime() < continuousWorkStart.getTime())
            continue;

        if (!currentBlockStart || (currentBlockEnd && timestamp.getTime() > currentBlockEnd.getTime())) {
            // Start new block
            currentBlockStart = floorToHour(timestamp);
            currentBlockEnd = new Date(currentBlockStart.getTime() + sessionDurationMs);
            blocks.push({ start: currentBlockStart, end: currentBlockEnd });
        }
    }

    // Find current block
    for (const block of blocks) {
        if (now.getTime() >= block.start.getTime() && now.getTime() <= block.end.getTime()) {
            // Verify we have activity in this block
            const hasActivity = timestamps.some(t => t.getTime() >= block.start.getTime()
                && t.getTime() <= block.end.getTime()
            );

            if (hasActivity) {
                return {
                    startTime: block.start,
                    lastActivity: mostRecentTimestamp
                };
            }
        }
    }

    return null;
}

/**
 * Gets all timestamps from a JSONL file
 */
async function getAllTimestampsFromFile(filePath: string): Promise<Date[]> {
    const timestamps: Date[] = [];
    try {
        const content = await readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.length > 0);

        for (const line of lines) {
            try {
                const json = JSON.parse(line) as {
                    timestamp?: string;
                    isSidechain?: boolean;
                    message?: { usage?: { input_tokens?: number; output_tokens?: number } };
                };

                // Only treat entries with real token usage as block activity
                const usage = json.message?.usage;
                if (!usage)
                    continue;

                const hasInputTokens = typeof usage.input_tokens === 'number';
                const hasOutputTokens = typeof usage.output_tokens === 'number';
                if (!hasInputTokens || !hasOutputTokens)
                    continue;

                if (json.isSidechain === true)
                    continue;

                const timestamp = json.timestamp;
                if (typeof timestamp !== 'string')
                    continue;

                const date = new Date(timestamp);
                if (!Number.isNaN(date.getTime()))
                    timestamps.push(date);
            } catch {
                // Skip invalid JSON lines
                continue;
            }
        }

        return timestamps;
    } catch {
        return [];
    }
}

/**
 * Floors a timestamp to the beginning of the hour (matching existing logic)
 */
function floorToHour(timestamp: Date): Date {
    const floored = new Date(timestamp);
    floored.setUTCMinutes(0, 0, 0);
    return floored;
}