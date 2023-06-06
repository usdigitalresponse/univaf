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
