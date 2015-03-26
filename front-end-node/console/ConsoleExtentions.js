/*jshint browser:true, nonew:false*/
/*global WebInspector:true, InspectorFrontendHost:true, InspectorFrontendHostAPI:true*/
WebInspector.ConsoleExtensions = function() {
  this._extendConsoleDispatcher();
  this._overrideConsoleViewFilterAdd();
  this._overrideHandleContextMenuEvent();
};

WebInspector.ConsoleExtensions.prototype = {
  _extendConsoleDispatcher: function() {
    WebInspector.ConsoleDispatcher.prototype.showConsole = function() {
      InspectorFrontendHost.events.dispatchEventToListeners(
        InspectorFrontendHostAPI.Events.ShowConsole, WebInspector.inspectorView);
    };
  },
  _overrideConsoleViewFilterAdd: function(){
    WebInspector.ConsoleViewFilter.prototype.addFilters = function(filterBar)
    {
        this._textFilterUI = new WebInspector.TextFilterUI(true);
        this._textFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._textFilterChanged, this);
        filterBar.addFilter(this._textFilterUI);

        var levels = [
            {name: "error", label: WebInspector.UIString("Errors")},
            {name: "warning", label: WebInspector.UIString("Warnings")},
            {name: "info", label: WebInspector.UIString("Info")},
            {name: "log", label: WebInspector.UIString("Logs")},
            {name: "debug", label: WebInspector.UIString("Debug")}
        ];
        this._levelFilterUI = new WebInspector.NamedBitSetFilterUI(levels, WebInspector.settings.messageLevelFilters);
        this._levelFilterUI.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._filterChanged, this);
        filterBar.addFilter(this._levelFilterUI);
        //this._hideNetworkMessagesCheckbox = new WebInspector.CheckboxFilterUI("hide-network-messages", WebInspector.UIString("Hide network messages"), true, WebInspector.settings.hideNetworkMessages);
        //this._hideNetworkMessagesCheckbox.addEventListener(WebInspector.FilterUI.Events.FilterChanged, this._filterChanged.bind(this), this);
        //filterBar.addFilter(this._hideNetworkMessagesCheckbox);
    }
  },
  _overrideHandleContextMenuEvent: function(){
    WebInspector.ConsoleView.prototype._handleContextMenuEvent = function(event)
    {
        if (event.target.enclosingNodeOrSelfWithNodeName("a"))
            return;

        var contextMenu = new WebInspector.ContextMenu(event);

        /*function monitoringXHRItemAction()
        {
            WebInspector.settings.monitoringXHREnabled.set(!WebInspector.settings.monitoringXHREnabled.get());
        }
        contextMenu.appendCheckboxItem(WebInspector.UIString("Log XMLHttpRequests"), monitoringXHRItemAction, WebInspector.settings.monitoringXHREnabled.get());*/

        var sourceElement = event.target.enclosingNodeOrSelfWithClass("console-message-wrapper");
        var consoleMessage = sourceElement ? sourceElement.message.consoleMessage() : null;

        var filterSubMenu = contextMenu.appendSubMenuItem(WebInspector.UIString("Filter"));

        if (consoleMessage && consoleMessage.url) {
            var menuTitle = WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Hide messages from %s" : "Hide Messages from %s", new WebInspector.ParsedURL(consoleMessage.url).displayName);
            filterSubMenu.appendItem(menuTitle, this._filter.addMessageURLFilter.bind(this._filter, consoleMessage.url));
        }

        filterSubMenu.appendSeparator();
        var unhideAll = filterSubMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Unhide all" : "Unhide All"), this._filter.removeMessageURLFilter.bind(this._filter));
        filterSubMenu.appendSeparator();

        var hasFilters = false;

        for (var url in this._filter.messageURLFilters) {
            filterSubMenu.appendCheckboxItem(String.sprintf("%s (%d)", new WebInspector.ParsedURL(url).displayName, this._urlToMessageCount[url]), this._filter.removeMessageURLFilter.bind(this._filter, url), true);
            hasFilters = true;
        }

        filterSubMenu.setEnabled(hasFilters || (consoleMessage && consoleMessage.url));
        unhideAll.setEnabled(hasFilters);

        contextMenu.appendSeparator();
        contextMenu.appendItem(WebInspector.UIString(WebInspector.useLowerCaseMenuTitles() ? "Clear console" : "Clear Console"), this._requestClearMessages.bind(this));

        var request = consoleMessage ? consoleMessage.request : null;
        if (request && request.resourceType() === WebInspector.resourceTypes.XHR) {
            contextMenu.appendSeparator();
            contextMenu.appendItem(WebInspector.UIString("Replay XHR"), request.replayXHR.bind(request));
        }

        contextMenu.show();
    }
  }
};

new WebInspector.ConsoleExtensions();
