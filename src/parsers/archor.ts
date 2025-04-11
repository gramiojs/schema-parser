import type { CheerioAPI } from "cheerio";

export function parseAnchor($: CheerioAPI, href: string) {
	const anchor = $(`a[href="${href}"]`);

	if (!anchor.length) {
		throw new Error(`Anchor with href ${href} not found`);
	}

	console.log(anchor.html());

	return anchor;
}
