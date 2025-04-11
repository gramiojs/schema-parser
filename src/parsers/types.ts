import * as cheerio from "cheerio";
import type { TableRow, TypeInfo } from "./archor.ts";
import { htmlToMarkdown } from "./utils.ts";

export type TypeUnion =
	| "integer"
	| "float"
	| "string"
	| "boolean"
	| "array"
	| "reference"
	| "one_of";

export interface FieldBasic {
	key: string;
	description?: string;
}

export interface FieldInteger extends FieldBasic {
	type: "integer";
	enum?: number[];
}

export interface FieldFloat extends FieldBasic {
	type: "float";
	const?: number;
	enum?: number[];
}

export interface FieldString extends FieldBasic {
	type: "string";
	const?: string;
	enum?: string[];
}

export interface FieldBoolean extends FieldBasic {
	type: "boolean";
	const?: boolean;
}

export interface FieldArray extends FieldBasic {
	type: "array";
	arrayOf: Field;
}

export interface Reference {
	name: string;
	anchor: string;
}

export interface FieldReference extends FieldBasic {
	type: "reference";
	reference: Reference;
}

export interface FieldOneOf extends FieldBasic {
	type: "one_of";
	variants: Field[];
}

export type Field =
	| FieldInteger
	| FieldFloat
	| FieldString
	| FieldBoolean
	| FieldArray
	| FieldReference
	| FieldOneOf;

const ENUM_PATTERNS = [
	// Matches: "can be one of "a", "b", "c""
	/(?:can be|possible values are|available options are) (["'])([^"']+)\1(?:, (["'])([^"']+)\3)*/gi,
];

function detectEnum(
	description: string,
	type: "string" | "number",
): (string | number)[] | undefined {
	const $ = cheerio.load(description);

	const emojiAlts = $("img.emoji[alt]")
		.map((_, el) => $(el).attr("alt"))
		.get()
		.filter(Boolean);

	if (emojiAlts.length > 0) {
		return emojiAlts as string[];
	}

	const cleanDescription = description
		.replace(/<img[^>]+>/g, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	const quotedMatches = Array.from(cleanDescription.matchAll(/(["'])(.*?)\1/g));
	if (quotedMatches.length > 1) {
		return quotedMatches.map((m) => m[2]);
	}

	for (const pattern of ENUM_PATTERNS) {
		const matches = Array.from(cleanDescription.matchAll(pattern));
		if (matches.length > 0) {
			return matches
				.flatMap((m) => m.slice(1).filter(Boolean))
				.map((v) => v.replace(/^["']+|["']+$/g, ""))
				.filter((v) => v.length > 0);
		}
	}

	if (type === "number") {
		const numberMatches = Array.from(
			description.matchAll(/(\d+)(?:\s*\([^)]+\))?/g),
		)
			.map((m) => Number(m[1]))
			.filter((n) => !Number.isNaN(n));

		if (numberMatches.length > 1) return numberMatches;
	}

	return undefined;
}
function extractTypeAndRef(html: string): { text: string; href?: string } {
	const $ = cheerio.load(html);
	const link = $("a").first();

	const text = $.root().text().trim();

	if (link.length) {
		return {
			text: link.text().trim(),
			href: link.attr("href"),
		};
	}

	return { text };
}

function parseTypeText(typeInfo: TypeInfo, description?: string): Field {
	const arrayMatch = typeInfo.text.match(/^Array of (.+)$/i);
	if (arrayMatch) {
		const innerTypeText = arrayMatch[1];
		return {
			type: "array",
			arrayOf: parseTypeText({ text: innerTypeText }),
		} as FieldArray;
	}

	if (typeInfo.text.includes(" or ")) {
		const parts = typeInfo.text.split(" or ").map((part) => part.trim());
		const variants = parts.map((part) => {
			const { text, href } = extractTypeAndRef(part);
			return href
				? parseTypeText({ text, href })
				: parseTypeText({ text: part });
		});

		return {
			type: "one_of",
			variants,
		} as FieldOneOf;
	}

	const { text, href } = extractTypeAndRef(typeInfo.text);
	const finalHref = href || typeInfo.href;

	switch (text.trim()) {
		case "Integer": {
			const enumValues = description
				? detectEnum(description, "number")?.map(Number)
				: undefined;

			return {
				type: "integer",
				...(enumValues?.length ? { enum: enumValues } : {}),
			} as FieldInteger;
		}
		case "Float": {
			const enumValues = description
				? detectEnum(description, "number")?.map(Number)
				: undefined;

			return {
				type: "float",
				...(enumValues?.length ? { enum: enumValues } : {}),
			} as FieldFloat;
		}
		case "String": {
			const enumValues = description
				? detectEnum(description, "string")
				: undefined;

			return {
				type: "string",
				enum: enumValues?.length ? enumValues : undefined,
			} as FieldString;
		}
		case "Boolean":
			return { type: "boolean" } as FieldBoolean;
		case "True":
			return { type: "boolean", const: true } as FieldBoolean;
		case "False":
			return { type: "boolean", const: false } as FieldBoolean;
		default:
			if (finalHref) {
				return {
					type: "reference",
					reference: {
						name: text,
						anchor: finalHref,
					},
				} as FieldReference;
			}
			return { type: "string" } as FieldString;
	}
}

export function tableRowToField(tableRow: TableRow): Field {
	const typeField = parseTypeText(tableRow.type, tableRow.description);

	return {
		...typeField,
		key: tableRow.name,
		description: htmlToMarkdown(tableRow.description),
	};
}
