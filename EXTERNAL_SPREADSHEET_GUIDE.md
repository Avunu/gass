# External Spreadsheet Support

This document describes how to use external spreadsheet support in the GASS framework.

## Overview

The GASS framework now supports read-only access to external Google Spreadsheets. This allows you to create Entry classes that read data from spreadsheets outside of your current active spreadsheet, using the Google Sheets API.

## Key Features

- **Read-only access**: External entries are automatically protected from save/update/delete operations
- **Filtering support**: Use the same filtering syntax as internal entries
- **A1 notation**: Automatically generates proper A1 notation for external sheet ranges
- **Batch optimization**: Uses `batchGet` for efficient filtering operations
- **Backward compatibility**: Works alongside existing internal entry types

## Basic Usage

### 1. Define an External Entry

```typescript
import { Entry, IEntryMeta } from "gass";

export class Affiliate extends Entry {
  static override _meta: IEntryMeta = {
    // Required: External spreadsheet ID
    spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    // Required: Sheet name (string, not numeric ID for external sheets)
    sheetId: "Affiliates",
    headerRow: 1,
    dataStartColumn: 1,
    dataEndColumn: 5,
    columns: ["name", "representative", "address", "website", "notes"],
    defaultSort: [{ column: "name", ascending: true }],
  };

  // Define your properties
  name: string = "";
  representative: string = "";
  address: string = "";
  website: string = "";
  notes: string = "";

  getCacheKey(): string {
    return `affiliate_${this.name}`;
  }

  validate() {
    const errors: string[] = [];
    if (!this.name) errors.push("Name is required");
    if (!this.representative) errors.push("Representative is required");
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
```

### 2. Query External Data

```typescript
// Get filtered results (as described in the issue)
const affiliates = await Affiliate.get({ representative: "Kevin Shenk" });

// Get all entries
const allAffiliates = await Affiliate.getAll();

// Get a specific value
const website = await Affiliate.getValue({ name: "Acme Corp" }, "website");
```

## Configuration

### IEntryMeta for External Sheets

When `spreadsheetId` is present in the metadata, the entry is treated as external:

```typescript
interface IEntryMeta {
  sheetId: number | string; // string for external sheets (sheet name)
  spreadsheetId?: string;   // when present, indicates external sheet
  columns: string[];
  headerRow: number;
  dataStartColumn: number;
  dataEndColumn: number;
  // ... other properties
}
```

### Key Differences from Internal Entries

| Property | Internal Entries | External Entries |
|----------|------------------|------------------|
| `sheetId` | `number` (sheet ID) | `string` (sheet name) |
| `spreadsheetId` | `undefined` | `string` (spreadsheet ID) |
| Write operations | ✅ Supported | ❌ Read-only |
| Filters/sorting | ✅ Supported | ❌ Not supported |
| Caching | ✅ Full caching | ⚠️ Limited caching |

## Behind the Scenes

### A1 Notation Generation

The framework automatically generates proper A1 notation for external sheet operations:

```typescript
// For filtering by "representative" column (column B in this example)
// Generates: "Affiliates!B2:B"

// For getting complete rows
// Generates: "Affiliates!A2:E" (based on dataStartColumn and dataEndColumn)
```

### Batch Optimization

When filtering external entries, the system:

1. Uses `Sheets.Spreadsheets.Values.batchGet` to fetch only the filter columns
2. Applies filter logic to find matching row numbers
3. Uses `Sheets.Spreadsheets.Values.get` to fetch complete data for matching rows

This approach minimizes API calls and data transfer.

## Error Handling

### Read-only Protection

Attempting to save external entries will throw an error:

```typescript
const affiliate = affiliates[0];
affiliate.notes = "Updated notes";
affiliate.markDirty();

try {
  await affiliate.save();
} catch (error) {
  // Error: "Cannot save external entries - they are read-only"
}
```

### Unsupported Operations

Filter and sort operations are not supported on external entries:

```typescript
// These will throw errors:
Affiliate.applyFilter(criteria, column);  // Error
Affiliate.sort(sortOrders);               // Error
Affiliate.clearFilters();                 // Error
```

## Registry Support

External entries can be registered alongside internal entries:

```typescript
import { EntryRegistry } from "gass";

// Register both internal and external entry types
EntryRegistry.init([
  InternalEntry,  // Traditional internal sheet entry
  Affiliate,      // External sheet entry
  // ... more entries
]);
```

## Permissions

Before using external spreadsheet support, ensure you have:

1. **Spreadsheet access**: Read permission to the external spreadsheet
2. **Sheets API enabled**: The Google Sheets API must be enabled for your project
3. **Proper authentication**: The script must run with appropriate permissions

## Limitations

- **Read-only**: External entries cannot be modified, saved, or deleted
- **No triggers**: External sheets don't support onChange triggers or action hooks
- **No filters**: Built-in filter operations are not supported
- **Performance**: External operations are slower than internal sheet operations due to API calls

## Best Practices

1. **Cache results**: Store frequently accessed external data in internal sheets when possible
2. **Minimize calls**: Use specific filters to reduce the amount of data fetched
3. **Error handling**: Always wrap external operations in try-catch blocks
4. **Permissions**: Verify external spreadsheet access before deployment

## Example Use Cases

- **Reference data**: Product catalogs, price lists, or configuration data stored in shared spreadsheets
- **Reporting**: Aggregating data from multiple department spreadsheets
- **Master data**: Accessing centralized customer, vendor, or employee data
- **Cross-team collaboration**: Reading data maintained by other teams