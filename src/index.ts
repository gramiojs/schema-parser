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
	const $ = await fetchTelegramBotAPIContent();

	const lastVersion = parseLastVersion($);

	const navbar = parseNavigation($);

	const sections = parseSections($, navbar.slice(3)).filter(
		(x) => !x.title.includes(" "),
	);

	const customSchema = toCustomSchema(lastVersion, sections);

	return customSchema;
}
