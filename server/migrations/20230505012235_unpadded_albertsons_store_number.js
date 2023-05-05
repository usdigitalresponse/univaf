const brandKeys = [
  "acme",
  "albertsons_market",
  "albertsons",
  "amigos",
  "carrs",
  "haggen",
  "jewelosco",
  "luckys",
  "market_street",
  "pak_n_save",
  "pavilions",
  "randalls_pharmacy",
  "randalls",
  "safeway",
  "sav_on",
  "shaws",
  "star_market",
  "tom_thumb",
  "united",
  "vons",
  "albertsons_corporate",
  "community_clinic",
];

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const zeroPaddedParentRows = await knex("external_ids")
    .select("provider_location_id", "system", "value")
    .where("system", "albertsons_store_number")
    .where("value", "~", String.raw`:0\d+$`);

  const unpaddedParentRows = zeroPaddedParentRows.map((r) => ({
    ...r,
    value: r.value.replace(/:0+/, ":"),
  }));

  const zeroPaddedBrandRows = await knex("external_ids")
    .select("provider_location_id", "system", "value")
    .whereIn("system", brandKeys)
    .where("value", "~", String.raw`^0\d+$`);

  const unpaddedBrandRows = zeroPaddedBrandRows.map((r) => ({
    ...r,
    value: r.value.replace(/^0+/, ":"),
  }));

  const unpaddedRows = [...unpaddedParentRows, ...unpaddedBrandRows];
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
