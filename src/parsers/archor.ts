import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

interface TypeInfo {
	text: string;
	href?: string;
}

interface TableRow {
	name: string;
	type: TypeInfo;
	required?: string;
	description: string;
}

interface ParsedSection {
	anchor: string;
	title: string;
	sectionType: "Method" | "Object" | "Unknown";
	description?: string;
	table?: TableRow[];
	descriptionAfterTable?: string;
}

function getHtmlUntil(
	startNode: Cheerio<Element> | null,
	untilSelector: string,
	$: CheerioAPI,
): string {
	if (!startNode?.length) return "";

	let html = "";
	let currentNode = startNode.next();
	while (currentNode.length && !currentNode.is(untilSelector)) {
		html += $.html(currentNode);
		currentNode = currentNode.next();
	}
	return html.trim();
}

export function parseAnchor(
	$: CheerioAPI,
	anchorElement: Cheerio<Element>,
): ParsedSection | null {
	const parentH4 = anchorElement.parent("h4");
	if (!parentH4.length) return null;

	const anchorName = anchorElement.attr("name");
	if (!anchorName) return null;

	const title = parentH4
		.contents()
		.filter((_, node) => node.type === "text")
		.text()
		.trim();
	if (!title) return null;

	let description = "";
	let currentDescriptionNode: Cheerio<Element> | null = parentH4;
	let nextElementAfterDescription: Cheerio<Element> | null = null;

	let currentNode = parentH4.next();
	while (currentNode.length && currentNode.is("p")) {
		description += $.html(currentNode);
		currentDescriptionNode = currentNode;
		currentNode = currentNode.next();
	}
	nextElementAfterDescription = currentNode.length ? currentNode : null;
	const finalDescription = description.trim() || undefined;

	let tableElement: Cheerio<Element>;
	if (nextElementAfterDescription?.is("table.table")) {
		tableElement = nextElementAfterDescription;
	} else {
		const searchStartNode = currentDescriptionNode ?? parentH4;
		tableElement = searchStartNode
			.nextUntil("h4")
			.filter("table.table")
			.first();
	}

	let tableData: TableRow[] | undefined = undefined;
	let sectionType: "Method" | "Object" | "Unknown" = "Unknown";

	if (tableElement?.length) {
		tableData = [];
		const headers = tableElement
			.find("thead th")
			.map((_, th) => $(th).text().trim())
			.get();

		if (headers[0] === "Parameter") {
			sectionType = "Method";
		} else if (headers[0] === "Field") {
			sectionType = "Object";
		}

		tableElement.find("tbody tr").each((_, tr) => {
			const cells = $(tr).find("td");
			let row: TableRow | null = null;

			if (sectionType === "Method" && cells.length >= 3) {
				const typeLink = cells.eq(1).find("a");
				row = {
					name: cells.eq(0).text().trim(),
					type: {
						text: cells.eq(1).text().trim(),
						href: typeLink.attr("href") ?? undefined,
					},
					required: cells.eq(2).text().trim(),
					description: cells.eq(3).html()?.trim() ?? "",
				};
			} else if (sectionType === "Object" && cells.length >= 2) {
				const typeLink = cells.eq(1).find("a");
				row = {
					name: cells.eq(0).text().trim(),
					type: {
						text: cells.eq(1).text().trim(),
						href: typeLink.attr("href") ?? undefined,
					},
					description: cells.eq(2).html()?.trim() ?? "",
				};
			} else if (sectionType === "Unknown" && cells.length >= 2) {
				const typeLink = cells.eq(1).find("a");
				row = {
					name: cells.eq(0).text().trim(),
					type: {
						text: cells.eq(1).text().trim(),
						href: typeLink.attr("href") ?? undefined,
					},
					description: cells.eq(2).html()?.trim() ?? "",
				};
			}

			if (row) {
				tableData?.push(row);
			}
		});
	}

	if (sectionType === "Unknown" && title) {
		if (
			title[0] === title[0].toUpperCase() &&
			title[0] !== title[0].toLowerCase()
		) {
			sectionType = "Object";
		} else if (
			title[0] === title[0].toLowerCase() &&
			title[0] !== title[0].toUpperCase()
		) {
			sectionType = "Method";
		}
	}

	const startNodeForAfterDesc = tableElement?.length
		? tableElement
		: (nextElementAfterDescription ?? parentH4);
	const descriptionAfterTable = getHtmlUntil(startNodeForAfterDesc, "h4", $);

	return {
		anchor: anchorName,
		title,
		sectionType,
		description: finalDescription,
		table: tableData,
		descriptionAfterTable: descriptionAfterTable || undefined,
	};
}

export function parseAllSections($: CheerioAPI): ParsedSection[] {
	const sections: ParsedSection[] = [];
	$("h4 > a.anchor").each((_, anchor) => {
		const section = parseAnchor($, $(anchor));
		if (section) {
			sections.push(section);
		}
	});
	return sections;
}
