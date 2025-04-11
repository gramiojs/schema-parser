import TurndownService from "turndown";

export const turndownService = new TurndownService();

export function htmlToMarkdown(html: string) {
	return turndownService.turndown(html);
}

