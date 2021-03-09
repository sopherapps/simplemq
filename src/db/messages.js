/**
 * Model for the messages
 */

const Model = require("./base/model");

class Messages extends Model {
  constructor(ttl, ttlInterval) {
    super("messages", "id", {
      ttl,
      ttlInterval,
    });
    this.schema = {
      type: "object",
      properties: {
        id: {
          type: "string",
        },
        topic: {
          type: "string",
        },
        data: {
          type: "object",
          patternProperties: {
            "^.*$": {},
          },
          additionalProperties: false,
        },
      },
    };
  }
}

module.exports = {
  Messages,
};
