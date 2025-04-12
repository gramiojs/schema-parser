import { parseAnchor, parseSections } from "./parsers/archor.ts";
import { parseLastVersion } from "./parsers/index.ts";
import { parseNavigation } from "./parsers/navbar.ts";
import { toCustomSchema } from "./to-custom-schema.ts";

import {
	fetchTelegramBotAPIContent,
	getTelegramBotAPIContentFromFile,
} from "./utils.ts";

const $ = await getTelegramBotAPIContentFromFile();

const lastVersion = parseLastVersion($);

console.log(lastVersion);

const navbar = parseNavigation($);

const sections = parseSections($, navbar.slice(3));

console.log(sections);

await Bun.write("last-version.json", JSON.stringify(lastVersion, null, 2));
await Bun.write("sections.json", JSON.stringify(sections, null, 2));

const customSchema = toCustomSchema(lastVersion, sections);

await Bun.write("custom-schema.json", JSON.stringify(customSchema, null, 2));
