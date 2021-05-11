/**
 * Change the primary key column for provider_locations to an auto-incrementing
 * integer instead of an externally-determined string.
 *
 * The main goal here is to make location IDs meaningless, relatively short,
 * and constrained. Having meaningful, loader-determined strings was a useful
 * shortcut, but a bad choice in the long run. Anytime we need to match things
 * up between systems, we should be using `location.external_ids`, rather than
 * hoping the `id` is set to something useful for the comparison needed.
 */
exports.up = async function (knex) {
  // Add new column to locations
  await knex.raw(
    `ALTER TABLE provider_locations
      ADD COLUMN id_new uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()`
  );
  // Drop old FK constraint and add new column to availability
  await knex.raw(`
    ALTER TABLE availability
      ADD COLUMN location_id uuid,
      DROP CONSTRAINT fk_provider_location
  `);
  // Fill in the new FK column
  await knex.raw(`
    UPDATE availability
      SET location_id = provider_locations.id_new
      FROM provider_locations
      WHERE provider_locations.id = availability.provider_location_id
  `);
  // Drop primary-key-ness
  await knex.raw(`
    ALTER TABLE provider_locations
      DROP CONSTRAINT provider_locations_pkey,
      ALTER COLUMN id DROP NOT NULL
  `);
  // Swap columns: id -> id_old, id_new -> id
  // (We're keeping the old ID around for now just in case.)
  await knex.raw(`ALTER TABLE provider_locations RENAME COLUMN id TO id_old`);
  await knex.raw(`ALTER TABLE provider_locations RENAME COLUMN id_new TO id`);
  // Make new id column the primary key
  await knex.raw(`ALTER TABLE provider_locations ADD PRIMARY KEY (id)`);
  // Add external_ids entry for old ID as `{ univaf_v0: "<old ID>" }`
  await knex.raw(`
    UPDATE provider_locations
      SET external_ids = external_ids || jsonb_build_object('univaf_v0', id_old)
  `);
  // Drop the old foreign key and set the new column as a foreign key
  await knex.raw(`
    ALTER TABLE availability
      DROP COLUMN provider_location_id,
      ALTER COLUMN location_id SET NOT NULL,
      ADD CONSTRAINT availability_location_id_fkey
        FOREIGN KEY (location_id) REFERENCES provider_locations (id)
  `);
};

exports.down = async function (knex) {
  // Add new column to locations
  // await knex.raw(`ALTER TABLE provider_locations ADD COLUMN id_new varchar(128)`);

  // Drop old FK constraint and add new column to availability
  await knex.raw(`
    ALTER TABLE availability
      ADD COLUMN provider_location_id varchar(128),
      DROP CONSTRAINT availability_location_id_fkey
  `);
  // Fill in the new FK column
  await knex.raw(`
    UPDATE availability
      SET provider_location_id = provider_locations.id_old
      FROM provider_locations
      WHERE provider_locations.id = availability.location_id
  `);
  // Drop primary-key-ness
  await knex.raw(`
    ALTER TABLE provider_locations
      DROP CONSTRAINT provider_locations_pkey,
      ALTER COLUMN id DROP NOT NULL
  `);
  // Swap columns: delete id, id_old -> id
  // (We're keeping the old ID around for now just in case.)
  await knex.raw(`ALTER TABLE provider_locations DROP COLUMN id`);
  await knex.raw(`ALTER TABLE provider_locations RENAME COLUMN id_old TO id`);
  // Make new id column the primary key
  await knex.raw(`ALTER TABLE provider_locations ADD PRIMARY KEY (id)`);
  // Drop the old foreign key and set the new column as a foreign key
  await knex.raw(`
    ALTER TABLE availability
      DROP COLUMN location_id,
      ALTER COLUMN provider_location_id SET NOT NULL,
      ADD CONSTRAINT fk_provider_location
        FOREIGN KEY (provider_location_id) REFERENCES provider_locations (id)
  `);
};
