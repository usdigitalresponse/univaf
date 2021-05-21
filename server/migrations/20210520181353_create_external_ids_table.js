exports.up = async function (knex) {
  await knex.schema.createTable("external_ids", (t) => {
    t.increments("id");
    t.uuid("provider_location_id");
    t.text("system");
    t.text("value");
    t.timestamps(true, true);

    t.index(["provider_location_id"]);
    t.index(["system", "value"]);
  });

  await migrateExternalIds(knex);

  await knex.schema.table("provider_locations", (t) => {
    t.renameColumn("external_ids", "external_ids_old");
  });
};

exports.down = async function (knex) {
  await knex.schema.table("provider_locations", (t) => {
    t.renameColumn("external_ids_old", "external_ids");
  });

  await knex.schema.dropTable("external_ids");
};

async function migrateExternalIds(knex) {
  const locations = await knex("provider_locations").select(
    "id",
    "external_ids"
  );

  const rows = [];
  for (const location of locations) {
    for (const [system, value] of Object.entries(location.external_ids)) {
      rows.push({
        provider_location_id: location.id,
        system,
        value,
      });
    }
  }
  return knex.batchInsert("external_ids", rows);
}
