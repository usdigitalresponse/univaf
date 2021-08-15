const nock = require("nock");
const { checkAvailability } = require("../src/sources/vts/geo");

const apiResponse = require("./fixtures/vts.geo.test.json");
const nopHandler = () => {};

describe("VtS Geo", () => {
  const S3_URL = "https://univaf-data-snapshots.s3.us-west-2.amazonaws.com/";

  beforeEach(() => {
    nock(S3_URL).persist().get(/.*/).reply(200, apiResponse);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("gracefully handles no states", async () => {
    const locations = await checkAvailability(nopHandler, {});
    expect(locations).toEqual([]);
  });

  it("filters by state", async () => {
    let locations;
    locations = await checkAvailability(nopHandler, { states: "NJ" });
    expect(locations.length).toBe(0);

    locations = await checkAvailability(nopHandler, { states: "CA" });
    expect(locations.length).not.toBe(0);
  });

  it("skips stores we don't care about", async () => {
    expect(apiResponse.features.length).toBe(3);

    const locations = await checkAvailability(nopHandler, { states: "CA" });
    expect(locations.length).toBe(2);
  });

  it("formats stores as expected", async () => {
    const locations = await checkAvailability(nopHandler, { states: "CA" });
    expect(locations[0]).toStrictEqual({
      external_ids: [
        ["vaccines_gov", "d91cd449-36c2-4cf5-9c1a-f4136d9a2bf7"],
        ["cvs", "9607"],
        ["vaccinespotter", "270588201"],
        ["cvs", "09607"],
      ],
      name:
        "CVS Pharmacy® & Drug Store at 901 Silver Spur Rd. Rolling Hills Estates, CA 90274",
      position: {
        latitude: 33.7692,
        longitude: -118.3665,
      },
      provider: "cvs",
    });
    expect(locations[1]).toStrictEqual({
      external_ids: [
        ["vaccinespotter", "7382057"],
        ["vaccines_gov", "f8bd637a-1a6e-4262-b3f0-7c7a6b9b887d"],
        ["rite_aid", "6466"],
      ],
      name: "Rite Aid #6466",
      position: {
        latitude: 32.71998,
        longitude: -117.16902,
      },
      provider: "rite_aid",
    });
  });
});
