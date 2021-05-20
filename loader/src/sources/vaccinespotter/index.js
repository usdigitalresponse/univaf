const got = require("got");
const Sentry = require("@sentry/node");
const { Available, LocationType } = require("../../model");
const { titleCase } = require("../../utils");
const walgreens_store_list = require("./walgreens_base");

function warn(message, context) {
  console.warn(`VaccineSpotter: ${message}`, context);
  Sentry.captureMessage(message, Sentry.Severity.Info);
}

async function queryState(state) {
  try {
    const response = await got({
      url: `https://www.vaccinespotter.org/api/v0/states/${state}.json`,
    });
    return JSON.parse(response.body);
  } catch (error) {
    console.error(`Error fetching Vaccine Spotter data`, error);
  }
}

// Fields we expect to be on VaccineSpotter appointment slots records.
const slotFields = new Set([
  "time",
  "date",
  "type",
  "vaccine_types",
  "appointment_types",
]);

/**
 * Check whether the appointment slots data for a location is present and valid.
 * If there's useful slot data, this returns `true`. If there's slot data that
 * is formatted in an unexpected way, this logs a warning.
 * @param {any} apiLocation
 * @returns {boolean}
 */
function validateSlots(apiLocation) {
  const apiSlots = apiLocation.appointments;
  if (!apiSlots || !apiSlots.length) return false;

  let error;
  let warning;
  for (const slot of apiSlots) {
    // Validate slot formatting; bail out if there's a problem.
    if (!slot.time && !slot.date) {
      error = "slot is missing either 'time' or 'date'";
      break;
    }
    if (slot.vaccine_types && !Array.isArray(slot.vaccine_types)) {
      error = "slot 'vaccine_types' is not an array";
      break;
    }
    if (
      slot.appointment_types &&
      (!Array.isArray(slot.appointment_types) ||
        slot.appointment_types.length > 1)
    ) {
      error = "slot 'appointment_types' is not an array w/ one entry";
      break;
    }

    // If there's extra data we didn't expect, log a warning so we know to
    // update our code to make use of it, but don't fail validation.
    for (const field of Object.keys(slot)) {
      if (!slotFields.has(field)) {
        warning = `Unexpected field '${field}' on slots`;
        // Stop after we find one warning -- we're really just trying to get
        // notfied that this needs a closer look, at which point we'll see what
        // else has changed.
        break;
      }
    }
  }

  if (warning || error) {
    const context = { id: apiLocation.id, provider: apiLocation.provider };
    if (warning) {
      warn(warning, context);
    }
    if (error) {
      warn(error, context);
      return false;
    }
  }

  return true;
}

/**
 * Create a slot list based on the source data from VaccineSpotter, if any.
 * @param {Array} [apiSlots] Array of VaccineSpotter-style slot data.
 * @returns {Array}
 */
function formatSlots(apiSlots) {
  // Some locations have capacity by date instead of individual slots.
  if (!apiSlots || !apiSlots.every((slot) => slot.time)) return undefined;

  // Source data is an array of objects like:
  // {
  //   "time": "2021-05-04T09:50:00.000-04:00",
  //   "type": "Moderna",
  //   // Array of vaccine products offered
  //   "vaccine_types": [ "moderna" ],
  //   // Always a single string indicating what doses are allowed
  //   "appointment_types": [ "all_doses" ]
  // }
  return apiSlots.map((data) => ({
    start: data.time,
    // end: undefined,  // No end time in source data
    available: Available.yes, // We only have these for available slots
    // available_count: 1,  // Omit since it's always 1
    products: data.vaccine_types,
    dose: data.appointment_types && data.appointment_types[0],
  }));
}

/**
 * Format a summarized list of appointments by day.
 * @param {Array} apiSlots
 * @returns {Array}
 */
function formatCapacity(apiSlots) {
  if (!apiSlots) return undefined;

  const categorized = Object.create(null);
  for (const slot of apiSlots) {
    let date = slot.date;
    if (!date && slot.time) {
      // `time` is ISO 8601 in location's local timezone.
      date = slot.time.slice(0, 10);
    }

    const key = `${date}::${slot.type}`;
    if (key in categorized) {
      categorized[key].available_count += 1;
    } else {
      categorized[key] = {
        date,
        available: Available.yes,
        available_count: 1,
        products: slot.vaccine_types,
        dose: slot.appointment_types && slot.appointment_types[0],
      };
    }
  }

  const keys = Object.keys(categorized);
  if (!keys.length) return undefined;

  return Object.keys(categorized)
    .sort()
    .map((key) => categorized[key]);
}

const formatters = {
  _base(store, additions = null) {
    let available = Available.unknown;
    if (store.properties.appointments_available) {
      available = Available.yes;
    } else if (store.properties.appointments_available === false) {
      available = Available.no;
    }

    // Determine what identifier type to use for `external_ids`.
    let provider = store.properties.provider.trim().toLowerCase();
    let providerBrand = store.properties.provider_brand;
    if (!providerBrand) {
      providerBrand = provider;
    } else {
      providerBrand = providerBrand.trim().toLowerCase();
      if (!providerBrand.includes(provider)) {
        providerBrand = `${provider}_${providerBrand}`;
      }
    }

    let id;
    if (store.properties.provider_location_id) {
      id = `${providerBrand}:${store.properties.provider_location_id}`;
    } else {
      id = `vaccinespotter:${store.properties.id}`;
    }

    const availability = {
      source: "univaf-vaccinespotter",
      valid_at: store.properties.appointments_last_fetched,
      checked_at: new Date().toISOString(),
      available,
    };
    if (validateSlots(store.properties)) {
      const capacity = formatCapacity(store.properties.appointments);
      availability.capacity = capacity;

      const slots = formatSlots(store.properties.appointments);
      if (slots) {
        availability.slots = slots;
      }

      const allProducts = capacity
        .flatMap((data) => data.products)
        .filter((x) => !!x);
      const allDoses = capacity.map((data) => data.dose).filter((x) => !!x);
      if (allProducts.length) {
        availability.products = Array.from(new Set(allProducts));
      }
      if (allDoses.length) {
        availability.doses = Array.from(new Set(allDoses));
      }
    }

    return {
      id,
      location_type: LocationType.pharmacy,
      name: store.properties.name,
      provider: providerBrand,
      address_lines: store.properties.address && [
        titleCase(store.properties.address),
      ],
      city: store.properties.city && titleCase(store.properties.city),
      state: store.properties.state,
      postal_code: store.properties.postal_code,
      position: {
        longitude: store.geometry.coordinates[0],
        latitude: store.geometry.coordinates[1],
      },
      booking_url: store.properties.url,
      meta: {
        time_zone: store.properties.time_zone,
        vaccinespotter: {
          provider: store.properties.provider,
          brand: store.properties.provider_brand,
          brand_id: store.properties.provider_brand_id,
        },
      },

      // Override any of the above with additions.
      ...additions,
      external_ids: {
        vaccinespotter: store.properties.id.toString(),
        [providerBrand]: store.properties.provider_location_id,
        ...additions?.external_ids,
      },
      availability: {
        ...availability,
        ...additions?.availability,
      },
    };
  },

  walgreens(store) {
    const storeId = store.properties.provider_location_id;
    const extraInfo = walgreens_store_list[storeId] || {};
    const county = extraInfo?.ADDRESS?.COUNTY;

    // All Walgreens sub-brands are actually just flavors of normal Walgreens
    // stores (rather than visibly separate brands), except Duane Reade.
    // Make sure they all have IDs with the same scheme.
    return formatters._base(store, {
      id: `walgreens:${storeId}`,
      external_ids: { walgreens: storeId },
      county: county && titleCase(county),
      booking_phone: "1-800-925-4733",
    });
  },

  duane_reade(store) {
    // Use a more familiar name for Duane Reade, but keep its ID as Walgreens
    // (they share the same store numbering).
    return {
      ...formatters.walgreens(store),
      name: `Duane Reade #${store.properties.provider_location_id}`,
    };
  },

  safeway(store) {
    const formatted = formatters._base(store);

    // The provider location IDs are not store numbers for safeway.
    const idMatch = store.properties.name.match(/safeway\s(\d+)/i);
    if (idMatch) {
      const storeId = idMatch[1];
      formatted.id = `safeway:${storeId}`;
      formatted.external_ids.safeway = storeId;
      formatted.name = `Safeway #${storeId}`;
    } else {
      console.warn(
        "VaccineSpotter: No Safeway store number found for location",
        store.properties.id
      );
    }

    return formatted;
  },

  centura(store) {
    return formatters._base(store, {
      location_type: LocationType.clinic,
      booking_phone: "855-882-8065",
    });
  },

  comassvax(store) {
    return formatters._base(store, {
      location_type: LocationType.massVax,
    });
  },

  cvs() {
    // VaccineSpotter data for CVS is not currently very good; we rely on the
    // CVS API instead.
    return null;
  },

  rite_aid() {
    // We have a separate scraper for Rite Aid and an API upcoming.
    return null;
  },
};

function formatStore(store) {
  const data = store.properties;
  const formatter =
    formatters[`${data.provider}_${data.provider_brand}`] ||
    formatters[store.properties.provider_brand] ||
    formatters[store.properties.provider] ||
    formatters._base;

  let result;
  Sentry.withScope((scope) => {
    scope.setContext("location", {
      id: data.id,
      name: data.name,
      provider: data.provider,
    });
    result = formatter(store);
  });
  return result;
}

async function checkAvailability(handler, options) {
  let states = ["NJ"];
  if (options.vaccinespotterStates) {
    states = options.vaccinespotterStates
      .split(",")
      .map((state) => state.trim());
  } else if (options.states) {
    states = options.states.split(",").map((state) => state.trim());
  }

  if (!states.length) console.warn("No states specified for vaccinespotter");

  let results = [];
  for (const state of states) {
    let stores = await queryState(state);
    let walgreens = stores.features
      .map(formatStore)
      .filter((item) => !!item)
      .forEach((item) => handler(item));

    results = results.concat(walgreens);
  }

  return results;
}

module.exports = {
  checkAvailability,
  formatStore,
};
