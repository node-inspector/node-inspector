'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const express = require('express');

const resolve = (_path) => path.resolve(__dirname, _path);
const json = (data) => (req, res) => res.json(data);

const INSPECTOR_PLUGINS = path.resolve(__dirname, './Agents');
const EXTERNAL_PLUGINS = path.resolve(__dirname, '../plugins');

class Manifest extends Array {
  constructor(sources) { super();
    sources
    ? this.push.apply(this, sources.map(part => new ManifestPart(part)))
    : [INSPECTOR_PLUGINS, EXTERNAL_PLUGINS]
        .map(dir => path.resolve(__dirname, dir))
        .filter(fs.existsSync)
        .map(dir => fs.readdirSync(dir)
          .map(name => path.resolve(dir, name, 'manifest.json'))
          .filter(fs.existsSync)
          .map(name => this.push(new ManifestPart(require(name), name))));

    this.frontend = {
      modules: this.reduce((result, manifest) => {
        result.push.apply(result, manifest.frontend.modules);

        return result;
      }, [])
    };

    this.inspector = {
      agents: this.reduce((result, manifest) => {
        result.push.apply(result, manifest.inspector.agents);

        return result;
      }, [])
    };

    this.protocol = {
      domains: this.reduce((result, manifest) => {
        manifest.protocol.domains.map(domain => domain.cwd = manifest.cwd);
        result.push.apply(result, manifest.protocol.domains);

        return result;
      }, [])
    };
  }
}

class ManifestPart {
  constructor(manifest, name) {
    Object.assign(this, manifest);

    this.cwd = path.dirname(name);

    ['frontend', 'inspector', 'protocol'].forEach((key) => {
      const value = this[key];
      if (typeof value !== 'string') return;

      const file = path.resolve(this.cwd, value);
      this[key] = require(file);
    });

    this.frontend = new ManifestFrontend(this.frontend, this.cwd);
    this.inspector = new ManifestInspector(this.inspector, this.cwd);
    this.protocol = new ManifestProtocol(this.protocol, this.cwd);
  }
}

class ManifestFrontend {
  constructor(data, cwd) {
    Object.assign(this, data);

    this.modules = [].concat(this.modules || [])
      .map(module => new ManifestFrontendModule(module, cwd));
  }
};

class ManifestFrontendModule {
  constructor(data, cwd) {
    Object.assign(this, data);

    assert(this.name, 'Frontend module should have `name` property');
    // TODO: check path is relative to plugin cwd
    assert(this.path !== '', 'Frontend module should not have empty `path` property');

    this.type = this.type === undefined ? "autostart" : this.type;
    this.path = path.resolve(cwd, this.path === undefined ? "front-end" : this.path);
    this.dependencies = [].concat(this.dependencies || []);
    this.scripts = [].concat(this.scripts || []);
    this.resources = [].concat(this.resources || []);
  }
};

class ManifestInspector {
  constructor(data, cwd) {
    Object.assign(this, data);

    this.agents = [].concat(this.agents || [])
      .map(agent => new ManifestInspectorAgent(agent, cwd));
  }
}

class ManifestInspectorAgent {
  constructor(data, cwd) {
    Object.assign(this, data);

    assert(this.name, 'Inspector agent should have `name` property');
    assert(this.path, 'Inspector agent should have `path` property');

    this.path = path.join(cwd, this.path);
  }
}

class ManifestProtocol {
  constructor(data, cwd) {
    Object.assign(this, data);

    this.domains = [].concat(this.domains || [])
      .map(domain => new ManifestProtocolDomain(domain, cwd));
  }
}

class ManifestProtocolDomain {
  constructor(data, cwd) {
    Object.assign(this, data);

    assert(this.domain, 'Protocol domain should have `domain` property');
  }
}

module.exports = new Manifest();
