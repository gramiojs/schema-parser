import { describe, expect, test } from "bun:test";
import type { Field } from "../src/parsers/types.ts";
import { maybeFileToSend } from "../src/parsers/types.ts";

describe("File Upload Detection", () => {
	test("InputFile reference should be file upload", () => {
		const field: Field = {
			key: "photo",
			type: "reference",
			reference: { name: "InputFile", anchor: "#inputfile" },
		};
		expect(maybeFileToSend(field)).toBe(true);
	});

	test("InputMedia reference should be file upload", () => {
		const field: Field = {
			key: "media",
			type: "reference",
			reference: { name: "InputMedia", anchor: "#inputmedia" },
		};
		expect(maybeFileToSend(field)).toBe(true);
	});

	test("InputPollOption should NOT be file upload", () => {
		const field: Field = {
			key: "options",
			type: "reference",
			reference: { name: "InputPollOption", anchor: "#inputpolloption" },
		};
		expect(maybeFileToSend(field)).toBe(false);
	});

	test("String should NOT be file upload", () => {
		const field: Field = {
			key: "text",
			type: "string",
		};
		expect(maybeFileToSend(field)).toBe(false);
	});

	test("Integer should NOT be file upload", () => {
		const field: Field = {
			key: "count",
			type: "integer",
		};
		expect(maybeFileToSend(field)).toBe(false);
	});

	test("Boolean should NOT be file upload", () => {
		const field: Field = {
			key: "flag",
			type: "boolean",
		};
		expect(maybeFileToSend(field)).toBe(false);
	});

	test("Array of InputFile should be file upload", () => {
		const field: Field = {
			key: "files",
			type: "array",
			arrayOf: {
				key: "",
				type: "reference",
				reference: { name: "InputFile", anchor: "#inputfile" },
			},
		};
		expect(maybeFileToSend(field)).toBe(true);
	});

	test("OneOf with InputFile variant should be file upload", () => {
		const field: Field = {
			key: "file",
			type: "one_of",
			variants: [
				{
					key: "",
					type: "reference",
					reference: { name: "InputFile", anchor: "#inputfile" },
				},
				{ key: "", type: "string" },
			],
		};
		expect(maybeFileToSend(field)).toBe(true);
	});

	test("OneOf without Input* variants should NOT be file upload", () => {
		const field: Field = {
			key: "value",
			type: "one_of",
			variants: [
				{ key: "", type: "string" },
				{ key: "", type: "integer" },
			],
		};
		expect(maybeFileToSend(field)).toBe(false);
	});

	test("Array of non-Input reference should NOT be file upload", () => {
		const field: Field = {
			key: "users",
			type: "array",
			arrayOf: {
				key: "",
				type: "reference",
				reference: { name: "User", anchor: "#user" },
			},
		};
		expect(maybeFileToSend(field)).toBe(false);
	});

	test("InputMediaPhoto should be file upload", () => {
		const field: Field = {
			key: "media",
			type: "reference",
			reference: { name: "InputMediaPhoto", anchor: "#inputmediaphoto" },
		};
		expect(maybeFileToSend(field)).toBe(true);
	});

	test("InputSticker should be file upload", () => {
		const field: Field = {
			key: "sticker",
			type: "reference",
			reference: { name: "InputSticker", anchor: "#inputsticker" },
		};
		expect(maybeFileToSend(field)).toBe(true);
	});
});
