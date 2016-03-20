/*jshint browser:true, nonew:false*/
/*global WebInspector:true*/

WebInspector.saveAs = function(blob, filename) {
  var url = URL.createObjectURL(blob);
  var link = document.createElementNS('http://www.w3.org/1999/xhtml', 'a');
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

WebInspector.CPUProfileHeader.prototype.saveToFile = 
WebInspector.HeapProfileHeader.prototype.saveToFile = function() {
  var fileName = this._fileName || new Date().toISO8601Compact() + this._profileType.fileExtension();

  this._onTempFileReady = function() {
    this._tempFile.read(function (data) {
      WebInspector.saveAs(new Blob([data], {type: 'application/octet-stream'}), fileName);
    });

    this._onTempFileReady = null;
  };

  if (this._tempFile) this._onTempFileReady();
};
