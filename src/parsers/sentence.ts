import * as cheerio from "cheerio";
import type { ChildNode, Element } from "domhandler";

// ── Part Types ──────────────────────────────────────────────────────────────

export type PartKind = "word" | "link" | "bold" | "italic" | "code";

export interface Part {
	inner: string;
	hasQuotes: boolean;
	kind: PartKind;
	href?: string;
}

export type Sentence = Part[];

function partNew(inner: string): Part {
	return { inner, hasQuotes: false, kind: "word" };
}

function partLink(inner: string, href: string): Part {
	return { inner, hasQuotes: false, kind: "link", href };
}

function partItalic(inner: string): Part {
	return { inner, hasQuotes: false, kind: "italic" };
}

function partBold(inner: string): Part {
	return { inner, hasQuotes: false, kind: "bold" };
}

function partCode(inner: string): Part {
	return { inner, hasQuotes: false, kind: "code" };
}

// ── Tokenizer ───────────────────────────────────────────────────────────────

type TokenKind = "word" | "dot" | "quote" | "lparen" | "rparen";

interface Token {
	kind: TokenKind;
	text: string;
}

const QUOTE_CHARS = new Set(['"', "\u201c", "\u201d"]);

export function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	// Match: dots, quotes (ASCII + curly), parens, or word-runs (anything not separator)
	const regex = /([.])|([""\u201c\u201d])|([(])|([)])|([^,\s.""\u201c\u201d()]+)/g;
	let m: RegExpExecArray | null;

	// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
	while ((m = regex.exec(text)) !== null) {
		if (m[1] !== undefined) {
			tokens.push({ kind: "dot", text: "." });
		} else if (m[2] !== undefined) {
			tokens.push({ kind: "quote", text: m[2] });
		} else if (m[3] !== undefined) {
			tokens.push({ kind: "lparen", text: "(" });
		} else if (m[4] !== undefined) {
			tokens.push({ kind: "rparen", text: ")" });
		} else if (m[5] !== undefined) {
			tokens.push({ kind: "word", text: m[5] });
		}
	}

	return tokens;
}

// ── Quote State Machine ─────────────────────────────────────────────────────

type QuoteState = "none" | "left" | "right";

function nextQuoteState(state: QuoteState): QuoteState {
	switch (state) {
		case "none":
			return "left";
		case "left":
			return "right";
		case "right":
			return "none";
	}
}

// ── HTML → Sentences Parser ─────────────────────────────────────────────────

export function parseDescriptionToSentences(html: string): Sentence[] {
	const $ = cheerio.load(html, { xmlMode: false });
	const sentences: Sentence[] = [];
	const parts: Part[] = [];
	let quote: QuoteState = "none";
	let quotePartStart = 0;
	let paren = false;

	function finalizeSentence() {
		if (parts.length > 0) {
			sentences.push([...parts]);
			parts.length = 0;
		}
	}

	function collapseQuotedParts() {
		const quotedParts = parts.splice(quotePartStart);
		const combined = quotedParts.map((p) => p.inner).join(" ");
		parts.push({ inner: combined, hasQuotes: true, kind: "word" });
	}

	function processTextNode(text: string) {
		const tokens = tokenize(text);
		for (const token of tokens) {
			switch (token.kind) {
				case "lparen":
					paren = true;
					break;
				case "rparen":
					paren = false;
					break;
				case "word":
					if (!paren) {
						parts.push(partNew(token.text));
					}
					break;
				case "dot":
					if (!paren && quote !== "left") {
						finalizeSentence();
					}
					break;
				case "quote":
					if (!paren) {
						quote = nextQuoteState(quote);
						if (quote === "left") {
							quotePartStart = parts.length;
						} else if (quote === "right") {
							collapseQuotedParts();
							quote = nextQuoteState(quote); // right -> none
						}
					}
					break;
			}
		}
	}

	function processNode(node: ChildNode) {
		if (node.type === "text") {
			processTextNode(node.data || "");
			return;
		}

		if (node.type !== "tag") return;
		if (paren) return;

		const el = node as Element;
		const tagName = el.tagName.toLowerCase();
		const $el = $(el);

		switch (tagName) {
			case "a": {
				const text = $el.text().trim();
				const href = $el.attr("href") || "";
				if (text) {
					parts.push(partLink(text, href));
				}
				break;
			}
			case "em": {
				const text = $el.text().trim();
				if (text) {
					parts.push(partItalic(text));
				}
				break;
			}
			case "strong":
			case "b": {
				const text = $el.text().trim();
				if (text) {
					parts.push(partBold(text));
				}
				break;
			}
			case "code": {
				const text = $el.text().trim();
				if (text) {
					parts.push(partCode(text));
				}
				break;
			}
			case "img": {
				const alt = $el.attr("alt") || "";
				if (alt) {
					const p: Part = { inner: alt, hasQuotes: quote === "left", kind: "word" };
					parts.push(p);
				}
				break;
			}
			case "li": {
				finalizeSentence();
				const childSentences = parseDescriptionToSentences(
					$el.html() || "",
				);
				sentences.push(...childSentences);
				break;
			}
			case "br":
				break;
			case "p": {
				// Process children of <p> inline
				for (const child of el.children) {
					processNode(child);
				}
				break;
			}
			default: {
				// For other tags, process children inline
				for (const child of el.children) {
					processNode(child);
				}
				break;
			}
		}
	}

	// Process top-level children of the parsed HTML body
	const root = $.root();
	root.contents().each((_, node) => {
		processNode(node);
	});

	finalizeSentence();
	return sentences;
}

// ── Pattern System ──────────────────────────────────────────────────────────

type SearchBy =
	| { type: "word"; word: string }
	| { type: "kind"; kind: PartKind }
	| { type: "quotes" };

interface SearcherPattern {
	parts: SearchBy[];
	offset: number;
	exclude: boolean;
}

function word(w: string): SearchBy {
	return { type: "word", word: w };
}

function kind(k: PartKind): SearchBy {
	return { type: "kind", kind: k };
}

function quotes(): SearchBy {
	return { type: "quotes" };
}

function pattern(
	parts: SearchBy[],
	opts?: { offset?: number; exclude?: boolean },
): SearcherPattern {
	return {
		parts,
		offset: opts?.offset ?? 0,
		exclude: opts?.exclude ?? false,
	};
}

function matchesPart(search: SearchBy, part: Part): boolean {
	switch (search.type) {
		case "word":
			return part.inner === search.word;
		case "kind":
			return part.kind === search.kind;
		case "quotes":
			return part.hasQuotes;
	}
}

// ── Pattern Definitions ─────────────────────────────────────────────────────

export type PatternType = "ReturnType" | "Default" | "MinMax" | "OneOf";

function getPatterns(patternType: PatternType): SearcherPattern[] {
	switch (patternType) {
		case "ReturnType":
			return [
				pattern([word("Returns"), word("the"), word("bot's"), word("Telegram")], { exclude: true }),
				pattern([word("Returns"), word("the"), word("list"), word("of")], { exclude: true }),
				pattern([word("Returns"), word("the"), word("amount"), word("of")], { exclude: true }),
				pattern([word("On"), word("success")]),
				pattern([word("Returns")]),
				pattern([word("returns")]),
				pattern([word("An")]),
				pattern([word("is"), word("returned")], { offset: -3 }),
			];
		case "Default":
			return [
				pattern([word("Defaults"), word("to")]),
				pattern([word("defaults"), word("to")], { exclude: true }),
				pattern([word("defaults"), word("to")]),
				pattern([word("must"), word("be"), kind("italic")], { offset: -1 }),
				pattern([word("always"), quotes()], { offset: -1 }),
			];
		case "MinMax":
			return [
				pattern([word("Values"), word("between")]),
				pattern([word("characters")], { offset: -2 }),
			];
		case "OneOf":
			return [
				pattern([word("either")]),
				pattern([word("One"), word("of")]),
				pattern([word("one"), word("of")]),
				pattern([word("Can"), word("be")]),
				pattern([word("can"), word("be"), quotes()], { offset: -1 }),
				pattern([quotes(), word("or"), quotes()], { offset: -3 }),
				pattern([word("Choose"), word("one")]),
			];
	}
}

// ── Pattern Matcher ─────────────────────────────────────────────────────────

export function matchPattern(
	patternType: PatternType,
	sentences: Sentence[],
): Sentence | undefined {
	const patterns = getPatterns(patternType);

	for (const sentence of sentences) {
		let excluded = false;
		let result: Sentence | undefined;

		for (const searchPattern of patterns) {
			const windowSize = searchPattern.parts.length;
			if (windowSize > sentence.length) continue;

			for (let i = 0; i <= sentence.length - windowSize; i++) {
				let matches = true;
				for (let j = 0; j < windowSize; j++) {
					if (!matchesPart(searchPattern.parts[j], sentence[i + j])) {
						matches = false;
						break;
					}
				}

				if (matches) {
					if (searchPattern.exclude) {
						excluded = true;
						break;
					}

					const startIdx = Math.max(0, i + windowSize + searchPattern.offset);
					result = sentence.slice(startIdx);
					break;
				}
			}

			if (excluded || result) break;
		}

		if (excluded) continue;
		if (result) return result;
	}

	return undefined;
}

// ── Extractors ──────────────────────────────────────────────────────────────

export function extractDefault(
	sentences: Sentence[],
): string | undefined {
	const result = matchPattern("Default", sentences);
	if (!result || result.length === 0) return undefined;
	return result[0].inner;
}

export function extractMinMax(
	sentences: Sentence[],
): { min: string; max: string } | undefined {
	const result = matchPattern("MinMax", sentences);
	if (!result || result.length === 0) return undefined;

	const value = result[0].inner;
	const parts = value.split("-");
	if (parts.length < 2) return undefined;

	const min = parts[0].trim();
	const max = parts[1].trim();
	if (!min || !max) return undefined;

	return { min, max };
}

/** Try to evaluate a simple math expression (e.g. "6 * 3600" → "21600") */
function tryEvalSimpleExpr(expr: string): string {
	const m = expr.match(/^(\d+)\s*\*\s*(\d+)$/);
	if (m) return String(Number(m[1]) * Number(m[2]));
	return expr;
}

function isValuePart(part: Part): boolean {
	return (
		part.hasQuotes ||
		part.kind === "italic" ||
		part.kind === "code" ||
		/^\d+$/.test(part.inner)
	);
}

function partToValue(part: Part): string {
	return part.kind === "code" ? tryEvalSimpleExpr(part.inner) : part.inner;
}

export function extractOneOf(
	sentences: Sentence[],
): string[] | undefined {
	const patterns = getPatterns("OneOf");

	for (const sentence of sentences) {
		for (const searchPattern of patterns) {
			const windowSize = searchPattern.parts.length;
			if (windowSize > sentence.length) continue;

			for (let i = 0; i <= sentence.length - windowSize; i++) {
				let matches = true;
				for (let j = 0; j < windowSize; j++) {
					if (!matchesPart(searchPattern.parts[j], sentence[i + j])) {
						matches = false;
						break;
					}
				}

				if (!matches) continue;

				// Collect values from the offset slice
				const startIdx = Math.max(
					0,
					i + windowSize + searchPattern.offset,
				);
				const slice = sentence.slice(startIdx);
				let values = slice.filter(isValuePart).map(partToValue);

				// Also check the full sentence for values — handles cases like
				// 'pass "a", "b", or "c"' where offset can't reach "a"
				const fullValues = sentence
					.filter(isValuePart)
					.map(partToValue);
				if (fullValues.length > values.length) {
					values = fullValues;
				}

				// Deduplicate
				const seen = new Set<string>();
				const deduped: string[] = [];
				for (const v of values) {
					if (!seen.has(v)) {
						seen.add(v);
						deduped.push(v);
					}
				}

				if (deduped.length > 0) return deduped;
			}
		}
	}

	return undefined;
}

export function extractReturnType(
	sentences: Sentence[],
): Sentence | undefined {
	return matchPattern("ReturnType", sentences);
}

// ── Type Extraction from Parts ──────────────────────────────────────────────

export function stripPluralEnding(name: string): string {
	if (name.endsWith("es")) {
		return name.slice(0, -1);
	}
	return name;
}

function isFirstLetterUppercase(s: string): boolean {
	if (!s) return false;
	const first = s[0];
	return first === first.toUpperCase() && first !== first.toLowerCase();
}

export interface ExtractedType {
	kind: "single" | "array" | "or";
	name?: string;
	href?: string;
	inner?: ExtractedType;
	variants?: ExtractedType[];
}

export function extractTypeFromParts(parts: Part[]): ExtractedType | undefined {
	if (parts.length === 0) return undefined;

	// Check for "otherwise" → Or type
	const hasOtherwise = parts.some((p) => p.inner === "otherwise");
	if (hasOtherwise) {
		const types: ExtractedType[] = [];
		for (const part of parts) {
			if (part.inner === "otherwise") continue;
			if (isFirstLetterUppercase(part.inner)) {
				const name = stripPluralEnding(part.inner);
				types.push({
					kind: "single",
					name,
					href: part.href,
				});
			}
		}
		if (types.length > 0) {
			return { kind: "or", variants: types };
		}
		return undefined;
	}

	// Find the first uppercase-starting part (= a type name)
	let pos = -1;
	for (let i = 0; i < parts.length; i++) {
		if (isFirstLetterUppercase(parts[i].inner)) {
			pos = i;
			break;
		}
	}

	if (pos === -1) return undefined;

	const part = parts[pos];
	const name = stripPluralEnding(part.inner);

	// Check for "Array" as the type
	if (name === "Array") {
		const rest = parts.slice(pos + 1);
		// Skip "of" if present
		const afterOf =
			rest.length > 0 && rest[0].inner === "of" ? rest.slice(1) : rest;
		const innerType = extractTypeFromParts(afterOf);
		if (innerType) {
			return { kind: "array", inner: innerType };
		}
		return undefined;
	}

	// Check for "an array of" pattern preceding
	if (pos >= 3) {
		const prev3 = parts.slice(pos - 3, pos);
		if (
			prev3[0]?.inner === "an" &&
			prev3[1]?.inner === "array" &&
			prev3[2]?.inner === "of"
		) {
			const innerType = extractTypeFromParts(parts.slice(pos));
			if (innerType) {
				return { kind: "array", inner: innerType };
			}
		}
	}
	// Also check "a list of" / "the list of" preceding
	if (pos >= 3) {
		const prev3 = parts.slice(pos - 3, pos);
		if (
			(prev3[0]?.inner === "a" || prev3[0]?.inner === "the") &&
			prev3[1]?.inner === "list" &&
			prev3[2]?.inner === "of"
		) {
			const innerType = extractTypeFromParts(parts.slice(pos));
			if (innerType) {
				return { kind: "array", inner: innerType };
			}
		}
	}

	return {
		kind: "single",
		name,
		href: part.href,
	};
}
