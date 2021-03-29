/**
 * Module containing the server class
 */
const grpc = require("grpc");
const protoLoader = require("@grpc/proto-loader");
const { grpcHandlerFactory } = require("./grpc-handlers");
const { PROTOBUF_FILE_PATH } = require("../config");

const { Database } = require("./db");
const { defaultCachePath } = require("./db/utils");

class Server {
  /**
   * The server class that initializes the message queue
   * @param {{port?: number, ttl?: number, ttlInterval?: number, streamInterval?: number, dbFilePath?: string, maxWaitBeforeForceShutDown?: number}} options - the options for starting the Server
   */
  constructor(options = {}) {
    const {
      port = 38000,
      ttl = 1000 * 60 * 60 * 24 * 30,
      ttlInterval = 1000 * 60 * 60 * 24,
      streamInterval = 1000,
      dbFilePath = defaultCachePath,
      maxWaitBeforeForceShutDown = 2000,
    } = options;
    this.port = port;
    this.ttl = ttl;
    this.ttlInterval = ttlInterval;
    this.streamInterval = streamInterval;
    this.dbFilePath = dbFilePath;
    this.maxWaitBeforeForceShutDown = maxWaitBeforeForceShutDown;
    this.server = null;
    this.db = undefined;

    // bind method
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.initializeCleanUp = this.initializeCleanUp.bind(this);

    this.initializeCleanUp();
  }

  /**
   * Sets up signal handlers so as to ensure clean reaction to such things as Keyboard interrupts
   */
  initializeCleanUp() {
    process.on("exit", () => {
      this.stop();
    });

    // catch ctrl+c event and exit normally
    process.on("SIGINT", () => {
      console.log("Ctrl-C...");
      process.exit(1);
    });

    // catch uncaught exceptions, trace, then exit normally
    process.on("uncaughtException", (e) => {
      console.error("Uncaught Exception...");
      console.error(e.stack);
      process.exit(1);
    });
  }

  /**
   * Starts the message broker server
   */
  start() {
    const onDbInitialization = (dbInstance) => {
      const initializeGrpcServer = () => {
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
        console.log(`Server running on ${serverIpAndPort}`);
        console.log(`Environment NODE_ENV = ${process.env.NODE_ENV}`);
      };

      if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === "test") {
        dbInstance.clear((err) => {
          if (err) {
            throw err;
          }

          initializeGrpcServer();
        });
      }
    };

    // Initialize the database, then on finishing, initialize the gRPC Server
    this.db = new Database(undefined, {}, onDbInitialization);
  }

  /**
   * Stops the server to receive no more requests
   * @param {()=>void} callback - the callback to be called after action completes or errs.
   */
  stop(callback = () => {}) {
    const closeDatabase = () => {
      if (this.db) {
        this.db.close(callback);
      } else {
        callback();
      }
    };
    if (this.server) {
      const timeout = setTimeout(() => {
        console.log(`Server forcefully shutdown`);
        this.server.forceShutdown();
        closeDatabase();
      }, this.maxWaitBeforeForceShutDown);

      this.server.tryShutdown(() => {
        clearTimeout(timeout);
        console.log(`Server shutdown successful`);
        closeDatabase();
      });
    } else {
      console.log("The server was not running");
      closeDatabase();
    }
  }
}

module.exports = {
  Server,
};
