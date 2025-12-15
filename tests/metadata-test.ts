/**
 * Simple test to verify JSON Schema metadata loading and validation
 * 
 * Run with: npx ts-node tests/metadata-test.ts
 */

import { MetadataLoader } from "../base/MetadataLoader";

console.log("=== JSON Schema Metadata System Test ===\n");

// Test 1: Valid metadata
console.log("Test 1: Loading valid metadata...");
try {
  const validMetadata = {
    sheetId: 123456789,
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

  const loaded = MetadataLoader.loadFromObject(validMetadata);
  console.log("✓ Valid metadata loaded successfully");
  console.log(`  - Sheet ID: ${loaded.sheetId}`);
  console.log(`  - Columns: ${loaded.columns.join(", ")}`);
  console.log(`  - Fields defined: ${Object.keys(loaded.fields || {}).length}`);
} catch (error) {
  console.error("✗ Failed:", error);
}

// Test 2: Invalid metadata (missing required field)
console.log("\nTest 2: Testing invalid metadata (missing sheetId)...");
try {
  const invalidMetadata = {
    headerRow: 1,
    dataStartColumn: 1,
    dataEndColumn: 3,
    columns: ["id", "name"],
  };

  MetadataLoader.loadFromObject(invalidMetadata);
  console.error("✗ Should have thrown an error");
} catch (error) {
  console.log("✓ Correctly rejected invalid metadata");
  console.log(`  - Error: ${(error as Error).message}`);
}

// Test 3: Data validation with valid data
console.log("\nTest 3: Validating valid entry data...");
try {
  const metadata = {
    sheetId: 123456789,
    headerRow: 1,
    dataStartColumn: 1,
    dataEndColumn: 3,
    columns: ["id", "name", "email"],
    fields: {
      id: {
        type: "string",
        required: true,
      },
      name: {
        type: "string",
        required: true,
        minLength: 1,
      },
      email: {
        type: "string",
        required: true,
        format: "email",
      },
    },
  };

  const loadedMeta = MetadataLoader.loadFromObject(metadata);
  const validData = {
    id: "user_123",
    name: "John Doe",
    email: "john.doe@example.com",
  };

  const result = MetadataLoader.validateData(validData, loadedMeta);
  if (result.isValid) {
    console.log("✓ Valid data passed validation");
  } else {
    console.error("✗ Valid data was rejected:", result.errors);
  }
} catch (error) {
  console.error("✗ Failed:", error);
}

// Test 4: Data validation with invalid email
console.log("\nTest 4: Validating invalid entry data (bad email)...");
try {
  const metadata = {
    sheetId: 123456789,
    headerRow: 1,
    dataStartColumn: 1,
    dataEndColumn: 3,
    columns: ["id", "name", "email"],
    fields: {
      email: {
        type: "string",
        required: true,
        format: "email",
      },
    },
  };

  const loadedMeta = MetadataLoader.loadFromObject(metadata);
  const invalidData = {
    id: "user_123",
    name: "John Doe",
    email: "not-an-email",
  };

  const result = MetadataLoader.validateData(invalidData, loadedMeta);
  if (!result.isValid) {
    console.log("✓ Invalid data correctly rejected");
    console.log(`  - Errors: ${result.errors.join(", ")}`);
  } else {
    console.error("✗ Invalid data was accepted");
  }
} catch (error) {
  console.error("✗ Failed:", error);
}

// Test 5: Data validation with missing required field
console.log("\nTest 5: Validating data with missing required field...");
try {
  const metadata = {
    sheetId: 123456789,
    headerRow: 1,
    dataStartColumn: 1,
    dataEndColumn: 3,
    columns: ["id", "name", "email"],
    fields: {
      name: {
        type: "string",
        required: true,
      },
      email: {
        type: "string",
        required: true,
      },
    },
  };

  const loadedMeta = MetadataLoader.loadFromObject(metadata);
  const incompleteData = {
    id: "user_123",
    name: "John Doe",
    // email is missing
  };

  const result = MetadataLoader.validateData(incompleteData, loadedMeta);
  if (!result.isValid) {
    console.log("✓ Incomplete data correctly rejected");
    console.log(`  - Errors: ${result.errors.join(", ")}`);
  } else {
    console.error("✗ Incomplete data was accepted");
  }
} catch (error) {
  console.error("✗ Failed:", error);
}

// Test 6: Enum validation
console.log("\nTest 6: Testing enum validation...");
try {
  const metadata = {
    sheetId: 123456789,
    headerRow: 1,
    dataStartColumn: 1,
    dataEndColumn: 2,
    columns: ["id", "status"],
    fields: {
      status: {
        type: "string",
        enum: ["active", "inactive", "pending"],
      },
    },
  };

  const loadedMeta = MetadataLoader.loadFromObject(metadata);
  
  // Valid enum value
  const validData = { id: "1", status: "active" };
  const validResult = MetadataLoader.validateData(validData, loadedMeta);
  
  // Invalid enum value
  const invalidData = { id: "1", status: "unknown" };
  const invalidResult = MetadataLoader.validateData(invalidData, loadedMeta);
  
  if (validResult.isValid && !invalidResult.isValid) {
    console.log("✓ Enum validation working correctly");
    console.log(`  - Invalid value error: ${invalidResult.errors.join(", ")}`);
  } else {
    console.error("✗ Enum validation not working correctly");
  }
} catch (error) {
  console.error("✗ Failed:", error);
}

console.log("\n=== All tests completed ===");
