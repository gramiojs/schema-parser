import { describe, expect, test } from "bun:test";
import { htmlToMarkdown } from "../src/parsers/utils.ts";

describe("htmlToMarkdown", () => {
	describe("protocol-relative image URLs", () => {
		test("should convert //telegram.org img src to https://", () => {
			const html = `<img class="emoji" src="//telegram.org/img/emoji/40/F09F8EB2.png" width="20" height="20" alt="🎲">`;
			const result = htmlToMarkdown(html);
			expect(result).toBe("![🎲](https://telegram.org/img/emoji/40/F09F8EB2.png)");
		});

		test("should convert all protocol-relative emoji imgs in a sentence", () => {
			const html = `Emoji, must be one of <img class="emoji" src="//telegram.org/img/emoji/40/F09F8EB2.png" alt="🎲">, <img class="emoji" src="//telegram.org/img/emoji/40/F09F8EAF.png" alt="🎯">`;
			const result = htmlToMarkdown(html);
			expect(result).toContain("https://telegram.org/img/emoji/40/F09F8EB2.png");
			expect(result).toContain("https://telegram.org/img/emoji/40/F09F8EAF.png");
			expect(result).not.toContain("![🎲](//");
			expect(result).not.toContain("![🎯](//");
		});
	});

	describe("anchor links", () => {
		test("should expand anchor-only href to full Telegram Bot API URL", () => {
			const html = `<a href="#message">Message</a>`;
			const result = htmlToMarkdown(html);
			expect(result).toBe("[Message](https://core.telegram.org/bots/api#message)");
		});
	});

	describe("relative links", () => {
		test("should expand root-relative href to full Telegram URL", () => {
			const html = `<a href="/bots/api">API</a>`;
			const result = htmlToMarkdown(html);
			expect(result).toBe("[API](https://core.telegram.org/bots/api)");
		});
	});
});
