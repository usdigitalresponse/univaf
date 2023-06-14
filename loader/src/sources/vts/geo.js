/**
 * WARNING: THIS LOADER IS DEPRECATED AND NO LONGER IN ACTIVE USE.
 *
 * Load data from a final snapshot of Vaccinate the States's database. UNIVAF
 * originally partnered with Vaccinate the States, who had a sizable and
 * dedicated volunteer force working to identify and source detailed information
 * about locations, while UNIVAF worked to find and organize corresponding
 * appointment availability data for those locations.
 *
 * Vaccinate the States has since shut down, and this loader was used to pull in
 * and make use of data from a final snapshot of their database. This loader is
 * retained for historical purposes and for reference when diagnosing issues in
 * data that may have originally been sourced from Vaccinate the States. It is
 * no longer meaningfully usable.
 */

const Sentry = require("@sentry/node");
const { Logger } = require("../../logging");
const {
  httpClient,
  splitOnce,
  oneLine,
  DEFAULT_STATES,
} = require("../../utils");

const logger = new Logger("vts-geo");

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

async function getStores() {
  try {
    return await httpClient({
      url: `https://univaf-data-snapshots.s3.us-west-2.amazonaws.com/vts/vts-final-output-locations.geojson.gz`,
    }).json();
  } catch (error) {
    logger.error(`Error fetching stored Vaccine the States data`, error);
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

const systemsToSend = {
  cvs: "cvs",
  rite_aid: "rite_aid",
  vaccinespotter_org: "vaccinespotter",
  vaccinefinder_org: "vaccines_gov",
  vaccinefinder: "vaccines_gov",
};

function renameSystem([systemCode, value]) {
  const system = systemsToSend[systemCode];
  if (!system) {
    throw new Error(`Unexpected system code ${systemCode}`);
  }
  return [system, value];
}

function validConcordance([systemCode, value]) {
  const system = systemsToSend[systemCode];
  if (!system) {
    return false;
  }
  if (system == "rite_aid" && value.match(/^1\d{5}$/)) {
    return false;
  }
  return true;
}

function formatStore(store) {
  const data = store.properties;

  let result;
  Sentry.withScope((scope) => {
    const dataProvider = dataProviders[data.provider.name];
    if (!dataProvider) {
      logger.error(`Unexpected provider name ${data.provider.name}`);
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

    const concordances = data.concordances.map((c) => splitOnce(c, ":"));
    const externalIds = concordances.filter(validConcordance).map(renameSystem);

    if (!externalIds.length) {
      return null;
    }

    result = {
      name,
      provider,
      external_ids: externalIds,
      position: {
        longitude: store.geometry.coordinates[0],
        latitude: store.geometry.coordinates[1],
      },
    };
  });
  return result;
}

async function* updateGeo({ states = DEFAULT_STATES }) {
  throw new Error(oneLine`
    The vtsGeo source is unsafe!
    Please fix https://github.com/usdigitalresponse/univaf/issues/433 first.
  `);
  /* eslint-disable no-unreachable */

  const statesFilter = new Set(states);

  const stores = await getStores();
  const results = stores.features
    .filter((store) => statesFilter.has(store.properties.state))
    .filter(hasUsefulData)
    .map(formatStore)
    .filter(Boolean);

  for (const item of results) {
    yield [item, { update_location: true }];
  }
  /* eslint-enable no-unreachable */
}

module.exports = {
  checkAvailability: updateGeo,
};
