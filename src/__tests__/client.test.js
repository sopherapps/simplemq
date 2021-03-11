/**
 * Tests for the client
 */

const { Client, Server } = require("../index");

const server = new Server();
const client = new Client({ clientId: "ClientTest", ipAddress: "localhost" });
const messages = [{ hi: "hello" }, { foo: "bar" }, { kajambo: "bye" }];

// describe("Client", () => {
//   describe("getMessageProducer", () => {
//     it("should send a JSON message to the queue", () =>
//       new Promise((done) => {
//         let messagesReceived = 0;

//         // create the message producer
//         const producer = client.getMessageProducer({
//           topic: "CLIENT_TEST",
//           onMessage: (message) => {
//             expect(message).toMatchObject({ received: true });
//             messagesReceived += 1;
//             if (messagesReceived === messages.length) {
//               done();
//             }
//           },
//         });

//         // send the messages
//         messages.forEach((message) => {
//           producer.send(JSON.stringify(message));
//         });
//       }));
//   });

// describe("getMessageListener", () => {
//   it(
//     "should listen to new messages",
//     () =>
//       new Promise((done) => {
// should be in beforeEach
// server.start();
client.connect();
const topic = "CLIENT_TEST_2";
let messageIndex = 0;

const messageListener = client.getMessageListener({
  topic,
  onError: (err) => {
    throw err;
  },
  onMessage: (message) => {
    // expect(JSON.parse(message)).toMatchObject(messages[messageIndex]);
    console.log(message);
    messageIndex += 1;

    if (messageIndex === messages.length) {
      // messageListener.stop();
      // done();
      // should be in afterEach
      // client.disconnect();
    }
  },
  onSubscription: (topicName) => {
    // expect(topicName).toEqual(topic);

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
// // should be in afterEach
// client.disconnect();
// server.stop();
//         }),
//       15000
//     );
//   });
// });
