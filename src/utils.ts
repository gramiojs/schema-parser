import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "cheerio";

export async function fetchTelegramBotAPIContent() {
	const response = await fetch("https://core.telegram.org/bots/api");
	const html = await response.text();

	const $ = load(html);

	return $;
}

export function getTelegramBotAPIContentFromFile() {
	const html = readFileSync(join(__dirname, "../api.html"), "utf-8");

	const $ = load(html);

	return $;
}
