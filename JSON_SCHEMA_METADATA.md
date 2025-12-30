# JSON Schema-Based Metadata System

## Overview

GASS now supports defining Entry metadata using JSON Schema, providing standardized validation, better tooling support, and future extensibility for features like JSONForms integration.

## Benefits

1. **Industry Standard**: Uses well-established JSON Schema conventions
2. **Declarative Validation**: Define validation rules in metadata without writing code
3. **Tooling Support**: IDE autocomplete, validation, and schema-aware editors
4. **Format Validation**: Built-in validators for email, date, URI, etc.
5. **Future Extensibility**: Opens doors for JSONForms and other schema-based tools

## Quick Start

### 1. Create Metadata JSON File

Create a `.meta.json` file alongside your Entry class:

```json
{
  "$schema": "../types/entry-meta.schema.json",
  "sheetId": 123456789,
  "headerRow": 1,
  "dataStartColumn": 1,
  "dataEndColumn": 4,
  "columns": ["id", "name", "email", "status"],
  "fields": {
    "id": {
      "type": "string",
      "required": true
    },
    "name": {
      "type": "string",
      "required": true,
      "minLength": 1,
      "maxLength": 100
    },
    "email": {
      "type": "string",
      "required": true,
      "format": "email"
    },
    "status": {
      "type": "string",
      "enum": ["active", "inactive", "pending"]
    }
  }
}
```

### 2. Create Entry Class

```typescript
import { Entry, ValidationResult } from "../base/Entry";
import metadata from "./MyEntity.meta.json";

export class MyEntity extends Entry {
  // Load metadata from JSON
  static {
    this.loadMetadata(metadata);
  }

  static override _instances = new Map<string, MyEntity>();

  public id: string = "";
  public name: string = "";
  public email: string = "";
  public status: string = "";

  getCacheKey(): string {
    return this.id;
  }

  validate(): ValidationResult {
    // JSON Schema validation runs automatically
    // This method is for additional business logic validation
    return { isValid: true, errors: [] };
  }
}
```

## Metadata Schema Reference

### Core Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `sheetId` | integer | Yes | Google Sheet identifier |
| `columns` | array[string] | Yes | Column names in order |
| `headerRow` | integer | Yes | Header row number (1-indexed) |
| `dataStartColumn` | integer | Yes | First data column (1-indexed) |
| `dataEndColumn` | integer | Yes | Last data column (1-indexed) |
| `defaultSort` | array | No | Default sorting configuration |
| `filterRow` | integer | No | Smart filter row number |
| `filterRange` | object | No | Filter column range |
| `clearFiltersCell` | object | No | Clear filters button location |
| `fields` | object | No | Field validation definitions |

### Field Validation Properties

The `fields` object defines validation rules for each column using JSON Schema:

#### Common Properties

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Data type: "string", "number", "integer", "boolean", "array", "object" |
| `required` | boolean | Whether field is required |
| `description` | string | Human-readable field description |
| `default` | any | Default value |
| `enum` | array | Allowed values |

#### String Validation

| Property | Type | Description |
|----------|------|-------------|
| `minLength` | integer | Minimum string length |
| `maxLength` | integer | Maximum string length |
| `pattern` | string | Regular expression pattern |
| `format` | string | Format: "email", "date", "date-time", "uri", etc. |

#### Number Validation

| Property | Type | Description |
|----------|------|-------------|
| `minimum` | number | Minimum value (inclusive) |
| `maximum` | number | Maximum value (inclusive) |

## Validation Flow

When you save an Entry, validation happens in two stages:

1. **JSON Schema Validation** (automatic)
   - Checks required fields
   - Validates data types
   - Validates formats (email, date, etc.)
   - Checks length constraints
   - Validates patterns and enums

2. **Custom Validation** (your code)
   - Business logic validation
   - Cross-field validation
   - External data validation

```typescript
async save(): Promise<void> {
  // 1. JSON Schema validation runs first
  // 2. Then your validate() method runs
  // 3. If both pass, data is saved
}
```

## Supported Formats

The following formats are supported through `ajv-formats`:

- **date**: Full-date (YYYY-MM-DD)
- **time**: Time (HH:MM:SS or HH:MM:SS.sss)
- **date-time**: Date and time (ISO 8601)
- **email**: Email address
- **hostname**: Internet hostname
- **ipv4**: IPv4 address
- **ipv6**: IPv6 address
- **uri**: URI/URL
- **uri-reference**: URI reference
- **uuid**: UUID
- **json-pointer**: JSON pointer
- **relative-json-pointer**: Relative JSON pointer
- **regex**: Regular expression

## Examples

### Example 1: User with Email Validation

```json
{
  "fields": {
    "email": {
      "type": "string",
      "required": true,
      "format": "email",
      "description": "User's email address"
    }
  }
}
```

### Example 2: Status with Enum

```json
{
  "fields": {
    "status": {
      "type": "string",
      "enum": ["draft", "published", "archived"],
      "required": true,
      "default": "draft"
    }
  }
}
```

### Example 3: Phone Number with Pattern

```json
{
  "fields": {
    "phone": {
      "type": "string",
      "pattern": "^\\d{3}-\\d{3}-\\d{4}$",
      "description": "Phone in format XXX-XXX-XXXX"
    }
  }
}
```

### Example 4: Age with Range

```json
{
  "fields": {
    "age": {
      "type": "integer",
      "minimum": 0,
      "maximum": 150,
      "required": true
    }
  }
}
```

### Example 5: Name with Length Constraints

```json
{
  "fields": {
    "name": {
      "type": "string",
      "required": true,
      "minLength": 1,
      "maxLength": 100
    }
  }
}
```

## Migration from Older Versions

If you're migrating from an older version of GASS that used the traditional IEntryMeta approach, you must now use JSON Schema metadata.

### Old Approach (No Longer Supported)

```typescript
const MY_ENTITY_META: IEntryMeta = {
  sheetId: 123456789,
  headerRow: 1,
  dataStartColumn: 1,
  dataEndColumn: 3,
  columns: ["id", "name", "email"],
  defaultSort: [{ column: "name", ascending: true }],
};

export class MyEntity extends Entry {
  static override _meta = MY_ENTITY_META;
  
  validate(): ValidationResult {
    const errors: string[] = [];
    if (!this.name) errors.push("Name is required");
    if (!this.email) errors.push("Email is required");
    if (this.email && !this.email.includes("@")) {
      errors.push("Invalid email");
    }
    return { isValid: errors.length === 0, errors };
  }
}
```

### Current Approach (Required)

**MyEntity.meta.json:**
```json
{
  "$schema": "../types/entry-meta.schema.json",
  "sheetId": 123456789,
  "headerRow": 1,
  "dataStartColumn": 1,
  "dataEndColumn": 3,
  "columns": ["id", "name", "email"],
  "defaultSort": [{ "column": "name", "ascending": true }],
  "fields": {
    "name": {
      "type": "string",
      "required": true
    },
    "email": {
      "type": "string",
      "required": true,
      "format": "email"
    }
  }
}
```

**MyEntity.ts:**
```typescript
import metadata from "./MyEntity.meta.json";

export class MyEntity extends Entry {
  static {
    this.loadMetadata(metadata);
  }
  
  validate(): ValidationResult {
    // JSON Schema handles required and email format
    // Only add custom business logic here
    return { isValid: true, errors: [] };
  }
}
```

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for detailed migration instructions.

## Advanced Usage

### Combining JSON Schema with Custom Validation

```typescript
validate(): ValidationResult {
  const errors: string[] = [];
  
  // JSON Schema already validated:
  // - Required fields
  // - Email format
  // - Data types
  
  // Add custom business logic:
  if (this.email && this.email.endsWith("@competitor.com")) {
    errors.push("Competitor emails not allowed");
  }
  
  if (this.status === "active" && !this.verifiedAt) {
    errors.push("Active users must be verified");
  }
  
  return { isValid: errors.length === 0, errors };
}
```

### Runtime Metadata Loading

```typescript
// Load metadata at runtime (useful for dynamic configurations)
const metadata = await fetchMetadataFromAPI();
MyEntity.loadMetadata(metadata);
```

## Backward Compatibility

The system maintains full backward compatibility:

- Existing Entry classes with `static _meta = ...` continue to work
- No JSON Schema validation is performed if `fields` is not defined
- The `validate()` method still works as before
- Migration can be done gradually, one Entry at a time

## Future Enhancements

This JSON Schema foundation enables:

1. **JSONForms Integration**: Auto-generate forms from schemas
2. **OpenAPI Generation**: Export schemas for API documentation
3. **Schema Evolution**: Track and manage schema versions
4. **Advanced Validation**: Conditional schemas, dependencies, etc.
5. **Schema Registry**: Centralized schema management

## See Also

- [JSON Schema Specification](https://json-schema.org/)
- [AJV Documentation](https://ajv.js.org/)
- [JSONForms](https://jsonforms.io/)
- [Example User Entry](./examples/User.ts)
