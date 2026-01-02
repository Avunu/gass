import Ajv, { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import entryMetaSchema from "../types/entry-meta.schema.json";

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
    [fieldName: string]: {
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
    };
  };
}

/**
 * MetadataLoader handles loading and validating Entry metadata from JSON files
 */
export class MetadataLoader {
  private static ajv: Ajv;
  private static metadataValidator: ValidateFunction;
  private static initialized = false;

  /**
   * Initialize the AJV validator with the entry metadata schema
   */
  private static init(): void {
    if (this.initialized) return;

    // Initialize AJV with strict mode and all errors
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: true,
      strictTypes: false,
      allowUnionTypes: true,
      validateFormats: true,
    });

    // Add format validators (email, date, uri, etc.)
    addFormats(this.ajv);

    // Compile the entry metadata schema
    this.metadataValidator = this.ajv.compile(entryMetaSchema);

    this.initialized = true;
  }

  /**
   * Load and validate metadata from a JSON object
   * @param metadata - The metadata object to validate
   * @returns Validated metadata
   * @throws Error if validation fails
   */
  static loadFromObject(metadata: any): IEntryMeta {
    this.init();

    // Strip $schema property if present (it's for IDE support, not part of metadata)
    const { $schema, ...metadataToValidate } = metadata;

    // Validate against schema
    const valid = this.metadataValidator(metadataToValidate);
    if (!valid) {
      const errors = this.metadataValidator.errors
        ?.map((err) => `${err.instancePath} ${err.message}`)
        .join("; ");
      throw new Error(`Metadata validation failed: ${errors}`);
    }

    // At this point, we know metadata conforms to IEntryMeta
    const validatedMeta = metadataToValidate as IEntryMeta;

    // Additional validation: ensure defaultSort columns exist in columns array
    if (validatedMeta.defaultSort) {
      for (const sort of validatedMeta.defaultSort) {
        if (!validatedMeta.columns.includes(sort.column)) {
          throw new Error(
            `Default sort column "${sort.column}" not found in columns array`
          );
        }
      }
    }

    return validatedMeta;
  }

  // /**
  //  * Load metadata from a JSON file path (for Node.js/testing environments)
  //  * Note: This won't work in Apps Script environment, use loadFromObject instead
  //  * @param filePath - Path to the JSON metadata file
  //  * @returns Validated metadata
  //  */
  // static loadFromFile(filePath: string): IEntryMetaExtended {
  //   // This is for testing/development environments only
  //   // In Apps Script, metadata should be imported as modules
  //   try {
  //     const fs = require("fs");
  //     const content = fs.readFileSync(filePath, "utf-8");
  //     const metadata = JSON.parse(content);
  //     return this.loadFromObject(metadata);
  //   } catch (error) {
  //     throw new Error(`Failed to load metadata from file ${filePath}: ${error}`);
  //   }
  // }

  /**
   * Create a data validator for Entry instances based on field definitions
   * @param metadata - The entry metadata with field definitions
   * @returns AJV validate function for entry data
   */
  static createDataValidator(metadata: IEntryMeta): ValidateFunction | null {
    this.init();

    // If no field definitions, return null
    if (!metadata.fields || Object.keys(metadata.fields).length === 0) {
      return null;
    }

    // Build a JSON Schema for the entry data
    const dataSchema: any = {
      type: "object",
      properties: {},
      required: [],
    };

    // Build properties and required fields from metadata.fields
    for (const [fieldName, fieldDef] of Object.entries(metadata.fields)) {
      const property: any = {};

      if (fieldDef.type) {
        property.type = fieldDef.type;
      }
      if (fieldDef.format) {
        property.format = fieldDef.format;
      }
      if (fieldDef.minLength !== undefined) {
        property.minLength = fieldDef.minLength;
      }
      if (fieldDef.maxLength !== undefined) {
        property.maxLength = fieldDef.maxLength;
      }
      if (fieldDef.minimum !== undefined) {
        property.minimum = fieldDef.minimum;
      }
      if (fieldDef.maximum !== undefined) {
        property.maximum = fieldDef.maximum;
      }
      if (fieldDef.pattern) {
        property.pattern = fieldDef.pattern;
      }
      if (fieldDef.enum) {
        property.enum = fieldDef.enum;
      }
      if (fieldDef.description) {
        property.description = fieldDef.description;
      }

      dataSchema.properties[fieldName] = property;

      if (fieldDef.required) {
        dataSchema.required.push(fieldName);
      }
    }

    // Compile and return the validator
    return this.ajv.compile(dataSchema);
  }

  /**
   * Validate entry data against the metadata field definitions
   * @param data - The entry data to validate
   * @param metadata - The entry metadata with field definitions
   * @returns Validation result with errors
   */
  static validateData(
    data: { [key: string]: any },
    metadata: IEntryMeta
  ): { isValid: boolean; errors: string[] } {
    const validator = this.createDataValidator(metadata);

    // If no validator, no field-level validation is defined
    if (!validator) {
      return { isValid: true, errors: [] };
    }

    const valid = validator(data);
    if (!valid) {
      const errors =
        validator.errors?.map((err) => {
          const field = err.instancePath.replace(/^\//, "") || err.params?.missingProperty || "";
          return `${field}: ${err.message}`;
        }) || [];
      return { isValid: false, errors };
    }

    return { isValid: true, errors: [] };
  }

  /**
   * Extract JSON-LD relationship information from metadata
   * @param metadata - The entry metadata with JSON-LD definitions
   * @returns Map of field names to their relationship definitions
   */
  static getRelationships(
    metadata: IEntryMeta
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
}
