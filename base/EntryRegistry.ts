import { Entry, IEntryMeta } from "./Entry";
import { FilterCriteria, SheetValue } from "../services/SheetService";
import { SchedulerService } from "./ScheduledJob";
import { ScheduledJob } from "../types/jobs";

export interface MenuItem {
  label: string;
  functionName: string;
  handler: () => Promise<void>;
}

// Add type for global menu functions
export interface MenuHandler {
  (): Promise<void> | void;
}

export interface GlobalMenuFunctions {
  [key: string]: MenuHandler;
}

type EntryConstructor = {
  new (): Entry;
  _meta: IEntryMeta;
  getMenuItems?: () => MenuItem[];
  get(filters: FilterCriteria): Promise<Entry[]>;
  getValue(filters: FilterCriteria, column: string): Promise<SheetValue>;
  getAll(): Promise<Entry[]>;
  applySmartFilters(): void;
  batchSave(entries: Entry[]): Promise<void>;
};

export class EntryRegistry {
  private static entryTypes: Map<number | string, EntryConstructor> = new Map();
  private static initialized = false;

  /**
   * Initialize the registry with provided entry types
   */
  static init(entries: EntryConstructor[]): void {
    if (this.initialized) return;

    // Register all provided entry types
    entries.forEach((entryType) => {
      // For external entries, we create a unique key combining spreadsheetId and sheetId
      const key = entryType._meta.spreadsheetId 
        ? `${entryType._meta.spreadsheetId}:${entryType._meta.sheetId}`
        : entryType._meta.sheetId;
      this.entryTypes.set(key, entryType);
    });

    this.initialized = true;
  }

  /**
   * Reset the registry (useful for testing or re-initialization)
   */
  static reset(): void {
    this.entryTypes.clear();
    this.initialized = false;
  }

  static ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("EntryRegistry must be initialized with init(entries) before use");
    }
  }

  /**
   * Get an entry type by its sheet ID (works for both internal and external entries)
   */
  static getEntryTypeBySheetId(sheetId: number): EntryConstructor | undefined {
    this.ensureInitialized();
    return this.entryTypes.get(sheetId);
  }

  /**
   * Get an entry type by external spreadsheet and sheet identifiers
   */
  static getEntryTypeByExternalId(spreadsheetId: string, sheetId: string): EntryConstructor | undefined {
    this.ensureInitialized();
    const key = `${spreadsheetId}:${sheetId}`;
    return this.entryTypes.get(key);
  }

  /**
   * Get all registered entry types
   */
  static getAllEntryTypes(): EntryConstructor[] {
    this.ensureInitialized();
    return Array.from(this.entryTypes.values());
  }

  /**
   * Handle an edit event by updating the appropriate entry
   */
  static async handleEdit(e: GoogleAppsScript.Events.SheetsOnEdit): Promise<void> {
    this.ensureInitialized();

    const { range, oldValue, value } = e;
    const sheet = range.getSheet();
    const sheetId = sheet.getSheetId();
    const row = range.getRow();
    // never act on the first row changes
    if (row === 1) return;
    const column = range.getColumn();

    const EntryType = this.getEntryTypeBySheetId(sheetId);
    if (!EntryType) return;

    // Check if edit is within filter range
    const meta = EntryType._meta;
    if (
      meta.filterRow &&
      meta.filterRange &&
      row === meta.filterRow &&
      column >= meta.filterRange.startColumn &&
      column <= meta.filterRange.endColumn
    ) {
      // This is a filter edit - handle it separately
      EntryType.applySmartFilters();
      return;
    }

    // Clear filters if clear button was clicked
    if (
      meta.clearFiltersCell &&
      row === meta.clearFiltersCell.row &&
      column === meta.clearFiltersCell.column &&
      value === "TRUE"
    ) {
      EntryType.applySmartFilters();
      return;
    }

    // Skip if it's the header row
    if (row === meta.headerRow) return;

    // Skip if the value didn't actually change
    if (oldValue === value) return;

    try {
      // Get the full row data instead of just the edited cell
      const fullRowRange = sheet.getRange(
        row,
        EntryType._meta.dataStartColumn,
        1,
        EntryType._meta.dataEndColumn - EntryType._meta.dataStartColumn + 1,
      );
      const rowData = fullRowRange.getValues()[0];

      // If all cells are empty, and this was a deletion, we can skip processing
      if (rowData.every((cell) => cell === "") && !value) return;

      // Process any row through entry validation
      const entry = new EntryType();
      entry.fromRow(rowData, row);

      // Only save if the entry is valid
      const validation = entry.validate();
      if (validation.isValid) {
        entry.markDirty();
        await entry.save();
        SpreadsheetApp.getActiveSpreadsheet().toast("Changes saved successfully", "Success", 3);
      } else {
        const errorMessage = validation.errors.join(", ");
        SpreadsheetApp.getActiveSpreadsheet().toast(errorMessage, "Validation Error", -1);
        Logger.log(`Validation failed for row ${row}: ${errorMessage}`);
      }
    } catch (error) {
      const errorMessage = `Error in row ${row}: ${error}`;
      SpreadsheetApp.getActiveSpreadsheet().toast(errorMessage, "Error", -1);
      Logger.log(`Error handling edit in sheet ${sheetId}, row ${row}: ${error}`);
    }
  }

  /**
   * Get menu items from all registered entry types
   */
  static getMenuItems(): { [key: string]: MenuItem[] } {
    const menuItems: { [key: string]: MenuItem[] } = {};

    this.getAllEntryTypes().forEach((EntryType) => {
      if (EntryType.getMenuItems) {
        menuItems[EntryType.name] = EntryType.getMenuItems();
      }
    });

    return menuItems;
  }

  /**
   * Register all menu functions globally
   */
  static registerMenuFunctions(global: GlobalMenuFunctions): void {
    this.getAllEntryTypes().forEach((EntryType) => {
      if (EntryType.getMenuItems) {
        EntryType.getMenuItems().forEach(({ functionName, handler }) => {
          // Add the function to the global scope
          global[functionName] = () => {
            // Wrap in promise and handle errors
            return handler().catch((error) => {
              SpreadsheetApp.getActiveSpreadsheet().toast(`Error: ${error}`, "Menu Action Failed", -1);
              throw error;
            });
          };
        });
      }
    });
  }

  /**
   * Sync all entries across all types
   */
  static async syncAll(): Promise<void> {
    for (const EntryType of this.getAllEntryTypes()) {
      const entries = await EntryType.getAll();
      // Use batch save instead of individual saves
      await EntryType.batchSave(entries);
    }
  }

  static async collectAndRegisterJobs(): Promise<void> {
    const entryTypes = EntryRegistry.getAllEntryTypes();

    for (const EntryType of entryTypes) {
      if ("getScheduledJobs" in EntryType && typeof EntryType.getScheduledJobs === "function") {
        const jobs = await EntryType.getScheduledJobs();
        if (jobs) {
          jobs.forEach((job: ScheduledJob) => SchedulerService.registerJob(job));
        }
      }
    }
  }
}
