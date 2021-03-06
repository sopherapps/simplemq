/**
 * Module for persisting messages, and registering topics and subscribers
 */

const Loki = require("lokijs");

const MESSAGE_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days
const MESSAGE_TTL_INTERVAL = 1000 * 60 * 60 * 24; // 1 day

// sample
const DB = new Loki("queue.db");
const MESSAGES = DB.addCollection("messages", {
  unique: ["id"],
  indices: ["id"],
  ttl: MESSAGE_TTL,
  ttlInterval: MESSAGE_TTL_INTERVAL,
});
const SUBSCRIBERS = DB.addCollection("subscribers", {
  unique: ["clientId"],
  indices: ["clientId"],
});
const TOPICS = DB.addCollection("topics", {
  unique: ["topic"],
  indices: ["topic"],
});

/**
 * Gets a topic from the topics collection or creates it if it does not exist
 * @param {string} topic - the topic that is to be searched for
 * @returns {topic: string, subscribers: string[]}
 */
function getTopicRecord(topic) {
  let topicRecord = TOPICS.findOne({ topic });

  if (!topicRecord) {
    topicRecord = TOPICS.insert({ topic, subscribers: {} });
  }

  return topicRecord;
}

/**
 * Adds a clientId to the object of subscribers under that topic
 * @param {string} topic - the topic to subscribe to
 * @param {string} clientId - the client id
 */
function subscribeToTopic(topic, clientId) {
  const topicRecord = getTopicRecord(topic);
  topicRecord.subscribers[clientId] = 1;
  TOPICS.update(topicRecord);
}

/**
 * Removes a clientId from the object of subscribers under that topic
 * @param {string} topic - the topic to subscribe to
 * @param {string} clientId - the client id
 */
function unsubscribeToTopic(topic, clientId) {
  const topicRecord = getTopicRecord(topic);
  delete topicRecord.subscribers[clientId];
  TOPICS.update(topicRecord);
}

/**
 * Adds the client in the list of subscribers if that client does not exist
 * @param {string} clientId - the id of the client
 */
function registerSubscriber(clientId) {
  const clientRecord = SUBSCRIBERS.findOne({ clientId });
  if (!clientRecord) {
    SUBSCRIBERS.insert({ clientId, messageIds: {}, messageIdsInOrder: [] });
  }
}

/**
 * Adds the given message to the given topic
 * @param {string} topic - the topic to publish to
 * @param {{[key: string]: any}} message - the message to persist
 */
function addMessageToTopic(topic, message) {
  // save the message
  const id = `_id${Math.random().toString(36).substring(7)}`;
  const messageRecord = { id, topic, data: message };
  MESSAGES.insert(messageRecord);

  // for each subscriber in the topic, add the id of the message in their subscriber messageIds object
  const topicRecord = getTopicRecord(topic);
  const subscriberIds = [...Object.keys(topicRecord.subscribers)];
  SUBSCRIBERS.findAndUpdate({ clientId: { $in: subscriberIds } }, (record) => {
    // eslint-disable-next-line no-param-reassign
    record.messageIds[id] = 1;
    record.messageIdsInOrder.push(id);
  });
}

/**
 * Gets next message for the client of that clientId
 * @param {string} clientId - the client ID of the subscriber
 * @returns {{id: string, data: string } | null }
 */
function getNextMessageForSubscriber(clientId) {
  const subscriberRecord = SUBSCRIBERS.findOne({ clientId });
  let nextMessage = null;

  if (!subscriberRecord) {
    return null;
  }

  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < subscriberRecord.messageIdsInOrder.length; i++) {
    const messageId = subscriberRecord.messageIdsInOrder[i];
    const isMessageIdAvailable = subscriberRecord.messageIds[messageId];

    if (isMessageIdAvailable) {
      nextMessage = MESSAGES.findOne({ id: messageId });
    }

    if (nextMessage) {
      break;
    }

    // Remove the id from the queue as it is unavailable
    delete subscriberRecord.messageIds[messageId];
    subscriberRecord.messageIdsInOrder.splice(i, 1);
  }

  // update the changes made to the subscriber record if any
  SUBSCRIBERS.update(subscriberRecord);
  return nextMessage;
}

/**
 * Deletes a given message from the queue
 * @param {string} clientId - clientId is the ID of the subscriber
 * @param {string} messageId - messageId is the ID of message to be removed
 */
function deleteMessage(clientId, messageId) {
  SUBSCRIBERS.findAndUpdate({ clientId }, (record) => {
    // eslint-disable-next-line no-param-reassign
    delete record.messageIds[messageId];
  });
}

module.exports = {
  subscribeToTopic,
  registerSubscriber,
  addMessageToTopic,
  getNextMessageForSubscriber,
  deleteMessage,
  unsubscribeToTopic,
};
