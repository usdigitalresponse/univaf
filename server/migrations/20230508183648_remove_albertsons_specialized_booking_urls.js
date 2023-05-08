const specializedBookingFields = [
  "booking_url_adult",
  "booking_url_pediatric",
  "booking_url_infant",
];

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const ids = new Set();

  for (const field of specializedBookingFields) {
    const updated = await knex("provider_locations")
      .whereRaw(
        `strpos(lower(coalesce(meta->>'${field}', '')), 'mhealthcoach') > 0`
      )
      .update("meta", knex.raw(`meta - '${field}'`), ["id"]);
    for (const row of updated) {
      ids.add(row.id);
    }
  }

  const updated = await knex("provider_locations")
    .where(
      knex.raw(
        `jsonb_path_query_first(meta, '$.booking_urls[*].url \\? (@ like_regex "mhealthcoach" flag "i")') IS NOT NULL`
      )
    )
    .update("meta", knex.raw(`meta - 'booking_urls'`), ["id"]);
  for (const row of updated) {
    ids.add(row.id);
  }

  console.log(`Removed specialized booking URLs from ${ids.size} rows`);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function () {
  console.log(
    "20230508183648_remove_albertsons_specialized_booking_urls: No migrated rows reversed."
  );
};
