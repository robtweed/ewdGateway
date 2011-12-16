*/

Example showing how to use ewdGateway with Cache for Windows

(For Cache on Linux or OS X, see ewdCache.js)

Assumes that Cache is enabled for use over telnet, and that when 
connected, it will bring up the normal shell prompt (eg USER> )

The example will:

- provide a web server that listens on port 8085
- start up 2 Cache processes via telnet connections

To run the example:

node ewdCacheWindows

Then start your EWD application:

http://192.168.1.123:8085/ewd/myEWDApp/index.ewd

(alter the IP address/domain name appropriately to point to the machine running ewdGateway)

*/

var ewd = require('./ewdGateway');

var params = {
  database:'cache', 
  httpPort: 8085, 
  poolSize: 2, 
  startWebserver: true,
  useWebsockets: false,
  webServerRootPath: 'c:\\inetpub\\wwwroot',
  logTo: 'console'
};

ewd.start(params,function(gateway) {
  console.log("version = " + gateway.version());
  console.log("ewdGateway is now ready and waiting...");
});
