exports.up = function (knex) {
  return knex.schema.createTable("availability_log", (t) => {
    t.specificType("source", "varchar").notNullable();
    t.timestamp("valid_at").notNullable();
    t.timestamp("checked_at").notNullable();
    t.specificType("available", "varchar").notNullable();
    t.jsonb("meta");
    t.boolean("is_public").defaultTo(true);
    t.uuid("location_id").notNullable();
    t.integer("available_count");
    t.specificType("products", "varchar(128)[]");
    t.specificType("doses", "varchar(128)[]");
    t.specificType("capacity", "jsonb[]");
    t.specificType("slots", "jsonb[]");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("availability_log");
};
