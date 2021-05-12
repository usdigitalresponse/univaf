const sql = require("./lib/sql");

exports.up = sql.fileMigration("base_schema.sql");

exports.down = function (knex) {
  return knex.schema.dropTable("availability").dropTable("provider_locations");
};
