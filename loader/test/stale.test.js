const utils = require("../src/utils");
const metrics = require("../src/metrics");
const { StaleChecker } = require("../src/stale");

jest.mock("../src/utils");
jest.mock("../src/metrics");

// Keep a single, integerial "now" timestamp so test results are predictable.
const now = new Date(Math.floor(Date.now()));

function minutes(count) {
  return count * 60 * 1000;
}

function createMinutesAgoTimestamp(value = 0, relative = now) {
  return new Date(relative - minutes(value)).toISOString();
}

function createMinutesAgoDatestamp(value = 0, relative = now) {
  return createMinutesAgoTimestamp(value, relative).slice(0, 10);
}

function createRecord(data) {
  let availability = undefined;
  if ("availability" in data && data.availability) {
    availability = {
      source: "test-source",
      valid_at: createMinutesAgoTimestamp(10),
      checked_at: createMinutesAgoTimestamp(10),
      available: "YES",
      available_count: 191,
      ...data.availability,
    };
  }

  return {
    external_ids: [
      ["njiis", "nj5678"],
      ["vtrcks", "789"],
      ["rite_aid", "576"],
      ["univaf_v0", "rite_aid:576"],
    ],
    provider: "RiteAid",
    location_type: "PHARMACY",
    name: "Rite Aid #576",
    address_lines: ["605 North Colony Road"],
    city: "Wallingford",
    state: "CT",
    county: "County",
    postal_code: "06492-3109",
    info_phone: "(203) 265-3600",
    info_url: "https://www.riteaid.com/covid-19",
    booking_phone: "(203) 265-3600",
    booking_url: "https://www.riteaid.com/pharmacy/covid-qualifier",
    requires_waitlist: false,
    is_public: true,
    ...data,

    availability,
  };
}

describe("StaleChecker", () => {
  let checker;
  beforeEach(() => {
    jest.clearAllMocks();
    checker = new StaleChecker({
      relativeTime: now,
      threshold: minutes(24 * 60),
    });
  });

  it("keeps statistics about record age", () => {
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(10),
        },
      })
    );
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(20),
        },
      })
    );
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(30),
        },
      })
    );
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(24),
        },
      })
    );

    const statistics = [...checker.listStatistics()];
    expect(statistics).toHaveLength(1);
    expect(statistics[0]).toEqual({
      source: "test-source",
      samples: [minutes(10), minutes(20), minutes(24), minutes(30)],
      min: minutes(10),
      max: minutes(30),
      average: minutes(21),
      median: minutes(22),
    });
  });

  it("filters out stale records based on threshold", () => {
    const filterOut = checker.filterRecord(
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(25 * 60),
        },
      })
    );
    expect(filterOut).toBeNull();

    const filterIn = checker.filterRecord(
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(23 * 60),
        },
      })
    );
    expect(filterIn).not.toBeNull();
  });

  it("keeps records of unknown age", () => {
    const filterIn = checker.filterRecord(
      createRecord({
        availability: {
          valid_at: undefined,
        },
      })
    );
    expect(filterIn).not.toBeNull();

    const noAvailability = checker.filterRecord(
      createRecord({
        availability: null,
      })
    );
    expect(noAvailability).not.toBeNull();
  });

  it("logs a warning for each stale source", () => {
    checker.checkRecord(
      createRecord({
        availability: {
          source: "test-source-1",
          valid_at: createMinutesAgoTimestamp(25 * 60),
        },
      })
    );
    checker.checkRecord(
      createRecord({
        availability: {
          source: "test-source-2",
          valid_at: createMinutesAgoTimestamp(20 * 60),
        },
      })
    );
    checker.checkRecord(
      createRecord({
        availability: {
          source: "test-source-3",
          valid_at: createMinutesAgoTimestamp(25 * 60),
        },
      })
    );

    checker.printSummary();
    expect(utils.__getWarnings()).toContainEqual(
      expect.stringContaining("test-source-1 has stale data")
    );
    expect(utils.__getWarnings()).not.toContainEqual(
      expect.stringContaining("test-source-2 has stale data")
    );
    expect(utils.__getWarnings()).toContainEqual(
      expect.stringContaining("test-source-3 has stale data")
    );
  });

  it("logs a warning for each source with no age information", () => {
    checker.checkRecord(
      createRecord({
        availability: {
          source: "test-source-1",
          valid_at: undefined,
        },
      })
    );

    checker.printSummary();
    expect(utils.__getWarnings()).toContainEqual(
      expect.stringContaining("test-source-1 has no age information")
    );
  });

  it("sends metrics for each source", () => {
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(10),
        },
      })
    );
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(20),
        },
      })
    );

    checker.sendMetrics("prefix");

    expect(metrics.gauge).toHaveBeenCalledWith(
      "prefix.age_seconds.min",
      minutes(10) / 1000,
      [`source:test-source`]
    );
    expect(metrics.gauge).toHaveBeenCalledWith(
      "prefix.age_seconds.max",
      minutes(20) / 1000,
      [`source:test-source`]
    );
    expect(metrics.gauge).toHaveBeenCalledWith(
      "prefix.age_seconds.avg",
      minutes(15) / 1000,
      [`source:test-source`]
    );
    expect(metrics.gauge).toHaveBeenCalledWith(
      "prefix.age_seconds.median",
      minutes(15) / 1000,
      [`source:test-source`]
    );
  });

  it("does not send metrics for sources with no age data", () => {
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: undefined,
        },
      })
    );

    checker.sendMetrics("prefix");

    expect(metrics.gauge).not.toHaveBeenCalled();
  });
});

describe("StaleChecker.calculateAge", () => {
  it("prefers the newest slot if older than valid_at", () => {
    const age = StaleChecker.calculateAge(
      now,
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(10),
          slots: [
            { start: createMinutesAgoTimestamp(60) },
            { start: createMinutesAgoTimestamp(30) },
          ],
        },
      })
    );

    expect(age).toBe(minutes(30));
  });

  it("prefers the newest capacity if older than valid_at", () => {
    const age = StaleChecker.calculateAge(
      now,
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(10),
          capacity: [
            { date: createMinutesAgoDatestamp(48 * 60) },
            { date: createMinutesAgoDatestamp(24 * 60) },
          ],
        },
      })
    );

    expect(age).toBe(
      now - new Date(createMinutesAgoDatestamp(24 * 60)).getTime()
    );
  });

  it("prefers valid_at if older than capacity", () => {
    const age = StaleChecker.calculateAge(
      now,
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(72 * 60),
          capacity: [
            { date: createMinutesAgoDatestamp(48 * 60) },
            { date: createMinutesAgoDatestamp(24 * 60) },
          ],
        },
      })
    );

    expect(age).toBe(minutes(72 * 60));
  });

  it("gives up if there is an empty slot list", () => {
    const age = StaleChecker.calculateAge(
      now,
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(72 * 60),
          slots: [],
        },
      })
    );

    expect(age).toBeNull();
  });

  it("gives up if there is an empty capacity list", () => {
    const age = StaleChecker.calculateAge(
      now,
      createRecord({
        availability: {
          valid_at: createMinutesAgoTimestamp(72 * 60),
          capacity: [],
        },
      })
    );

    expect(age).toBeNull();
  });

  it("gives up if there is no availability object", () => {
    const age = StaleChecker.calculateAge(
      now,
      createRecord({ availability: null })
    );

    expect(age).toBeNull();
  });
});
