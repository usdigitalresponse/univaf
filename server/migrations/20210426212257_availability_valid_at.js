
exports.up = function(knex) {
  return knex.schema.alterTable('availability', t => {
    t.renameColumn('updated_at', 'valid_at');
  })
};

exports.down = function(knex) {
  return knex.schema.alterTable('availability', t => {
    t.renameColumn('valid_at', 'updated_at');
  })
};
