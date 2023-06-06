/**
 * Clean out the original ID and external ID fields for locations. They were
 * deprecated and renamed way back in May 2021, and should be dropped.
 */

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable("provider_locations", function (table) {
    table.dropColumn("id_old");
    table.dropColumn("external_ids_old");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable("provider_locations", (table) => {
    table.specificType("id_old", "varchar(128)").nullable();
    table
      .specificType("external_ids_old", "jsonb")
      .notNullable()
      .defaultTo("{}");
  });
};
