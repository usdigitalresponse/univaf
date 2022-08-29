import { createLocation, updateAvailability } from "../../src/db";
import { ProviderLocation } from "../../src/interfaces";
import { TestLocation } from "../fixtures";

/**
 * Create a new provider with random identifiers.
 * @param customizations Any specific values that should be set on the location.
 *        If the `availability` property is set, an availability record will
 *        also be created for the location (the value for `availability` only
 *        needs to have the values you want to customize, acceptable values for
 *        unspecified but required properties will be created for you).
 * @returns {ProviderLocation}
 */
export async function createRandomLocation(
  customizations: any
): Promise<ProviderLocation> {
  const location = await createLocation({
    ...TestLocation,
    id: null,
    external_ids: [["test_id", Math.random().toString()]],
    ...customizations,
  });

  if (customizations.availability) {
    await updateAvailability(location.id, {
      ...TestLocation.availability,
      ...customizations.availability,
    });
  }

  return location;
}

// TODO: this is a copy of `expectDatetimeString` in loader/test/support/index`;
// the implementatoins should be shared.
/**
 * Declare that a value should be a complete W3C-style ISO 8601 datetime
 * string. (e.g. "2021-03-13T05:53:20.123Z")
 *
 * @example
 * const value = { time: "2021-03-13T05:53:20.123Z" };
 * expect(value).toEqual({ time: expectDatetimeString() })
 */
export function expectDatetimeString(): any {
  return expect.stringMatching(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(.\d+)?(Z|[+-]\d\d:?\d\d)$/
  );
}

// TODO: this is the same as `parseJsonLines` in loader/src/utils; the
// implementations should be shared.
/**
 * Parse an ND-JSON (newline-delimited JSON) string in to an array of objects.
 * @param rawData the ND-JSON string to parse.
 */
export function ndjsonParse(rawData: string): any[] {
  return rawData
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
