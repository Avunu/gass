import { Entry, IEntryMeta } from "../base/Entry";
import { MetadataLoader } from "../base/MetadataLoader";
import { SheetValue } from "./SheetService";

// Type for Entry constructor with JSON Schema metadata
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
   * Fetch link field options for a given Entry class
   * @param EntryClass - The Entry class to fetch options from
   * @param targetField - The field to use as the value (default: "name")
   * @returns Array of option values
   */
  private static async fetchLinkOptions<T extends Entry>(
    EntryClass: EntryConstructor & { getAll(): Promise<T[]> },
    targetField: string = "name"
  ): Promise<string[]> {
    try {
      // Get all entries of the target type
      const entries = await EntryClass.getAll();
      
      // Extract the target field values
      const options = entries
        .map((entry: Entry) => (entry as any)[targetField])
        .filter((value: any) => value !== null && value !== undefined && value !== "");
      
      return options;
    } catch (error) {
      Logger.log(`Error fetching link options for ${EntryClass.name}: ${error}`);
      return [];
    }
  }

  /**
   * Prepare link options for all Link/LinkArray fields in metadata
   * @param metadata - The entry metadata with field definitions
   * @returns Object mapping field names to their options
   */
  private static async prepareLinkOptions(
    metadata: IEntryMeta
  ): Promise<{ [fieldName: string]: string[] }> {
    const linkOptions: { [fieldName: string]: string[] } = {};
    const relationships = MetadataLoader.getRelationships(metadata);

    for (const [fieldName, relationship] of relationships.entries()) {
      // Get the target Entry class from registry
      const TargetClass = this.getEntryType(relationship.targetClass);
      if (TargetClass) {
        const options = await this.fetchLinkOptions(TargetClass as any, relationship.targetField);
        linkOptions[fieldName] = options;
      } else {
        Logger.log(`Warning: Target class ${relationship.targetClass} not found in registry for field ${fieldName}`);
        linkOptions[fieldName] = [];
      }
    }

    return linkOptions;
  }
  /**
   * Show a dialog for adding a new entry
   * Note: This method is async to support fetching link options for Link/LinkArray fields
   * @param EntryClass - The Entry class to create
   */
  static async showAddEntryDialog<T extends Entry>(
    EntryClass: (new () => T) & { _meta: IEntryMeta }
  ): Promise<void> {
    if (!EntryClass._meta) {
      throw new Error(`Entry class ${EntryClass.name} does not have metadata. Please call loadMetadata() with JSON Schema metadata.`);
    }

    // Fetch link options for Link/LinkArray fields
    const linkOptions = await this.prepareLinkOptions(EntryClass._meta);

    const template = HtmlService.createTemplateFromFile("src/lib/templates/DataEntryDialog");
    template.entryMeta = JSON.stringify(EntryClass._meta);
    template.entryData = JSON.stringify({}); // Empty data for new entry
    template.linkOptions = JSON.stringify(linkOptions);
    template.isEdit = false;
    template.entryTypeName = EntryClass.name;

    const html = template.evaluate().setWidth(600).setHeight(700);
    SpreadsheetApp.getUi().showModalDialog(html, "Add Entry");
  }

  /**
   * Get the currently selected row data and create entry from it
   * @param EntryClass - The Entry class constructor
   * @returns Object containing row number and entry data
   */
  private static getSelectedRowData(
    EntryClass: EntryConstructor
  ): { row: number; entryData: { [key: string]: SheetValue } } {
    const sheet = SpreadsheetApp.getActiveSheet();
    const activeRange = sheet.getActiveRange();
    if (!activeRange) {
      throw new Error("No active range selected");
    }
    const row = activeRange.getRow();

    // Check if it's the header row (always row 1)
    if (row === 1) {
      throw new Error("Cannot edit the header row");
    }

    // Get the row data
    const dataEndColumn = EntryClass._meta.columns.length; // Calculate from columns array
    const fullRowRange = sheet.getRange(
      row,
      1, // dataStartColumn is always 1
      1,
      dataEndColumn
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

    return { row, entryData };
  }

  /**
   * Show a dialog for editing an existing entry
   * Note: This method is async to support fetching link options for Link/LinkArray fields
   * @param EntryClass - The Entry class to edit
   */
  static async showEditEntryDialog<T extends Entry>(
    EntryClass: (new () => T) & { _meta: IEntryMeta; _instances: Map<string, Entry> }
  ): Promise<void> {
    if (!EntryClass._meta) {
      throw new Error(`Entry class ${EntryClass.name} does not have metadata. Please call loadMetadata() with JSON Schema metadata.`);
    }

    // Check if we're on the correct sheet
    const sheet = SpreadsheetApp.getActiveSheet();
    const sheetId = sheet.getSheetId();
    if (sheetId !== EntryClass._meta.sheetId) {
      SpreadsheetApp.getUi().alert("Please select a row in the correct sheet");
      return;
    }

    // Get selected row data
    const { row, entryData } = this.getSelectedRowData(EntryClass);

    // Fetch link options for Link/LinkArray fields
    const linkOptions = await this.prepareLinkOptions(EntryClass._meta);

    const template = HtmlService.createTemplateFromFile("templates/DataEntryDialog");
    template.entryMeta = JSON.stringify(EntryClass._meta);
    template.entryData = JSON.stringify(entryData);
    template.linkOptions = JSON.stringify(linkOptions);
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

      if (!EntryClass._meta) {
        throw new Error(`Entry type ${entryTypeName} does not have metadata`);
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

        const dataEndColumn = EntryClass._meta.columns.length; // Calculate from columns array
        const fullRowRange = sheet.getRange(
          rowNumber,
          1, // dataStartColumn is always 1
          1,
          dataEndColumn
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

  /**
   * Show a persistent sidebar with data entry form
   * Correlates the current sheet with registered entry types
   */
  static showDataEntrySidebar(): void {
    const activeSheet = SpreadsheetApp.getActiveSheet();
    const sheetId = activeSheet.getSheetId();
    
    // Find the Entry type for this sheet
    let EntryClass: EntryConstructor | undefined;
    for (const constructor of this.entryTypeRegistry.values()) {
      if (constructor._meta.sheetId === sheetId) {
        EntryClass = constructor;
        break;
      }
    }

    if (!EntryClass) {
      SpreadsheetApp.getUi().alert("No entry type registered for this sheet");
      return;
    }

    const template = HtmlService.createTemplateFromFile("src/lib/templates/DataEntrySidebar");
    template.entryTypeName = EntryClass.name;
    template.entryMeta = JSON.stringify(EntryClass._meta);

    const html = template.evaluate()
      .setTitle("Data Entry")
      .setWidth(350);
    
    SpreadsheetApp.getUi().showSidebar(html);
  }

  /**
   * Load data for sidebar form
   * @param entryTypeName - Name of the Entry class
   * @param mode - 'new' or 'edit'
   * @returns Form data including metadata, link options, and entry data
   */
  static async loadSidebarFormData(
    entryTypeName: string,
    mode: 'new' | 'edit'
  ): Promise<{
    entryMeta: IEntryMeta;
    linkOptions: { [fieldName: string]: string[] };
    entryData: { [key: string]: SheetValue };
    rowNumber: number | null;
  }> {
    const EntryClass = this.getEntryType(entryTypeName);
    if (!EntryClass) {
      throw new Error(`Entry type not found: ${entryTypeName}`);
    }

    if (!EntryClass._meta) {
      throw new Error(`Entry type ${entryTypeName} does not have metadata`);
    }

    // Fetch link options for Link/LinkArray fields
    const linkOptions = await this.prepareLinkOptions(EntryClass._meta);

    let entryData: { [key: string]: SheetValue } = {};
    let rowNumber: number | null = null;

    if (mode === 'edit') {
      // Use the helper method to get selected row data
      const result = this.getSelectedRowData(EntryClass);
      entryData = result.entryData;
      rowNumber = result.row;
    }

    return {
      entryMeta: EntryClass._meta,
      linkOptions,
      entryData,
      rowNumber
    };
  }
}
