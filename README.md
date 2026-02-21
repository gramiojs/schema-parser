# @gramio/schema-parser

[![npm](https://img.shields.io/npm/v/@gramio/schema-parser?logo=npm&style=flat&labelColor=000&color=3b82f6)](https://www.npmjs.org/package/@gramio/schema-parser)
[![npm downloads](https://img.shields.io/npm/dw/@gramio/schema-parser?logo=npm&style=flat&labelColor=000&color=3b82f6)](https://www.npmjs.org/package/@gramio/schema-parser)
[![JSR](https://jsr.io/badges/@gramio/schema-parser)](https://jsr.io/@gramio/schema-parser)
[![JSR Score](https://jsr.io/badges/@gramio/schema-parser/score)](https://jsr.io/@gramio/schema-parser)

Parses the [Telegram Bot API](https://core.telegram.org/bots/api) HTML documentation into a structured, strongly-typed JSON schema. Used as a foundation for code generation in [GramIO](https://github.com/gramiojs/gramio).

## Installation

```bash
# npm
npm install @gramio/schema-parser

# bun
bun add @gramio/schema-parser
```

## Usage

### Fetching and parsing

```ts
import { getCustomSchema } from "@gramio/schema-parser";

// Fetches the latest Telegram Bot API docs and parses them
const schema = await getCustomSchema();

console.log(schema.version); // { major: 9, minor: 0, release_date: { year: 2025, month: 4, day: 11 } }
console.log(schema.methods.length); // number of API methods
console.log(schema.objects.length); // number of API types
```

### Parsing from a local file

```ts
import { getTelegramBotAPIContentFromFile } from "@gramio/schema-parser";
import { parseLastVersion } from "@gramio/schema-parser";
import { parseNavigation } from "@gramio/schema-parser";
import { parseSections } from "@gramio/schema-parser";
import { toCustomSchema } from "@gramio/schema-parser";

// Load from a cached api.html
const $ = await getTelegramBotAPIContentFromFile();

const version = parseLastVersion($);
const navbar = parseNavigation($);
const sections = parseSections($, navbar.slice(3)).filter(
    (x) => !x.title.includes(" "),
);

const schema = toCustomSchema(version, sections);
```

### Working with the schema

```ts
import { getCustomSchema, type Method, type Object } from "@gramio/schema-parser";

const schema = await getCustomSchema();

// Find a specific method
const sendMessage = schema.methods.find((m) => m.name === "sendMessage");
console.log(sendMessage?.parameters.map((p) => p.key));
// ["chat_id", "text", "business_connection_id", ...]

// Check if a method requires multipart upload
console.log(sendMessage?.hasMultipart); // false

const sendPhoto = schema.methods.find((m) => m.name === "sendPhoto");
console.log(sendPhoto?.hasMultipart); // true

// Explore object types
const message = schema.objects.find((o) => o.name === "Message");
if (message?.type === "fields") {
    console.log(message.fields.length); // number of fields
}

// Union types (oneOf)
const chatMember = schema.objects.find((o) => o.name === "ChatMember");
if (chatMember?.type === "oneOf") {
    console.log(chatMember.oneOf.map((v) => v.type === "reference" ? v.reference.name : v.type));
    // ["ChatMemberOwner", "ChatMemberAdministrator", ...]
}
```

## Schema structure

The parser produces a `CustomSchema` object:

```ts
interface CustomSchema {
    version: Version;
    methods: Method[];
    objects: Object[];
}
```

### Version

```ts
interface Version {
    major: number; // e.g. 9
    minor: number; // e.g. 0
    release_date: {
        year: number;
        month: number; // 1-12
        day: number;
    };
}
```

### Method

Represents a Telegram Bot API method (e.g. `sendMessage`, `getUpdates`).

```ts
interface Method {
    name: string;          // "sendMessage"
    anchor: string;        // "#sendmessage"
    description?: string;  // Markdown description
    parameters: Field[];   // Method parameters
    returns: Field;        // Return type (without key)
    hasMultipart: boolean; // true if any parameter accepts file upload (InputFile, InputMedia, etc.)
}
```

### Object

Represents a Telegram Bot API type. Can be one of three variants:

```ts
// Object with named fields (e.g. Message, User)
interface ObjectWithFields {
    name: string;
    anchor: string;
    description?: string;
    type: "fields";
    fields: Field[];
}

// Union type — one of several possible types (e.g. ChatMember, BotCommandScope)
interface ObjectWithOneOf {
    name: string;
    anchor: string;
    description?: string;
    type: "oneOf";
    oneOf: Field[];
}

// Marker type with no fields or variants (e.g. ForumTopicClosed, CallbackGame)
interface ObjectUnknown {
    name: string;
    anchor: string;
    description?: string;
    type: "unknown";
}
```

### Field

The core type describing a parameter or field. It is a discriminated union on the `type` property:

| `type` | Description | Extra properties |
|--------|-------------|------------------|
| `"integer"` | Integer number | `enum?`, `default?`, `min?`, `max?` |
| `"float"` | Floating-point number | `enum?`, `default?`, `min?`, `max?` |
| `"string"` | String value | `enum?`, `const?`¹, `default?`, `minLen?`, `maxLen?` |
| `"boolean"` | Boolean value | `const?` (`true` / `false` for literal types) |
| `"array"` | Array of another type | `arrayOf: Field` |
| `"reference"` | Reference to another API type | `reference: { name, anchor }` |
| `"one_of"` | Union of multiple types | `variants: Field[]` |

> ¹ **`const` vs `default` for strings**: `const` means the field *must* equal that exact value — it is always **required** (e.g. discriminator fields: `source: "unspecified"`, `status: "creator"`). `default` means the field is **optional** and falls back to that value when omitted.

All field types share these base properties:

```ts
interface FieldBasic {
    key: string;        // Parameter/field name
    required?: boolean; // Whether the field is required
    description?: string; // Markdown description
}
```

#### Examples

**Integer with constraints:**
```json
{
    "type": "integer",
    "min": 1,
    "max": 100,
    "default": 100,
    "key": "limit",
    "required": false,
    "description": "Values between 1-100 are accepted. Defaults to 100."
}
```

**String with enum:**
```json
{
    "type": "string",
    "enum": ["typing", "upload_photo", "record_video", "upload_video"],
    "key": "action",
    "required": true
}
```

**String with const (discriminator fields):**
```json
{
    "type": "string",
    "const": "creator",
    "key": "status",
    "required": true,
    "description": "The member's status in the chat, always \"creator\""
}
```

**String with length constraints:**
```json
{
    "type": "string",
    "minLen": 1,
    "maxLen": 256,
    "key": "secret_token",
    "required": false
}
```

**Reference to another type:**
```json
{
    "type": "reference",
    "reference": {
        "name": "Message",
        "anchor": "#message"
    },
    "key": "message",
    "required": false
}
```

**Array of references:**
```json
{
    "type": "array",
    "arrayOf": {
        "type": "reference",
        "reference": {
            "name": "PhotoSize",
            "anchor": "#photosize"
        }
    },
    "key": "photos",
    "required": true
}
```

**Union type (one_of):**
```json
{
    "type": "one_of",
    "variants": [
        {
            "type": "reference",
            "reference": { "name": "InputFile", "anchor": "#inputfile" }
        },
        { "type": "string" }
    ],
    "key": "photo",
    "required": true
}
```

**Boolean const in return types:**
```json
{
    "type": "one_of",
    "variants": [
        {
            "type": "reference",
            "reference": { "name": "Message", "anchor": "#message" }
        },
        { "type": "boolean", "const": true }
    ]
}
```

## How it works

1. Fetches the Telegram Bot API HTML page (or reads from a local `api.html` cache)
2. Parses navigation structure to discover all sections
3. Extracts methods and types from HTML tables and lists
4. Uses a **sentence-based parser** (ported from [tg-bot-api](https://github.com/ENCRYPTEDFOREVER/tg-bot-api)) to extract metadata from descriptions:
   - Default values (`"Defaults to 100"`, `"always \"creator\""`) → sets `default`, makes field optional
   - Const constraints (`"must be *unspecified*"`, `"always \"creator\""`) → sets `const`, field stays **required**
   - Numeric constraints (`"Values between 1-100"`, `"0-4096 characters"`)
   - Enum values (`"one of"`, `"Can be"`, `"either"` patterns, including `<code>` expressions)
   - Return types (`"Returns"`, `"On success"`, `"is returned"` patterns with exclusion rules)
5. Detects file upload parameters (`InputFile`, `InputMedia*`, etc.) for `hasMultipart`
6. Outputs a strongly-typed `CustomSchema` JSON
