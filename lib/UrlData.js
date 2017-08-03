/*! @license MIT ©2015-2017 Ruben Verborgh and Ruben Taelman, Ghent University - imec */
/* A data object class for preset URL information */

// Creates a new UrlData
function UrlData(options) {
  if (!(this instanceof UrlData))
    return new UrlData(options);
  // Configure preset URLs
  this.baseURL = (options || { baseURL: '/' }).baseURL.replace(/\/?$/, '/');
  this.baseURLRoot = this.baseURL.match(/^(?:https?:\/\/[^\/]+)?/)[0];
  this.baseURLPath = this.baseURL.substr(this.baseURLRoot.length);
  this.blankNodePath = this.baseURLRoot ? '/.well-known/genid/' : '';
  this.blankNodePrefix = this.blankNodePath ? this.baseURLRoot + this.blankNodePath : 'genid:';
  this.datasourceBase = this.baseURLPath.substr(1);
  this.assetsPath = this.baseURLPath + 'assets/' || options.assetsPath;
  this.protocol = options ? options.protocol : null;
  if (!this.protocol) {
    var protocolMatch = (this.baseURL || '').match(/^(\w+):/);
    this.protocol = protocolMatch ? protocolMatch[1] : 'http';
  }
}

module.exports = UrlData;