# simplemq

A simple message queue server that requires only nodejs.
It is can be used to pass JSON/string messages from one application to another in an
asynchronous way across the network.

Do note that **this package is still under heavy development**

## Components

This package includes:

1. A message queue server
2. A message queue client

One can chose to use any or both of these two components.

## Dependencies

- [gRPC](https://grpc.io/)
  - [protocol buffers 3](https://developers.google.com/protocol-buffers/docs/overview)
  - [Protobuf.js](https://www.npmjs.com/package/protobufjs)
- [Nodejs](https://nodejs.org/en/)
- [Lokijs](https://github.com/techfort/LokiJS/)

## Getting Started

### Running the simplemq Server

- Create a nodejs project

  ```sh
  npm init -y
  ```

- Install simplemq

  ```sh
  npm install simplemq
  ```

- Create the server file. Let's name it `server.js`

  ```sh
  touch server.js
  ```

- In `server.js` file, import the Server component from `simplemq`, initialize it then call its `start` method, and its `stop` method to stop the server in case of an error e.g. a KeyboardInterrupt
  The `options` passed on initiliazation include:

  - the `port` to run on
  - the `ttl` i.e. time to live in milliseconds for the messages before they are considered stale
  - the `ttlInterval` i.e. the interval in milliseconds for clearing out stale messages
  - the `streamInterval` i.e. the interval at which messages are to be sent to any listening client
  - the `dbFilePath` i.e. the path to the lokijs database to persist the messages, subscribers and topics
  - the `isPersistent` i.e. whether to persist the data across restarts of the server
  - the `maxWaitBeforeForcedShutDown` i.e. the number of milliseconds to wait after a shutdown has been initiated for a forceful shutdown to come into action

  ```Javascript
  const {Server} = require('simplemq');
  const server = new Server({
      port: 38000, // Default 38000
      ttl: 1000 * 60 * 60 * 24 * 30, // Default 30 days
      ttlInterval: 1000 * 60 * 60 * 24, // Default 1 day
      ...
  });

  try {
    server.start();
  } catch {
    if(server){
      server.stop();
    }
  }
  ```

- Run the nodejs server script

  ```sh
  node server.js
  ```

### Connecting to a simplemq Server

- In your nodejs project, install simplemq

  ```sh
  npm install @sopherapps/simplemq
  ```

- Create the client file if you don't have one yet. Let's call it `client.js`

- In `client.js`, import the Client component from `simplemq` and initialize it with `options`
  The `config` on initialization specifies:

  - the IP address (`ipAddress`) of the simplemq server
  - the optional `port` on which the simplemq server is running. Default is 38000.
  - the optional `interval` in milliseconds at which to receive the messages. Default is 1000.
  - a random `clientId` to identify the client

  ```Javascript
  const {Client} = require('simplemq');

  const client = new Client({
      ipAddress: 'localhost', // the ip address, for now we will assume the server is on this computer
      port: 38000, // Default is 38000, the port as specified in the server code
      interval: 1000, // Default is 1000, receive messages at least every second
      clientId: 'ity65476t9ygyf', // some random identifier the server will use to identify this client everytime the client connects
  });
  ```

- To connect to the remote server, call the `connect()` method of the client. Any attempt
  to generate another producer or listener from the client before it is connected will throw an exception.

  ```Javascript
  client.connect();
  ```

- Then call the client's `getMessageProducer` method to get a message producer, with an `options` argument specifying:

  - the `topic` - the topic to send to
  - the optional `onError` - the error handler function
  - the `onMessage` - the message handler

  ```Javascript
  const messageProducer = client.getMessageProducer({
    topic: 'Some topic',
    onError: (err)=>{console.error(err);}
    onMessage: (message)=>{console.log(message);}
  });
  ```

- To send messages to the selected topic, repeatedly call the `send` method of the message producer instance,
  while providing the data in JSON form that is to be sent

  ```Javascript
  messageProducer.send(JSON.stringify({hello: 'haloha'}));
  messageProducer.send(JSON.stringify({bye: 'good bye'}));
  ```

- Or `getMessageListener` method to get a message listener with an `options` argument specifying:

  - the `topic` that is to be listened to
  - the `onMessage` handler to be called whenever a message is received
  - the optional `onSubscription` handler to be called when a client succesfully subscribes to the given topic
  - the optional `onStop` handler to be called when a client stops listening
  - the optional `onStart` handler to be called when the client starts listening for messages

  ```Javascript
  const messageListener = client.getMessageListener({
    topic: 'Some topic',
    onError: (err) => {
        throw err;
    },
    onMessage: (message) => {
      console.log(message);
    },
    onSubscription: (topicName) => {
      console.log(`Subscribed to ${topicName}`);
    },
    onStop: () => {
      console.log(`Stopped listening on ${client.ipAddressAndPort}`);
    },
    onStart: () => {
      console.log(`Listening on ${client.ipAddressAndPort} to Topic: ${topic}`);
    },
  });
  ```

- To start listening for messages, call the `start` method of the message listener instance

  ```Javascript
  messageListener.start();
  ```

- To stop listening for messages, call the `stop` method of the message listener instance

  ```Javascript
  messageListener.stop();
  ```

- To disconnect the client from the remote server, call the `disconnect()` method of the client instance. Any attempt
  to generate another producer or listener from the client after it has been disconnected will throw an exception.

  ```Javascript
  client.disconnect();
  ```

## How To Contribute

Coming soon.

### How to test

- In the root of the project, install the dependencies

  ```sh
  npm install
  ```

- Run the test command

  ```sh
  npm test
  ```

## ToDo

- [x] Make lokijs persist to file
- [ ] There might be need for removeSubscriber function
- [x] Modularize the DB module itself into TOPICS, MESSAGES AND SUBSCRIBERS
- [x] Add JavaScript client code
- [ ] Create python client package
- [ ] Create java client package
- [ ] Add option to add certificates for authentication
- [ ] Add option for broadcast messages that don't get persisted
- [ ] Create sample app using simplemq
- [ ] Create blog posts showing its use
- [ ] Create videos showing its use
- [ ] Create a cloud service for simplemq
- [ ] Add logger
- [x] Publish npm package
- [ ] Publish pypi package

## License

Copyright (c) 2021 [Martin Ahindura](https://github.com/Tinitto) Licensed under the [MIT License](./LICENSE)
