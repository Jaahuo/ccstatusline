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

export class GitBranchWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the current git branch name'; }
    getDisplayName(): string { return 'Git Branch'; }
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
            return item.rawValue ? 'main' : '⎇ main';
        }

        const branch = await this.getGitBranch();
        if (branch)
            return item.rawValue ? branch : `⎇ ${branch}`;

        return hideNoGit ? null : '⎇ no git';
    }

    private async getGitBranch(): Promise<string | null> {
        try {
            const { stdout } = await execAsync('git branch --show-current', { encoding: 'utf8' });
            const branch = stdout.trim();
            return branch || null;
        } catch {
            return null;
        }
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no git\' message', action: 'toggle-nogit' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}