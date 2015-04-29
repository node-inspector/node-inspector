var fs = require('fs'),
    inherits = require('util').inherits,
    path = require('path');

var CWD = path.join(__dirname, '../plugins');

function PluginError(message) {
  this.name = 'Plugin Error';
  this.message = this.name + ':\n' + message;
}
inherits(PluginError, Error);

function findEq(collection, option, value) {
  return collection.filter(function(item) {
    return item[option] == value;
  })[0];
}

var plugins = [],
    dirlist;

try {
  dirlist = fs.readdirSync(CWD);
} catch (err) {
  dirlist = [];
}
  
dirlist.reduce(function(plugins, subdir) {
    var _path = path.resolve(CWD, subdir, 'manifest.json'),
        manifest;

    try {
      manifest = require(_path);

      // This excludes situation where we have two plugins with same name.
      if (subdir !== manifest.name)
        throw new PluginError('Plugin name in manifest.json is different from npm module name');
    } catch (e) {
      console.error('Corrupted manifest.json in %s plugin\n%s\n%s', subdir, e.message, e.stack);
      return plugins;
    }

    validateManifest(manifest);
    plugins.push(manifest);
    return plugins;
  }, plugins);

function validateManifest(manifest) {
  manifest.session = manifest.session || {};
  manifest.protocol = manifest.protocol || {};
  manifest.protocol.domains = manifest.protocol.domains || []; 
}

function InspectorJson(config) {
  var inspectorJsonPath = path.join(__dirname, '../front-end/inspector.json'),
      inspectorJson = JSON.parse(fs.readFileSync(inspectorJsonPath)),
      extendedInspectorJsonPath = path.join(__dirname, '../front-end-node/inspector.json'),
      extendedInspectorJson = JSON.parse(fs.readFileSync(extendedInspectorJsonPath));

  this._config = config;
  this._notes = inspectorJson;

  this._merge(extendedInspectorJson);

  if (!config.plugins) return;

  plugins.forEach(function(plugin) {
    var excludes = (plugin.exclude || []).map(function(name) {
      return { name: name, type: 'exclude' };
    });

    var note = {
      name: 'plugins/' + plugin.name,
      type: plugin.type || ''
    };

    var notes = excludes.concat(note);

    this._merge(notes);
  }, this);
}

InspectorJson.prototype._merge = function(toMergeNotes) {
  var result = [];

  toMergeNotes.forEach(function(note) {
    if (note.type == 'exclude') return;
    
    result.push(note);
  });
  
  this._notes.forEach(function(note) {
    var exists = findEq(toMergeNotes, 'name', note.name);
    if (exists) return;
    
    result.push(note);
  });

  this._notes = result;
};

InspectorJson.prototype.toJSON = function() {
  return this._notes;
};

module.exports = {
  cwd: CWD,
  list: plugins,
  validateManifest: validateManifest,
  PluginError: PluginError,
  InspectorJson: InspectorJson
};
