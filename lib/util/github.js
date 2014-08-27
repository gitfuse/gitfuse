const util = require('util');

const promise = require('./promise');
const request = promise.promisify(require('request').get);
const ghAuth = promise.promisify(require('ghauth'));

var getToken = function() {
  return ghAuth({
    configName: 'gitfuse.json',
    scopes: ['repo'],
    note: 'gitfuse'
  });
};

var fileUrl = function(dep, file) {
  return util.format(
    // TODO: allow a custom raw host
    'https://raw.githubusercontent.com/%s/%s/%s/%s',
    dep.user,
    dep.name,
    dep.version || 'master',
    file
  );
};

exports.requestFile = function(dep, file) {
  var ready = promise.resolve();
  if (dep.isPrivate) {
    ready = getToken();
  }
  return ready.then(function(token) {
    return request({
      url: fileUrl(dep, file),
      headers: {
        'Authorization': 'token ' + token.token
      }
    }).get(1);
  });
};

exports.packageJson = function(dep) {
  return exports.requestFile(dep, 'package.json')
    .then(JSON.parse).catch(function() {
      throw new Error('Unable to find package.json for ' + dep.name);
    });
};