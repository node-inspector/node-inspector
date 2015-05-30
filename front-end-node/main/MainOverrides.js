/*jshint browser:true, nonew:false*/
/*global WebInspector:true*/
WebInspector.MainOverrides = function() {
  this._unregisterShortcuts();
  this._allowToSaveModifiedFiles();
  this._reloadOnDetach();
  this._exposeSourceMaps();
  this._avoidSourceMapFetchWhenInline();
};

WebInspector.MainOverrides.prototype = {
  _unregisterShortcuts: function() {
    this._shortcutsToUnregister.forEach(function(shortcut) {
      var descriptor = WebInspector.KeyboardShortcut.makeDescriptorFromBindingShortcut(shortcut);
      var key = WebInspector.shortcutRegistry._defaultKeyToActions.get(String(descriptor.key));
      if (key) key.clear();
    });
  },

  _allowToSaveModifiedFiles: function() {
    WebInspector.extensionServer._onSubscribe(
      {
        type:WebInspector.extensionAPI.Events.ResourceContentCommitted
      },
      {
        postMessage: function(msg) {
          // no-op
        }
      }
    );
  },

  _reloadOnDetach: function() {
    var oldDetached = WebInspector.Main.prototype.detached;
    WebInspector.Main.prototype.detached = function () {
      oldDetached.apply(this, arguments);
      setTimeout(function () {
        location.reload();
      }, 400);
    };
  },

  _exposeSourceMaps: function() {
    var oldAddScript = WebInspector.CompilerScriptMapping.prototype.addScript;
    WebInspector.CompilerScriptMapping.prototype.addScript = function(script) {
      if (script._target._sourceMapForScriptId == null) {
        script._target._sourceMapForScriptId = this._sourceMapForScriptId;
        script._target._scriptForSourceMap = this._scriptForSourceMap;
        script._target._sourceMapForURL = this._sourceMapForURL;
      }
      oldAddScript.apply(this, arguments);
    };
  },

  _shortcutsToUnregister: [
    // Front-end intercepts Cmd+R, Ctrl+R and F5 keys and reloads the debugged
    // page instead of the front-end page.  We want to disable this behaviour.
    'F5', 'Ctrl+R', 'Meta+R'
  ],

  _avoidSourceMapFetchWhenInline: function() {
    WebInspector.CompilerScriptMapping.prototype.orig_loadSourceMapForScript =
      WebInspector.CompilerScriptMapping.prototype._loadSourceMapForScript;

    WebInspector.CompilerScriptMapping.prototype._loadSourceMapForScript = function(script, callback) {
      var scriptURL = WebInspector.ParsedURL.completeURL(
        script.target().resourceTreeModel.inspectedPageURL(),
        script.sourceURL
      );
      if (!scriptURL) {
        callback(null);
        return;
      }

      console.assert(script.sourceMapURL);
      var scriptSourceMapURL = (script.sourceMapURL);

      var sourceMapURL = WebInspector.ParsedURL.completeURL(scriptURL, scriptSourceMapURL);
      if (!sourceMapURL) {
        callback(null);
        return;
      }

      var INLINE_SOURCE_MAP_REGEX = /^data:.*?;base64,(.*)$/;
      var matched = INLINE_SOURCE_MAP_REGEX.exec(sourceMapURL);
      if (matched) {
        // Extracting SourceMap object from inline sourceMapURL
        script.sourceMapURL = script.sourceURL + '.map';
        var payload = JSON.parse(window.atob(matched[1]));

        this._sourceMapForSourceMapURL[script.sourceMapURL] =
          new WebInspector.SourceMap(script.sourceMapURL, payload);
      }

      this.orig_loadSourceMapForScript(script, callback);
    };
  }
};

new WebInspector.MainOverrides();
