-- Base Schema (pre-migrations)
-- We load this SQL file in the very first knex migration as a bootstrap

CREATE EXTENSION IF NOT EXISTS postgis;

-- Lists each location where someone can get a vaccination.

CREATE TABLE IF NOT EXISTS provider_locations (
    -- Useful identifer. Where possible, it should be something deterministic
    -- based on the location's data, like "CVS:1234" for CVS pharmacy #1234.
    id varchar(64) PRIMARY KEY,
    -- Object with identifiers from external systems. These are useful for
    -- managing and matching data from multiple sources.
    -- Keys identify the external system, while values are the IDs, e.g.:
    --   { "vtrcks": "abc123", "nj_iis": "NJ65329" }
    -- For a location with the VTRCKS Pin "abc123" and the New Jersey IIS
    -- Identifier "NJ65329".
    external_ids jsonb NOT NULL DEFAULT '{}',
    -- Organization operating the location.
    provider varchar,
    -- Type of location. Standardized values:
    --   "mass_vax", "clinic", "pharmacy"
    location_type varchar,
    -- Name of the location.
    name varchar NOT NULL,
    -- Street address lines.
    address_lines text[],
    city varchar,
    state varchar,
    postal_code varchar,
    county varchar,
    position geography(Point,4326),
    -- Where to get generalized COVID-related links for the location.
    info_phone varchar,
    info_url text,
    -- Where to book an appointment.
    booking_phone varchar,
    booking_url text,
    -- Eligibility requirements at this location.
    eligibility text,
    -- Additional descriptive information about this location.
    description text,
    -- Whether you must join a waitlist / cannot directly book an appointment.
    requires_waitlist boolean DEFAULT false,
    -- Additional metadata about the location not handled by this schema.
    meta jsonb,
    -- Whether this location should be included in public feeds/APIs
    is_public boolean NOT NULL DEFAULT true,
    -- Any additional notes for internal use.
    internal_notes text,
    created_at timestamp with time zone NOT NULL DEFAULT current_timestamp,
    updated_at timestamp with time zone NOT NULL DEFAULT current_timestamp
);

-- `availability` lists appointment availability checks for each record in
-- `provider_locations`. Records are unique by provider location and source.

CREATE TABLE IF NOT EXISTS availability (
    id SERIAL PRIMARY KEY,
    -- Foreign key to the provider location.
    provider_location_id varchar(64) NOT NULL,
    -- Indicates the source of the data, e.g. "CVS Scraper".
    source varchar NOT NULL,
    -- Time the source availability data was last updated.
    -- For a scraper, this will usually be the same as the time the source was
    -- checked, but for APIs, the source may indicate when it was last updated,
    -- and that's the time that should go here.
    updated_at timestamp with time zone NOT NULL,
    -- Time the data source was *checked*.
    checked_at timestamp with time zone NOT NULL,
    -- Whether there are available appointments for this location. One of:
    --   "yes" (Appointments are available)
    --   "no"  (Appointments are not available)
    --   "unknown" (We couldn't tell from the data available)
    available varchar NOT NULL,
    -- Any additional data that might be worth recording from the source, e.g.
    -- vaccine type, list of available slots, differing availability for 1st
    -- vs. 2nd dose or for different vaccine types.
    meta jsonb,
    -- Whether this record should be used in public feeds. Usually only set to
    -- false for sources that are being tested.
    is_public boolean DEFAULT true,
    CONSTRAINT fk_provider_location
      FOREIGN KEY (provider_location_id)
      REFERENCES provider_locations (id),
    CONSTRAINT unique_by_location_and_source
      UNIQUE (provider_location_id, source)
);
