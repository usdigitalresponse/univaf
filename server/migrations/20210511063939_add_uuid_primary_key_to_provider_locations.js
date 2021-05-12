/**
 * Change the primary key column for provider_locations to a UUID instead of an
 * externally-determined string.
 *
 * The main goal here is to make location IDs meaningless, *relatively* short,
 * and constrained. Having meaningful, loader-determined strings was a useful
 * shortcut, but a bad choice in the long run. Anytime we need to match things
 * up between systems, we should be using `location.external_ids`, rather than
 * hoping the `id` is set to something useful for the comparison needed.
 */

// This migration is pretty messy to do via Knex abstractions, so the code is
// in separate SQL files.
const sql = require("./lib/sql");
exports.up = sql.fileMigration(
  "20210511063939_add_uuid_primary_key_to_provider_locations.up.sql"
);
exports.down = sql.fileMigration(
  "20210511063939_add_uuid_primary_key_to_provider_locations.down.sql"
);
