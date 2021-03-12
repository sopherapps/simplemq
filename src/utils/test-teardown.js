// teardown.js
module.exports = async () => {
  const stopServer = () =>
    // eslint-disable-next-line no-unused-vars
    new Promise((resolve, reject) => {
      // eslint-disable-next-line no-underscore-dangle
      global.__SERVER__.stop(() => {
        resolve();
      });
    });

  await stopServer();
};
