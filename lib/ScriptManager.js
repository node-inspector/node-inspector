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
      var script = {
            sourceID: String(v8data.id), // TODO(bajtos) - remove later (replace with scriptId)
            scriptId: String(v8data.id),
            url: convert.v8NameToInspectorUrl(v8data.name),
            data: v8data.source,
            firstLine: v8data.lineOffset, // TODO(bajtos) - remove later (replace with startLine)
            startLine: v8data.lineOffset,
            // TODO(bajtos)? add startColumn, endLine, endColumn, isContentScript, sourceMapURL, hasSourceURL
          };

      var hidden = this._isHidden(script.url),
          item = {
            hidden: hidden,
            v8name: script.url,
            url: script.url,
          };

      this._sources[script.sourceID] = item;
      if (!hidden) {
        this.emit('scriptLoaded', script);
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
