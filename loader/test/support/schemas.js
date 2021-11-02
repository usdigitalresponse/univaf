const { Available, VaccineProduct, LocationType } = require("../../src/model");

function schemaFromEnum(enumObject) {
  return { enum: Object.values(enumObject) };
}

const locationTypeSchema = schemaFromEnum(LocationType);

const productsSchema = {
  type: "array",
  minItems: 1,
  uniqueItems: true,
  items: schemaFromEnum(VaccineProduct),
};

const slotSchema = {
  type: "object",
  properties: {
    start: {
      oneOf: [{ type: "string", format: "date-time" }, { instanceof: "Date" }],
    },
    end: {
      oneOf: [{ type: "string", format: "date-time" }, { instanceof: "Date" }],
    },
    // Available cannot be unknown in a slot.
    available: { enum: [Available.yes, Available.no] },
    available_count: { type: "integer", minimum: 0 },
    unavailable_count: { type: "integer", minimum: 0 },
    products: productsSchema,
    dose: { type: "string" },
    booking_url: { type: "string", format: "uri" },
  },
  required: ["start"],
  additionalProperties: false,
};

const capacitySchema = {
  type: "object",
  properties: {
    date: { type: "string", format: "date" },
    // Available cannot be unknown in a capacity entry.
    available: { enum: [Available.yes, Available.no] },
    available_count: { type: "integer", minimum: 0 },
    unavailable_count: { type: "integer", minimum: 0 },
    products: productsSchema,
    dose: { type: "string" },
  },
  required: ["date"],
  additionalProperties: false,
};

const availabilitySchema = {
  type: "object",
  properties: {
    source: { type: "string" },
    available: schemaFromEnum(Available),
    available_count: { type: "integer", minimum: 0 },
    products: productsSchema,
    doses: {
      type: "array",
      items: { type: "string" },
      uniqueItems: true,
      minItems: 1,
    },
    capacity: { type: "array", items: capacitySchema },
    slots: { type: "array", items: slotSchema },
    is_public: { type: "boolean" },
    // checked_at should *always* be a specific time, but valid_at can be a
    // less-precise date, because the source data is sometimes imprecise.
    // (The server will process this into 00:00:00Z on that date.)
    checked_at: { type: "string", format: "date-time" },
    valid_at: {
      oneOf: [
        { type: "string", format: "date-time" },
        { type: "string", format: "date" },
      ],
    },
  },
  required: ["source", "checked_at", "available"],
  additionalProperties: false,
};

const locationSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      format: "uuid",
    },
    external_ids: {
      type: "array",
      items: {
        type: "array",
        items: { type: "string" },
      },
    },
    provider: { type: "string" },
    location_type: locationTypeSchema,
    name: { type: "string" },
    address_lines: { type: "array", items: { type: "string" } },
    city: { type: "string" },
    state: { type: "string" },
    postal_code: { type: "string" },
    county: { type: "string" },
    position: {
      type: "object",
      properties: {
        longitude: { type: "number", format: "float" },
        latitude: { type: "number", format: "float" },
      },
    },
    info_phone: { type: "string" },
    info_url: { type: "string", format: "uri" },
    booking_phone: { type: "string" },
    booking_url: { type: "string", format: "uri" },
    description: { type: "string" },
    requires_waitlist: { type: "boolean" },
    meta: { type: "object" },
    is_public: { type: "boolean" },
    availability: availabilitySchema,
  },
  required: ["name", "provider", "address_lines", "city", "state"],
  additionalProperties: false,
};

module.exports = {
  locationSchema,
  availabilitySchema,
  capacitySchema,
  slotSchema,
  locationTypeSchema,
  productsSchema,
};
