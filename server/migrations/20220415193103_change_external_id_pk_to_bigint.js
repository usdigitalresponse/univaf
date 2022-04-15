/**
 * Change the primary key type on `external_ids` from integer to bigint.
 *
 * We have an issue where we frequently do `INSERT INTO ... ON CONFLICT UPDATE`,
 * and it turns out that increments the sequence for the primary key every time
 * it runs. Even though we have relatively few rows, we've completely exhaused
 * all possible integers! Changing the type to bigint gives us some breathing
 * room to do something better (bigint is also big enough that we could just
 * not solve the fundamental problem and still probably be fine for the lifetime
 * of this project).
 */

exports.up = async function (knex) {
  await knex.raw(`
    ALTER TABLE external_ids ALTER COLUMN id TYPE bigint;
    ALTER SEQUENCE external_ids_id_seq AS bigint;
  `);
};

exports.down = async function (knex) {
  await knex.raw(`
    ALTER SEQUENCE external_ids_id_seq AS integer;
    ALTER TABLE external_ids ALTER COLUMN id TYPE integer;
  `);
};
