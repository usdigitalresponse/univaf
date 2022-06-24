/**
 * Add a field to track minimum ages for vaccination at locations. This is
 * different from what ages a given vaccine is for — each location has
 * pharmacists or doctors who are authorized to work with children down to a
 * particular age, and that's what we're capturing here.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable("provider_locations", (t) => {
    t.integer("minimum_age_months");
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("provider_locations", (t) => {
    t.dropColumn("minimum_age_months");
  });
};
