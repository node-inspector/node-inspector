/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
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

WebInspector.ChangesView = function(drawer)
{
    WebInspector.View.call(this);
    this.element.innerHTML = "<div style=\"bottom:25%;color:rgb(192,192,192);font-size:12px;height:65px;left:0px;margin:auto;position:absolute;right:0px;text-align:center;top:0px;\"><h1>Not Implemented Yet</h1></div>";

    this.drawer = drawer;

    this.clearButton = document.createElement("button");
    this.clearButton.id = "clear-changes-status-bar-item";
    this.clearButton.title = WebInspector.UIString("Clear changes log.");
    this.clearButton.className = "status-bar-item clear-status-bar-item";
    this.clearButton.addEventListener("click", this._clearButtonClicked.bind(this), false);

    this.toggleChangesButton = document.getElementById("changes-status-bar-item");
    this.toggleChangesButton.title = WebInspector.UIString("Show changes view.");
    this.toggleChangesButton.addEventListener("click", this._toggleChangesButtonClicked.bind(this), false);
    var anchoredStatusBar = document.getElementById("anchored-status-bar-items");
    anchoredStatusBar.appendChild(this.toggleChangesButton);
}

WebInspector.ChangesView.prototype = {
    _clearButtonClicked: function()
    {
        // Not Implemented Yet
    },

    _toggleChangesButtonClicked: function()
    {
        this.drawer.visibleView = this;
    },

    attach: function(mainElement, statusBarElement)
    {
        mainElement.appendChild(this.element);
        statusBarElement.appendChild(this.clearButton);
    },

    show: function()
    {
        this.toggleChangesButton.addStyleClass("toggled-on");
        this.toggleChangesButton.title = WebInspector.UIString("Hide changes view.");
    },

    hide: function()
    {
        this.toggleChangesButton.removeStyleClass("toggled-on");
        this.toggleChangesButton.title = WebInspector.UIString("Show changes view.");
    }
}

WebInspector.ChangesView.prototype.__proto__ = WebInspector.View.prototype;
