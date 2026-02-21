import type { ParsedSection } from "./parsers/archor.ts";
import type { Version } from "./parsers/index.ts";
import {
	type Field,
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
 * A Telegram Bot API type. Discriminated union on the `type` property:
 * - `"fields"` — {@link ObjectWithFields}
 * - `"oneOf"` — {@link ObjectWithOneOf}
 * - `"unknown"` — {@link ObjectUnknown}
 */
export type Object = ObjectWithFields | ObjectWithOneOf | ObjectUnknown;

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

export function toCustomSchema(
	version: Version,
	sections: ParsedSection[],
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

			if (fields.length > 0) {
				schema.objects.push({
					name: section.title,
					anchor: section.anchor,
					description: htmlToMarkdown(section.description),
					type: "fields",
					fields,
				});
			} else if (section.oneOf?.length) {
				schema.objects.push({
					name: section.title,
					anchor: section.anchor,
					description: htmlToMarkdown(section.description),
					type: "oneOf",
					oneOf: section.oneOf.map((typeInfo) => parseTypeText(typeInfo)),
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

	return schema;
}
