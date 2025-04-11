import type { TableRow, TypeInfo } from "./archor.ts";

export type TypeUnion =
	| "number"
	| "float"
	| "string"
	| "boolean"
	| "array"
	| "reference"
	| "one_of";

export interface FieldBasic {
	key: string;
	description: string;
}

export interface FieldNumber extends FieldBasic {
	type: "number";
}

export interface FieldFloat extends FieldBasic {
	type: "float";
}

export interface FieldString extends FieldBasic {
	type: "string";
	const?: string;
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
	reference?: Reference;
}

export interface FieldOneOf extends FieldBasic {
	type: "one_of";
	variants: Field[];
}

export type Field =
	| FieldNumber
	| FieldFloat
	| FieldString
	| FieldBoolean
	| FieldArray
	| FieldReference
	| FieldOneOf;

function parseTypeText(typeInfo: TypeInfo): Field {
	const text = typeInfo.text.trim();

	const arrayMatch = text.match(/^Array of (.+)$/i);
	if (arrayMatch) {
		return {
			type: "array",
			arrayOf: parseTypeText({ text: arrayMatch[1], href: typeInfo.href }),
		} as FieldArray;
	}

	if (text.includes(" or ")) {
		return {
			type: "one_of",
			variants: text.split(" or ").map((part) =>
				parseTypeText({
					text: part,
					href:
						typeInfo.href && part === typeInfo.text ? typeInfo.href : undefined,
				}),
			),
		} as FieldOneOf;
	}

	switch (text) {
		case "Integer":
			return { type: "number" } as FieldNumber;
		case "Float":
			return { type: "float" } as FieldFloat;
		case "String":
			return { type: "string" } as FieldString;
		case "Boolean":
			return { type: "boolean" } as FieldBoolean;
		case "True":
			return { type: "boolean", const: true } as FieldBoolean;
		case "False":
			return { type: "boolean", const: false } as FieldBoolean;
		default:
			if (typeInfo.href) {
				return {
					type: "reference",
					reference: {
						name: text,
						anchor: typeInfo.href,
					},
				} as FieldReference;
			}

			// TODO: Handle unknown types
			debugger;

			return { type: "string" } as FieldString;
	}
}

export function tableRowToField(tableRow: TableRow): Field {
	const typeField = parseTypeText(tableRow.type);

	return {
		...typeField,
		key: tableRow.name,
		description: tableRow.description,
	};
}
