function InspectedClass() {
  this.writableProp = 'wr';
  Object.defineProperty(this, 'readonlyProp', { value: 'ro' });
}

process.stdin.once('data', function() {
  var inspectedObject = new InspectedClass();
  debugger;
  console.log(inspectedObject.writableProp);
});
