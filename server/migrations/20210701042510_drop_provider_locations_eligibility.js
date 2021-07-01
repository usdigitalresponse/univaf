/*
  Drops eligibility field on provider locations.
  We originally thought we’d be able to gather eligibility requirements,
  like minimum age, whether only same-county residents are allowed, etc.
  in a structured way, but that hasn’t really borne out,
  and where we have this kind of info, it’s part of the description.
*/

exports.up = function (knex) {
  return knex.schema.alterTable("provider_locations", (table) => {
    table.dropColumn("eligibility");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("provider_locations", (table) => {
    table.text("eligibility");
  });
};
