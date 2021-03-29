/**
 * Module for creating clients
 */
const grpc = require("grpc");
const protoLoader = require("@grpc/proto-loader");
const { PROTOBUF_FILE_PATH } = require("../config");

// Load gRPC package definitions
const packageDefinition = protoLoader.loadSync(PROTOBUF_FILE_PATH, {});
const grpcObject = grpc.loadPackageDefinition(packageDefinition);
const { articleCurator } = grpcObject;

class Client {
  /**
   * Connects to a simplemq server at given IP address and port
   * @param {{clientId?: string, ipAddress?: string, interval?: number, port?: number}} options - the client connection options
   */
  constructor(options = {}) {
    const { clientId, ipAddress, interval = 1000, port = 38000 } = options;

    if (!clientId) {
      throw new Error("clientId is mandatory");
    }

    if (!ipAddress) {
      throw new Error("ipAddress is mandatory");
    }

    this.clientId = clientId;
    this.ipAddress = ipAddress;
    this.interval = interval;
    this.port = port;
    this.ipAddressAndPort = `${ipAddress}:${port}`;
    this.client = null;

    // Binding
    this.connect = this.connect.bind(this);
    this.getMessageListener = this.getMessageListener.bind(this);
    this.getMessageProducer = this.getMessageProducer.bind(this);
    this.disconnect = this.disconnect.bind(this);
  }

  /**
   * Connects the client to the remote message queue server
   */
  connect() {
    if (this.client) {
      throw new Error("The client already connected to the server");
    }

    this.client = new articleCurator.MessageQueue(
      this.ipAddressAndPort,
      grpc.credentials.createInsecure()
    );
  }

  /**
   * Generates a message producer that is to send messages to the remote message queue server
   * @param {{topic: string, onMessage: ([key: string]: any)=>void, onError: (any)=>void}} options - the options for the producer
   * @returns {{send: (string)=>void}} - the message producer
   */
  getMessageProducer(options = {}) {
    if (!this.client) {
      throw new Error(
        "Call connect() method first so as to connect to the server"
      );
    }

    const {
      topic,
      onMessage,
      onError = (err) => {
        throw err;
      },
    } = options;
    const self = this;
    if (!topic) {
      throw new Error("topic is mandatory");
    }

    if (!onMessage) {
      throw new Error("onMessage is mandatory");
    }
    return {
      send(dataAsJson) {
        self.client.sendMessage(
          { topic, data: dataAsJson },
          (err, response) => {
            if (err) onError(err);
            else onMessage(response);
          }
        );
      },
    };
  }

  /**
   * Returns a listener to listen and react to messages
   * @param {{topic: string, onError: (any)=>void, onMessage: (string)=>void, onSubscription: (string)=>void, onStop: ()=>void, onStart: ()=>void}} options - options for the listener
   * @returns {{start: ()=>void, stop: ()=>void}} - the listener object
   */
  getMessageListener(options = {}) {
    if (!this.client) {
      throw new Error(
        "Call connect() method first so as to connect to the server"
      );
    }

    const {
      topic,
      onError = (err) => {
        throw err;
      },
      onMessage,
      onSubscription = (topicName) => {
        console.log(`Subscribed to ${topicName}`);
      },
      onStop = () => {
        console.log(`Stopped listening on ${this.ipAddressAndPort}`);
      },
      onStart = () => {
        console.log(`Listening on ${this.ipAddressAndPort} to Topic: ${topic}`);
      },
    } = options;
    const self = this;

    if (!onMessage) {
      throw new Error("onMessage function is mandatory");
    }

    if (!topic) {
      throw new Error("topic is mandatory");
    }

    const call = this.client.subscribeToTopic();

    call.on("data", (message) => {
      if (message.messageType === "MESSAGE") {
        onMessage(message.payload.data);

        const messageId = message.payload.id;
        call.write({ messageType: "ACKNOWLEDGMENT", payload: messageId });
      } else if (message.messageType === "TOPIC") {
        const parsedMessage = JSON.parse(message.payload.data);
        onSubscription(parsedMessage.topic);
      } else if (message.messageType === "ERROR") {
        const parsedMessage = JSON.parse(message.payload.data);
        throw new Error(parsedMessage.message);
      }
    });

    call.on("error", (err) => {
      onError(err);
      call.end();
    });

    call.on("end", () => onStop());

    return {
      start() {
        call.write({ payload: self.clientId, messageType: "START" });
        call.write({ payload: topic, messageType: "TOPIC" });
        onStart();
      },
      stop() {
        call.end();
      },
    };
  }

  /**
   * Disconnects the client from the server
   */
  disconnect() {
    if (!this.client) {
      throw new Error("Client is not connected");
    }
    this.client.close();
    this.client = null;
  }
}

module.exports = {
  Client,
};
