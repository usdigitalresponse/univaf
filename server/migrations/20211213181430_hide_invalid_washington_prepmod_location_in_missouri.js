/**
 * We've discovered some bad data from the Washington DoH that we should remove.
 */

exports.up = async function (knex) {
  const rows = await knex("external_ids")
    .where("system", "wa_doh")
    .where("value", "prep-mod-3696ec0d-3869-4ff4-88ce-1030db1639ef")
    .distinctOn("provider_location_id");

  for (const row of rows) {
    await knex("provider_locations")
      .where("id", row.provider_location_id)
      .update({
        is_public: false,
        internal_notes: "This is seemingly bad data from WA DoH's database.",
      });
  }

  console.log("Updated", rows.length, "locations");
};

exports.down = async function () {
  console.log(
    "hide_invalid_washington_prepmod_location_in_missouri.js: No migrated rows changed."
  );
};
