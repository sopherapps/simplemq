/** Tests for the server in message queue service */
const path = require("path");
const grpc = require("grpc");
const protoLoader = require("@grpc/proto-loader");

// Load gRPC package definitions
const packageDefinition = protoLoader.loadSync(
  path.resolve(__dirname, "../article_curator.proto"),
  {}
);
const grpcObject = grpc.loadPackageDefinition(packageDefinition);
const articleCurator = grpcObject.articleCurator;
const PORT = 38000;

describe("message-queue server", () => {
  describe("sendMessage method", () => {
    it("should receive messages", (done) => {
      // when the sendMessage() method is used, it should receive the message
      const client = new articleCurator.MessageQueue(
        `localhost:${PORT}`,
        grpc.credentials.createInsecure()
      );
      client.sendMessage(
        {
          topic: "test",
          data: JSON.stringify({ id: 2, last_name: "Doe", first_name: "John" }),
        },
        (err, response) => {
          expect(response).toMatchObject({
            received: true,
          });
          done();
        }
      );
    });
  });

  describe("subscribeToTopic", () => {
    it("should send bidirectional stream to subscriber clients", (done) => {
      const newArticles = [
        { id: 343, title: "A Great Many Tales" },
        { id: 343, title: "A Great Many Tales" },
        { id: 43, title: "Indigo" },
        { id: 34223, title: "The River" },
        { id: 3413, title: "A Tale" },
      ];
      const topic = "NEW_ARTICLE";
      const client = new articleCurator.MessageQueue(
        `localhost:${PORT}`,
        grpc.credentials.createInsecure()
      );

      // // hydrate the topic cache in the server
      for (let article of newArticles) {
        client.sendMessage(
          { topic, data: JSON.stringify(article) },
          (err, response) => {
            if (err) {
              console.error(err);
            }
          }
        );
      }

      const call = client.subscribeToTopic();
      const receivedMessages = [];

      call.write({ payload: "NEW_ARTICLE", messageType: "TOPIC" });

      call.on("data", function (message) {
        const messageId = message.id;
        receivedMessages.push(JSON.parse(message.data));
        call.write({ messageType: "ACKNOWLEDGMENT", payload: messageId });

        if (receivedMessages.length === newArticles.length) {
          call.end();
        }
      });

      call.on("error", (err) => {
        throw err;
      });

      call.on("end", function () {
        expect(receivedMessages).toEqual(expect.arrayContaining(newArticles));
        done();
      });
    }, 15000);
  });
});
