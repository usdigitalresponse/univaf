const base = {
  client: "postgresql",
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  },
  migrations: {
    tableName: "migrations",
  },
};

module.exports = {
  development: base,
  production: base,
  test: {
    ...base,
    connection: {
      ...base.connection,
      database: `${base.connection.database}-test`,
    },
    pool: { min: 1, max: 1 },
  },
};
