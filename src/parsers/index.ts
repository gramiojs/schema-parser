import type { CheerioAPI } from "cheerio";
import { parseDateString } from "./date-parser.ts";

/** Release date of a Telegram Bot API version. */
export interface ReleaseDate {
	/** Day of month (1–31). */
	day: number;
	/** Month number (1–12). */
	month: number;
	/** Full year (e.g. 2025). */
	year: number;
}

/** Parsed Telegram Bot API version from the documentation page. */
export interface Version {
	/** Major version number (e.g. `9` in `9.0`). */
	major: number;
	/** Minor version number (e.g. `0` in `9.0`). */
	minor: number;
	/** Date when this version was released. */
	release_date: ReleaseDate;
}

export function parseLastVersion($: CheerioAPI): Version {
	const version = $("#dev_page_content > p:nth-child(5) > strong").text();

	const versionParts = version.split(" ");

	const matchedVersion = versionParts[2];

	if (!/^\d+\.\d+$/.test(matchedVersion)) {
		throw new Error("Invalid version format");
	}

	const [major, minor] = matchedVersion.split(".").map(Number);

	const date = $("#dev_page_content > h4 > a").attr("name");

	if (!date) {
		throw new Error("No release date found");
	}

	return {
		major,
		minor,
		release_date: parseDateString(date),
	};
}
