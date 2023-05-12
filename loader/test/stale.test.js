const { StaleChecker } = require("../src/stale");

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
    availability: {
      source: "test-source",
      valid_at: createMinutesAgoTimestamp(10),
      checked_at: createMinutesAgoTimestamp(10),
      available: "YES",
      available_count: 191,
      ...data.availability,
    },
  };
}

describe("StaleChecker", () => {
  let checker;
  beforeEach(() => {
    checker = new StaleChecker({ relativeTime: now });
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
});
