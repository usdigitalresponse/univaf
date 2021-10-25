/**
 * Kroger uses 8 digit store numbers that are unique across all Kroger brands
 * (Kroger, Ralph's, Fred Meyer, etc.) in most places. (In some places, we've
 * seen them use 5-digit numbers that are unique to the brand, and appear to
 * be the last 5 digits of the 8 digit number.)
 *
 * When this is the case, this migration adds the same value as a generic
 * identifier in the "kroger" system so we can more easily match against it.
 *
 * For example, if we have:
 *     { system: "kroger_ralphs", value: "70300757", provider_location_id: "x" }
 * This will add another ID like:
 *     { system: "kroger", value: "70300757", provider_location_id: "x" }
 */

exports.up = async function (knex) {
  const krogerIds = await knex("external_ids")
    .select("provider_location_id", "system", "value")
    .where("system", "LIKE", "kroger_%")
    .where((builder) =>
      // In some cases, we have non-zero-padded IDs with only 7 characters.
      builder
        .where(knex.raw("character_length(value)"), 8)
        .orWhere(knex.raw("character_length(value)"), 7)
    );

  const newIds = krogerIds.map((row) => ({
    ...row,
    system: "kroger",
  }));

  if (newIds.length) {
    const result = await knex("external_ids")
      .insert(newIds)
      .onConflict(["provider_location_id", "system", "value"])
      .ignore();

    console.log("Added", result.rowCount, "`kroger` IDs");
  }
};

exports.down = async function () {
  console.log("add_generic_kroger_ids.js: No migrated rows removed.");
};
