import { parseAnchor, parseSections } from "./src/parsers/archor.ts";
import { parseLastVersion } from "./src/parsers/index.ts";
import { parseNavigation } from "./src/parsers/navbar.ts";
import { toCustomSchema } from "./src/to-custom-schema.ts";

import { getCustomSchema, getTelegramBotAPIContentFromFile } from "./src/index.ts";

const customSchema = await getCustomSchema();

// const lastVersion = parseLastVersion($);

// console.log(lastVersion);

// const navbar = parseNavigation($);

// const sections = parseSections($, navbar.slice(3)).filter(
// 	(x) => !x.title.includes(" "),
// );

// await Bun.write("last-version.json", JSON.stringify(lastVersion, null, 2));
// await Bun.write("sections.json", JSON.stringify(sections, null, 2));

// const customSchema = toCustomSchema(lastVersion, sections);

await Bun.write("custom-schema.json", JSON.stringify(customSchema, null, 2));
