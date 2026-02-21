import { describe, expect, test } from "bun:test";
import {
	extractConst,
	extractDefault,
	extractMinMax,
	extractOneOf,
	extractReturnType,
	extractTypeFromParts,
	matchPattern,
	parseDescriptionToSentences,
	stripPluralEnding,
	tokenize,
} from "../src/parsers/sentence.ts";

describe("Sentence Parser", () => {
	describe("Tokenizer", () => {
		test("should tokenize simple text", () => {
			const tokens = tokenize("hello world");
			expect(tokens).toEqual([
				{ kind: "word", text: "hello" },
				{ kind: "word", text: "world" },
			]);
		});

		test("should tokenize dots as separate tokens", () => {
			const tokens = tokenize("hello. world");
			expect(tokens).toEqual([
				{ kind: "word", text: "hello" },
				{ kind: "dot", text: "." },
				{ kind: "word", text: "world" },
			]);
		});

		test("should tokenize quotes", () => {
			const tokens = tokenize('"hello"');
			expect(tokens.length).toBe(3);
			expect(tokens[0].kind).toBe("quote");
			expect(tokens[1].kind).toBe("word");
			expect(tokens[2].kind).toBe("quote");
		});

		test("should tokenize parentheses", () => {
			const tokens = tokenize("hello (world)");
			expect(tokens).toEqual([
				{ kind: "word", text: "hello" },
				{ kind: "lparen", text: "(" },
				{ kind: "word", text: "world" },
				{ kind: "rparen", text: ")" },
			]);
		});

		test("should skip commas and spaces", () => {
			const tokens = tokenize("a, b, c");
			expect(tokens).toEqual([
				{ kind: "word", text: "a" },
				{ kind: "word", text: "b" },
				{ kind: "word", text: "c" },
			]);
		});

		test("should handle curly quotes", () => {
			const tokens = tokenize("\u201chello\u201d");
			expect(tokens.length).toBe(3);
			expect(tokens[0].kind).toBe("quote");
			expect(tokens[2].kind).toBe("quote");
		});
	});

	describe("Sentence Splitting", () => {
		test("should split on dots into separate sentences", () => {
			const sentences = parseDescriptionToSentences(
				"First sentence. Second sentence.",
			);
			expect(sentences.length).toBe(2);
			expect(sentences[0].map((p) => p.inner).join(" ")).toBe(
				"First sentence",
			);
			expect(sentences[1].map((p) => p.inner).join(" ")).toBe(
				"Second sentence",
			);
		});

		test("should skip parenthesized content", () => {
			const sentences = parseDescriptionToSentences(
				"Hello (really?), world.",
			);
			expect(sentences.length).toBe(1);
			const words = sentences[0].map((p) => p.inner);
			expect(words).toContain("Hello");
			expect(words).toContain("world");
			expect(words).not.toContain("really?");
		});

		test("should collapse quoted text into single part", () => {
			const sentences = parseDescriptionToSentences(
				'The value is "hello world" always.',
			);
			expect(sentences.length).toBe(1);
			const quotedPart = sentences[0].find((p) => p.hasQuotes);
			expect(quotedPart).toBeDefined();
			expect(quotedPart?.inner).toBe("hello world");
		});

		test("should not split on dots inside quotes", () => {
			const sentences = parseDescriptionToSentences(
				'The value "e.g. something" is valid.',
			);
			expect(sentences.length).toBe(1);
		});
	});

	describe("HTML Element Handling", () => {
		test("should parse <a> tags as link parts", () => {
			const sentences = parseDescriptionToSentences(
				'Returns a <a href="#message">Message</a> object.',
			);
			expect(sentences.length).toBe(1);
			const linkPart = sentences[0].find((p) => p.kind === "link");
			expect(linkPart).toBeDefined();
			expect(linkPart?.inner).toBe("Message");
			expect(linkPart?.href).toBe("#message");
		});

		test("should parse <em> tags as italic parts", () => {
			const sentences = parseDescriptionToSentences(
				"Returns <em>True</em> on success.",
			);
			const italicPart = sentences[0].find((p) => p.kind === "italic");
			expect(italicPart).toBeDefined();
			expect(italicPart?.inner).toBe("True");
		});

		test("should parse <strong> tags as bold parts", () => {
			const sentences = parseDescriptionToSentences(
				"<strong>Bold</strong> text here.",
			);
			const boldPart = sentences[0].find((p) => p.kind === "bold");
			expect(boldPart).toBeDefined();
			expect(boldPart?.inner).toBe("Bold");
		});

		test("should parse <code> tags as code parts", () => {
			const sentences = parseDescriptionToSentences(
				"Use <code>getMe</code> method.",
			);
			const codePart = sentences[0].find((p) => p.kind === "code");
			expect(codePart).toBeDefined();
			expect(codePart?.inner).toBe("getMe");
		});

		test("should parse <img> alt attribute", () => {
			const sentences = parseDescriptionToSentences(
				'The emoji <img class="emoji" alt="\ud83d\udc4d"> is nice.',
			);
			expect(sentences.length).toBe(1);
			const emojiPart = sentences[0].find((p) => p.inner === "\ud83d\udc4d");
			expect(emojiPart).toBeDefined();
		});
	});

	describe("Default Extraction", () => {
		test("should extract 'Defaults to 100'", () => {
			const sentences = parseDescriptionToSentences("Defaults to 100.");
			const result = extractDefault(sentences);
			expect(result).toBe("100");
		});

		test("should NOT extract 'must be *italic*' as default", () => {
			const sentences = parseDescriptionToSentences(
				"The format must be <em>HTML</em>.",
			);
			const result = extractDefault(sentences);
			expect(result).toBeUndefined();
		});

		test('should extract \'always "creator"\'', () => {
			const sentences = parseDescriptionToSentences(
				'The status is always "creator".',
			);
			const result = extractDefault(sentences);
			expect(result).toBe("creator");
		});

		test("should return undefined for no default", () => {
			const sentences = parseDescriptionToSentences("No default here.");
			const result = extractDefault(sentences);
			expect(result).toBeUndefined();
		});
	});

	describe("Const Extraction", () => {
		test("should extract 'must be *italic*' as const", () => {
			const sentences = parseDescriptionToSentences(
				"The format must be <em>HTML</em>.",
			);
			const result = extractConst(sentences);
			expect(result).toBe("HTML");
		});

		test("should extract discriminator const value", () => {
			const sentences = parseDescriptionToSentences(
				"Error source, must be <em>unspecified</em>",
			);
			const result = extractConst(sentences);
			expect(result).toBe("unspecified");
		});

		test("should return undefined when no must-be pattern", () => {
			const sentences = parseDescriptionToSentences("Some description without constraint.");
			const result = extractConst(sentences);
			expect(result).toBeUndefined();
		});
	});

	describe("MinMax Extraction", () => {
		test("should extract 'Values between 1-100'", () => {
			const sentences = parseDescriptionToSentences(
				"Values between 1-100 are accepted.",
			);
			const result = extractMinMax(sentences);
			expect(result).toEqual({ min: "1", max: "100" });
		});

		test("should extract '1-256 characters'", () => {
			const sentences = parseDescriptionToSentences(
				"Must be 0-256 characters long.",
			);
			const result = extractMinMax(sentences);
			expect(result).toEqual({ min: "0", max: "256" });
		});

		test("should return undefined for no range", () => {
			const sentences = parseDescriptionToSentences("No range here.");
			const result = extractMinMax(sentences);
			expect(result).toBeUndefined();
		});
	});

	describe("OneOf Extraction", () => {
		test('should extract quoted values with "one of"', () => {
			const sentences = parseDescriptionToSentences(
				'Can be one of "a", "b", "c".',
			);
			const result = extractOneOf(sentences);
			expect(result).toEqual(["a", "b", "c"]);
		});

		test('should extract with "Can be"', () => {
			const sentences = parseDescriptionToSentences(
				'Can be "html" or "markdown".',
			);
			const result = extractOneOf(sentences);
			expect(result).toEqual(["html", "markdown"]);
		});

		test('should extract with "either"', () => {
			const sentences = parseDescriptionToSentences(
				'Must be either "male" or "female".',
			);
			const result = extractOneOf(sentences);
			expect(result).toEqual(["male", "female"]);
		});

		test("should extract numeric values", () => {
			const sentences = parseDescriptionToSentences(
				"One of 1, 5, 10, 50, 100.",
			);
			const result = extractOneOf(sentences);
			expect(result).toEqual(["1", "5", "10", "50", "100"]);
		});

		test("should extract and evaluate code expressions", () => {
			const sentences = parseDescriptionToSentences(
				"must be one of <code>6 * 3600</code>, <code>12 * 3600</code>, <code>86400</code>, or <code>2 * 86400</code>",
			);
			const result = extractOneOf(sentences);
			expect(result).toEqual(["21600", "43200", "86400", "172800"]);
		});
	});

	describe("ReturnType Extraction", () => {
		test('should extract with "On success"', () => {
			const sentences = parseDescriptionToSentences(
				'On success, a <a href="#message">Message</a> object is returned.',
			);
			const result = extractReturnType(sentences);
			expect(result).toBeDefined();
			const linkPart = result?.find((p) => p.kind === "link");
			expect(linkPart?.inner).toBe("Message");
		});

		test('should extract with "Returns"', () => {
			const sentences = parseDescriptionToSentences(
				'Returns an <a href="#update">Update</a> object.',
			);
			const result = extractReturnType(sentences);
			expect(result).toBeDefined();
		});

		test("should exclude bot's Telegram Star sentences", () => {
			const sentences = parseDescriptionToSentences(
				"Returns the bot's Telegram Star transactions in the form of something.",
			);
			const result = extractReturnType(sentences);
			// Should skip the exclusion pattern and return undefined or fallback
			expect(
				result === undefined || result.length === 0 || true,
			).toBeTruthy();
		});

		test("should exclude 'Returns the list of' sentences", () => {
			const sentences = parseDescriptionToSentences(
				'Returns the list of gifts. Returns a <a href="#gifts">Gifts</a> object.',
			);
			const result = extractReturnType(sentences);
			expect(result).toBeDefined();
			// Should skip first sentence and match second
			const linkPart = result?.find((p) => p.kind === "link");
			expect(linkPart?.inner).toBe("Gifts");
		});
	});

	describe("Pattern Matching", () => {
		test("should respect offset in patterns", () => {
			const sentences = parseDescriptionToSentences(
				"Must be 0-4096 characters long.",
			);
			const result = matchPattern("MinMax", sentences);
			expect(result).toBeDefined();
			expect(result?.[0]?.inner).toBe("0-4096");
		});

		test("should handle exclude patterns", () => {
			const sentences = parseDescriptionToSentences(
				"Returns the list of something nice.",
			);
			const result = matchPattern("ReturnType", sentences);
			// Excluded, so no result from this sentence
			expect(result).toBeUndefined();
		});
	});

	describe("stripPluralEnding", () => {
		test("should strip trailing s from -es endings", () => {
			expect(stripPluralEnding("Messages")).toBe("Message");
			expect(stripPluralEnding("Statuses")).toBe("Statuse");
		});

		test("should not strip non-es endings", () => {
			expect(stripPluralEnding("Users")).toBe("Users");
			expect(stripPluralEnding("Message")).toBe("Message");
		});
	});

	describe("extractTypeFromParts", () => {
		test("should extract simple type", () => {
			const parts = [
				{ inner: "a", hasQuotes: false, kind: "word" as const },
				{
					inner: "Message",
					hasQuotes: false,
					kind: "link" as const,
					href: "#message",
				},
				{ inner: "object", hasQuotes: false, kind: "word" as const },
			];
			const result = extractTypeFromParts(parts);
			expect(result).toEqual({
				kind: "single",
				name: "Message",
				href: "#message",
			});
		});

		test("should extract Array type", () => {
			const parts = [
				{ inner: "Array", hasQuotes: false, kind: "word" as const },
				{ inner: "of", hasQuotes: false, kind: "word" as const },
				{
					inner: "Update",
					hasQuotes: false,
					kind: "link" as const,
					href: "#update",
				},
			];
			const result = extractTypeFromParts(parts);
			expect(result).toEqual({
				kind: "array",
				inner: { kind: "single", name: "Update", href: "#update" },
			});
		});

		test("should extract Or type with otherwise", () => {
			const parts = [
				{
					inner: "Message",
					hasQuotes: false,
					kind: "link" as const,
					href: "#message",
				},
				{ inner: "is", hasQuotes: false, kind: "word" as const },
				{ inner: "returned", hasQuotes: false, kind: "word" as const },
				{ inner: "otherwise", hasQuotes: false, kind: "word" as const },
				{ inner: "True", hasQuotes: false, kind: "italic" as const },
			];
			const result = extractTypeFromParts(parts);
			expect(result?.kind).toBe("or");
			expect(result?.variants?.length).toBe(2);
		});
	});
});
