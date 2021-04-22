const got = require("got");

const { Available, LocationType } = require("../../model");
const { titleCase } = require("../../utils");
const walgreens_store_list = require("./walgreens_base");

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
    let providerBrand = store.properties.provider_brand.trim().toLowerCase();
    if (!providerBrand.includes(provider)) {
      providerBrand = `${provider}_${providerBrand}`;
    }

    let id;
    if (store.properties.provider_location_id) {
      id = `${providerBrand}:${store.properties.provider_location_id}`;
    } else {
      id = `vaccinespotter:${store.properties.id}`;
    }

    // Default to `undefined` (rather than null) to suppress output in JSON.
    const meta = {
      appointment_types: store.properties.appointment_types || undefined,
      vaccine_types: store.properties.appointment_vaccine_types || undefined,
      appointments: store.properties.appointments || undefined,
    };
    // Summarize appointments when detailed data is available.
    if (store.properties.appointments) {
      const categorized = Object.create(null);
      for (const appointment of store.properties.appointments) {
        // Assume `time` is ISO 8601 in location's local timezone.
        // (This may need fancier parsing if that turns out to be untrue.)
        const date = appointment.time.slice(0, 10);
        const key = `${date}::${appointment.type}`;
        if (key in categorized) {
          categorized[key].available += 1;
        } else {
          categorized[key] = { date, type: appointment.type, available: 1 };
        }
      }
      meta.capacity = Object.keys(categorized)
        .sort()
        .map((key) => categorized[key]);
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
        source: "vaccinespotter",
        updated_at: store.properties.appointments_last_fetched,
        checked_at: new Date().toISOString(),
        available,
        meta,
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
  return formatter(store);
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
      .forEach(handler);

    results = results.concat(walgreens);
  }

  return results;
}

module.exports = { checkAvailability };
