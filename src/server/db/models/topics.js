/**
 * Model for the topics
 */
const { Model } = require("../base/model");

class Topics extends Model {
  constructor() {
    super("topics");
    this.schema = {
      type: "string",
      description: "The client id of each subscriber of the given topic",
    };

    // bindings
    this.generateClientIdForTopic = this.generateClientIdForTopic.bind(this);
    this.getKeyRangeForTopic = this.getKeyRangeForTopic.bind(this);
  }

  /**
   * Generates a clientId that is specific to that topic so that it can be used to generate unique keys
   * @param {string} topic - the name of the topic
   * @param {string} clientId - the clientId of the subscriber
   * @returns {string} - the enhanced id
   */
  // eslint-disable-next-line class-methods-use-this
  generateClientIdForTopic(topic, clientId) {
    return `${topic}:${clientId}`;
  }

  /**
   * Returns the range of keys for the given topic
   * @param {string} topic - name of topic
   * @returns {{lt: string, gte: string}} - the range to pass in options
   */
  getKeyRangeForTopic(topic) {
    return {
      lt: `${this.collectionName}:${String.fromCharCode(
        topic.charCodeAt(0) + 1
      )}`,
      gte: `${this.collectionName}:${topic}`,
    };
  }
}

module.exports = {
  Topics,
};
