const got = require("got");
const Sentry = require("@sentry/node");

const dataProviders = {
  "Rite-Aid": {
    provider: "rite_aid",
    getStoreName: (data) => {
      const m = data.name.match(/RITE AID PHARMACY #?(\d+)/i);
      if (m) {
        return `Rite Aid #${parseInt(m[1], 10)}`; // format as in riteaid/api.js
      }
      return data.name;
    },
  },
  CVS: {
    // modeled after code in cvs/api.js
    provider: "cvs",
    getStoreName: (data) => {
      const m = data.name.match(/CVS Pharmacy, Inc. #?(\d+)/i);
      if (m) {
        return `CVS #${parseInt(m[1], 10)}`; // format as in cvs/api.js
      }
      return data.name;
    },
  },
};

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
    store.properties.provider?.name &&
    store.properties.provider?.name in dataProviders
  );
}

function formatStore(store) {
  const data = store.properties;

  let result;
  Sentry.withScope((scope) => {
    const dataProvider = dataProviders[data.provider.name];
    if (!dataProvider) {
      error(`Unexpected provider name ${data.provider.name}`);
      return null;
    }

    const provider = dataProvider.provider;
    const name = dataProvider.getStoreName(data);

    scope.setContext("location", {
      id: store.id,
      url: data.vts_url,
      name: name,
      provider: provider,
    });

    function splitConcordance(concordance) {
      const colon = concordance.indexOf(":");
      return [
        concordance.substring(0, colon),
        concordance.substring(colon + 1),
      ];
    }

    const systemsToSend = {
      cvs: "cvs",
      rite_aid: "rite_aid",
      vaccinespotter_org: "vaccinespotter",
      vaccinefinder_org: "vaccines_gov",
    };

    const concordances = data.concordances.map(splitConcordance);
    const externalIds = concordances
      .map((v) => (v[0] in systemsToSend ? [systemsToSend[v[0]], v[1]] : null))
      .filter(Boolean);
    const univafPair = concordances.filter((v) => v[0] == "getmyvax_org")[0];

    if (!externalIds.length) {
      return null;
    }

    result = {
      name,
      provider,
      id: univafPair && univafPair[1],
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
  const states = options.states?.split(",").map((state) => state.trim());

  if (!states || !states.length) {
    warn("No states specified for vts.geo");
  }

  let results = [];
  for (const state of states) {
    const stores = await queryState(state);
    const formatted = stores.features
      .filter(hasUsefulData)
      .map(formatStore)
      .filter(Boolean)
      .forEach((item) => handler(item, { update_location: true }));

    results = results.concat(formatted);
  }

  return results;
}

module.exports = {
  checkAvailability: updateGeo,
};
