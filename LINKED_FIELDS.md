# Linked Fields Feature

## Overview

The linked fields feature allows Entry fields to behave as both strings (for storage in Google Sheets) and objects/arrays (for runtime access). This provides a seamless way to work with relationships between different Entry types.

## Basic Usage

### Single Link

Use the `@link` decorator to create a field that links to a single Entry:

```typescript
import { Entry, link, Link } from "./lib";
import { Responsibility } from "./Responsibility";
import metadata from "./Assignment.meta.json";

export class Assignment extends Entry {
  static {
    this.loadMetadataFromJSON(metadata);
  }
  
  @link(Responsibility)
  public responsibility: Link<Responsibility> = "" as Link<Responsibility>;
  
  protected override async beforeSave(): Promise<void> {
    // Fetch linked objects before using them
    await this.getLinkedObjects();
    
    // Now you can use responsibility as both string and object!
    console.log(this.responsibility); // Prints: "Setup Team"
    console.log(this.responsibility.description); // Prints: "Prepare the venue"
  }
}
```

### Array Link

Use the `@linkArray` decorator for comma-separated lists:

```typescript
import { Entry, linkArray, LinkArray } from "./lib";
import { Participant } from "./Participant";
import metadata from "./Assignment.meta.json";

export class Assignment extends Entry {
  static {
    this.loadMetadataFromJSON(metadata);
  }
  
  @linkArray(Participant)
  public assignees: LinkArray<Participant> = "" as LinkArray<Participant>;
  
  protected override async beforeSave(): Promise<void> {
    await this.getLinkedObjects();
    
    // Use as string
    console.log(this.assignees); // "John Doe, Jane Smith"
    
    // Array access
    console.log(this.assignees[0].name); // "John Doe"
    console.log(this.assignees.length); // 2
    
    // Array methods
    const emails = this.assignees.map(p => p.email);
    console.log(emails); // ["john@example.com", "jane@example.com"]
    
    // Array iteration
    for (const participant of this.assignees) {
      console.log(participant.name);
    }
  }
}
```

## Custom Target Field

By default, links match on the "name" field of the target Entry. You can customize this:

```typescript
@link(User, { targetField: "id" })
public owner: Link<User> = "" as Link<User>;

@linkArray(User, { targetField: "email", separator: ";" })
public subscribers: LinkArray<User> = "" as LinkArray<User>;
```

## How It Works

1. **Storage**: Fields are stored as strings in Google Sheets (e.g., "John Doe, Jane Smith")
2. **Runtime**: When you call `getLinkedObjects()`, the framework:
   - Parses the string values
   - Fetches the corresponding Entry objects
   - Creates proxies that behave as both strings and objects/arrays
3. **Saving**: The `toRow()` method automatically converts proxies back to strings for storage

## Key Methods

### `getLinkedObjects(): Promise<boolean>`

Fetches all linked objects for the Entry and creates proxies. Returns `true` if all linked objects were found.

```typescript
protected override async beforeSave(): Promise<void> {
  const allExist = await this.getLinkedObjects();
  if (!allExist) {
    throw new Error("Failed to load required linked objects");
  }
  // Now all link fields are proxies
}
```

### Proxy Capabilities

#### Single Links (Link<T>)
- ✅ Use as string: `console.log(link)` → `"Value"`
- ✅ Access properties: `link.propertyName`
- ✅ Call methods: `link.methodName()`
- ✅ String operations: `link.length`, `link[0]` (character access)

#### Array Links (LinkArray<T>)
- ✅ Use as string: `console.log(linkArray)` → `"Val1, Val2"`
- ✅ Array access: `linkArray[0]`
- ✅ Array methods: `map`, `filter`, `forEach`, `find`, `some`, `every`, `reduce`, `slice`, `includes`
- ✅ Array iteration: `for (const item of linkArray) { ... }`
- ✅ Length property: `linkArray.length`

## Best Practices

1. **Always call `getLinkedObjects()`** before accessing linked object properties
2. **Call in `beforeSave()` hook** to ensure links are loaded before validation/computation
3. **Check return value** if linked objects are required for operation
4. **Use TypeScript types** to get proper autocomplete for linked objects

## Example: Complete Assignment Class

```typescript
import metadata from "./Assignment.meta.json";

export class Assignment extends Entry {
  static {
    this.loadMetadataFromJSON(metadata);
  }
  
  public eventDate: Date = new Date();
  
  @link(Responsibility)
  public responsibility: Link<Responsibility> = "" as Link<Responsibility>;
  
  @linkArray(Participant)
  public assignees: LinkArray<Participant> = "" as LinkArray<Participant>;
  
  public participantsEmail?: string;
  public participantsHousehold?: string;
  
  protected override async beforeSave(): Promise<void> {
    // Clear fields if assignees is empty
    if (!this.assignees || this.assignees.toString().trim() === "") {
      this.participantsEmail = "";
      this.participantsHousehold = "";
      return;
    }

    // Fetch linked objects
    const linksExist = await this.getLinkedObjects();
    if (!linksExist) {
      throw new Error("Failed to load required linked objects");
    }

    // Compute fields using linked objects
    this.participantsEmail = this.assignees
      .map(p => p.email)
      .filter(Boolean)
      .join(", ");
      
    this.participantsHousehold = [...new Set(
      this.assignees
        .map(p => p.household)
        .filter(Boolean)
    )].join(", ");
  }
}
```

## Technical Details

### IS_LINK_PROXY Symbol

The framework uses a special symbol to identify link proxies:

```typescript
import { IS_LINK_PROXY } from "./lib";

// Check if a value is a link proxy
if (value?.[IS_LINK_PROXY]) {
  console.log("This is a link proxy");
}
```

This is used internally for:
- Detecting already-loaded proxies in `getLinkedObjects()`
- Converting proxies to strings in `toRow()`

You typically won't need to use this symbol directly in your application code.
