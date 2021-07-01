
exports.up = function(knex) {
  return knex.schema.alterTable("provider_locations", (table) => {
    table.dropColumn("eligibility");
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable("provider_locations", (table) => {
    table.text("eligibility");
  });
};
