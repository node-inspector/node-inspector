/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

WebInspector.BreakpointsSidebarPane = function()
{
    WebInspector.SidebarPane.call(this, WebInspector.UIString("Breakpoints"));

    this.listElement = document.createElement("ol");
    this.listElement.className = "breakpoint-list";

    this.emptyElement = document.createElement("div");
    this.emptyElement.className = "info";
    this.emptyElement.textContent = WebInspector.UIString("No Breakpoints");

    this.bodyElement.appendChild(this.emptyElement);

    WebInspector.breakpointManager.addEventListener("breakpoint-added", this._breakpointAdded, this);
    WebInspector.breakpointManager.addEventListener("breakpoint-removed", this._breakpointRemoved, this);    
}

WebInspector.BreakpointsSidebarPane.prototype = {
    reset: function()
    {
        this.listElement.removeChildren();
        if (this.listElement.parentElement) {
            this.bodyElement.removeChild(this.listElement);
            this.bodyElement.appendChild(this.emptyElement);
        }
    },

    _breakpointAdded: function(event)
    {
        var breakpoint = event.data;

        breakpoint.addEventListener("enabled", this._breakpointEnableChanged, this);
        breakpoint.addEventListener("disabled", this._breakpointEnableChanged, this);
        breakpoint.addEventListener("text-changed", this._breakpointTextChanged, this);

        this._appendBreakpointElement(breakpoint);

        if (this.emptyElement.parentElement) {
            this.bodyElement.removeChild(this.emptyElement);
            this.bodyElement.appendChild(this.listElement);
        }
    },

    _appendBreakpointElement: function(breakpoint)
    {
        function checkboxClicked(event)
        {
            breakpoint.enabled = !breakpoint.enabled;

            // without this, we'd switch to the source of the clicked breakpoint
            event.stopPropagation();
        }

        function breakpointClicked()
        {
            WebInspector.panels.scripts.showSourceLine(breakpoint.url, breakpoint.line);
        }

        var breakpointElement = document.createElement("li");
        breakpoint._breakpointListElement = breakpointElement;
        breakpointElement._breakpointObject = breakpoint;
        breakpointElement.addEventListener("click", breakpointClicked, false);

        var checkboxElement = document.createElement("input");
        checkboxElement.className = "checkbox-elem";
        checkboxElement.type = "checkbox";
        checkboxElement.checked = breakpoint.enabled;
        checkboxElement.addEventListener("click", checkboxClicked, false);
        breakpointElement.appendChild(checkboxElement);

        var labelElement = document.createTextNode(breakpoint.label);
        breakpointElement.appendChild(labelElement);

        var sourceTextElement = document.createElement("div");
        sourceTextElement.textContent = breakpoint.sourceText;
        sourceTextElement.className = "source-text monospace";
        breakpointElement.appendChild(sourceTextElement);

        var currentElement = this.listElement.firstChild;
        while (currentElement) {
            var currentBreak = currentElement._breakpointObject;
            if (currentBreak.url > breakpoint.url) {
                this.listElement.insertBefore(breakpointElement, currentElement);
                return;
            } else if (currentBreak.url == breakpoint.url && currentBreak.line > breakpoint.line) {
                this.listElement.insertBefore(breakpointElement, currentElement);
                return;
            }
            currentElement = currentElement.nextSibling;
        }
        this.listElement.appendChild(breakpointElement);
    },

    _breakpointRemoved: function(event)
    {
        var breakpoint = event.data;

        breakpoint.removeEventListener("enabled", null, this);
        breakpoint.removeEventListener("disabled", null, this);
        breakpoint.removeEventListener("text-changed", null, this);

        var element = breakpoint._breakpointListElement;
        element.parentElement.removeChild(element);

        if (!this.listElement.firstChild) {
            this.bodyElement.removeChild(this.listElement);
            this.bodyElement.appendChild(this.emptyElement);
        }
    },

    _breakpointEnableChanged: function(event)
    {
        var breakpoint = event.target;

        var checkbox = breakpoint._breakpointListElement.firstChild;
        checkbox.checked = breakpoint.enabled;
    },

    _breakpointTextChanged: function(event)
    {
        var breakpoint = event.target;

        var sourceTextElement = breakpoint._breakpointListElement.firstChild.nextSibling.nextSibling;
        sourceTextElement.textContent = breakpoint.sourceText;
    }
}

WebInspector.BreakpointsSidebarPane.prototype.__proto__ = WebInspector.SidebarPane.prototype;
