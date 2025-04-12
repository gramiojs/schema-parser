import { describe, expect, test } from "bun:test";
import type { TableRow } from "../src/parsers/archor.ts";
import {
	type Field,
	type FieldString,
	resolveReturnType,
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

		test("should parse ReactionTypeEmoji with img alt texts", () => {
			const row: TableRow = {
				name: "emoji",
				type: { text: "String" },
				description: `Reaction emoji. Currently, it can be one of \"<img class=\"emoji\" src=\"//telegram.org/img/emoji/40/F09F918D.png\" width=\"20\" height=\"20\" alt=\"👍\">\", \"<img class=\"emoji\" src=\"//telegram.org/img/emoji/40/F09F918E.png\" width=\"20\" height=\"20\" alt=\"👎\">\", \"<img class=\"emoji\" src=\"//telegram.org/img/emoji/40/E29DA4.png\" width=\"20\" height=\"20\" alt=\"❤\">\", \"<img class=\"emoji\" src=\"//telegram.org/img/emoji/40/F09F94A5.png\" width=\"20\" height=\"20\" alt=\"🔥\">\", \"<img class=\"emoji\" src=\"//telegram.org/img/emoji/40/F09FA5B0.png\" width=\"20\" height=\"20\" alt=\"🥰\">\",`,
			};

			const result = tableRowToField(row) as FieldString;
			expect(result.enum).toEqual(["👍", "👎", "❤", "🔥", "🥰"]);
		});

		test.todo("should parse numeric enum from description", () => {
			const row: TableRow = {
				name: "icon_color",
				type: { text: "Integer" },
				description:
					"Must be one of 7322096 (0x6FB9F0), 16766590 (0xFFD67E), 13338331 (0xCB86DB), 9367192 (0x8EEE98), 16749490 (0xFF93B2), or 16478047 (0xFB6F5F)",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				type: "integer",
				enum: [7322096, 16766590, 13338331, 9367192, 16749490, 16478047],
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

		test.todo("should add enum for integer types", () => {
			const row: TableRow = {
				name: "count",
				type: { text: "Integer" },
				description: "Can be one of 1, 2, 3",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				type: "integer",
				enum: [1, 2, 3],
			});
		});
	});

	describe("Default Detection", () => {
		test("should parse default number from description", () => {
			const row: TableRow = {
				name: "count",
				type: { text: "Integer" },
				description:
					"Limits the number of updates to be retrieved. Values between 1-100 are accepted. Defaults to 100.",
			};

			const result = tableRowToField(row);
			console.log(result);
			expect(result).toMatchObject({
				type: "integer",
				default: 100,
			});
			expect(result).not.toContainKey("enum");
		});
	});

	describe.todo("Constraint Detection", () => {
		test("should parse min/max from range", () => {
			const row: TableRow = {
				name: "member_limit",
				type: { text: "Integer" },
				description: "The maximum number of users; 1-99999",
			};

			const result = tableRowToField(row);
			console.log(result);
			expect(result).toMatchObject({
				type: "integer",
				min: 1,
				max: 99999,
			});
		});

		test("should parse default with existing enum", () => {
			const row: TableRow = {
				name: "cache_time",
				type: { text: "Integer" },
				description: "Defaults to 0. Can be 0, 1, 2, 3",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				type: "integer",
				default: 0,
				enum: [1, 2, 3],
			});
		});

		test.todo("should ignore range numbers in enum", () => {
			const row: TableRow = {
				name: "horizontal_accuracy",
				type: { text: "Float" },
				description: "Radius 0-1500 meters. Possible values: 0.5, 1.0, 1.5",
			};

			const result = tableRowToField(row);
			console.log(result);
			expect(result).toMatchObject({
				type: "float",
				min: 0,
				max: 1500,
				enum: [0.5, 1.0, 1.5],
			});
		});
		test("should handle NaN in constraints", () => {
			const row: TableRow = {
				name: "invalid",
				type: { text: "Integer" },
				description: "Values between invalid values",
			};

			const result = tableRowToField(row);
			expect(result).not.toHaveProperty("min");
			expect(result).not.toHaveProperty("max");
		});

		test("should parse numbers with parentheses", () => {
			const row: TableRow = {
				name: "priority",
				type: { text: "Integer" },
				description: "Values: 1 (high), 2 (medium), 3 (low)",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				type: "integer",
				enum: [1, 2, 3],
			});
		});
	});

	describe("Const Detection", () => {
		test("should parse const", () => {
			const row: TableRow = {
				name: "status",
				type: {
					text: "String",
				},
				description: "The member's status in the chat, always “creator”",
			};

			const result = tableRowToField(row);
			expect(result).toMatchObject({
				type: "string",
				const: "creator",
			});
		});
	});

	describe("Return Type Resolver", () => {
		const testCases = [
			{
				description:
					'Returns the revoked invite link as <a href="#chatinvitelink">ChatInviteLink</a> object.',
				expected: {
					type: "reference",
					reference: {
						name: "ChatInviteLink",
						anchor: "#chatinvitelink",
					},
				},
			},
			{
				description: "On success, returns True.",
				expected: {
					type: "boolean",
					const: true,
				},
			},
			{
				description:
					'Returns an Array of <a href="#update">Update</a> objects.',
				expected: {
					type: "array",
					arrayOf: {
						type: "reference",
						reference: {
							name: "Update",
							anchor: "#update",
						},
					},
				},
			},
			{
				description: "Returns a list of ChatMember objects.",
				expected: {
					type: "array",
					arrayOf: {
						type: "reference",
						reference: {
							name: "ChatMember",
							anchor: "#chatmember",
						},
					},
				},
			},
			{
				description: "Returns basic information about the bot.",
				expected: { type: "string" },
			},
			{
				description:
					'Returns the list of gifts that can be sent by the bot to users and channel chats. Requires no parameters. Returns a <a href="#gifts">gifts</a> object.',
				expected: {
					type: "array",
					arrayOf: {
						type: "reference",
						reference: {
							name: "Gifts",
							anchor: "#gifts",
						},
					},
				},
			},
		];

		test.each(testCases)(
			"should parse '$expected.type' from description",
			({ description, expected }) => {
				console.log(description, expected.type);
				const result = resolveReturnType(description);
				expect(result).toMatchObject(expected);
			},
		);
	});
});
