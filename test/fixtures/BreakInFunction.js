function MyObj() {
}

MyObj.prototype = {
  myFunc: function(msg) {
    console.log(msg);
    this.called = true;
    debugger;
  }
};

function globalFunc(msg) {
  obj.myFunc(msg);
}

var obj = new MyObj();

process.stdin.once('data', function() {
  globalFunc('hello');
  console.log(obj.called);
});
