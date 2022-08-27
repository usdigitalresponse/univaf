import "./matchers";
import { installTestDatabaseHooks } from "./lib";
import { createLocation, getLocationById } from "../src/db";
import { TestLocation } from "./fixtures";
import {
  main,
  groupDuplicateLocations,
} from "../scripts/remove-duplicate-locations";
import { db as scriptDb } from "../scripts/merge-locations";

installTestDatabaseHooks(scriptDb);

// FIXME: because the script DB and the server DB are separate connections
// each with a transaction, they can't see each others' actions until the
// transaction is committed, which can't happen in these tests.
// Possible fixes:
// - Use truncation instead of transactions, which we need in order to run the
//   tests for validating colons not being in ID systems:
//   https://github.com/usdigitalresponse/univaf/pull/298#discussion_r664765210
// - Rewrite the merge/duplicate scripts in TypeScript and leverage the
//   `src/db` module (see #199).
describe("remove-duplicate-locations script", () => {
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => jest.mocked(console.warn).mockRestore());

  it("should remove duplicate locations", async () => {
    let location1 = await createLocation({
      ...TestLocation,
      id: undefined,
      name: "Test location 1",
      external_ids: [
        ["some_uncommon_id", "a"],
        ["id_in_common", "xyz987"],
      ],
    });
    let location2 = await createLocation({
      ...TestLocation,
      id: undefined,
      name: "Test location 2",
      external_ids: [
        ["some_uncommon_id", "b"],
        ["id_in_common", "xyz987"],
      ],
    });

    await main({ commit: true });

    location1 = await getLocationById(location1.id);
    expect(location1).toHaveProperty(
      "external_ids",
      expect.toEqualUnordered([
        ["some_uncommon_id", "a"],
        ["id_in_common", "xyz987"],
        ["some_uncommon_id", "b"],
        ["univaf_v1", location2.id],
      ])
    );

    location2 = await getLocationById(location2.id);
    expect(location2).toBeUndefined();
  });
});

describe("groupDuplicateLocations", () => {
  it("should group duplicate locations by external IDs", async () => {
    const a = {
      ...TestLocation,
      id: "a",
      external_ids: [
        { system: "some_uncommon_id", value: "1" },
        { system: "id_in_common", value: "abc" },
        { system: "a_third_id", value: "a" },
      ],
    };
    const b = {
      ...TestLocation,
      id: "b",
      external_ids: [
        { system: "some_uncommon_id", value: "2" },
        { system: "id_in_common", value: "abc" },
        { system: "a_third_id", value: "b" },
      ],
    };
    const c = {
      ...TestLocation,
      id: "c",
      external_ids: [
        { system: "some_uncommon_id", value: "3" },
        { system: "id_in_common", value: "def" },
        { system: "a_third_id", value: "c" },
      ],
    };
    const d = {
      ...TestLocation,
      id: "d",
      external_ids: [
        { system: "some_uncommon_id", value: "4" },
        { system: "id_in_common", value: "def" },
        { system: "a_third_id", value: "d" },
      ],
    };
    const e = {
      ...TestLocation,
      id: "e",
      external_ids: [
        { system: "some_uncommon_id", value: "5" },
        { system: "id_in_common", value: "ghi" },
        { system: "a_third_id", value: "a" },
      ],
    };

    const groups = groupDuplicateLocations([a, b, c, d, e]);
    // Replace objects with IDs for easier comparisons.
    const idGroups = groups.map((group) => [...group].map((x) => x.id));
    expect(idGroups).toEqualUnordered([
      ["a", "b", "e"],
      ["c", "d"],
    ]);
  });

  it("should match IDs regardless of padding if unpadIds is set", async () => {
    const a = {
      ...TestLocation,
      id: "a",
      external_ids: [
        { system: "some_uncommon_id", value: "1" },
        { system: "id_in_common", value: "123" },
      ],
    };
    const b = {
      ...TestLocation,
      id: "b",
      external_ids: [
        { system: "some_uncommon_id", value: "2" },
        { system: "id_in_common", value: "0123" },
      ],
    };

    const groups = groupDuplicateLocations([a, b], null, true);
    // Replace objects with IDs for easier comparisons.
    const idGroups = groups.map((group) => [...group].map((x) => x.id));
    expect(idGroups).toEqualUnordered([["a", "b"]]);
  });

  it("should not match on univaf_* systems", async () => {
    const a = {
      ...TestLocation,
      id: "a",
      external_ids: [
        { system: "univaf_v0", value: "x" },
        { system: "univaf_v1", value: "y" },
      ],
    };
    const b = {
      ...TestLocation,
      id: "b",
      external_ids: [
        { system: "univaf_v0", value: "x" },
        { system: "univaf_v1", value: "y" },
      ],
    };

    const groups = groupDuplicateLocations([a, b], null, true);
    // Replace objects with IDs for easier comparisons.
    const idGroups = groups.map((group) => [...group].map((x) => x.id));
    expect(idGroups).toEqual([]);
  });

  it("should not match on vtrcks", async () => {
    const a = {
      ...TestLocation,
      id: "a",
      external_ids: [
        { system: "vtrcks", value: "x" },
        { system: "other_id", value: "y" },
      ],
    };
    const b = {
      ...TestLocation,
      id: "b",
      external_ids: [
        { system: "vtrcks", value: "x" },
        { system: "other_id", value: "z" },
      ],
    };

    const groups = groupDuplicateLocations([a, b], null, true);
    // Replace objects with IDs for easier comparisons.
    const idGroups = groups.map((group) => [...group].map((x) => x.id));
    expect(idGroups).toEqual([]);
  });

  it("should not match on npi_usa", async () => {
    const a = {
      ...TestLocation,
      id: "a",
      external_ids: [
        { system: "npi_usa", value: "x" },
        { system: "other_id", value: "y" },
      ],
    };
    const b = {
      ...TestLocation,
      id: "b",
      external_ids: [
        { system: "npi_usa", value: "x" },
        { system: "other_id", value: "z" },
      ],
    };

    const groups = groupDuplicateLocations([a, b], null, true);
    // Replace objects with IDs for easier comparisons.
    const idGroups = groups.map((group) => [...group].map((x) => x.id));
    expect(idGroups).toEqual([]);
  });

  it("should only match IDs by the given systems", async () => {
    const a = {
      ...TestLocation,
      id: "a",
      external_ids: [
        { system: "some_uncommon_id", value: "1" },
        { system: "id_in_common", value: "123" },
      ],
    };
    const b = {
      ...TestLocation,
      id: "b",
      external_ids: [
        { system: "some_uncommon_id", value: "2" },
        { system: "id_in_common", value: "0123" },
      ],
    };

    const groups = groupDuplicateLocations([a, b], ["some_uncommon_id"], true);
    // Replace objects with IDs for easier comparisons.
    const idGroups = groups.map((group) => [...group].map((x) => x.id));
    expect(idGroups).toEqual([]);
  });

  it("should not match a location to itself", async () => {
    const a = {
      ...TestLocation,
      id: "a",
      external_ids: [
        { system: "some_uncommon_id", value: "1" },
        // These two IDs match to each other when removing padding!
        { system: "id_in_common", value: "123" },
        { system: "id_in_common", value: "0123" },
      ],
    };
    const b = {
      ...TestLocation,
      id: "b",
      external_ids: [{ system: "some_uncommon_id", value: "2" }],
    };

    const groups = groupDuplicateLocations([a, b], null, true);
    // Replace objects with IDs for easier comparisons.
    const idGroups = groups.map((group) => [...group].map((x) => x.id));
    expect(idGroups).toEqual([]);
  });
});
