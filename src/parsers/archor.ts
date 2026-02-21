import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type { NavItem } from "./navbar.ts";

/** A type reference extracted from an HTML cell — text plus an optional anchor href. */
export interface TypeInfo {
	/** The raw text content of the type cell (e.g. `"Integer"`, `"Array of PhotoSize"`). */
	text: string;
	/** Anchor href of the first link in the cell, if present (e.g. `"#photosize"`). */
	href?: string;
}

/** A single row extracted from a Telegram Bot API HTML table. */
export interface TableRow {
	/** Parameter / field name (column 0). */
	name: string;
	/** Type info extracted from the type column (column 1). */
	type: TypeInfo;
	/**
	 * Raw text of the "Required" column (column 2), only present for method tables.
	 * Typical values: `"Yes"`, `"Optional"`.
	 */
	required?: string;
	/** Inner HTML of the description column. */
	description: string;
}

/**
 * A single section parsed from a Telegram Bot API anchor (`<h4>` heading).
 * Represents either a method or a type definition.
 */
export interface ParsedSection {
	/** Anchor href to this section (e.g. `"#sendmessage"`). */
	anchor: string;
	/** Human-readable section title (e.g. `"sendMessage"`, `"Message"`). */
	title: string;
	/**
	 * Whether the section is a Bot API method, type, or unknown.
	 * Determined by the table header ("Parameter" → Method, "Field" → Object)
	 * or by the case of the first letter of the title.
	 */
	type: "Method" | "Object" | "Unknown";
	/** Inner HTML of all `<p>` and `<blockquote>` elements preceding the table/list. */
	description?: string;
	/** Rows from the parameter/field table, if present. */
	table?: TableRow[];
	/** Type references from the `<ul>` list, for union types (e.g. `ChatMember` variants). */
	oneOf?: TypeInfo[];
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

	let descriptionHtml = "";
	let currentDescriptionNode: Cheerio<Element> | null = parentH4;
	let nextElementAfterDescription: Cheerio<Element> | null = null;
	let descriptionLastPText = "";

	let currentNode = parentH4.next();
	while (currentNode.length && currentNode.is("p, blockquote")) {
		descriptionHtml += $.html(currentNode);
		if (currentNode.is("p")) {
			descriptionLastPText = currentNode.text();
		}
		currentDescriptionNode = currentNode;
		currentNode = currentNode.next();
	}
	nextElementAfterDescription = currentNode.length ? currentNode : null;
	const finalDescription = descriptionHtml.trim() || undefined;

	let tableData: TableRow[] | undefined = undefined;
	let oneOfData: TypeInfo[] | undefined = undefined;
	let sectionType: "Method" | "Object" | "Unknown" = "Unknown";
	let mainDefinitionElement: Cheerio<Element> | null = null;

	const isNextUl = nextElementAfterDescription?.is("ul");
	const suggestsOneOf = true; // descriptionLastPText.includes("can be one of");
	const noImmediateTable = !nextElementAfterDescription?.is("table.table");

	if (
		isNextUl &&
		suggestsOneOf &&
		noImmediateTable &&
		nextElementAfterDescription
	) {
		mainDefinitionElement = nextElementAfterDescription;
		oneOfData = [];
		mainDefinitionElement.find("> li > a").each((_, a) => {
			const link = $(a);
			const text = link.text().trim();
			const href = link.attr("href");
			if (text) {
				oneOfData?.push({ text, href: href ?? undefined });
			}
		});
		sectionType = "Object";
	} else {
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

		if (tableElement?.length) {
			mainDefinitionElement = tableElement;
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
							text: cells.eq(1).html()?.trim() ?? "",
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
							text: cells.eq(1).html()?.trim() ?? "",
							href: typeLink.attr("href") ?? undefined,
						},
						description: cells.eq(2).html()?.trim() ?? "",
					};
				} else if (sectionType === "Unknown" && cells.length >= 2) {
					const typeLink = cells.eq(1).find("a");
					row = {
						name: cells.eq(0).text().trim(),
						type: {
							text: cells.eq(1).html()?.trim() ?? "",
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

	const startNodeForAfterDesc =
		mainDefinitionElement ??
		nextElementAfterDescription ??
		currentDescriptionNode ??
		parentH4;
	const descriptionAfterDefinition = getHtmlUntil(
		startNodeForAfterDesc,
		"h4",
		$,
	);

	return {
		anchor: `#${anchorName}`,
		title,
		type: sectionType,
		description: finalDescription,
		table: tableData,
		oneOf: oneOfData,
		// descriptionAfterTable: descriptionAfterDefinition || undefined,
	};
}

export function parseSections(
	$: CheerioAPI,
	sections: NavItem[],
): ParsedSection[] {
	const parsedSections: ParsedSection[] = [];

	for (const section of sections) {
		for (const anchor of section.children) {
			const anchorElement = $(`a[name="${anchor.href.slice(1)}"]`);

			const parsedSection = parseAnchor($, anchorElement);
			if (parsedSection) {
				parsedSections.push(parsedSection);
			}
		}
	}

	return parsedSections;
}
