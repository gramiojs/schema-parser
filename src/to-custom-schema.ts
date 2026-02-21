import type { ParsedSection } from "./parsers/archor.ts";
import type { Version } from "./parsers/index.ts";
import {
	type Field,
	type FieldBoolean,
	type FieldInteger,
	type FieldReference,
	type FieldString,
	maybeFileToSend,
	parseTypeText,
	resolveReturnType,
	tableRowToField,
} from "./parsers/types.ts";
import { htmlToMarkdown } from "./parsers/utils.ts";

/** A Telegram Bot API method (e.g. `sendMessage`, `getUpdates`). */
export interface Method {
	/** Method name in camelCase (e.g. `"sendMessage"`). */
	name: string;
	/** Anchor href to the method definition (e.g. `"#sendmessage"`). */
	anchor: string;
	/** Markdown-formatted method description. */
	description?: string;
	/** List of method parameters. Empty array if the method takes no parameters. */
	parameters: Field[];
	/**
	 * Return type of the method.
	 * Same as {@link Field} but without the `key` property
	 * (return types are not named in the API docs).
	 */
	returns: Omit<Field, "key">;
	/**
	 * Whether any parameter accepts a file upload.
	 * `true` when at least one parameter is or contains `InputFile` / `InputMedia*`,
	 * meaning the request must be sent as `multipart/form-data`.
	 */
	hasMultipart: boolean;
}

/** Common properties shared by all object variants. */
export interface ObjectBasic {
	/** Type name in PascalCase (e.g. `"Message"`, `"ChatMember"`). */
	name: string;
	/** Anchor href to the type definition (e.g. `"#message"`). */
	anchor: string;
	/** Markdown-formatted type description. */
	description?: string;
	/**
	 * Semantic subtype of the object:
	 * - `"markup"` — can be used as a reply_markup value
	 */
	semanticType?: "markup";
}

/**
 * A Telegram Bot API type with named fields (e.g. `Message`, `User`).
 * The most common object variant.
 */
export interface ObjectWithFields extends ObjectBasic {
	type: "fields";
	/** All fields of this type, in documentation order. */
	fields: Field[];
}

/**
 * A Telegram Bot API union type — one of several possible concrete types
 * (e.g. `ChatMember`, `BotCommandScope`, `PassportElementError`).
 * Each variant is typically a {@link FieldReference}.
 */
export interface ObjectWithOneOf extends ObjectBasic {
	type: "oneOf";
	/** The possible concrete types that implement this union. */
	oneOf: Field[];
}

/**
 * A Telegram Bot API marker type with no fields and no union variants.
 * These are placeholder types documented without a table or list
 * (e.g. `ForumTopicClosed`, `CallbackGame`).
 */
export interface ObjectUnknown extends ObjectBasic {
	type: "unknown";
}

/**
 * A named string enum type (e.g. Currencies — all ISO 4217 codes).
 * Represents `type Currency = "USD" | "EUR" | ...` in downstream generators.
 */
export interface ObjectWithEnum extends ObjectBasic {
	type: "enum";
	values: string[];
}

/**
 * The `InputFile` object — the file-upload primitive of the Telegram Bot API.
 * Fields that accept file uploads use `type: "file"` and reference this object.
 * Generators should emit the concrete file type (e.g. `Blob`, `Buffer`) here.
 */
export interface ObjectFile extends ObjectBasic {
	type: "file";
}

/**
 * A Telegram Bot API type. Discriminated union on the `type` property:
 * - `"fields"` — {@link ObjectWithFields}
 * - `"oneOf"` — {@link ObjectWithOneOf}
 * - `"unknown"` — {@link ObjectUnknown}
 * - `"enum"` — {@link ObjectWithEnum}
 * - `"file"` — {@link ObjectFile}
 */
export type Object =
	| ObjectWithFields
	| ObjectWithOneOf
	| ObjectUnknown
	| ObjectWithEnum
	| ObjectFile;

/**
 * The top-level schema produced by parsing the Telegram Bot API documentation.
 * Contains the API version, all methods, and all types.
 */
export interface CustomSchema {
	/** The parsed API version and its release date. */
	version: Version;
	/** All Telegram Bot API methods, in documentation order. */
	methods: Method[];
	/** All Telegram Bot API types (objects), in documentation order. */
	objects: Object[];
}

const MARKUP_NAMES = /Markup$|^ReplyKeyboardRemove$|^ForceReply$/;

/**
 * Marks string fields as `semanticType: "formattable"` using sibling-based detection.
 * Runs after all fields are assembled so the full sibling set is available.
 * Skips fields that already have a semanticType (set by the description-based check).
 *
 * Two modes:
 * - `"method"`: checks `${key}_entities` OR `${key}_parse_mode` — both patterns are
 *   reliable for method parameters, which are always input.
 * - `"object"`: checks `${key}_parse_mode` ONLY — response objects (e.g. `Message`)
 *   have `*_entities` siblings but never `*_parse_mode`, so the parse_mode sibling
 *   is the safe discriminator for input objects (e.g. `InputPollOption`).
 */
function applyFormattableSiblings(fields: Field[], mode: "method" | "object"): void {
	const keys = new Set(fields.map((f) => f.key));
	for (const field of fields) {
		if (field.type === "string" && !field.semanticType) {
			const hasParseMode = keys.has(`${field.key}_parse_mode`);
			const hasEntities = keys.has(`${field.key}_entities`);
			if (mode === "method" ? hasParseMode || hasEntities : hasParseMode) {
				field.semanticType = "formattable";
			}
		}
	}
}

export function toCustomSchema(
	version: Version,
	sections: ParsedSection[],
	currencies?: string[],
): CustomSchema {
	const schema: CustomSchema = {
		version,
		methods: [],
		objects: [],
	};

	for (const section of sections) {
		if (section.type === "Method") {
			const parameters: Field[] = [];

			for (const row of section.table ?? []) {
				parameters.push(tableRowToField(row));
			}

			applyFormattableSiblings(parameters, "method");

			schema.methods.push({
				name: section.title,
				anchor: section.anchor,
				description: htmlToMarkdown(section.description),
				parameters,
				returns: resolveReturnType(section.description ?? ""),
				hasMultipart: parameters.some(maybeFileToSend),
			});
		}

		if (section.type === "Object") {
			const fields: Field[] = [];

			for (const row of section.table ?? []) {
				fields.push(tableRowToField(row));
			}

			applyFormattableSiblings(fields, "object");

			if (fields.length > 0) {
				schema.objects.push({
					name: section.title,
					anchor: section.anchor,
					description: htmlToMarkdown(section.description),
					type: "fields",
					fields,
					...(MARKUP_NAMES.test(section.title) && { semanticType: "markup" }),
				});
			} else if (section.oneOf?.length) {
				const oneOfListHtml = `<ul>${section.oneOf
					.map(
						({ text, href }) => `<li><a href="${href ?? ""}">${text}</a></li>`,
					)
					.join("")}</ul>`;
				const descriptionWithOneOf =
					(section.description ?? "") + oneOfListHtml;
				schema.objects.push({
					name: section.title,
					anchor: section.anchor,
					description: htmlToMarkdown(descriptionWithOneOf),
					type: "oneOf",
					oneOf: section.oneOf.map((typeInfo) => parseTypeText(typeInfo)),
				});
			} else if (section.title === "InputFile") {
				schema.objects.push({
					name: section.title,
					anchor: section.anchor,
					description: htmlToMarkdown(section.description),
					type: "file",
				});
			} else {
				schema.objects.push({
					name: section.title,
					anchor: section.anchor,
					description: htmlToMarkdown(section.description),
					type: "unknown",
				});
			}
		}
	}

	if (currencies && currencies.length > 0) {
		schema.objects.push({
			name: "Currencies",
			anchor: "#currencies",
			description:
				"Telegram payments supported currencies. Source: [currencies.json](https://core.telegram.org/bots/payments/currencies.json). See also [supported currencies](https://core.telegram.org/bots/payments/#supported-currencies).",
			type: "enum",
			values: currencies,
		});
	}

	// Hardcoded objects from the "Making requests" section of the Telegram Bot API docs.
	// These are not present in the HTML anchor/table structure, so they are injected manually.
	schema.objects.push({
		name: "APIResponseOk",
		anchor: "#making-requests",
		description:
			"If 'ok' equals True, the request was successful and the result of the query can be found in the 'result' field.",
		type: "fields",
		fields: [
			{
				key: "ok",
				type: "boolean",
				const: true,
				required: true,
				description: "If 'ok' equals True, the request was successful",
			} satisfies FieldBoolean,
			{
				key: "result",
				type: "string",
				required: true,
				description:
					"The result of the query. The actual type depends on the called method.",
			} satisfies FieldString,
		],
	} satisfies ObjectWithFields);

	schema.objects.push({
		name: "APIResponseError",
		anchor: "#making-requests",
		description:
			"In case of an unsuccessful request, 'ok' equals false and the error is explained in the 'description'.",
		type: "fields",
		fields: [
			{
				key: "ok",
				type: "boolean",
				const: false,
				required: true,
				description: "In case of an unsuccessful request, 'ok' equals false",
			} satisfies FieldBoolean,
			{
				key: "description",
				type: "string",
				required: true,
				description: "A human-readable description of the result",
			} satisfies FieldString,
			{
				key: "error_code",
				type: "integer",
				required: true,
				description:
					"An Integer error code. Its contents are subject to change in the future.",
			} satisfies FieldInteger,
			{
				key: "parameters",
				type: "reference",
				required: false,
				description:
					"Optional field which can help to automatically handle the error",
				reference: { name: "ResponseParameters", anchor: "#responseparameters" },
			} satisfies FieldReference,
		],
	} satisfies ObjectWithFields);

	schema.objects.push({
		name: "APIResponse",
		anchor: "#making-requests",
		description:
			"The response contains a JSON object, which always has a Boolean field 'ok'.",
		type: "oneOf",
		oneOf: [
			{
				key: "",
				type: "reference",
				reference: { name: "APIResponseOk", anchor: "#making-requests" },
			} satisfies FieldReference,
			{
				key: "",
				type: "reference",
				reference: { name: "APIResponseError", anchor: "#making-requests" },
			} satisfies FieldReference,
		],
	} satisfies ObjectWithOneOf);

	return schema;
}
