# @gramio/schema-parser

## Build & Test Commands

- **Build**: `bunx pkgroll`
- **Test**: `bun test`
- **Full schema generation**: `bun run test.ts`
- **Type-check**: `bunx tsc --noEmit`
- **Lint/format**: `bunx biome check --write .`

## Code Style

- Formatter: Biome with **tab** indentation, **double quotes**
- Strict TypeScript (`strict: true`)
- ESModule with `verbatimModuleSyntax`
- Use `.ts` extensions in imports

## Architecture

```
Telegram Bot API HTML (api.html)
        ↓
  cheerio parsing
        ↓
  parseNavigation() → NavItem[]
        ↓
  parseSections() → ParsedSection[]
        ↓
  parseLastVersion() → Version
        ↓
  toCustomSchema() → CustomSchema
      ├─ tableRowToField() for each table row
      ├─ parseTypeText() for type info
      ├─ sentence parser for defaults/constraints/enums/return types
      └─ resolveReturnType() for methods
        ↓
  JSON output: custom-schema.json
```

### Key Modules

- `src/parsers/sentence.ts` — Sentence-based description parser (tokenizer, patterns, extractors)
- `src/parsers/types.ts` — Type system: Field interfaces, type parsing, return type resolution
- `src/parsers/archor.ts` — HTML section parsing (anchors, tables, oneOf)
- `src/to-custom-schema.ts` — Converts ParsedSection[] to CustomSchema
- `src/index.ts` — Main entry, exports, getCustomSchema()
