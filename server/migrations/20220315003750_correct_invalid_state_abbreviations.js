/**
 * Update the `state` field to always be a correct USPS state abbreviation.
 * We have some bad values that need cleaning up.
 */

exports.up = async function (knex) {
  // These are all the bad values we currently have, excepting a few non-public
  // locations with null states (and lots of other fields that probably
  // shouldn't be null). Those ones aren't worth trying to repair.
  const states = [
    ["alaska", "AK"],
    ["washington", "WA"],
  ];

  let count = 0;
  for (const [badText, goodText] of states) {
    count += await knex("provider_locations")
      .where("state", "ILIKE", badText)
      .update({ state: goodText });
  }

  console.log("Updated", count, "bad state abbreviations.");
};

exports.down = async function () {
  console.log(
    "20220315003750_correct_invalid_state_abbreviations: No migrated rows changed."
  );
};
