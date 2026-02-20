import { describe, expect, test } from "bun:test";
import * as cheerio from "cheerio";
import { parseAnchor } from "../src/parsers/archor.ts";
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
					description:
						"<p>This object represents a Telegram user or bot.</p>",
					table: [
						{
							name: "id",
							type: { text: "Integer" },
							description: "Unique identifier for this user",
						},
						{
							name: "is_bot",
							type: { text: "Boolean" },
							description:
								"True, if this user is a bot",
						},
					],
				},
			];

			const schema = toCustomSchema(version, sections);
			expect(schema.version).toEqual(version);
			expect(schema.methods.length).toBe(1);
			expect(schema.objects.length).toBe(1);
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
});
