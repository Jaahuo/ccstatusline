import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

const execAsync = promisify(exec);

export class GitChangesWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows git changes count (+insertions, -deletions)'; }
    getDisplayName(): string { return 'Git Changes'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const hideNoGit = item.metadata?.hideNoGit === 'true';
        const modifiers: string[] = [];

        if (hideNoGit) {
            modifiers.push('hide \'no git\'');
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-nogit') {
            const currentState = item.metadata?.hideNoGit === 'true';
            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    hideNoGit: (!currentState).toString()
                }
            };
        }
        return null;
    }

    async render(item: WidgetItem, context: RenderContext, settings: Settings): Promise<string | null> {
        const hideNoGit = item.metadata?.hideNoGit === 'true';

        if (context.isPreview) {
            return '(+42,-10)';
        }

        const changes = await this.getGitChanges();
        if (changes)
            return `(+${changes.insertions},-${changes.deletions})`;
        else
            return hideNoGit ? null : '(no git)';
    }

    private async getGitChanges(): Promise<{ insertions: number; deletions: number } | null> {
        try {
            let totalInsertions = 0;
            let totalDeletions = 0;

            const [unstagedResult, stagedResult] = await Promise.all([
                execAsync('git diff --shortstat', { encoding: 'utf8' }).catch(() => ({ stdout: '' })),
                execAsync('git diff --cached --shortstat', { encoding: 'utf8' }).catch(() => ({ stdout: '' }))
            ]);

            const unstagedStat = unstagedResult.stdout.trim();
            const stagedStat = stagedResult.stdout.trim();

            if (unstagedStat) {
                const insertMatch = /(\d+) insertion/.exec(unstagedStat);
                const deleteMatch = /(\d+) deletion/.exec(unstagedStat);
                totalInsertions += insertMatch?.[1] ? parseInt(insertMatch[1], 10) : 0;
                totalDeletions += deleteMatch?.[1] ? parseInt(deleteMatch[1], 10) : 0;
            }

            if (stagedStat) {
                const insertMatch = /(\d+) insertion/.exec(stagedStat);
                const deleteMatch = /(\d+) deletion/.exec(stagedStat);
                totalInsertions += insertMatch?.[1] ? parseInt(insertMatch[1], 10) : 0;
                totalDeletions += deleteMatch?.[1] ? parseInt(deleteMatch[1], 10) : 0;
            }

            return { insertions: totalInsertions, deletions: totalDeletions };
        } catch {
            return null;
        }
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no git\' message', action: 'toggle-nogit' }
        ];
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}