import { Entry, ValidationResult } from "../base/Entry";
// import { SheetValue } from "../services/SheetService";
// Import the JSON metadata
import userMetadata from "./User.meta.json";

/**
 * Example User Entry class demonstrating JSON Schema-based metadata
 */
export class User extends Entry {
  // Load metadata from JSON using the new system
  static {
    this.loadMetadataFromJSON(userMetadata);
  }

  // Override _instances for type safety
  static override _instances = new Map<string, User>();

  // Entry properties (should match columns in metadata)
  public id: string = "";
  public name: string = "";
  public email: string = "";
  public phone: string = "";
  public status: "active" | "inactive" | "pending" = "pending";
  public createdAt: string = "";

  /**
   * Get cache key for this entry
   */
  getCacheKey(): string {
    return this.id;
  }

  /**
   * Custom validation (runs after JSON Schema validation)
   * JSON Schema handles:
   * - Required fields (id, name, email, status)
   * - Email format validation
   * - Phone pattern validation (XXX-XXX-XXXX)
   * - Status enum validation
   * - Name length constraints
   * - DateTime format for createdAt
   * 
   * This method can add additional business logic validation
   */
  validate(): ValidationResult {
    const errors: string[] = [];

    // Additional custom validation beyond JSON Schema
    // For example: check if email domain is allowed
    if (this.email && !this.email.endsWith("@example.com")) {
      errors.push("Email must be from example.com domain");
    }

    // Check if status transitions are valid (business logic)
    if (this.status === "active" && !this.createdAt) {
      errors.push("Active users must have a creation date");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Hook that runs before saving
   */
  protected override beforeSave(): void {
    // Auto-generate ID if not set
    if (!this.id) {
      this.id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    // Auto-set createdAt if new
    if (this._isNew && !this.createdAt) {
      this.createdAt = new Date().toISOString();
    }
  }
}
