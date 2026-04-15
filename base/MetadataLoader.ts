/**
 * Entry metadata interface with field-level validation rules
 * and JSON-LD relationship definitions
 */
export interface IEntryMeta {
  sheetId: number;
  columns: string[];
  defaultSort?: {
    column: string;
    ascending: boolean;
  }[];
  "@context"?: {
    "@vocab"?: string;
    [key: string]: any;
  };
  fields?: {
    [fieldName: string]: FieldDef;
  };
}

export interface FieldDef {
  type?: "string" | "number" | "integer" | "boolean" | "null" | "array" | "object";
  format?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  enum?: any[];
  default?: any;
  description?: string;
  // JSON-LD relationship properties
  "@type"?: "Link" | "LinkArray";
  "@id"?: string; // Target Entry class name
  targetField?: string; // Field on target Entry to match against
  separator?: string; // For LinkArray types
}

/**
 * Load and validate metadata from a JSON object
 * @param metadata - The metadata object to validate
 * @returns Validated metadata
 * @throws Error if validation fails
 */
export function loadFromObject(metadata: any): IEntryMeta {
  // Strip $schema property if present (it's for IDE support, not part of metadata)
  const { $schema: _$schema, "@context": _context, ...rest } = metadata;

  if (typeof rest.sheetId !== "number") {
    throw new Error("Metadata validation failed: sheetId must be a number");
  }
  if (!Array.isArray(rest.columns) || rest.columns.length === 0) {
    throw new Error("Metadata validation failed: columns must be a non-empty array");
  }

  const validatedMeta: IEntryMeta = rest;
  if (_context) validatedMeta["@context"] = _context;

  // Ensure defaultSort columns exist in columns array
  if (validatedMeta.defaultSort) {
    for (const sort of validatedMeta.defaultSort) {
      if (!validatedMeta.columns.includes(sort.column)) {
        throw new Error(`Default sort column "${sort.column}" not found in columns array`);
      }
    }
  }

  return validatedMeta;
}

/**
 * Validate a single field value against its schema definition
 */
function validateField(
  fieldName: string,
  value: unknown,
  def: FieldDef,
  errors: string[],
): void {
  // Check type
  if (def.type) {
    const actualType = typeof value;
    switch (def.type) {
      case "string":
        if (actualType !== "string") {
          errors.push(`${fieldName}: must be string`);
          return;
        }
        break;
      case "number":
        if (actualType !== "number" || Number.isNaN(value)) {
          errors.push(`${fieldName}: must be number`);
          return;
        }
        break;
      case "integer":
        if (actualType !== "number" || !Number.isInteger(value)) {
          errors.push(`${fieldName}: must be integer`);
          return;
        }
        break;
      case "boolean":
        if (actualType !== "boolean") {
          errors.push(`${fieldName}: must be boolean`);
          return;
        }
        break;
      case "array":
        if (!Array.isArray(value)) {
          errors.push(`${fieldName}: must be array`);
          return;
        }
        break;
      case "object":
        if (actualType !== "object" || value === null || Array.isArray(value)) {
          errors.push(`${fieldName}: must be object`);
          return;
        }
        break;
      // "null" type is checked via required
    }
  }

  // String constraints
  if (typeof value === "string") {
    if (def.minLength !== undefined && value.length < def.minLength) {
      errors.push(`${fieldName}: must NOT have fewer than ${def.minLength} characters`);
    }
    if (def.maxLength !== undefined && value.length > def.maxLength) {
      errors.push(`${fieldName}: must NOT have more than ${def.maxLength} characters`);
    }
    if (def.pattern !== undefined && !new RegExp(def.pattern).test(value)) {
      errors.push(`${fieldName}: must match pattern "${def.pattern}"`);
    }
  }

  // Numeric constraints
  if (typeof value === "number") {
    if (def.minimum !== undefined && value < def.minimum) {
      errors.push(`${fieldName}: must be >= ${def.minimum}`);
    }
    if (def.maximum !== undefined && value > def.maximum) {
      errors.push(`${fieldName}: must be <= ${def.maximum}`);
    }
  }

  // Enum constraint
  if (def.enum !== undefined && !def.enum.includes(value)) {
    errors.push(`${fieldName}: must be one of ${JSON.stringify(def.enum)}`);
  }
}

/**
 * Validate entry data against the metadata field definitions
 * @param data - The entry data to validate
 * @param metadata - The entry metadata with field definitions
 * @returns Validation result with errors
 */
export function validateData(
  data: { [key: string]: any },
  metadata: IEntryMeta,
): { isValid: boolean; errors: string[] } {
  if (!metadata.fields || Object.keys(metadata.fields).length === 0) {
    return { isValid: true, errors: [] };
  }

  const errors: string[] = [];

  for (const [fieldName, def] of Object.entries(metadata.fields)) {
    const value = data[fieldName];

    // Check required
    if (def.required && (value === undefined || value === null || value === "")) {
      errors.push(`${fieldName}: is required`);
      continue;
    }

    // Skip further checks if value is absent and not required
    if (value === undefined || value === null || value === "") continue;

    validateField(fieldName, value, def, errors);
  }

  return errors.length > 0 ? { isValid: false, errors } : { isValid: true, errors: [] };
}

/**
 * Extract JSON-LD relationship information from metadata
 * @param metadata - The entry metadata with JSON-LD definitions
 * @returns Map of field names to their relationship definitions
 */
export function getRelationships(
  metadata: IEntryMeta,
): Map<string, { type: "Link" | "LinkArray"; targetClass: string; targetField: string; separator?: string }> {
  const relationships = new Map();

  if (!metadata.fields) {
    return relationships;
  }

  for (const [fieldName, fieldDef] of Object.entries(metadata.fields)) {
    // Check if this field has JSON-LD relationship annotations
    if (fieldDef["@type"] && fieldDef["@id"]) {
      relationships.set(fieldName, {
        type: fieldDef["@type"],
        targetClass: fieldDef["@id"],
        targetField: fieldDef.targetField || "name",
        separator: fieldDef.separator,
      });
    }
  }

  return relationships;
}
