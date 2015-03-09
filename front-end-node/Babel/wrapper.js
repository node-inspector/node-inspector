self.esnext = {};
esnext.transform = function(text){
  //C: getting file source code and transpiling to support ECMAScript 6/7
  var sourceFile = 'eval.'+Date.now();
  var comments = [];
  var tokens = [];
  var ast = null;
  var skip = true;
  try {
    ast = acorn.parse(text, {
      'allowImportExportEverywhere': false,
      'allowReturnOutsideFunction': true,
      'ecmaVersion': 5,
      'playground': false,
      'strictMode': false,
      'onComment': comments,
      'locations': true,
      'onToken': tokens,
      'ranges': true,
      'preserveParens': false,
      'sourceFile': sourceFile
    });
  } catch (e) {
    try {
      var esnext_prefix = '(async function () {';
      var esnext_suffix = '\n})();';
      ast = acorn.parse(esnext_prefix + text + esnext_suffix, {
        'allowImportExportEverywhere': false,
        'allowReturnOutsideFunction': true,
        'ecmaVersion': WebInspector.queryParamsObject["babel"]||7,
        'playground': false,
        'strictMode': false,
        'onComment': comments,
        'locations': true,
        'onToken': tokens,
        'ranges': true,
        'preserveParens': false,
        'sourceFile': sourceFile
      });
      skip = false;
    } catch(e){}
  }
  if (ast == null || skip === true) {
    return text;
  }
  var last_statement_container = ast.body[0].expression.callee.body;
  var last_statement_index = last_statement_container.body.length-1;
  var last_statement_node = last_statement_container.body[last_statement_index];
  if (last_statement_container.body.length === 0 ||
    (last_statement_node.type !== 'ExpressionStatement' &&
    last_statement_node.type !== 'ReturnStatement')) {
    last_statement_container.body.push({
      "type": "ReturnStatement",
      "argument": {
        "type": "Identifier",
        "name": "undefined"
      }
    });
  } else if (last_statement_node.type === 'ExpressionStatement' &&
    last_statement_node.type !== 'ReturnStatement'){
    last_statement_container.body[last_statement_index] = {
      "type": "ReturnStatement",
      "argument": last_statement_node.expression
    };
  }
  var generated = babel.transform.fromAst(ast,null,{
    'experimental': true,
    'playground': false,
    'format': {
      'parentheses': true,
      'comments': false,
      'compact': false,
      'indent': {
        'style': '  ',
        'base': 1
      }
    },
    'sourceMap': false,
    'code': true,
    'ast': false
  });
  var generated_code = generated.code;

  return generated_code;
  /*eval.call(global,generated_code).then(function(result){
   sendResult({
   result: self.wrapObject(result, params.objectGroup),
   wasThrown: false
   });
   }).catch(function(error){
   sendResult(self.createThrownValue(new Exception(error), params.objectGroup));
   });*/
};
