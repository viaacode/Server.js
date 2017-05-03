/*! @license MIT ©2014-2017 Ruben Verborgh and Ruben Taelman, Ghent University - imec */
/* LinkedDataFragmentsServerRunner is able to run a Linked Data Fragments server */
/* eslint-disable no-console */

var _ = require('lodash'),
    fs = require('fs'),
    LinkedDataFragmentsServer = require('./LinkedDataFragmentsServer');

// Creates a new LinkedDataFragmentsServerWorker
function LinkedDataFragmentsServerWorker(config) {
  var protocolMatch = (config.urlData.baseURL || '').match(/^(\w+):/);
  config.protocol = protocolMatch ? protocolMatch[1] : 'http';

  if (!config.datasources)
    throw new Error('At least one datasource must be defined.');
  if (!config.controllers)
    throw new Error('At least one controller must be defined.');
  if (!config.routers)
    throw new Error('At least one router must be defined.');

  // Log datasource creation errors to console
  Object.keys(config.datasources).forEach(function (datasourceId) {
    var datasource = config.datasources[datasourceId];
    datasource.on('error', datasourceError);
    function datasourceError(error) {
      delete config.datasources[datasourceId];
      process.stderr.write('WARNING: skipped datasource ' + datasourceId + '. ' + error.message + '\n');
    }
  });

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

module.exports = LinkedDataFragmentsServerWorker;
