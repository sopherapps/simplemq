// eslint-disable-next-line import/no-extraneous-dependencies
const waitOn = require("wait-on");
const { Server } = require("../index");

const server = new Server();

module.exports = async () => {
  // eslint-disable-next-line no-underscore-dangle
  global.__SERVER__ = server;
  server.start();

  await waitOn({ resources: ["tcp:localhost:38000"] });
};
