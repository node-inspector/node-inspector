'use strict';

const path = require('path');
const dataUri = require('strong-data-uri');
const convert = require('../convert.js');

// see Blink inspector > ContentSearchUtils.cpp > findMagicComment()
const SOURCE_MAP_URL_REGEX = /\/\/[@#][ \t]sourceMappingURL=[ \t]*([^\s'"]*)[ \t]*$/m;

class InspectorScript {
  constructor(script) {
    this.name = script.name;
    this.scriptId = String(script.id),
    this.url = convert.pathToUrl(script.name);
    this.startLine = script.lineOffset;
    this.startColumn = script.columnOffset;
    this.isInternalScript = this._isInternal(script.name);

    try {
      this.sourceMapURL = this._getSourceMapUrl(script.source);
    } catch (e) {
      console.log(
        'Warning: cannot parse SourceMap URL for script %s (id %d). %s',
        script.name, script.id, e.stack);
    }

    this.sourceMapURL = this.sourceMapURL || null;
  }

  _getSourceMapUrl(source) {
    if (this.isInternalScript) return;

    const match = SOURCE_MAP_URL_REGEX.exec(source) || [];
    return this._checkInlineSourceMap(match[1]);
  }

  _checkInlineSourceMap(sourceMapUrl) {
    // Source maps have some issues in different libraries.
    // If source map exposed in inline mode, we can easy fix some potential issues.
    if (!sourceMapUrl) return;

    try {
      const sourceMap = JSON.parse(dataUri.decode(sourceMapUrl).toString());
    } catch (err) { return; }

    this._checkSourceMapIssues(sourceMap);

    return dataUri.encode(JSON.stringify(sourceMap), 'application/json');
  }

  _checkSourceMapIssues(sourceMap) {
    const scriptName = this.name;
    const scriptOrigin = path.dirname(scriptName);

    // Documentation says what source maps can contain absolute paths,
    // but DevTools strictly expects relative paths.
    sourceMap.sources = sourceMap.sources.map((source) => {
      if (!path.isAbsolute(source)) return source;

      return path.relative(scriptOrigin, source);
    });

    // Documentation says nothing about file name of bundled script.
    // So, we expect a situation, when original source and bundled script have equal name.
    // We need to fix this case.
    sourceMap.sources = sourceMap.sources.map(function(source) {
      const sourceUrl = path.resolve(scriptOrigin, source).replace(/\\/g, '/');
      if (sourceUrl == scriptName) return source + '.source';

      return source;
    });
  }

  _isInternal(path) {
    if (!path) return true;

    // node.js internal scripts have no path, just a filename
    // regular scripts have always a full path
    //   (i.e their name contains at least one path separator)
    return !/[\/\\]/.test(path);
  }
}

module.exports = InspectorScript;
