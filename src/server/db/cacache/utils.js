/**
 * Module containing common utilities for the cacache models and database
 */
const path = require("path");

const hyperid = require("hyperid");

module.exports = {
  defaultCachePath: path.resolve(process.cwd(), "simple-mq-cache"),
  defaultCallback: (err) => {
    if (err) throw err;
  },
  generateUuid: hyperid(),
};
