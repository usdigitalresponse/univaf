/**
 * The Centura Driveup Event and Denver Ball Arena locations in Colorado were
 * mass vaccination sites tht have since closed. Make them private so they
 * don't show up in the API anymore.
 */

exports.up = async function (knex) {
  const result = await knex("provider_locations")
    .where("provider", ["centura_driveup_event", "denver_ball_arena"])
    .update({ is_public: false });

  console.log("Updated", result, "locations");
};

exports.down = async function (knex) {
  console.log(
    "hide_centura_and_ball_arena_locations.js: No migrated rows changed."
  );
};
