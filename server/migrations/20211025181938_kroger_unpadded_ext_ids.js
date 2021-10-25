/**
 * Add new external IDs without zero-padding for all `kroger` and `kroger_*`
 * ID systems. For example, if we have a location with the external ID:
 *   { system: "kroger", value: "01234567", provider_location_id: "x" }
 * Add another external ID like:
 *   { system: "kroger", value: "1234567", provider_location_id: "x" }
 */

exports.up = async function (knex) {
  const zeroPaddedRows = await knex("external_ids")
    .select("provider_location_id", "system", "value")
    .where("system", "LIKE", "kroger%")
    .where("value", "~", String.raw`^0\d+$`);

  const unpaddedRows = zeroPaddedRows.map((r) => ({
    ...r,
    value: r.value.replace(/^0+/, ""),
  }));

  if (unpaddedRows.length) {
    const result = await knex("external_ids")
      .insert(unpaddedRows)
      .onConflict(["provider_location_id", "system", "value"])
      .ignore();

    console.log("Added", result.rowCount, "unpadded `kroger*` IDs");
  }
};

exports.down = async function () {
  console.log("kroger_unpadded_ext_ids.js: No migrated rows removed.");
};
