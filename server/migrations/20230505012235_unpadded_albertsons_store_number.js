/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const zeroPaddedRows = await knex("external_ids")
    .select("provider_location_id", "system", "value")
    .where("system", "albertsons_store_number")
    .where("value", "~", String.raw`:0\d+$`);

  const unpaddedRows = zeroPaddedRows.map((r) => ({
    ...r,
    value: r.value.replace(/:0+/, ":"),
  }));

  if (unpaddedRows.length) {
    return knex("external_ids")
      .insert(unpaddedRows)
      .onConflict(["provider_location_id", "system", "value"])
      .ignore();
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function () {
  console.log(
    "20230505012235_unpadded_albertsons_store_number no migrated rows changed."
  );
};
