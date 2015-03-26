/*jshint browser:true, nonew:false*/
/*global WebInspector:true*/
WebInspector.SourcesOverrides = function() {
  this._chromeSpecificsAreHidden = false;
  this._hideChromeSpecifics();
  this._overrideWatchExpression();
};

WebInspector.SourcesOverrides.prototype = {
  _hideChromeSpecifics: function() {
    if (WebInspector.panels.sources) {
      this._hideSourcesTabSpecifics();
    } else {
      WebInspector.inspectorView._tabbedPane.addEventListener(
        WebInspector.TabbedPane.EventTypes.TabSelected,
        function(event) {
          if (event.data.tabId == 'sources') setTimeout(this._hideSourcesTabSpecifics.bind(this));
        }, this);
    }
  },

  _hideSourcesTabSpecifics: function() {
    if (this._chromeSpecificsAreHidden) return;

    var panes = WebInspector.panels.sources.sidebarPanes;
    [
      panes.domBreakpoints.element,
      panes.domBreakpoints.titleElement.parentNode,
      panes.eventListenerBreakpoints.element,
      panes.eventListenerBreakpoints.titleElement.parentNode,
      panes.xhrBreakpoints.element,
      panes.xhrBreakpoints.titleElement.parentNode
    ].forEach(function(element) {
      element.classList.add('hidden');
    });
    this._chromeSpecificsAreHidden = true;
  },

  _overrideWatchExpression: function() {
    // Patch the expression used as an initial value for a new watch.
    // DevTools' value "\n" breaks the debugger protocol.
    WebInspector.WatchExpressionsSection.NewWatchExpression = ' ';
  }
};

new WebInspector.SourcesOverrides();
