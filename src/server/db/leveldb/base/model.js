/**
 * This module contains the base class for the level db models
 */
const { default: Ajv } = require("ajv");

const { defaultCallback, generateUuid } = require("../utils");

class Model {
  constructor(collectionName, options = {}) {
    this.collectionName = collectionName;
    const { ttl, ttlInterval = 60000 } = options;
    this.ttl = ttl;
    this.ttlInterval = ttlInterval;

    this.avjObject = new Ajv({ allErrors: true });
    this.schema = {};
    this.validate = this.avjObject.compile(this.schema);
    this.cleanUpInProgress = false;
    this.clearOldRecordsInterval = undefined;

    // bind methods
    this.clearOldRecords = this.clearOldRecords.bind(this);
    this.addRecord = this.addRecord.bind(this);
    this.getRecord = this.getRecord.bind(this);
    this.cleanUp = this.cleanUp.bind(this);
    this.clear = this.clear.bind(this);

    if (this.ttl) {
      this.clearOldRecordsInterval = setInterval(() => {
        if (!this.cleanUpInProgress) {
          this.clearOldRecords();
        }
      }, this.ttlInterval);
    }
  }

  generateKey(id) {
    return `${this.collectionName}:${id}`;
  }

  // eslint-disable-next-line class-methods-use-this
  getIdFromKey(key) {
    return key.split(":")[1];
  }

  /**
   * Returns the range of keys for the given collection, to supply to the stream methods
   * @returns {{lt: string, gte: string}} - the range to pass in options
   */
  getKeyRange() {
    return {
      lt: String.fromCharCode(this.collectionName.charCodeAt(0) + 1),
      gte: this.collectionName,
    };
  }

  /**
   * Adds a record to the collection
   * @param {any} id - the id of the record
   * @param {string} data - the data for the new record
   * @param {(Error, any)=>void} callback - the callback to be called after action completes or errs.
   */
  addRecord(db, id = generateUuid(), data, callback = defaultCallback) {
    if (this.validate(data)) {
      const key = this.generateKey(id);
      db.put(
        key,
        JSON.stringify({ data, meta: { time: new Date().getTime() } })
      )
        .then(() => {
          callback(null, { id, data });
        })
        .catch((err) => {
          callback(err);
        });
    } else {
      throw this.avjObject.errorsText(this.validate.errors);
    }
  }

  /**
   * Gets a record from this model's collection
   * @param {any} id - the id to be used to find that particular record
   * @param {(Error|null, string|null)=>void} callback - the callback to be called after action completes or errs.
   */
  // eslint-disable-next-line class-methods-use-this
  getRecord(db, id, callback = defaultCallback) {
    const key = this.generateKey(id);
    db.get(key)
      .then((dataAsString) => {
        const { data } = JSON.parse(dataAsString);
        callback(null, data);
      })
      .catch((err) => {
        callback(err, null);
      });
  }

  /**
   * Removes a given record from the cache
   * @param {string} id - the id of the given record to be removed
   * @param {(Error|null, any)=>void} callback - the callbakc to be called on error on success of the operation
   */
  // eslint-disable-next-line class-methods-use-this
  removeRecord(db, id, callback = defaultCallback) {
    const key = this.generateKey(id);
    db.del(key)
      .then(() => {
        callback(null);
      })
      .catch((err) => callback(err));
  }

  /**
   * Streams the values in lexicographical order of the keys
   * @param {{ onData = (any) => void, onError = Error => void, onClose = () => void, onEnd = () => void}} handlers - the stream handlers
   */
  streamValues(db, handlers = {}, options = {}) {
    const {
      onData = () => {},
      onError = () => {},
      onClose = () => {},
      onEnd = () => {},
    } = handlers;
    const keyRange = this.getKeyRange();

    db.createValueStream({ ...keyRange, ...options })
      .on("data", (payload) => {
        const { data } = JSON.parse(payload);
        onData(data);
      })
      .on("error", (err) => {
        onError(err);
      })
      .on("close", () => onClose())
      .on("end", () => onEnd());

    // stream.read();
  }

  /**
   * Clears the cache
   * @param {(Error, any)=>void} callback - the callback to be called after action completes or errs.
   */
  // eslint-disable-next-line class-methods-use-this
  clear(db, callback = defaultCallback) {
    db.clear(callback);
  }

  /**
   * Method removes records that are stale i.e. have lasted for longer than ttl
   */
  clearOldRecords(db) {
    if (!this.ttl || !db) {
      return;
    }

    const currentTimestamp = new Date().getTime();
    const expiryTimestamp = currentTimestamp - this.ttl;
    const keyRange = this.getKeyRange();
    this.cleanUpInProgress = true;
    const batchDeleteOperations = [];

    db.createReadStream({ ...keyRange })
      .on("data", ({ key, value }) => {
        if (JSON.parse(value).meta.time <= expiryTimestamp) {
          batchDeleteOperations.push({ type: "del", key });
        }
      })
      .on("error", (err) => {
        this.cleanUpInProgress = false;
        throw err;
      })
      .on("close", () => {
        db.batch(batchDeleteOperations)
          .then(() => {
            this.cleanUpInProgress = false;
          })
          .catch((err) => {
            throw err;
          });
      })
      .on("end", () => {
        db.batch(batchDeleteOperations)
          .then(() => {
            this.cleanUpInProgress = false;
          })
          .catch((err) => {
            throw err;
          });
      });
  }

  /**
   * Cleans up any lose references and the like e.g. stopping the cleaning interval
   * This is to be called before the database is closed.
   */
  cleanUp() {
    clearInterval(this.clearOldRecordsInterval);
  }
}

module.exports = {
  Model,
};
