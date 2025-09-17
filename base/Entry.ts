import { FilterCriteria, SheetService, SheetValue } from "../services/SheetService";
import { ScheduledJob } from "../types/jobs";
import { CacheManager } from "./cacheManager";
import { MenuItem } from "./EntryRegistry";

export interface IEntryMeta {
  sheetId: number | string; // number for internal sheets, string (sheet name) for external sheets
  spreadsheetId?: string; // when present, indicates external spreadsheet
  columns: string[];
  headerRow: number;
  dataStartColumn: number;
  dataEndColumn: number;
  defaultSort?: {
    column: string;
    ascending: boolean;
  }[];
  filterRow?: number;
  filterRange?: {
    startColumn: number;
    endColumn: number;
  };
  clearFiltersCell?: {
    row: number;
    column: number;
  };
}

export type ValidationResult = {
  isValid: boolean;
  errors: string[];
};

export abstract class Entry {
  protected static _meta: IEntryMeta;
  protected static _instances: Map<string, Entry> = new Map();

  protected _isDirty: boolean = false;
  protected _isNew: boolean = true;
  protected _row: number = 0;

  // Add static cache for column indices
  private static _columnIndices: { [key: string]: { [col: string]: number } } = {};

  static _cacheManager = new CacheManager();
  static readonly CACHE_TIMEOUT = 3600; // 1 hour

  // Add index signature to allow string indexing on derived classes
  [key: string]: SheetValue | unknown;

  public constructor() {}

  // Update createInstance to ensure it's called only on concrete classes
  protected static createInstance<T extends Entry>(this: new () => T): T {
    return new this();
  }

  // Update the static method signatures to include static members in the constraint
  static async get<T extends Entry>(
    this: new () => T,
    filters: FilterCriteria,
  ): Promise<T[]> {
    const EntryClass = this as any;
    
    // Check if this is an external entry
    if (SheetService.isExternalEntry(EntryClass._meta.sheetId, EntryClass._meta.spreadsheetId)) {
      return EntryClass.getExternal(filters);
    }

    const cachedMatches = Array.from(EntryClass._instances.values()).filter((entry: Entry) =>
      Object.entries(filters).every(([key, value]) =>
        SheetService.evaluateFilter(entry[key] as SheetValue, value),
      ),
    );

    if (cachedMatches.length > 0) {
      return cachedMatches as T[];
    }

    // Only pass the primary sort column if it exists
    const primarySort = EntryClass._meta.defaultSort?.[0];
    const sortInfo = primarySort
      ? {
          columnIndex: EntryClass._meta.columns.indexOf(primarySort.column),
          ascending: primarySort.ascending,
        }
      : undefined;

    const rows = await SheetService.getFilteredRows(
      EntryClass._meta.sheetId as number,
      EntryClass._meta.headerRow,
      filters,
      EntryClass._meta.columns,
      sortInfo ? { sortInfo } : undefined,
    );

    return rows.map((row) => {
      const entry = new this();
      entry.fromRow(row.data, row.rowNumber);
      EntryClass._instances.set(entry.getCacheKey(), entry);
      return entry;
    });
  }

  /**
   * Get entries from external spreadsheet
   */
  static async getExternal<T extends Entry>(
    this: (new () => T) & { _meta: IEntryMeta },
    filters: FilterCriteria,
  ): Promise<T[]> {
    if (!this._meta.spreadsheetId) {
      throw new Error('External spreadsheet ID not specified');
    }
    
    if (typeof this._meta.sheetId !== 'string') {
      throw new Error('External entries must use string sheet name, not numeric sheet ID');
    }

    const rows = await SheetService.getExternalFilteredRows(
      this._meta.spreadsheetId,
      this._meta.sheetId,
      this._meta.headerRow,
      filters,
      this._meta.columns,
    );

    return rows.map((row) => {
      const entry = new this();
      entry.fromRow(row.data, row.rowNumber);
      entry._isNew = false; // External entries are never "new" - they're read-only
      return entry;
    });
  }

  static async getValue<T extends Entry>(
    this: new () => T,
    filters: FilterCriteria,
    column: string,
  ): Promise<SheetValue> {
    const EntryClass = this as any;
    
    // Check if this is an external entry
    if (SheetService.isExternalEntry(EntryClass._meta.sheetId, EntryClass._meta.spreadsheetId)) {
      return EntryClass.getExternalValue(filters, column);
    }

    const sheet = SheetService.getSheet(EntryClass._meta.sheetId as number);

    // Get column index directly from meta.columns
    const columnIndex = EntryClass._meta.columns.indexOf(column);
    if (columnIndex === -1) {
      throw new Error(`Column not found: ${column}`);
    }

    // Map filter keys to their column indices from meta.columns
    const filterIndices = Object.entries(filters).map(([key, value]) => ({
      key,
      index: EntryClass._meta.columns.indexOf(key),
      value,
    }));

    const invalidFilters = filterIndices.filter((f) => f.index === -1);
    if (invalidFilters.length > 0) {
      throw new Error(`Columns not found: ${invalidFilters.map((f) => f.key).join(", ")}`);
    }

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    // Skip header row in search
    for (let i = EntryClass._meta.headerRow; i < values.length; i++) {
      const row = values[i];
      if (filterIndices.every((f) => row[f.index] === f.value)) {
        return row[columnIndex];
      }
    }

    return null;
  }

  /**
   * Get a single value from external spreadsheet
   */
  static async getExternalValue<T extends Entry>(
    this: (new () => T) & { _meta: IEntryMeta },
    filters: FilterCriteria,
    column: string,
  ): Promise<SheetValue> {
    if (!this._meta.spreadsheetId) {
      throw new Error('External spreadsheet ID not specified');
    }
    
    if (typeof this._meta.sheetId !== 'string') {
      throw new Error('External entries must use string sheet name, not numeric sheet ID');
    }

    // Get the first matching row
    const rows = await SheetService.getExternalFilteredRows(
      this._meta.spreadsheetId,
      this._meta.sheetId,
      this._meta.headerRow,
      filters,
      this._meta.columns,
    );

    if (rows.length === 0) {
      return null;
    }

    const columnIndex = this._meta.columns.indexOf(column);
    if (columnIndex === -1) {
      throw new Error(`Column not found: ${column}`);
    }

    return rows[0].data[columnIndex];
  }

  static async getAll<T extends Entry>(
    this: new () => T,
  ): Promise<T[]> {
    const EntryClass = this as any;
    
    // Check if this is an external entry
    if (SheetService.isExternalEntry(EntryClass._meta.sheetId, EntryClass._meta.spreadsheetId)) {
      return EntryClass.getAllExternal();
    }

    const rows = await SheetService.getAllRows(EntryClass._meta.sheetId as number);
    return rows.map((row) => {
      const entry = new this();
      entry.fromRow(row.data, row.rowNumber);
      EntryClass._instances.set(entry.getCacheKey(), entry);
      return entry;
    });
  }

  /**
   * Get all entries from external spreadsheet
   */
  static async getAllExternal<T extends Entry>(
    this: (new () => T) & { _meta: IEntryMeta },
  ): Promise<T[]> {
    if (!this._meta.spreadsheetId) {
      throw new Error('External spreadsheet ID not specified');
    }
    
    if (typeof this._meta.sheetId !== 'string') {
      throw new Error('External entries must use string sheet name, not numeric sheet ID');
    }

    const rows = await SheetService.getExternalAllRows(
      this._meta.spreadsheetId,
      this._meta.sheetId,
      this._meta.headerRow,
      this._meta.columns.length
    );

    return rows.map((row) => {
      const entry = new this();
      entry.fromRow(row.data, row.rowNumber);
      entry._isNew = false; // External entries are never "new" - they're read-only
      return entry;
    });
  }

  abstract getCacheKey(): string;
  abstract validate(): ValidationResult;

  protected beforeSave(): void {}
  protected afterSave(): void {}
  protected beforeUpdate(): void {}
  protected afterUpdate(): void {}
  protected beforeDelete(): void {}
  protected afterDelete(): void {}

  public markDirty(): void {
    this._isDirty = true;
  }

  async save(): Promise<void> {
    if (!this._isDirty) return;

    const EntryClass = this.constructor as (new () => Entry) & {
      _meta: IEntryMeta;
      sort(orders: { column: number; ascending: boolean }[]): void;
    };

    // Prevent saving external entries
    if (SheetService.isExternalEntry(EntryClass._meta.sheetId, EntryClass._meta.spreadsheetId)) {
      throw new Error('Cannot save external entries - they are read-only');
    }

    const validation = this.validate();
    if (!validation.isValid) {
      const errorMessage = validation.errors.join(", ");
      SpreadsheetApp.getActiveSpreadsheet().toast(errorMessage, "Validation Error", -1);
      throw new Error(`Validation failed: ${errorMessage}`);
    }

    if (this._isNew) {
      await this.beforeSave();
      // Save the row with any changes made during beforeSave
      await SheetService.appendRow(EntryClass._meta.sheetId as number, this.toRow());
      await this.afterSave();
    } else {
      await this.beforeUpdate();
      // Allow beforeUpdate to modify values before saving
      await this.beforeSave();
      // Save the row with any changes made during hooks
      await SheetService.updateRow(EntryClass._meta.sheetId as number, this._row, this.toRow());
      await this.afterUpdate();
      await this.afterSave();
    }

    const meta = EntryClass._meta;
    if (meta.defaultSort) {
      EntryClass.sort(
        meta.defaultSort.map((sort) => ({
          column: meta.columns.indexOf(sort.column) + 1,
          ascending: sort.ascending,
        })),
      );
    }

    this._isDirty = false;
  }

  async delete(): Promise<void> {
    if (this._isNew) return;

    const EntryClass = this.constructor as (new () => Entry) & { _meta: IEntryMeta };

    // Prevent deleting external entries
    if (SheetService.isExternalEntry(EntryClass._meta.sheetId, EntryClass._meta.spreadsheetId)) {
      throw new Error('Cannot delete external entries - they are read-only');
    }

    await this.beforeDelete();
    await SheetService.deleteRow(EntryClass._meta.sheetId as number, this._row);
    (this.constructor as typeof Entry as typeof Entry)._instances.delete(this.getCacheKey());
    await this.afterDelete();
  }

  protected toRow(): SheetValue[] {
    const meta = (this.constructor as typeof Entry)._meta;

    // map data in order of columns array
    return meta.columns.map((col) => {
      if (!(col in this)) {
        throw new Error(`Property not found in object: ${col}`);
      }
      return this[col] as SheetValue;
    });
  }

  public fromRow(rowData: SheetValue[], rowNumber: number): void {
    const meta = (this.constructor as typeof Entry)._meta;

    // Validate we have enough columns
    if (rowData.length < meta.columns.length) {
      throw new Error(`Row data has ${rowData.length} columns but expected ${meta.columns.length}`);
    }

    // Map data positionally
    meta.columns.forEach((col, index) => {
      this[col] = rowData[index];
    });

    this._row = rowNumber;
    this._isNew = false;
    this._isDirty = false;
  }

  protected static getColumnIndices(sheet: GoogleAppsScript.Spreadsheet.Sheet): { [key: string]: number } {
    const sheetId = sheet.getSheetId();

    // Return cached indices if available
    if (this._columnIndices[sheetId]) {
      return this._columnIndices[sheetId];
    }

    const indices = this._meta.columns.reduce((acc: { [key: string]: number }, col: string, index) => {
      acc[col] = index + this._meta.dataStartColumn;
      return acc;
    }, {});

    // Cache the indices
    this._columnIndices[sheetId] = indices;
    return indices;
  }

  // Add batch save functionality
  static async batchSave<T extends Entry>(entries: T[]): Promise<void> {
    // Prevent batch saving external entries
    if (entries.length > 0) {
      const firstEntry = entries[0];
      const EntryClass = firstEntry.constructor as (new () => Entry) & { _meta: IEntryMeta };
      if (SheetService.isExternalEntry(EntryClass._meta.sheetId, EntryClass._meta.spreadsheetId)) {
        throw new Error('Cannot batch save external entries - they are read-only');
      }
    }

    const dirtyEntries = entries.filter((entry) => entry._isDirty);
    if (dirtyEntries.length === 0) return;

    const newEntries = dirtyEntries.filter((entry) => entry._isNew);
    const existingEntries = dirtyEntries.filter((entry) => !entry._isNew);

    // Handle new entries in batch
    if (newEntries.length > 0) {
      const newRows = newEntries.map((entry) => entry.toRow());
      await SheetService.appendRows(this._meta.sheetId as number, newRows);
    }

    // Handle updates in batch
    if (existingEntries.length > 0) {
      const updates = existingEntries.map((entry) => ({
        row: entry._row,
        values: entry.toRow(),
      }));
      await SheetService.updateRows(this._meta.sheetId as number, updates);
    }

    // Mark all entries as clean
    dirtyEntries.forEach((entry) => {
      entry._isDirty = false;
      entry._isNew = false;
    });
  }

  // Add batch insert functionality for plain data objects
  static async batchInsert<T extends Entry>(
    this: (new () => T) & {
      _meta: IEntryMeta;
      _instances: Map<string, Entry>;
      sort(sortOrders: { column: number; ascending: boolean }[]): void;
    },
    dataObjects: Array<{ [key: string]: SheetValue }>,
  ): Promise<T[]> {
    if (dataObjects.length === 0) return [];

    // Create Entry instances from data objects
    const entries: T[] = [];
    for (const data of dataObjects) {
      const entry = new this();

      // Set properties from data object
      this._meta.columns.forEach((column) => {
        if (data.hasOwnProperty(column)) {
          (entry as any)[column] = data[column];
        }
      });

      // Mark as new and dirty
      entry._isNew = true;
      entry._isDirty = true;

      entries.push(entry);
    }

    // Validate all entries first
    const validationErrors: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const validation = entries[i].validate();
      if (!validation.isValid) {
        validationErrors.push(`Entry ${i + 1}: ${validation.errors.join(", ")}`);
      }
    }

    if (validationErrors.length > 0) {
      const errorMessage = `Batch validation failed: ${validationErrors.join("; ")}`;
      throw new Error(errorMessage);
    }

    // Run beforeSave hooks asynchronously for all entries
    await Promise.all(entries.map((entry) => entry.beforeSave()));

    // Prepare rows for batch insert
    const rows = entries.map((entry) => entry.toRow());

    // Perform batch insert
    await SheetService.appendRows(this._meta.sheetId, rows);

    // Run afterSave hooks asynchronously for all entries
    await Promise.all(entries.map((entry) => entry.afterSave()));

    // Apply default sorting if configured
    const meta = this._meta;
    if (meta.defaultSort) {
      this.sort(
        meta.defaultSort.map((sort) => ({
          column: meta.columns.indexOf(sort.column) + 1,
          ascending: sort.ascending,
        })),
      );
    }

    // Mark all entries as clean and not new
    entries.forEach((entry) => {
      entry._isDirty = false;
      entry._isNew = false;

      // Add to instance cache
      this._instances.set(entry.getCacheKey(), entry);
    });

    return entries;
  }

  /**
   * Apply filter to the sheet
   */
  static applyFilter<T extends Entry>(
    this: new () => T,
    criteria: GoogleAppsScript.Spreadsheet.FilterCriteria,
    column: number,
  ): void {
    const EntryClass = this as any;
    
    // External entries don't support filters
    if (SheetService.isExternalEntry(EntryClass._meta.sheetId, EntryClass._meta.spreadsheetId)) {
      throw new Error('Filter operations not supported on external entries');
    }

    const sheet = SheetService.getSheet(EntryClass._meta.sheetId as number);
    const range = sheet.getRange(
      EntryClass._meta.headerRow,
      EntryClass._meta.dataStartColumn,
      sheet.getLastRow() - EntryClass._meta.headerRow,
      EntryClass._meta.dataEndColumn - EntryClass._meta.dataStartColumn + 1,
    );

    const filter = sheet.getFilter();
    if (filter) {
      filter.setColumnFilterCriteria(column, criteria);
    } else {
      range.createFilter().setColumnFilterCriteria(column, criteria);
    }
  }

  /**
   * Sort the sheet based on provided sort orders
   */
  static sort<T extends Entry>(
    this: new () => T,
    sortOrders: { column: number; ascending: boolean }[],
  ): void {
    const EntryClass = this as any;
    
    // External entries don't support sorting
    if (SheetService.isExternalEntry(EntryClass._meta.sheetId, EntryClass._meta.spreadsheetId)) {
      throw new Error('Sort operations not supported on external entries');
    }

    const sheet = SheetService.getSheet(EntryClass._meta.sheetId as number);
    const lastRow = sheet.getLastRow();
    const numRows = Math.max(1, lastRow - EntryClass._meta.headerRow);

    const range = sheet.getRange(
      EntryClass._meta.headerRow + 1,
      EntryClass._meta.dataStartColumn,
      numRows,
      EntryClass._meta.dataEndColumn - EntryClass._meta.dataStartColumn + 1,
    );

    range.sort(sortOrders);
  }

  /**
   * Clear all filters from the sheet
   */
  static clearFilters<T extends Entry>(this: new () => T): void {
    const EntryClass = this as any;
    
    // External entries don't support filters
    if (SheetService.isExternalEntry(EntryClass._meta.sheetId, EntryClass._meta.spreadsheetId)) {
      throw new Error('Filter operations not supported on external entries');
    }

    const sheet = SheetService.getSheet(EntryClass._meta.sheetId as number);
    const filter = sheet.getFilter();
    if (filter) {
      filter.remove();
    }
  }

  /**
   * Apply smart filters based on filter row values
   */
  static applySmartFilters<T extends Entry>(
    this: new () => T,
  ): void {
    const EntryClass = this as any;
    
    // External entries don't support filters
    if (SheetService.isExternalEntry(EntryClass._meta.sheetId, EntryClass._meta.spreadsheetId)) {
      throw new Error('Filter operations not supported on external entries');
    }

    const meta = EntryClass._meta;
    if (!meta.filterRow || !meta.filterRange) return;

    const sheet = SheetService.getSheet(meta.sheetId as number);
    const filterRange = sheet.getRange(
      meta.filterRow,
      meta.filterRange.startColumn,
      1,
      meta.filterRange.endColumn - meta.filterRange.startColumn + 1,
    );

    // Check if we should clear filters
    if (meta.clearFiltersCell) {
      const clearValue = sheet.getRange(meta.clearFiltersCell.row, meta.clearFiltersCell.column).getValue();
      if (clearValue === true) {
        EntryClass.clearFilters();
        // Reset the clear checkbox
        sheet.getRange(meta.clearFiltersCell.row, meta.clearFiltersCell.column).setValue(false);
        // clear the filter range values
        filterRange.clearContent();
        return;
      }
    }

    // Get filter row values
    const filterValues = filterRange.getValues()[0];

    // Create or update filter
    const range = sheet.getRange(
      meta.headerRow,
      meta.dataStartColumn,
      Math.max(1, sheet.getLastRow() - (meta.headerRow + 1) + 1),
      meta.dataEndColumn - meta.dataStartColumn + 1,
    );

    const filter = sheet.getFilter() || range.createFilter();

    // Apply filter for each non-empty filter value
    filterValues.forEach((value, index) => {
      if (value) {
        const column = meta.filterRange!.startColumn + index;
        const criteria = SpreadsheetApp.newFilterCriteria()
          .whenTextContains(value.toString())
          .setHiddenValues([""])
          .build();
        filter.setColumnFilterCriteria(column, criteria);
      }
    });
  }

  static getScheduledJobs?(): ScheduledJob[];

  // Add the static method to the base class
  static getMenuItems(): MenuItem[] {
    return [];
  }
}
