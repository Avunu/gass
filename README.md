# Google Sheets ORM Library

This directory contains a Google App Script library that brings ORM / framework features to Google Apps Sheets.

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
│   └── TemplateService.ts # Template processing
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

Extend the base `Entry` class for your specific entities:

```typescript
import { Entry, IEntryMeta, ValidationResult } from "./lib/base/Entry";

const MY_ENTITY_META: IEntryMeta = {
  sheetId: 123456789,
  headerRow: 1,
  dataStartColumn: 1,
  dataEndColumn: 5,
  columns: ["id", "name", "email", "phone", "status"],
  defaultSort: [{ column: "name", ascending: true }],
};

export class MyEntity extends Entry {
  static override _meta = MY_ENTITY_META;
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
    const errors: string[] = [];
    if (!this.name) errors.push("Name is required");
    if (!this.email) errors.push("Email is required");

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
```

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

// Handle sheet edits automatically
async function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit) {
  await EntryRegistry.handleEdit(e);
}
```

## Key Features

- **Type-safe ORM**: Strongly typed entity classes with validation
- **Automatic sync**: Handles Google Sheets edits automatically
- **Caching**: Built-in caching for improved performance
- **Filtering**: Advanced filtering with operators ($gt, $lt, $between, etc.)
- **Sorting**: Configurable default sorting
- **Services**: Pre-built services for Google Workspace integration
- **Job scheduling**: Built-in job scheduling system
- **Menu integration**: Automatic menu generation from entry types

## Migration from Legacy Structure

If migrating from the old structure:

1. Update imports from `../base/` and `../services/` to `../lib/base/` and `../lib/services/`
2. Change `EntryRegistry.init()` to `EntryRegistry.init([YourEntryTypes])`
3. Ensure all entry types extend the new `Entry` class from `../lib/base/Entry`

## Benefits of Modularization

- **Reusability**: Core ORM can be used across multiple projects
- **Separation of concerns**: Project-specific logic separate from core framework
- **Maintainability**: Clear separation between library and application code
- **Extensibility**: Easy to add new projects without duplicating core code
