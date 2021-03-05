/** server file for the message queue service */
const path = require("path");
const grpc = require("grpc");
const protoLoader = require("@grpc/proto-loader");

// constants
const PORT = 38000;
const STREAM_INTERVAL = 1000;

// sample
let DATA = [];

// Load gRPC package definitions
const packageDefinition = protoLoader.loadSync(
  path.resolve(__dirname, "article_curator.proto"),
  {}
);
const grpcObject = grpc.loadPackageDefinition(packageDefinition);
const articleCurator = grpcObject.articleCurator;

// the server
const server = new grpc.Server();
server.bind(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure());

// Add services to the Server
server.addService(articleCurator.MessageQueue.service, {
  sendMessage,
  subscribeToTopic,
});

// start the Server
server.start();

/**
 * Adds the given message to the given topic
 * @param {string} topic - the topic to publish to
 * @param {{[key: string]: any}} message - the message to persist
 */
function _addMessageToTopic(topic, message) {
  const id = Math.random().toString(36).substring(7);
  DATA.push({ id, topic, data: message });
}

/**
 * Gets the next message for a given topic
 * @param {string} topic - the topic whose messages are to be returned
 */
function _getNextMessageForTopic(topic) {
  return DATA.filter((message) => message.topic === topic)[0];
}

/**
 * Deletes a given message from the queue
 * @param {string} id - id of the message to delete
 */
function _deleteMessage(id) {
  DATA = DATA.filter((message) => message.id !== id);
}

/**
 * The gRPC method for handling messages sent by client apps
 * @param {object} call - the call object from the unary request
 * @param {(any, any)=>void} callback - the callback function to call after the request is handled to close it
 */
function sendMessage(call, callback) {
  const topic = call.request.topic;
  const message = call.request.data;

  _addMessageToTopic(topic, JSON.parse(message));
  callback(null, { received: true });
}

/**
 * The gRPC method to handle the bidirectional stream requests initiated by client apps
 * @param {object} call - the call object from the bidirectional stream request
 */
function subscribeToTopic(call) {
  let topic;
  let intervalHandle;

  call.on("error", (err) => {
    console.error(err);
  });

  call.on("status", (status) => {
    console.log(status);
  });

  call.on("data", function (clientResponse) {
    if (clientResponse.messageType === "TOPIC") {
      topic = clientResponse.payload;

      if (intervalHandle) {
        clearInterval(intervalHandle);
      }

      intervalHandle = setInterval(() => {
        const nextMessage = _getNextMessageForTopic(topic);
        if (nextMessage) {
          call.write({
            id: nextMessage.id,
            data: JSON.stringify(nextMessage.data),
          });
        }
      }, STREAM_INTERVAL);
    } else if (clientResponse.messageType === "ACKNOWLEDGMENT") {
      _deleteMessage(clientResponse.payload);
    }
  });

  call.on("end", function () {
    clearInterval(intervalHandle);
    call.end();
  });
}
