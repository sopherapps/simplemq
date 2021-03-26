/**
 * Module contains the class the creates the db instance
 */
const level = require("level");

// eslint-disable-next-line no-unused-vars
const { Messages } = require("./models/messages");
const { Subscribers } = require("./models/subscribers");
const { Topics } = require("./models/topics");

const defaultCallback = (err) => {
  throw err;
};

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
   */
  createTopicRecord(topic, callback = defaultCallback) {
    this.models.topics.addRecord(
      topic,
      {
        topic,
        subscribers: {},
      },
      {},
      (err, [, data]) => {
        callback(err, data);
      }
    );
  }

  /**
   * Gets a topic from the topics collection or creates it if it does not exist and returns the key and topic
   * @param {string} topic - the topic name
   */
  getTopicRecord(topic, callback = defaultCallback) {
    try {
      this.models.topics.getRecord(topic, callback);
    } catch (error) {
      if (error.notFound) {
        this.createTopicRecord(topic, callback);
      }

      throw error;
    }
  }

  /**
   * Adds a clientId to the object of subscribers under that topic
   * @param {string]} topic - the topic to subscribe to
   * @param {string} clientId - the client id
   */
  subscribeToTopic(topic, clientId, callback = defaultCallback) {
    this.getTopicRecord(topic, (err, topicRecord) => {
      const topicRecordCopy = { ...topicRecord };
      topicRecordCopy.subscribers[clientId] = 1;
      this.models.topics.replaceRecord(topic, topicRecordCopy, callback);
    });
  }

  /**
   * Removes a clientId from the object of subscribers under that topic
   * @param {string} topic - the topic to unsubscribe from
   * @param {string} clientId - the client id
   */
  unsubscribeToTopic(topic, clientId, callback = defaultCallback) {
    this.getTopicRecord(topic, (err, topicRecord) => {
      const topicRecordCopy = { ...topicRecord };
      delete topicRecordCopy.subscribers[clientId];
      this.models.topics.replaceRecord(topic, topicRecordCopy, callback);
    });
  }

  /**
   * Adds the client in the list of subscribers if that client does not exist
   * @param {string} clientId - the id of the client
   */
  registerSubscriber(clientId, callback = defaultCallback) {
    this.models.subscribers.getRecord(clientId, (err, record) => {
      if (err) {
        callback(err);
      }

      if (record === null) {
        this.models.subscribers.addRecord(
          clientId,
          {
            clientId,
            messageIds: {},
            messageIdsInOrder: [],
            messageIdsPendingAcknowledgment: [],
          },
          {},
          callback
        );
      }
    });
  }

  /**
   * Adds the given message to the given topic
   * @param {string} topic - the topic to publish to
   * @param {{[key: string]: any}} message - the message to persist
   */
  addMessageToTopic(topic, message) {
    // save the message
    const id = this.models.messages.getNextId();
    const messageRecord = { id, topic, data: message };
    this.models.messages.addRecord(id, messageRecord);

    // for each subscriber in the topic, add the id of the message in their subscriber messageIds object
    this.getTopicRecord(topic, (err, topicRecord) => {
      const subscriberIds = [...Object.keys(topicRecord.subscribers)];
      this.models.subscribers.updateRecords(subscriberIds, (record) => ({
        ...record,
        messageIds: { ...record.messageIds, [id]: 1 },
        messageIdsInOrder: [...record.messageIdsInOrder, id],
      }));
    });
  }

  /**
   * Gets next message for the client of that clientId
   * @param {string} clientId - the client ID of the subscriber
   */
  getNextMessageForSubscriber(clientId, callback = defaultCallback) {
    this.models.subscribers.getRecord(clientId, (err, subscriberRecord) => {
      if (err) {
        throw err;
      }

      if (subscriberRecord === null) {
        callback(null, null);
      }
      const subscriberRecordCopy = { ...subscriberRecord };

      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < subscriberRecordCopy.messageIdsInOrder.length; i++) {
        const messageId = subscriberRecordCopy.messageIdsInOrder[i];

        this.models.messages.getRecord(messageId, (error, message) => {
          if (error) {
            throw error;
          }

          if (message) {
            // shift the id to messageIdsPendingAcknowledgement
            subscriberRecordCopy.messageIdsInOrder.splice(i, 1);
            subscriberRecordCopy.messageIdsPendingAcknowledgment.push(
              messageId
            );
            callback(null, message);
          }

          // Remove the id from the queue as it is unavailable
          delete subscriberRecordCopy.messageIds[messageId];
          subscriberRecordCopy.messageIdsInOrder.splice(i, 1);

          // update the changes made to the subscriber record if any
          this.models.subscribers.replaceRecord(clientId, subscriberRecordCopy);
        });
      }
    });
  }

  /**
   * Deletes a given message from the queue
   * @param {string} clientId - clientId is the ID of the subscriber
   * @param {string} messageId - messageId is the ID of message to be removed
   */
  deleteMessage(clientId, messageId) {
    this.models.subscribers.getRecord(clientId, (err, subscriberRecord) => {
      if (err) {
        throw err;
      }

      if (subscriberRecord === null) {
        return;
      }

      const subscriberRecordCopy = { ...subscriberRecord };
      const indexOfMessageId = subscriberRecordCopy.messageIdsPendingAcknowledgment.indexOf(
        messageId
      );
      if (indexOfMessageId > -1) {
        subscriberRecordCopy.messageIdsPendingAcknowledgment.splice(
          indexOfMessageId,
          1
        );
      }
      delete subscriberRecordCopy.messageIds[messageId];

      this.models.subscribers.replaceRecord(clientId, subscriberRecordCopy);
    });
  }

  /**
   * Restores the messages that have not been acknowledged back to the queue. This is to be used on
   * end of the connection
   * @param {string} clientId - the client id of the subscriber
   */
  restoreUnacknowledgedMessages(clientId) {
    this.models.subscribers.getRecord(clientId, (err, subscriberRecord) => {
      if (err) {
        throw err;
      }

      if (subscriberRecord === null) {
        return;
      }

      const subscriberRecordCopy = { ...subscriberRecord };
      subscriberRecordCopy.messageIdsInOrder = subscriberRecord.messageIdsPendingAcknowledgment.concat(
        subscriberRecord.messageIdsInOrder
      );
      subscriberRecordCopy.messageIdsPendingAcknowledgment.splice(
        0,
        subscriberRecordCopy.messageIdsPendingAcknowledgment.length
      );

      this.models.subscribers.replaceRecord(clientId, subscriberRecordCopy);
    });
  }

  /**
   * Clears the data in the models
   */
  clear() {
    const models = Object.values(this.models);

    // eslint-disable-next-line no-plusplus
    for (let index = 0; index < models.length; index++) {
      const model = models[index];
      model.clear();
    }
  }

  /**
   * Closes the database connection
   * @param {(Error)=>void} callback - the callbakc to call with an error in case an error occurs
   */
  close(callback = defaultCallback) {
    this.db.close(callback);
  }
}

module.exports = {
  LevelDatabase,
};
