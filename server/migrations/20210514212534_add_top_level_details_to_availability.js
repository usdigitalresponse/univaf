exports.up = function (knex) {
  return knex.schema.alterTable("availability", (table) => {
    table.integer("available_count");
    table.specificType("products", "varchar(128)[]");
    table.specificType("doses", "varchar(128)[]");
    table.specificType("capacity", "jsonb[]");
    table.specificType("slots", "jsonb[]");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("availability", (table) => {
    table.dropColumn("available_count");
    table.dropColumn("products");
    table.dropColumn("doses");
    table.dropColumn("capacity");
    table.dropColumn("slots");
  });
};
