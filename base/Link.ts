import { Entry } from "./Entry";

// Type to represent a linked entity that behaves as both string and object
export type Link<T extends Entry> = string & T;

// Type for array-like links (comma-separated)
export type LinkArray<T extends Entry> = string & T[];

// Metadata for link fields
export interface LinkMetadata<T extends Entry> {
  targetType: new () => T;
  fieldName: string;
  targetField?: string; // Field to match on target (default: 'name')
  isArray?: boolean; // Whether this is a comma-separated list
  separator?: string; // Separator for array links (default: ',')
}

// Symbol to store link metadata on the class
const LINK_METADATA = Symbol("linkMetadata");
// Symbol to store cached linked objects
const LINKED_CACHE = Symbol("linkedCache");
// Symbol to identify proxies
export const IS_LINK_PROXY = Symbol("isLinkProxy");

// Decorator to mark a field as a link
export function link<T extends Entry>(
  targetType: new () => T,
  options?: { targetField?: string }
) {
  return function (target: any, propertyKey: string) {
    if (!target.constructor[LINK_METADATA]) {
      target.constructor[LINK_METADATA] = [];
    }
    
    target.constructor[LINK_METADATA].push({
      targetType,
      fieldName: propertyKey,
      targetField: options?.targetField || "name",
      isArray: false,
    } as LinkMetadata<T>);
  };
}

// Decorator to mark a field as an array link (comma-separated)
export function linkArray<T extends Entry>(
  targetType: new () => T,
  options?: { targetField?: string; separator?: string }
) {
  return function (target: any, propertyKey: string) {
    if (!target.constructor[LINK_METADATA]) {
      target.constructor[LINK_METADATA] = [];
    }
    
    target.constructor[LINK_METADATA].push({
      targetType,
      fieldName: propertyKey,
      targetField: options?.targetField || "name",
      isArray: true,
      separator: options?.separator || ",",
    } as LinkMetadata<T>);
  };
}

// Helper to get link metadata from a class
export function getLinkMetadata<T extends Entry>(
  entryClass: new () => T
): LinkMetadata<Entry>[] {
  return (entryClass as any)[LINK_METADATA] || [];
}

// Create a proxy that makes the field act as both string and object
export function createLinkProxy<T extends Entry>(
  instance: Entry,
  fieldName: string,
  stringValue: string,
  linkedObject: T | null
): Link<T> {
  // Initialize cache if needed
  if (!(instance as any)[LINKED_CACHE]) {
    (instance as any)[LINKED_CACHE] = new Map();
  }

  const cache = (instance as any)[LINKED_CACHE] as Map<string, Entry | null>;
  
  // Store the linked object in cache
  cache.set(fieldName, linkedObject);

  // Create a proxy that intercepts property access
  const proxy = new Proxy(new String(stringValue) as any, {
    get(target, prop) {
      // Handle proxy identification symbol
      if (prop === IS_LINK_PROXY) {
        return true;
      }
      
      // Handle string methods and properties
      if (prop === 'toString' || prop === 'valueOf') {
        return () => stringValue;
      }
      
      // Handle Symbol properties (for...of, etc)
      if (typeof prop === 'symbol') {
        return target[prop];
      }

      // Handle length property
      if (prop === 'length') {
        return stringValue.length;
      }

      // If accessing a property on the linked object, prioritize it over string character access
      if (linkedObject && prop in linkedObject) {
        const value = (linkedObject as any)[prop];
        
        // If the property is itself a link field, create a proxy for it
        const linkedMeta = getLinkMetadata(linkedObject.constructor as new () => Entry);
        const isLinkField = linkedMeta.some(m => m.fieldName === prop);
        
        if (isLinkField && typeof value === 'string') {
          // Check if we already have the nested linked object cached
          if (cache.has(`${fieldName}.${String(prop)}`)) {
            const nestedLinked = cache.get(`${fieldName}.${String(prop)}`) ?? null;
            return createLinkProxy(linkedObject, String(prop), value, nestedLinked);
          }
          // Return the string value for now; it will be loaded on first access
          return value;
        }
        
        // If it's a method, bind it to the linked object
        if (typeof value === 'function') {
          return value.bind(linkedObject);
        }
        
        return value;
      }

      // Handle numeric indices for string character access (fallback after linked object check)
      if (typeof prop === 'string' && !isNaN(parseInt(prop))) {
        return stringValue[parseInt(prop)];
      }

      // Fall back to string behavior
      return (target as any)[prop];
    },

    has(target, prop) {
      if (linkedObject && prop in linkedObject) {
        return true;
      }
      return prop in target;
    },

    ownKeys(target) {
      if (linkedObject) {
        return [...Reflect.ownKeys(target), ...Object.keys(linkedObject)];
      }
      return Reflect.ownKeys(target);
    },

    getOwnPropertyDescriptor(target, prop) {
      if (linkedObject && prop in linkedObject) {
        return {
          enumerable: true,
          configurable: true,
          value: (linkedObject as any)[prop],
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });

  return proxy as Link<T>;
}

// Create a proxy for array-like links (comma-separated lists)
export function createLinkArrayProxy<T extends Entry>(
  instance: Entry,
  fieldName: string,
  stringValue: string,
  linkedObjects: T[],
  separator: string = ","
): LinkArray<T> {
  // Initialize cache if needed
  if (!(instance as any)[LINKED_CACHE]) {
    (instance as any)[LINKED_CACHE] = new Map();
  }

  const cache = (instance as any)[LINKED_CACHE] as Map<string, Entry[] | null>;
  
  // Store the linked objects in cache
  cache.set(fieldName, linkedObjects);

  // Split string value using the separator to get individual values
  const stringValues = stringValue.split(separator).map(s => s.trim());

  // Create a proxy that acts as both string and array
  const proxy = new Proxy(new String(stringValue) as any, {
    get(target, prop) {
      // Handle proxy identification symbol
      if (prop === IS_LINK_PROXY) {
        return true;
      }
      
      // Handle string methods and properties
      if (prop === 'toString' || prop === 'valueOf') {
        return () => stringValue;
      }
      
      // Handle Symbol properties
      if (typeof prop === 'symbol') {
        // Handle Symbol.iterator for for...of loops
        if (prop === Symbol.iterator) {
          return function* () {
            for (const obj of linkedObjects) {
              yield obj;
            }
          };
        }
        return target[prop];
      }

      // Handle array properties and methods
      if (prop === 'length') {
        return linkedObjects.length;
      }

      // Handle numeric indices - return linked objects
      if (typeof prop === 'string' && !isNaN(parseInt(prop))) {
        const index = parseInt(prop);
        return linkedObjects[index];
      }

      // Handle array methods
      if (prop === 'map' || prop === 'filter' || prop === 'forEach' || 
          prop === 'find' || prop === 'some' || prop === 'every' ||
          prop === 'reduce' || prop === 'slice' || prop === 'includes') {
        return (linkedObjects as any)[prop].bind(linkedObjects);
      }

      // Handle join method to reconstruct string with separator
      if (prop === 'join') {
        return (joiner?: string) => {
          const sep = joiner !== undefined ? joiner : separator;
          return stringValues.join(sep);
        };
      }

      // For string character access, use the string value
      return (target as any)[prop];
    },

    has(target, prop) {
      // Check if numeric index is valid
      if (typeof prop === 'string' && !isNaN(parseInt(prop))) {
        const index = parseInt(prop);
        return index >= 0 && index < linkedObjects.length;
      }
      
      // Check if it's an array method
      if (prop === 'map' || prop === 'filter' || prop === 'forEach' || 
          prop === 'find' || prop === 'some' || prop === 'every' ||
          prop === 'reduce' || prop === 'slice' || prop === 'includes' || 
          prop === 'join' || prop === 'length') {
        return true;
      }
      
      return prop in target;
    },

    ownKeys(target) {
      // Include numeric indices
      const indices = linkedObjects.map((_, i) => String(i));
      return [...Reflect.ownKeys(target), ...indices, 'length'];
    },

    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === 'string' && !isNaN(parseInt(prop))) {
        const index = parseInt(prop);
        if (index >= 0 && index < linkedObjects.length) {
          return {
            enumerable: true,
            configurable: true,
            value: linkedObjects[index],
          };
        }
      }
      
      if (prop === 'length') {
        return {
          enumerable: false,
          configurable: false,
          value: linkedObjects.length,
        };
      }
      
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });

  return proxy as LinkArray<T>;
}
