/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.Object}
 */
WebInspector.FileManager = function()
{
    /** @type {!Object.<string, ?function(boolean)>} */
    this._saveCallbacks = {};
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.SavedURL, this._savedURL, this);
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.CanceledSaveURL, this._canceledSaveURL, this);
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.AppendedToURL, this._appendedToURL, this);
}

WebInspector.FileManager.EventTypes = {
    SavedURL: "SavedURL",
    AppendedToURL: "AppendedToURL"
}

WebInspector.FileManager.prototype = {
    /**
     * @return {boolean}
     */
    canSave: function()
    {
        return true;
    },

    /**
     * @param {string} url
     * @param {string} content
     * @param {boolean} forceSaveAs
     * @param {function(boolean)=} callback
     */
    save: function(url, content, forceSaveAs, callback)
    {
        // Remove this url from the saved URLs while it is being saved.
        var savedURLs = WebInspector.settings.savedURLs.get();
        delete savedURLs[url];
        WebInspector.settings.savedURLs.set(savedURLs);
        this._saveCallbacks[url] = callback || null;
        InspectorFrontendHost.save(url, content, forceSaveAs);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _savedURL: function(event)
    {
        var url = /** @type {string} */ (event.data);
        var savedURLs = WebInspector.settings.savedURLs.get();
        savedURLs[url] = true;
        WebInspector.settings.savedURLs.set(savedURLs);
        this.dispatchEventToListeners(WebInspector.FileManager.EventTypes.SavedURL, url);
        this._invokeSaveCallback(url, true);
    },

    /**
     * @param {string} url
     * @param {boolean} accepted
     */
    _invokeSaveCallback: function(url, accepted)
    {
        var callback = this._saveCallbacks[url];
        delete this._saveCallbacks[url];
        if (callback)
            callback(accepted);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _canceledSaveURL: function(event)
    {
        var url = /** @type {string} */ (event.data);
        this._invokeSaveCallback(url, false);
    },

    /**
     * @param {string} url
     * @return {boolean}
     */
    isURLSaved: function(url)
    {
        var savedURLs = WebInspector.settings.savedURLs.get();
        return savedURLs[url];
    },

    /**
     * @param {string} url
     * @param {string} content
     */
    append: function(url, content)
    {
        InspectorFrontendHost.append(url, content);
    },

    /**
     * @param {string} url
     */
    close: function(url)
    {
        // Currently a no-op.
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _appendedToURL: function(event)
    {
        var url = /** @type {string} */ (event.data);
        this.dispatchEventToListeners(WebInspector.FileManager.EventTypes.AppendedToURL, url);
    },

    __proto__: WebInspector.Object.prototype
}

WebInspector.fileManager = new WebInspector.FileManager();
