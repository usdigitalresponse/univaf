-- DOWN MIGRATION! This reverses the migration.
-----------------------------------------------
-- Undo: Change the primary key column for provider_locations to a UUID instead
-- of an externally-determined string.

-- Add new foreign key column to availability
ALTER TABLE availability
  ADD COLUMN provider_location_id varchar(128),
  DROP CONSTRAINT availability_location_id_fkey;
UPDATE availability
  SET provider_location_id = provider_locations.id_old
  FROM provider_locations
  WHERE provider_locations.id = availability.location_id;

-- Swap primary keys: delete id, id_old -> id
-- (We're keeping the old ID around for now just in case.)
ALTER TABLE provider_locations
  DROP CONSTRAINT provider_locations_pkey,
  ALTER COLUMN id DROP NOT NULL;
ALTER TABLE provider_locations DROP COLUMN id;
ALTER TABLE provider_locations RENAME COLUMN id_old TO id;
ALTER TABLE provider_locations ADD PRIMARY KEY (id);

-- Drop the old foreign key and set the new column as a foreign key
ALTER TABLE availability
  DROP COLUMN location_id,
  ALTER COLUMN provider_location_id SET NOT NULL,
  ADD CONSTRAINT fk_provider_location
    FOREIGN KEY (provider_location_id) REFERENCES provider_locations (id);
