var events = require('events'),
    convert = require('./convert.js');

/**
 * @param hiddenScripts List of scripts that are not displayed to the user.
 * @returns {ScriptManager}
 * @constructor
 */
function ScriptManager(hiddenScripts) {
  hiddenScripts = hiddenScripts || [];
  return Object.create(ScriptManager.prototype, {
    _sources: { value: {}, writable: true },
    _hiddenScripts: { value: hiddenScripts }
  });
}

ScriptManager.prototype = Object.create(events.EventEmitter.prototype, {
  _isHidden: {
    value: function(scriptUrl) {
      return this._hiddenScripts.some(function fnHiddenScriptMatchesUrl(r) {
        return r.test(scriptUrl);
      });
    }
  },

  _listAllSources: {
    value: function() {
      var self = this;
      return Object.keys(this._sources).map(function fnSelectValue(key) {
        return self._sources[key];
      });
    }
  },

  findScriptByID: {
    /**
     * @param id script id
     * @returns {{hidden: boolean, path: string, url: string}}
     */
    value: function(id) {
      return this._sources[id];
    }
  },

  addScript: {
    value: function(v8data) {
      var inspectorScriptData = {
            scriptId: String(v8data.id),
            url: convert.v8NameToInspectorUrl(v8data.name),
            startLine: v8data.lineOffset,
            startColumn: v8data.columnOffset,

            /* Properties not set:
            endLine: undefined,
            endColumn: undefined,
            isContentScript: undefined,
            sourceMapURL: undefined,
            hasSourceURL: undefined,
            */
          };

      var hidden = this._isHidden(inspectorScriptData.url),
          item = {
            hidden: hidden,
            v8name: v8data.name,
            url: inspectorScriptData.url,
          };

      this._sources[inspectorScriptData.scriptId] = item;
      if (!hidden) {
        this.emit('scriptLoaded', inspectorScriptData);
      }
    }
  },

  reset: {
    value: function() {
      this._sources = {};
    }
  },
});

exports.ScriptManager = ScriptManager;
