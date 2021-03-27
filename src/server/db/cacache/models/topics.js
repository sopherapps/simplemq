/**
 * Model for the topics
 */
const path = require("path");
const { Model } = require("../base/model");

class Topics extends Model {
  /**
   * Each topic has their own cache file on the path baseCachePath/{topic}
   * @param {string} baseCachePath - the path to the folder containing the cache files for all data
   */
  constructor(baseCachePath) {
    super("topics", { baseCachePath });
    this.schema = {
      type: "string",
      description: "The client id of each subscriber of the given topic",
    };

    // binding
    this.generateCachePath = this.generateCachePath.bind(this);
  }

  /**
   * Generates the cachePath for the topic of the given topic name
   * @param {string} topic - the name of the topic
   * @returns {string}
   */
  generateCachePath(topic) {
    return path.resolve(this.cachePath, topic);
  }
}

module.exports = {
  Topics,
};
