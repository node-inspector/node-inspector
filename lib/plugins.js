'use strict';

const fs = require('fs')
const path = require('path');
const protocol = fs.readFileSync(path.resolve('./tools/protocol.json'));
const inspector = fs.readFileSync(path.resolve('./front-end/inspector.json'));

const THROW_CONFLICTS = true;

class PluginError extends Error {
  constructor(message) { super();
    this.message = this.name + ':\n' + message;
  }
}

class ProtocolConflict {
  constructor(name, acceptor, donor) {
    this.name = name;
    this.acceptor = acceptor;
    this.donor = donor;
  }
}

/**
 * List of modules which should be loaded on inspector front-end startup
 * Modules with `exclude` type will be excluded from result list
 * if no one overrides it later with other type
 */
class InspectorJSON extends Array {
  static merge(acceptor, donor) {
    if (!donor) return acceptor;

    const result = [];
    const cache = {};

    donor.forEach((note) => {
      cache[note.name] = note.name;

      if (note.override)
        return result.push(note);

      const copy = Object.assign({}, note, { name: `external/${note.name}`});

      if (note.type !== 'exclude')
        return result.push(copy);
    });

    acceptor.forEach((note) => {
      if (!cache[note.name]) result.push(note);
    });

    return result;
  }

  /**
   * @param {Manifests} [manifest]
   */
  constructor(manifest) { super();
    const origin = JSON.parse(inspector);
    const modules = manifest && manifest.frontend.modules;
    const merged = InspectorJSON.merge(origin, modules);

    this.push.apply(this, merged);
  }
}

/**
 * Extended DevTools protocol json.
 * Merges plugins in original protocol without throwning.
 * Checks that plugins don't have conflicts.
 * Throws on unsolvable conflicts between plugins.
 */
class ProtocolJSON {
  /**
   * @param {Boolean} throws - should or not `merge` throw on item conflicts
   * @param {Array} acceptor - list of domains
   * @param {Array} [donor] - list of domains which will be merged in acceptor
   * @returns {Array} mutated acceptor
   */
  static merge(throws, acceptor, donor) {
    if (!donor || !donor.length) return acceptor;

    conflictByName('domain', acceptor, donor)
      .map(conflict => resolveDomain(throws, conflict));

    return acceptor;
  }

  /**
   * @param {Manifests} [manifest]
   */
  constructor(manifest) {
    const origin = JSON.parse(protocol).domains;
    const domains = manifest && manifest.protocol.domains;

    // At first step we merge all plugins in one protocol.
    // We expect what plugins doesn't have equal methods, events or types,
    // otherwise we throw an error, because this is unsolvable situation.
    const extended = ProtocolJSON.merge(THROW_CONFLICTS, [], domains);

    // At second step we merge plugins with main protocol.
    // Plugins can override original methods, events or types,
    // so we don't need to throw error on conflict, we only print a warning to console.
    this.domains = ProtocolJSON.merge(!THROW_CONFLICTS, origin, extended);
  }
}

function resolveDomain(throws, conflict) {
  const origDomain = conflict.acceptor;
  const toMergeDomain = conflict.donor;

  ['commands', 'events', 'types'].forEach((section) => {
    // TODO(3y3): types are unique for protocol, not for domain.
    // We need to register types cache and search in it for conflicts.
    const uname = section == 'types' ? 'id' : 'name';
    const origSection = origDomain[section];
    const toMergeSection = toMergeDomain[section];

    if (!toMergeSection || !toMergeSection.length)
      return;

    if (!origSection || !origSection.length) {
      origDomain[section] = toMergeSection;
      return;
    }

    const state = {
      plugin: conflict.donor.cwd,
      domain: conflict.name,
      section: section
    };

    conflictByName(uname, origSection, toMergeSection)
      .map(conflict => resolveItem(throws, state, conflict));
  });
}

function resolveItem(throws, state, conflict) {
  const uname = conflict.name;
  const acceptor = conflict.acceptor;
  const donor = conflict.donor;

  if (deepEqual(acceptor, donor)) return;

  if (throws) {
    throw new PluginError(
      'Unresolved conflict in ' + state.section + ' section of `' + state.plugin + '` plugin: ' +
      'item with ' + uname + ' `' + donor[uname] + '` already exists.');
  } else {
    console.warn(
      'Item with ' + uname + ' `' + donor[uname] + '`' +
      ' in ' + state.section + ' section' +
      ' of ' + state.domain + ' domain' +
      ' was owerriden.');
  }
}

function conflictByName(name, acceptor, donor) {
  if (!donor || !donor.length) return [];

  return donor.map(note => {
    const origin = findEq(acceptor, name, note[name]);

    if (origin) return new ProtocolConflict(name, origin, note);

    acceptor.push(note);
  }).filter(notEmpty);
}

function findEq(collection, option, value) {
  return collection.filter(item => item[option] == value)[0];
}

function notEmpty(value) {
  return value !== undefined;
}

function deepEqual(acceptor, donor) {
  if (acceptor === donor)
    return true;

  if (typeof acceptor !== typeof donor)
    return false;

  if (typeof donor == 'object' && !donor)
    return false;

  const aKeys = Object.keys(acceptor);
  const dKeys = Object.keys(donor);

  if (aKeys.length !== dKeys.length) return false;
  if (aKeys.some(key => !(key in donor))) return false;

  return aKeys.every(key => deepEqual(acceptor[key], donor[key]));
}

module.exports = {
  PluginError: PluginError,
  Inspector: InspectorJSON,
  Protocol: ProtocolJSON
};
