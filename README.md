# Google Sheets ORM Library

This directory contains a Google App Script library that brings ORM / framework features to Google Apps
Sheets.

## Key Features

- **Type-safe ORM**: Strongly typed entity classes with validation
- **JSON Schema Metadata**: Define metadata and validation rules using industry-standard JSON Schema
- **Automatic sync**: Handles Google Sheets edits automatically
- **Caching**: Built-in caching for improved performance
- **Filtering**: Advanced filtering with operators ($gt, $lt, $between, etc.)
- **Sorting**: Configurable default sorting
- **Batch operations**: Efficient bulk insert and save operations with async hooks
- **Services**: Pre-built services for Google Workspace integration
- **Job scheduling**: Built-in job scheduling system
- **Menu integration**: Automatic menu generation from entry types
- **Format validation**: Built-in validators for email, date, URI, and more via AJV
- **Metadata-driven forms**: Auto-generated data entry dialogs with Material Design Web Components

## Structure

```
lib/
├── base/           # Core ORM classes
│   ├── Entry.ts           # Base class for all sheet entities
│   ├── EntryRegistry.ts   # Registry for managing entry types
│   ├── ScheduledJob.ts    # Job scheduling system
│   └── cacheManager.ts    # Caching utilities
├── services/       # Reusable services
│   ├── SheetService.ts    # Core Google Sheets operations
│   ├── EmailService.ts    # Email sending utilities
│   ├── CalendarService.ts # Google Calendar integration
│   ├── DocService.ts      # Google Docs utilities
│   ├── ContactsService.ts # Google Contacts integration
│   ├── FormService.ts     # Google Forms utilities
│   ├── TemplateService.ts # Template processing
│   └── DataEntryService.ts # Metadata-driven data entry forms
├── templates/      # HTML templates for dialogs
│   └── DataEntryDialog.html # Data entry form template
├── types/          # Core type definitions
│   ├── jobs.ts            # Job scheduling types
│   └── formService.d.ts   # Form service type definitions
└── index.ts        # Main library exports
```

## Usage

### 1. Import the core library

```typescript
import {
  Entry,
  EntryRegistry,
  SheetService,
  EmailService,
  // ... other services
} from "./lib";
```

### 2. Create entry types

All entry types must use JSON Schema-based metadata with field validation rules.

Create a `.meta.json` file with your metadata and validation rules:

**MyEntity.meta.json:**
```json
{
  "$schema": "../types/entry-meta.schema.json",
  "sheetId": 123456789,
  "columns": ["id", "name", "email", "phone", "status"],
  "defaultSort": [{ "column": "name", "ascending": true }],
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
    "phone": {
      "type": "string",
      "pattern": "^[0-9]{3}-[0-9]{3}-[0-9]{4}$"
    },
    "status": {
      "type": "string",
      "enum": ["active", "inactive", "pending"]
    }
  }
}
```

**MyEntity.ts:**
```typescript
import { Entry, ValidationResult } from "./lib/base/Entry";
import metadata from "./MyEntity.meta.json";

export class MyEntity extends Entry {
  static {
    this.loadMetadata(metadata);
  }

  static override _instances = new Map<string, MyEntity>();

  public id: string = "";
  public name: string = "";
  public email: string = "";
  public phone: string = "";
  public status: string = "";

  getCacheKey(): string {
    return this.id;
  }

  validate(): ValidationResult {
    // JSON Schema validation runs automatically
    // Add additional business logic validation here if needed
    return { isValid: true, errors: [] };
  }
}
```

See [JSON_SCHEMA_METADATA.md](./JSON_SCHEMA_METADATA.md) for complete documentation.

### 3. Initialize the registry

Register your entry types with the registry:

```typescript
import { EntryRegistry } from "./lib";
import { MyEntity } from "./entities/MyEntity";
import { AnotherEntity } from "./entities/AnotherEntity";

// Initialize with your project-specific entry types
EntryRegistry.init([
  MyEntity,
  AnotherEntity,
  // ... other entities
]);
```

### 4. Use the ORM features

```typescript
// Get all entities
const entities = await MyEntity.getAll();

// Find specific entities
const activeEntities = await MyEntity.get({ status: "active" });

// Create and save new entity
const newEntity = new MyEntity();
newEntity.name = "John Doe";
newEntity.email = "john@example.com";
newEntity.markDirty();
await newEntity.save();

// Batch insert multiple entities from plain data objects
const newEntitiesData = [
  { name: "Jane Smith", email: "jane@example.com", phone: "555-0123", status: "active" },
  { name: "Bob Johnson", email: "bob@example.com", phone: "555-0456", status: "pending" },
  { name: "Alice Brown", email: "alice@example.com", phone: "555-0789", status: "active" },
];

// This performs a single bulk insert operation with async hook execution
const createdEntities = await MyEntity.batchInsert(newEntitiesData);
console.log(`${createdEntities.length} entities created in batch operation`);

// Handle sheet edits automatically
async function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit) {
  await EntryRegistry.handleEdit(e);
}
```

## Batch Operations

For better performance when working with multiple records, use batch operations:

### Batch Insert

Insert multiple records from plain data objects in a single operation:

```typescript
// Instead of multiple individual saves:
for (const data of recordsData) {
  const entity = new MyEntity();
  Object.assign(entity, data);
  entity.markDirty();
  await entity.save(); // Individual database calls
}

// Use batch insert for better performance:
const createdEntities = await MyEntity.batchInsert(recordsData);
// Single database call + async hook execution
```

### Batch Save

Save multiple existing entities efficiently:

```typescript
const entities = await MyEntity.get({ status: "pending" });
entities.forEach((entity) => {
  entity.status = "processed";
  entity.markDirty();
});

// Batch save all changes
await MyEntity.batchSave(entities);
```

### Benefits of Batch Operations

- **Performance**: Single database operation vs. multiple calls
- **Async hooks**: beforeSave/afterSave hooks run in parallel
- **Validation**: All records validated before any database operation
- **Atomicity**: All records processed together
- **Error handling**: Detailed validation errors for the entire batch

## Metadata-Driven Data Entry Forms

GASS provides automatic generation of data entry dialogs based on your Entry metadata. These dialogs use Material Design Web Components for a modern, native-looking interface.

### Setting Up Data Entry Menus

After initializing the registry, register the data entry menu functions:

```typescript
import { EntryRegistry, GlobalMenuFunctions } from "./lib";

// Initialize registry with your entry types
EntryRegistry.init([MyEntity, AnotherEntity]);

// Register data entry menu functions in global scope
const global = globalThis as unknown as GlobalMenuFunctions;
EntryRegistry.registerDataEntryMenuFunctions(global);

// Create the Data Entry menu when the spreadsheet opens
function onOpen() {
  EntryRegistry.createDataEntryMenu();
}
```

### Using the Data Entry Dialog

The Data Entry menu will automatically appear with two options:

1. **Add Entry**: Opens a blank form to create a new entry
2. **Edit Entry**: Opens a form pre-filled with data from the currently selected row

The form automatically generates fields based on your Entry metadata:
- Text fields for string properties
- Number fields for numeric properties
- Checkboxes for boolean properties
- Date fields for date/time properties

All fields are validated using your Entry's `validate()` method before saving.

### Field Type Detection

The DataEntryService automatically detects appropriate field types based on:
- Column names (e.g., "date", "amount", "isActive")
- Data types (boolean, number, string)
- Property values

### Material Design Components

The dialog includes the following Material Design Web Components loaded via CDN:
- `md-filled-text-field` for text inputs
- `md-checkbox` for boolean values
- `md-filled-button` and `md-text-button` for actions

All components follow Material Design 3 guidelines with the Roboto font family.

### Customization

You can customize the dialog by:
1. Modifying the `templates/DataEntryDialog.html` template
2. Extending the `DataEntryService` class
3. Overriding field type detection logic

### Example

```typescript
// In your Apps Script project
import { EntryRegistry, DataEntryService } from "./lib";

class Contact extends Entry {
  static override _meta = {
    sheetId: 123456789,
    columns: ["id", "name", "email", "phone", "isActive", "joinDate"],
  };

  id: string = "";
  name: string = "";
  email: string = "";
  phone: string = "";
  isActive: boolean = false;
  joinDate: Date = new Date();

  getCacheKey(): string {
    return this.id;
  }

  validate(): ValidationResult {
    const errors: string[] = [];
    if (!this.name) errors.push("Name is required");
    if (!this.email) errors.push("Email is required");
    return { isValid: errors.length === 0, errors };
  }
}

// Initialize and register
EntryRegistry.init([Contact]);
const global = globalThis as unknown as GlobalMenuFunctions;
EntryRegistry.registerDataEntryMenuFunctions(global);

function onOpen() {
  EntryRegistry.createDataEntryMenu();
}
```

When a user selects "Add Entry" from the Data Entry menu, they'll see a dialog with:
- Text fields for id, name, email, and phone
- A checkbox for isActive
- A date field for joinDate

The form validates and saves the data using your Contact class's validation and save logic.
