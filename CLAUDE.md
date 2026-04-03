# @gramio/schema-parser

## Build & Test Commands

- **Build**: `bunx pkgroll`
- **Test**: `bun test`
- **Full schema generation**: `bun run test.ts`
- **Type-check**: `bunx tsc --noEmit`
- **Lint/format**: `bunx biome check --write .`

## Testing

Every new feature or bug fix must be covered by tests. Run `bun test` to verify before finishing.

## Code Style

- Formatter: Biome with **tab** indentation, **double quotes**
- Strict TypeScript (`strict: true`)
- ESModule with `verbatimModuleSyntax`
- Use `.ts` extensions in imports

## Architecture

```
Telegram Bot API HTML (api.html) + currencies.json (parallel fetch)
        ↓
  cheerio parsing
        ↓
  parseNavigation() → NavItem[]
        ↓
  parseSections() → ParsedSection[]
        ↓
  parseLastVersion() → Version
        ↓
  toCustomSchema(version, sections, currencies?) → CustomSchema
      ├─ tableRowToField() for each table row
      │   ├─ parseTypeText() for type info
      │   ├─ sentence parser for defaults/constraints/enums/return types
      │   ├─ ISO 4217 → reference(Currencies)
      │   ├─ "after entities parsing" → semanticType: "formattable"
      │   ├─ "More information on Sending Files" → one_of: [reference(InputFile), string]
      │   └─ "update type" in Array of String → semanticType: "updateType" on arrayOf
      ├─ applyFormattableSiblings(fields, mode) — sibling-based formattable detection
      │   ├─ mode "method": ${key}_entities OR ${key}_parse_mode → formattable
      │   └─ mode "object": ${key}_parse_mode ONLY (avoids false positives on response types)
      ├─ resolveReturnType() for methods
      ├─ MARKUP_NAMES regex → semanticType: "markup" on ObjectWithFields
      ├─ "InputFile" section title → ObjectFile (type: "file")
      └─ currencies[] → synthetic ObjectWithEnum appended to schema.objects
        ↓
  JSON output: custom-schema.json
```

### Key Modules

- `src/parsers/sentence.ts` — Sentence-based description parser (tokenizer, patterns, extractors)
- `src/parsers/types.ts` — Type system: Field interfaces, type parsing, return type resolution
- `src/parsers/archor.ts` — HTML section parsing (anchors, tables, oneOf)
- `src/to-custom-schema.ts` — Converts ParsedSection[] to CustomSchema; injects semantic markers
- `src/index.ts` — Main entry, exports, getCustomSchema()

### Semantic Markers

#### Object level (`schema.objects`)

| `type` | When | Purpose |
|---|---|---|
| `"file"` | Object name is `InputFile` | Generators define the concrete upload type (e.g. `Blob`) here |
| `"enum"` | Injected for `Currencies` | `values: string[]` of ISO 4217 codes — generators emit a string union |
| `semanticType: "markup"` | Name matches `*Markup`, `ReplyKeyboardRemove`, `ForceReply` | Build a `ReplyMarkup` union without hardcoding names |

#### Field level (`Field` union)

| Pattern | Result |
|---|---|
| `InputFile` link in type | `type: "reference", reference.name === "InputFile"` |
| `InputFile or String` in type | `one_of: [reference(InputFile), string]` |
| String field + "More information on Sending Files" in description | `one_of: [reference(InputFile), string]` |
| String field + "ISO 4217" in description | `type: "reference", reference.name === "Currencies"` |
| String field + "after entities parsing" in description | `semanticType: "formattable"` |
| String field + `${key}_parse_mode` sibling (objects) | `semanticType: "formattable"` |
| String field + `${key}_entities` or `${key}_parse_mode` sibling (methods) | `semanticType: "formattable"` |
| Array of String + "update type" in description | `arrayOf.semanticType: "updateType"` |

#### Why `_parse_mode` only for objects

Response objects (e.g. `Message`) have `*_entities` siblings but never `*_parse_mode` — Telegram already parsed the text server-side. Input objects (e.g. `InputPollOption`) and method parameters have `*_parse_mode` because the client chooses the format. Using `_parse_mode` as the discriminator for object-level detection avoids marking response fields as formattable.
