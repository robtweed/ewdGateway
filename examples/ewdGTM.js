*/

Example showing how to use ewdGateway with GT.M

Assumes you have a GT.M database available in the same path that you run this example.

The example will:

- provide a web server that listens on port 8085
- start up 2 GT.M child processes

To run the example:

node ewdGTM

Then start your EWD application:

http://192.168.1.123:8085/ewd/myEWDApp/index.ewd

(alter the IP address/domain name appropriately to point to the machine running ewdGateway)

*/

var ewd = require('ewdGateway');

var params = {
    database:'gtm', 
    httpPort: 8085, 
    poolSize: 2, 
    startWebserver: true
};

ewd.start(params,function(gateway) {
  console.log("version = " + gateway.version());
  console.log("ewdGateway is now ready and waiting...");
});
