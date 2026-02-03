import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { GitWorktreeWidget } from '../GitWorktree';

function render(rawValue = false, isPreview = false) {
    const widget = new GitWorktreeWidget();
    const context: RenderContext = { isPreview };
    const item: WidgetItem = {
        id: 'git-worktree',
        type: 'git-worktree',
        rawValue
    };

    return widget.render(item, context);
}

describe('GitWorktreeWidget', () => {
    it('should render preview', async () => {
        const isPreview = true;
        const rawValue = false;

        expect(await render(rawValue, isPreview)).toBe('𖠰 main');
    });

    it('should render preview with raw value', async () => {
        const isPreview = true;
        const rawValue = true;

        expect(await render(rawValue, isPreview)).toBe('main');
    });
});