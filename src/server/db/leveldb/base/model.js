/**
 * This module contains the base class for the level db models
 */
const { default: Ajv } = require("ajv");

const defaultCallback = (err) => {
  throw err;
};

class LevelDbModel {
  constructor(collectionName, primaryField = undefined, options = {}) {
    this.collectionName = collectionName;
    const { ttl, ttlInterval = 60000 } = options;
    this.ttl = ttl;
    this.ttlInterval = ttlInterval;
    this.primaryField = primaryField;

    this.avjObject = new Ajv({ allErrors: true });
    this.schema = {};
    this.validate = this.avjObject.compile(this.schema);
    this.db = null;
    this.cleanUpInProgress = false;
    this.clearOldRecordsInterval = undefined;

    // bind methods
    this.setDatabase = this.setDatabase.bind(this);
    this.clearOldRecords = this.clearOldRecords.bind(this);
    this.addRecord = this.addRecord.bind(this);
    this.getRecord = this.getRecord.bind(this);

    if (this.ttl) {
      this.clearOldRecordsInterval = setInterval(() => {
        this.clearOldRecords();
      }, this.ttlInterval);
    }
  }

  /**
   * Method removes records that are stale i.e. have lasted for longer than ttl
   */
  clearOldRecords() {
    if (!this.ttl) {
      return;
    }

    const currentTimestamp = new Date().getTime();
    const expiryTimestamp = currentTimestamp - this.ttl;
    this.cleanUpInProgress = true;

    this.db
      .createReadStream({
        gte: `${this.collectionName}`,
        lte: String.fromCharCode(this.collectionName.charCodeAt(0) + 1),
      })
      .on("data", (data) => {
        const { meta } = data.value;
        if (meta.createdOn && meta.createdOn <= expiryTimestamp) {
          this.db.del(data.key, (err) => {
            throw err;
          });
        }
      })
      .on("error", (err) => {
        this.cleanUpInProgress = false;
        throw err;
      })
      .on("close", () => {
        this.cleanUpInProgress = false;
      })
      .on("end", () => {
        this.cleanUpInProgress = false;
      });
  }

  /**
   * Sets the db attached to this model to the db instance passed
   * @param {any} db - the levelDb instance
   */
  setDatabase(db) {
    this.db = db;
  }

  /**
   * Generates the key to save in the levelDB for the given id
   * @param {any} id - the actual id of the item
   * @returns {string}
   */
  generateKey(id) {
    return `${this.collectionName}:${id}`;
  }

  /**
   * Returns the actual id of the item, extracting it from what is saved in the database
   * @param {string} key - the key as saved in levelDB
   * @returns {any}
   */
  // eslint-disable-next-line class-methods-use-this
  getIdFromKey(key) {
    const [, idAsString] = key.split(":");
    try {
      return BigInt(idAsString);
    } catch (error) {
      return idAsString;
    }
  }

  /**
   * Returns the range of keys under this collection using the prefix 'this.collectionName:'
   * @returns {{gte: string, lte: string}}
   */
  getKeyRange() {
    return {
      gte: `${this.collectionName}`,
      lte: String.fromCharCode(this.collectionName.charCodeAt(0) + 1),
    };
  }

  /**
   * Gets the next autoincremented id in the collection and if there is none, it returns 1n
   * @returns {BigInt} - an ever increasing id
   */
  getNextId() {
    let lastId = 0n;
    let isInProgress = true;

    const stream = this.db
      .createKeyStream({ ...this.getKeyRange(), limit: 1, reverse: true })
      .on("data", (key) => {
        lastId = this.getIdFromKey(key);
      })
      .on("error", (err) => {
        isInProgress = false;
        throw err;
      })
      .on("end", () => {
        isInProgress = false;
      })
      .on("close", () => {
        isInProgress = false;
      });

    const timeoutHandle = setTimeout(() => {
      if (isInProgress) {
        stream.destroy(new Error("Timed out while reading from db"));
      }
    }, 2000); // 2 seconds timeout

    // eslint-disable-next-line no-empty
    while (isInProgress) {}

    clearTimeout(timeoutHandle);

    return lastId + 1n;
  }

  /**
   * Prepares the data that is to be saved in the database
   * @param {any} data - the data to be saved
   * @param {{createdOn: number?, updatedOn: number?, collection: string?}} meta - the meta data to attach to the data
   * @returns {{data: any, meta: {createdOn: number, updatedOn: number}}}
   */
  // eslint-disable-next-line class-methods-use-this
  prepareDataForSaving(data, meta = {}) {
    const {
      createdOn = new Date().getTime(),
      updatedOn = new Date().getTime(),
    } = meta;

    return { meta: { createdOn, updatedOn }, data };
  }

  /**
   * Adds a record to the collection
   * @param {any} id - the id of the record
   * @param {{[key: string]: any}} data - the data for the new record
   * @param {{createdOn: number?, updatedOn: number?, collection: string?}} meta - the meta data to attach to the data
   */
  addRecord(
    id = this.getNextId(),
    data,
    meta = {},
    callback = defaultCallback
  ) {
    if (this.validate(data)) {
      const key = this.generateKey(id);
      const enhancedData = this.prepareDataForSaving(data, meta);
      this.db.put(key, enhancedData, (err) => {
        callback(err, [id, data]);
      });
    }

    throw this.avjObject.errorsText(this.validate.errors);
  }

  /**
   * Gets a record from this model's collection   *
   * @param {any} id - the id to be used to find that particular record
   */
  getRecord(id, callback = defaultCallback) {
    const key = this.generateKey(id);
    this.db.get(key, (err, value) => {
      if (err && err.notFound) {
        callback(null, null);
      } else if (err) {
        callback(err);
      } else {
        callback(null, value.data);
      }
    });
  }

  /**
   * Cleans up any lose references and the like e.g. stopping the cleaning interval
   * This is to be called before the database is closed.
   */
  cleanUp() {
    clearInterval(this.clearOldRecordsInterval);
  }

  /**
   * Updates the records for the given keys or ids
   * @param {any[]} ids - the list of ids
   * @param {(any)=> any} updateFunction - the update function that receives each given record and changes it accordingly and retunrs updated record
   */
  updateRecords(ids, updateFunction, callback = defaultCallback) {
    let isInProgress = false;
    const batchOperations = [];

    const stream = this.db
      .createReadStream({ ...this.getKeyRange() })
      .on("data", (data) => {
        const { key, value } = data;
        const id = this.getIdFromKey(key);

        if (ids.includes(id)) {
          const updatedData = updateFunction(value.data);
          batchOperations.push({
            type: "put",
            key,
            value: this.prepareDataForSaving(updatedData, value.meta),
          });
        }

        if (batchOperations.length === ids.length) {
          isInProgress = false;
          stream.destroy();
        }
      })
      .on("error", (err) => {
        isInProgress = false;
        throw err;
      })
      .on("end", () => {
        isInProgress = false;
      })
      .on("close", () => {
        isInProgress = false;
      });

    // eslint-disable-next-line no-empty
    while (isInProgress) {}

    this.db.batch(batchOperations, (err) => {
      callback(err);
    });
  }

  /**
   * Replaces a record of a given id with another record with that same id
   * @param {any} id - the id for the given record
   * @param {{[key: string]: any}} newRecord - the new record with an existing id
   */
  replaceRecord(id, newRecord, callback = defaultCallback) {
    if (this.validate(newRecord)) {
      const key = this.generateKey(id);
      this.db.get(key, (err, value) => {
        if (err) {
          throw err;
        }
        const { meta } = value;
        const enhancedData = this.prepareDataForSaving(newRecord, meta);
        this.db.put(key, enhancedData, (error) => {
          callback(error);
        });
      });
    }

    throw this.avjObject.errorsText(this.validate.errors);
  }

  /**
   * Removes the records of the given keys
   */
  clear(callback = defaultCallback) {
    let isInProgress = true;
    const batchOperations = [];

    this.db
      .createKeyStream({ ...this.getKeyRange() })
      .on("data", (key) => {
        batchOperations.push({ type: "del", key });
      })
      .on("error", (err) => {
        isInProgress = false;
        throw err;
      })
      .on("end", () => {
        isInProgress = false;
      })
      .on("close", () => {
        isInProgress = false;
      });

    // eslint-disable-next-line no-empty
    while (isInProgress) {}

    this.db.batch(batchOperations, callback);
  }
}

module.exports = {
  LevelDbModel,
};
