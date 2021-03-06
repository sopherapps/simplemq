/**
 * Module containing handlers to handle gRPC requests
 */
const {
  addMessageToTopic,
  getNextMessageForSubscriber,
  deleteMessage,
  registerSubscriber,
  subscribeToTopic: dbSubscribeToTopic,
} = require("./db");

const STREAM_INTERVAL = 1000;

/**
 * The gRPC method for handling messages sent by client apps
 * @param {object} call - the call object from the unary request
 * @param {(any, any)=>void} callback - the callback function to call after the request is handled to close it
 */
function sendMessage(call, callback) {
  const { topic } = call.request;
  const message = call.request.data;

  addMessageToTopic(topic, JSON.parse(message));
  callback(null, { received: true });
}

/**
 * The gRPC method to handle the bidirectional stream requests initiated by client apps
 * @param {object} call - the call object from the bidirectional stream request
 */
function subscribeToTopic(call) {
  let intervalHandle;
  let clientId;

  call.on("error", (err) => {
    throw err;
  });

  call.on("status", (status) => {
    // eslint-disable-next-line no-console
    console.log(status);
  });

  call.on("data", (clientResponse) => {
    if (clientResponse.messageType === "START") {
      if (intervalHandle) {
        clearInterval(intervalHandle);
      }

      clientId = clientResponse.payload;
      registerSubscriber(clientId);

      intervalHandle = setInterval(() => {
        const nextMessage = getNextMessageForSubscriber(clientId);
        if (nextMessage) {
          call.write({
            messageType: "MESSAGE",
            payload: {
              id: nextMessage.id,
              data: JSON.stringify(nextMessage.data),
            },
          });
        }
      }, STREAM_INTERVAL);
    } else if (clientResponse.messageType === "TOPIC") {
      // change TOPIC to SUBSCRIBE
      // Add another branch for UNSUBSCRIBE
      const topic = clientResponse.payload;
      dbSubscribeToTopic(topic, clientId);
      call.write({
        messageType: "TOPIC",
        payload: {
          id: null,
          data: JSON.stringify({}),
        },
      });
    } else if (clientResponse.messageType === "ACKNOWLEDGMENT") {
      const messageId = clientResponse.payload;
      deleteMessage(clientId, messageId);
    }
  });

  call.on("end", () => {
    clearInterval(intervalHandle);
    call.end();
  });
}

module.exports = {
  sendMessage,
  subscribeToTopic,
};
