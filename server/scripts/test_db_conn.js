#!/usr/bin/env node
/**
 * Script to verify the database is reachable
 */

const knex = require("knex");
const knexConfig = require("../knexfile");

const db = knex(knexConfig.development);

async function main() {
  const count = await db("availability").select().count("*").first();
  console.log(count);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
