# JSON-LD Relationship Definitions

## Overview

GASS now supports JSON-LD (JSON Linked Data) annotations in metadata files to define semantic relationships between Entry types. This provides a standardized, machine-readable way to describe how entries are linked together.

## Benefits

1. **Standardized Format**: Uses W3C JSON-LD specification for defining relationships
2. **Machine Readable**: Tools can automatically discover and validate relationships
3. **Self-Documenting**: Relationships are clearly defined in metadata
4. **Type Safety**: Runtime validation ensures decorators match metadata
5. **Tooling Support**: Can be used to generate diagrams, documentation, and forms

## Basic Usage

### 1. Add JSON-LD Context

Add a `@context` to your metadata file to define the vocabulary:

```json
{
  "$schema": "../gass-lib/types/entry-meta.schema.json",
  "@context": {
    "@vocab": "https://github.com/Avunu/gass/vocab#",
    "gass": "https://github.com/Avunu/gass/vocab#"
  },
  "sheetId": 123456789,
  "columns": ["name", "owner", "assignees"]
}
```

### 2. Define Link Relationships

For single links, use `@type: "Link"`:

```json
{
  "fields": {
    "owner": {
      "type": "string",
      "required": true,
      "description": "Owner of this item",
      "@type": "Link",
      "@id": "User",
      "targetField": "email"
    }
  }
}
```

For array links (comma-separated), use `@type: "LinkArray"`:

```json
{
  "fields": {
    "assignees": {
      "type": "string",
      "description": "Comma-separated list of assignees",
      "@type": "LinkArray",
      "@id": "User",
      "targetField": "name",
      "separator": ","
    }
  }
}
```

## JSON-LD Properties

### `@type`

Specifies the relationship type:
- `"Link"`: Single relationship (one-to-one or many-to-one)
- `"LinkArray"`: Array relationship (one-to-many or many-to-many)

### `@id`

The target Entry class name. This should match the class name of the related Entry type.

**Examples:**
- `"@id": "User"` - Links to User Entry
- `"@id": "Service"` - Links to Service Entry
- `"@id": "Region"` - Links to Region Entry

### `targetField`

The field name on the target Entry to match against. Defaults to `"name"` if not specified.

**Examples:**
- `"targetField": "name"` - Match by name field (default)
- `"targetField": "id"` - Match by id field
- `"targetField": "email"` - Match by email field

### `separator`

For `LinkArray` types only. Specifies the separator character for array values. Defaults to `","`.

**Examples:**
- `"separator": ","` - Comma-separated (default)
- `"separator": ";"` - Semicolon-separated
- `"separator": "|"` - Pipe-separated

## Complete Example

### BOM.meta.json

```json
{
  "$schema": "../gass-lib/types/entry-meta.schema.json",
  "@context": {
    "@vocab": "https://github.com/Avunu/gass/vocab#",
    "gass": "https://github.com/Avunu/gass/vocab#"
  },
  "sheetId": 2074703377,
  "headerRow": 1,
  "dataStartColumn": 1,
  "dataEndColumn": 4,
  "columns": ["service", "size", "expense", "qty"],
  "fields": {
    "service": {
      "type": "string",
      "required": true,
      "minLength": 1,
      "description": "Service name (linked to Service entry)",
      "@type": "Link",
      "@id": "Service",
      "targetField": "name"
    },
    "size": {
      "type": "string",
      "required": true,
      "minLength": 1,
      "description": "Size identifier (linked to Size entry)",
      "@type": "Link",
      "@id": "Size",
      "targetField": "name"
    },
    "expense": {
      "type": "string",
      "required": true,
      "minLength": 1,
      "description": "Expense name (linked to Expense entry)",
      "@type": "Link",
      "@id": "Expense",
      "targetField": "name"
    },
    "qty": {
      "type": "number",
      "minimum": 0,
      "description": "Quantity"
    }
  }
}
```

### BOM.ts

```typescript
import { Entry, ValidationResult } from "../../../gass-lib/base/Entry";
import { link, Link } from "../../../gass-lib/base/Link";
import metadata from "../../../metadata/BOM.meta.json";
import { Service } from "./Service";
import { Size } from "./Size";
import { Expense } from "./Expense";

export class BOM extends Entry {
  static {
    this.loadMetadataFromJSON(metadata);
  }
  static override _instances = new Map<string, BOM>();

  // These decorators match the JSON-LD metadata
  @link(() => Service)
  public service: Link<Service> = "" as Link<Service>;
  
  @link(() => Size)
  public size: Link<Size> = "" as Link<Size>;
  
  @link(() => Expense)
  public expense: Link<Expense> = "" as Link<Expense>;
  
  public qty: number = 0;

  getCacheKey(): string {
    return this.service + this.size + this.expense;
  }

  validate(): ValidationResult {
    return { isValid: true, errors: [] };
  }
}
```

## Validation

The framework automatically validates that:

1. **Decorator matches metadata**: If you use `@link` decorator, the JSON-LD metadata should specify `"@type": "Link"`
2. **Array types match**: If you use `@linkArray`, the metadata should specify `"@type": "LinkArray"`
3. **Completeness**: Fields with JSON-LD annotations should have corresponding decorators

When mismatches are detected, warnings are logged (in development mode with Logger available).

## Extracting Relationship Information

You can programmatically extract relationship information from metadata:

```typescript
import { MetadataLoader } from "./gass-lib/base/MetadataLoader";

// Get relationships defined in metadata
const relationships = MetadataLoader.getRelationships(metadata);

for (const [fieldName, rel] of relationships) {
  console.log(`${fieldName} -> ${rel.targetClass} (${rel.type})`);
  // Example output: "service -> Service (Link)"
}
```

## Use Cases

### 1. Documentation Generation

Generate relationship diagrams from JSON-LD metadata:

```typescript
const relationships = MetadataLoader.getRelationships(metadata);
// Use relationships to generate ERD diagrams, documentation, etc.
```

### 2. Data Validation

Validate that linked references exist:

```typescript
protected override async beforeSave(): Promise<void> {
  await this.getLinkedObjects();
  // Framework automatically fetches and validates linked entries
}
```

### 3. Form Generation

Use JSON-LD metadata to automatically generate forms with relationship pickers:

```typescript
// Future: JSONForms integration
const formSchema = generateFormFromMetadata(metadata);
// Automatically creates dropdowns for Link fields
```

### 4. Query Optimization

Use relationship metadata to optimize data loading:

```typescript
// Future: Eager loading based on JSON-LD metadata
const boms = await BOM.getWithRelations(['service', 'expense']);
// Automatically fetches related Service and Expense entries
```

## JSON-LD Context

The `@context` defines the vocabulary and namespace for semantic annotations:

```json
{
  "@context": {
    "@vocab": "https://github.com/Avunu/gass/vocab#",
    "gass": "https://github.com/Avunu/gass/vocab#"
  }
}
```

- `@vocab`: Default vocabulary URI for all terms
- Custom prefixes can be added for additional vocabularies

## Best Practices

1. **Always add @context**: Include JSON-LD context in all metadata files with relationships
2. **Match decorators to metadata**: Ensure TypeScript decorators match JSON-LD annotations
3. **Document relationships**: Use the `description` field to explain the relationship
4. **Use consistent targetFields**: Standardize on field names (e.g., always use "name" for lookups)
5. **Validate on load**: The framework automatically validates decorator/metadata consistency

## Migration

To add JSON-LD to existing metadata:

1. Add `@context` at the top level
2. Add `@type`, `@id`, and optionally `targetField` to linked fields
3. Ensure existing `@link`/`@linkArray` decorators match
4. Test to ensure no warnings are logged

## Future Enhancements

JSON-LD foundation enables:

1. **Semantic Queries**: Query across relationships using SPARQL-like syntax
2. **Schema.org Integration**: Map to standard vocabularies
3. **Triple Store Export**: Export data to RDF triple stores
4. **Automated Testing**: Validate referential integrity
5. **Visual Tools**: Generate interactive relationship diagrams

## See Also

- [JSON-LD Specification](https://www.w3.org/TR/json-ld/)
- [Linked Fields Feature](./LINKED_FIELDS.md)
- [JSON Schema Metadata](./JSON_SCHEMA_METADATA.md)
- [Schema.org Vocabularies](https://schema.org/)
