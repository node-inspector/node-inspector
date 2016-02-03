/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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

// WebKit Web Facing API

/**
 * @param {!Object} object
 * @param {!Function} callback
 */
Object.observe = function(object, callback) {}

/** @type {boolean} */
Event.prototype.isMetaOrCtrlForTest;

/** @type {string} */
Event.prototype.code;

/**
 * @type {number}
 */
KeyboardEvent.DOM_KEY_LOCATION_NUMPAD;

/**
 * @param {!T} value
 * @param {boolean=} onlyFirst
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.remove = function(value, onlyFirst) {}
/**
 * @param {!Array.<!T>} array
 * @this {Array.<!T>}
 * @template T
 */
Array.prototype.pushAll = function(array) {}
/**
 * @return {!Object.<string, boolean>}
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.keySet = function() {}
/**
 * @param {number} index
 * @return {!Array.<!T>}
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.rotate = function(index) {}
/**
 * @this {Array.<number>}
 */
Array.prototype.sortNumbers = function() {}
/**
 * @param {!T} object
 * @param {function(!T,!S):number=} comparator
 * @return {number}
 * @this {Array.<S>}
 * @template T,S
 */
Array.prototype.lowerBound = function(object, comparator) {}
/**
 * @param {!T} object
 * @param {function(!T,!S):number=} comparator
 * @return {number}
 * @this {Array.<S>}
 * @template T,S
 */
Array.prototype.upperBound = function(object, comparator) {}
/**
 * @param {!T} value
 * @param {function(!T,!S):number} comparator
 * @return {number}
 * @this {Array.<S>}
 * @template T,S
 */
Array.prototype.binaryIndexOf = function(value, comparator) {}
/**
 * @param {function(number, number): number} comparator
 * @param {number} leftBound
 * @param {number} rightBound
 * @param {number} sortWindowLeft
 * @param {number} sortWindowRight
 * @return {!Array.<number>}
 * @this {Array.<number>}
 */
Array.prototype.sortRange = function(comparator, leftBound, rightBound, sortWindowLeft, sortWindowRight) {}

/**
 * @param {function(!T,!T): number=} comparator
 * @return {!Array.<T>}
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.stableSort = function(comparator) {}

/**
 * @this {Array.<number>}
 * @param {function(number,number):boolean} comparator
 * @param {number} left
 * @param {number} right
 * @param {number} pivotIndex
 * @return {number}
 */
Array.prototype.partition = function(comparator, left, right, pivotIndex) {}

/**
 * @this {Array.<number>}
 * @param {number} k
 * @param {function(number,number):boolean=} comparator
 * @return {number}
 */
Array.prototype.qselect = function(k, comparator) {}

/**
 * @param {string} field
 * @return {!Array.<!T>}
 * @this {Array.<!Object.<string,T>>}
 * @template T
 */
Array.prototype.select = function(field) {}

/**
 * @return {!T|undefined}
 * @this {Array.<T>}
 * @template T
 */
Array.prototype.peekLast = function() {}

/**
 * @param {!Array.<T>} array
 * @param {function(T,T):number} comparator
 * @return {!Array.<T>}
 * @this {!Array.<T>}
 * @template T
 */
Array.prototype.intersectOrdered = function(array, comparator) {}

/**
 * @param {!Array.<T>} array
 * @param {function(T,T):number} comparator
 * @return {!Array.<T>}
 * @this {!Array.<T>}
 * @template T
 */
Array.prototype.mergeOrdered = function(array, comparator) {}

// File System API
/**
 * @constructor
 */
function DOMFileSystem() {}

/**
 * @type {DirectoryEntry}
 */
DOMFileSystem.prototype.root = null;

/**
 * @type {*}
 */
window.domAutomationController;

var DevToolsHost = {};

/** @typedef {{type:string, id:(number|undefined),
              label:(string|undefined), enabled:(boolean|undefined), checked:(boolean|undefined),
              subItems:(!Array.<!DevToolsHost.ContextMenuDescriptor>|undefined)}} */
DevToolsHost.ContextMenuDescriptor;

/**
 * @return {number}
 */
DevToolsHost.zoomFactor = function() { }

/**
 * @param {string} origin
 * @param {string} script
 */
DevToolsHost.setInjectedScriptForOrigin = function(origin, script) { }

/**
 * @param {string} text
 */
DevToolsHost.copyText = function(text) { }

/**
 * @return {string}
 */
DevToolsHost.platform = function() { }

/**
 * @param {number} x
 * @param {number} y
 * @param {!Array.<!DevToolsHost.ContextMenuDescriptor>} items
 * @param {!Document} document
 */
DevToolsHost.showContextMenuAtPoint = function(x, y, items, document) { }

/**
 * @param {string} message
 */
DevToolsHost.sendMessageToBackend = function(message) { }

/**
 * @param {string} message
 */
DevToolsHost.sendMessageToEmbedder = function(message) { }

/**
 * @return {string}
 */
DevToolsHost.getSelectionBackgroundColor = function() { }

/**
 * @return {string}
 */
DevToolsHost.getSelectionForegroundColor = function() { }

/**
 * @return {boolean}
 */
DevToolsHost.isUnderTest = function() { }

/**
 * @return {boolean}
 */
DevToolsHost.isHostedMode = function() { }

// FIXME: remove everything below.
var FormatterWorker = {}
var WebInspector = {}

WebInspector.panels = {};

WebInspector.reload = function() { }

/** Extensions API */

/** @constructor */
function AuditCategory() {}
/** @constructor */
function AuditResult() {}
/** @constructor */
function EventSink() {}
/** @constructor */
function ExtensionSidebarPane() {}
/** @constructor */
function Panel() {}
/** @constructor */
function PanelWithSidebar() {}
/** @constructor */
function Resource() {}
/** @constructor */
function Timeline() {}

var extensionServer;

/**
 * @constructor
 */
function ExtensionDescriptor() {
    this.startPage = "";
    this.name = "";
}

/**
 * @constructor
 */
function ExtensionReloadOptions() {
    this.ignoreCache = false;
    this.injectedScript = "";
    this.userAgent = "";
}

var Adb = {};
/** @typedef {{id: string, name: string, url: string, adbAttachedForeign: boolean}} */
Adb.Page;
/** @typedef {{id: string, adbBrowserChromeVersion: string, compatibleVersion: boolean, adbBrowserName: string, source: string, adbBrowserVersion: string, pages: !Array<!Adb.Page>}} */
Adb.Browser;
/** @typedef {{id: string, adbModel: string, adbSerial: string, browsers: !Array.<!Adb.Browser>, adbPortStatus: !Array.<number>, adbConnected: boolean}} */
Adb.Device;
/** @typedef {!Object.<string, string>} */
Adb.PortForwardingConfig;

/**
 * @constructor
 */
function diff_match_patch()
{
}

diff_match_patch.prototype = {
    /**
     * @param {string} text1
     * @param {string} text2
     * @return {!Array.<!{0: number, 1: string}>}
     */
    diff_main: function(text1, text2) { }
}

/** @constructor */
function Path2D() {}
Path2D.prototype = {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     */
    rect: function(x, y, w, h) { },
    /**
     * @param {number} x
     * @param {number} y
     */
    moveTo: function(x, y) { },
    /**
     * @param {number} x
     * @param {number} y
     */
    lineTo: function(x, y) { }
}

/** @constructor */
var Doc = function() { }
Doc.prototype = {
    /** @type {number} */
    scrollLeft: 0,
    /** @type {number} */
    scrollTop: 0
}

/** @constructor */
var CodeMirror = function(element, config) { }
CodeMirror.on = function(obj, type, handler) { }
CodeMirror.prototype = {
    /** @type {!Doc} */
    doc: null,
    addKeyMap: function(map) { },
    addLineClass: function(handle, where, cls) { },
    /** @param {?Object=} options */
    addLineWidget: function(handle, node, options) { },
    /**
     * @param {string|!Object} spec
     * @param {!Object=} options
     */
    addOverlay: function(spec, options) { },
    addWidget: function(pos, node, scroll, vert, horiz) { },
    charCoords: function(pos, mode) { },
    clearGutter: function(gutterID) { },
    clearHistory: function() { },
    clipPos: function(pos) { },
    /** @param {string=} mode */
    coordsChar: function(coords, mode) { },
    /** @param {string=} mode */
    cursorCoords: function(start, mode) { },
    defaultCharWidth: function() { },
    defaultTextHeight: function() { },
    deleteH: function(dir, unit) { },
    /**
     * @param {*=} to
     * @param {*=} op
     */
    eachLine: function(from, to, op) { },
    execCommand: function(cmd) { },
    extendSelection: function(from, to) { },
    findMarksAt: function(pos) { },
    /**
     * @param {!CodeMirror.Pos} from
     * @param {boolean=} strict
     * @param {Object=} config
     */
    findMatchingBracket: function(from, strict, config) { },
    findPosH: function(from, amount, unit, visually) { },
    findPosV: function(from, amount, unit, goalColumn) { },
    firstLine: function() { },
    focus: function() { },
    getAllMarks: function() { },
    /** @param {string=} start */
    getCursor: function(start) { },
    getDoc: function() { },
    getGutterElement: function() { },
    getHistory: function() { },
    getInputField: function(){ },
    getLine: function(line) { },
    /**
     * @return {!{wrapClass: string, height: number}}
     */
    getLineHandle: function(line) { },
    getLineNumber: function(line) { },
    /**
     * @return {!{token: function(CodeMirror.StringStream, Object):string}}
     */
    getMode: function() { },
    getOption: function(option) { },
    /** @param {*=} lineSep */
    getRange: function(from, to, lineSep) { },
    /**
     * @return {!{left: number, top: number, width: number, height: number, clientWidth: number, clientHeight: number}}
     */
    getScrollInfo: function() { },
    getScrollerElement: function() { },
    getSelection: function() { },
    getSelections: function() { },
    getStateAfter: function(line) { },
    getTokenAt: function(pos) { },
    /** @param {*=} lineSep */
    getValue: function(lineSep) { },
    getViewport: function() { },
    getWrapperElement: function() { },
    hasFocus: function() { },
    historySize: function() { },
    indentLine: function(n, dir, aggressive) { },
    indentSelection: function(how) { },
    indexFromPos: function(coords) { },
    isClean: function() { },
    iterLinkedDocs: function(f) { },
    lastLine: function() { },
    lineCount: function() { },
    lineInfo: function(line) { },
    /**
     * @param {number} height
     * @param {string=} mode
     */
    lineAtHeight: function(height, mode) { },
    linkedDoc: function(options) { },
    listSelections: function() { },
    markClean: function() { },
    markText: function(from, to, options) { },
    moveH: function(dir, unit) { },
    moveV: function(dir, unit) { },
    off: function(type, f) { },
    on: function(type, f) { },
    operation: function(f) { },
    posFromIndex: function(off) { },
    redo: function() { },
    refresh: function() { },
    removeKeyMap: function(map) { },
    removeLine: function(line) { },
    removeLineClass: function(handle, where, cls) { },
    removeLineWidget: function(widget) { },
    removeOverlay: function(spec) { },
    /** @param {*=} origin */
    replaceRange: function(code, from, to, origin) { },
    /**
     * @param {string} replacement
     * @param {string=} select
     */
    replaceSelection: function(replacement, select) { },
    /**
     * @param {!Array.<string>} textPerSelection
     */
    replaceSelections: function(textPerSelection) { },
    /** @param {*=} margin */
    scrollIntoView: function(pos, margin) { },
    scrollTo: function(x, y) { },
    setBookmark: function(pos, options) { },
    setCursor: function(line, ch, extend) { },
    setExtending: function(val) { },
    setGutterMarker: function(line, gutterID, value) { },
    setHistory: function(histData) { },
    setLine: function(line, text) { },
    setOption: function(option, value) { },
    setSelection: function(anchor, head) { },
    /**
     * @param {number=} primaryIndex
     * @param {?Object=} config
     */
    setSelections: function(selections, primaryIndex, config) { },
    setSize: function(width, height) { },
    setValue: function(code) { },
    somethingSelected: function() { },
    swapDoc: function(doc) { },
    undo: function() { },
    unlinkDoc: function(other) { }
}
/** @type {!{cursorDiv: Element}} */
CodeMirror.prototype.display;
/** @type {!Object} */
CodeMirror.Pass;
CodeMirror.showHint = function(codeMirror, hintintFunction) { };
CodeMirror.commands = {};
CodeMirror.modes = {};
CodeMirror.mimeModes = {};
CodeMirror.getMode = function(options, spec) { };
CodeMirror.overlayMode = function(mode1, mode2, squashSpans) { };
CodeMirror.defineMode = function(modeName, modeConstructor) { };
CodeMirror.startState = function(mode) { };

/** @typedef {{canceled: boolean, from: !CodeMirror.Pos, to: !CodeMirror.Pos, text: string, origin: string, cancel: function()}} */
CodeMirror.BeforeChangeObject;

/** @typedef {{from: !CodeMirror.Pos, to: !CodeMirror.Pos, origin: string, text: !Array.<string>, removed: !Array.<string>}} */
CodeMirror.ChangeObject;

/** @constructor */
CodeMirror.Pos = function(line, ch) { }
/** @type {number} */
CodeMirror.Pos.prototype.line;
/** @type {number} */
CodeMirror.Pos.prototype.ch;

/**
 * @param {!CodeMirror.Pos} pos1
 * @param {!CodeMirror.Pos} pos2
 * @return {number}
 */
CodeMirror.cmpPos = function(pos1, pos2) { };

/** @constructor */
CodeMirror.StringStream = function(line)
{
    this.pos = 0;
    this.start = 0;
}
CodeMirror.StringStream.prototype = {
    backUp: function(n) { },
    column: function() { },
    current: function() { },
    eat: function(match) { },
    eatSpace: function() { },
    eatWhile: function(match) { },
    eol: function() { },
    indentation: function() { },
    /**
     * @param {!RegExp|string} pattern
     * @param {boolean=} consume
     * @param {boolean=} caseInsensitive
     */
    match: function(pattern, consume, caseInsensitive) { },
    next: function() { },
    peek: function() { },
    skipTo: function(ch) { },
    skipToEnd: function() { },
    sol: function() { }
}

/** @type {Object.<string, !Object.<string, string>>} */
CodeMirror.keyMap;

/** @type {{scrollLeft: number, scrollTop: number}} */
CodeMirror.doc;

/** @type {boolean} */
window.dispatchStandaloneTestRunnerMessages;

/**
 * @param {*} obj
 * @return {boolean}
 */
ArrayBuffer.isView = function(obj) { }

/**
 * @param {Array.<Object>} keyframes
 * @param {number|Object} timing
 * @return {Object}
 */
Element.prototype.animate = function(keyframes, timing) { }

var acorn = {
    /**
     * @param {string} text
     * @param {Object.<string, boolean>} options
     * @return {!ESTree.Node}
     */
    parse: function(text, options) {},

    /**
     * @param {string} text
     * @param {Object.<string, boolean>} options
     * @return {!Acorn.Tokenizer}
     */
    tokenizer: function(text, options) {},

    tokTypes: {
        _true: new Acorn.TokenType(),
        _false: new Acorn.TokenType(),
        num: new Acorn.TokenType(),
        regexp: new Acorn.TokenType(),
        string: new Acorn.TokenType(),
        name: new Acorn.TokenType(),
        eof: new Acorn.TokenType()
    }
};

var Acorn = {};
/**
 * @constructor
 */
Acorn.Tokenizer = function() {
    /** @type {function():!Acorn.Token} */
    this.getToken;
}

/**
 * @constructor
 */
Acorn.TokenType = function() {
    /** @type {string} */
    this.label;
    /** @type {(string|undefined)} */
    this.keyword;
}

/**
 * @typedef {{type: !Acorn.TokenType, value: string, start: number, end: number}}
 */
Acorn.Token;

/**
 * @typedef {{type: string, value: string, start: number, end: number}}
 */
Acorn.Comment;

/**
 * @typedef {(!Acorn.Token|!Acorn.Comment)}
 */
Acorn.TokenOrComment;

var ESTree = {};

/**
 * @constructor
 */
ESTree.Node = function()
{
    /** @type {number} */
    this.start;
    /** @type {number} */
    this.end;
    /** @type {string} */
    this.type;
    /** @type {(!ESTree.Node|undefined)} */
    this.body;
    /** @type {(!Array.<!ESTree.Node>|undefined)} */
    this.declarations;
    /** @type {(!Array.<!ESTree.Node>|undefined)} */
    this.properties;
    /** @type {(!ESTree.Node|undefined)} */
    this.init;
}

/**
 * @extends {ESTree.Node}
 * @constructor
 */
ESTree.TemplateLiteralNode = function()
{
    /** @type {!Array.<!ESTree.Node>} */
    this.quasis;
    /** @type {!Array.<!ESTree.Node>} */
    this.expressions;
}
