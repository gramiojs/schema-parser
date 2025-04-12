import type { ParsedSection } from "./parsers/archor.ts";
import type { Version } from "./parsers/index.ts";
import {
	type Field,
	parseTypeText,
	resolveReturnType,
	tableRowToField,
} from "./parsers/types.ts";
import { htmlToMarkdown } from "./parsers/utils.ts";

interface Method {
	name: string;
	anchor: string;
	description?: string;
	parameters: Field[];
	returns: Omit<Field, "key">;
}

interface Object {
	name: string;
	anchor: string;
	description?: string;
	fields?: Field[];
	oneOf?: Field[];
}

export interface CustomSchema {
	version: Version;
	methods: Method[];
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
			});
		}

		if (section.type === "Object") {
			const fields: Field[] = [];

			for (const row of section.table ?? []) {
				fields.push(tableRowToField(row));
			}

			schema.objects.push({
				name: section.title,
				anchor: section.anchor,
				description: htmlToMarkdown(section.description),
				fields: fields.length > 0 ? fields : undefined,
				oneOf: section.oneOf?.map((typeInfo) => parseTypeText(typeInfo)),
			});
		}
	}

	return schema;
}
