exports.up = async function (knex) {
  const zeroPaddedRows = await knex("external_ids")
    .select("provider_location_id", "system", "value")
    .where("system", "cvs")
    .where("value", "~", String.raw`^0\d+$`);

  const unpaddedRows = zeroPaddedRows.map((r) => ({
    ...r,
    value: r.value.replace(/^0+/, ""),
  }));

  return knex("external_ids")
    .insert(unpaddedRows)
    .onConflict(["provider_location_id", "system", "value"])
    .ignore();
};

exports.down = async function () {
  console.log("20210722181933_unpadded_ext_ids.js: No migrated rows removed.");
};
