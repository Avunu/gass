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
  private static async fetchLinkOptions(
    EntryClass: EntryConstructor,
    targetField: string = "name"
  ): Promise<string[]> {
    try {
      // Get all entries of the target type
      const entries = await EntryClass.getAll();
      
      // Extract the target field values
      const options = entries
        .map((entry) => (entry as any)[targetField])
        .filter((value) => value !== null && value !== undefined && value !== "");
      
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
        const options = await this.fetchLinkOptions(TargetClass, relationship.targetField);
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
      throw new Error(`Entry class ${EntryClass.name} does not have metadata. Please use loadMetadata() in a static block.`);
    }

    // Fetch link options for Link/LinkArray fields
    const linkOptions = await this.prepareLinkOptions(EntryClass._meta);

    const template = HtmlService.createTemplateFromFile("templates/DataEntryDialog");
    template.entryMeta = JSON.stringify(EntryClass._meta);
    template.entryData = JSON.stringify({}); // Empty data for new entry
    template.linkOptions = JSON.stringify(linkOptions);
    template.isEdit = false;
    template.entryTypeName = EntryClass.name;

    const html = template.evaluate().setWidth(600).setHeight(700);
    SpreadsheetApp.getUi().showModalDialog(html, "Add Entry");
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
      throw new Error(`Entry class ${EntryClass.name} does not have metadata. Please use loadMetadata() in a static block.`);
    }

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
