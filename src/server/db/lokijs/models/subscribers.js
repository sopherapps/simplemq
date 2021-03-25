/**
 * Model for the subscribers
 */

const { Model } = require("../lokijs/base/model");

class Subscribers extends Model {
  constructor() {
    super("subscribers", "clientId");
    this.schema = {
      type: "object",
      description:
        "The subscribers that have reqistered with this message queue",
      properties: {
        clientId: {
          description:
            "The client generated unique id used to identify each client on reconnection",
          type: "string",
        },
        messageIds: {
          description:
            "The ids of yet-to-be-consumed messages for a given client saved as an object of string: integer",
          type: "object",
          patternProperties: {
            "^.*$": { type: "integer" },
          },
          additionalProperties: false,
        },
        messageIdsInOrder: {
          description:
            "An array of the ids of yet-to-be-consumed messages for a given client, in order of creation",
          type: "array",
          items: {
            type: "string",
          },
        },
        messageIdsPendingAcknowledgement: {
          description:
            "An array of the ids of yet-to-be-acknowledged messages for a given client, in order of creation",
          type: "array",
          items: {
            type: "string",
          },
        },
      },
    };
  }
}

module.exports = {
  Subscribers,
};
