import { parseAnchor } from "./parsers/archor.ts";
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

const anchor = parseAnchor($, "#update");

// await Bun.write("last-version.json", JSON.stringify(lastVersion, null, 2));
