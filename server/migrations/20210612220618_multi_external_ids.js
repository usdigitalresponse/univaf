exports.up = function (knex) {
  return knex.schema.alterTable("external_ids", (t) => {
    t.dropUnique(["provider_location_id", "system"]);
    t.unique(["provider_location_id", "system", "value"]);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("external_ids", (t) => {
    t.unique(["provider_location_id", "system"]);
    t.dropUnique(["provider_location_id", "system", "value"]);
  });
};
