const got = require("got");
const Sentry = require("@sentry/node");
const { Available, LocationType } = require("../../model");
const { titleCase } = require("../../utils");

updateworthyProviders = new Set(["CVS", "Rite-Aid"]);

function warn(message, context) {
  console.warn(`VTS Geo: ${message}`, context);
  Sentry.captureMessage(message, Sentry.Severity.Info);
}

function error(message, context) {
  console.error(`VTS Geo: ${message}`, context);
  Sentry.captureMessage(message, Sentry.Severity.Error);
}

async function queryState(state) {
  try {
    const response = await got({
      url: `https://api.vaccinatethestates.com/v0/${state}.geojson`,
    });
    return JSON.parse(response.body);
  } catch (error) {
    error(`Error fetching Vaccine Spotter data`, error);
    return [];
  }
}

/**
 * Filter out some stores with bad data.
 * @param {any} store
 * @returns {boolean}
 */
function hasUsefulData(store) {
  return (
    store.properties.concordances?.length &&
    store.geometry?.coordinates &&
    updateworthyProviders.has(store.properties.provider?.name)
  );
}

function formatStore(store) {
  const data = store.properties;

  let result;
  Sentry.withScope((scope) => {
    scope.setContext("location", {
      id: store.id,
      url: data.vts_url,
      name: data.name,
      provider: data.provider,
    });

    function splitConcordance(concordance) {
      const colon = concordance.indexOf(":");
      return [
        concordance.substring(0, colon),
        concordance.substring(colon + 1),
      ];
    }

    const externalIds = data.concordances
      .map(splitConcordance)
      .filter((v) => v[0] != "getmyvax_org"); // ignore getmyvax concordances

    result = {
      name: data.name,
      external_ids: externalIds,
      position: {
        longitude: store.geometry.coordinates[0],
        latitude: store.geometry.coordinates[1],
      },
    };
  });
  return result;
}

async function updateGeo(handler, options) {
  let states = options.states?.split(",").map((state) => state.trim());

  if (!states || !states.length) {
    warn("No states specified for vts.geo");
  }

  let results = [];
  for (const state of states) {
    const stores = await queryState(state);
    const formatted = stores.features
      .filter(hasUsefulData)
      .map(formatStore)
      .forEach((item) => handler(item, { update_location: true }));

    results = results.concat(formatted);
  }

  return results;
}

module.exports = {
  checkAvailability: updateGeo,
};
