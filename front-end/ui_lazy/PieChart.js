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
 * @param {number} size
 * @param {function(number):string=} formatter
 * @param {boolean=} showTotal
 */
WebInspector.PieChart = function(size, formatter, showTotal)
{
    var shadowSize = WebInspector.PieChart._ShadowSizePercent;
    this.element = createElement("div");
    this._shadowRoot = WebInspector.createShadowRootWithCoreStyles(this.element);
    this._shadowRoot.appendChild(WebInspector.Widget.createStyleElement("ui_lazy/pieChart.css"));
    var root = this._shadowRoot.createChild("div", "root");
    var svg = this._createSVGChild(root, "svg");
    svg.setAttribute("width", (100 * (1 + 2 * shadowSize)) + "%");
    svg.setAttribute("height", (100 * (1 + 2 * shadowSize)) + "%");
    this._group = this._createSVGChild(svg, "g");
    var shadow = this._createSVGChild(this._group, "circle");
    shadow.setAttribute("r", 1 + shadowSize);
    shadow.setAttribute("cy", shadowSize);
    shadow.setAttribute("fill", "hsl(0,0%,70%)");
    var background = this._createSVGChild(this._group, "circle");
    background.setAttribute("r", 1);
    background.setAttribute("fill", "hsl(0,0%,92%)");
    this._foregroundElement = root.createChild("div", "pie-chart-foreground");
    if (showTotal)
        this._totalElement = this._foregroundElement.createChild("div", "pie-chart-total");
    this._formatter = formatter;
    this._slices = [];
    this._lastAngle = -Math.PI/2;
    this._setSize(size);
}

WebInspector.PieChart._ShadowSizePercent = 0.02;

WebInspector.PieChart.prototype = {
    /**
     * @param {number} totalValue
     */
    setTotal: function(totalValue)
    {
        for (var i = 0; i < this._slices.length; ++i)
            this._slices[i].remove();
        this._slices = [];
        this._totalValue = totalValue;
        var totalString;
        if (totalValue)
            totalString = this._formatter ? this._formatter(totalValue) : totalValue;
        else
            totalString = "";
        if (this._totalElement)
            this._totalElement.textContent = totalString;
    },

    /**
     * @param {number} value
     */
    _setSize: function(value)
    {
        this._group.setAttribute("transform", "scale(" + (value / 2) + ") translate(" + (1 + WebInspector.PieChart._ShadowSizePercent) + ",1)");
        var size = value + "px";
        this.element.style.width = size;
        this.element.style.height = size;
    },

    /**
     * @param {number} value
     * @param {string} color
     */
    addSlice: function(value, color)
    {
        var sliceAngle = value / this._totalValue * 2 * Math.PI;
        if (!isFinite(sliceAngle))
            return;
        sliceAngle = Math.min(sliceAngle, 2 * Math.PI * 0.9999);
        var path = this._createSVGChild(this._group, "path");
        var x1 = Math.cos(this._lastAngle);
        var y1 = Math.sin(this._lastAngle);
        this._lastAngle += sliceAngle;
        var x2 = Math.cos(this._lastAngle);
        var y2 = Math.sin(this._lastAngle);
        var largeArc = sliceAngle > Math.PI ? 1 : 0;
        path.setAttribute("d", "M0,0 L" + x1 + "," + y1 + " A1,1,0," + largeArc + ",1," + x2 + "," + y2 + " Z");
        path.setAttribute("fill", color);
        this._slices.push(path);
    },

    /**
     * @param {!Element} parent
     * @param {string} childType
     * @return {!Element}
     */
    _createSVGChild: function(parent, childType)
    {
        var child = parent.ownerDocument.createElementNS("http://www.w3.org/2000/svg", childType);
        parent.appendChild(child);
        return child;
    }
}
