import TurndownService from "turndown";

export const turndownService = new TurndownService({
	emDelimiter: "*",
	linkReferenceStyle: "full",
});

const TELEGRAM_URL = "https://core.telegram.org";

const TELEGRAM_BOT_API_URL = `${TELEGRAM_URL}/bots/api`;

turndownService.addRule("emoji-img", {
	filter: (node) =>
		node.nodeName === "IMG" &&
		(node as HTMLElement).getAttribute("src")?.startsWith("//") === true,
	replacement: (_content, node) => {
		const el = node as HTMLElement;
		const alt = el.getAttribute("alt") ?? "";
		const src = `https:${el.getAttribute("src")}`;
		return `![${alt}](${src})`;
	},
});

turndownService.addRule("telegram-file-img", {
	filter: (node) =>
		node.nodeName === "IMG" &&
		(node as HTMLElement).getAttribute("src")?.startsWith("/file/") === true,
	replacement: (_content, node) => {
		const el = node as HTMLElement;
		const alt = el.getAttribute("alt") ?? "";
		const src = el.getAttribute("src") ?? "";
		return `![${alt}](${TELEGRAM_URL}${src})`;
	},
});

turndownService.addRule("link", {
	filter: ["a"],
	replacement: (content, node, _options) => {
		let href = (node as HTMLElement).getAttribute("href");

		if (!href) {
			return content;
		}

		if (!content.trim()) {
			return "";
		}

		if (href.startsWith("#")) {
			href = `${TELEGRAM_BOT_API_URL}${href}`;
		}

		if (href.startsWith("/") && !href.startsWith("//")) {
			href = `${TELEGRAM_URL}${href}`;
		}

		return `[${content}](${href})`;
	},
});

export function htmlToMarkdown(html?: string) {
	return html ? turndownService.turndown(html) : undefined;
}
