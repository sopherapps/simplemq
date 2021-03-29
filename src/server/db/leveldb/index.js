/**
 * Module contains the class the creates the db instance
 */
const level = require("level");

const { Messages } = require("./models/messages");
const { Subscribers } = require("./models/subscribers");
const { Topics } = require("./models/topics");
const { defaultCachePath, defaultCallback, generateUuid } = require("./utils");

class Database {
  /**
   * The database class that persists queue data
   * @param {string} baseCachePath - absolute path to the folder in which the cache is to be saved
   * @param {{[key: string]: any}} options - the configuration for the level
   * @param {(Database) => void} onIntializeHandler - A function to run on initialization e.g. start server app, passed this database instance
   */
  constructor(
    baseCachePath = defaultCachePath,
    options = {},
    onIntializeHandler = () => {}
  ) {
    const {
      isPersistent = true,
      ttl = 1000 * 60 * 60 * 24 * 30,
      ttlInterval = 1000 * 60 * 60 * 24,
    } = options;
    if (!isPersistent) {
      throw new Error(
        "When using leveldb as persistent layer, the messages have to be persistent"
      );
    }
    this.db = null;

    this.models = {
      messages: new Messages(ttl, ttlInterval),
      subscribers: new Subscribers(),
      topics: new Topics(),
    };

    // binding methods
    this.subscribeToTopic = this.subscribeToTopic.bind(this);
    this.unsubscribeToTopic = this.unsubscribeToTopic.bind(this);
    this.addMessageToTopic = this.addMessageToTopic.bind(this);
    this.getNextMessageForSubscriber = this.getNextMessageForSubscriber.bind(
      this
    );
    this.deleteMessage = this.deleteMessage.bind(this);

    level(baseCachePath, (err, db) => {
      if (err) {
        throw err;
      }
      this.db = db;

      // call initializer handler
      onIntializeHandler(this);
    });
  }

  /**
   * Adds a clientId to the cache of that topic
   * @param {string]} topic - the topic to subscribe to
   * @param {string} clientId - the client id
   */
  subscribeToTopic(topic, clientId, callback = defaultCallback) {
    const clientIdKeyForTopic = this.models.topics.generateClientIdForTopic(
      topic,
      clientId
    );
    // attempt to get the record for given client, if nonexistent, add it
    this.models.topics.getRecord(this.db, clientIdKeyForTopic, (exception) => {
      if (exception) {
        this.models.topics.addRecord(
          this.db,
          clientIdKeyForTopic,
          clientId,
          (error, { data }) => callback(error, data)
        );
      } else {
        callback(null, clientId);
      }
    });
  }

  /**
   * Removes a clientId from the cache file of that topic
   * @param {string} topic - the topic to unsubscribe from
   * @param {string} clientId - the client id
   */
  unsubscribeToTopic(topic, clientId, callback = defaultCallback) {
    const clientIdKeyForTopic = this.models.topics.generateClientIdForTopic(
      topic,
      clientId
    );
    this.models.topics.removeRecord(this.db, clientIdKeyForTopic, callback);
  }

  /**
   * Adds the given message to the given topic
   * @param {string} topic - the topic to publish to
   * @param {{[key: string]: any}} message - the message to persist
   */
  addMessageToTopic(topic, message, callback = defaultCallback) {
    // save the message. The Uuid seem to be in order
    const id = generateUuid();
    const messageRecord = { id, topic, data: message };

    this.models.messages.addRecord(this.db, id, messageRecord, (error) => {
      if (error) {
        callback(error);
        return;
      }

      // for each subscriber in the topic cache file, add the id of the message the subscriber's cache file
      const keyRange = this.models.topics.getKeyRangeForTopic(topic);

      this.models.topics.streamValues(
        this.db,
        {
          onData: (clientId) => {
            const messageIdForSubscriber = this.models.subscribers.generateMessageIdForSubscriber(
              clientId,
              id
            );

            this.models.subscribers.addRecord(
              this.db,
              messageIdForSubscriber,
              id,
              (exception) => {
                if (exception) {
                  callback(exception);
                }
              }
            );
          },
          onError: (err) => callback(err),
          onClose: () => callback(null),
        },
        { ...keyRange }
      );
    });
  }

  /**
   * Gets next message for the client of that clientId
   * @param {string} clientId - the client ID of the subscriber
   * @param {(Error|null, any)=>void} callback - the callback to be called per message or on error
   * @param {()=>void} onEndCallback - the callback to call when the stream is either closed or data is done
   */
  getNextMessageForSubscriber(
    clientId,
    callback = defaultCallback,
    onEndCallback = () => {}
  ) {
    // stream the message ids for the given subscriber and attempt to
    // get the corresponding message from the messages cache
    const keyRange = this.models.subscribers.getKeyRangeForSubscriber(clientId);

    this.models.subscribers.streamValues(
      this.db,
      {
        onData: (messageId) => {
          this.models.messages.getRecord(this.db, messageId, (err, message) => {
            if (err) {
              callback(err);
            } else {
              callback(null, message);
            }
          });
        },
        onError: callback,
        onEnd: onEndCallback,
        onClose: onEndCallback,
      },
      { ...keyRange }
    );
  }

  /**
   * Deletes a given message from the queue
   * @param {string} clientId - clientId is the ID of the subscriber
   * @param {string} messageId - messageId is the ID of message to be removed
   */
  deleteMessage(clientId, messageId, callback = defaultCallback) {
    // remove the messageId from the cache for given subscriber
    const messageIdForSubscriber = this.models.subscribers.generateMessageIdForSubscriber(
      clientId,
      messageId
    );
    this.models.subscribers.removeRecord(
      this.db,
      messageIdForSubscriber,
      callback
    );
  }

  /**
   * Clears the data in the models
   */
  clear(callback = defaultCallback) {
    this.db.clear(callback);
  }

  /**
   * Closes the database connection
   * @param {(Error)=>void} callback - the callbakc to call with an error in case an error occurs
   */
  close(callback = defaultCallback) {
    const models = Object.values(this.models);

    // eslint-disable-next-line no-plusplus
    for (let index = 0; index < models.length; index++) {
      const model = models[index];
      model.cleanUp();
    }

    if (this.db) {
      this.db.close(callback);
    }
  }
}

module.exports = {
  Database,
};
