//https://nameofgame.herokuapp.com/

const fs = require('fs')
const http = require('http');
const ws = require('ws');
const wss = new ws.Server({noServer: true});
const port = process.env.PORT || 3000;
const onConnect=require('./onConnect');

if(!module.parent) {
  http.createServer((req, res)=>{
    let ip;
    if(req.headers['x-forwarded-for']) ip=req.headers['x-forwarded-for'].split(/\s*,\s*/)[0];	// When the server runs behind a proxy like NGINX
    else ip=req.socket.remoteAddress;

    // все входящие запросы должны использовать websockets
    // может быть заголовок Connection: keep-alive, Upgrade
    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() == 'websocket' || req.headers.connection.match(/\bupgrade\b/i)) {
      // присоединение wss
      wss.handleUpgrade(req, req.socket, Buffer.alloc(0), onConnect);
    } else {
      if(req.method=='GET') {
        let url=req.url.split('/');
console.log(url[1]);
        if(url[1]=='') {
          fs.readFile('./index.html', (err, data)=>{
            if(err) return console.error(err.message);
            res.writeHead(200, {"Content-Type": "text/html"});
            res.write(data);
            res.end();
          });
        } else if(url[1]=='code' || url[1]=='img' || url[1]=='favicon.ico') {
          fs.readFile('.'+req.url, (err, data)=>{
            if(err) return console.error(err.message);
            res.writeHead(200, {"Content-Type": "text/html"});
            res.write(data);
            res.end();
          });
        } else if(url[1]=='style.css') {
          fs.readFile('.'+req.url, (err, data)=>{
            if(err) return console.error(err.message);
            res.writeHead(200, {"Content-Type": "text/css"});
            res.write(data);
            res.end();
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      }	// end of GET
    }
  }).listen(port, ()=>console.log(port));
} else {
  exports.accept = accept;
}