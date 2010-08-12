#include <v8.h>
#include <node.h>

using namespace v8;
using namespace node;

static Handle<Value> GetLogLines(const Arguments& args)
{
  HandleScope scope;
  if (args.Length() < 1) {
    return ThrowException(Exception::Error(String::New("No position specified")));
  } else if (!args[0]->IsInt32()) {
    return ThrowException(Exception::Error(String::New("position must be an integer.")));
  }
  int32_t position = args[0]->Int32Value();
  static char buffer[65536];
  const int readSize = V8::GetLogLines(position, buffer, sizeof(buffer) - 1);
  buffer[readSize] = '\0';
  position += readSize;
  Handle<Object> result = Object::New();
  result->Set(String::New("lines"), String::New(buffer, readSize));
  result->Set(String::New("position"), Integer::New(position));

  return scope.Close(result);
}

extern "C" void init(Handle<Object> target) {
  HandleScope scope;
  target->Set(String::New("getLogLines"), FunctionTemplate::New(GetLogLines)->GetFunction());
}
