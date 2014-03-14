/*jshint debug:true */
function MyObj() {
}

MyObj.prototype = {
  myFunc: function(msg, meta) {
    console.log(msg, meta);
    this.called = true;
    debugger;
  }
};

function globalFunc(msg, meta) {
  obj.myFunc(msg, meta);
}

var obj = new MyObj();

process.stdin.once('data', function() {
  globalFunc('hello', { world: 'true' });
  console.log(obj.called);
});
