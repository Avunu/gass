/**
 * Unit tests for external spreadsheet functionality
 * These tests validate the core external sheet features without requiring actual API calls
 */

import { SheetService } from "./services/SheetService";

// Simple assertion function
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test the A1 notation generation
export function testA1NotationGeneration(): void {
  console.log("Testing A1 notation generation...");

  // Test basic range generation
  const basicRange = SheetService.generateA1Range("Sheet1", 2, 1, 5, 3);
  assert(basicRange === "Sheet1!A2:C5", `Expected "Sheet1!A2:C5", got "${basicRange}"`);

  // Test single column range
  const columnRange = SheetService.generateA1Range("Affiliates", 2, 2);
  assert(columnRange === "Affiliates!B2", `Expected "Affiliates!B2", got "${columnRange}"`);

  // Test open-ended range
  const openRange = SheetService.generateA1Range("Data", 1, 1, undefined, 5);
  assert(openRange === "Data!A1:E", `Expected "Data!A1:E", got "${openRange}"`);

  console.log("✅ A1 notation generation tests passed");
}

// Test column number to A1 conversion
export function testColumnNumberToA1(): void {
  console.log("Testing column number to A1 conversion...");

  assert(SheetService.columnNumberToA1(1) === "A", "Column 1 should be A");
  assert(SheetService.columnNumberToA1(2) === "B", "Column 2 should be B");
  assert(SheetService.columnNumberToA1(26) === "Z", "Column 26 should be Z");
  assert(SheetService.columnNumberToA1(27) === "AA", "Column 27 should be AA");
  assert(SheetService.columnNumberToA1(28) === "AB", "Column 28 should be AB");

  console.log("✅ Column number to A1 conversion tests passed");
}

// Test external entry detection
export function testExternalEntryDetection(): void {
  console.log("Testing external entry detection...");

  // Should detect external entry
  const isExternal1 = SheetService.isExternalEntry("SheetName", "spreadsheet123");
  assert(isExternal1 === true, "Should detect external entry when spreadsheetId is present");

  // Should detect internal entry
  const isExternal2 = SheetService.isExternalEntry(123, undefined);
  assert(isExternal2 === false, "Should detect internal entry when spreadsheetId is undefined");

  const isExternal3 = SheetService.isExternalEntry("SheetName", undefined);
  assert(isExternal3 === false, "Should detect internal entry when spreadsheetId is undefined");

  console.log("✅ External entry detection tests passed");
}

// Mock implementation to test the filter evaluation
export function testFilterEvaluation(): void {
  console.log("Testing filter evaluation...");

  // Test basic equality
  assert(SheetService.evaluateFilter("Kevin Shenk", "Kevin Shenk") === true, "Equality filter should match");
  assert(SheetService.evaluateFilter("John Doe", "Kevin Shenk") === false, "Equality filter should not match");

  // Test $exists operator
  assert(SheetService.evaluateFilter("some value", { $exists: true }) === true, "$exists true should match non-empty");
  assert(SheetService.evaluateFilter("", { $exists: false }) === true, "$exists false should match empty");
  assert(SheetService.evaluateFilter(null, { $exists: false }) === true, "$exists false should match null");

  // Test comparison operators
  assert(SheetService.evaluateFilter(10, { $gt: 5 }) === true, "$gt should work");
  assert(SheetService.evaluateFilter(3, { $gt: 5 }) === false, "$gt should work");
  assert(SheetService.evaluateFilter(10, { $between: [5, 15] }) === true, "$between should work");

  console.log("✅ Filter evaluation tests passed");
}

// Run all tests
export function runAllTests(): void {
  console.log("=== Running External Spreadsheet Unit Tests ===");
  
  try {
    testA1NotationGeneration();
    testColumnNumberToA1();
    testExternalEntryDetection();
    testFilterEvaluation();
    
    console.log("🎉 All tests passed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  }
}