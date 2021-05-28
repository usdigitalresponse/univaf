exports.up = function (knex) {
  return knex.schema.alterTable("availability_log", async (t) => {
    await knex.raw(
      `CREATE INDEX IF NOT EXISTS availability_log_checked_at_idx ON availability_log (checked_at)`
    );
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("availability_log", async (t) => {
    await t.dropIndex("checked_at", "availability_log_checked_at_idx");
  });
};
