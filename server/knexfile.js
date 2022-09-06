/** @type {import("knex").Knex.Config} */
const base = {
  client: "postgresql",
  connection: process.env.DB_URL || {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  },
  migrations: {
    tableName: "migrations",
  },
  pool: {
    min: 0,
    max: 10,
    afterCreate(conn, done) {
      // Ensure Postgres formats times in UTC.
      conn.query('SET timezone="UTC";', done);
    },
  },
};

let testConnection;
if (typeof base.connection === "string") {
  const url = new URL(base.connection);
  if (!url.pathname || url.pathname === "/") {
    throw new Error(
      `DB_URL must be in the form: "postgres://<user>:<password>@<host>:<port>/<dbname>?other=parameters" (not "${base.connection}")`
    );
  }
  url.pathname = `${url.pathname.slice(1)}-test`;
  testConnection = url.toString();
} else {
  testConnection = {
    ...base.connection,
    database: `${base.connection.database}-test`,
  };
}

module.exports = {
  development: base,
  production: base,
  test: {
    ...base,
    connection: testConnection,
    pool: { ...base.pool, min: 1, max: 1 },
  },
};
