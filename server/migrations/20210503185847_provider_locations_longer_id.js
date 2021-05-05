/**
 * Increase the maximum length of the ID for provider locations. Ultimately,
 * we probably want to replace it with an int, but for now, we have some
 * locations with longer IDs that we need to support.
 */
exports.up = function (knex) {
  return Promise.all([
    knex.raw(`
      ALTER TABLE provider_locations
        ALTER COLUMN id TYPE varchar(128)
    `),
    knex.raw(`
      ALTER TABLE availability
        ALTER COLUMN provider_location_id TYPE varchar(128)
    `),
  ]);
};

exports.down = function (knex) {
  return Promise.all([
    knex.raw(`
      ALTER TABLE provider_locations
        ALTER COLUMN id TYPE varchar(64)
    `),
    knex.raw(`
      ALTER TABLE availability
        ALTER COLUMN provider_location_id TYPE varchar(64)
    `),
  ]);
};
