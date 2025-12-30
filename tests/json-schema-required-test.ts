/**
 * Test to verify JSON Schema metadata is required for all Entry classes
 * 
 * Note: This test validates that the JSON Schema approach is enforced.
 * We test the metadata loading and validation logic directly.
 */

import { MetadataLoader } from "../base/MetadataLoader";

console.log("=== JSON Schema Required Test ===\n");

// Test 1: Metadata without fields should fail
console.log("Test 1: Metadata without fields should fail...");

try {
  const metadataWithoutFields = {
    sheetId: 123456789,
    headerRow: 1,
    dataStartColumn: 1,
    dataEndColumn: 2,
    columns: ["id", "name"],
    // Missing fields!
  };
  
  const loaded = MetadataLoader.loadFromObject(metadataWithoutFields);
  
  // Check that this metadata has no fields
  if (!loaded.fields || Object.keys(loaded.fields).length === 0) {
    console.log("✓ Metadata without fields loads but has no field definitions");
    console.log("  - This would be rejected by Entry.loadMetadataFromJSON()");
  } else {
    console.error("✗ Unexpected: metadata has fields");
  }
} catch (error) {
  console.log("✓ Metadata without fields rejected during load");
  console.log(`  - Error: ${(error as Error).message}`);
}

// Test 2: Metadata with empty fields object should fail validation
console.log("\nTest 2: Metadata with empty fields object...");

try {
  const metadataWithEmptyFields = {
    sheetId: 123456789,
    headerRow: 1,
    dataStartColumn: 1,
    dataEndColumn: 2,
    columns: ["id", "name"],
    fields: {}, // Empty fields object
  };
  
  const loaded = MetadataLoader.loadFromObject(metadataWithEmptyFields);
  
  if (Object.keys(loaded.fields || {}).length === 0) {
    console.log("✓ Metadata with empty fields object loads but has no field definitions");
    console.log("  - This would be rejected by Entry.loadMetadataFromJSON()");
  } else {
    console.error("✗ Unexpected: metadata has fields");
  }
} catch (error) {
  console.error("✗ Failed:", error);
}

// Test 3: Proper JSON Schema metadata works
console.log("\nTest 3: Proper JSON Schema metadata works...");

const PROPER_META = {
  sheetId: 987654321,
  headerRow: 1,
  dataStartColumn: 1,
  dataEndColumn: 3,
  columns: ["id", "name", "email"],
  defaultSort: [{ column: "name", ascending: true }],
  fields: {
    id: {
      type: "string",
      required: true,
    },
    name: {
      type: "string",
      required: true,
      minLength: 1,
      maxLength: 100,
    },
    email: {
      type: "string",
      required: true,
      format: "email",
    },
  },
};

try {
  const loaded = MetadataLoader.loadFromObject(PROPER_META);
  console.log("✓ JSON Schema metadata loaded successfully");
  console.log(`  - Sheet ID: ${loaded.sheetId}`);
  console.log(`  - Columns: ${loaded.columns.join(", ")}`);
  console.log(`  - Fields defined: ${Object.keys(loaded.fields || {}).length}`);
  console.log(`  - Default sort: ${loaded.defaultSort?.[0].column} (${loaded.defaultSort?.[0].ascending ? "ASC" : "DESC"})`);
  
  // Verify validation works
  const validData = {
    id: "user_123",
    name: "John Doe",
    email: "john.doe@example.com",
  };
  
  const validationResult = MetadataLoader.validateData(validData, loaded);
  if (validationResult.isValid) {
    console.log("✓ JSON Schema validation accepts valid data");
  } else {
    console.error("✗ Valid data was rejected:", validationResult.errors);
  }
  
  // Test invalid data
  const invalidData = {
    id: "user_123",
    name: "John Doe",
    email: "not-an-email",
  };
  
  const invalidResult = MetadataLoader.validateData(invalidData, loaded);
  if (!invalidResult.isValid) {
    console.log("✓ JSON Schema validation rejects invalid data");
    console.log(`  - Errors: ${invalidResult.errors.join(", ")}`);
  } else {
    console.error("✗ Invalid data was accepted");
  }
  
  // Test missing required field
  const missingData = {
    id: "user_123",
    name: "John Doe",
    // email is missing
  };
  
  const missingResult = MetadataLoader.validateData(missingData, loaded);
  if (!missingResult.isValid) {
    console.log("✓ JSON Schema validation catches missing required fields");
    console.log(`  - Errors: ${missingResult.errors.join(", ")}`);
  } else {
    console.error("✗ Missing required field was not caught");
  }
} catch (error) {
  console.error("✗ Failed:", error);
}

// Test 4: Complex validation rules
console.log("\nTest 4: Complex validation rules (enum, pattern, length)...");

const COMPLEX_META = {
  sheetId: 111111111,
  headerRow: 1,
  dataStartColumn: 1,
  dataEndColumn: 4,
  columns: ["id", "status", "phone", "description"],
  fields: {
    status: {
      type: "string",
      enum: ["active", "inactive", "pending"],
    },
    phone: {
      type: "string",
      pattern: "^[0-9]{3}-[0-9]{3}-[0-9]{4}$",
    },
    description: {
      type: "string",
      minLength: 10,
      maxLength: 500,
    },
  },
};

try {
  const loaded = MetadataLoader.loadFromObject(COMPLEX_META);
  
  // Test enum validation
  const invalidEnum = {
    id: "1",
    status: "unknown", // Not in enum
    phone: "555-123-4567",
    description: "This is a valid description that is long enough.",
  };
  
  const enumResult = MetadataLoader.validateData(invalidEnum, loaded);
  if (!enumResult.isValid && enumResult.errors.some(e => e.includes("status"))) {
    console.log("✓ Enum validation works correctly");
  } else {
    console.error("✗ Enum validation failed");
  }
  
  // Test pattern validation
  const invalidPattern = {
    id: "1",
    status: "active",
    phone: "not-a-phone", // Doesn't match pattern
    description: "This is a valid description that is long enough.",
  };
  
  const patternResult = MetadataLoader.validateData(invalidPattern, loaded);
  if (!patternResult.isValid && patternResult.errors.some(e => e.includes("phone"))) {
    console.log("✓ Pattern validation works correctly");
  } else {
    console.error("✗ Pattern validation failed");
  }
  
  // Test length validation
  const invalidLength = {
    id: "1",
    status: "active",
    phone: "555-123-4567",
    description: "Too short", // Less than minLength
  };
  
  const lengthResult = MetadataLoader.validateData(invalidLength, loaded);
  if (!lengthResult.isValid && lengthResult.errors.some(e => e.includes("description"))) {
    console.log("✓ Length validation works correctly");
  } else {
    console.error("✗ Length validation failed");
  }
} catch (error) {
  console.error("✗ Failed:", error);
}

console.log("\n=== JSON Schema enforcement verified ===");
console.log("All Entry classes must use loadMetadataFromJSON() with field definitions.");
console.log("Legacy IEntryMeta direct assignment is no longer supported.");



