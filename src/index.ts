import { parseAllSections, parseAnchor } from "./parsers/archor.ts";
import { parseLastVersion } from "./parsers/index.ts";
import { parseNavigation } from "./parsers/navbar.ts";

import {
	fetchTelegramBotAPIContent,
	getTelegramBotAPIContentFromFile,
} from "./utils.ts";

const $ = await fetchTelegramBotAPIContent();

const lastVersion = parseLastVersion($);

console.log(lastVersion);

const navbar = parseNavigation($);

const sections = parseAllSections($);

console.log(sections);

await Bun.write("last-version.json", JSON.stringify(lastVersion, null, 2));
await Bun.write("sections.json", JSON.stringify(sections, null, 2));
