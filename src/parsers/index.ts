import type { CheerioAPI } from "cheerio";
import { parseDateString } from "./date-parser.ts";

export function parseLastVersion($: CheerioAPI) {
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
