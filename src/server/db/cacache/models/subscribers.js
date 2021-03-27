/**
 * Model for the subscribers
 */
const path = require("path");
const { Model } = require("../base/model");

class Subscribers extends Model {
  /**
   * Each subscriber has their own cache file on the path baseCachePath/{clientId}
   * @param {string} baseCachePath - the path to the folder containing the cache files for all data
   */
  constructor(baseCachePath) {
    super("subscribers", { baseCachePath });
    this.schema = {
      type: "string",
      description: "The message ids for the given subscriber",
    };
  }

  /**
   * Generates the cachePath for the subscriber of the given clientId
   * @param {string} clientId - the id of the subscriber
   * @returns {string}
   */
  generateCachePath(clientId) {
    return path.resolve(this.cachePath, clientId);
  }
}

module.exports = {
  Subscribers,
};
