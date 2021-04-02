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

function formatStore(store) {
  let storeId = store.properties.provider_location_id;
  const extraInfo = walgreens_store_list[storeId] || {};
  const county = extraInfo?.ADDRESS?.COUNTY;

  let available = Available.unknown;
  if (store.properties.appointments_available) {
    available = Available.yes;
  } else if (store.properties.appointments_available === false) {
    available = Available.no;
  }

  return {
    id: `walgreens:${storeId}`,
    external_ids: {
      walgreens: storeId,
    },
    provider: "Walgreens",
    location_type: LocationType.pharmacy,
    name: `Walgreens #${storeId}`,
    address_lines: [titleCase(store.properties.address)],
    city: titleCase(store.properties.city),
    state: store.properties.state,
    postal_code: store.properties.postal_code,
    county: county && titleCase(county),
    position: {
      longitude: store.geometry.coordinates[0],
      latitude: store.geometry.coordinates[1],
    },
    booking_phone: "1-800-925-4733",
    booking_url: store.properties.url,
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
}

async function checkAvailability(handler, options) {
  // TODO: use this to find counties
  // let stores_wg_base = require("./walgreens_base");

  let states = ["NJ"];
  if (options.states) {
    // FIXME: support other states
    // states = options.states.split(",").map(state => state.trim());
    if (options.states !== "NJ") {
      throw new Error("VaccineSpotter source only supports NJ");
    }
  }

  let results = [];
  for (const state of states) {
    let stores = await queryState(state);
    let walgreens = stores.features
      .filter((item) => item.properties.provider === "walgreens")
      .map(formatStore)
      .forEach(handler);

    results = results.concat(walgreens);
  }

  return results;
}

module.exports = { checkAvailability };
