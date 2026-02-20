import { describe, expect, test } from "bun:test";
import { resolveReturnType } from "../src/parsers/types.ts";

describe("Return Type Resolver", () => {
	describe("Boolean returns", () => {
		test("should parse 'Returns True'", () => {
			const result = resolveReturnType("On success, returns True.");
			expect(result).toMatchObject({ type: "boolean", const: true });
		});

		test("should parse 'True is returned'", () => {
			const result = resolveReturnType("True is returned on success.");
			expect(result).toMatchObject({ type: "boolean", const: true });
		});

		test("should parse Returns True with emphasis", () => {
			const result = resolveReturnType(
				"Returns <em>True</em> on success.",
			);
			expect(result).toMatchObject({ type: "boolean", const: true });
		});
	});

	describe("Reference returns", () => {
		test("should parse ChatInviteLink return", () => {
			const result = resolveReturnType(
				'Returns the revoked invite link as <a href="#chatinvitelink">ChatInviteLink</a> object.',
			);
			expect(result).toMatchObject({
				type: "reference",
				reference: {
					name: "ChatInviteLink",
					anchor: "#chatinvitelink",
				},
			});
		});

		test("should parse MessageId return", () => {
			const result = resolveReturnType(
				'Returns the <a href="#messageid">MessageId</a> of the sent message.',
			);
			expect(result).toMatchObject({
				type: "reference",
				reference: {
					name: "MessageId",
					anchor: "#messageid",
				},
			});
		});

		test("should parse File return", () => {
			const result = resolveReturnType(
				'Returns the uploaded <a href="#file">File</a> on success.',
			);
			expect(result).toMatchObject({
				type: "reference",
				reference: {
					name: "File",
					anchor: "#file",
				},
			});
		});

		test("should parse Message return from sent message description", () => {
			const result = resolveReturnType(
				'<p>Use this method to send messages. Returns the sent <a href="#message">Message</a> object.',
			);
			expect(result).toMatchObject({
				type: "reference",
				reference: { name: "Message", anchor: "#message" },
			});
		});

		test("should parse direct link fallback", () => {
			const result = resolveReturnType(
				'Returns basic information about the bot in form of a <a href="#user">User</a> object.',
			);
			expect(result).toMatchObject({
				type: "reference",
				reference: { name: "User", anchor: "#user" },
			});
		});
	});

	describe("Array returns", () => {
		test("should parse Array of Update", () => {
			const result = resolveReturnType(
				'Returns an Array of <a href="#update">Update</a> objects.',
			);
			expect(result).toMatchObject({
				type: "array",
				arrayOf: {
					type: "reference",
					reference: { name: "Update", anchor: "#update" },
				},
			});
		});

		test("should parse Array of ChatMember", () => {
			const result = resolveReturnType(
				"Returns an Array of <a href='#chatmember'>ChatMember</a> objects.",
			);
			expect(result).toMatchObject({
				type: "array",
				arrayOf: {
					type: "reference",
					reference: { name: "ChatMember", anchor: "#chatmember" },
				},
			});
		});

		test("should parse Array of User", () => {
			const result = resolveReturnType(
				'Returns Array of <a href="#user">User</a> objects. Some additional text.',
			);
			expect(result).toMatchObject({
				type: "array",
				arrayOf: {
					type: "reference",
					reference: { name: "User", anchor: "#user" },
				},
			});
		});

		test("should parse array of MessageId", () => {
			const result = resolveReturnType(
				'On success, an array of <a href="#messageid">MessageId</a> of the sent messages is returned.',
			);
			expect(result).toMatchObject({
				type: "array",
				arrayOf: {
					type: "reference",
					reference: { name: "MessageId", anchor: "#messageid" },
				},
			});
		});
	});

	describe("Union returns", () => {
		test("should parse Message or True", () => {
			const result = resolveReturnType(
				'<a href="#message">Message</a> is returned, otherwise <em>True</em> is returned.',
			);
			expect(result).toMatchObject({
				type: "one_of",
				variants: [
					{
						type: "reference",
						reference: { name: "Message", anchor: "#message" },
					},
					{ type: "boolean", const: true },
				],
			});
		});
	});

	describe("Special cases", () => {
		test("should parse Gifts return (list excluded, falls through)", () => {
			const result = resolveReturnType(
				'Returns the list of gifts that can be sent by the bot. Returns a <a href="#gifts">Gifts</a> object.',
			);
			// The "Returns the list of" sentence is excluded, falls through to second sentence
			expect(result).toMatchObject({
				type: "reference",
				reference: { name: "Gifts", anchor: "#gifts" },
			});
		});

		test("should parse Int return", () => {
			const result = resolveReturnType(
				"Returns Int on success. The number of stars transferred.",
			);
			expect(result).toMatchObject({ type: "integer" });
		});

		test("should fallback to string for plain text", () => {
			const result = resolveReturnType(
				"Returns basic information about the bot.",
			);
			expect(result).toMatchObject({ type: "string" });
		});
	});

	describe("Plural stripping", () => {
		test("should strip Messages to Message", () => {
			const result = resolveReturnType(
				'On success, an Array of <a href="#message">Messages</a> is returned.',
			);
			expect(result).toMatchObject({
				type: "array",
				arrayOf: {
					type: "reference",
					reference: { name: "Message" },
				},
			});
		});
	});
});
