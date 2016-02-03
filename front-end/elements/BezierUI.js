// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {number} width
 * @param {number} height
 * @param {number} marginTop
 * @param {number} controlPointRadius
 * @param {boolean} linearLine
 */
WebInspector.BezierUI = function(width, height, marginTop, controlPointRadius, linearLine)
{
    this.width = width;
    this.height = height;
    this.marginTop = marginTop;
    this.radius = controlPointRadius;
    this.linearLine = linearLine;
}

WebInspector.BezierUI.prototype = {
    /**
     * @return {number}
     */
    curveWidth: function()
    {
        return this.width - this.radius * 2;
    },

    /**
     * @return {number}
     */
    curveHeight: function()
    {
        return this.height - this.radius * 2 - this.marginTop * 2;
    },

    /**
     * @param {!Element} parentElement
     * @param {string} className
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     */
    _drawLine: function(parentElement, className, x1, y1, x2, y2)
    {
        var line = parentElement.createSVGChild("line", className);
        line.setAttribute("x1", x1 + this.radius);
        line.setAttribute("y1", y1 + this.radius + this.marginTop);
        line.setAttribute("x2", x2 + this.radius);
        line.setAttribute("y2", y2 + this.radius + this.marginTop);
    },

    /**
     * @param {!Element} parentElement
     * @param {number} startX
     * @param {number} startY
     * @param {number} controlX
     * @param {number} controlY
     */
    _drawControlPoints: function(parentElement, startX, startY, controlX, controlY)
    {
        this._drawLine(parentElement, "bezier-control-line", startX, startY, controlX, controlY);
        var circle = parentElement.createSVGChild("circle", "bezier-control-circle");
        circle.setAttribute("cx", controlX + this.radius);
        circle.setAttribute("cy", controlY + this.radius + this.marginTop);
        circle.setAttribute("r", this.radius);
    },

    /**
     * @param {?WebInspector.Geometry.CubicBezier} bezier
     * @param {!Element} svg
     */
    drawCurve: function(bezier, svg)
    {
        if (!bezier)
            return;
        var width = this.curveWidth();
        var height = this.curveHeight();
        svg.setAttribute("width", this.width);
        svg.setAttribute("height", this.height);
        svg.removeChildren();
        var group = svg.createSVGChild("g");

        if (this.linearLine)
            this._drawLine(group, "linear-line", 0, height, width, 0);

        var curve = group.createSVGChild("path", "bezier-path");
        var curvePoints = [
            new WebInspector.Geometry.Point(bezier.controlPoints[0].x * width + this.radius, (1 - bezier.controlPoints[0].y) * height + this.radius + this.marginTop),
            new WebInspector.Geometry.Point(bezier.controlPoints[1].x * width + this.radius, (1 - bezier.controlPoints[1].y) * height + this.radius + this.marginTop),
            new WebInspector.Geometry.Point(width + this.radius, this.marginTop + this.radius)
        ];
        curve.setAttribute("d", "M" + this.radius + "," + (height + this.radius + this.marginTop) + " C" + curvePoints.join(" "));

        this._drawControlPoints(group, 0, height, bezier.controlPoints[0].x * width, (1 - bezier.controlPoints[0].y) * height);
        this._drawControlPoints(group, width, 0, bezier.controlPoints[1].x * width, (1 - bezier.controlPoints[1].y) * height);
    }
}

WebInspector.BezierUI.Height = 32;

/**
 * @param {!WebInspector.Geometry.CubicBezier} bezier
 * @param {!Element} path
 * @param {number} width
 */
WebInspector.BezierUI.drawVelocityChart = function(bezier, path, width)
{
    var height = WebInspector.BezierUI.Height;
    var pathBuilder = ["M", 0, height];
    const sampleSize = 1 / 40;

    var prev = bezier.evaluateAt(0);
    for (var t = sampleSize; t < 1 + sampleSize; t += sampleSize) {
        var current = bezier.evaluateAt(t);
        var slope = (current.y - prev.y) / (current.x - prev.x);
        var weightedX = prev.x * (1 - t) + current.x * t;
        slope = Math.tanh(slope / 1.5); // Normalise slope
        pathBuilder = pathBuilder.concat(["L", (weightedX * width).toFixed(2), (height - slope * height).toFixed(2) ]);
        prev = current;
    }
    pathBuilder = pathBuilder.concat(["L", width.toFixed(2), height, "Z"]);
    path.setAttribute("d", pathBuilder.join(" "));
}
