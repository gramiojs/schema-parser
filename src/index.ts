import { parseSections } from "./parsers/archor.ts";
import { parseLastVersion } from "./parsers/index.ts";
import { parseNavigation } from "./parsers/navbar.ts";
import { toCustomSchema } from "./to-custom-schema.ts";
import { fetchTelegramBotAPIContent } from "./utils.ts";

export * from "./parsers/index.ts";
export * from "./parsers/archor.ts";
export * from "./parsers/navbar.ts";
export * from "./parsers/types.ts";
export * from "./parsers/sentence.ts";
export * from "./to-custom-schema.ts";
export * from "./utils.ts";

export async function getCustomSchema() {
	const [$, currenciesRaw] = await Promise.all([
		fetchTelegramBotAPIContent(),
		fetch("https://core.telegram.org/bots/payments/currencies.json")
			.then((r) => r.json() as Promise<Record<string, unknown>>)
			.catch(() => ({})),
	]);

	const lastVersion = parseLastVersion($);

	const navbar = parseNavigation($);

	const sections = parseSections($, navbar.slice(3)).filter(
		(x) => !x.title.includes(" "),
	);

	const currencies = Object.keys(currenciesRaw);

	currencies.push('XTR'); // XTR is not in the currencies because it is not a real currency but is used in the schema

	return toCustomSchema(lastVersion, sections, currencies);
}
