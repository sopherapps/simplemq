const { Server } = require("../index");

const server = new Server();

try {
  server.start();
} catch (error) {
  server.stop();
}
