import * as cheerio from "cheerio";
import type { TableRow, TypeInfo } from "./archor.ts";
import {
	type ExtractedType,
	extractConst,
	extractDefault,
	extractMinMax,
	extractOneOf,
	extractReturnType,
	extractTypeFromParts,
	parseDescriptionToSentences,
	stripPluralEnding,
} from "./sentence.ts";
import { htmlToMarkdown } from "./utils.ts";

/**
 * Discriminant for the {@link Field} union — the value of the `type` property
 * that identifies which concrete field interface is in use.
 */
export type TypeUnion =
	| "integer"
	| "float"
	| "string"
	| "boolean"
	| "array"
	| "reference"
	| "one_of";

/**
 * Properties shared by every field variant.
 * Extended by all `Field*` interfaces.
 */
export interface FieldBasic {
	/** The parameter / field name as it appears in the Telegram Bot API docs. */
	key: string;
	/**
	 * Whether the field is required.
	 * - `true` — must always be provided.
	 * - `false` — optional (may have a {@link FieldInteger.default} / {@link FieldString.default}).
	 * - `undefined` — not determined (treat as optional).
	 */
	required?: boolean;
	/** Markdown-formatted field description converted from the API HTML. */
	description?: string;
}

/** An integer-valued field parsed from the Telegram Bot API docs. */
export interface FieldInteger extends FieldBasic {
	type: "integer";
	/** Allowed discrete values (e.g. icon colour palette integers). */
	enum?: number[];
	/** Default value applied when the field is omitted. Makes `required` false. */
	default?: number;
	/** Inclusive lower bound (from "Values between X-Y" descriptions). */
	min?: number;
	/** Inclusive upper bound (from "Values between X-Y" descriptions). */
	max?: number;
}

/** A floating-point-valued field parsed from the Telegram Bot API docs. */
export interface FieldFloat extends FieldBasic {
	type: "float";
	/** Default value applied when the field is omitted. Makes `required` false. */
	default?: number;
	/** Allowed discrete values. */
	enum?: number[];
	/** Inclusive lower bound. */
	min?: number;
	/** Inclusive upper bound. */
	max?: number;
}

/** A string-valued field parsed from the Telegram Bot API docs. */
export interface FieldString extends FieldBasic {
	type: "string";
	/**
	 * A fixed constant the field must always equal.
	 * Used for discriminator fields in union types (e.g. `source: "unspecified"`)
	 * and for status fields (e.g. `status: "creator"`).
	 * A `const` field is always **required** — it is never a default.
	 */
	const?: string;
	/**
	 * Allowed string values when the field is an enum
	 * (extracted from description patterns like `"Can be one of"`, `"either"`, etc.).
	 */
	enum?: string[];
	/** Default value applied when the field is omitted. Makes `required` false. */
	default?: string;
	/** Minimum allowed string length (from "X-Y characters" descriptions). */
	minLen?: number;
	/** Maximum allowed string length (from "X-Y characters" descriptions). */
	maxLen?: number;
	/**
	 * Semantic subtype of the string value:
	 * - `"formattable"` — supports Telegram formatting entities ("after entities parsing")
	 * - `"updateType"` — is a Telegram update type name (e.g. "message", "callback_query")
	 */
	semanticType?: "formattable" | "updateType";
}

/** A boolean-valued field parsed from the Telegram Bot API docs. */
export interface FieldBoolean extends FieldBasic {
	type: "boolean";
	/**
	 * A literal boolean constant.
	 * - `true` — the field is the `True` literal type (e.g. method return types).
	 * - `false` — the field is the `False` literal type.
	 * - `undefined` — any boolean value is accepted.
	 */
	const?: boolean;
}

/** An array-valued field parsed from the Telegram Bot API docs. */
export interface FieldArray extends FieldBasic {
	type: "array";
	/** The type of each element in the array. May itself be a `one_of` for multi-type arrays. */
	arrayOf: Field;
}

/** A named reference to another Telegram Bot API type. */
export interface Reference {
	/** The type name as it appears in the docs (e.g. `"Message"`, `"PhotoSize"`). */
	name: string;
	/** The anchor href pointing to the type definition (e.g. `"#message"`). */
	anchor: string;
}

/** A field whose type is a reference to another named Telegram Bot API object. */
export interface FieldReference extends FieldBasic {
	type: "reference";
	/** The referenced type. */
	reference: Reference;
}

/**
 * A field whose type is a union of multiple possible types
 * (e.g. `InputFile or String`, `Array of InputMedia*`).
 */
export interface FieldOneOf extends FieldBasic {
	type: "one_of";
	/** The possible concrete types; at least two variants are always present. */
	variants: Field[];
}

/**
 * A discriminated union of all possible field types.
 * Narrow via the `type` property:
 *
 * ```ts
 * if (field.type === "string") {
 *   field.const; // string | undefined
 * }
 * ```
 */
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

	if (emojiAlts.length > 0 && type !== "number") {
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

function extractAllTypeRefs(html: string): TypeInfo[] {
	const $ = cheerio.load(html);
	const links = $("a");
	if (links.length <= 1) return [];

	const types: TypeInfo[] = [];
	links.each((_, a) => {
		const link = $(a);
		const text = link.text().trim();
		const href = link.attr("href");
		if (text) types.push({ text, href });
	});
	return types;
}

function detectConst(description: string) {
	const $ = cheerio.load(description);

	const constMatch = $.text().match(
		/always\s+["\u201c\u201d]([^"\u201c\u201d]+)["\u201c\u201d]/i,
	);
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
		const multiRefs = extractAllTypeRefs(innerTypeText);
		if (multiRefs.length > 1) {
			return {
				type: "array",
				arrayOf: {
					type: "one_of",
					variants: multiRefs.map((t) => parseTypeText(t)),
				},
			} as FieldArray;
		}
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
				...(details.min !== undefined &&
					!Number.isNaN(details.min) && { min: details.min }),
				...(details.max !== undefined &&
					!Number.isNaN(details.max) && { max: details.max }),
				...(details.default !== undefined &&
					!Number.isNaN(details.default) && { default: details.default }),
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
				...(details.min !== undefined &&
					!Number.isNaN(details.min) && { min: details.min }),
				...(details.max !== undefined &&
					!Number.isNaN(details.max) && { max: details.max }),
				...(details.default !== undefined &&
					!Number.isNaN(details.default) && { default: details.default }),
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
			const mustBeConst = extractConst(sentences);
			const minMax = extractMinMax(sentences);

			return {
				type: "string",
				enum: enumValues?.length ? enumValues : undefined,
				const: constValue ?? mustBeConst,
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
						name: text.trim(),
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

	const field: Field = {
		...typeField,
		key: tableRow.name,
		required:
			"default" in typeField && typeField.default !== undefined
				? false
				: required,
		description: htmlToMarkdown(tableRow.description),
	};

	const descText = $.text();

	// Currency fields reference the synthetic Currencies enum object
	if (descText.includes("ISO 4217") && field.type === "string") {
		return {
			...field,
			type: "reference",
			reference: { name: "Currencies", anchor: "#currencies" },
		} as unknown as Field;
	}

	// String fields that accept file uploads via attach:// (typed as String in the API,
	// but described with the "More information on Sending Files" link) become one_of: [InputFile, string]
	if (field.type === "string" && descText.includes("More information on Sending Files")) {
		return {
			key: field.key,
			required: field.required,
			description: field.description,
			type: "one_of",
			variants: [
				{
					type: "reference",
					reference: { name: "InputFile", anchor: "#inputfile" },
				} as FieldReference,
				{ type: "string" } as FieldString,
			] as Field[],
		} as FieldOneOf;
	}

	// semanticType on string fields
	if (field.type === "string") {
		if (descText.includes("after entities parsing")) {
			(field as FieldString).semanticType = "formattable";
		}
	}

	// semanticType on arrayOf string fields
	if (field.type === "array" && field.arrayOf.type === "string") {
		if (descText.includes("update type")) {
			(field.arrayOf as FieldString).semanticType = "updateType";
		}
	}

	return field;
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
