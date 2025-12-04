import { Entry, IEntryMeta } from "../base/Entry";
import { SheetValue } from "./SheetService";

// Type for Entry constructor
type EntryConstructor = (new () => Entry) & {
  _meta: IEntryMeta;
  _instances: Map<string, Entry>;
};

/**
 * Service for creating metadata-driven data entry forms
 * Uses Material Design Web Components in a Google Apps Script Dialog
 */
export class DataEntryService {
  private static entryTypeRegistry: Map<string, EntryConstructor> = new Map();

  /**
   * Register an entry type for use in dialogs
   * @param name - The name of the entry type
   * @param EntryClass - The Entry class constructor
   */
  static registerEntryType(name: string, EntryClass: EntryConstructor): void {
    this.entryTypeRegistry.set(name, EntryClass);
  }

  /**
   * Get an entry type by name
   * @param name - The name of the entry type
   */
  private static getEntryType(name: string): EntryConstructor | undefined {
    return this.entryTypeRegistry.get(name);
  }
  /**
   * Show a dialog for adding a new entry
   * @param EntryClass - The Entry class to create
   */
  static showAddEntryDialog<T extends Entry>(
    EntryClass: (new () => T) & { _meta: IEntryMeta }
  ): void {
    const template = HtmlService.createTemplateFromFile("templates/DataEntryDialog");
    template.entryMeta = JSON.stringify(EntryClass._meta);
    template.entryData = JSON.stringify({}); // Empty data for new entry
    template.isEdit = false;
    template.entryTypeName = EntryClass.name;

    const html = template.evaluate().setWidth(600).setHeight(700);
    SpreadsheetApp.getUi().showModalDialog(html, "Add Entry");
  }

  /**
   * Show a dialog for editing an existing entry
   * @param EntryClass - The Entry class to edit
   */
  static async showEditEntryDialog<T extends Entry>(
    EntryClass: (new () => T) & { _meta: IEntryMeta; _instances: Map<string, Entry> }
  ): Promise<void> {
    // Get the currently selected row
    const sheet = SpreadsheetApp.getActiveSheet();
    const activeRange = sheet.getActiveRange();
    const row = activeRange.getRow();

    // Check if we're on the correct sheet
    const sheetId = sheet.getSheetId();
    if (sheetId !== EntryClass._meta.sheetId) {
      SpreadsheetApp.getUi().alert("Please select a row in the correct sheet");
      return;
    }

    // Check if it's the header row
    if (row === EntryClass._meta.headerRow) {
      SpreadsheetApp.getUi().alert("Cannot edit the header row");
      return;
    }

    // Get the row data
    const fullRowRange = sheet.getRange(
      row,
      EntryClass._meta.dataStartColumn,
      1,
      EntryClass._meta.dataEndColumn - EntryClass._meta.dataStartColumn + 1
    );
    const rowData = fullRowRange.getValues()[0];

    // Create an entry from the row data
    const entry = new EntryClass();
    entry.fromRow(rowData, row);

    // Convert entry to data object
    const entryData: { [key: string]: SheetValue } = {};
    EntryClass._meta.columns.forEach((col) => {
      entryData[col] = (entry as any)[col];
    });

    const template = HtmlService.createTemplateFromFile("templates/DataEntryDialog");
    template.entryMeta = JSON.stringify(EntryClass._meta);
    template.entryData = JSON.stringify(entryData);
    template.isEdit = true;
    template.entryTypeName = EntryClass.name;
    template.rowNumber = row;

    const html = template.evaluate().setWidth(600).setHeight(700);
    SpreadsheetApp.getUi().showModalDialog(html, "Edit Entry");
  }

  /**
   * Save entry data from the dialog form
   * @param entryTypeName - Name of the Entry class
   * @param entryData - The entry data from the form
   * @param isEdit - Whether this is an edit operation
   * @param rowNumber - The row number for edit operations
   */
  static async saveEntryFromDialog(
    entryTypeName: string,
    entryData: { [key: string]: SheetValue },
    isEdit: boolean,
    rowNumber?: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get the Entry class from the registry
      const EntryClass = this.getEntryType(entryTypeName);
      if (!EntryClass) {
        throw new Error(`Entry type not found: ${entryTypeName}`);
      }

      // Create or load the entry
      const entry = new EntryClass();

      // If editing, load the existing row data first
      if (isEdit && rowNumber) {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets().find(
          (s) => s.getSheetId() === EntryClass._meta.sheetId
        );
        if (!sheet) {
          throw new Error("Sheet not found");
        }

        const fullRowRange = sheet.getRange(
          rowNumber,
          EntryClass._meta.dataStartColumn,
          1,
          EntryClass._meta.dataEndColumn - EntryClass._meta.dataStartColumn + 1
        );
        const rowData = fullRowRange.getValues()[0];
        entry.fromRow(rowData, rowNumber);
      }

      // Update entry with form data
      EntryClass._meta.columns.forEach((col) => {
        if (entryData.hasOwnProperty(col)) {
          (entry as any)[col] = entryData[col];
        }
      });

      // Mark as dirty and save
      entry.markDirty();
      await entry.save();

      return {
        success: true,
        message: isEdit ? "Entry updated successfully" : "Entry added successfully",
      };
    } catch (error) {
      Logger.log(`Error saving entry: ${error}`);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
