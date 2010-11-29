/*-----------------------------------------------
  Storage is a simple in memory storage object.
  In otherwords, don't run your website off it.
-----------------------------------------------*/

module.exports = {
  create: function(){
    return new memStore();
  }
};

function memStore(){
  var data = {};

  return {
    set: function(key, value){
      return data[key] = value;
    },

    get: function(key, def){
      if(data[key] !== undefined){
        return data[key];
      } else {
        return def;
      }
    },

    exists: function(key){
      return data[key] !== undefined;
    },

    incr: function(key){
      if(data[key] === undefined){
        data[key] = 0;
      }

      if(typeof(data[key]) === "number"){
        return data[key]++;
      }
    },

    decr: function(key){
      if(typeof(data[key]) === "number"){
        return data[key]--;
      }
    },

    push: function(key, value){
      if(data[key] === undefined){
        data[key] = [];
      }

      if(Array.isArray(data[key])){
        data[key].push(value);
      }
    },

    pop: function(key){
      if(data[key] !== undefined && Array.isArray(data[key])){
        return data[key].pop();
      }
    },

    del: function(key){
      data[key] = undefined;
    },

    to_json: function(){
      return JSON.stringify(data);
    }
  };
};