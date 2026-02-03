import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { formatTokens } from '../utils/renderer';

export class TokensOutputWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Shows output token count for the current session'; }
    getDisplayName(): string { return 'Tokens Output'; }
    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '3.4k' : 'Out: 3.4k';
        } else if (context.tokenMetrics) {
            return item.rawValue ? formatTokens(context.tokenMetrics.outputTokens) : `Out: ${formatTokens(context.tokenMetrics.outputTokens)}`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}