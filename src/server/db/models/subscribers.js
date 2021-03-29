/**
 * Model for the subscribers
 */
const { Model } = require("../base/model");

class Subscribers extends Model {
  constructor() {
    super("subscribers");
    this.schema = {
      type: "string",
      description: "The message ids for the given subscriber",
    };

    // bindings
    this.generateMessageIdForSubscriber = this.generateMessageIdForSubscriber.bind(
      this
    );
    this.getKeyRangeForSubscriber = this.getKeyRangeForSubscriber.bind(this);
  }

  /**
   * Generates a key that is unique for the message of id messageId and subscriber of client id clientId
   * @param {string} clientId - the clientId of the subscriber
   * @param {string} messageId - the message id
   * @returns {string}
   */
  // eslint-disable-next-line class-methods-use-this
  generateMessageIdForSubscriber(clientId, messageId) {
    return `${clientId}:${messageId}`;
  }

  /**
   * Returns the range of keys for the given subscriber
   * @param {string} clientId - clientId of subscriber
   * @returns {{lt: string, gte: string}} - the range to pass in options
   */
  getKeyRangeForSubscriber(clientId) {
    return {
      lt: `${this.collectionName}:${String.fromCharCode(
        clientId.charCodeAt(0) + 1
      )}`,
      gte: `${this.collectionName}:${clientId}`,
    };
  }
}

module.exports = {
  Subscribers,
};
