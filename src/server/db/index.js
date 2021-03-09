/**
 * Module contains the class the creates the db instance
 */
const Loki = require("lokijs");
const LokiFsStructuredAdapter = require("lokijs/src/loki-fs-structured-adapter.js");
// eslint-disable-next-line no-unused-vars
const { Messages } = require("./models/messages");
const { Subscribers } = require("./models/subscribers");
const { Topics } = require("./models/topics");

class Database {
  /**
   * The database class that persists queue data
   * @param {string} filePath - file path to the database e.g. queue.db
   * @param {Partial<LokiConstructorOptions> & Partial<LokiConfigOptions> & Partial<ThrottledSaveDrainOptions>)} options - the configuration for the lokijs
   * @param {(Database) => void} onIntializeHandler - A function to run on initialization e.g. start server app, passed this database instance
   */
  constructor(filePath, options = {}, onIntializeHandler = () => {}) {
    const { isPersistent = false } = options;
    let dbOptions = {
      autoload: true,
      // eslint-disable-next-line no-use-before-define
      autoloadCallback,
      ...options,
    };
    if (isPersistent) {
      dbOptions = {
        adapter: new LokiFsStructuredAdapter(),
        autosave: true,
        autosaveInterval: 1000,
        ...options,
      };
    }
    this.db = new Loki(filePath, dbOptions);
    this.models = {};
    const self = this;

    const models = [new Messages(), new Subscribers(), new Topics()];

    function autoloadCallback() {
      models.forEach((model) => {
        let collection = self.db.getCollection(model.collectionName);

        if (collection === null) {
          collection = self.db.addCollection(
            model.collectionName,
            model.options
          );
        }

        model.setCollection(collection);
        self.models[model.collectionName] = model;
      });
      onIntializeHandler(self);
    }

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
   * Gets a topic from the topics collection or creates it if it does not exist
   * @param {string} topic - the topic that is to be searched for
   * @returns {topic: string, subscribers: string[]}
   */
  getTopicRecord(topic) {
    let topicRecord = this.models.topics.getRecord(topic);

    if (!topicRecord) {
      topicRecord = this.models.topics.addRecord({ topic, subscribers: {} });
    }

    return topicRecord;
  }

  /**
   * Adds a clientId to the object of subscribers under that topic
   * @param {string} topic - the topic to subscribe to
   * @param {string} clientId - the client id
   */
  subscribeToTopic(topic, clientId) {
    const topicRecord = this.getTopicRecord(topic);
    topicRecord.subscribers[clientId] = 1;
    this.models.topics.replaceRecord(topicRecord);
  }

  /**
   * Removes a clientId from the object of subscribers under that topic
   * @param {string} topic - the topic to subscribe to
   * @param {string} clientId - the client id
   */
  unsubscribeToTopic(topic, clientId) {
    const topicRecord = this.getTopicRecord(topic);
    delete topicRecord.subscribers[clientId];
    this.models.topics.replaceRecord(topicRecord);
  }

  /**
   * Adds the client in the list of subscribers if that client does not exist
   * @param {string} clientId - the id of the client
   */
  registerSubscriber(clientId) {
    const clientRecord = this.models.subscribers.getRecord(clientId);
    if (!clientRecord) {
      this.models.subscribers.addRecord({
        clientId,
        messageIds: {},
        messageIdsInOrder: [],
      });
    }
  }

  /**
   * Adds the given message to the given topic
   * @param {string} topic - the topic to publish to
   * @param {{[key: string]: any}} message - the message to persist
   */
  addMessageToTopic(topic, message) {
    // save the message
    const id = `_id${Math.random().toString(36).substring(7)}`;
    const messageRecord = { id, topic, data: message };
    this.models.messages.addRecord(messageRecord);

    // for each subscriber in the topic, add the id of the message in their subscriber messageIds object
    const topicRecord = this.getTopicRecord(topic);
    const subscriberIds = [...Object.keys(topicRecord.subscribers)];
    this.models.subscribers.updateRecords(
      { clientId: { $in: subscriberIds } },
      (record) => {
        // eslint-disable-next-line no-param-reassign
        record.messageIds[id] = 1;
        record.messageIdsInOrder.push(id);
      }
    );
  }

  /**
   * Gets next message for the client of that clientId
   * @param {string} clientId - the client ID of the subscriber
   * @returns {{id: string, data: string } | null }
   */
  getNextMessageForSubscriber(clientId) {
    const subscriberRecord = this.models.subscribers.getRecord(clientId);
    let nextMessage = null;

    if (!subscriberRecord) {
      return null;
    }

    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < subscriberRecord.messageIdsInOrder.length; i++) {
      const messageId = subscriberRecord.messageIdsInOrder[i];
      const isMessageIdAvailable = subscriberRecord.messageIds[messageId];

      if (isMessageIdAvailable) {
        nextMessage = this.models.messages.getRecord(messageId);
      }

      if (nextMessage) {
        break;
      }

      // Remove the id from the queue as it is unavailable
      delete subscriberRecord.messageIds[messageId];
      subscriberRecord.messageIdsInOrder.splice(i, 1);
    }

    // update the changes made to the subscriber record if any
    this.models.subscribers.replaceRecord(subscriberRecord);
    return nextMessage;
  }

  /**
   * Deletes a given message from the queue
   * @param {string} clientId - clientId is the ID of the subscriber
   * @param {string} messageId - messageId is the ID of message to be removed
   */
  deleteMessage(clientId, messageId) {
    this.models.subscribers.updateRecords({ clientId }, (record) => {
      // eslint-disable-next-line no-param-reassign
      delete record.messageIds[messageId];
    });
  }
}

module.exports = {
  Database,
};
