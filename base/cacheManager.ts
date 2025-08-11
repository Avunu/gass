import { SheetValue } from "../services/SheetService";

/**
 * Represents a serialized value with type information
 */
export interface SerializedValue {
  _type: string;
  value: SheetValue | Record<string, unknown>;
}

/**
 * Represents all possible JSON values including serialized values
 */
export type JSONValue = SheetValue | SerializedValue | Record<string, unknown> | JSONValue[];

/**
 * Represents a value that can be cached.
 */
export type CacheableValue = JSONValue | Record<string, JSONValue>;

export interface SerializableClass {
  toJSON(): Record<string, JSONValue>;
}

/**
 * A class for managing caching operations.
 */
export class CacheManager {
  private cache: GoogleAppsScript.Cache.Cache;

  constructor() {
    this.cache = CacheService.getScriptCache();
  }

  /**
   * Serializes complex objects into plain JSON
   */
  private serialize(value: unknown): JSONValue {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      return {
        _type: "Date",
        value: value.toISOString(),
      };
    }

    if (typeof value === "object") {
      if (Array.isArray(value)) {
        return value.map((item) => this.serialize(item));
      }

      // Handle class instances with toJSON method
      if ("toJSON" in value && typeof value.toJSON === "function") {
        const serialized = value.toJSON();
        return {
          _type: value.constructor.name,
          value: serialized,
        };
      }

      // Handle plain objects
      const result: Record<string, JSONValue> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.serialize(val);
      }
      return result;
    }

    return value as SheetValue;
  }

  private deserialize(value: unknown): unknown {
    if (value && typeof value === "object" && "_type" in value) {
      const typed = value as SerializedValue;
      if (typed._type === "Date" && typeof typed.value === "string") {
        return new Date(typed.value);
      }
      return typed.value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.deserialize(item));
    }

    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.deserialize(val);
      }
      return result;
    }

    return value;
  }

  /**
   * Custom replacer for JSON.stringify to handle Date objects.
   * @param key - The key being stringified.
   * @param value - The value corresponding to the key.
   * @returns The processed value.
   */
  dateReplacer(_key: string, value: JSONValue): JSONValue {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }

  private isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d*)?(?:Z|[-+]\d{2}:\d{2})?$/;

  /**
   * Custom reviver for JSON.parse to handle Date objects.
   * @param key - The key being parsed.
   * @param value - The value corresponding to the key.
   * @returns The processed value.
   */
  dateReviver(_key: string, value: JSONValue): JSONValue {
    if (typeof value === "string" && value.endsWith("Z") && this.isoDatePattern.test(value)) {
      return new Date(value);
    }
    return value as JSONValue;
  }

  /**
   * Retrieves data from the cache.
   * @param key - The cache key.
   * @returns The cached data or null if not found.
   */
  get<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    return this.deserialize(parsed) as T;
  }

  /**
   * Stores data in the cache.
   * @param key - The cache key.
   * @param data - The data to cache.
   * @param expirationInSeconds - Expiration time in seconds.
   */
  put(key: string, data: unknown, expirationInSeconds = 21600): void {
    const serialized = this.serialize(data);
    this.cache.put(key, JSON.stringify(serialized), expirationInSeconds);
  }
}
