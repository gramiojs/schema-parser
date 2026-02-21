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
import {
    getTelegramBotAPIContentFromFile,
    parseLastVersion,
    parseNavigation,
    parseSections,
    toCustomSchema,
} from "@gramio/schema-parser";

// Load from a cached api.html
const $ = await getTelegramBotAPIContentFromFile();

const version = parseLastVersion($);
const navbar = parseNavigation($);
const sections = parseSections($, navbar.slice(3)).filter(
    (x) => !x.title.includes(" "),
);

// Optionally pass currency codes fetched from Telegram's currencies endpoint
const schema = toCustomSchema(version, sections, ["USD", "EUR", "GBP"]);
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

// The file-upload primitive
const inputFile = schema.objects.find((o) => o.name === "InputFile");
inputFile?.type; // "file" — generators emit Blob / Buffer here

// Synthetic Currencies enum
const currencies = schema.objects.find((o) => o.name === "Currencies");
if (currencies?.type === "enum") {
    currencies.values; // ["USD", "EUR", "GBP", ...]
}
```

## TypeScript types

All types are exported directly — no wrapper interfaces needed:

```ts
import type {
    CustomSchema,
    Version,

    // Methods
    Method,          // includes hasMultipart: boolean

    // Objects
    ObjectBasic,     // includes semanticType?: "markup"
    ObjectWithFields,
    ObjectWithOneOf,
    ObjectUnknown,
    ObjectWithEnum,  // synthetic enum objects (e.g. Currencies)
    ObjectFile,      // the InputFile primitive (type: "file")

    // Fields (discriminated union on `type`)
    Field,
    FieldInteger,    // includes min?, max?, default?, enum?
    FieldFloat,      // includes min?, max?, default?, enum?
    FieldString,     // includes const?, default?, enum?, minLen?, maxLen?, semanticType?
    FieldBoolean,    // includes const?: boolean
    FieldArray,
    FieldReference,
    FieldOneOf,
} from "@gramio/schema-parser";
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
    hasMultipart: boolean; // true if any parameter accepts file upload (InputFile, InputMedia*, etc.)
}
```

### Object

Represents a Telegram Bot API type. Can be one of five variants:

```ts
// Base properties shared by all object variants
interface ObjectBasic {
    name: string;
    anchor: string;
    description?: string;
    /**
     * "markup" — the object can be used as a reply_markup value
     * (InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove, ForceReply)
     */
    semanticType?: "markup";
}

// Object with named fields (e.g. Message, User)
interface ObjectWithFields extends ObjectBasic {
    type: "fields";
    fields: Field[];
}

// Union type — one of several possible types (e.g. ChatMember, BotCommandScope)
interface ObjectWithOneOf extends ObjectBasic {
    type: "oneOf";
    oneOf: Field[];
}

// Marker type with no fields or variants (e.g. ForumTopicClosed, CallbackGame)
interface ObjectUnknown extends ObjectBasic {
    type: "unknown";
}

// Named string enum — synthetic objects injected by the parser
// (e.g. Currencies — all ISO 4217 codes supported by Telegram Payments)
interface ObjectWithEnum extends ObjectBasic {
    type: "enum";
    values: string[];
}

// The InputFile primitive — generators emit the concrete file type here (e.g. Blob, Buffer)
interface ObjectFile extends ObjectBasic {
    type: "file";
}
```

### Field

The core type describing a parameter or field. It is a discriminated union on the `type` property:

| `type` | Description | Extra properties |
|--------|-------------|------------------|
| `"integer"` | Integer number | `enum?`, `default?`, `min?`, `max?` |
| `"float"` | Floating-point number | `enum?`, `default?`, `min?`, `max?` |
| `"string"` | String value | `enum?`, `const?`¹, `default?`, `minLen?`, `maxLen?`, `semanticType?`² |
| `"boolean"` | Boolean value | `const?` (`true` / `false` for literal types) |
| `"array"` | Array of another type | `arrayOf: Field` |
| `"reference"` | Reference to another API type | `reference: { name, anchor }` |
| `"one_of"` | Union of multiple types | `variants: Field[]` |

> ¹ **`const` vs `default` for strings**: `const` means the field *must* equal that exact value — it is always **required** (e.g. discriminator fields: `source: "unspecified"`, `status: "creator"`). `default` means the field is **optional** and falls back to that value when omitted.

> ² **`semanticType` on string fields**:
> - `"formattable"` — the string supports Telegram formatting entities. Detected by description containing `"after entities parsing"` **or** by a sibling `${key}_parse_mode` field (input objects) / `${key}_entities` or `${key}_parse_mode` field (method parameters). Response-only objects like `Message` are **not** marked — they have `*_entities` siblings but never `*_parse_mode`.
> - `"updateType"` — the string (inside an array) is a Telegram update type name, e.g. elements of `allowed_updates` in `getUpdates`.
>
> Currency string fields (ISO 4217) become `type: "reference"` pointing to the synthetic `Currencies` enum object.

> **InputFile in fields**: fields typed as `InputFile` in the API docs become `type: "reference"` with `reference.name === "InputFile"`. Fields typed as `InputFile or String` become `type: "one_of"` with `[reference(InputFile), string]`. String fields with "More information on Sending Files" in their description (e.g. `InputMediaPhoto.media`) also become `one_of: [reference(InputFile), string]`. The `InputFile` object itself in `schema.objects` has `type: "file"` — generators define the concrete upload type there.

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

**InputFile reference (explicit upload field):**
```json
{
    "type": "reference",
    "reference": { "name": "InputFile", "anchor": "#inputfile" },
    "key": "sticker",
    "required": true
}
```

**File-or-string upload union (InputFile or String / Sending Files pattern):**
```json
{
    "type": "one_of",
    "variants": [
        { "type": "reference", "reference": { "name": "InputFile", "anchor": "#inputfile" } },
        { "type": "string" }
    ],
    "key": "media",
    "required": true
}
```

**Formattable string field:**
```json
{
    "type": "string",
    "semanticType": "formattable",
    "key": "text",
    "required": true,
    "description": "Text of the message, 1-4096 characters after entities parsing"
}
```

**Currency reference field:**
```json
{
    "type": "reference",
    "reference": { "name": "Currencies", "anchor": "#currencies" },
    "key": "currency",
    "required": true,
    "description": "Three-letter ISO 4217 currency code"
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

1. Fetches the Telegram Bot API HTML page and the [currencies JSON](https://core.telegram.org/bots/payments/currencies.json) in parallel (or reads from a local `api.html` cache)
2. Parses navigation structure to discover all sections
3. Extracts methods and types from HTML tables and lists
4. Uses a **sentence-based parser** (ported from [tg-bot-api](https://github.com/ENCRYPTEDFOREVER/tg-bot-api)) to extract metadata from descriptions:
   - Default values (`"Defaults to 100"`, `"always \"creator\""`) → sets `default`, makes field optional
   - Const constraints (`"must be *unspecified*"`, `"always \"creator\""`) → sets `const`, field stays **required**
   - Numeric constraints (`"Values between 1-100"`, `"0-4096 characters"`)
   - Enum values (`"one of"`, `"Can be"`, `"either"` patterns, including `<code>` expressions)
   - Return types (`"Returns"`, `"On success"`, `"is returned"` patterns with exclusion rules)
5. Injects **semantic markers** directly into the schema:
   - `InputFile` links in field types → `type: "reference"` to `InputFile`; the `InputFile` object in `schema.objects` gets `type: "file"` so generators define the concrete upload type (e.g. `Blob`) there
   - String fields with "More information on Sending Files" in description → `one_of: [reference(InputFile), string]`
   - ISO 4217 currency string fields → `type: "reference"` pointing to a synthetic `Currencies` enum object
   - `"after entities parsing"` in description **or** sibling `${key}_parse_mode` / `${key}_entities` field → `semanticType: "formattable"` on string fields (method params: both sibling types; object fields: only `_parse_mode` to avoid false positives on response types like `Message`)
   - `"update type"` in array-of-string description → `semanticType: "updateType"` on the array element
   - Object names matching `*Markup`, `ReplyKeyboardRemove`, `ForceReply` → `semanticType: "markup"`
   - A synthetic `{ type: "enum", values: string[] }` `Currencies` object appended to `schema.objects`
6. Detects file upload parameters (`reference → InputFile`, `reference → InputMedia*`, etc.) for `hasMultipart`
7. Outputs a strongly-typed `CustomSchema` JSON
