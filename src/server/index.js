/**
 * Module containing the server class
 */
const grpc = require("grpc");
const protoLoader = require("@grpc/proto-loader");
const { grpcHandlerFactory } = require("./grpc-handlers");
const { PROTOBUF_FILE_PATH } = require("../config");

const { Database } = require("./db");

class Server {
  /**
   * The server class that initializes the message queue
   * @param {{port?: number, ttl?: number, ttlInterval?: number, streamInterval?: number}} options - the options for starting the Server
   */
  constructor(options = {}) {
    const {
      port = 38000,
      ttl = 1000 * 60 * 60 * 24 * 30,
      ttlInterval = 1000 * 60 * 60 * 24,
      streamInterval = 1000,
      dbFilePath = "queue.db",
      isPersistent = false,
    } = options;
    this.port = port;
    this.ttl = ttl;
    this.ttlInterval = ttlInterval;
    this.streamInterval = streamInterval;
    this.dbFilePath = dbFilePath;
    this.isPersistent = isPersistent;
    this.server = null;

    // bind method
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
  }

  start() {
    const onDbInitialization = (dbInstance) => {
      if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === "test") {
        dbInstance.clear();
      }

      // Load gRPC package definitions
      const packageDefinition = protoLoader.loadSync(PROTOBUF_FILE_PATH, {});
      const grpcObject = grpc.loadPackageDefinition(packageDefinition);
      const { articleCurator } = grpcObject;

      // the server
      this.server = new grpc.Server();
      const serverIpAndPort = `0.0.0.0:${this.port}`;
      this.server.bind(
        serverIpAndPort,
        grpc.ServerCredentials.createInsecure()
      );

      // Add services to the Server
      this.server.addService(
        articleCurator.MessageQueue.service,
        grpcHandlerFactory(dbInstance, {
          streamInterval: this.streamInterval,
        })
      );

      // start the Server
      this.server.start();
      // eslint-disable-next-line no-console
      console.log(`Server running on ${serverIpAndPort}`);
      // eslint-disable-next-line no-console
      console.log(`Environment NODE_ENV = ${process.env.NODE_ENV}`);
    };

    // Initialize the database, then on finishing, initialize the gRPC Server
    // eslint-disable-next-line no-new
    new Database(
      this.dbFilePath,
      { isPersistent: this.isPersistent },
      onDbInitialization
    );
  }

  /**
   * Stops the server to receive no more requests
   */
  stop() {
    if (this.server) {
      this.server.tryShutdown(() => {
        // eslint-disable-next-line no-console
        console.log(`Server shutdown successful`);
      });
    } else {
      // eslint-disable-next-line no-console
      console.log("The server was not running");
    }
  }
}

module.exports = {
  Server,
};
