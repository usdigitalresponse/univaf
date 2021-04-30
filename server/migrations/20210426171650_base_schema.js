const fs = require("fs");
const path = require("path");

exports.up = function (knex) {
  const baseSchemaPath = path.join(__dirname, "../db/base_schema.sql");
  return knex.raw(fs.readFileSync(baseSchemaPath, "utf8"));
};

exports.down = function (knex) {
  return knex.schema.dropTable("availability").dropTable("provider_locations");
};
