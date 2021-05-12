-- Change the primary key column for provider_locations to a UUID instead of an
-- externally-determined string.
--
-- The main goal here is to make location IDs meaningless, *relatively* short,
-- and constrained. Having meaningful, loader-determined strings was a useful
-- shortcut, but a bad choice in the long run. Anytime we need to match things
-- up between systems, we should be using `location.external_ids`, rather than
-- hoping the `id` is set to something useful for the comparison needed.

-- Add new ID column
ALTER TABLE provider_locations
  ADD COLUMN id_new uuid NOT NULL UNIQUE DEFAULT gen_random_uuid();

-- Add new foreign key column to availability
ALTER TABLE availability
  ADD COLUMN location_id uuid,
  DROP CONSTRAINT fk_provider_location;
UPDATE availability
  SET location_id = provider_locations.id_new
  FROM provider_locations
  WHERE provider_locations.id = availability.provider_location_id;

-- Swap out the primary keys for locations: id -> id_old, id_new -> id
-- (We're keeping the old ID around for now just in case.)
ALTER TABLE provider_locations
  DROP CONSTRAINT provider_locations_pkey,
  ALTER COLUMN id DROP NOT NULL;
ALTER TABLE provider_locations RENAME COLUMN id TO id_old;
ALTER TABLE provider_locations RENAME COLUMN id_new TO id;
ALTER TABLE provider_locations ADD PRIMARY KEY (id);

-- Add external_ids entry for old ID as '{ univaf_v0: "<old ID>" }'
UPDATE provider_locations
  SET external_ids = external_ids || jsonb_build_object('univaf_v0', id_old);

-- On availability, switch the foreign key
ALTER TABLE availability
  DROP COLUMN provider_location_id,
  ALTER COLUMN location_id SET NOT NULL,
  ADD CONSTRAINT availability_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES provider_locations (id);
