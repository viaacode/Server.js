/*! @license MIT ©2014-2017 Ruben Verborgh and Ruben Taelman, Ghent University - imec */
/* LinkedDataFragmentsServerRunner is able to run a Linked Data Fragments server */

var _ = require('lodash'),
    fs = require('fs'),
    LinkedDataFragmentsServer = require('./LinkedDataFragmentsServer'),
    IndexDatasource = require('../lib/datasources/IndexDatasource'),
    ViewCollection = require('../lib/views/ViewCollection.js');

// Creates a new LinkedDataFragmentsServerWorker
function LinkedDataFragmentsServerWorker(config) {
  console.log(JSON.stringify(config, null, '  ')); // TODO

  // Configure preset URLs
  var baseURL = config.baseURL = config.baseURL.replace(/\/?$/, '/'),
      baseURLRoot = baseURL.match(/^(?:https?:\/\/[^\/]+)?/)[0],
      baseURLPath = baseURL.substr(baseURLRoot.length),
      blankNodePath = baseURLRoot ? '/.well-known/genid/' : '',
      blankNodePrefix = blankNodePath ? baseURLRoot + blankNodePath : 'genid:';

  var protocolMatch = (config.baseURL || '').match(/^(\w+):/);
  config.protocol = protocolMatch ? protocolMatch[1] : 'http';

  if (!config.datasources)
    throw new Error('At least one datasource must be defined.');
  if (!config.controllers)
    throw new Error('At least one controller must be defined.');
  if (!config.routers)
    throw new Error('At least one router must be defined.');

  // Create all data sources
  var datasources = config.datasources, datasourceBase = baseURLPath.substr(1), dereference = config.dereference;
  Object.keys(datasources).forEach(function (datasourceName) {
    var datasourceConfig = config.datasources[datasourceName], datasourcePath;
    delete datasources[datasourceName];
    if (datasourceConfig.enabled !== false) {
      try {
        // Avoid illegal URI characters in data source path
        datasourcePath = datasourceBase + encodeURI(datasourceName);
        datasources[datasourcePath] = datasourceConfig;
        // Set up blank-node-to-IRI translation, with dereferenceable URLs when possible
        datasourceConfig.settings = _.defaults(datasourceConfig.settings || {}, config);
        if (!datasourceConfig.settings.blankNodePrefix) {
          datasourceConfig.settings.blankNodePrefix = blankNodePrefix + datasourcePath + '/';
          if (blankNodePath)
            dereference[blankNodePath + datasourcePath + '/'] = datasourcePath;
        }
        // Create the data source
        var datasource = instantiate(datasourceConfig, '../lib/datasources/');
        datasource.on('error', datasourceError);
        datasourceConfig.datasource = datasource;
        datasourceConfig.url = baseURLRoot + '/' + datasourcePath + '#dataset';
        datasourceConfig.title = datasourceConfig.title || datasourceName;
      }
      catch (error) { datasourceError(error); }
      function datasourceError(error) {
        delete datasources[datasourcePath];
        process.stderr.write('WARNING: skipped datasource ' + datasourceName + '. ' + error.message + '\n');
      }
    }
  });

  // Create index data source
  var indexPath = datasourceBase.replace(/\/$/, '');
  datasources[indexPath] = datasources[indexPath] || {
    url: baseURLRoot + '/' + indexPath + '#dataset',
    hide: true,
    role: 'index',
    title: 'dataset index',
    datasource: new IndexDatasource({ datasources: datasources }),
  };

  // Set up assets
  config.assetsPath = baseURLPath + 'assets/';

  // Set up routers, views, and controllers
  // TODO: test these instantiations and rm (also settings.extensions)
  // config.routers = instantiateAll(config.routers,  '../lib/routers/');
  config.views = new ViewCollection();
  // config.views.addViews(instantiateAll(findFiles('../lib/views', /\.js$/)));
  // config.controllers = instantiateAll(config.controllers, '../lib/controllers/');

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
  var pending = _.size(datasources);
  _.each(datasources, function (settings) {
    var ready = _.once(startWhenReady);
    settings.datasource.once('initialized', ready);
    settings.datasource.once('error', ready);
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
