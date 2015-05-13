var fs = require('fs'),
    inherits = require('util').inherits,
    path = require('path');

var CWD = path.join(__dirname, '../plugins'),
    THROW_CONFLICTS = true;

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

function mergeByName(acceptor, donor, name, onConflict) {
  if (!donor || !donor.length) return;

  donor.forEach(function(note) {
    var sameOrigNote = findEq(acceptor, name, note[name]);
    if (sameOrigNote) {
      onConflict(sameOrigNote, note);
    } else {
      acceptor.push(note);
    }
  }, this);
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


function ProtocolJson(config) {
  var protocolJsonPath = path.join(__dirname, '../tools/protocol.json'),
      protocolJson = JSON.parse(fs.readFileSync(protocolJsonPath)),
      extendedProtocolJsonPath = path.join(__dirname, '../front-end-node/protocol.json'),
      extendedProtocolJson = JSON.parse(fs.readFileSync(extendedProtocolJsonPath));

  this._config = config;
  this._protocol = protocolJson;
  this._domains = protocolJson.domains;
  this._extendedDomains = extendedProtocolJson.domains;

  if (config.plugins) {
    // At first step we merge all plugins in one protocol.
    // We expect what plugins doesn't have equal methods, events or types,
    // otherwise we throw an error, because this is unsolvable situation.
    plugins.forEach(function(plugin) {
      this._merge(THROW_CONFLICTS, plugin.name, this._extendedDomains, plugin.protocol.domains);
    }, this);
  }

  // At second step we merge plugins with main protocol.
  // Plugins can override original methods, events or types,
  // so we don't need to throw error on conflict, we only print a warning to console.
  this._merge(!THROW_CONFLICTS, '', this._domains, this._extendedDomains);
}

ProtocolJson.prototype._merge = function(throwConflicts, pluginName, origDomains, toMergeDomains) {
  if (!toMergeDomains.length) return;

  var uniqueName = 'domain',
      state = {
        throwConflicts: throwConflicts,
        plugin: pluginName
      };

  mergeByName(
    origDomains,
    toMergeDomains,
    uniqueName,
    this._onDomainConflict.bind(this, state));
};

ProtocolJson.prototype._onDomainConflict = function(state, origDomain, toMergeDomain) {
  state.domain = toMergeDomain.domain;

  ['commands', 'events', 'types'].forEach(function(section) {
    // TODO(3y3): types are unique for protocol, not for domain.
    // We need to register types cache and search in it for conflicts.
    var uniqueName = section == 'types' ? 'id' : 'name',
        origSection = origDomain[section],
        toMergeSection = toMergeDomain[section];

    if (!toMergeSection || !toMergeSection.length)
      return;

    if (!origSection || !origSection.length) {
      origDomain[section] = toMergeSection;
      return;
    }

    state.section = section;
    state.uname = uniqueName;

    mergeByName(
      origSection,
      toMergeSection,
      uniqueName,
      this._onItemConflict.bind(this, state));
  }, this);
};

ProtocolJson.prototype._onItemConflict = function(state, origItem, toMergeItem) {
  if (state.throwConflicts) {
    throw new PluginError(
      'Unresolved conflict in ' + state.section + ' section of `' + state.plugin + '` plugin: ' +
      'item with ' + state.uname + ' `' + toMergeItem[state.uname] + '` already exists.');
  } else {
    console.warn(
      'Item with ' + state.uname + ' `' + toMergeItem[state.uname] + '`' +
      ' in ' + state.section + ' section' +
      ' of ' + state.domain + ' domain' +
      ' was owerriden.');
  }
};

ProtocolJson.prototype.toJSON = function() {
  return this._protocol;
};

module.exports = {
  cwd: CWD,
  list: plugins,
  validateManifest: validateManifest,
  PluginError: PluginError,
  InspectorJson: InspectorJson,
  ProtocolJson: ProtocolJson
};
