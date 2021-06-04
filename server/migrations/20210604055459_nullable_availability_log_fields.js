/**
 * Remove NOT NULL constraints on all columns except `location_id`, `source`,
 * and `checked_at`. This lets the app log more abstract updates that take up,
 * less space, e.g. only include `checked_at` if none of the other data changed.
 */

exports.up = function (knex) {
  return knex.schema.alterTable("availability_log", function (t) {
    t.timestamp("valid_at").nullable().alter();
    t.specificType("available", "varchar").nullable().alter();
    t.boolean("is_public").nullable().alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("availability_log", function (t) {
    t.timestamp("valid_at").notNullable().alter();
    t.specificType("available", "varchar").notNullable().alter();
    t.boolean("is_public").defaultTo(true).notNullable().alter();
  });
};
