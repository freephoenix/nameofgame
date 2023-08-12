const clients = new Set();
let rooms = new Map();
function heartbeat() {this.isAlive = true;}	  // проверка разрыва соединения

module.exports=function onConnect(ws) {
  clients.add(ws);

  // проверка разрыва соединения
  ws.isAlive = true;
  ws.on('pong', heartbeat);
  const interval = setInterval(function ping() {
    clients.forEach(function each(ws) {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  function giveUsers() {
    let users='';
    for(let client of clients) {
      if(client.login) users+=client.login+':'+client.room+':'+client.levelnum+':'+[...client.blockedBy].toString()+';';
    }
    users=users.slice(0,-1);
    for(let client of clients) client.send('users:'+users);
  }
  function giveGamestate(ws) {
    if(rooms.has(ws.room)) {
      for(let client of rooms.get(ws.room).values()) {
        //отправить сообщение всем открытым клиентам, кроме себя
        if(client!==ws && client.readyState===ws.OPEN) client.send('gamestate:'+ws.collectedCoins+ws.levelnum);
      }
    }
  }

  ws.on('message', (message)=>{
    //console.log(ws.login, message);
    if(message.includes('pos:')) {
      ws.lastpos=message;
      if(rooms.has(ws.room)) {
        for(let client of rooms.get(ws.room).values()) {
          //отправить сообщение всем открытым клиентам, кроме себя
          if(client!==ws && client.readyState===ws.OPEN) client.send(ws.login+','+message);
        }
      }
    } else if(message.includes('collectedCoins:')) {
      ws.collectedCoins=message.substring(15);
      if(rooms.has(ws.room)) {
        for(let client of rooms.get(ws.room).values()) {
          if(client!==ws) client.collectedCoins=ws.collectedCoins;
        }
      }
      giveGamestate(ws);
    } else if(message.includes('levelnum:')) {
      if(rooms.has(ws.room)) {
        for(let client of rooms.get(ws.room).values()) {
          client.levelnum=message.substring(9);
        }
      } else {
        ws.levelnum=message.substring(9);
      }
      giveGamestate(ws);
      giveUsers();
    } else if(message.includes('addLogin:')) {		// если подключается новый пользователь
      let name=message.substring(9);
      if(Array.from(clients.values()).some(c=>c.login==name)) {	// проверка уникальности имени
        ws.send('users:'+false);
      } else {
        ws.login=name;
        ws.room=name;
        ws.blockedBy=new Set();
        ws.blockedFor=new Set();
        giveUsers();
      }
    } else if(message.includes('giveUsers:')) {
      giveUsers();
    } else if(message.includes('chat:')) {
      for(let client of clients) {
        if(client.readyState===ws.OPEN) client.send('chat:'+ws.login+':'+message.substring(5));
      }
    } else if(message.includes('join:')) {
      for(let client of clients) {
        if(client.login==message.substring(5)) {
          client.send('join:'+ws.login);
          break;
        }
      }
    } else if(message.includes('expel:')) {
      for(let client of clients) {
        if(client.login==message.substring(6)) {
          rooms=beforeLeavingRoom(rooms, client);
          client.room=client.login;
          client.collectedCoins='';
          client.levelnum=0;
          client.send('gamestate:'+client.collectedCoins+client.levelnum);
          break;
        }
      }
      giveUsers();
    } else if(message.includes('invite:')) {
      for(let client of clients) {
        if(client.login==message.substring(7)) {
          client.send('invite:'+ws.login);
          break;
        }
      }
    } else if(message.includes('blocked:')) {
      for(let client of clients) {
        if(client.login==message.substring(9)) {
          if(message[8]==1) client.blockedBy.add(ws.login);
          else client.blockedBy.delete(ws.login);
          break;
        }
      }
      giveUsers();
    } else if(message.includes('blockall:')) {
      if(message[9]==1) {
        for(let client of clients) {
          if(client!==ws && client.login!=ws.room) { // если это не я и не хозяин комнаты, в которой я играю
            client.blockedBy.add(ws.login);
          }
        }
      } else {
        for(let client of clients) {
          if(client!==ws) {
            client.blockedBy.delete(ws.login);
          }
        }
      }
      giveUsers();
    } else if(message.includes('acceptInvitation:')) {
      for(let client of clients) {
        if(client.login==message.substring(17)) {
          if(!rooms.has(client.room)) {
            let set=new Set();
            set.add(client);
            rooms.set(client.room, set);
          }
          if(rooms.get(client.room).size<4) {
            rooms=beforeLeavingRoom(rooms, ws);
            rooms.get(client.room).add(ws);
            client.send('accept:'+ws.login);
            ws.room=client.room;
            ws.collectedCoins=client.collectedCoins;
            ws.levelnum=client.levelnum;
            if(client.readyState===ws.OPEN) ws.send('gamestate:'+client.collectedCoins+client.levelnum);
            giveUsers();
            for(let c of rooms.get(ws.room).values()) {
              if(c!==ws && c.readyState===ws.OPEN) {
                c.send(ws.login+','+ws.lastpos);		// всем отправить мою позицию
                ws.send(c.login+','+c.lastpos);			// мне отправить позицию каждого
              }
            }
          }
          break;
        }
      }
    } else if(message.includes('acceptConnection:')) {
      for(let client of clients) {
        if(client.login==message.substring(17)) {
          if(!rooms.has(ws.room)) {
            let set=new Set();
            set.add(ws);
            rooms.set(ws.room, set);
          }
          if(rooms.get(ws.room).size<4) {
            rooms=beforeLeavingRoom(rooms, client);
            rooms.get(ws.room).add(client);
            client.send('accept:'+ws.login);
            client.room=ws.room;
            client.collectedCoins=ws.collectedCoins;
            client.levelnum=ws.levelnum;
            if(client.readyState===ws.OPEN) client.send('gamestate:'+ws.collectedCoins+ws.levelnum);
            giveUsers();
            for(let c of rooms.get(ws.room).values()) {
              if(c!==client && c.readyState===ws.OPEN) {
                c.send(client.login+','+client.lastpos);	// всем отправить позицию новенького
                client.send(c.login+','+c.lastpos);		// новенькому отправить позицию каждого
              }
            }
          }
          break;
        }
      }
    } else if(message.includes('rejectConnection:')) {
      for(let client of clients) {
        if(client.login==message.substring(17)) client.send('reject:'+ws.login);
      }

    // аудиосвязь

    } else if(message.includes('inviteConversation:')) {
      for(let client of clients) {
        if(client.login==message.substring(19)) {
          client.send('inviteConversation:'+ws.login);
          break;
        }
      }
    } else if(message.includes('acceptConversation:')) {
      for(let client of clients) {
        if(client.login==message.substring(19)) {
          if(!ws.conversators) ws.conversators=new Set();
          ws.conversators.add(client.login);
          if(!client.conversators) client.conversators=new Set();
          client.conversators.add(ws.login);
          client.send('acceptConversation:'+ws.login);
          break;
        }
      }
    } else if(message.includes('rejectConversation:')) {
      for(let client of clients) {
        if(client.login==message.substring(19)) {
          client.send('rejectConversation:'+ws.login);
          break;
        }
      }
    } else if(message.includes('closeConversation:')) {
      for(let client of clients) {
        if(client.login==message.substring(18)) {
          ws.conversators.delete(client.login);
          client.conversators.delete(ws.login);
          client.send('closeConversation:'+ws.login);
          break;
        }
      }
    } else if((typeof message)=='object') {
      for(let client of clients) {
        if(client!==ws && ws.conversators.has(client.login) && client.readyState===ws.OPEN) client.send(message);
      }
    }
  });
  ws.on('close', (e)=>{
    beforeLeavingRoom(rooms, ws);
    clients.delete(ws);
    giveUsers();
    clearInterval(interval);	  // проверка разрыва соединения
  });

  function beforeLeavingRoom(rooms, user) {
    if(rooms.has(user.room)) {			// если у отключающегося пользователя есть комната
      if(user.room==user.login) {		// и это - его комната
        for(let client of rooms.get(user.room).values()) {
          if(client!==ws && client.readyState===ws.OPEN) {
            client.room=client.login;						// вернуть остальных по своим комнатам
            client.collectedCoins='';
            client.levelnum=0;
            client.send('gamestate:'+client.collectedCoins+client.levelnum);	// на старт
          }
        }
        rooms.delete(user.room);							// удалить комнату
      } else {					// если это чужая комната
        for(let client of rooms.get(user.room).values()) {
          if(client.login==user.room) client.send('leave:'+user.login);
          break;
        }
        rooms.get(user.room).delete(user);	// убрать игрока из списка синхронизации
        
      }
    }
    return rooms;
  }
}