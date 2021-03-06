/**
 * Module containing common configuration
 */
const path = require("path");

const PROTOBUF_FILE_PATH = path.resolve(__dirname, "article_curator.proto");

module.exports = {
  PROTOBUF_FILE_PATH,
};
