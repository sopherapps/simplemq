/**
 * This module contains the base class for the level db models
 */
const { default: Ajv } = require("ajv");
const path = require("path");
const cacache = require("cacache");

const { defaultCallback, generateUuid } = require("../utils");

class Model {
  constructor(collectionName, options = {}) {
    this.collectionName = collectionName;
    const { ttl, ttlInterval = 60000, baseCachePath } = options;
    this.cachePath = path.resolve(baseCachePath, collectionName);
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

  /**
   * Adds a record to the collection
   * @param {any} id - the id of the record
   * @param {string} data - the data for the new record
   * @param {(Error, any)=>void} callback - the callback to be called after action completes or errs.
   */
  addRecord(
    cachePath = this.cachePath,
    id = generateUuid(),
    data,
    callback = defaultCallback
  ) {
    if (this.validate(data)) {
      cacache
        .put(cachePath, id, data)
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
  getRecord(cachePath = this.cachePath, id, callback = defaultCallback) {
    cacache
      .get(cachePath, id)
      .then(({ data }) => {
        callback(null, data.toString());
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
  removeRecord(cachePath = this.cachePath, id, callback = defaultCallback) {
    cacache.rm
      .entry(cachePath, id)
      .then(() => {
        cacache
          .verify(cachePath)
          .then(() => callback())
          .catch((err) => callback(err));
      })
      .catch((err) => callback(err));
  }

  /**
   * Streams the keys saved in the given cache path
   * @param {string} cachePath - the path to the cache storing the data
   * @param {{ onData = (any) => void, onError = Error => void, onClose = () => void, onEnd = () => void}} handlers - the stream handlers
   */
  streamKeys(cachePath = this.cachePath, handlers = {}) {
    const {
      onData = () => {},
      onError = () => {},
      onClose = () => {},
      onEnd = () => {},
    } = handlers;

    cacache.ls
      .stream(cachePath)
      .on("data", (getInfoObject) => {
        onData(getInfoObject.key);
      })
      .on("error", (err) => {
        onError(err);
      })
      .on("close", () => onClose())
      .on("end", () => onEnd());
  }

  /**
   * Clears the cache
   * @param {(Error, any)=>void} callback - the callback to be called after action completes or errs.
   */
  clear(cachePath = this.cachePath, callback = defaultCallback) {
    cacache.rm
      .all(cachePath)
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  /**
   * Method removes records that are stale i.e. have lasted for longer than ttl
   */
  clearOldRecords(cachePath = this.cachePath) {
    if (!this.ttl) {
      return;
    }

    const currentTimestamp = new Date().getTime();
    const expiryTimestamp = currentTimestamp - this.ttl;
    this.cleanUpInProgress = true;

    cacache.ls
      .stream(cachePath)
      .on("data", (getInfoObject) => {
        if (getInfoObject.time <= expiryTimestamp) {
          cacache.rm.entry(cachePath, getInfoObject.key);
        }
      })
      .on("error", (err) => {
        this.cleanUpInProgress = false;
        throw err;
      })
      .on("close", () => {
        this.cleanUpInProgress = false;
        cacache
          .verify(cachePath)
          .then(() => {})
          .catch((err) => console.error(err));
      })
      .on("end", () => {
        this.cleanUpInProgress = false;
        cacache
          .verify(cachePath)
          .then(() => {})
          .catch((err) => console.error(err));
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
