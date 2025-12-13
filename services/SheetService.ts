export type SheetValue = string | number | boolean | Date | null;
export type { RowResult, FilterValue, FilterCriteria };

interface RowResult {
  data: SheetValue[];
  rowNumber: number;
}

interface SortSpec {
  column: number;
  ascending: boolean;
}

type FilterOperator = "$exists" | "$lt" | "$gt" | "$lte" | "$gte" | "$eq" | "$between" | "$contains";

type FilterValue =
  | {
      [key in FilterOperator]?: key extends "$between" ? [SheetValue, SheetValue] : SheetValue;
    }
  | SheetValue;

type FilterCriteria = {
  [key: string]: FilterValue;
};

interface SortInfo {
  columnIndex: number;
  ascending: boolean;
}

interface FilterOptions {
  sortInfo?: SortInfo;
}

export class SheetService {
  private static sheetCache = new Map<number, GoogleAppsScript.Spreadsheet.Sheet>();

  static getSheet(sheetId: number): GoogleAppsScript.Spreadsheet.Sheet {
    if (this.sheetCache.has(sheetId)) {
      return this.sheetCache.get(sheetId)!;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheets().find((s) => s.getSheetId() === sheetId);
    if (!sheet) {
      throw new Error(`Sheet with ID ${sheetId} not found`);
    }

    this.sheetCache.set(sheetId, sheet);
    return sheet;
  }

  private static getLastRowNumber(sheet: GoogleAppsScript.Spreadsheet.Sheet): number {
    // Get all values in first column
    const range = sheet.getRange("A:A");
    const values = range.getValues();

    // Start from the bottom and work up
    let lastRow = values.length;
    while (lastRow > 0 && !values[lastRow - 1][0]) {
      lastRow--;
    }

    // Sanity check - if we can't find data this way, try getLastRow
    if (lastRow === 0) {
      lastRow = sheet.getLastRow();
    }

    return lastRow;
  }

  static async getAllRows(sheetId: number): Promise<RowResult[]> {
    const sheet = this.getSheet(sheetId);
    const lastRow = this.getLastRowNumber(sheet);
    const lastColumn = sheet.getLastColumn();

    if (lastRow === 0) {
      return [];
    }

    const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();

    return values.map((row, index) => ({
      data: row.map((cell) => this.convertFromSheet(cell)),
      rowNumber: index + 1, // This was wrong - it should be actual sheet row number
    }));
  }

  private static convertFromSheet(value: SheetValue): SheetValue {
    // Check if the value is a Google Sheets date (they are stored as Date objects)
    if (value instanceof Date) {
      // Create a new JS Date object from the sheet date
      return new Date(value.getTime());
    }
    return value;
  }

  private static convertToSheet(value: SheetValue): SheetValue {
    // Convert JS Date objects to sheet-compatible format
    if (value instanceof Date) {
      // Create a new date at midnight in the local timezone to avoid timezone shifts
      // This ensures the date stays the same when saved to the sheet
      const localDate = new Date(value.getFullYear(), value.getMonth(), value.getDate());
      return localDate;
    }
    return value;
  }

  static async appendRow(sheetId: number, rowData: SheetValue[]): Promise<void> {
    const sheet = this.getSheet(sheetId);
    sheet.appendRow(rowData.map((value) => this.convertToSheet(value)));
  }

  static async appendRows(sheetId: number, rows: SheetValue[][]): Promise<void> {
    const sheet = this.getSheet(sheetId);
    const range = sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length);
    range.setValues(rows.map((row) => row.map((value) => this.convertToSheet(value))));
  }

  static async prependRows(sheetId: number, rows: SheetValue[][]): Promise<void> {
    const sheet = this.getSheet(sheetId);
    
    if (rows.length === 0) return;
    
    // Insert rows after the header row (row 2)
    const insertPosition = 2;
    
    // Insert empty rows first
    sheet.insertRowsAfter(1, rows.length);
    
    // Set the values in the newly inserted rows
    const range = sheet.getRange(insertPosition, 1, rows.length, rows[0].length);
    range.setValues(rows.map((row) => row.map((value) => this.convertToSheet(value))));
  }

  static async updateRow(sheetId: number, rowNumber: number, rowData: SheetValue[]): Promise<void> {
    const sheet = this.getSheet(sheetId);
    const range = sheet.getRange(rowNumber, 1, 1, rowData.length);
    range.setValues([rowData.map((value) => this.convertToSheet(value))]);
  }

  static async updateRows(sheetId: number, updates: { row: number; values: SheetValue[] }[]): Promise<void> {
    const sheet = this.getSheet(sheetId);

    // Group updates by consecutive rows for better performance
    updates.sort((a, b) => a.row - b.row);
    const chunks: { row: number; values: SheetValue[] }[][] = [];
    let currentChunk: { row: number; values: SheetValue[] }[] = [];

    updates.forEach((update) => {
      if (currentChunk.length === 0 || update.row === currentChunk[currentChunk.length - 1].row + 1) {
        currentChunk.push(update);
      } else {
        chunks.push(currentChunk);
        currentChunk = [update];
      }
    });
    if (currentChunk.length > 0) chunks.push(currentChunk);

    // Process each chunk as a single operation
    for (const chunk of chunks) {
      const range = sheet.getRange(chunk[0].row, 1, chunk.length, chunk[0].values.length);
      range.setValues(chunk.map((u) => u.values.map((value) => this.convertToSheet(value))));
    }
  }

  static async deleteRow(sheetId: number, rowNumber: number): Promise<void> {
    const sheet = this.getSheet(sheetId);
    sheet.deleteRow(rowNumber);
  }

  static async replaceAllValues(sheetId: number, newValues: any[][]): Promise<void> {
    const sheet = this.getSheet(sheetId);
    
    if (newValues.length === 0) {
      // Clear the sheet if no new values provided
      sheet.clear();
      return;
    }

    // Clear existing content first
    const currentLastRow = sheet.getLastRow();
    const currentLastColumn = sheet.getLastColumn();
    
    if (currentLastRow > 0 && currentLastColumn > 0) {
      sheet.getRange(1, 1, currentLastRow, currentLastColumn).clear();
    }

    // Set new values
    const numRows = newValues.length;
    const numColumns = Math.max(...newValues.map(row => row.length));
    
    if (numRows > 0 && numColumns > 0) {
      // Pad rows to ensure consistent column count
      const paddedValues = newValues.map(row => {
        const paddedRow = [...row];
        while (paddedRow.length < numColumns) {
          paddedRow.push("");
        }
        return paddedRow.map(value => this.convertToSheet(value));
      });

      const range = sheet.getRange(1, 1, numRows, numColumns);
      range.setValues(paddedValues);
    }
    Logger.log(`Replaced all values in sheet ID ${sheetId} with ${newValues.length} rows.`);
  }

  static async sortSheet(sheetId: number, sortOrders: SortSpec[]): Promise<void> {
    const sheet = this.getSheet(sheetId);
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();

    const range = sheet.getRange(1, 1, lastRow, lastColumn);
    range.sort(sortOrders);
  }

  static applyFilter(
    sheetId: number,
    criteria: { column: number; criteria: GoogleAppsScript.Spreadsheet.FilterCriteria },
  ): void {
    const sheet = this.getSheet(sheetId);
    const lastRow = this.getLastRowNumber(sheet);
    if (lastRow < 1) return;

    const filter = sheet.getFilter();
    if (filter) {
      filter.setColumnFilterCriteria(criteria.column, criteria.criteria);
    } else {
      const range = sheet.getRange(1, 1, lastRow, sheet.getLastColumn());
      range.createFilter().setColumnFilterCriteria(criteria.column, criteria.criteria);
    }
  }

  static clearFilterRow(sheetId: number, range: string): void {
    const sheet = this.getSheet(sheetId);
    sheet.getRange(range).clearContent();
  }

  static buildFilterCriteria(
    type: "equals" | "contains" | "greater" | "less",
    value: SheetValue,
  ): GoogleAppsScript.Spreadsheet.FilterCriteria {
    if (value == null) {
      throw new Error("Filter value cannot be null or undefined");
    }
    const builder = SpreadsheetApp.newFilterCriteria();
    switch (type) {
      case "equals":
        if (typeof value === "number") {
          return builder.whenNumberEqualTo(value).build();
        }
        return builder.whenTextEqualTo(String(value)).build();
      case "contains":
        return builder.whenTextContains(String(value)).build();
      case "greater":
        if (typeof value !== "number") {
          throw new Error("Greater than filter requires a number value");
        }
        return builder.whenNumberGreaterThan(value).build();
      case "less":
        if (typeof value !== "number") {
          throw new Error("Less than filter requires a number value");
        }
        return builder.whenNumberLessThan(value).build();
      default:
        throw new Error(`Unsupported filter type: ${type}`);
    }
  }

  static evaluateFilter(value: SheetValue, filterValue: FilterValue): boolean {
    if (filterValue === null || typeof filterValue !== "object") {
      return value === filterValue;
    }

    // Handle $exists operator specially - before the null check
    if ("$exists" in filterValue) {
      const shouldExist = filterValue.$exists;
      const exists = value !== null && value !== undefined && value !== "";
      return shouldExist ? exists : !exists;
    }

    // For other operators, treat empty string as null
    if (value === "") {
      value = null;
    }

    if (value == null) {
      return false;
    }

    // Handle compound filters - all conditions must be true
    const result = Object.entries(filterValue).every(([operator, compareValue]) => {
      const opResult = (() => {
        switch (operator) {
          case "$lt":
            return value < compareValue;
          case "$lte":
            return value <= compareValue;
          case "$gt":
            return value > compareValue;
          case "$gte":
            return value >= compareValue;
          case "$eq":
            return value === compareValue;
          case "$between":
            if (!Array.isArray(compareValue) || compareValue.length !== 2) {
              throw new Error("$between operator requires an array of [min, max]");
            }
            return value >= compareValue[0] && value <= compareValue[1];
          case "$contains":
            // Convert both to strings and check if value contains the compareValue
            return String(value).toLowerCase().includes(String(compareValue).toLowerCase());
          default:
            return value === filterValue; // Treat as direct comparison
        }
      })();
      return opResult;
    });

    return result;
  }

  static async getFilteredRows(
    sheetId: number,
    headerRow: number,
    filters: FilterCriteria,
    columnMap: string[],
    options?: FilterOptions,
  ): Promise<RowResult[]> {
    const sheet = this.getSheet(sheetId);
    const lastRow = this.getLastRowNumber(sheet);

    if (lastRow <= headerRow) {
      return [];
    }

    // Map filter keys to column indices
    const filterIndices = Object.entries(filters).map(([key, value]) => ({
      key,
      index: columnMap.indexOf(key),
      value,
    }));

    // Validate all filter columns exist
    const invalidFilters = filterIndices.filter((f) => f.index === -1);
    if (invalidFilters.length > 0) {
      throw new Error(`Columns not found: ${invalidFilters.map((f) => f.key).join(", ")}`);
    }

    // Phase 1: Check for sorted range optimization
    let rowRange: { minRow: number; maxRow: number } | null = null;
    const { sortInfo } = options || {};

    if (sortInfo) {
      const rangeFilter = filterIndices.find((f) => {
        const matchesColumn = f.index === sortInfo.columnIndex;
        const hasRangeOperator =
          f.value !== null &&
          typeof f.value === "object" &&
          ("$between" in f.value ||
            "$gt" in f.value ||
            "$lt" in f.value ||
            "$gte" in f.value ||
            "$lte" in f.value ||
            "$eq" in f.value);

        return matchesColumn && f.value !== null && (hasRangeOperator || typeof f.value !== "object");
      });

      if (rangeFilter) {
        rowRange = await this.getSortedRangeFilteredRows(
          sheet,
          headerRow,
          lastRow,
          rangeFilter,
          sortInfo.ascending,
        );

        // If no rows match the range filter or this was the only filter
        if (rowRange.minRow === -1 || filterIndices.length === 1) {
          if (rowRange.minRow === -1) return [];

          const rangeData = sheet
            .getRange(rowRange.minRow, 1, rowRange.maxRow - rowRange.minRow + 1, columnMap.length)
            .getValues();

          return rangeData.map((row, i) => ({
            data: row.map((cell) => this.convertFromSheet(cell)),
            rowNumber: rowRange!.minRow + i, // This is where we're losing the actual row numbers
          }));
        }

        // Remove this filter since it's been handled
        filterIndices.splice(filterIndices.indexOf(rangeFilter), 1);
      }
    }

    // Phase 2: Batch process remaining filters
    const uniqueFilterColumns = [...new Set(filterIndices.map((f) => f.index))];
    const filterValues: { [col: number]: SheetValue[] } = {};

    // Get all needed column values in as few operations as possible
    for (const colIndex of uniqueFilterColumns) {
      let range;
      if (rowRange) {
        // Only get values within the sorted range
        range = sheet.getRange(rowRange.minRow, colIndex + 1, rowRange.maxRow - rowRange.minRow + 1, 1);
      } else {
        // Get values for the entire sheet
        range = sheet.getRange(headerRow + 1, colIndex + 1, lastRow - headerRow, 1);
      }
      filterValues[colIndex] = range.getValues().map((row) => this.convertFromSheet(row[0]));
    }

    // Find matching row numbers
    const matchingRowNumbers: number[] = [];
    const startRow = rowRange ? rowRange.minRow : headerRow + 1;
    const endRow = rowRange ? rowRange.maxRow : lastRow;

    for (let i = 0; i < endRow - startRow + 1; i++) {
      let allFiltersMatch = true;

      // Check all filters for this row
      for (const filter of filterIndices) {
        const value = filterValues[filter.index][i];
        const filterValue = filter.value;

        // Log each filter evaluation

        if (!this.evaluateFilter(value, filterValue)) {
          allFiltersMatch = false;
          break;
        }
      }

      if (allFiltersMatch) {
        matchingRowNumbers.push(startRow + i);
      }
    }

    if (matchingRowNumbers.length === 0) {
      return [];
    }

    // Phase 3: Efficient range retrieval of results
    // Group consecutive row numbers
    const ranges: { start: number; count: number; originalRows: number[] }[] = [];
    let currentRange = { start: matchingRowNumbers[0], count: 1, originalRows: [matchingRowNumbers[0]] };

    for (let i = 1; i < matchingRowNumbers.length; i++) {
      if (matchingRowNumbers[i] === matchingRowNumbers[i - 1] + 1) {
        currentRange.count++;
        currentRange.originalRows.push(matchingRowNumbers[i]);
      } else {
        ranges.push(currentRange);
        currentRange = {
          start: matchingRowNumbers[i],
          count: 1,
          originalRows: [matchingRowNumbers[i]],
        };
      }
    }
    ranges.push(currentRange);

    // Fetch complete rows for matches in minimal operations
    const matches: RowResult[] = [];
    for (const range of ranges) {
      const values = sheet.getRange(range.start, 1, range.count, columnMap.length).getValues();

      for (let i = 0; i < values.length; i++) {
        matches.push({
          data: values[i].map((cell) => this.convertFromSheet(cell)),
          rowNumber: range.originalRows[i], // Use the actual row number we found
        });
      }
    }

    return matches;
  }

  private static encodeStringToUint8(str: string): Uint8Array {
    return new Uint8Array([...String(str).toUpperCase()].map((c) => c.charCodeAt(0)));
  }

  private static async getSortedRangeFilteredRows(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    headerRow: number,
    lastRow: number,
    rangeFilter: { index: number; value: FilterValue },
    ascending: boolean,
  ): Promise<{ minRow: number; maxRow: number }> {
    let min: SheetValue | Uint8Array = -Infinity;
    let max: SheetValue | Uint8Array = Infinity;
    const filterValue = rangeFilter.value;

    // Determine if we have a single-sided comparison
    let isLowerBoundOnly = false; // gt, gte
    let isUpperBoundOnly = false; // lt, lte

    // Extract min/max from filter value
    if (filterValue === null || typeof filterValue !== "object") {
      min = max = filterValue;
    } else if ("$eq" in filterValue && filterValue.$eq !== undefined) {
      min = max = filterValue.$eq;
    } else if ("$between" in filterValue && Array.isArray(filterValue.$between)) {
      [min, max] = filterValue.$between;
    } else {
      // Check for single-sided filters
      if (
        ("$gt" in filterValue && filterValue.$gt !== undefined) ||
        ("$gte" in filterValue && filterValue.$gte !== undefined)
      ) {
        if (!("$lt" in filterValue) && !("$lte" in filterValue)) {
          isLowerBoundOnly = true;
        }
      }

      if (
        ("$lt" in filterValue && filterValue.$lt !== undefined) ||
        ("$lte" in filterValue && filterValue.$lte !== undefined)
      ) {
        if (!("$gt" in filterValue) && !("$gte" in filterValue)) {
          isUpperBoundOnly = true;
        }
      }

      // Set the range values
      if ("$gt" in filterValue && filterValue.$gt !== undefined) min = filterValue.$gt;
      if ("$gte" in filterValue && filterValue.$gte !== undefined) min = filterValue.$gte;
      if ("$lt" in filterValue && filterValue.$lt !== undefined) max = filterValue.$lt;
      if ("$lte" in filterValue && filterValue.$lte !== undefined) max = filterValue.$lte;
    }

    const numRows = lastRow - headerRow;
    if (numRows <= 0) return { minRow: -1, maxRow: -1 };

    const isStringComparison = typeof min === "string" || typeof max === "string";

    // Pre-encode if string comparison
    if (isStringComparison) {
      if (typeof min === "string") min = this.encodeStringToUint8(min);
      if (typeof max === "string") max = this.encodeStringToUint8(max);
    }

    // Get column values
    const values = sheet
      .getRange(headerRow + 1, rangeFilter.index + 1, numRows, 1)
      .getValues()
      .map((row, index) => {
        let value = row[0];
        if (value === "") value = null; // Handle empty strings consistently
        if (isStringComparison && value !== null) {
          // Convert to Uint8Array for string comparison
          value = this.encodeStringToUint8(String(value));
        } else if (value instanceof Date) {
          // Convert date to timestamp for easy comparison
          value = new Date(value.getTime());
        }
        return { value, rowNumber: headerRow + index + 1 };
      });

    if (!ascending) values.reverse();

    // Optimize: Only find the boundaries we need
    let minBound = 0; // Default to first element
    let maxBound = values.length - 1; // Default to last element

    if (!isUpperBoundOnly) {
      minBound = this.findRangeBound(values, min, true, isStringComparison);

      // Fix the boundary condition check
      if (minBound >= values.length) {
        return { minRow: -1, maxRow: -1 };
      }
    }

    if (!isLowerBoundOnly) {
      maxBound = this.findRangeBound(values, max, false, isStringComparison);
    }

    // Validate bounds
    if (minBound === -1 || maxBound === -1 || minBound > maxBound) {
      return { minRow: -1, maxRow: -1 };
    }

    const result = ascending
      ? { minRow: values[minBound].rowNumber, maxRow: values[maxBound].rowNumber }
      : { minRow: values[maxBound].rowNumber, maxRow: values[minBound].rowNumber };

    return result;
  }

  private static findRangeBound(
    values: Array<{ value: SheetValue | Uint8Array; rowNumber: number }>,
    target: SheetValue | Uint8Array,
    findLower: boolean,
    isStringComparison: boolean,
  ): number {
    if (values.length === 0) return -1;

    let left = 0,
      right = values.length - 1;
    let result = -1; // Initialize as not found

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const cmp = isStringComparison
        ? this.compareUint8Arrays(target as Uint8Array, values[mid].value as Uint8Array)
        : this.compareValues(target as SheetValue, values[mid].value as SheetValue);

      if (cmp === 0) {
        result = mid;
        if (findLower) {
          right = mid - 1; // Keep searching left for first occurrence
        } else {
          left = mid + 1; // Keep searching right for last occurrence
        }
      } else if (cmp < 0) {
        right = mid - 1; // Search left half
      } else {
        left = mid + 1; // Search right half
      }
    }

    // If we didn't find an exact match, use the insertion point
    if (result === -1) {
      result = findLower ? left : right;
    }

    // Ensure result is within bounds
    if (result < 0) result = 0;
    if (result >= values.length) result = values.length - 1;

    return result;
  }

  private static compareUint8Arrays(target: Uint8Array, value: Uint8Array): number {
    const len = Math.min(target.length, value.length);
    for (let i = 0; i < len; i++) {
      if (target[i] !== value[i]) return target[i] - value[i];
    }
    return target.length - value.length;
  }

  private static compareValues(a: SheetValue, b: SheetValue): number {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return a < b ? -1 : 1;
  }
}
