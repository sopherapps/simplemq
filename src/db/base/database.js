/**
 * Module contains the class the creates the db instance
 */
const Loki = require("lokijs");
const LokiFsStructuredAdapter = require("lokijs/src/loki-fs-structured-adapter.js");
// eslint-disable-next-line no-unused-vars
const { Model } = require("./model");

class Database {
  /**
   * The database class that persists queue data
   * @param {string} filePath - file path to the database e.g. queue.db
   * @param {Partial<LokiConstructorOptions> & Partial<LokiConfigOptions> & Partial<ThrottledSaveDrainOptions>)} options - the configuration for the lokijs
   * @param {Model[]} models to attach to this database
   * @param {() => void} onIntializeHandler - A function to run on initialization e.g. start server app
   */
  constructor(filePath, options, models, onIntializeHandler = () => {}) {
    this.db = new Loki(filePath, {
      adapter: new LokiFsStructuredAdapter(),
      autoload: true,
      // eslint-disable-next-line no-use-before-define
      autoloadCallback,
      autosave: true,
      autosaveInterval: 1000,
      ...options,
    });
    this.models = {};
    const self = this;

    function autoloadCallback() {
      models.forEach((model) => {
        let collection = self.db.getCollection(model.collectionName);

        if (collection === null) {
          collection = self.db.addCollection(
            model.collectionName,
            model.options
          );
        }

        model.setCollection(collection);
        self.models[model.collectionName] = model;
      });
      onIntializeHandler();
    }
  }
}

module.exports = {
  Database,
};
