var events = require('events');

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

  _shortenPath: {
    value: function(pathArray) {
      var p,
          isClash,
          scripts = this._listAllSources();

      for (var i = pathArray.length - 1; i > 0; i--) {
        p = pathArray.slice(i).join('/');
        isClash = scripts.some(function fnScriptUrlMatchesP(s) {
          return s.url === p;
        });
        if (!isClash)
          return p;
      }
      return pathArray.join('/');
    }
  },

  addScript: {
    value: function(v8data) {
      var script = {
            sourceID: String(v8data.id), // TODO(bajtos) - remove later (replace with scriptId)
            scriptId: String(v8data.id),
            url: v8data.name,
            data: v8data.source,
            firstLine: v8data.lineOffset, // TODO(bajtos) - remove later (replace with startLine)
            startLine: v8data.lineOffset,
            // TODO(bajtos)? add startColumn, endLine, endColumn, isContentScript, sourceMapURL, hasSourceURL
          },
          path = String(v8data.name).split(/[\/\\]/);

      var hidden = this._isHidden(script.url),
          item = {
            hidden: hidden,
            v8name: script.url,
            url: script.url,
          };

      if (path.length > 1) {
        item.url = script.url = this._shortenPath(path);
      }

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
