 module.exports = (function(){
  var request = require('superagent');

  var _sneeze = {};
  var config;

  var isFunction = function(functionToCheck) {
   var getType = {};
   return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
  }

  _sneeze._enabled = true;

  /*
    - Gets the browser type and version if available
  */
  _sneeze.browserWithVersion = (function(){
    if(typeof navigator == 'undefined' && typeof process != 'undefined'){
      return 'NodeJS';
    }else if(typeof navigator == 'undefined'){
      return 'No browser information available';
    }
    var ua= navigator.userAgent, tem, 
    M= ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
    if(/trident/i.test(M[1])){
        tem=  /\brv[ :]+(\d+)/g.exec(ua) || [];
        return 'IE '+(tem[1] || '');
    }
    if(M[1]=== 'Chrome'){
        tem= ua.match(/\b(OPR|Edge)\/(\d+)/);
        if(tem!= null) return tem.slice(1).join(' ').replace('OPR', 'Opera');
    }
    M= M[2]? [M[1], M[2]]: [navigator.appName, navigator.appVersion, '-?'];
    if((tem= ua.match(/version\/(\d+)/i))!= null) M.splice(1, 1, tem[1]);
    return M.join(' ');
  })();

  _sneeze.configure = function(configuration){
    configuration = configuration || {};
    config = config || {};
    config.url = configuration.url || config.url || '/errors';
    config.data = configuration.data || config.data;
    // any other configurations can go here
  }

  // returns a shallow copy of the configuration
  _sneeze.getConfig = function(){
    var configuration;
    if(config){
      configuration = {};
      for(var attr in config){
        configuration[attr] = config[attr];
      }
    }
    return configuration;
  }

  _sneeze.getAdditionalData = function(error, options){
    var context = options.context || this;
    if(options.data && isFunction(options.data)){
      return options.data.apply(context, error);
    }
    return options.data;
  }

  // will return options, comparing the options with _config, and fills the missing pieces of the options hash with _config values
  // will return options if _config is not defined
  _sneeze.extendOptions = function(options){
    if(!config){
      this.configure();
    }
    for(var attrName in config){
      if(typeof options[attrName] == 'undefined'){
        options[attrName] = config[attrName];
      }
    }
  }

  /*
    - Accepts an error object and passes the error to the configured url via POST
    - Will attempt to post to the server as long as a valid response is returned
    - Will not attempt further logging if a request to the server returns an error
  */
  _sneeze.log = function(error, options){
    if(!this._enabled){
      return false;
    }

    options = options || {};

    this.extendOptions(options);
    
    var errorInfo = this.getErrorInfo(error);

    errorInfo.data = this.getAdditionalData(error, options);

    errorInfo.device = this.getDeviceInfo();
    try{
      this.sendError(errorInfo, options);
    }catch(e){
      _sneeze.disable();
    }

    return true;
  }

  _sneeze.sendError = function(info, options){
    request.post(options.url)
      .send(info)
      .end(function(err, response){
        if(err){
          _sneeze.disable();
        }
      });
  }

  /*
    Parses an error for 
      - the event that triggered the error
      - the source of the error (script)
      - the line number of the error
      - the column number of the error
      - the complete stack of the error

    Will return the parsed error and the user's browser and version
  */

  _sneeze.getErrorInfo = function(error){
    error = error || {};
    
    var errorInfo = {},
        stack = error.stack || '';

    errorInfo.message = error.message;
    errorInfo.stack = stack.trim();
    errorInfo.browser = this.browserWithVersion;

    if((/chrome/i).test(this.browserWithVersion) || (/NodeJS/.test(this.browserWithVersion))){
      var pieces = stack.split('\n'),
          src = pieces[pieces.length-1].replace(/(\(*)(\)*)/, '').split(':'),
          stop = src.length-2,
          source = '';

      source = '';
      for(var i=0; i < stop; i++){
        source+=src[i];
      }

      if(source.length){
        errorInfo.event = source.split('(')[0].trim();
        errorInfo.source = source.split('(')[1].trim();
        errorInfo.lineno = parseInt(src[src.length-2].trim());
        errorInfo.colno = parseInt(src[src.length-1].trim().replace(')', ''));
      }
    }else if((/firefox/i).test(this.browserWithVersion)){
      errorInfo.event = 'N/A';
      errorInfo.source = error.fileName && error.fileName.toString().length? error.fileName : 'N/A';
      errorInfo.lineno = error.lineNumber && error.lineNumber.toString().length? error.lineNumber : 'N/A';
      errorInfo.colno = error.columnNumber && error.columnNumber.toString().length? error.columnNumber : 'N/A';
    }else if((/IE/.test(this.browserWithVersion)) || (/msie/.test(this.browserWithVersion))){
      errorInfo.message = error.description && error.description.toString().length? error.description : 'N/A';
      errorInfo.event = 'N/A';
      errorInfo.source = 'N/A';
      errorInfo.lineno = 'N/A';
      errorInfo.colno = 'N/A';
    }else if((/safari/i).test(this.browserWithVersion)){
      errorInfo.event = 'N/A';
      errorInfo.source = error.source && error.source.toString().length? error.source : 'N/A';
      errorInfo.lineno = error.lineno && error.lineno.toString().length? error.lineno : 'N/A';
      errorInfo.colno = error.colno && error.colno.toString().length? error.colno : 'N/A';
    }
    return errorInfo;
  }

  _sneeze.getDeviceInfo = function(){
    return typeof navigator != 'undefined' && navigator.userAgent ? navigator.userAgent : 'N/A';
  }
  /*
    - Global watch for errors.
    - Does not receive errors from functions executed with sneeze.catch
    - accepts a callback function, but does not wait for sneeze to send the error to the server
  */

  _sneeze.listen = function(options){
    options = options || {};
    var self = this;
    if(typeof window != 'undefined'){
      window.onerror = function(message, source, lineno, colno, error){
        if(!error){
          error = { message: message, source: source, lineno: lineno, colno: colno, stack: 'N/A'};
        }
        self.processError(error, options);
      }
    }else{
      process.on('uncaughtException', function(error){
        self.processError(error, options);
      });
    }
  }

  _sneeze.processError = function(error, options){
    var context = options.context || this;
    this.log(error, options);
    if(options.onError){
      options.onError.apply(context, [error, options]);
    }
  }
  /* 
    - Attempts a function and catches any errors. 
    - Will execute a callback if passed, but does not wait for sneeze to send the error to the server
  */
  _sneeze.catch = function(fn, options){
    var self = this;

    self.wrapTryCatch(fn, options)();
  }

  _sneeze.wrapTryCatch = function(fn, options){
    var self = this;
    var context = options.context || this;

    return function(){
      var err = null;
      try{
        fn.apply(context, arguments)
      }catch(e){
        err = { e: e }
      }

      if(err){
        self.log(err.e, options)
        if(options.onError){
          options.onError.apply(context, [err.e, options]);
        }
      }
    }
  }

  _sneeze.enable = function(){
    this._enabled = true;
  }

  _sneeze.disable = function(){
    this._enabled = false;
  }

  /* 
    - Setup default configuration
  */
  _sneeze.configure(); 

  return _sneeze;
})();
