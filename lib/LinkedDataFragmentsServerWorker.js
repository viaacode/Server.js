/*! @license MIT ©2014-2017 Ruben Verborgh and Ruben Taelman, Ghent University - imec */
/* LinkedDataFragmentsServerRunner is able to run a Linked Data Fragments server */

var _ = require('lodash'),
    fs = require('fs'),
    path = require('path'),
    LinkedDataFragmentsServer = require('./LinkedDataFragmentsServer'),
    ViewCollection = require('../lib/views/ViewCollection.js');

// Creates a new LinkedDataFragmentsServerWorker
function LinkedDataFragmentsServerWorker(config) {
  var urlData = config.urlData;

  var protocolMatch = (urlData.baseURL || '').match(/^(\w+):/);
  config.protocol = protocolMatch ? protocolMatch[1] : 'http';

  if (!config.datasources)
    throw new Error('At least one datasource must be defined.');
  if (!config.controllers)
    throw new Error('At least one controller must be defined.');
  if (!config.routers)
    throw new Error('At least one router must be defined.');

  // Create datasources object
  Object.keys(config.datasources).forEach(function (datasourceId) {
    var datasource = config.datasources[datasourceId];
    datasource.on('error', datasourceError);
    function datasourceError(error) {
      delete config.datasources[datasourceId];
      process.stderr.write('WARNING: skipped datasource ' + datasourceId + '. ' + error.message + '\n');
    }
  });

  // Set up assets
  config.assetsPath = urlData.baseURLPath + 'assets/';

  // Set up views
  // TODO: Port to components system
  config.views = new ViewCollection();
  config.views.addViews(instantiateAll(findFiles('../lib/views', /\.js$/), null, config));

  // Set up logging
  var loggingSettings = config.logging;
  config.log = console.log;
  if (loggingSettings.enabled) {
    var accesslog = require('access-log');
    config.accesslogger = function (request, response) {
      accesslog(request, response, null, function (logEntry) {
        fs.appendFile(loggingSettings.file, logEntry + '\n', function (error) {
          error && process.stderr.write('Error when writing to access log file: ' + error);
        });
      });
    };
  }

  var server = new LinkedDataFragmentsServer(config);

  // Start the server when all data sources are ready
  var pending = _.size(config.datasources);
  _.each(config.datasources, function (datasource) {
    var ready = _.once(startWhenReady);
    datasource.once('initialized', ready);
    datasource.once('error', ready);
  });
  function startWhenReady() {
    if (!--pending) {
      server.listen(config.port);
      console.log('Worker %d running on %s://localhost:%d/.', process.pid, config.protocol, config.port);
    }
  }

  // Terminate gracefully if possible
  process.once('SIGINT', function () {
    console.log('Stopping worker', process.pid);
    server.stop();
    process.on('SIGINT', function () { process.exit(1); });
  });
}

// TODO: rm
// Instantiates an object from the given description
var constructors = {};
function instantiate(description, includePath, config) {
  var type = description.type || description,
      typePath = path.join(includePath ? path.resolve(__dirname, includePath) : '', type),
      Constructor = constructors[typePath] || (constructors[typePath] = require(typePath)),
      extensions = config.extensions && config.extensions[type] || [],
      settings = _.defaults(description.settings || {}, {
        extensions: extensions.map(function (x) { return instantiate(x, includePath, config); }),
      }, config);
  return new Constructor(settings, config);
}

// Instantiates all objects from the given descriptions
function instantiateAll(descriptions, includePath, config) {
  return (_.isArray(descriptions) ? _.map : _.mapValues)(descriptions,
    function (description) { return instantiate(description, includePath, config); });
}

// Recursively finds files in a folder whose name matches the pattern
function findFiles(folder, pattern, includeCurrentFolder) {
  folder = path.resolve(__dirname, folder);
  return _.flatten(_.compact(fs.readdirSync(folder).map(function (name) {
    name = path.join(folder, name);
    if (fs.statSync(name).isDirectory())
      return findFiles(name, pattern, true);
    else if (includeCurrentFolder && pattern.test(name))
      return name;
  })));
}

module.exports = LinkedDataFragmentsServerWorker;
