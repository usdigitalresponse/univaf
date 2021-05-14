exports.up = function (knex) {
  return knex.schema.alterTable("availability", (t) => {
    t.unique(["location_id", "source"], "unique_by_location_and_source");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("availability", (t) => {
    t.dropUnique(["location_id", "source"], "unique_by_location_and_source");
  });
};
