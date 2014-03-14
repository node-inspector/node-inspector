/*jshint debug:true */
function InspectedClass() {
  this.writableProp = 'wr';
  Object.defineProperty(this, 'readonlyProp', { value: 'ro' });
}

process.stdin.once('data', function() {
  function localFunc() { return 'local'; }

  var inspectedObject = new InspectedClass();

  debugger;
  console.log(inspectedObject.writableProp, localFunc());
});
