/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
 * @suppressGlobalPropertiesCheck
 */
WebInspector.WorkspaceController = function(workspace)
{
    this._workspace = workspace;
    // Only for main window.
    window.addEventListener("focus", this._windowFocused.bind(this), false);
    this._fileSystemRefreshThrottler = new WebInspector.Throttler(1000);
}

WebInspector.WorkspaceController.prototype = {
    /**
     * @param {!Event} event
     */
    _windowFocused: function(event)
    {
        this._fileSystemRefreshThrottler.schedule(refreshFileSystems.bind(this));

        /**
         * @this {WebInspector.WorkspaceController}
         * @param {!WebInspector.Throttler.FinishCallback} callback
         */
        function refreshFileSystems(callback)
        {
            var barrier = new CallbackBarrier();
            var projects = this._workspace.projects();
            for (var i = 0; i < projects.length; ++i)
                projects[i].refresh("/", barrier.createCallback());
            barrier.callWhenDone(callback);
        }
    }
}
