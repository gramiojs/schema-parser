import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "cheerio";

export async function fetchTelegramBotAPIContent() {
	const response = await fetch("https://core.telegram.org/bots/api", {
		headers: {
			accept:
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
			"accept-language": "ru-RU,ru;q=0.9,en-RU;q=0.8,en;q=0.7,en-US;q=0.6",
			"cache-control": "no-cache",
			pragma: "no-cache",
			priority: "u=0, i",
			"sec-ch-ua":
				'"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
			"sec-ch-ua-mobile": "?0",
			"sec-ch-ua-platform": '"Windows"',
			"sec-fetch-dest": "document",
			"sec-fetch-mode": "navigate",
			"sec-fetch-site": "same-origin",
			"sec-fetch-user": "?1",
			"upgrade-insecure-requests": "1",
		},
		referrerPolicy: "strict-origin-when-cross-origin",
		body: null,
		method: "GET",
		mode: "cors",
		credentials: "omit",
	});
	const html = await response.text();

	const $ = load(html);

	return $;
}

export function getTelegramBotAPIContentFromFile() {
	const html = readFileSync(join(__dirname, "../api.html"), "utf-8");

	const $ = load(html);

	return $;
}

function isFirstLetterLowercase(str: string) {
	return str[0] === str[0].toLowerCase();
}
