/**
 * Tests for the client
 */

const { Client } = require("../index");

const client = new Client({ clientId: "ClientTest", ipAddress: "localhost" });
const messages = [{ hi: "hello" }, { foo: "bar" }, { kajambo: "bye" }];

describe("Client", () => {
  describe("getMessageProducer", () => {
    beforeEach(() => {
      client.connect();
    });

    afterEach(() => {
      client.disconnect();
    });

    it("should send a JSON message to the queue", () =>
      new Promise((done) => {
        let messagesReceived = 0;

        // create the message producer
        const producer = client.getMessageProducer({
          topic: "CLIENT_TEST",
          onMessage: (message) => {
            expect(message).toMatchObject({ received: true });
            messagesReceived += 1;
            if (messagesReceived === messages.length) {
              done();
            }
          },
        });

        // send the messages
        messages.forEach((message) => {
          producer.send(JSON.stringify(message));
        });
      }));
  });

  describe("getMessageListener", () => {
    beforeEach(() => {
      client.connect();
    });

    afterEach(() => {
      client.disconnect();
    });

    it(
      "should listen to new messages",
      () =>
        new Promise((done) => {
          const topic = "CLIENT_TEST_2";
          let messageIndex = 0;

          const messageListener = client.getMessageListener({
            topic,
            onError: (err) => {
              throw err;
            },
            onMessage: (message) => {
              expect(JSON.parse(message)).toMatchObject(messages[messageIndex]);
              messageIndex += 1;

              if (messageIndex === messages.length) {
                done();
              }
            },
            onSubscription: (topicName) => {
              expect(topicName).toEqual(topic);

              // create the message producer
              const producer = client.getMessageProducer({
                topic: topicName,
                onMessage: () => {},
              });

              // send the messages
              messages.forEach((message) => {
                producer.send(JSON.stringify(message));
              });
            },
          });

          messageListener.start();
        }),
      15000
    );
  });
});
