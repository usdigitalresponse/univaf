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

    const providerBrand = `${store.properties.provider}_${store.properties.provider_brand}`;

    return {
      id: `vaccinespotter:${store.properties.id}`,
      ...additions,
      external_ids: {
        vaccinespotter: store.properties.id,
        [providerBrand]: store.properties.provider_location_id,
        ...additions?.external_ids,
      },
      location_type: LocationType.pharmacy,
      name: store.properties.name,
      provider: `${store.properties.provider} ${store.properties.provider_brand}`,
      address_lines: store.properties.address && [
        titleCase(store.properties.address),
      ],
      city: store.properties.city && titleCase(store.properties.city),
      state: store.properties.state,
      postal_code: store.properties.postal_code,
      // county: undefined,
      position: {
        longitude: store.geometry.coordinates[0],
        latitude: store.geometry.coordinates[1],
      },
      booking_url: store.properties.url,
      meta: {
        vaccinespotter_provider: store.properties.provider,
        vaccinespotter_brand: store.properties.provider_brand,
        vaccinespotter_brand_id: store.properties.provider_brand_id,
      },
      availability: {
        source: "vaccinespotter",
        updated_at: store.properties.appointments_last_fetched,
        checked_at: new Date().toISOString(),
        available,
        meta: {
          appointment_types: store.properties.appointment_types,
          vaccine_types: store.properties.appointment_vaccine_types,
          // TODO: consider adding this although it is *super* verbose
          // appointments: store.properties.appointments,
        },
      },
    };
  },

  walgreens(store) {
    const storeId = store.properties.provider_location_id;
    const extraInfo = walgreens_store_list[storeId] || {};
    const county = extraInfo?.ADDRESS?.COUNTY;

    return formatters._base(store, {
      id: `walgreens:${storeId}`,
      external_ids: { walgreens: storeId },
      name: `Walgreens #${storeId}`,
      county: county && titleCase(county),
      booking_phone: "1-800-925-4733",
    });
  },

  duane_reade(store) {
    return {
      ...formatters.walgreens(store),
      name: `Duane Reade #${store.properties.provider_location_id}`,
    };
  },

  albertsons(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `albertsons:${storeId}`,
      external_ids: { albertsons: storeId },
      name: `Albertsons #${storeId}`,
    });
  },

  safeway(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `safeway:${storeId}`,
      external_ids: { albertsons_safeway: storeId },
      name: `Safeway #${storeId}`,
    });
  },

  acme(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `acme:${storeId}`,
      external_ids: { albertsons_acme: storeId },
      name: `ACME #${storeId}`,
    });
  },

  health_mart(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `health_mart:${storeId}`,
      external_ids: { health_mart: storeId },
      name: `Health Mart #${storeId}`,
    });
  },

  sams_club(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `sams_club:${storeId}`,
      external_ids: { sams_club: storeId },
      name: `Sam’s Club #${storeId}`,
    });
  },

  walmart(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `walmart:${storeId}`,
      external_ids: { walmart: storeId },
      name: `Walmart #${storeId}`,
    });
  },

  weis(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `weis:${storeId}`,
      external_ids: { weis: storeId },
      name: `Weis #${storeId}`,
    });
  },

  centura(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `centura:${storeId}`,
      external_ids: { centura: storeId },
      location_type: LocationType.clinic,
      booking_phone: "855-882-8065",
    });
  },

  comassvax(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      // There are no reliable IDs for these; VaccineSpotter uses a normalized
      // address form like we do in other places.
      id: `comassvax:${storeId}`,
      location_type: LocationType.massVax,
    });
  },

  kroger_kroger(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `kroger:${storeId}`,
      external_ids: { kroger: storeId },
    });
  },

  // These seem to be mass sites or clinics Kroger is helping to run, but needs
  // more checking.
  kroger_covid(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `kroger_covid:${storeId}`,
    });
  },

  kingsoopers(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `kingsoopers:${storeId}`,
      external_ids: { kingsoopers: storeId },
    });
  },

  the_little_clinic(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `kroger_the_little_clinic:${storeId}`,
      external_ids: { kroger_the_little_clinic: storeId },
    });
  },

  citymarket(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `citymarket:${storeId}`,
      external_ids: { citymarket: storeId },
    });
  },

  pharmaca(store) {
    const storeId = store.properties.provider_location_id;
    return formatters._base(store, {
      id: `pharmaca:${storeId}`,
      external_ids: { pharmaca: storeId },
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
  const formatter =
    formatters[store.properties.provider_brand] ||
    formatters[
      `${store.properties.provider}_${store.properties.provider_brand}`
    ] ||
    formatters[store.properties.provider];
  if (formatter) return formatter(store);

  console.warn(
    `Skipping unknown provider: "${store.properties.provider} / ${store.properties.provider_brand}"`
  );
  return null;
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
