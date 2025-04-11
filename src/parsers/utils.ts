import TurndownService from "turndown";

export const turndownService = new TurndownService();

export function htmlToMarkdown(html?: string) {
	return html ? turndownService.turndown(html) : undefined;
}
