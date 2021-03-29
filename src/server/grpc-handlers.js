/**
 * Module containing handlers to handle gRPC requests
 */

/**
 *
 * @param {Database} db - the database for persisting messages, clients/subscribers and topcs
 * @param {{[key: string], any}} options - any extra options to be passed to the factory
 * @returns {sendMessage: (any, (err, response)=>void) => void, subscribeToTopic: (any)=>void } - the grpc handler object
 */
function grpcHandlerFactory(db, options = {}) {
  const { streamInterval = 1000 } = options;
  return {
    /**
     * The gRPC method for handling messages sent by client apps
     * @param {object} call - the call object from the unary request
     * @param {(any, any)=>void} callback - the callback function to call after the request is handled to close it
     */
    sendMessage(call, callback) {
      const { topic } = call.request;
      const message = call.request.data;

      db.addMessageToTopic(topic, JSON.parse(message), (err) => {
        if (err) {
          callback(err, { received: false });
        } else {
          callback(null, { received: true });
        }
      });
    },

    /**
     * The gRPC method to handle the bidirectional stream requests initiated by client apps
     * @param {object} call - the call object from the bidirectional stream request
     */
    subscribeToTopic(call) {
      let intervalHandle;
      let clientId;
      let isStreaming = false;

      call.on("error", (err) => {
        try {
          call.write({
            messageType: "ERROR",
            payload: {
              id: null,
              data: JSON.stringify({ message: err }),
            },
          });
          clearInterval(intervalHandle);
          call.end();
        } catch (error) {
          console.error(error);
        }
      });

      call.on("status", (status) => {
        console.log(status);
      });

      call.on("data", (clientResponse) => {
        if (clientResponse.messageType === "START") {
          if (intervalHandle) {
            clearInterval(intervalHandle);
          }

          clientId = clientResponse.payload;

          intervalHandle = setInterval(() => {
            if (!isStreaming) {
              isStreaming = true;

              db.getNextMessageForSubscriber(
                clientId,
                (error, nextMessage) => {
                  if (nextMessage) {
                    call.write({
                      messageType: "MESSAGE",
                      payload: {
                        id: nextMessage.id,
                        data: JSON.stringify(nextMessage.data),
                      },
                    });
                  }
                },
                () => {
                  isStreaming = false;
                }
              );
            }
          }, streamInterval);
        } else if (clientResponse.messageType === "TOPIC") {
          // FIXME: change TOPIC to SUBSCRIBE
          // FIXME: Add another branch for UNSUBSCRIBE
          const topic = clientResponse.payload;
          db.subscribeToTopic(topic, clientId, (err) => {
            if (err) {
              throw err;
            }
            call.write({
              messageType: "TOPIC",
              payload: {
                id: null,
                data: JSON.stringify({ topic }),
              },
            });
          });
        } else if (clientResponse.messageType === "ACKNOWLEDGMENT") {
          const messageId = clientResponse.payload;
          db.deleteMessage(clientId, messageId, (err) => {
            if (err) {
              console.error(err);
            }
          });
        }
      });

      call.on("end", () => {
        clearInterval(intervalHandle);
        call.end();
      });
    },
  };
}

module.exports = {
  grpcHandlerFactory,
};
