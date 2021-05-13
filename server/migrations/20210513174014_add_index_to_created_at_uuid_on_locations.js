exports.up = function (knex) {
  return knex.schema.alterTable("provider_locations", (t) => {
    t.index(["created_at", "id"], "index_provider_locations_created_at_id");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("provider_locations", (t) => {
    t.dropIndex(["created_at", "id"], "index_provider_locations_created_at_id");
  });
};
