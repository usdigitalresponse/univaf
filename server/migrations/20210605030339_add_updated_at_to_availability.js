exports.up = async function (knex) {
  await knex.schema.alterTable("availability_log", (t) => {
    t.timestamp("updated_at");
  });
  await knex.schema.alterTable("availability", (t) => {
    t.timestamp("updated_at");
  });

  // Fill in updated_at based on valid_at
  await knex("availability").update("updated_at", knex.raw("valid_at"));

  // Now that values are filled in, make the field required.
  // Note that it should *not* be required on availability_log.
  await knex.schema.alterTable("availability", (t) => {
    t.timestamp("updated_at").notNullable().alter();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("availability_log", (t) => {
    t.dropColumn("updated_at");
  });
  await knex.schema.alterTable("availability", (t) => {
    t.dropColumn("updated_at");
  });
};
