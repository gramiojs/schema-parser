import { parseLastVersion } from "./parsers/index.ts";
import {
	fetchTelegramBotAPIContent,
	getTelegramBotAPIContentFromFile,
} from "./utils.ts";

const $ = await getTelegramBotAPIContentFromFile();

const lastVersion = parseLastVersion($);

console.log(lastVersion);

await Bun.write("last-version.json", JSON.stringify(lastVersion, null, 2));
