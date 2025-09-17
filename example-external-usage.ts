/**
 * Example demonstrating external spreadsheet support
 * This implements the exact scenario described in the GitHub issue
 */

import { Entry, IEntryMeta, SheetService } from "./index";

// Example constants (these would be real IDs in practice)
const EXTERNAL_SPREADSHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
const EXTERNAL_SHEET_NAME = "Affiliates";

/**
 * External Affiliate entry as described in the problem statement
 */
export class Affiliate extends Entry {
  static override _meta: IEntryMeta = {
    spreadsheetId: EXTERNAL_SPREADSHEET_ID,
    sheetId: EXTERNAL_SHEET_NAME, // Sheet name for external sheets
    headerRow: 1,
    dataStartColumn: 1,
    dataEndColumn: 5,
    columns: ["name", "representative", "address", "website", "notes"],
    defaultSort: [{ column: "name", ascending: true }],
  };

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

/**
 * Example function demonstrating the exact scenario from the issue
 */
export async function demonstrateExternalSpreadsheetAccess(): Promise<void> {
  console.log("=== External Spreadsheet Access Demo ===");

  try {
    // This is the exact example from the problem statement:
    // "Affiliate.get({ representative: "Kevin Shenk" })"
    console.log("1. Filtering by representative...");
    const kevinAffiliates = await Affiliate.get({ representative: "Kevin Shenk" });
    console.log(`Found ${kevinAffiliates.length} affiliates for Kevin Shenk:`, kevinAffiliates);

    // Demonstrate other query methods
    console.log("\n2. Getting all affiliates...");
    const allAffiliates = await Affiliate.getAll();
    console.log(`Total affiliates: ${allAffiliates.length}`);

    // Demonstrate getValue method
    if (allAffiliates.length > 0) {
      const firstAffiliate = allAffiliates[0];
      console.log("\n3. Getting specific value...");
      const website = await Affiliate.getValue({ name: firstAffiliate.name }, "website");
      console.log(`Website for ${firstAffiliate.name}: ${website}`);
    }

    // Show the underlying A1 notation that would be generated
    console.log("\n4. Behind the scenes - A1 notation examples:");
    
    // For filtering by representative (column B, starting from row 2)
    const filterRange = SheetService.generateA1Range(EXTERNAL_SHEET_NAME, 2, 2); // B2:B
    console.log(`Filter range for representative column: ${filterRange}`);
    
    // For getting complete row data (columns A-E, specific row)
    const rowRange = SheetService.generateA1Range(EXTERNAL_SHEET_NAME, 3, 1, 3, 5); // A3:E3
    console.log(`Complete row range example: ${rowRange}`);

    console.log("\n5. Demonstrating read-only protection...");
    if (kevinAffiliates.length > 0) {
      const affiliate = kevinAffiliates[0];
      affiliate.notes = "Trying to modify this...";
      affiliate.markDirty();
      
      try {
        await affiliate.save();
        console.log("❌ ERROR: Save should have failed!");
      } catch (error) {
        console.log("✅ Read-only protection working:", error.message);
      }
    }

    console.log("\n=== Demo completed successfully ===");

  } catch (error) {
    console.error("Error during demo:", error);
    throw error;
  }
}

/**
 * Utility function to show the API calls that would be made
 * (for educational purposes - shows what happens behind the scenes)
 */
export function explainAPICallsForFiltering(): void {
  console.log("=== API Calls Explanation ===");
  console.log("When calling: Affiliate.get({ representative: 'Kevin Shenk' })");
  console.log("");
  console.log("Step 1: batchGet to find matching rows");
  console.log(`  Sheets.Spreadsheets.Values.batchGet('${EXTERNAL_SPREADSHEET_ID}', {`);
  console.log(`    ranges: ['${EXTERNAL_SHEET_NAME}!B2:B']`);
  console.log("  })");
  console.log("");
  console.log("Step 2: Filter the results to find row numbers where representative = 'Kevin Shenk'");
  console.log("");
  console.log("Step 3: Get complete row data for matches");
  console.log("  For each matching row (e.g., row 5):");
  console.log(`  Sheets.Spreadsheets.Values.get('${EXTERNAL_SPREADSHEET_ID}', '${EXTERNAL_SHEET_NAME}!A5:E5')`);
  console.log("");
  console.log("This approach minimizes API calls and data transfer!");
}

/**
 * Example of how external entries integrate with the rest of the system
 */
export async function demonstrateRegistryIntegration(): Promise<void> {
  // This would be done in your main initialization code
  // EntryRegistry.init([
  //   Affiliate,        // External entry
  //   LocalEmployee,    // Internal entry
  //   LocalProject      // Internal entry
  // ]);

  console.log("External entries can be registered alongside internal entries");
  console.log("The framework automatically detects which type each entry is based on the metadata");
}

// Export everything for use in Google Apps Script environment
export {
  EXTERNAL_SPREADSHEET_ID,
  EXTERNAL_SHEET_NAME
};