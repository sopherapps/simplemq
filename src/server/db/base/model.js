/**
 * Module containing the base class for models for the database
 */
const { default: Ajv } = require("ajv");

class Model {
  /**
   * This is the base model class for all collections
   * @param {string} collectionName - the name of the collection in the database
   * @param {string} primaryField - the field that is to be used for searching
   * @param {Partial<CollectionOptions<{ topic: any; } & { topic: any; }>>)} options - the options to be passed to the addCollection method
   */
  constructor(collectionName, primaryField, options = {}) {
    this.collectionName = collectionName;
    this.options = {
      unique: [primaryField],
      indices: [primaryField],
      ...options,
    };
    this.collection = null;
    this.avjObject = new Ajv({ allErrors: true });
    this.primaryField = primaryField;
    this.schema = {};
    this.validate = this.avjObject.compile(this.schema);

    // Bindings for safety
    this.setCollection = this.setCollection.bind(this);
    this.addRecord = this.addRecord.bind(this);
    this.getRecord = this.getRecord.bind(this);
    this.updateRecords = this.updateRecords.bind(this);
    this.replaceRecord = this.replaceRecord.bind(this);
  }

  /**
   * Sets the collection of this model to a given collection
   * @param {Collection<any>} collection - the Lokijs collection
   */
  setCollection(collection) {
    this.collection = collection;
  }

  /**
   * Adds a record to the collection
   * @param {{[key: string]: any}} data - the data for the new record
   * @returns - document created
   */
  addRecord(data) {
    if (this.validate(data)) {
      return this.collection.insert(data);
    }

    throw this.avjObject.errorsText(this.validate.errors);
  }

  /**
   * Gets a record from this model's collection
   * @param {any} id - the id to be used to find that particular record
   * @returns {any}
   */
  getRecord(id) {
    return this.collection.findOne({ [this.primaryField]: id });
  }

  /**
   * Updates the records that fit the criteria specified by the filterObject
   * @param {{[key: string]: any}} filterObject - the mongodb like filter query for finding the records to update
   * @param {(any)=> void} updateFunction - the update function that receives each given record and changes it accordingly
   */
  updateRecords(filterObject, updateFunction) {
    this.collection.findAndUpdate(filterObject, updateFunction);
  }

  /**
   * Replaces a record of a given id with another record with that same id
   * @param {any} newRecord - the new record with an existing id
   */
  replaceRecord(newRecord) {
    this.collection.update(newRecord);
  }

  /**
   * Removes the records that fit the criteria specified by the filterObject
   * @param {{[key: string]: any}} filterObject - the mongodb like filter query for finding the records to update
   */
  deleteRecords(filterObject) {
    this.collection.findAndRemove(filterObject);
  }
}

module.exports = {
  Model,
};
