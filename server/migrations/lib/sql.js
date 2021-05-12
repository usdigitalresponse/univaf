const fs = require("fs");
const path = require("path");

exports.readSqlFile = (filePath) => {
  const fullPath = path.join(__dirname, "..", filePath);
  return fs.readFileSync(fullPath, "utf8");
};

exports.runSqlFile = (filePath, knex) => {
  return knex.raw(this.readSqlFile(filePath));
};

exports.fileMigration = (filePath) => {
  return (knex) => this.runSqlFile(filePath, knex);
};
