/**
 * Model for the topics
 */

const { LevelDbModel } = require("../base/model");

class Topics extends LevelDbModel {
  constructor() {
    super("topics");
    this.schema = {
      type: "object",
      description: "The topics created in this message queue",
      properties: {
        topic: {
          description: "The name of the topic",
          type: "string",
        },
        subscribers: {
          description:
            "The ids of subcribers to given topic, saved as an object of string: integer",
          type: "object",
          patternProperties: {
            "^.*$": { type: "integer" },
          },
          additionalProperties: false,
        },
      },
    };
  }
}

module.exports = {
  Topics,
};
