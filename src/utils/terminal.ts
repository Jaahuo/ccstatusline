import * as fs from 'fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'path';

const execAsync = promisify(exec);

// Get package version
// __PACKAGE_VERSION__ will be replaced at build time
const PACKAGE_VERSION = '__PACKAGE_VERSION__';

export function getPackageVersion(): string {
    // If we have the build-time replaced version, use it (check if it looks like a version)
    if (/^\d+\.\d+\.\d+/.test(PACKAGE_VERSION)) {
        return PACKAGE_VERSION;
    }

    // Fallback for development mode
    const possiblePaths = [
        path.join(__dirname, '..', '..', 'package.json'), // Development: dist/utils/ -> root
        path.join(__dirname, '..', 'package.json')       // Production: dist/ -> root (bundled)
    ];

    for (const packageJsonPath of possiblePaths) {
        try {
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
                return packageJson.version ?? '';
            }
        } catch {
            // Continue to next path
        }
    }

    return '';
}

// Get terminal width
export async function getTerminalWidth(): Promise<number | null> {
    try {
        // First try to get the tty of the parent process
        const { stdout: ttyOutput } = await execAsync('ps -o tty= -p $(ps -o ppid= -p $$)', {
            encoding: 'utf8',
            shell: '/bin/sh'
        });
        const tty = ttyOutput.trim();

        // Check if we got a valid tty (not ?? which means no tty)
        if (tty && tty !== '??' && tty !== '?') {
            // Now get the terminal size
            const { stdout: widthOutput } = await execAsync(
                `stty size < /dev/${tty} | awk '{print $2}'`,
                {
                    encoding: 'utf8',
                    shell: '/bin/sh'
                }
            );
            const width = widthOutput.trim();

            const parsed = parseInt(width, 10);
            if (!isNaN(parsed) && parsed > 0) {
                return parsed;
            }
        }
    } catch {
        // Command failed, width detection not available
    }

    // Fallback: try tput cols which might work in some environments
    try {
        const { stdout } = await execAsync('tput cols 2>/dev/null', { encoding: 'utf8' });
        const width = stdout.trim();

        const parsed = parseInt(width, 10);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    } catch {
        // tput also failed
    }

    return null;
}

// Check if terminal width detection is available
export async function canDetectTerminalWidth(): Promise<boolean> {
    try {
        // First try to get the tty of the parent process
        const { stdout: ttyOutput } = await execAsync('ps -o tty= -p $(ps -o ppid= -p $$)', {
            encoding: 'utf8',
            shell: '/bin/sh'
        });
        const tty = ttyOutput.trim();

        // Check if we got a valid tty
        if (tty && tty !== '??' && tty !== '?') {
            const { stdout: widthOutput } = await execAsync(
                `stty size < /dev/${tty} | awk '{print $2}'`,
                {
                    encoding: 'utf8',
                    shell: '/bin/sh'
                }
            );
            const width = widthOutput.trim();

            const parsed = parseInt(width, 10);
            if (!isNaN(parsed) && parsed > 0) {
                return true;
            }
        }
    } catch {
        // Try fallback
    }

    // Fallback: try tput cols
    try {
        const { stdout } = await execAsync('tput cols 2>/dev/null', { encoding: 'utf8' });
        const width = stdout.trim();

        const parsed = parseInt(width, 10);
        return !isNaN(parsed) && parsed > 0;
    } catch {
        return false;
    }
}