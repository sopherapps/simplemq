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

- In `server.js` file, import the server component from `simplemq` and call its start method
  with one argument i.e. the `config` which specifies:

  - the `port` to run on
  - the `ttl` i.e. time to live in milliseconds for the messages before they are considered stale
  - the `ttlInterval` i.e. the interval in milliseconds for clearing out stale messages

  ```Javascript
  const {server} = require('simplemq');
  server.start({
      port: 38000, // Default 38000
      ttl: 1000 * 60 * 60 * 24 * 30, // Default 30 days
      ttlInterval: 1000 * 60 * 60 * 24, // Default 1 day
  });
  ```

- Run the nodejs server script

  ```sh
  node server.js
  ```

### Connecting to a simplemq Server

- In your nodejs project, install simplemq

  ```sh
  npm install simplemq
  ```

- Create the client file if you don't have one yet. Let's call it `client.js`

- In `client.js`, import the client component from `simplemq` and call its listen method with two arguments, `config` and a `callback` function.
  The `config` specifies:

  - the IP address (`ipAddress`) of the simplemq server
  - the `port` on which the simplemq server is running
  - the `interval` in milliseconds at which to receive the messages
  - a random `clientId` to identify the client

  ```Javascript
  const {client} = require('simplemq');

  client.listen({
      ipAddress: 'localhost', // the ip address, for now we will assume the server is on this computer
      port: 38000, // Default is 38000, the port as specified in the server code
      interval: 1000, // Default is 1000, receive messages at least every second
      clientId: 'ity65476t9ygyf', // some random identifier the server will use to identify this client everytime the client connects
  }, (err, message) => {
      if(err){
        throw err;
      }
      // do something with the message e.g. logging it to the terminal
      console.log(message);
  });

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

- [ ] Make lokijs persist to file
- [ ] There might be need for removeSubscriber function
- [ ] Modularize the DB module itself into TOPICS, MESSAGES AND SUBSCRIBERS
- [ ] Add JavaScript client code
- [ ] Create python client package
- [ ] Create java client package
- [ ] Add option to add certificates for authentication
- [ ] Add option for broadcast messages that don't get persisted
- [ ] Create sample app using simplemq
- [ ] Create blog posts showing its use
- [ ] Create videos showing its use
- [ ] Create a cloud service for simplemq

## License

Copyright (c) 2021 [Martin Ahindura](https://github.com/Tinitto) Licensed under the [MIT License](./LICENSE)
