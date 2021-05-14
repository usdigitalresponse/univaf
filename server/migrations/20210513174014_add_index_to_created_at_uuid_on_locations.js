exports.up = function (knex) {
  return Promise.all([
    // Optimize sorting locations
    knex.schema.alterTable("provider_locations", (t) => {
      t.index(["created_at", "id"], "index_provider_locations_created_at_id");
    }),
    // Optimize getting the latest availability per location.
    // The second, partial index is useful for public queries.
    knex.raw(`
      CREATE INDEX index_availability_location_id_valid_at
        ON availability (location_id, valid_at DESC);

      CREATE INDEX index_availability_location_id_valid_at_public
        ON availability (location_id, valid_at DESC)
        WHERE is_public = true;
    `),
  ]);
};

exports.down = function (knex) {
  return Promise.all([
    knex.schema.alterTable("provider_locations", (t) => {
      t.dropIndex(
        ["created_at", "id"],
        "index_provider_locations_created_at_id"
      );
    }),
    knex.raw(`
      DROP INDEX index_availability_location_id_valid_at;
      DROP INDEX index_availability_location_id_valid_at_public;
    `),
  ]);
};
