exports.up = function (knex) {
  return knex.raw(`
    CREATE INDEX index_provider_locations_external_ids_json
    ON provider_locations
    USING GIN (external_ids jsonb_path_ops)
  `);
};

exports.down = function (knex) {
  return knex.raw("DROP INDEX index_provider_locations_external_ids_json");
};
