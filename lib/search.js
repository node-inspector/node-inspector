// code extracted and adapted from /front-end/platform/utilities.js
// performSearchInContent is based on /front-end/common/ContentProvider.js implementation
// _performSearchInContent tries to use regexp to gain performance


var findAll = function(content, string)
{
  var matches = [];
  var i = content.indexOf(string);
  while (i !== -1) {
    matches.push(i);
    i = content.indexOf(string, i + string.length);
  }
  return matches;
}

var getlineEndings = function(content)
{
  var _lineEndings = findAll(content, "\n");
  _lineEndings.push(content.length);
  return _lineEndings;
}

var getlineAt = function(content, lineNumber, lineEndings) {
  var lineStart = lineNumber > 0 ? lineEndings[lineNumber - 1] + 1 : 0;
  var lineEnd = lineEndings[lineNumber];
  var lineContent = content.substring(lineStart, lineEnd);
  if (lineContent.length > 0 && lineContent.charAt(lineContent.length - 1) === "\r")
    lineContent = lineContent.substring(0, lineContent.length - 1);
  return lineContent;
}

var createSearchRegex = function(query, caseSensitive, isRegex)
{
  var regexFlags = caseSensitive ? "g" : "gi";
  var regexObject;

  if (isRegex) {
    try {
      regexObject = new RegExp(query, regexFlags);
    } catch (e) {
      // Silent catch.
    }
  }

  if (!regexObject)
    regexObject = createPlainTextSearchRegex(query, regexFlags);

  return regexObject;
}

var createPlainTextSearchRegex = function(query, flags)
{
  // This should be kept the same as the one in ContentSearchUtils.cpp.
  var regexSpecialCharacters = "^[]{}()\\.^$*+?|-,";
  var regex = "";
  for (var i = 0; i < query.length; ++i) {
    var c = query.charAt(i);
    if (regexSpecialCharacters.indexOf(c) != -1)
      regex += "\\";
    regex += c;
  }
  return new RegExp(regex, flags || "");
}

exports.performSearchInContent = function(content, query, caseSensitive, isRegex)
{
  var regex = createSearchRegex(query, caseSensitive, isRegex);

  var isMinified = false;

  var firstNewLine = content.indexOf('\n');
  if (content.length > 1024) {
    if (firstNewLine > 1024 || firstNewLine === -1) {
      isMinified = true;
    }
  }
  
  var result = [];
  var lineEndings = getlineEndings(content);
  var lineCount = lineEndings.length;
  for (var i = 0; i < lineCount; ++i) {
    var lineContent = getlineAt(content, i, lineEndings);
    regex.lastIndex = 0;
    if (regex.exec(lineContent)) {
      if (isMinified === true && lineContent.length > 1024) {
        lineContent = ' ... (line too long)';
      }
      result.push(new SearchMatch(i, lineContent));
    }
  }
  return result;
}

var SearchMatch = function(lineNumber, lineContent) {
  this.lineNumber = lineNumber;
  this.lineContent = lineContent;
}

var _createSearchRegex = function(query, caseSensitive, isRegex)
{
  var regexFlags = caseSensitive ? "g" : "gi";
  var regexObject;

  if (isRegex) {
    try {
      regexObject = new RegExp('^.*?'+query+'.*?$|^.*?'+query+'.*?\n|\n.*?'+query+'.*?\n|\n.*?'+query+'.*?$', regexFlags);
    } catch (e) {
      // Silent catch.
    }
  }

  if (!regexObject)
    regexObject = _createPlainTextSearchRegex(query, regexFlags);

  return regexObject;
}

var _createPlainTextSearchRegex = function(query, flags)
{
  // This should be kept the same as the one in ContentSearchUtils.cpp.
  var regexSpecialCharacters = "^[]{}()\\.^$*+?|-,";
  var regex = "";
  for (var i = 0; i < query.length; ++i) {
    var c = query.charAt(i);
    if (regexSpecialCharacters.indexOf(c) != -1)
      regex += "\\";
    regex += c;
  }
  return new RegExp('^.*?'+regex+'.*?$|^.*?'+regex+'.*?\n|\n.*?'+regex+'.*?\n|\n.*?'+regex+'.*?$', flags || "");
}

exports._performSearchInContent = function(content, query, caseSensitive, isRegex)
{
  var regex = _createSearchRegex(query, caseSensitive, isRegex);

  var result = [];
  var lastMatch;
  var isMinified = false;

  var firstNewLine = content.indexOf('\n');
  if (content.length > 1024) {
    if (firstNewLine > 1024 || firstNewLine === -1) {
      isMinified = true;
    }
  }

  while(lastMatch=regex.exec(content)) {
    var lineContent = lastMatch[0];
    var firstChar = lineContent.charCodeAt(0);
    var lastChar = lineContent.charCodeAt(lineContent.length-1);
    var lineMatchesBefore = content.substr(0,regex.lastIndex).match(/\n/g);
    if (lineMatchesBefore){
      var i = lineMatchesBefore.length;
      if (lastChar !== 10){
        ++i;
      } else {
        lineContent = lineContent.substr(0,lineContent.length-1);
      }
      if (firstChar === 10){
        lineContent = lineContent.substr(1);
      }
      if (isMinified === true && lineContent.length > 1024) {
        lineContent = ' ... (line too long)';
      }
      result.push(new SearchMatch(i-1, lineContent));
    }
  }
  return result;
}

//exports.performSearchInContent = exports._performSearchInContent;
