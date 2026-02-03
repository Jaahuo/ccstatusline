import chalk from 'chalk';
import {
    Box,
    Text
} from 'ink';
import React, {
    useEffect,
    useState
} from 'react';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLineWithInfo,
    type PreRenderedWidget,
    type RenderResult
} from '../../utils/renderer';
import { canDetectTerminalWidth } from '../../utils/terminal';

export interface StatusLinePreviewProps {
    lines: WidgetItem[][];
    terminalWidth: number;
    settings?: Settings;
    onTruncationChange?: (isTruncated: boolean) => void;
}

const renderSingleLine = async (
    widgets: WidgetItem[],
    terminalWidth: number,
    _widthDetectionAvailable: boolean,
    settings: Settings,
    lineIndex: number,
    globalSeparatorIndex: number,
    preRenderedWidgets: PreRenderedWidget[],
    preCalculatedMaxWidths: number[]
): Promise<RenderResult> => {
    // Create render context for preview
    const context: RenderContext = {
        terminalWidth,
        isPreview: true,
        lineIndex,
        globalSeparatorIndex
    };

    return renderStatusLineWithInfo(widgets, settings, context, preRenderedWidgets, preCalculatedMaxWidths);
};

export const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ lines, terminalWidth, settings, onTruncationChange }) => {
    const [widthDetectionAvailable, setWidthDetectionAvailable] = useState(false);
    const [renderedLines, setRenderedLines] = useState<string[]>([]);
    const [anyTruncated, setAnyTruncated] = useState(false);

    // Check terminal width detection availability
    useEffect(() => {
        void canDetectTerminalWidth().then(setWidthDetectionAvailable);
    }, []);

    // Render each configured line asynchronously
    useEffect(() => {
        if (!settings) {
            setRenderedLines([]);
            setAnyTruncated(false);
            return;
        }

        const renderAsync = async () => {
            // Always pre-render all widgets once (for efficiency)
            const preRenderedLines = await preRenderAllWidgets(lines, settings, { terminalWidth, isPreview: true });
            const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);

            let globalSeparatorIndex = 0;
            const result: string[] = [];
            let truncated = false;

            for (let i = 0; i < lines.length; i++) {
                const lineItems = lines[i];
                if (lineItems && lineItems.length > 0) {
                    const preRenderedWidgets = preRenderedLines[i] ?? [];
                    const renderResult = await renderSingleLine(lineItems, terminalWidth, widthDetectionAvailable, settings, i, globalSeparatorIndex, preRenderedWidgets, preCalculatedMaxWidths);
                    result.push(renderResult.line);
                    if (renderResult.wasTruncated) {
                        truncated = true;
                    }

                    // Count separators used in this line (widgets - 1, excluding merged widgets)
                    const nonMergedWidgets = lineItems.filter((_, idx) => idx === lineItems.length - 1 || !lineItems[idx]?.merge);
                    if (nonMergedWidgets.length > 1) {
                        globalSeparatorIndex += nonMergedWidgets.length - 1;
                    }
                }
            }

            setRenderedLines(result);
            setAnyTruncated(truncated);
        };

        void renderAsync();
    }, [lines, terminalWidth, widthDetectionAvailable, settings]);

    // Notify parent when truncation status changes
    useEffect(() => {
        onTruncationChange?.(anyTruncated);
    }, [anyTruncated, onTruncationChange]);

    return (
        <Box flexDirection='column'>
            <Box borderStyle='round' borderColor='gray' borderDimColor width='100%' paddingLeft={1}>
                <Text>
                    &gt;
                    <Text dimColor> Preview  (ctrl+s to save configuration at any time)</Text>
                </Text>
            </Box>
            {renderedLines.map((line, index) => (
                <Text key={index}>
                    {'  '}
                    {line}
                    {chalk.reset('')}
                </Text>
            ))}
        </Box>
    );
};