/**
 * The previous migration was broken; this is the same thing but done correctly.
 */

exports.up = async function (knex) {
  const result = await knex("provider_locations")
    .where("provider", "in", ["centura_driveup_event", "denver_ball_arena"])
    .update({ is_public: false });

  console.log("Updated", result, "locations");
};

exports.down = async function () {
  console.log(
    "hide_centura_and_ball_arena_locations.js: No migrated rows changed."
  );
};
