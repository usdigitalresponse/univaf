/**
 * `availability.updated_at` tracks the last time the availability data was
 * changed (independent of `checked_at` and `updated_at`).
 *
 * It's always present on `availability`, but is nullable on logs so we don't
 * need to update the monstrously giant backlog of log data we have. (But in
 * in new logs, it should always be set.)
 */
exports.up = async function (knex) {
  await Promise.all([
    knex.schema.alterTable("availability_log", (t) => {
      t.timestamp("updated_at");
    }),
    knex.schema.alterTable("availability", (t) => {
      t.timestamp("updated_at");
    }),
  ]);

  // Fill in updated_at based on valid_at
  await knex("availability").update("updated_at", knex.raw("valid_at"));

  // Now that values are filled in, make the field required.
  await knex.schema.alterTable("availability", (t) => {
    t.timestamp("updated_at").notNullable().alter();
  });
};

exports.down = async function (knex) {
  await Promise.all([
    knex.schema.alterTable("availability_log", (t) => {
      t.dropColumn("updated_at");
    }),
    knex.schema.alterTable("availability", (t) => {
      t.dropColumn("updated_at");
    }),
  ]);
};
