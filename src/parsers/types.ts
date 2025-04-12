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
	required?: boolean;
	description?: string;
}

export interface FieldInteger extends FieldBasic {
	type: "integer";
	enum?: number[];
	default?: number;
}

export interface FieldFloat extends FieldBasic {
	type: "float";
	default?: number;
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

const PATTERNS = {
	DEFAULT: [/defaults? to (\d+)/i, /always "([^"]+)"/gi],
	MIN_MAX: [
		/values? between (\d+)[-\s]+(?:and|to) (\d+)/gi,
		/(\d+)\s*-\s*(\d+)/g,
		/must be between (\d+) and (\d+)/gi,
	],
	ONE_OF: [
		/can be (?:one of|either) ("[^"]+"(?:, ?"[^"]+")+)/g,
		/possible values are ((?:\d+|"[^"]+")(?:, ?(?:\d+|"[^"]+"))+)/gi,
	],
};

function detectPatterns(description: string) {
	const result: {
		min?: number;
		max?: number;
		default?: number;
		enum?: (string | number)[];
	} = {};

	for (const pattern of PATTERNS.DEFAULT) {
		const match = description.match(pattern);
		if (match) {
			result.default = Number.parseInt(match[1], 10);
			break;
		}
	}

	for (const pattern of PATTERNS.MIN_MAX) {
		const match = description.match(pattern);
		if (match) {
			result.min = Number.parseInt(match[1], 10);
			result.max = Number.parseInt(match[2], 10);
			break;
		}
	}

	for (const pattern of PATTERNS.ONE_OF) {
		const match = description.match(pattern);
		if (match) {
			result.enum = match[1]
				.split(/, ?/)
				.map((v) => v.replace(/^"|"$/g, ""))
				.map((v) => (Number.isNaN(Number(v)) ? v : Number(v)));
			break;
		}
	}

	return result;
}

function detectDefault(description: string): number | undefined {
	const $ = cheerio.load(description);

	const defaultMatch = $.text().match(
		/(?:default(?:s to)?|default is)\D*(?<![-–])(\d+)(?!\s*[-–])/i,
	);

	if (defaultMatch) {
		return Number(defaultMatch[1]);
	}

	return undefined;
}

function detectEnum(
	description: string | undefined,
	type: "string" | "number",
): (string | number)[] | undefined {
	if (!description) return undefined;

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

	for (const pattern of PATTERNS.ONE_OF) {
		const matches = Array.from(cleanDescription.matchAll(pattern));
		if (matches.length > 0) {
			return matches
				.flatMap((m) => m.slice(1).filter(Boolean))
				.map((v) => v.replace(/^["']+|["']+$/g, ""))
				.filter((v) => v.length > 0);
		}
	}

	if (type === "number") {
		const numbers: number[] = [];
		const numberRegex = /\b(\d+)\b/g;
		let match: RegExpExecArray | null;

		// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
		while ((match = numberRegex.exec(description)) !== null) {
			const num = Number(match[1]);
			if (!Number.isNaN(num)) numbers.push(num);
		}

		const constraints = detectConstraints(description);
		const filtered = numbers.filter(
			(n) =>
				n !== constraints.min &&
				n !== constraints.max &&
				n !== constraints.default,
		);

		return filtered.length > 1 ? [...new Set(filtered)] : undefined;
	}

	return undefined;
}

function detectConstraints(description: string): {
	min?: number;
	max?: number;
	default?: number;
} {
	const constraints: { min?: number; max?: number; default?: number } = {};

	const rangeMatch = description.match(/(\d+)\s*[-–]\s*(\d+)(?=\D*$)/);
	if (rangeMatch) {
		const min = Number.parseInt(rangeMatch[1], 10);
		const max = Number.parseInt(rangeMatch[2], 10);
		if (!Number.isNaN(min)) constraints.min = min;
		if (!Number.isNaN(max)) constraints.max = max;
	}

	const minMatch = description.match(/(?:\bmin(?:imum)?\D*)(\d+)/i);
	const maxMatch = description.match(/(?:\bmax(?:imum)?\D*)(\d+)/i);
	if (minMatch) constraints.min = Number.parseInt(minMatch[1], 10);
	if (maxMatch) constraints.max = Number.parseInt(maxMatch[1], 10);

	const defaultMatch = description.match(/(?:\bdefault(?:s to)?\D*)(\d+)/i);
	if (defaultMatch) constraints.default = Number.parseInt(defaultMatch[1], 10);

	return constraints;
}

function detectNumbers(description: string) {
	const numbers: number[] = [];
	const numberFormats = [
		/(\d+\.?\d*)\s*\([^)]+\)/g,
		/\b\d+\.?\d*\b/g,
		/\\u\{\w+\}/g,
	];

	for (const format of numberFormats) {
		let match: RegExpExecArray | null;
		while ((match = format.exec(description)) !== null) {
			const numValue = match[1] || match[0];
			const num = Number.parseFloat(numValue);
			if (!Number.isNaN(num)) numbers.push(num);
		}
	}

	return [...new Set(numbers)];
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

function detectConst(description: string) {
	const $ = cheerio.load(description);

	const constMatch = $.text().match(/always\s+["“]([^"”]+)["”]/i);
	return constMatch ? constMatch[1] : undefined;
}

export function parseTypeText(typeInfo: TypeInfo, description?: string): Field {
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
			const details = parseFieldDetails(description || "", "number");
			return {
				type: "integer",
				...(details.min !== undefined && { min: details.min }),
				...(details.max !== undefined && { max: details.max }),
				...(details.default !== undefined && { default: details.default }),
				...(details.enum?.length ? { enum: details.enum } : {}),
			} as FieldInteger;
		}
		case "Float": {
			const enumValues = description
				? detectEnum(description, "number")?.map(Number)
				: undefined;

			const defaultNumber = description
				? detectDefault(description)
				: undefined;

			return {
				type: "float",
				...(enumValues?.length ? { enum: enumValues } : {}),
				...(defaultNumber ? { default: defaultNumber } : {}),
			} as FieldFloat;
		}
		case "String": {
			const enumValues = description
				? detectEnum(description, "string")
				: undefined;

			const constValue = description ? detectConst(description) : undefined;

			return {
				type: "string",
				enum: enumValues?.length ? enumValues : undefined,
				const: constValue,
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
	const $ = cheerio.load(tableRow.description);
	const typeField = parseTypeText(tableRow.type, tableRow.description);

	const required = tableRow.required?.toLowerCase().includes("yes")
		? true
		: tableRow.required?.toLowerCase().includes("optional")
			? false
			: !$.text().toLowerCase().startsWith("optional");

	return {
		...typeField,
		key: tableRow.name,
		required:
			"default" in typeField && typeField.default !== undefined
				? false
				: required,
		description: htmlToMarkdown(tableRow.description),
	};
}

function parseFieldDetails(description: string, type: "number" | "string") {
	const patterns = detectPatterns(description);
	// const numbers = detectNumbers(description);
	const numbers: number[] = [];
	const constraints = detectConstraints(description);

	const filteredNumbers = numbers.filter(
		(n) =>
			n !== patterns.default && n !== constraints.min && n !== constraints.max,
	);

	return {
		min: constraints.min,
		max: constraints.max,
		default: patterns.default,
		enum:
			patterns.enum?.length && type === "string"
				? patterns.enum.filter((v) =>
						typeof v === "number"
							? v !== patterns.default &&
								v !== constraints.min &&
								v !== constraints.max
							: true,
					)
				: filteredNumbers.length > 1
					? filteredNumbers
					: undefined,
	};
}

export function resolveReturnType(description: string): Omit<Field, "key"> {
	const $ = cheerio.load(description);
	const returnClause =
		$.root()
			.text()
			.match(/Returns (.*?)(\.|$)/i)?.[1] || "";
	const htmlReturnClause =
		$.root()
			.html()
			?.match(/Returns (.*?)(\.|$)/i)?.[1] || "";

	if (
		returnClause.toLowerCase().includes("true") ||
		returnClause.toLowerCase().includes("false")
	) {
		return {
			type: "boolean",
			const: returnClause.toLowerCase().includes("true"),
		} as FieldBoolean;
	}

	const arrayMatch = returnClause.match(/(?:Array|list) of (.+)/i);
	if (arrayMatch) {
		const arrayContent = cheerio.load(htmlReturnClause);
		const firstLink = arrayContent("a").first();
		const rawInnerText = arrayContent.root().text().trim();

		const parts = rawInnerText.split(/ of /i);
		const lastPart = parts[parts.length - 1].trim();
		const typeNameMatch = lastPart.match(/^([A-Z][a-zA-Z]+)/);
		const typeName = typeNameMatch ? typeNameMatch[1] : lastPart;

		const innerType =
			firstLink.length > 0
				? {
						text: firstLink.text().trim(),
						href: firstLink.attr("href"),
					}
				: {
						text: typeName,
						href: `#${typeName.toLowerCase()}`,
					};

		return {
			type: "array",
			arrayOf: parseTypeText(innerType),
		} as FieldArray;
	}

	const linkMatch = htmlReturnClause.match(
		/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/,
	);
	if (linkMatch) {
		return {
			type: "reference",
			reference: {
				name: linkMatch[2],
				anchor: linkMatch[1],
			},
		} as FieldReference;
	}

	return { type: "string" } as FieldString;
}
