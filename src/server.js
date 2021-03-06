/** server file for the message queue service */
const grpc = require("grpc");
const protoLoader = require("@grpc/proto-loader");
const { sendMessage, subscribeToTopic } = require("./grpc-handlers");
const { PROTOBUF_FILE_PATH } = require("./config");

// constants
const PORT = 38000;

// Load gRPC package definitions
const packageDefinition = protoLoader.loadSync(PROTOBUF_FILE_PATH, {});
const grpcObject = grpc.loadPackageDefinition(packageDefinition);
const { articleCurator } = grpcObject;

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
// eslint-disable-next-line no-console
console.log(`Server running on 0.0.0.0:${PORT}`);
