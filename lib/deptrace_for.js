const _ = require('lodash');
const Deptrace = require('deptrace');

const deps = require('./util/deps');
const github = require('./util/github');
const promise = require('./util/promise');

module.exports = function(opts) {
  opts = opts || {};
  var localVersion = opts.localVersion;

  return new Deptrace({
    setup: function() {
      // get registry once for the duration of each graphing run
      // this is pretty hack, but it's likely safe to assume
      // the registry won't change rapidly enough to ever matter
      return this.loadRegistry().then(function(registry) {
        this.registryResolved = registry;
      }.bind(this));
    }.bind(this),
    // extract array of dependencies from configuration
    depsFor: Deptrace.packageJson(this.dependencyKey),
    // resolve each dependency to a more complete representation
    resolve: function(dep, parents) {
      // find dependency in registry
      return this.find(dep.name, this.registryResolved)
        .bind(this)
        // add state from local machine
        .then(function(registryEntry) {
          var parent = parents[parents.length - 1];
          var entryCopy = _.clone(registryEntry);
          return deps
            .state({
              cwd: parent.welder.cwd,
              name: registryEntry.name,
              registryEntry: registryEntry,
              version: parent[this.dependencyKey][registryEntry.name],
            })
            .then(function(entry, state) {
              return {
                registryEntry: entry,
                welder: state,
              };
            }.bind(null, entryCopy));
        })
        .then(function(meta) {
          var config = this.configurationFile;
          // find config file on github
          var registryEntry = meta.registryEntry;
          if (localVersion) {
            registryEntry.version = meta.welder.localVersion;
          } else {
            registryEntry.version = meta.welder.expectedVersion;
          }

          var packageJson;
          var parent = parents[parents.length - 1];
          if (parent.shrinkwrap) {
            var shrinkwrap = _.find(
              parent.shrinkwrap[this.dependencyKey],
              function(dep) {
                return dep.name === registryEntry.name;
              }
            );
            var packageObj = {
              name: registryEntry.name,
              shrinkwrap: shrinkwrap,
            };
            var packageDeps = packageObj[this.dependencyKey] = {};
            (shrinkwrap[this.dependencyKey] || []).forEach(function(obj) {
              packageDeps[obj.name] = obj.version;
            });
            packageJson = promise.resolve(packageObj);
          } else {
            packageJson = github.requestFile(registryEntry, config)
              .then(JSON.parse);
          }

          return packageJson
            .then(function(json) {
              // save registryEntry data on configuration file
              json.registryEntry = registryEntry;
              json.welder = meta.welder;
              return json;
            })
            .catch(function() {
              throw new Error(
                'Unable to find ' + config + ' for ' + registryEntry.name
              );
            });
        });
    }.bind(this)
  });
};
