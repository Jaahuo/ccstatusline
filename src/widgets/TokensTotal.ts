import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { formatTokens } from '../utils/renderer';

export class TokensTotalWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows total token count (input + output + cache) for the current session'; }
    getDisplayName(): string { return 'Tokens Total'; }
    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '30.6k' : 'Total: 30.6k';
        } else if (context.tokenMetrics) {
            return item.rawValue ? formatTokens(context.tokenMetrics.totalTokens) : `Total: ${formatTokens(context.tokenMetrics.totalTokens)}`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}