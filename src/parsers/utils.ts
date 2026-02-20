import TurndownService from "turndown";

export const turndownService = new TurndownService({
	emDelimiter: "*",
	linkReferenceStyle: "full",
});

const TELEGRAM_URL = "https://core.telegram.org";

const TELEGRAM_BOT_API_URL = `${TELEGRAM_URL}/bots/api`;

turndownService.addRule("link", {
	filter: ["a"],
	replacement: (content, node, _options) => {
		let href = (node as HTMLElement).getAttribute("href");

		if (!href) {
			return content;
		}

		if (href.startsWith("#")) {
			href = `${TELEGRAM_BOT_API_URL}${href}`;
		}

		if (href.startsWith("/") && !href.startsWith("//")) {
			href = `${TELEGRAM_URL}${href}`;
		}

		return `[${node.textContent}](${href})`;
	},
});

export function htmlToMarkdown(html?: string) {
	return html ? turndownService.turndown(html) : undefined;
}
