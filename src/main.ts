import * as Net from 'net';
import { CustomDebugSession } from './customDebugSession';
import constants = require('constants');

let port: number = 0;
const args = process.argv.slice(2);
args.forEach(function (val, index, array) {
  const portMatch = /^--port=(\d{4,5})$/.exec(val);
  if (portMatch) {
    port = parseInt(portMatch[1], 10);
  }
});

// start a server that creates a new session for every connection request
const address: string | Net.AddressInfo | null = Net.createServer((socket) => {
  console.error('>> accepted connection from client');
  socket.on('end', () => {
    console.error('>> client connection closed\n');
  });
  const session = new CustomDebugSession(false, true);
  session.start(socket, socket);
}).listen(port).address();

console.error(`waiting for debug protocol at ${address}`);
