# JSON Schema Migration Guide

## Overview

This guide helps you migrate from the traditional `IEntryMeta` approach to the new JSON Schema-based metadata system.

## Why Migrate?

**Benefits of JSON Schema approach:**
- ✅ Declarative validation without writing code
- ✅ Industry-standard format with broad tooling support
- ✅ Built-in format validators (email, date, URI, etc.)
- ✅ Better separation of concerns (metadata vs. business logic)
- ✅ Future-ready for JSONForms and other schema-based tools
- ✅ Easier to maintain and understand
- ✅ Automatic validation before custom validation runs

## Migration Steps

### Step 1: Create JSON Metadata File

For each Entry class, create a `.meta.json` file in the same directory.

**Example:** If you have `User.ts`, create `User.meta.json`

### Step 2: Convert IEntryMeta to JSON

#### Before (TypeScript)

```typescript
// User.ts
import { Entry, IEntryMeta, ValidationResult } from "./lib/base/Entry";

const USER_META: IEntryMeta = {
  sheetId: 123456789,
  headerRow: 1,
  dataStartColumn: 1,
  dataEndColumn: 6,
  columns: ["id", "name", "email", "phone", "status", "createdAt"],
  defaultSort: [{ column: "name", ascending: true }],
};

export class User extends Entry {
  static override _meta = USER_META;
  static override _instances = new Map<string, User>();

  public id: string = "";
  public name: string = "";
  public email: string = "";
  public phone: string = "";
  public status: string = "";
  public createdAt: string = "";

  getCacheKey(): string {
    return this.id;
  }

  validate(): ValidationResult {
    const errors: string[] = [];
    
    // Required fields
    if (!this.id) errors.push("ID is required");
    if (!this.name) errors.push("Name is required");
    if (!this.email) errors.push("Email is required");
    if (!this.status) errors.push("Status is required");
    
    // Email format
    if (this.email && !this.email.includes("@")) {
      errors.push("Invalid email format");
    }
    
    // Name length
    if (this.name && this.name.length > 100) {
      errors.push("Name too long (max 100 characters)");
    }
    
    // Phone format
    if (this.phone && !/^\d{3}-\d{3}-\d{4}$/.test(this.phone)) {
      errors.push("Phone must be in format XXX-XXX-XXXX");
    }
    
    // Status values
    if (this.status && !["active", "inactive", "pending"].includes(this.status)) {
      errors.push("Invalid status value");
    }
    
    return { isValid: errors.length === 0, errors };
  }
}
```

#### After (JSON + TypeScript)

**User.meta.json:**
```json
{
  "$schema": "../types/entry-meta.schema.json",
  "sheetId": 123456789,
  "headerRow": 1,
  "dataStartColumn": 1,
  "dataEndColumn": 6,
  "columns": ["id", "name", "email", "phone", "status", "createdAt"],
  "defaultSort": [
    { "column": "name", "ascending": true }
  ],
  "fields": {
    "id": {
      "type": "string",
      "required": true,
      "description": "Unique identifier"
    },
    "name": {
      "type": "string",
      "required": true,
      "minLength": 1,
      "maxLength": 100,
      "description": "User's full name"
    },
    "email": {
      "type": "string",
      "required": true,
      "format": "email",
      "description": "User's email address"
    },
    "phone": {
      "type": "string",
      "pattern": "^\\d{3}-\\d{3}-\\d{4}$",
      "description": "Phone in format XXX-XXX-XXXX"
    },
    "status": {
      "type": "string",
      "required": true,
      "enum": ["active", "inactive", "pending"],
      "description": "User status"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "description": "When user was created"
    }
  }
}
```

**User.ts:**
```typescript
import { Entry, ValidationResult } from "./lib/base/Entry";
import metadata from "./User.meta.json";

export class User extends Entry {
  // Load metadata from JSON
  static {
    this.loadMetadataFromJSON(metadata);
  }

  static override _instances = new Map<string, User>();

  public id: string = "";
  public name: string = "";
  public email: string = "";
  public phone: string = "";
  public status: "active" | "inactive" | "pending" = "pending";
  public createdAt: string = "";

  getCacheKey(): string {
    return this.id;
  }

  validate(): ValidationResult {
    // JSON Schema handles all the basic validation!
    // Only add custom business logic here
    const errors: string[] = [];
    
    // Example: Custom business rule
    if (this.status === "active" && !this.createdAt) {
      errors.push("Active users must have a creation date");
    }
    
    return { isValid: errors.length === 0, errors };
  }
}
```

### Step 3: Map Validation Rules

Here's how common validation patterns map to JSON Schema:

| Old Code | JSON Schema |
|----------|-------------|
| `if (!field)` | `"required": true` |
| `if (field.length > 100)` | `"maxLength": 100` |
| `if (field.length < 1)` | `"minLength": 1` |
| `if (!field.includes("@"))` | `"format": "email"` |
| `if (!/pattern/.test(field))` | `"pattern": "regex"` |
| `if (!["a","b"].includes(field))` | `"enum": ["a", "b"]` |
| `if (field < 0)` | `"minimum": 0` |
| `if (field > 100)` | `"maximum": 100` |

### Step 4: Update Validation Logic

**Key principle:** Move **data validation** to JSON Schema, keep **business logic** in `validate()`.

#### Data Validation (→ JSON Schema)
- Required fields
- Data types
- String lengths
- Number ranges
- Format validation (email, date, URL)
- Pattern matching (regex)
- Enum values

#### Business Logic (→ validate() method)
- Cross-field validation
- Conditional requirements
- External data checks
- Complex business rules
- Computed validations

### Step 5: Test Your Migration

1. **TypeScript Check:**
   ```bash
   npx tsc --noEmit
   ```

2. **Run Tests:**
   ```bash
   npm test
   ```

3. **Manual Testing:**
   - Try creating entries with valid data
   - Try creating entries with invalid data
   - Verify error messages are helpful
   - Test all edge cases

## Common Patterns

### Pattern 1: Required Field with Format

```json
{
  "email": {
    "type": "string",
    "required": true,
    "format": "email"
  }
}
```

### Pattern 2: Optional Field with Constraints

```json
{
  "phone": {
    "type": "string",
    "pattern": "^\\d{3}-\\d{3}-\\d{4}$"
  }
}
```

### Pattern 3: Enum with Default

```json
{
  "status": {
    "type": "string",
    "enum": ["draft", "published", "archived"],
    "default": "draft",
    "required": true
  }
}
```

### Pattern 4: Number with Range

```json
{
  "age": {
    "type": "integer",
    "minimum": 0,
    "maximum": 150
  }
}
```

### Pattern 5: String with Length

```json
{
  "description": {
    "type": "string",
    "minLength": 10,
    "maxLength": 500
  }
}
```

## Troubleshooting

### Issue: "Module not found" when importing JSON

**Solution:** Ensure `tsconfig.json` has `"resolveJsonModule": true`

### Issue: Schema validation is too strict

**Solution:** Remember that JSON Schema validation runs FIRST. If you need looser validation, don't define that field in the schema or make it optional.

### Issue: Need conditional validation

**Solution:** Keep conditional logic in the `validate()` method:

```typescript
validate(): ValidationResult {
  const errors: string[] = [];
  
  // JSON Schema handles basic validation
  // Add conditional logic here
  if (this.type === "premium" && !this.billingInfo) {
    errors.push("Premium users must have billing info");
  }
  
  return { isValid: errors.length === 0, errors };
}
```

### Issue: Custom format not supported

**Solution:** Use `pattern` with regex instead:

```json
{
  "customField": {
    "type": "string",
    "pattern": "^[A-Z]{3}\\d{6}$"
  }
}
```

## Gradual Migration

You can migrate gradually:

1. **Start with one Entry:** Pick the simplest Entry to migrate first
2. **Test thoroughly:** Ensure it works before moving to the next
3. **Leave complex ones for last:** Entries with complex validation can wait
4. **Old code still works:** Existing Entries using `IEntryMeta` continue to function

## Benefits After Migration

After migrating to JSON Schema, you'll enjoy:

- **Less code:** Validation rules in JSON are more concise
- **Clearer intent:** Metadata files document your data model
- **Better errors:** AJV provides detailed validation errors
- **Easier maintenance:** No need to modify code for simple validation changes
- **Better testing:** Can validate metadata independently
- **Future ready:** Ready for JSONForms and other tools

## Need Help?

- See [JSON_SCHEMA_METADATA.md](./JSON_SCHEMA_METADATA.md) for full documentation
- Check [examples/User.ts](./examples/User.ts) for a complete example
- Review the [JSON Schema specification](https://json-schema.org/)
- Consult [AJV documentation](https://ajv.js.org/) for advanced validation

## Quick Reference

### Supported Formats

- `date`: YYYY-MM-DD
- `time`: HH:MM:SS
- `date-time`: ISO 8601
- `email`: Email address
- `uri`: URL/URI
- `uuid`: UUID
- `hostname`: Internet hostname
- `ipv4`: IPv4 address
- `ipv6`: IPv6 address

### Common Constraints

- `type`: Data type
- `required`: Is field required
- `minLength`: Min string length
- `maxLength`: Max string length
- `minimum`: Min number value
- `maximum`: Max number value
- `pattern`: Regex pattern
- `enum`: Allowed values
- `format`: Format validator
- `description`: Documentation
