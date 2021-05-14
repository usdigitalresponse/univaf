import Ajv from "ajv";
import addFormats from "ajv-formats";
import addTransform from "ajv-keywords/dist/keywords/transform";
import addInstanceof from "ajv-keywords/dist/keywords/instanceof";
import { ValueError } from "./exceptions";
import {
  Availability,
  AvailabilityInput,
  SlotRecord,
  CapacityRecord,
} from "./interfaces";

const AVAILABLE_OPTIONS = new Set(Object.values(Availability));

var ajv = new Ajv({ useDefaults: "empty" });
addFormats(ajv);
addTransform(ajv);
addInstanceof(ajv);

// Custom Validations ------------------------------------

// Deletes fields that are null/undefined from an object.
ajv.addKeyword({
  keyword: "dropNullFields",
  type: "object",
  modifying: true,
  compile(schema) {
    function makeValidator(callback: (data: any, key: string) => void) {
      return (data: any) => {
        for (const key of Object.keys(data)) {
          if (
            data[key] == null ||
            (Array.isArray(data[key]) && !data[key].length)
          )
            callback(data, key);
        }
        return true;
      };
    }

    if (schema === "undefined") {
      return makeValidator((data, key) => {
        data[key] = undefined;
      });
    } else {
      return makeValidator((data, key) => {
        delete data[key];
      });
    }
  },
});

const datetimePattern = /^\d{4}-\d\d-\d\d(T|\s)\d\d:\d\d:\d\d(\.\d+)?(Z|[+\-]\d\d:?\d\d)?$/;

// Ensures a string is formatted as a W3C-Style ISO 8601 datetime with timezone.
// If there's no timezone, it will set the default to the value of the keyword.
ajv.addKeyword({
  keyword: "datetimeWithZone",
  type: "string",
  schemaType: "string",
  modifying: true,
  error: { message: "must be a W3C-style ISO 8601 datetime with timezone" },
  compile(schema) {
    if (schema.toLowerCase() === "utc" || schema.toLowerCase() === "z") {
      return (data, dataCxt) => {
        const match = data.match(datetimePattern);
        if (!match) return false;
        else if (!match[3]) {
          dataCxt.parentData[dataCxt.parentDataProperty] = data + "Z";
        }
        return true;
      };
    } else if (schema) {
      // TODO: need an actual parser to accept other default timezones
      throw new Error("Only 'UTC/Z' default timezone is currently supported");
    } else {
      return (data) => {
        const match = data.match(datetimePattern);
        return match && match[3] != null;
      };
    }
  },
});

function makeValidator<T>(schema: any) {
  const coreValidator = ajv.compile(schema);
  return (data: any, parentName?: string) => {
    if (coreValidator(data)) return data as T;

    const error = coreValidator.errors[0];
    throw new ValueError(
      `${parentName || ""}${error.instancePath} ${error.message}`
    );
  };
}

// Actual Schemas ----------------------------------------------------

const AVAILABLE_SCHEMA = {
  default: Availability.YES,
  allOf: [
    { type: "string", transform: ["toUpperCase"] },
    { enum: [Availability.YES, Availability.NO] },
  ],
};

const PRODUCTS_SCHEMA = {
  type: "array",
  minItems: 1,
  uniqueItems: true,
  items: { type: "string" },
};

const SLOT_SCHEMA = {
  allOf: [
    { type: "object", dropNullFields: true },
    {
      type: "object",
      properties: {
        start: {
          oneOf: [
            { type: "string", datetimeWithZone: "utc" },
            { instanceof: "Date" },
          ],
        },
        end: {
          oneOf: [
            { type: "string", datetimeWithZone: "utc" },
            { instanceof: "Date" },
          ],
        },
        available: AVAILABLE_SCHEMA,
        available_count: { type: "integer", minimum: 0 },
        unavailable_count: { type: "integer", minimum: 0 },
        products: PRODUCTS_SCHEMA,
        dose: { type: "string" },
      },
      required: ["start"],
      additionalProperties: true,
    },
  ],
};

const CAPACITY_SCHEMA = {
  allOf: [
    { type: "object", dropNullFields: true },
    {
      type: "object",
      properties: {
        date: { type: "string", format: "date" },
        available: AVAILABLE_SCHEMA,
        available_count: { type: "integer", minimum: 0 },
        unavailable_count: { type: "integer", minimum: 0 },
        products: PRODUCTS_SCHEMA,
        dose: { type: "string" },
      },
      required: ["date"],
      additionalProperties: true,
    },
  ],
};

export const validateSlots = makeValidator<SlotRecord[]>({
  type: "array",
  items: SLOT_SCHEMA,
});

export const validateCapacity = makeValidator<CapacityRecord[]>({
  type: "array",
  items: CAPACITY_SCHEMA,
});

function availableFromCount(
  count?: number,
  defaultValue = Availability.UNKNOWN
): Availability {
  if (count > 0) return Availability.YES;
  else if (count === 0) return Availability.NO;
  else return defaultValue;
}

function capacityFromSlots(slots: Array<SlotRecord>): Array<CapacityRecord> {
  const categorized: { [index: string]: CapacityRecord } = Object.create(null);
  for (const slot of slots) {
    // Assume `time` is ISO 8601 in location's local timezone.
    // (This may need fancier parsing if that turns out to be untrue.)
    let time = slot.start;
    if (time instanceof Date) time = time.toISOString();

    const date = time.slice(0, 10);
    const products = slot.products ? slot.products.toString() : "";
    const key = `${date}::${products}::${slot.dose}`;

    // A slot that doesn't specify any counts is available. But if it only has
    // an unavailable count, assume it's not available.
    let availableCount = slot.available_count;
    if (availableCount == null) {
      if (slot.unavailable_count) availableCount = 0;
      else availableCount = 1;
    }

    if (key in categorized) {
      categorized[key].available_count += availableCount;
      categorized[key].unavailable_count += slot.unavailable_count || 0;
      if (availableCount) categorized[key].available = Availability.YES;
    } else {
      categorized[key] = {
        date,
        available: availableFromCount(availableCount, Availability.YES),
        available_count: availableCount,
        unavailable_count: slot.unavailable_count || 0,
        products: slot.products,
        dose: slot.dose,
      };
    }
  }

  const keys = Object.keys(categorized);
  if (!keys.length) return undefined;

  return Object.keys(categorized)
    .sort()
    .map((key) => categorized[key]);
}

function productsFromCapacity(capacity: Array<CapacityRecord>): Array<string> {
  let all = new Set();
  for (const item of capacity) {
    if (item.products) {
      for (const product of item.products) all.add(product);
    }
  }
  // This isn't totally valid, but in practical terms we go to SQL next, and
  // that'll validate that it's an array of strings.
  return [...all] as Array<string>;
}

function dosesFromCapacity(capacity: Array<CapacityRecord>): Array<string> {
  let all = new Set();
  for (const item of capacity) if (item.dose) all.add(item.dose);
  // This isn't totally valid, but in practical terms we go to SQL next, and
  // that'll validate that it's an array of strings.
  return [...all] as Array<string>;
}

function countCapacity(capacity: Array<CapacityRecord>): number {
  let total = 0;
  for (const item of capacity) total += item.available_count;
  return total;
}

export function validateAvailabilityInput(data: any): AvailabilityInput {
  if (!data.source) {
    throw new ValueError("availability must have a `source`");
  }
  if (!data.checked_at) {
    throw new ValueError("availability must have a `checked_at`");
  }
  if (!data.valid_at) data.valid_at = data.checked_at;

  if (data.slots) {
    data.slots = validateSlots(data.slots, "slots");
    if (!data.slots.length) delete data.slots;
  }

  if (data.capacity && data.capacity.length) {
    data.capacity = validateCapacity(data.capacity, "capacity");
  } else if (data.slots) {
    data.capacity = capacityFromSlots(data.slots);
  } else {
    delete data.capacity;
  }

  if (data.products == null && data.capacity) {
    data.products = productsFromCapacity(data.capacity);
  }
  if (data.doses == null && data.capacity) {
    data.doses = dosesFromCapacity(data.capacity);
  }

  if (data.available_count == null && data.capacity) {
    data.available_count = countCapacity(data.capacity);
  }
  if (data.available_count < 0) {
    throw new ValueError("available_count must be > 0");
  }

  if (data.available == null) {
    data.available = availableFromCount(data.available_count);
  } else {
    data.available = data.available.toUpperCase();
    if (!AVAILABLE_OPTIONS.has(data.available)) {
      throw new ValueError(
        `Invalid value for availability: "${data.available}"`
      );
    }
  }

  if (data.is_public == null) data.is_public = true;

  return data;
}
