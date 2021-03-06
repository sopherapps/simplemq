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

    // Bindings for safety
    this.setCollection = this.setCollection.bind(this);
    this.validate = this.avjObject.compile(this.schema);
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

  getRecord(id) {
    return this.collection.find({ [this.primaryField]: id });
  }

  updateRecord(id, updateFunction) {
    this.collection.findAndUpdate({ [this.primaryField]: id }, updateFunction);
  }

  replaceRecord(newRecord) {
    this.collection.update(newRecord);
  }
}

module.exports = {
  Model,
};
