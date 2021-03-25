/**
 * Module contains the class the creates the db instance
 */
const level = require("level");

// eslint-disable-next-line no-unused-vars
const { Messages } = require("./models/messages");
const { Subscribers } = require("./models/subscribers");
const { Topics } = require("./models/topics");

class LevelDatabase {
  /**
   * The database class that persists queue data
   * @param {string} filePath - file path to the database e.g. queue.db
   * @param {{[key: string]: any}} options - the configuration for the level
   * @param {(LevelDatabase) => void} onIntializeHandler - A function to run on initialization e.g. start server app, passed this database instance
   */
  constructor(filePath, options = {}, onIntializeHandler = () => {}) {
    const { isPersistent = true } = options;
    if (!isPersistent) {
      throw new Error(
        "When using leveldb as persistent layer, the messages have to be persistent"
      );
    }

    this.db = null;
    this.models = {};
    const self = this;

    level(filePath, options, (err, db) => {
      if (err) {
        throw err;
      }

      // set up the database
      this.db = db;

      // set up the models
      const models = [new Messages(), new Subscribers(), new Topics()];
      models.forEach((model) => {
        model.setDatabase(db);
        self.models[model.collectionName] = model;
      });

      onIntializeHandler(self);
    });

    // binding methods
    this.getTopicRecord = this.getTopicRecord.bind(this);
    this.subscribeToTopic = this.subscribeToTopic.bind(this);
    this.unsubscribeToTopic = this.unsubscribeToTopic.bind(this);
    this.registerSubscriber = this.registerSubscriber.bind(this);
    this.addMessageToTopic = this.addMessageToTopic.bind(this);
    this.getNextMessageForSubscriber = this.getNextMessageForSubscriber.bind(
      this
    );
    this.deleteMessage = this.deleteMessage.bind(this);
  }

  /**
   * Creates a given topic
   * @param {string} topic - the topic name
   * @returns {Promise<{topic: string, subscribers: string[]}>}
   */
  async createTopicRecord(topic) {
    const [, data] = await this.models.topics.addRecord(topic, {
      topic,
      subscribers: {},
    });
    return data;
  }

  /**
   * Gets a topic from the topics collection or creates it if it does not exist and returns the key and topic
   * @param {string} topic - the topic name
   * @returns {Promise<{topic: string, subscribers: string[]}>}
   */
  async getTopicRecord(topic) {
    try {
      return this.models.topics.getRecord(topic);
    } catch (error) {
      if (error.notFound) {
        return this.createTopicRecord(topic);
      }

      throw error;
    }
  }

  /**
   * Adds a clientId to the object of subscribers under that topic
   * @param {string]} topic - the topic to subscribe to
   * @param {string} clientId - the client id
   */
  async subscribeToTopic(topic, clientId) {
    const topicRecord = await this.getTopicRecord(topic);
    topicRecord.subscribers[clientId] = 1;
    await this.models.topics.replaceRecord(topic, topicRecord);
  }

  /**
   * Removes a clientId from the object of subscribers under that topic
   * @param {string} topic - the topic to unsubscribe from
   * @param {string} clientId - the client id
   */
  async unsubscribeToTopic(topic, clientId) {
    const topicRecord = await this.getTopicRecord(topic);
    delete topicRecord.subscribers[clientId];
    await this.models.topics.replaceRecord(topic, topicRecord);
  }

  /**
   * Adds the client in the list of subscribers if that client does not exist
   * @param {string} clientId - the id of the client
   * @returns {Promise<void>}
   */
  async registerSubscriber(clientId) {
    try {
      await this.models.subscribers.getRecord(clientId);
    } catch (error) {
      if (error.notFound) {
        this.models.subscribers.addRecord(clientId, {
          clientId,
          messageIds: {},
          messageIdsInOrder: [],
          messageIdsPendingAcknowledgment: [],
        });
      }

      throw error;
    }
  }

  /**
   * Adds the given message to the given topic
   * @param {string} topic - the topic to publish to
   * @param {{[key: string]: any}} message - the message to persist
   */
  async addMessageToTopic(topic, message) {
    // save the message
    const id = this.models.messages.getNextId();
    const messageRecord = { id, topic, data: message };
    await this.models.messages.addRecord(id, messageRecord);

    // for each subscriber in the topic, add the id of the message in their subscriber messageIds object
    const topicRecord = await this.getTopicRecord(topic);
    const subscriberIds = [...Object.keys(topicRecord.subscribers)];
    await this.models.subscribers.updateRecords(subscriberIds, (record) => ({
      ...record,
      messageIds: { ...record.messageIds, [id]: 1 },
      messageIdsInOrder: [...record.messageIdsInOrder, id],
    }));
  }

  /**
   * Gets next message for the client of that clientId
   * @param {string} clientId - the client ID of the subscriber
   * @returns {{id: string, data: string } | null }
   */
  async getNextMessageForSubscriber(clientId) {
    let subscriberRecord;
    let nextMessage = null;

    try {
      subscriberRecord = await this.models.subscribers.getRecord(clientId);
    } catch (error) {
      if (error.notFound) {
        return null;
      }
    }

    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < subscriberRecord.messageIdsInOrder.length; i++) {
      const messageId = subscriberRecord.messageIdsInOrder[i];
      const isMessageIdAvailable = subscriberRecord.messageIds[messageId];

      if (isMessageIdAvailable) {
        try {
          // eslint-disable-next-line no-await-in-loop
          nextMessage = await this.models.messages.getRecord(messageId);
        } catch (error) {
          if (!error.notFound) {
            throw error;
          }
        }
      }

      if (nextMessage) {
        // shift the id to messageIdsPendingAcknowledgement
        subscriberRecord.messageIdsInOrder.splice(i, 1);
        subscriberRecord.messageIdsPendingAcknowledgment.push(messageId);
        break;
      }

      // Remove the id from the queue as it is unavailable
      delete subscriberRecord.messageIds[messageId];
      subscriberRecord.messageIdsInOrder.splice(i, 1);
    }

    // update the changes made to the subscriber record if any
    await this.models.subscribers.replaceRecord(clientId, subscriberRecord);
    return nextMessage;
  }

  /**
   * Deletes a given message from the queue
   * @param {string} clientId - clientId is the ID of the subscriber
   * @param {string} messageId - messageId is the ID of message to be removed
   */
  async deleteMessage(clientId, messageId) {
    let subscriberRecord;
    try {
      subscriberRecord = await this.models.subscribers.getRecord(clientId);
    } catch (error) {
      if (error.notFound) {
        return;
      }
      throw error;
    }

    const indexOfMessageId = subscriberRecord.messageIdsPendingAcknowledgment.indexOf(
      messageId
    );
    if (indexOfMessageId > -1) {
      subscriberRecord.messageIdsPendingAcknowledgment.splice(
        indexOfMessageId,
        1
      );
    }
    // eslint-disable-next-line no-param-reassign
    delete subscriberRecord.messageIds[messageId];

    await this.models.subscribers.replaceRecord(clientId, subscriberRecord);
  }

  /**
   * Restores the messages that have not been acknowledged back to the queue. This is to be used on
   * end of the connection
   * @param {string} clientId - the client id of the subscriber
   */
  async restoreUnacknowledgedMessages(clientId) {
    let subscriberRecord;
    try {
      subscriberRecord = await this.models.subscribers.getRecord(clientId);
    } catch (error) {
      if (error.notFound) {
        return;
      }
      throw error;
    }
    // eslint-disable-next-line no-param-reassign
    subscriberRecord.messageIdsInOrder = subscriberRecord.messageIdsPendingAcknowledgment.concat(
      subscriberRecord.messageIdsInOrder
    );
    subscriberRecord.messageIdsPendingAcknowledgment.splice(
      0,
      subscriberRecord.messageIdsPendingAcknowledgment.length
    );

    await this.models.subscribers.replaceRecord(clientId, subscriberRecord);
  }

  async clear() {
    const models = Object.values(this.models);
    const promises = [];

    // eslint-disable-next-line no-plusplus
    for (let index = 0; index < models.length; index++) {
      const model = models[index];
      promises.push(model.clear());
    }

    await Promise.all(promises);
  }
}

module.exports = {
  LevelDatabase,
};
