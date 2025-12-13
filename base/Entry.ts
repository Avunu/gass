import { FilterCriteria, SheetService, SheetValue } from "../services/SheetService";
import { ScheduledJob } from "../types/jobs";
import { CacheManager } from "./cacheManager";
import { MenuItem } from "./EntryRegistry";
import { getLinkMetadata, createLinkProxy, createLinkArrayProxy, IS_LINK_PROXY } from "./Link";

export interface IEntryMeta {
  sheetId: number;
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
  static readonly CACHE_TIMEOUT = 21600; // 6 hours

  // Add index signature to allow string indexing on derived classes
  [key: string]: SheetValue | unknown;

  public constructor() { }

  // Update createInstance to ensure it's called only on concrete classes
  protected static createInstance<T extends Entry>(this: new () => T): T {
    return new this();
  }

  // Update the static method signatures to include static members in the constraint
  static async get<T extends Entry>(
    this: (new () => T) & { _meta: IEntryMeta; _instances: Map<string, Entry> },
    filters: FilterCriteria,
  ): Promise<T[]> {
    const cachedMatches = Array.from(this._instances.values()).filter((entry) =>
      Object.entries(filters).every(([key, value]) =>
        SheetService.evaluateFilter(entry[key] as SheetValue, value),
      ),
    );

    if (cachedMatches.length > 0) {
      return cachedMatches as T[];
    }

    // Only pass the primary sort column if it exists
    const primarySort = this._meta.defaultSort?.[0];
    const sortInfo = primarySort
      ? {
        columnIndex: this._meta.columns.indexOf(primarySort.column),
        ascending: primarySort.ascending,
      }
      : undefined;

    const rows = await SheetService.getFilteredRows(
      this._meta.sheetId,
      this._meta.headerRow,
      filters,
      this._meta.columns,
      sortInfo ? { sortInfo } : undefined,
    );

    return rows.map((row) => {
      const entry = new this();
      entry.fromRow(row.data, row.rowNumber);
      this._instances.set(entry.getCacheKey(), entry);
      return entry;
    });
  }

  static async getValue<T extends Entry>(
    this: (new () => T) & { _meta: IEntryMeta },
    filters: FilterCriteria,
    column: string,
  ): Promise<SheetValue> {
    const sheet = SheetService.getSheet(this._meta.sheetId);

    // Get column index directly from meta.columns
    const columnIndex = this._meta.columns.indexOf(column);
    if (columnIndex === -1) {
      throw new Error(`Column not found: ${column}`);
    }

    // Map filter keys to their column indices from meta.columns
    const filterIndices = Object.entries(filters).map(([key, value]) => ({
      key,
      index: this._meta.columns.indexOf(key),
      value,
    }));

    const invalidFilters = filterIndices.filter((f) => f.index === -1);
    if (invalidFilters.length > 0) {
      throw new Error(`Columns not found: ${invalidFilters.map((f) => f.key).join(", ")}`);
    }

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    // Skip header row in search
    for (let i = this._meta.headerRow; i < values.length; i++) {
      const row = values[i];
      if (filterIndices.every((f) => row[f.index] === f.value)) {
        return row[columnIndex];
      }
    }

    return null;
  }

  static async getAll<T extends Entry>(
    this: (new () => T) & { _meta: IEntryMeta; _instances: Map<string, Entry> },
  ): Promise<T[]> {
    const rows = await SheetService.getAllRows(this._meta.sheetId);
    return rows.map((row) => {
      const entry = new this();
      entry.fromRow(row.data, row.rowNumber);
      this._instances.set(entry.getCacheKey(), entry);
      return entry;
    });
  }

  abstract getCacheKey(): string;
  abstract validate(): ValidationResult;

  // Add a method to automatically fetch linked objects
  protected async getLinkedObjects(): Promise<boolean> {
    const metadata = getLinkMetadata(this.constructor as new () => Entry);
    let allExist = true;

    for (const link of metadata) {
      const linkValue = (this as any)[link.fieldName] as SheetValue;

      // Skip if the link field is empty
      if (!linkValue) {
        continue;
      }

      // Skip if already fetched (the proxy will be in place)
      const currentValue = (this as any)[link.fieldName];
      if (currentValue?.[IS_LINK_PROXY]) {
        continue;
      }

      try {
        if (link.isArray) {
          // Handle comma-separated array links
          const separator = link.separator || ",";
          const names = String(linkValue).split(separator).map(name => name.trim()).filter(Boolean);
          const linkedObjects: Entry[] = [];

          for (const name of names) {
            const EntryType = link.targetType;
            const targetField = link.targetField || "name";
            const filterCriteria: FilterCriteria = {
              [targetField]: name,
            };
            const results = await (EntryType as any).get(filterCriteria);

            if (results && results.length > 0) {
              linkedObjects.push(results[0]);
            } else {
              // Still track that we couldn't find this one
              allExist = false;
            }
          }

          // Create array proxy even if some objects weren't found
          const proxy = createLinkArrayProxy(
            this,
            link.fieldName,
            String(linkValue),
            linkedObjects,
            separator
          );

          // Replace the field value with the proxy
          (this as any)[link.fieldName] = proxy;
        } else {
          // Handle single link
          const EntryType = link.targetType;
          const targetField = link.targetField || "name";
          const filterCriteria: FilterCriteria = {
            [targetField]: linkValue,
          };
          const results = await (EntryType as any).get(filterCriteria);

          const linkedObject = results && results.length > 0 ? results[0] : null;
          
          if (!linkedObject) {
            allExist = false;
          }

          // Create a proxy that acts as both string and object
          const proxy = createLinkProxy(
            this,
            link.fieldName,
            String(linkValue),
            linkedObject
          );

          // Replace the field value with the proxy
          (this as any)[link.fieldName] = proxy;
        }
      } catch (error) {
        console.error(
          `Error fetching linked object for ${link.fieldName}:`,
          error
        );
        allExist = false;
      }
    }

    return allExist;
  }

  protected beforeSave(): void { }
  protected afterSave(): void { }
  protected beforeUpdate(): void { }
  protected afterUpdate(): void { }
  protected beforeDelete(): void { }
  protected afterDelete(): void { }

  public markDirty(): void {
    this._isDirty = true;
  }

  async save(): Promise<void> {
    if (!this._isDirty) return;

    const validation = this.validate();
    if (!validation.isValid) {
      const errorMessage = validation.errors.join(", ");
      SpreadsheetApp.getActiveSpreadsheet().toast(errorMessage, "Validation Error", -1);
      throw new Error(`Validation failed: ${errorMessage}`);
    }

    const EntryClass = this.constructor as (new () => Entry) & {
      _meta: IEntryMeta;
      sort(orders: { column: number; ascending: boolean }[]): void;
    };

    if (this._isNew) {
      await this.beforeSave();
      // Save the row with any changes made during beforeSave
      await SheetService.appendRow(EntryClass._meta.sheetId, this.toRow());
      await this.afterSave();
    } else {
      await this.beforeUpdate();
      // Allow beforeUpdate to modify values before saving
      await this.beforeSave();
      // Save the row with any changes made during hooks
      await SheetService.updateRow(EntryClass._meta.sheetId, this._row, this.toRow());
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

    await this.beforeDelete();
    await SheetService.deleteRow((this.constructor as typeof Entry)._meta.sheetId, this._row);
    (this.constructor as typeof Entry as typeof Entry)._instances.delete(this.getCacheKey());
    await this.afterDelete();
  }

  protected toRow(): SheetValue[] {
    const meta = (this.constructor as typeof Entry)._meta;

    // map data in order of columns array
    return meta.columns.map((col) => {
      // Check if property exists in the object or its prototype chain
      if (!(col in this)) {
        // Return undefined/null for missing optional properties instead of throwing
        return null;
      }
      const value = this[col];
      
      // Convert proxy back to string value for storage
      if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        // Check if it's a link proxy using the symbol
        if ((value as any)[IS_LINK_PROXY]) {
          return value.toString();
        }
      }
      
      // Convert undefined to null for sheet compatibility
      return value === undefined ? null : (value as SheetValue);
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
    const dirtyEntries = entries.filter((entry) => entry._isDirty);
    if (dirtyEntries.length === 0) return;

    const newEntries = dirtyEntries.filter((entry) => entry._isNew);
    const existingEntries = dirtyEntries.filter((entry) => !entry._isNew);

    // Handle new entries in batch
    if (newEntries.length > 0) {
      const newRows = newEntries.map((entry) => entry.toRow());
      await SheetService.appendRows(this._meta.sheetId, newRows);
    }

    // Handle updates in batch
    if (existingEntries.length > 0) {
      const updates = existingEntries.map((entry) => ({
        row: entry._row,
        values: entry.toRow(),
      }));
      await SheetService.updateRows(this._meta.sheetId, updates);
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
    data: Array<{ [key: string]: SheetValue }> | T[],
    options: { prepend?: boolean } = {}
  ): Promise<T[]> {
    if (data.length === 0) return [];

    let entries: T[];

    // Check if we received Entry instances or plain data objects
    if (data[0] instanceof Entry) {
      // We have Entry instances - use them directly
      entries = data as T[];

      // Ensure all entries are marked as new and dirty
      entries.forEach(entry => {
        entry._isNew = true;
        entry._isDirty = true;
      });
    } else {
      // We have plain data objects - create Entry instances
      entries = [];
      const dataObjects = data as Array<{ [key: string]: SheetValue }>;

      for (const dataObj of dataObjects) {
        const entry = new this();

        // Set properties from data object
        this._meta.columns.forEach((column) => {
          if (dataObj.hasOwnProperty(column)) {
            (entry as any)[column] = dataObj[column];
          }
        });

        // Mark as new and dirty
        entry._isNew = true;
        entry._isDirty = true;

        entries.push(entry);
      }
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

    // Perform batch insert (prepend or append based on options)
    if (options.prepend) {
      await SheetService.prependRows(this._meta.sheetId, rows);
    } else {
      await SheetService.appendRows(this._meta.sheetId, rows);
    }

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
    this: (new () => T) & { _meta: IEntryMeta },
    criteria: GoogleAppsScript.Spreadsheet.FilterCriteria,
    column: number,
  ): void {
    const sheet = SheetService.getSheet(this._meta.sheetId);
    const range = sheet.getRange(
      this._meta.headerRow,
      this._meta.dataStartColumn,
      sheet.getLastRow() - this._meta.headerRow,
      this._meta.dataEndColumn - this._meta.dataStartColumn + 1,
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
    this: (new () => T) & { _meta: IEntryMeta },
    sortOrders: { column: number; ascending: boolean }[],
  ): void {
    const sheet = SheetService.getSheet(this._meta.sheetId);
    const lastRow = sheet.getLastRow();
    const numRows = Math.max(1, lastRow - this._meta.headerRow);

    const range = sheet.getRange(
      this._meta.headerRow + 1,
      this._meta.dataStartColumn,
      numRows,
      this._meta.dataEndColumn - this._meta.dataStartColumn + 1,
    );

    range.sort(sortOrders);
  }

  /**
   * Clear all filters from the sheet
   */
  static clearFilters<T extends Entry>(this: (new () => T) & { _meta: IEntryMeta }): void {
    const sheet = SheetService.getSheet(this._meta.sheetId);
    const filter = sheet.getFilter();
    if (filter) {
      filter.remove();
    }
  }

  /**
   * Apply smart filters based on filter row values
   */
  static applySmartFilters<T extends Entry>(
    this: (new () => T) & {
      _meta: IEntryMeta;
      clearFilters(): void;
    },
  ): void {
    const meta = this._meta;
    if (!meta.filterRow || !meta.filterRange) return;

    const sheet = SheetService.getSheet(meta.sheetId);
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
        this.clearFilters();
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
