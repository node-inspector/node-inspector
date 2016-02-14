'use strict';

const co = require('co');
const fs = require('mz/fs');
const path = require('path');
const convert = require('./convert.js');

const InspectorScript = require('./InspectorScript.js');
const ScriptFileStorage = require('./ScriptFileStorage.js');


class ScriptManager extends require('events') {
  /**
   * @param {{hidden}} config
   * @param {Session} session
   */
  constructor(config, session) { super();
    this.session = session;
    this.config = Object.assign({ hidden: [] }, config);
    this.fs = new ScriptFileStorage(config, session);

    this._mainAppScript = null;
    this._realMainAppScript = null;

    this._scripts = new Map();

    session.debuggerClient.on('afterCompile', (event) => this.add(event.script).catch(
      error => this.session.frontendClient.sendLogToConsole('error', error.stack)));
  }

  /**
   * @returns {String} Application cwd
   */
  cwd() {
    return co(function * () {
      const target = yield this.session.debuggerClient.target();
      return target.cwd;
    }.bind(this));
  }

  /**
   * @returns {String} Application main script name
   */
  mainAppScript() {
    if (this._mainAppScript instanceof Promise) return this._mainAppScript;

    return this._mainAppScript = co(function * () {
      const target = yield this.session.debuggerClient.target();
      const mainAppScript = target.filename;

      if (!mainAppScript) return '';

      try {
        yield fs.stat(mainAppScript);
      } catch (e) {
        if (!/\.js$/.test(mainAppScript)) return mainAppScript + '.js';
      }

      return mainAppScript;
    }.bind(this));
  }

  /**
   * On Unix-based systems is equal to mainAppScript
   * On Windows returns case sensitive name
   * @returns {String} Application main script name
   */
  realMainAppScript() {
    if (this._realMainAppScript instanceof Promise) return this._realMainAppScript;

    return this._realMainAppScript = co(function * () {
      const mainAppScript = yield this.mainAppScript();

      if (process.platform !== 'win32') return mainAppScript;

      // Find case sensitive name
      const dirname = path.dirname(mainAppScript);
      const base = path.basename(mainAppScript).toLowerCase();

      const files = yield fs.readdir(dirname);
      const realBaseName = files.filter(name => name.toLowerCase() == base)[0];

      return path.join(dirname, realBaseName);
    }.bind(this));
  }

  /**
   * @param {Number} id
   * @returns {String} Source of script in app memory
   */
  source(id) {
    return co(function * () {
      const result = yield this.session.debuggerClient.request('scripts', {
        includeSource: true,
        types: 4,
        ids: [Number(id)]
      });

      // Some modules gets unloaded (?) after they are parsed,
      // e.g. node_modules/express/node_modules/methods/index.js
      // V8 request 'scripts' returns an empty result in such case
      return result.length > 0 ? result[0].source : undefined;
    }.bind(this));
  }

  /**
   * @param {String} url
   * @returns {InspectorScript}
   */
  find(url) {
    return this._scripts.get(String(url));
  }

  /**
   * @param {Number} id
   * @returns {InspectorScript}
   */
  get(id) {
    return this._scripts.get(Number(id));
  }

  /**
   * Returns new InspectorScript is original script is not hidden
   * Parses InspectorScript sourceMapURL
   *
   * @param {Object} script
   * @param {Number} script.id
   * @param {String} script.name
   * @param {String} [script.source]
   * @param {Number} script.lineOffset
   * @param {Number} script.columnOffset
   * @returns {InspectorScript?}
   */
  add(script) {
    return co(function * () {
      const localPath = script.name;
      const mainAppScript = yield this.mainAppScript();
      const isMain = this._isMainScript(mainAppScript, localPath);
      const isHidden = !isMain && this._isHiddenScript(localPath);

      if (isHidden) return;

      if (isMain)
        script.name = yield this.realMainAppScript();

      if (script.source == null)
        script.source = yield this.source(script.id);

      const inspectorScript = new InspectorScript(script);

      this._scripts.set(Number(inspectorScript.scriptId), inspectorScript);
      this._scripts.set(String(inspectorScript.url), inspectorScript);

      // TODO (3y3): Move this to other layer
      this._notifyScriptParsed(inspectorScript);

      return inspectorScript;
    }.bind(this));
  }

  /**
   * @returns {Array} Flatten list of resources free
   */
  list() {
    return co(function * () {
      const startDirectory = yield this.cwd();
      const mainAppScript = yield this.realMainAppScript();
      return yield this.fs.findAllApplicationScripts(startDirectory, mainAppScript);
    }.bind(this));
  }

  /**
   * @param {String} url
   * @returns {String} Source of target url
   */
  load(url) {
    return co(function * () {
      if (!url) throw new Error('Unexpected empty url');
      // If requested source was loaded in app (script != null), we can't expect that it is equal
      // to the file with requested name stored in fs.
      // So, if requested source was loaded in app, we need to require it from app.
      const script = this.find(url);
      if (script)
        return yield this.source(script.scriptId);

      const scriptName = convert.urlToPath(url);
      return yield this.fs.load(scriptName);
    }.bind(this));
  }

  /**
   * @param {String} name - real file name
   * @param {String} source
   */
  save(name, source) {
    return co(function * () {
      return yield this.fs.save(name, source);
    }.bind(this));
  }

  /**
   * Empty cached scripts
   */
  reset() {
    this._scripts = new Map();
  }

  /**
   * Reload scripts list
   */
  reload() {
    return co(function * () {
      this.reset();
      var scripts = yield this.session.debuggerClient.request('scripts', {includeSource: true, types: 4});
      yield scripts.map((script) => this.add(script));
    }.bind(this));
  }

  /**
   * @param {String} path
   * @return {Boolean}
   */
  _isHiddenScript(path) {
    return this.config.hidden.some(rx => rx.test(path));
  }

  /**
   * @param {String} mainAppScript
   * @param {String} path
   * @return {Boolean}
   */
  _isMainScript(mainAppScript, path) {
    if (!path || !mainAppScript) return false;
    if (process.platform == 'win32')
      return mainAppScript.toLowerCase() == path.replace(/\//g, '\\').toLowerCase();
    else
      return mainAppScript == path;
  }

  _notifyScriptParsed(inspectorScript) {
    this.session.frontendClient.emitEvent('Debugger.scriptParsed', inspectorScript);
  }
}

module.exports = ScriptManager;
