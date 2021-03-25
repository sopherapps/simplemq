/**
 * Model for the messages
 */

const { Model } = require("../base/model");

class Messages extends Model {
  constructor(ttl, ttlInterval) {
    super("messages", "topic", {
      ttl,
      ttlInterval,
    });
    this.schema = {
      type: "object",
      description: "The message saved in the queue",
      properties: {
        id: {
          description:
            "The internally automatically generated id for the message",
          type: "number",
        },
        topic: {
          description: "The topic to which the message is posted",
          type: "string",
        },
        data: {
          description: "The actual payload",
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
