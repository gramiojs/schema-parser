import { describe, expect, test } from "bun:test";
import type { TableRow } from "../src/parsers/archor.ts";
import {
	type Field,
	type FieldString,
	tableRowToField,
} from "../src/parsers/types.ts";

describe("Type Parser", () => {
	describe("Basic Types", () => {
		const testCases: [string, Partial<Field>][] = [
			["Integer", { type: "integer" }],
			["Float", { type: "float" }],
			["String", { type: "string" }],
			["Boolean", { type: "boolean" }],
			["True", { type: "boolean", const: true }],
			["False", { type: "boolean", const: false }],
		];

		test.each(testCases)("should parse %s correctly", (typeText, expected) => {
			const row: TableRow = {
				name: "test_field",
				type: { text: typeText },
				description: "Test description",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				key: "test_field",
				description: "Test description",
				...expected,
			});
		});
	});

	describe("Reference Types", () => {
		test("should parse reference type with anchor", () => {
			const row: TableRow = {
				name: "message",
				type: {
					text: "Message",
					href: "#message",
				},
				description: "Message object",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				key: "message",
				type: "reference",
				reference: {
					name: "Message",
					anchor: "#message",
				},
				description: "Message object",
			});
		});
	});

	describe("Array Types", () => {
		test("should parse simple array", () => {
			const row: TableRow = {
				name: "photos",
				type: { text: 'Array of <a href="#photosize">PhotoSize</a>' },
				description: "Array of photos",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				key: "photos",
				type: "array",
				arrayOf: {
					type: "reference",
					reference: {
						name: "PhotoSize",
					},
				},
			});
		});

		test("should parse nested arrays", () => {
			const row: TableRow = {
				name: "matrix",
				type: { text: "Array of Array of Integer" },
				description: "Matrix of numbers",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				key: "matrix",
				type: "array",
				arrayOf: {
					type: "array",
					arrayOf: {
						type: "integer",
					},
				},
			});
		});
	});

	describe("Union Types (or)", () => {
		test("should parse simple union", () => {
			const row: TableRow = {
				name: "file",
				type: { text: "<a href='#inputfile'>InputFile</a> or String" },
				description: "File to send",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				key: "file",
				type: "one_of",
				variants: [
					{
						type: "reference",
						reference: {
							name: "InputFile",
						},
					},
					{
						type: "string",
					},
				],
			});
		});

		test("should parse union with reference and href", () => {
			const row: TableRow = {
				name: "photo",
				type: {
					text: "<a href='#inputfile'>InputFile</a> or String",
					href: "#inputfile",
				},
				description: "Photo to send",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				key: "photo",
				type: "one_of",
				variants: [
					{
						type: "reference",
						reference: {
							name: "InputFile",
							anchor: "#inputfile",
						},
					},
					{
						type: "string",
					},
				],
			});
		});
	});

	describe("Complex Cases", () => {
		test("should parse array of union types", () => {
			const row: TableRow = {
				name: "media",
				type: { text: "Array of <a href='#inputfile'>InputFile</a> or String" },
				description: "Media to send",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				key: "media",
				type: "array",
				arrayOf: {
					type: "one_of",
					variants: [
						{
							type: "reference",
							reference: {
								name: "InputFile",
							},
						},
						{
							type: "string",
						},
					],
				},
			});
		});

		test("should handle unknown types as string", () => {
			const row: TableRow = {
				name: "unknown_field",
				type: { text: "UnknownType" },
				description: "Field with unknown type",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				key: "unknown_field",
				type: "string",
				description: "Field with unknown type",
			});
		});
	});

	describe("Special cases from documentation", () => {
		test("should parse message entity array with nested references", () => {
			const row: TableRow = {
				name: "entities",
				type: { text: 'Array of <a href="#messageentity">MessageEntity</a>' },
				description: "Special entities in the text",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				type: "array",
				arrayOf: {
					type: "reference",
					reference: {
						name: "MessageEntity",
						anchor: "#messageentity",
					},
				},
			});
		});

		test("should parse complex inputmedia type", () => {
			const row: TableRow = {
				name: "media",
				type: {
					text: '<a href="#inputmedia">InputMedia</a> or String',
					href: "#inputmedia",
				},
				description: "Media to send",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				type: "one_of",
				variants: [
					{
						type: "reference",
						reference: {
							name: "InputMedia",
							anchor: "#inputmedia",
						},
					},
					{ type: "string" },
				],
			});
		});

		test("should parse nested array in reply_markup", () => {
			const row: TableRow = {
				name: "keyboard",
				type: {
					text: 'Array of Array of <a href="#keyboardbutton">KeyboardButton</a>',
				},
				description: "Array of button rows",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				type: "array",
				arrayOf: {
					type: "array",
					arrayOf: {
						type: "reference",
						reference: {
							name: "KeyboardButton",
							anchor: "#keyboardbutton",
						},
					},
				},
			});
		});

		test("should parse message_id as integer", () => {
			const row: TableRow = {
				name: "message_id",
				type: { text: "Integer" },
				description: "Unique message identifier",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				type: "integer",
			});
		});

		test("should parse complex inlinekeyboardbutton", () => {
			const row: TableRow = {
				name: "button",
				type: {
					text: '<a href="#inlinekeyboardbutton">InlineKeyboardButton</a> or String or Boolean or True',
					href: "#inlinekeyboardbutton",
				},
				description: "Button configuration",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				type: "one_of",
				variants: [
					{
						type: "reference",
						reference: {
							name: "InlineKeyboardButton",
							anchor: "#inlinekeyboardbutton",
						},
					},
					{ type: "string" },
					{ type: "boolean" },
					{ type: "boolean", const: true },
				],
			});
		});
	});

	describe("Enum Detection", () => {
		test("should parse ReactionTypeEmoji.emoji enum", () => {
			const row: TableRow = {
				name: "emoji",
				type: { text: "String" },
				description: `Reaction emoji. Currently, it can be one of "👍", "👎", "❤", "🔥"`,
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				type: "string",
				enum: ["👍", "👎", "❤", "🔥"],
			});
		});

		test("should not add enum for non-string types", () => {
			const row: TableRow = {
				name: "count",
				type: { text: "Integer" },
				description: "Can be one of 1, 2, 3",
			};

			const result = tableRowToField(row);
			expect(result).not.toHaveProperty("enum");
		});
	});
});
