import * as cheerio from "cheerio";
import type { TableRow, TypeInfo } from "./archor.ts";
import {
	type ExtractedType,
	extractDefault,
	extractMinMax,
	extractOneOf,
	extractReturnType,
	extractTypeFromParts,
	parseDescriptionToSentences,
	stripPluralEnding,
} from "./sentence.ts";
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
	min?: number;
	max?: number;
}

export interface FieldFloat extends FieldBasic {
	type: "float";
	default?: number;
	enum?: number[];
	min?: number;
	max?: number;
}

export interface FieldString extends FieldBasic {
	type: "string";
	const?: string;
	enum?: string[];
	default?: string;
	minLen?: number;
	maxLen?: number;
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

function uniqueArray(array: (string | number)[]): (string | number)[] {
	return [...new Set(array)];
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
		return uniqueArray(emojiAlts as string[]);
	}

	// Try sentence-based oneOf extraction (require at least 2 values for enum)
	const sentences = parseDescriptionToSentences(description);
	const oneOfValues = extractOneOf(sentences);
	if (oneOfValues && oneOfValues.length > 1) {
		if (type === "number") {
			const nums = oneOfValues.map(Number).filter((n) => !Number.isNaN(n));
			return nums.length > 1 ? uniqueArray(nums) : undefined;
		}
		return uniqueArray(oneOfValues);
	}

	// Fallback: quoted strings from clean description
	const cleanDescription = description
		.replace(/<img[^>]+>/g, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	const quotedMatches = Array.from(cleanDescription.matchAll(/(["'])(.*?)\1/g));
	if (quotedMatches.length > 1) {
		return uniqueArray(quotedMatches.map((m) => m[2]));
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

function detectConst(description: string) {
	const $ = cheerio.load(description);

	const constMatch = $.text().match(/always\s+["""]([^"""]+)["""]/i);
	return constMatch ? constMatch[1] : undefined;
}

function parseFieldDetailsSentence(description: string): {
	min?: number;
	max?: number;
	default?: number;
} {
	const sentences = parseDescriptionToSentences(description);

	const defaultStr = extractDefault(sentences);
	const minMax = extractMinMax(sentences);

	return {
		min: minMax ? Number(minMax.min) : undefined,
		max: minMax ? Number(minMax.max) : undefined,
		default: defaultStr !== undefined ? Number(defaultStr) : undefined,
	};
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
			const details = parseFieldDetailsSentence(description || "");
			const enumValues = description
				? (detectEnum(description, "number") as number[] | undefined)
				: undefined;

			return {
				type: "integer",
				...(details.min !== undefined && !Number.isNaN(details.min) && { min: details.min }),
				...(details.max !== undefined && !Number.isNaN(details.max) && { max: details.max }),
				...(details.default !== undefined && !Number.isNaN(details.default) && { default: details.default }),
				...(enumValues?.length ? { enum: enumValues } : {}),
			} as FieldInteger;
		}
		case "Float":
		case "Float number": {
			const details = parseFieldDetailsSentence(description || "");
			const enumValues = description
				? (detectEnum(description, "number") as number[] | undefined)
				: undefined;

			return {
				type: "float",
				...(details.min !== undefined && !Number.isNaN(details.min) && { min: details.min }),
				...(details.max !== undefined && !Number.isNaN(details.max) && { max: details.max }),
				...(details.default !== undefined && !Number.isNaN(details.default) && { default: details.default }),
				...(enumValues?.length ? { enum: enumValues } : {}),
			} as FieldFloat;
		}
		case "String": {
			const enumValues = description
				? detectEnum(description, "string")
				: undefined;

			const constValue = description ? detectConst(description) : undefined;

			const sentences = description
				? parseDescriptionToSentences(description)
				: [];
			const defaultStr = extractDefault(sentences);
			const minMax = extractMinMax(sentences);

			return {
				type: "string",
				enum: enumValues?.length ? enumValues : undefined,
				const: constValue,
				...(defaultStr !== undefined && { default: defaultStr }),
				...(minMax
					? {
							...(minMax.min && { minLen: Number(minMax.min) }),
							...(minMax.max && { maxLen: Number(minMax.max) }),
						}
					: {}),
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

function extractedTypeToField(extracted: ExtractedType): Omit<Field, "key"> {
	switch (extracted.kind) {
		case "single": {
			const name = extracted.name || "";

			if (name === "True")
				return { type: "boolean", const: true } as Omit<FieldBoolean, "key">;
			if (name === "False")
				return { type: "boolean", const: false } as Omit<FieldBoolean, "key">;
			if (name === "Int" || name === "Integer")
				return { type: "integer" } as Omit<FieldInteger, "key">;
			if (name === "String")
				return { type: "string" } as Omit<FieldString, "key">;
			if (name === "Boolean")
				return { type: "boolean" } as Omit<FieldBoolean, "key">;

			const anchor =
				extracted.href || `#${name.toLowerCase().replace(/ objects?/i, "")}`;
			return {
				type: "reference",
				reference: {
					name: name.replace(/ objects?/i, ""),
					anchor,
				},
			} as Omit<FieldReference, "key">;
		}
		case "array": {
			if (!extracted.inner)
				return { type: "string" } as Omit<FieldString, "key">;
			return {
				type: "array",
				arrayOf: extractedTypeToField(extracted.inner) as Field,
			} as Omit<FieldArray, "key">;
		}
		case "or": {
			if (!extracted.variants || extracted.variants.length === 0)
				return { type: "string" } as Omit<FieldString, "key">;
			return {
				type: "one_of",
				variants: extracted.variants.map(
					(v) => extractedTypeToField(v) as Field,
				),
			} as Omit<FieldOneOf, "key">;
		}
	}
}

export function resolveReturnType(description: string): Omit<Field, "key"> {
	const $ = cheerio.load(description);
	const text = $.text();

	// Check for simple True/False returns (only when no "otherwise" present)
	if (!text.includes("otherwise")) {
		if (
			text.match(/Returns\s+(an\s+|the\s+)?(True|False)/i) ||
			text.match(/(True|False)\s+is\s+returned/i)
		) {
			return {
				type: "boolean",
				const: text.includes("True"),
			} as Omit<FieldBoolean, "key">;
		}
	}

	// Use sentence parser for structured extraction
	const sentences = parseDescriptionToSentences(description);
	const returnParts = extractReturnType(sentences);

	if (returnParts && returnParts.length > 0) {
		// Check for Int/Integer in parts
		if (returnParts.some((p) => p.inner === "Int" || p.inner === "Integer")) {
			return { type: "integer" };
		}

		const extracted = extractTypeFromParts(returnParts);
		if (extracted) {
			return extractedTypeToField(extracted);
		}
	}

	// Fallback: direct link
	const directLink = $('a[href^="#"]').first();
	if (directLink.length) {
		return {
			type: "reference",
			reference: {
				name: directLink.text().trim(),
				anchor: directLink.attr("href") || "",
			},
		} as Omit<FieldReference, "key">;
	}

	return { type: "string" } as Omit<FieldString, "key">;
}

export function maybeFileToSend(field: Field): boolean {
	if (field.type === "reference") {
		const name = field.reference.name;
		if (name === "InputPollOption") return false;
		return name.startsWith("Input");
	}
	if (field.type === "array") {
		return maybeFileToSend(field.arrayOf);
	}
	if (field.type === "one_of") {
		return field.variants.some(maybeFileToSend);
	}
	return false;
}
