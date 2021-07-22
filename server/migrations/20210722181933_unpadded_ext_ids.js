exports.up = async function (knex) {
  zeroPaddedRows = await knex("external_ids")
    .select("provider_location_id", "system", "value")
    .where("system", "cvs")
    .where("value", "~", "^0\\d+$");

  unpaddedRows = zeroPaddedRows.map((r) => ({
    ...r,
    value: r.value.replace(/^0+/, ""),
  }));

  return knex.batchInsert("external_ids", unpaddedRows);
};

exports.down = async function (knex) {
  console.log("20210722181933_unpadded_ext_ids.js: No migrated rows removed.");
};
