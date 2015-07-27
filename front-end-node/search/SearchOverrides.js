/*jshint browser:true, nonew:false*/
/*global WebInspector:true, InspectorFrontendHost:true, InspectorFrontendHostAPI:true*/

(function() {
  var createSearchRegex = function(query, caseSensitive, isRegex)
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
    return new RegExp('^.*?'+regex+'.*?$|^.*?'+regex+'.*?\n|\n.*?'+regex+'.*?\n|\n.*?'+regex+'.*?$', flags || "");
  }

	// performSearchInContent is based on /front-end/common/ContentProvider.js implementation
	WebInspector.ContentProvider.performSearchInContent = function(content, query, caseSensitive, isRegex)
	{
		  var regex = createSearchRegex(query, caseSensitive, isRegex);
		  
		  var isMinified = false;

		  var firstNewLine = content.indexOf('\n');
		  if (content.length > 1024) {
		    if (firstNewLine > 1024 || firstNewLine === -1) {
		      isMinified = true;
		    }
		  }

		  var contentString = new String(content);
		  var result = [];
		  for (var i = 0; i < contentString.lineCount(); ++i) {
		    var lineContent = contentString.lineAt(i);
		    regex.lastIndex = 0;
		    if (regex.exec(lineContent)) {
		      result.push(new WebInspector.ContentProvider.SearchMatch(i, lineContent));
		    }
		  }
		  return result;
	}

	// _performSearchInContent tries to use regexp to gain performance
  /*WebInspector.ContentProvider._performSearchInContent = function(content, query, caseSensitive, isRegex)
  {
    var regex = createSearchRegex(query, caseSensitive, isRegex);

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
        result.push(new WebInspector.ContentProvider.SearchMatch(i-1, lineContent));
      }
    }
    return result;
  }*/
})()
