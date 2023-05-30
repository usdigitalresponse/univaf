jest.mock("../src/logging");
jest.mock("../src/metrics");

const { DateTime, Duration } = require("luxon");
const logging = require("../src/logging");
const metrics = require("../src/metrics");
const { StaleChecker } = require("../src/stale");

// Keep a single, seconds-level "now" timestamp so test results are predictable.
// (Rounded to the nearest second to avoid math quirks with floats.)
// const now = new Date(Math.floor(Date.now()));
const now = DateTime.utc().set({ millisecond: 0 });

function dateAgo(timeToSubtract) {
  return now.minus(timeToSubtract).startOf("day");
}

function asMillis(durationObject) {
  return Duration.fromObject(durationObject).toMillis();
}

function createRecord(data) {
  let availability = undefined;
  if ("availability" in data && data.availability) {
    availability = {
      source: "test-source",
      valid_at: now.minus({ minutes: 10 }).toISO(),
      checked_at: now.minus({ minutes: 10 }).toISO(),
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
    logging.mock.clear();
    checker = new StaleChecker({
      relativeTo: now,
      threshold: asMillis({ days: 1 }),
    });
  });

  it("keeps statistics about record age", () => {
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: now.minus({ minutes: 10 }).toISO(),
        },
      })
    );
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: now.minus({ minutes: 20 }).toISO(),
        },
      })
    );
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: now.minus({ minutes: 30 }).toISO(),
        },
      })
    );
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: now.minus({ minutes: 24 }).toISO(),
        },
      })
    );

    const statistics = [...checker.listStatistics()];
    expect(statistics).toHaveLength(1);
    expect(statistics[0]).toEqual({
      source: "test-source",
      samples: [
        asMillis({ minutes: 10 }),
        asMillis({ minutes: 20 }),
        asMillis({ minutes: 24 }),
        asMillis({ minutes: 30 }),
      ],
      min: asMillis({ minutes: 10 }),
      max: asMillis({ minutes: 30 }),
      average: asMillis({ minutes: 21 }),
      median: asMillis({ minutes: 22 }),
    });
  });

  it("filters out stale records based on threshold", () => {
    const filterOut = checker.filterRecord(
      createRecord({
        availability: {
          valid_at: now.minus({ hours: 25 }).toISO(),
        },
      })
    );
    expect(filterOut).toBeNull();

    const filterIn = checker.filterRecord(
      createRecord({
        availability: {
          valid_at: now.minus({ hours: 23 }).toISO(),
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
          valid_at: now.minus({ hours: 25 }).toISO(),
        },
      })
    );
    checker.checkRecord(
      createRecord({
        availability: {
          source: "test-source-2",
          valid_at: now.minus({ hours: 20 }).toISO(),
        },
      })
    );
    checker.checkRecord(
      createRecord({
        availability: {
          source: "test-source-3",
          valid_at: now.minus({ hours: 25 }).toISO(),
        },
      })
    );

    checker.printSummary();
    const warnings = logging.mock.messages["warning"];
    expect(warnings).toContainEqual(
      expect.stringContaining("test-source-1 has stale data")
    );
    expect(warnings).not.toContainEqual(
      expect.stringContaining("test-source-2 has stale data")
    );
    expect(warnings).toContainEqual(
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
    expect(logging.mock.messages["warning"]).toContainEqual(
      expect.stringContaining("test-source-1 has no age information")
    );
  });

  it("sends metrics for each source", () => {
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: now.minus({ minutes: 10 }).toISO(),
        },
      })
    );
    checker.checkRecord(
      createRecord({
        availability: {
          valid_at: now.minus({ minutes: 20 }).toISO(),
        },
      })
    );

    checker.sendMetrics("prefix");

    expect(metrics.gauge).toHaveBeenCalledWith(
      "prefix.age_seconds.min",
      asMillis({ minutes: 10 }) / 1000,
      [`source:test-source`]
    );
    expect(metrics.gauge).toHaveBeenCalledWith(
      "prefix.age_seconds.max",
      asMillis({ minutes: 20 }) / 1000,
      [`source:test-source`]
    );
    expect(metrics.gauge).toHaveBeenCalledWith(
      "prefix.age_seconds.avg",
      asMillis({ minutes: 15 }) / 1000,
      [`source:test-source`]
    );
    expect(metrics.gauge).toHaveBeenCalledWith(
      "prefix.age_seconds.median",
      asMillis({ minutes: 15 }) / 1000,
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
          valid_at: now.minus({ minutes: 10 }).toISO(),
          slots: [
            { start: now.minus({ minutes: 60 }).toISO() },
            { start: now.minus({ minutes: 30 }).toISO() },
          ],
        },
      })
    );

    expect(age).toBe(asMillis({ minutes: 30 }));
  });

  it("prefers the newest capacity if older than valid_at", () => {
    const age = StaleChecker.calculateAge(
      now,
      createRecord({
        availability: {
          valid_at: now.minus({ minutes: 10 }).toISO(),
          capacity: [
            { date: dateAgo({ days: 2 }).toISODate() },
            { date: dateAgo({ days: 1 }).toISODate() },
          ],
        },
      })
    );

    expect(age).toBe(now.diff(dateAgo({ days: 1 })).toMillis());
  });

  it("prefers valid_at if older than capacity", () => {
    const age = StaleChecker.calculateAge(
      now,
      createRecord({
        availability: {
          valid_at: now.minus({ days: 3 }).toISO(),
          capacity: [
            { date: dateAgo({ days: 2 }).toISODate() },
            { date: dateAgo({ days: 1 }).toISODate() },
          ],
        },
      })
    );

    expect(age).toBe(asMillis({ days: 3 }));
  });

  it("gives up if there is an empty slot list", () => {
    const age = StaleChecker.calculateAge(
      now,
      createRecord({
        availability: {
          valid_at: now.minus({ days: 3 }).toISO(),
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
          valid_at: now.minus({ days: 3 }).toISO(),
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
