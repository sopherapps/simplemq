/** Tests for the server in message queue service */
const grpc = require("grpc");
const protoLoader = require("@grpc/proto-loader");
const { PROTOBUF_FILE_PATH } = require("../config");

// Load gRPC package definitions
const packageDefinition = protoLoader.loadSync(PROTOBUF_FILE_PATH, {});
const grpcObject = grpc.loadPackageDefinition(packageDefinition);
const { articleCurator } = grpcObject;
const PORT = 38000;

describe("message-queue server", () => {
  describe("sendMessage method", () => {
    it("should receive messages", () =>
      new Promise((done) => {
        // when the sendMessage() method is used, it should receive the message
        const client = new articleCurator.MessageQueue(
          `localhost:${PORT}`,
          grpc.credentials.createInsecure()
        );
        client.sendMessage(
          {
            topic: "test",
            data: JSON.stringify({
              id: 2,
              last_name: "Doe",
              first_name: "John",
            }),
          },
          (err, response) => {
            expect(response).toMatchObject({
              received: true,
            });
            done();
          }
        );
      }));
  });

  describe("subscribeToTopic", () => {
    // eslint-disable-next-line jest/no-done-callback
    it("should send bidirectional stream to subscriber clients", (done) => {
      const newArticles = [
        { id: 343, title: "A Great Many Tales" },
        { id: 343, title: "A Great Many Tales" },
        { id: 43, title: "Indigo" },
        { id: 34223, title: "The River" },
        { id: 3413, title: "A Tale" },
      ];
      const topic = "TEST";
      const clientId = "test";
      const client = new articleCurator.MessageQueue(
        `localhost:${PORT}`,
        grpc.credentials.createInsecure()
      );

      const call = client.subscribeToTopic();
      const receivedMessages = [];

      call.on("data", (message) => {
        if (message.messageType === "MESSAGE") {
          const messageId = message.payload.id;
          receivedMessages.push(JSON.parse(message.payload.data));
          call.write({ messageType: "ACKNOWLEDGMENT", payload: messageId });

          if (receivedMessages.length === newArticles.length) {
            call.end();
          }
        } else if (message.messageType === "TOPIC") {
          // hydrate the topic cache in the server
          newArticles.forEach((article) => {
            client.sendMessage(
              { topic, data: JSON.stringify(article) },
              // eslint-disable-next-line no-unused-vars
              (err, response) => {
                if (err) {
                  throw err;
                }
              }
            );
          });
        }
      });

      call.on("error", (err) => {
        throw err;
      });

      call.on("end", () => {
        expect(receivedMessages).toEqual(expect.arrayContaining(newArticles));
        done();
      });

      // connect and register for a topic
      call.write({ payload: clientId, messageType: "START" });
      call.write({ payload: topic, messageType: "TOPIC" });
    }, 15000);
  });
});
