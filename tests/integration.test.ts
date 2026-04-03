import { describe, expect, test } from "bun:test";
import * as cheerio from "cheerio";
import { parseAnchor } from "../src/parsers/archor.ts";
import { tableRowToField } from "../src/parsers/types.ts";
import { toCustomSchema } from "../src/to-custom-schema.ts";

describe("Integration Tests", () => {
	describe("Method Parsing", () => {
		test("should parse a simple method with parameters and return type", () => {
			const html = `
				<div id="dev_page_content">
					<h4><a class="anchor" name="sendmessage" href="#sendmessage"></a>sendMessage</h4>
					<p>Use this method to send text messages. On success, the sent <a href="#message">Message</a> is returned.</p>
					<table class="table">
						<thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
						<tbody>
							<tr>
								<td>chat_id</td>
								<td>Integer</td>
								<td>Yes</td>
								<td>Unique identifier for the target chat</td>
							</tr>
							<tr>
								<td>text</td>
								<td>String</td>
								<td>Yes</td>
								<td>Text of the message to be sent, 1-4096 characters</td>
							</tr>
						</tbody>
					</table>
				</div>
			`;
			const $ = cheerio.load(html);
			const anchor = $('a[name="sendmessage"]');
			const section = parseAnchor($, anchor);
			expect(section).not.toBeNull();
			expect(section?.title).toBe("sendMessage");
			expect(section?.type).toBe("Method");
			expect(section?.table?.length).toBe(2);
		});
	});

	describe("Object Parsing", () => {
		test("should parse an object with fields", () => {
			const html = `
				<div id="dev_page_content">
					<h4><a class="anchor" name="user" href="#user"></a>User</h4>
					<p>This object represents a Telegram user or bot.</p>
					<table class="table">
						<thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
						<tbody>
							<tr>
								<td>id</td>
								<td>Integer</td>
								<td>Unique identifier for this user</td>
							</tr>
							<tr>
								<td>first_name</td>
								<td>String</td>
								<td>User's first name</td>
							</tr>
						</tbody>
					</table>
				</div>
			`;
			const $ = cheerio.load(html);
			const anchor = $('a[name="user"]');
			const section = parseAnchor($, anchor);
			expect(section).not.toBeNull();
			expect(section?.title).toBe("User");
			expect(section?.type).toBe("Object");
			expect(section?.table?.length).toBe(2);
		});

		test("should parse an object with oneOf", () => {
			const html = `
				<div id="dev_page_content">
					<h4><a class="anchor" name="chatmember" href="#chatmember"></a>ChatMember</h4>
					<p>This object contains information about one member of a chat. Currently, the following 6 types of chat members are supported:</p>
					<ul>
						<li><a href="#chatmemberowner">ChatMemberOwner</a></li>
						<li><a href="#chatmemberadministrator">ChatMemberAdministrator</a></li>
						<li><a href="#chatmembermember">ChatMemberMember</a></li>
					</ul>
				</div>
			`;
			const $ = cheerio.load(html);
			const anchor = $('a[name="chatmember"]');
			const section = parseAnchor($, anchor);
			expect(section).not.toBeNull();
			expect(section?.type).toBe("Object");
			expect(section?.oneOf?.length).toBe(3);
			expect(section?.oneOf?.[0].text).toBe("ChatMemberOwner");
		});
	});

	describe("Full Pipeline", () => {
		test("should produce valid CustomSchema from sections", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};

			const sections = [
				{
					anchor: "#getme",
					title: "getMe",
					type: "Method" as const,
					description:
						'<p>A simple method for testing. Returns basic information about the bot in form of a <a href="#user">User</a> object.</p>',
					table: [],
				},
				{
					anchor: "#user",
					title: "User",
					type: "Object" as const,
					description: "<p>This object represents a Telegram user or bot.</p>",
					table: [
						{
							name: "id",
							type: { text: "Integer" },
							description: "Unique identifier for this user",
						},
						{
							name: "is_bot",
							type: { text: "Boolean" },
							description: "True, if this user is a bot",
						},
					],
				},
			];

			const schema = toCustomSchema(version, sections);
			expect(schema.version).toEqual(version);
			expect(schema.methods.length).toBe(1);
			// 1 parsed object + 3 hardcoded APIResponse* objects always injected
			expect(schema.objects.length).toBe(4);
			expect(schema.methods[0].name).toBe("getMe");
			expect(schema.methods[0].hasMultipart).toBe(false);
			expect(schema.objects[0].name).toBe("User");
			expect(schema.objects[0].type).toBe("fields");
		});

		test("should detect hasMultipart on methods with file params", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};

			const sections = [
				{
					anchor: "#sendphoto",
					title: "sendPhoto",
					type: "Method" as const,
					description:
						'<p>Use this method to send photos. On success, the sent <a href="#message">Message</a> is returned.</p>',
					table: [
						{
							name: "chat_id",
							type: { text: "Integer" },
							required: "Yes",
							description: "Unique identifier for the target chat",
						},
						{
							name: "photo",
							type: {
								text: '<a href="#inputfile">InputFile</a> or String',
								href: "#inputfile",
							},
							required: "Yes",
							description: "Photo to send",
						},
					],
				},
			];

			const schema = toCustomSchema(version, sections);
			expect(schema.methods[0].hasMultipart).toBe(true);
		});

		test("should include oneOf links in description", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};

			const sections = [
				{
					anchor: "#maybeinaccessiblemessage",
					title: "MaybeInaccessibleMessage",
					type: "Object" as const,
					description:
						"<p>This object describes a message that can be inaccessible to the bot. It can be one of</p>",
					oneOf: [
						{ text: "Message", href: "#message" },
						{ text: "InaccessibleMessage", href: "#inaccessiblemessage" },
					],
				},
			];

			const schema = toCustomSchema(version, sections);
			const obj = schema.objects[0];
			expect(obj.type).toBe("oneOf");
			expect(obj.description).toContain(
				"[Message](https://core.telegram.org/bots/api#message)",
			);
			expect(obj.description).toContain(
				"[InaccessibleMessage](https://core.telegram.org/bots/api#inaccessiblemessage)",
			);
		});

		test("should create unknown object type for empty objects", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};

			const sections = [
				{
					anchor: "#sometype",
					title: "SomeType",
					type: "Object" as const,
					description: "<p>Some description.</p>",
					table: [],
				},
			];

			const schema = toCustomSchema(version, sections);
			expect(schema.objects[0].type).toBe("unknown");
		});
	});

	describe("Semantic Markers", () => {
		test("InputFile reference for explicit InputFile type", () => {
			const field = tableRowToField({
				name: "photo",
				type: { text: "InputFile", href: "#inputfile" },
				required: "Yes",
				description: "Photo to send",
			});
			expect(field.type).toBe("reference");
			if (field.type === "reference") {
				expect(field.reference.name).toBe("InputFile");
				expect(field.reference.anchor).toBe("#inputfile");
			}
		});

		test("one_of [InputFile, string] for InputFile or String type", () => {
			const field = tableRowToField({
				name: "thumbnail",
				type: {
					text: '<a href="#inputfile">InputFile</a> or String',
					href: "#inputfile",
				},
				required: "Optional",
				description: "Thumbnail of the file",
			});
			expect(field.type).toBe("one_of");
			if (field.type === "one_of") {
				expect(field.variants[0].type).toBe("reference");
				if (field.variants[0].type === "reference") {
					expect(field.variants[0].reference.name).toBe("InputFile");
				}
				expect(field.variants[1].type).toBe("string");
			}
		});

		test("hasMultipart is true when a field references InputFile", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};
			const sections = [
				{
					anchor: "#senddocument",
					title: "sendDocument",
					type: "Method" as const,
					description:
						'<p>Use this method to send files. On success, the sent <a href="#message">Message</a> is returned.</p>',
					table: [
						{
							name: "document",
							type: { text: "InputFile", href: "#inputfile" },
							required: "Yes",
							description: "File to send",
						},
					],
				},
			];
			const schema = toCustomSchema(version, sections);
			expect(schema.methods[0].hasMultipart).toBe(true);
		});

		test("semanticType: 'formattable' on string field with entities parsing description", () => {
			const field = tableRowToField({
				name: "text",
				type: { text: "String" },
				required: "Yes",
				description:
					"Text of the message, 1-4096 characters after entities parsing",
			});
			expect(field.type).toBe("string");
			if (field.type === "string") {
				expect(field.semanticType).toBe("formattable");
			}
		});

		test("semanticType: 'formattable' via _parse_mode sibling on input object (InputPollOption pattern)", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};
			const sections = [
				{
					anchor: "#inputpolloption",
					title: "InputPollOption",
					type: "Object" as const,
					description: "<p>This object contains information about one answer option in a poll to be sent.</p>",
					table: [
						{
							name: "text",
							type: { text: "String" },
							description: "Option text, 1-100 characters",
						},
						{
							name: "text_parse_mode",
							type: { text: "String" },
							description: "Optional. Mode for parsing entities in the text.",
						},
						{
							name: "text_entities",
							type: { text: "Array of MessageEntity" },
							description: "Optional. Special entities in the poll option text.",
						},
					],
				},
			];
			const schema = toCustomSchema(version, sections);
			const obj = schema.objects[0];
			expect(obj.type).toBe("fields");
			if (obj.type === "fields") {
				const textField = obj.fields.find((f) => f.key === "text");
				const parseModeField = obj.fields.find((f) => f.key === "text_parse_mode");
				expect(textField?.type).toBe("string");
				if (textField?.type === "string") {
					expect(textField.semanticType).toBe("formattable");
				}
				// text_parse_mode itself must NOT be marked formattable
				expect(parseModeField?.type).toBe("string");
				if (parseModeField?.type === "string") {
					expect(parseModeField.semanticType).toBeUndefined();
				}
			}
		});

		test("response object (Message-style) with only _entities sibling must NOT be formattable", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};
			const sections = [
				{
					anchor: "#message",
					title: "Message",
					type: "Object" as const,
					description: "<p>This object represents a message.</p>",
					table: [
						{
							name: "caption",
							type: { text: "String" },
							description: "Optional. Caption for the media.",
						},
						{
							name: "caption_entities",
							type: { text: "Array of MessageEntity" },
							description: "Optional. Special entities in the caption.",
						},
					],
				},
			];
			const schema = toCustomSchema(version, sections);
			const obj = schema.objects[0];
			expect(obj.type).toBe("fields");
			if (obj.type === "fields") {
				const captionField = obj.fields.find((f) => f.key === "caption");
				expect(captionField?.type).toBe("string");
				if (captionField?.type === "string") {
					// No _parse_mode sibling → response object → must NOT be formattable
					expect(captionField.semanticType).toBeUndefined();
				}
			}
		});

		test("semanticType: 'formattable' via _parse_mode sibling only", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};
			const sections = [
				{
					anchor: "#somemethod",
					title: "someMethod",
					type: "Method" as const,
					description: "<p>Returns <a href=\"#message\">Message</a>.</p>",
					table: [
						{
							name: "caption",
							type: { text: "String" },
							required: "Optional",
							description: "Caption, 0-1024 characters",
						},
						{
							name: "caption_parse_mode",
							type: { text: "String" },
							required: "Optional",
							description: "Mode for parsing entities in the caption.",
						},
					],
				},
			];
			const schema = toCustomSchema(version, sections);
			const captionField = schema.methods[0].parameters.find(
				(f) => f.key === "caption",
			);
			expect(captionField?.type).toBe("string");
			if (captionField?.type === "string") {
				expect(captionField.semanticType).toBe("formattable");
			}
		});

		test("semanticType: 'updateType' on arrayOf string with 'update type' description", () => {
			const field = tableRowToField({
				name: "allowed_updates",
				type: { text: "Array of String" },
				required: "Optional",
				description: "A JSON-serialized list of the update type to be received",
			});
			expect(field.type).toBe("array");
			if (field.type === "array") {
				expect(field.arrayOf.type).toBe("string");
				if (field.arrayOf.type === "string") {
					expect(field.arrayOf.semanticType).toBe("updateType");
				}
			}
		});

		test("Currency reference for ISO 4217 string fields", () => {
			const field = tableRowToField({
				name: "currency",
				type: { text: "String" },
				required: "Yes",
				description: "Three-letter ISO 4217 currency code",
			});
			expect(field.type).toBe("reference");
			if (field.type === "reference") {
				expect(field.reference.name).toBe("Currencies");
				expect(field.reference.anchor).toBe("#currencies");
			}
		});

		test("semanticType: 'markup' on markup objects", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};
			const sections = [
				{
					anchor: "#inlinekeyboardmarkup",
					title: "InlineKeyboardMarkup",
					type: "Object" as const,
					description: "<p>Represents an inline keyboard.</p>",
					table: [
						{
							name: "inline_keyboard",
							type: { text: "Array of Array of InlineKeyboardButton" },
							description: "Array of button rows",
						},
					],
				},
				{
					anchor: "#replykeyboardmarkup",
					title: "ReplyKeyboardMarkup",
					type: "Object" as const,
					description: "<p>Represents a custom keyboard.</p>",
					table: [
						{
							name: "keyboard",
							type: { text: "Array of Array of KeyboardButton" },
							description: "Array of button rows",
						},
					],
				},
				{
					anchor: "#replykeyboardremove",
					title: "ReplyKeyboardRemove",
					type: "Object" as const,
					description: "<p>Removes the reply keyboard.</p>",
					table: [
						{
							name: "remove_keyboard",
							type: { text: "Boolean" },
							description: "Requests clients to remove the custom keyboard",
						},
					],
				},
				{
					anchor: "#forcereply",
					title: "ForceReply",
					type: "Object" as const,
					description: "<p>Shows a reply interface.</p>",
					table: [
						{
							name: "force_reply",
							type: { text: "Boolean" },
							description: "Shows reply interface to the user",
						},
					],
				},
				{
					anchor: "#user",
					title: "User",
					type: "Object" as const,
					description: "<p>Represents a user.</p>",
					table: [
						{
							name: "id",
							type: { text: "Integer" },
							description: "Unique identifier",
						},
					],
				},
			];
			const schema = toCustomSchema(version, sections);
			const byName = (name: string) =>
				schema.objects.find((o) => o.name === name);

			expect(byName("InlineKeyboardMarkup")?.semanticType).toBe("markup");
			expect(byName("ReplyKeyboardMarkup")?.semanticType).toBe("markup");
			expect(byName("ReplyKeyboardRemove")?.semanticType).toBe("markup");
			expect(byName("ForceReply")?.semanticType).toBe("markup");
			expect(byName("User")?.semanticType).toBeUndefined();
		});

		test("InputFile object gets type: 'file' not 'unknown'", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};
			const sections = [
				{
					anchor: "#inputfile",
					title: "InputFile",
					type: "Object" as const,
					description:
						"<p>This object represents the contents of a file to be uploaded. Must be posted using multipart/form-data.</p>",
					table: [],
				},
				{
					anchor: "#callbackgame",
					title: "CallbackGame",
					type: "Object" as const,
					description: "<p>A placeholder, currently holds no information.</p>",
					table: [],
				},
			];
			const schema = toCustomSchema(version, sections);
			const inputFile = schema.objects.find((o) => o.name === "InputFile");
			const callbackGame = schema.objects.find((o) => o.name === "CallbackGame");
			expect(inputFile?.type).toBe("file");
			expect(callbackGame?.type).toBe("unknown");
		});

		test("Currencies enum object injected when currencies provided", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};
			const currencies = ["USD", "EUR", "GBP"];
			const schema = toCustomSchema(version, [], currencies);
			const currenciesObj = schema.objects.find((o) => o.name === "Currencies");
			expect(currenciesObj).toBeDefined();
			expect(currenciesObj?.type).toBe("enum");
			if (currenciesObj?.type === "enum") {
				expect(currenciesObj.values).toEqual(["USD", "EUR", "GBP"]);
				expect(currenciesObj.anchor).toBe("#currencies");
			}
		});

		test("Currencies not injected when currencies array is empty", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};
			const schema = toCustomSchema(version, [], []);
			expect(
				schema.objects.find((o) => o.name === "Currencies"),
			).toBeUndefined();
		});

		test("type: 'one_of' [InputFile, string] for String fields with Sending Files description", () => {
			const field = tableRowToField({
				name: "media",
				type: { text: "String" },
				description:
					'File to send. Pass a file_id or HTTP URL, or "attach://" for multipart. <a href="https://core.telegram.org/bots/api/#sending-files">More information on Sending Files »</a>',
			});
			expect(field.type).toBe("one_of");
			if (field.type === "one_of") {
				expect(field.variants[0].type).toBe("reference");
				if (field.variants[0].type === "reference") {
					expect(field.variants[0].reference.name).toBe("InputFile");
					expect(field.variants[0].reference.anchor).toBe("#inputfile");
				}
				expect(field.variants[1].type).toBe("string");
			}
		});

		test("APIResponseOk is always injected with ok and result fields", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};
			const schema = toCustomSchema(version, []);
			const obj = schema.objects.find((o) => o.name === "APIResponseOk");
			expect(obj).toBeDefined();
			expect(obj?.type).toBe("fields");
			expect(obj?.anchor).toBe("#making-requests");
			if (obj?.type === "fields") {
				const ok = obj.fields.find((f) => f.key === "ok");
				expect(ok?.type).toBe("boolean");
				if (ok?.type === "boolean") {
					expect(ok.const).toBe(true);
					expect(ok.required).toBe(true);
				}
				const result = obj.fields.find((f) => f.key === "result");
				expect(result?.type).toBe("string");
				expect(result?.required).toBe(true);
			}
		});

		test("APIResponseError is always injected with all error fields", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};
			const schema = toCustomSchema(version, []);
			const obj = schema.objects.find((o) => o.name === "APIResponseError");
			expect(obj).toBeDefined();
			expect(obj?.type).toBe("fields");
			if (obj?.type === "fields") {
				const ok = obj.fields.find((f) => f.key === "ok");
				expect(ok?.type).toBe("boolean");
				if (ok?.type === "boolean") expect(ok.const).toBe(false);

				const description = obj.fields.find((f) => f.key === "description");
				expect(description?.type).toBe("string");
				expect(description?.required).toBe(true);

				const errorCode = obj.fields.find((f) => f.key === "error_code");
				expect(errorCode?.type).toBe("integer");
				expect(errorCode?.required).toBe(true);

				const parameters = obj.fields.find((f) => f.key === "parameters");
				expect(parameters?.type).toBe("reference");
				expect(parameters?.required).toBe(false);
				if (parameters?.type === "reference") {
					expect(parameters.reference.name).toBe("ResponseParameters");
					expect(parameters.reference.anchor).toBe("#responseparameters");
				}
			}
		});

		test("APIResponse is always injected as oneOf [APIResponseOk, APIResponseError]", () => {
			const version = {
				major: 7,
				minor: 4,
				release_date: { year: 2024, month: 6, day: 20 },
			};
			const schema = toCustomSchema(version, []);
			const obj = schema.objects.find((o) => o.name === "APIResponse");
			expect(obj).toBeDefined();
			expect(obj?.type).toBe("oneOf");
			if (obj?.type === "oneOf") {
				expect(obj.oneOf.length).toBe(2);
				const [first, second] = obj.oneOf;
				expect(first?.type).toBe("reference");
				if (first?.type === "reference")
					expect(first.reference.name).toBe("APIResponseOk");
				expect(second?.type).toBe("reference");
				if (second?.type === "reference")
					expect(second.reference.name).toBe("APIResponseError");
			}
		});

		test("emoji enum bug: integer field with emoji does not get enum", () => {
			const field = tableRowToField({
				name: "value",
				type: { text: "Integer" },
				required: "Yes",
				description:
					'Value of the dice, 1-6 for <img class="emoji" src="" alt="🎲"> and <img class="emoji" src="" alt="🎯"> base emoji',
			});
			expect(field.type).toBe("integer");
			if (field.type === "integer") {
				expect(field.enum).toBeUndefined();
			}
		});
	});
});
