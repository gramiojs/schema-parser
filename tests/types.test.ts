import { describe, expect, test } from "bun:test";
import type { TableRow } from "../src/parsers/archor.ts";
import { type Field, tableRowToField } from "../src/parsers/types.ts";

describe("Type Parser", () => {
	describe("Basic Types", () => {
		const testCases: [string, Partial<Field>][] = [
			["Integer", { type: "number" }],
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
						type: "number",
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
					text: "InputFile or String",
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
				type: { text: "Array of InputFile or String" },
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
});
