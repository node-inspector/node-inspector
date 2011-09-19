/*
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

WebInspector.ConsolePanel = function()
{
    WebInspector.Panel.call(this, "console");
    WebInspector.consoleView.addEventListener(WebInspector.ConsoleView.Events.EntryAdded, this._consoleMessageAdded, this);
    WebInspector.consoleView.addEventListener(WebInspector.ConsoleView.Events.ConsoleCleared, this._consoleCleared, this);
}

WebInspector.ConsolePanel.prototype = {
    get toolbarItemLabel()
    {
        return WebInspector.UIString("Console");
    },

    show: function()
    {
        WebInspector.Panel.prototype.show.call(this);

        this._previousConsoleState = WebInspector.drawer.state;
        WebInspector.drawer.enterPanelMode();
        WebInspector.showConsole();

        // Move the scope bar to the top of the messages, like the resources filter.
        var scopeBar = document.getElementById("console-filter");
        var consoleMessages = document.getElementById("console-messages");

        scopeBar.parentNode.removeChild(scopeBar);
        document.getElementById("console-view").insertBefore(scopeBar, consoleMessages);

        // Update styles, and give console-messages a top margin so it doesn't overwrite the scope bar.
        scopeBar.addStyleClass("console-filter-top");
        scopeBar.removeStyleClass("status-bar-item");

        consoleMessages.addStyleClass("console-filter-top");
    },

    hide: function()
    {
        WebInspector.Panel.prototype.hide.call(this);

        if (this._previousConsoleState === WebInspector.Drawer.State.Hidden)
            WebInspector.drawer.immediatelyExitPanelMode();
        else
            WebInspector.drawer.exitPanelMode();
        delete this._previousConsoleState;

        // Move the scope bar back to the bottom bar, next to Clear Console.
        var scopeBar = document.getElementById("console-filter");

        scopeBar.parentNode.removeChild(scopeBar);
        document.getElementById("other-drawer-status-bar-items").appendChild(scopeBar);

        // Update styles, and remove the top margin on console-messages.
        scopeBar.removeStyleClass("console-filter-top");
        scopeBar.addStyleClass("status-bar-item");

        document.getElementById("console-messages").removeStyleClass("console-filter-top");
    },

    searchCanceled: function()
    {
        this._clearCurrentSearchResultHighlight();
        delete this._searchResults;
        delete this._searchRegex;
    },

    performSearch: function(query)
    {
        WebInspector.searchController.updateSearchMatchesCount(0, this);
        this.searchCanceled();
        this._searchRegex = createSearchRegex(query, "g");

        this._searchResults = [];
        var messages = WebInspector.consoleView.messages;
        for (var i = 0; i < messages.length; i++) {
            if (messages[i].matchesRegex(this._searchRegex)) {
                this._searchResults.push(messages[i]);
                this._searchRegex.lastIndex = 0;
            }
        }
        WebInspector.searchController.updateSearchMatchesCount(this._searchResults.length, this);
        this._currentSearchResultIndex = -1;
        if (this._searchResults.length)
            this._jumpToSearchResult(0);
    },

    jumpToNextSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        this._jumpToSearchResult((this._currentSearchResultIndex + 1) % this._searchResults.length);
    },

    jumpToPreviousSearchResult: function()
    {
        if (!this._searchResults || !this._searchResults.length)
            return;
        var index = this._currentSearchResultIndex - 1;
        if (index === -1)
            index = this._searchResults.length - 1;
        this._jumpToSearchResult(index);
    },

    _clearCurrentSearchResultHighlight: function()
    {
        if (!this._searchResults)
            return;
        var highlightedMessage = this._searchResults[this._currentSearchResultIndex];
        if (highlightedMessage)
            highlightedMessage.clearHighlight();
        this._currentSearchResultIndex = -1;
    },

    _jumpToSearchResult: function(index)
    {
        this._clearCurrentSearchResultHighlight();
        this._currentSearchResultIndex = index;
        this._searchResults[index].highlightSearchResults(this._searchRegex);
    },

    _consoleMessageAdded: function(event)
    {
        if (!this._searchRegex || !this.visible)
            return;
        var message = event.data;
        this._searchRegex.lastIndex = 0;
        if (message.matchesRegex(this._searchRegex)) {
            this._searchResults.push(message);
            WebInspector.searchController.updateSearchMatchesCount(this._searchResults.length, this);
        }
    },

    _consoleCleared: function()
    {
        if (!this._searchResults)
            return;
        this._clearCurrentSearchResultHighlight();
        this._searchResults.length = 0;
        if (this.visible)
            WebInspector.searchController.updateSearchMatchesCount(0, this);
    }
}

WebInspector.ConsolePanel.prototype.__proto__ = WebInspector.Panel.prototype;
