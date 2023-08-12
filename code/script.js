let socket;
let myID;
let levelnumber=0;
let collectedCoins='';
const otherPlayers=new Map();
let needRefresh=false;
let needRestartLevel=false;
let playerPos;	// для отправки, при соединении с сервером
let loadedPos;  // для получения загрузки сохранения
let fullscreen=false;
let viewportWidth = document.querySelector('.nameofgame').parentNode.clientWidth;	// document.documentElement.clientWidth;
let viewportHeight = document.querySelector('.nameofgame').parentNode.clientHeight;	// document.documentElement.clientHeight;
let rec;
let conversators=new Map();

class Level {
  constructor(plan) {
    let rows = plan.trim().split("\n").map(l => [...l]);
    this.height = rows.length;
    this.width = rows[0].length;
    this.startActors = [];

    this.rows = rows.map((row, y) => {
      return row.map((ch, x) => {
        let type = levelChars[ch];
        if (typeof type == "string") return type;
        this.startActors.push(
          type.create(new Vec(x, y), ch));
        return "empty";
      });
    });
  }

  touches(pos, size, type) {
    const xStart = Math.floor(pos.x);
    const xEnd = Math.ceil(pos.x + size.x);
    const yStart = Math.floor(pos.y);
    const yEnd = Math.ceil(pos.y + size.y);
    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        let here;
        if(x < 0 || x >= this.width || y >= this.height) here = "lava";		// объект за границами уровня, но не по вертикали, то это равно касанию лавы
        else if(y >= 0) here = this.rows[y][x];
        if (here == type) return true;
      }
    }
    return false;
  };
}

class State {
  constructor(level, actors, status) {
    this.level = level;
    this.actors = actors;
    this.status = status;
  }

  static start(level) {
    return new State(level, level.startActors, "playing");
  }

  get player() {
    return this.actors.find(a => a.type == "player");
  }

  update(time, keys) {
    let actors = this.actors.map(actor => actor.update(time, this, keys));
    let newState = new State(this.level, actors, this.status);
    if(newState.status != "playing") return newState;
    let player = newState.player;
    if(this.level.touches(player.pos, player.size, "lava")) {
      return new State(this.level, actors, "lost");
    }
    actors.forEach(actor=>{
      if(actor != player && (overlap(actor, player) || Array.from(otherPlayers.values()).some(op=>overlap(actor, op))) ) {	// если любой игрок касается монеты
        newState = actor.collide(newState);
      }
    });
    return newState;
  };
}

class Vec {
  constructor(x, y) {
    this.x = x; this.y = y;
  }
  plus(other) {
    return new Vec(this.x + other.x, this.y + other.y);
  }
  times(factor) {
    return new Vec(this.x * factor, this.y * factor);
  }
  isEqual(oldpos) {
    return (this.x==oldpos.x && this.y==oldpos.y);
  }
}

class Player {
  constructor(pos, speed) {
    this.pos = pos;
    this.speed = speed;
    this.size = new Vec(0.8, 1.5);
  }

  get type() { return "player"; }

  static create(pos) {
    return new Player(pos.plus(new Vec(0, -0.5)),
                      new Vec(0, 0));
  }

  update(time, state, keys) {
    let xSpeed = 0;
    if(keys[0]) xSpeed -= playerXSpeed;
    if(keys[1]) xSpeed += playerXSpeed;
    let pos = this.pos;
    let movedX = pos.plus(new Vec(xSpeed * time, 0));
    if(!state.level.touches(movedX, this.size, "wall")) {
      pos = movedX;
    }

    let ySpeed = this.speed.y + time * gravity;
    let movedY = pos.plus(new Vec(0, ySpeed * time));
    if(!state.level.touches(movedY, this.size, "wall")) {
      pos = movedY;
    } else if (keys[2] && ySpeed > 0) {
      ySpeed = -jumpSpeed;				// если нажат прыжок при нахождении на земле
    } else {
      ySpeed = 0;
      pos = new Vec(pos.x, Math.floor(pos.y)+0.5)	// без этого приравнивания дрожащее приземление: если игрок следующим смещением коснется пола, он останавливается, а потом снова начинает падать, пока не коснется
    }
    if(loadedPos) {pos=loadedPos; loadedPos=false; xSpeed=0; ySpeed=0; needRefresh=true;}	// xSpeed=0; ySpeed=0; для того чтобы скорость после загрузки не сохранялась, а то можно бесконечно взлетать
    playerPos='pos:,'+pos.x+','+pos.y;
    if(myID && socket.readyState==1 && hasTrue(this.speed)) socket.send('pos:,'+pos.x+','+pos.y);
    return new Player(pos, new Vec(xSpeed, ySpeed));
  };
}

class Lava {
  constructor(pos, speed, reset) {
    this.pos = pos;
    this.speed = speed;
    this.reset = reset;
    this.size = new Vec(1, 1);
  }

  get type() { return "lava"; }

  static create(pos, ch) {
    if (ch == "=") {
      return new Lava(pos, new Vec(2, 0));
    } else if (ch == "|") {
      return new Lava(pos, new Vec(0, 2));
    } else if (ch == "v") {
      return new Lava(pos, new Vec(0, 3), pos);
    }
  }

  collide(state) {
    return new State(state.level, state.actors, "lost");
  };
  update(time, state) {
    let newPos = this.pos.plus(this.speed.times(time));
    if(!state.level.touches(newPos, this.size, "wall")) {
      return new Lava(newPos, this.speed, this.reset);
    } else if (this.reset) {
      return new Lava(this.reset, this.speed, this.reset);
    } else {
      return new Lava(this.pos, this.speed.times(-1));
    }
  };
}

class Coin {
  constructor(pos, basePos, wobble) {
    this.pos = pos;
    this.basePos = basePos;
    this.wobble = wobble;
    this.size = new Vec(0.6, 0.6);
  }

  get type() { return "coin"; }

  static create(pos) {
    let basePos = pos.plus(new Vec(0.2, 0.1));
    return new Coin(basePos, basePos,
                    Math.random() * Math.PI * 2);
  }

  collide(state) {
    let filtered = state.actors.filter(a => a != this);
    let status = state.status;
    if (!filtered.some(a => a.type == "coin")) status = "won";	// если монет не осталось
    state = new State(state.level, filtered, status);
    collectedCoins+=this.basePos.x+','+this.basePos.y+',';
    if(myID && socket.readyState==1) socket.send('collectedCoins:'+collectedCoins);	// отправить список собранных монет
    return state;
  };
  update(time) {
    let wobble = this.wobble + time * wobbleSpeed;
    let wobblePos = Math.sin(wobble) * wobbleDist;
    return new Coin(this.basePos.plus(new Vec(0, wobblePos)), this.basePos, wobble);
  };
}

let simpleLevelPlan = [`
......................
..#................#..
..#..............=.#..
..#.........o.o....#..
..#.@......#####...#..
..#####............#..
......#++++++++++++#..
......##############..
......................`];

const levelChars = {".": "empty", "#": "wall", "+": "lava", "@": Player, "o": Coin, "=": Lava, "|": Lava, "v": Lava};
const wobbleSpeed = 8, wobbleDist = 0.07;
let playerXSpeed = 7;
let gravity = 30;
let jumpSpeed = 17;
let trackedKeys = trackKeys(["ArrowLeft", "ArrowRight", "ArrowUp"]);

function overlap(actor1, actor2) {
  return actor1.pos.x + actor1.size.x > actor2.pos.x && actor1.pos.x < actor2.pos.x + actor2.size.x && actor1.pos.y + actor1.size.y > actor2.pos.y && actor1.pos.y < actor2.pos.y + actor2.size.y;
}

function trackKeys(keys) {
  let down = Object.create(null);
  function track(event) {
    if (keys.includes(event.key)) {
      down[keys.indexOf(event.key)] = event.type == "keydown";
      event.preventDefault();
    }
  }
  window.addEventListener("keydown", track);
  window.addEventListener("keyup", track);
  return down;
}

function runAnimation(frameFunc) {
  let lastTime = null;
  function frame(time) {
    if(lastTime != null) {
      let timeStep = Math.min(time - lastTime, 100) / 1000;	// не больше 100, чтобы расчеты остановились, пока открыто другое окно
      if(frameFunc(timeStep) === false) return;
    }
    lastTime = time;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function runLevel(level, Display, levelnum) {
  let display = new Display(document.getElementsByClassName('gameScreen')[0], level);
  let state = State.start(level);
  let ending = 1;

  function calculateViewport() {	// посчитать размеры видимой области заново
    viewportWidth = (fullscreenOn) ? document.documentElement.clientWidth : document.querySelector('.nameofgame').parentNode.clientWidth;
    viewportHeight = (fullscreenOn) ? document.documentElement.clientHeight : document.querySelector('.nameofgame').parentNode.clientHeight;
    needRestartLevel=needRefresh=true;
  }
  window.screen.orientation.onchange=calculateViewport;		// при повороте экрана
  document.querySelector('.setScreenSize').onchange=(e)=>{	// при разворачивании на весь экран
    fullscreenOn=e.target.checked;
    document.querySelector('.nameofgame').style.position=(fullscreenOn) ? 'fixed' : 'relative';
    calculateViewport();
  };

  return new Promise(resolve => {
    runAnimation(time => {
      if(needRefresh) {		// если нужно обновить экран
        if(levelnum!=levelnumber || needRestartLevel) {		// если текущий уровень не актуальный
          needRestartLevel=false;
          display.clear();
          resolve(levelnumber);			// выйти из уровня с информацией о том, какой актуальный
          return false;
        }
        let filtered = state.actors.filter(a =>!a.basePos).concat(
          State.start(level).actors.filter(a => {		// проверить каждого actor даже уже убранных, т.к. игра могла быть загружена или присоединена
            if(!a.basePos) return false;			// если actor не имеет basePos он остается в игре
            let keep=true;
            let actorPos=collectedCoins.split(",");
            for(let i=actorPos.length-3; i>=0; i-=2) {
              if(a.basePos.x==actorPos[i] && a.basePos.y==actorPos[i+1]) {	// если координаты монеты совпадают с координатыми монеты, которую нужно убрать
                keep=false;							// убрать эту монету
                actorPos.splice(i, 2);					// убрать эти координаты из списка, чтобы больше не проверять
              }
            }
            return keep;
          })
        );
        state=new State(state.level, filtered, state.status);	// обновить статус
      }//end of if
      state = state.update(time, trackedKeys);
      display.syncState(state);
      needRefresh=false;
			localStorage.nameOfGame
      if(state.status == "playing") {
        return true;
      } else if (ending > 0) {
        ending -= time;
        return true;
      } else if(state.status=="lost" && (!socket || socket.readyState!=1) && localStorage.nameOfGame && localStorage.nameOfGame.split(';')[0]==levelnumber) {	// если проиграл, игра не по сети и в этом уровне есть сохранение, то оно загрузится
        state.status="playing";		// вариант, при котором проигрыш загружает сохранение
        ending = 1;
        loadGame();
        return true;
      } else {				// если убрать предыдущий else if, то будет работать вариант, при котором проигрыш всегда возвращает к началу уровня
				if(!socket || socket.readyState!=1) collectedCoins='';	// если не включен мултиплеер
        display.clear();
        resolve(state.status);
        return false;
      }
    });

    setTimeout(()=>{needRefresh=true;}, 200);	//актуализировать уровень для присоединившихся вернувшихся к вкладке с игрой
  });
}

async function runGame(plans, Display) {
  for(let levelnum = 0; levelnum < plans.length;) {
    let status = await runLevel(new Level(plans[levelnum]), Display, levelnum);
    if(status == "won") {
      levelnumber=++levelnum;
      if(localStorage.achievedLevel<levelnumber) localStorage.achievedLevel=levelnumber;
      collectedCoins='';			// очистить список собранных монет
      if(myID && socket.readyState==1) socket.send('levelnum:'+levelnum);	// обновить на сервере информацию об актуальном уровне
    } else if(!isNaN(status)) {		// если вернулось число
      levelnum=status;			// установить уровень по этому числу
      if(myID && socket.readyState==1) socket.send('levelnum:'+levelnum);	// обновить на сервере информацию об актуальном уровне
    }
  }
  notice(`<div data-lang-en="You've won!" data-lang-ru="Победа!" lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 5000);	
}

function saveGame(e) {
  localStorage.nameOfGame=levelnumber+';'+collectedCoins+';'+playerPos;
};
function loadGame(e) {
  nameOfGameData=localStorage.nameOfGame.split(';');
  levelnumber=nameOfGameData[0];
  collectedCoins=nameOfGameData[1];
  let pos=nameOfGameData[2].split(',');
  loadedPos=new Vec(Number(pos[1]), Number(pos[2]));
  needRefresh=true;
  if(myID && socket.readyState==1) {
    socket.send('levelnum:'+levelnumber);
    socket.send('collectedCoins:'+collectedCoins);
    socket.send(playerPos);
  }
};

	//CANVAS

const scale = 20;
const playerXOverlap = 4;

const playerSprites = [];
for(let i=0; i<4; i++) {
  playerSprites[i]=new Image();
  playerSprites[i].src = "img/player"+i+".png";
}
let spriteNumber=0;		// номер моего спрайта

const otherSprites = {
  wall:new Image(),
  lava:new Image(),
  coin:new Image()
};
otherSprites.wall.src = "img/wall.png";
otherSprites.lava.src = "img/lava.png";
otherSprites.coin.src = "img/coin.png";

const background = new Image();
background.src='img/Koala.jpg';

function flipHorizontally(context, around) {	// разворот спрайта
  context.translate(around, 0);
  context.scale(-1, 1);
  context.translate(-around, 0);
}

function hasTrue(o) {				// есть ли у объекта свойства с ненулевыми значениями
  for(let i in o) if(o[i]) return true;
  return false;
}

function dragNdropDefaultFunction(e) {
  e.preventDefault();
  e.stopPropagation();
}
window.ondragenter=dragNdropDefaultFunction;
window.ondragleave=dragNdropDefaultFunction;
window.ondragover=dragNdropDefaultFunction;
let container;
class CanvasDisplay {
  constructor(parent, level) {
    parent.innerHTML=null;				// очистить содержимое родительского тега
    this.canvas = document.createElement("canvas");
    parent.appendChild(this.canvas);
    this.lw=level.width;
    this.canvas.width = Math.min(viewportWidth, level.width * scale);
    this.canvas.height = Math.min(viewportHeight, level.height * scale);
    document.querySelector('.controlPanel').style.width=this.canvas.width+'px';		// установить размеры панели управления по размеру уровня
    document.querySelector('.controlPanel').style.height=this.canvas.height+'px';
    this.canvas.style.cssText="position:absolute; z-index:0";
    this.cx = this.canvas.getContext("2d");

    this.flipPlayer = false;

    //create canvas for background
    background.scale=(background.width-this.canvas.width)/(level.width-this.canvas.width/scale);
    if(background.scale==Infinity) background.scale=0;
    this.canvasBack = document.createElement("canvas");
    this.canvasBack.width=this.canvas.width;
    this.canvasBack.height=this.canvas.height;
    this.canvasBack.style.cssText='position:absolute; z-index:-1';
    parent.appendChild(this.canvasBack);
    this.cxBack = this.canvasBack.getContext("2d");

    this.viewport = {
      left: 1,
      top: 0,
      width: this.canvas.width / scale,
      height: this.canvas.height / scale
    };
  }

  clear() {
    this.canvas.remove();
  }
  syncState(state) {
    this.clearDisplay(state.status);
    this.updateViewport(state);
    this.drawActors(state.actors);
  };

  updateViewport(state) {
    let player = state.player;
    if(hasTrue(player.speed) || needRefresh) {
      let view = this.viewport, marginWidth = view.width / 3, marginHeight = view.height / 3;
      let center = player.pos.plus(player.size.times(0.5));

      let newLeft, newTop;
      if(center.x < view.left + marginWidth) {
        newLeft = Math.max(center.x - marginWidth, 0);
      } else if (center.x > view.left + view.width - marginWidth) {
        newLeft = Math.min(center.x + marginWidth - view.width, state.level.width - view.width);
      }
      if(newLeft!=undefined && view.left!=newLeft) {
        view.left = newLeft;
        this.drawBackground(state.level);
      }
      if(center.y < view.top + marginHeight) {
        newTop = Math.max(center.y - marginHeight, 0);
      } else if (center.y > view.top + view.height - marginHeight) {
        newTop = Math.min(center.y + marginHeight - view.height, state.level.height - view.height);
      }
      if(newTop!=undefined && view.top!=newTop) {
        view.top = newTop;
        this.drawBackground(state.level);
      }
    }
    this.canvas.ondragenter=(e)=>{
      this.canvasBack.style.opacity='0.5';
    }
    this.canvas.ondragleave=(e)=>{
      this.canvasBack.style.opacity='1';
    }
    this.canvas.ondrop=(e)=>{				// если на холст перенесено новое изображение
      this.canvasBack.style.opacity='1';
      let display=this;
      dragNdropDefaultFunction(e);
      let reader = new FileReader();
      reader.readAsDataURL(e.dataTransfer.files[0]);
      reader.onloadend=()=>{				// когда данные файла будут прочитаны
        document.querySelector('.backgroundSprite').querySelector('img').src = background.src = reader.result;
        background.onload = function() {		// когда файл будет загружен
          background.scale=(background.width-display.canvas.width)/(state.level.width-display.canvas.width/scale);	// посчитать масштаб
          display.drawBackground(state.level);
        }
      }
    };
  };
  clearDisplay(status) {
/*							// реакция цвета фона на победу/поражение
    if(status == "won") {
      this.cx.fillStyle = "rgb(68, 191, 255)";
    } else if (status == "lost") {
      this.cx.fillStyle = "rgb(44, 136, 214)";
    } else {
      this.cx.fillStyle = "rgb(52, 166, 251)";
    }
    this.cx.fillRect(0, 0, this.canvas.width, this.canvas.height);
*/
    this.cx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  drawBackground(level) {
    let {left, top, width, height} = this.viewport;
    let xStart = Math.floor(left);
    let xEnd = Math.ceil(left + width);
    let yStart = Math.floor(top);
    let yEnd = Math.ceil(top + height);

    if(background.width<width*scale || background.height<height*scale) {	// если фон меньше уровня
      this.cxBack.clearRect(0, 0, width*scale, height*scale);
      this.cxBack.fillStyle=this.cxBack.createPattern(background, "repeat");
      this.cxBack.fillRect(0, 0, width*scale, height*scale);
    } else {
      this.cxBack.drawImage(background,
                            // source rectangle
                            left*background.scale, top*background.scale, width*scale, height*scale,	// если надо растянуть фон на весь уровень, то (background.scale=background.width/level.width) и (view.left*background.scale, view.top*background.scale, view.width*background.scale, view.height*background.scale,)
                            // destination rectangle
                            0, 0, width*scale, height*scale
      );
    }

    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        let tile = level.rows[y][x];
        if(tile == "empty") continue;
        let screenX = (x - left) * scale;
        let screenY = (y - top) * scale;
        this.cxBack.drawImage(otherSprites[tile],
                              0, 0, otherSprites[tile].width, otherSprites[tile].height,
                              screenX, screenY, scale, scale
        );
      }
    }
  };
  drawPlayer(player, x, y, width, height) {
    width += playerXOverlap * 2;
    x -= playerXOverlap;
    if(player.speed.x != 0) {
      this.flipPlayer = player.speed.x < 0;
    }

    let tile = 8;
    if(player.speed.y != 0) {
      tile = 9;
    } else if (player.speed.x != 0) {
      tile = Math.floor(Date.now() / 60) % 8;
    }

    this.cx.save();
    if(this.flipPlayer) {
      flipHorizontally(this.cx, x + width / 2);
    }
    let tileX = tile * width;	// потому что неподвижное положение начинается с 9го спрайта
    this.cx.drawImage(playerSprites[spriteNumber],
                      tileX, 0, width, height,
                      x, y, width, height
    );
    this.cx.restore();
  };
  drawActors=(function(actors) {
    // применение кода в зависимости от устройства
    if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|BB|PlayBook|IEMobile|Windows Phone|Kindle|Silk|Opera Mini/i.test(navigator.userAgent)) {return function(actors) {
      for (let actor of actors) {
        let width = actor.size.x * scale;
        let height = actor.size.y * scale;
        let x = (actor.pos.x - this.viewport.left) * scale;
        let y = (actor.pos.y - this.viewport.top) * scale;
        if(actor.type == "player") {
          this.drawPlayer(actor, x, y, width, height);
        } else {
          this.cx.drawImage(otherSprites[actor.type],
                            0, 0, otherSprites[actor.type].width, otherSprites[actor.type].height,
                            x, y, width, height
          );
        }
      }
      for(let op of otherPlayers.values()) {
        let x=(op.pos.x-this.viewport.left)*scale-playerXOverlap;
        this.cx.save();
        if(op.prevPos.x>op.pos.x) flipHorizontally(this.cx, x+12);
        this.cx.drawImage(op.img,
                          120, 0, 24, 30,
                          x, (op.pos.y-this.viewport.top)*scale, 24, 30
        );
        this.cx.restore();
      }
    }} else {return function(actors) {
      for (let actor of actors) {
        let width = actor.size.x * scale;
        let height = actor.size.y * scale;
        let x = (actor.pos.x - this.viewport.left) * scale;
        let y = (actor.pos.y - this.viewport.top) * scale;
        if(actor.type == "player") {
          this.drawPlayer(actor, x, y, width, height);
        } else {
          this.cx.drawImage(otherSprites[actor.type],
                            0, 0, otherSprites[actor.type].width, otherSprites[actor.type].height,
                            x, y, width, height
          );
        }
      }
      for(let op of otherPlayers.values()) {
        let x=(op.pos.x-this.viewport.left)*scale-playerXOverlap;
        let tile = 8;
        if (op.prevPos.x!=op.pos.x) {
          tile = Math.floor(Date.now() / 60) % 8;
          if(op.prevPos.x>op.pos.x) op.flipPlayer=true;	// если новая позиция меньше предыдущей - нужно повернуть направление влево
          else op.flipPlayer=false;			// если больше - вправо, иначе оставить то, что было
        }
        if(op.prevPos.y!=op.pos.y) {
          tile = 9;
        }
        this.cx.save();
        if(op.flipPlayer) {
          flipHorizontally(this.cx, x+12);
        }
        let tileX = tile * 24;
        this.cx.drawImage(op.img,
                          tileX, 0, 24, 30,
                          x, (op.pos.y-this.viewport.top)*scale, 24, 30
        );
        this.cx.restore();
      }
    }}
  })();
}

// Обработчики событий меню
  function notice(text, time, timer) {
    let div=document.createElement('div');
    if(!timer) {
      div.innerHTML=text;
    } else {						// если включен отсчет времени
      let start=new Date().getSeconds()+time/1000;
      let interval=setInterval(()=>{
        let timeLeft=start-new Date().getSeconds();
        div.innerHTML=text+timeLeft;
      }, 1000);
    }
    div.className='notice';
    div.style.visibility='visible';
    document.querySelector('.controlPanel').appendChild(div);
    if(time) setTimeout(()=>{		// если указано время, то закрыть, спустя это время
      div.remove();
      if(typeof(interval)!="undefined") clearInterval(interval);	// проверка существования переменной
    }, time);
    return div;
  }

window.onload=()=>{
  runGame(GAME_LEVELS, CanvasDisplay);		// GAME_LEVELS, simpleLevelPlan
  window.onfocus=()=>(needRefresh=true);	// если окно вернуло фокус изменить состояние переменной

  document.querySelector('.nameofgame').scrollIntoView({block:"start", inline:"start"});	// отценровать левые края экрана по левым краям игры

  document.querySelectorAll('.gameMenu > li').forEach(el=>{
    el.onclick=(e)=>{
      if(e.target.firstElementChild && e.target.parentNode.className=='gameMenu') {
        document.querySelectorAll('.gameMenu > li').forEach(el=>el.firstElementChild.style.display='none');
        e.target.firstElementChild.style.display='block';
        e.target.firstElementChild.querySelectorAll('li').forEach(el=>el.style.display='block')
      }
    };
  });

  document.querySelector('.chooseLevel').onmouseover=(e)=>{
    if(e.target.innerText.includes('Choose level')) {
      e.target.firstElementChild.innerText='';
      for(let i=localStorage.achievedLevel; i>=0; i--) {
        let li=document.createElement('li');
        li.innerHTML=i;
        li.onclick=(e)=>{
          levelnumber=i;
          collectedCoins='';
          needRefresh=true;
          needRestartLevel=true;
        }
        e.target.firstElementChild.appendChild(li);;
      }
    }
  };

  let imageCounter=(function() {	// временная (пока у каждого игрока не будет индивидуальной картинки) функция для присваивания каждому игроку разных картинок
    let counter=0;
    return function() {
      return counter++%4;
    }
  })();

  document.querySelector('.menuButton').style.visibility='visible';
  document.querySelector('.menuButton').onclick=(e)=>{				//нажать на меню, чтобы открыть меню
    let menu=document.querySelector('.gameMenu')
    menu.style.visibility='visible';
    menu.style.width=menu.style.height='auto';
  };
  document.addEventListener('click', (e)=>{	//нажать на холст меню, чтобы закрыть меню
    if(e.target.tagName=='CANVAS') {
      let menu=document.querySelector('.gameMenu')
      menu.style.visibility='hidden';
      menu.style.width=menu.style.height=0;
    }
  }, false);

  document.querySelector('.registrationInput').onchange=(e)=>{	// обработка регистрации
    myID=e.target.value;
    e.target.value=null;
    if(socket && socket.readyState==1) socket.close();
    socket = new WebSocket('ws'+window.location.origin.substring(4));
    socket.onerror = (err)=>console.log('Ошибка '+err.message);
    socket.onclose = (e)=>console.log(socket.readyState+' Код: '+e.code+' причина: '+e.reason);
    socket.onopen = (e)=>{
      console.log(e.type);
      socket.send('addLogin:'+myID);
      socket.send('levelnum:'+levelnumber);
      socket.send('collectedCoins:'+collectedCoins);
      socket.send(playerPos);

      // активация аудиосвязи
      if(navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia({audio:true})
          .then((stream)=>{
            rec = new MediaRecorder(stream, {mimeType: `audio/webm;codecs=opus`});
            let data=[];
            rec.ondataavailable=(e)=>{
              if(e.data && e.data.size > 0) {
                data.push(e.data);
                if(rec.state=='recording') {
                  rec.stop();
                  rec.start(1000);
                }
              }
            }
            rec.onstop=(e)=>{
              if(data.length>1) {
                socket.send(new Blob(data, {'type':'audio/webm; codecs=opus'}));
                data=[];
              }
            }
            rec.onerror=(e)=>{throw e.error || new Error(e.name);}
          })
          .catch(err=>console.log(err.message));
      } else {
        alert("This browser doesn't support audioconnection");
      }
    }
    socket.onmessage=(e)=>{
      //console.log(e.data);
      if((typeof e.data)=='object') {		// если объект, если сообщение - объект, пока объекты только аудио
        let audio=new Audio(window.URL.createObjectURL(e.data));
        audio.type='audio/webm';
        audio.play();
        audio.onended=(e)=>{delete e.target};
      } else if(e.data.includes('pos:')) {
        let a=e.data.split(',');
          if(!otherPlayers.has(a[0])) {
            let parameters={
              pos:{x:a[2],y:a[3]},
              prevPos:{x:a[2],y:a[3]},
              size:new Vec(0.8, 1.5),
              img:new Image()
            }
            parameters.img.src='img/player'+imageCounter()+'.png';
            if(parameters.img.src==playerSprites[spriteNumber].src) parameters.img.src='img/player'+imageCounter()+'.png';
            otherPlayers.set(a[0], parameters);
          } else {
            otherPlayers.get(a[0]).prevPos=otherPlayers.get(a[0]).pos;
            otherPlayers.get(a[0]).pos={x:a[2],y:a[3]};
            setTimeout((last)=>{
              if(last==otherPlayers.get(a[0]).pos) otherPlayers.get(a[0]).prevPos=otherPlayers.get(a[0]).pos;		// если спустя 180 секунд позицияи не изменится, то приравнять предыдущую позицию к текущей
            }, 180, otherPlayers.get(a[0]).pos);
          }
      } else if(e.data.includes('gamestate:')) {
        let lastComma=e.data.lastIndexOf(',')
        if(lastComma===-1) {
          collectedCoins='';
          levelnumber=e.data.substring(10);
        } else {
          collectedCoins=e.data.substring(10, e.data.lastIndexOf(',')+1);
          levelnumber=e.data.substring(e.data.lastIndexOf(',')+1);
        }
        needRefresh=true;
      } else if(e.data.includes('chat:')) {
        const chat=document.querySelector('.chat');
        chat.innerHTML+=`<br>${e.data.substring(5)}`;
        chat.scrollTop=chat.scrollHeight;
      } else if(e.data.includes('join:')) {
        let user=e.data.substring(5);
        let div=notice(`<div data-lang-en='"${user}" wants to join your game' data-lang-ru='"${user}" хочет присоединиться к вашей игре' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div><br /><div class='accept row active' data-lang-en='accept' data-lang-ru='согласиться' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div><div class='reject row active' data-lang-en='reject' data-lang-ru='отказаться' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 15000);
        div.querySelector('.accept').onclick=(e)=>{
          socket.send('acceptConnection:'+user);
          e.target.parentNode.remove();
        };
        div.querySelector('.reject').onclick=(e)=>{
          socket.send('rejectConnection:'+user);
          e.target.parentNode.remove();
        };
      } else if(e.data.includes('invite:')) {
        let user=e.data.substring(7);
        let div=notice(`<div data-lang-en='"${user}" invites you to game' data-lang-ru='"${user}" приглашает вас в свою игру' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div><br /><div class='accept row active' data-lang-en='accept' data-lang-ru='согласиться' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div><div class='reject row active' data-lang-en='reject' data-lang-ru='отказаться' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 15000);
        div.querySelector('.accept').onclick=(e)=>{
          socket.send('acceptInvitation:'+user);
          e.target.parentNode.remove();
        };
        div.querySelector('.reject').onclick=(e)=>{
          socket.send('rejectConnection:'+user);
          e.target.parentNode.remove();
        };
      } else if(e.data.includes('accept:')) {
        document.querySelector('.notice').remove();
        notice(`<div data-lang-en='"${e.data.substring(7)}" accepted connection' data-lang-ru='"${e.data.substring(7)}" принял соединение' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 2000);
      } else if(e.data.includes('reject:')) {
        document.querySelector('.notice').remove();
        notice(`<div data-lang-en='"${e.data.substring(7)}" rejected connection' data-lang-ru='"${e.data.substring(7)}" отказался от соединения' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 3000);
      } else if(e.data.includes('leave:')) {
        otherPlayers.delete(e.data.substring(6));	// удалить ушедшего игрока из списка
        notice(`<div data-lang-en='"${e.data.substring(6)}" left your room' data-lang-ru='"${e.data.substring(6)}" покинул вашу комнату' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 3000);
      } else if(e.data.includes('users:')) {
        let data=e.data.substring(6);
        if(data=='false') {
          document.querySelector('.registrationInput').placeholder='Try another login';
        } else if(data.length){
          document.querySelector('.chat').style.visibility='visible';
        //построение таблицы
          let o={};	// объект для подсчета кол-ва игроков в каждой комнате, чтобы определить, какая комната заполнена
          let splittedData=data.split(';');
          let myRoom;
          let iBlockedBy;
          let usersTable=document.querySelector('.usersTable');
          for(let userData of splittedData) {
            userData=userData.split(':');
            o[userData[1]]=++o[userData[1]]||1;		// если это свойство уже есть, увеличить кол-во, иначе установить ноль
            if(userData[0]==myID) {
              myRoom=userData[1];	// определить, которая комната моя
              iBlockedBy=new Set(userData[3].split(','));	// определить кем я заблокирован
            }
            //users.push({login:userData[0], room:userData[1]});
          }
          usersTable.innerHTML=null;
          for(let userData of splittedData) {
            userData=userData.split(':');
            if(userData[0]!=myID) {
              let join, quantity, blockage, blocked;
              if(o[userData[1]]<4) {
                join=`<div class='join' data-lang-en='join to ' data-lang-ru='присоединиться к '>"${userData[1]}"</div>`;
                quantity=o[userData[1]];
              } else {
                join='';
                quantity='max';
              }
              let invite=(o[myRoom]==4) ? '' : `<div class='invite' data-lang-en='invite ' data-lang-ru='пригласить '>"${userData[0]}"</div>`;
              let blockedFor=new Set(userData[3].split(','));
              if(blockedFor.has(myID)) {
                blocked=0;
                blockage=`<div class='blockage' data-lang-en='unblock' data-lang-ru='разблокировать'></div>`;
              } else {
                blocked=1;
                blockage=`<div class='blockage' data-lang-en='block' data-lang-ru='заблокировать'></div>`;
              }
              let tr=document.createElement('tr');
              usersTable.appendChild(tr);
              tr.innerHTML+=`<td>${userData[0]}</td><td>${userData[1]}</td><td>${quantity}</td><td>${userData[2]}</td>`;
              if(iBlockedBy.has(userData[0])) {		// если я заблокирован этим игроком
                tr.onclick=()=>notice(`<div data-lang-en='"${userData[0]}" blocked connection' data-lang-ru='"${userData[0]}" заблокировал соединение' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 1000);
              } else {					// если я не заблокирован этим игроком
                tr.className='active';
                tr.onclick=()=>{return (function(e, join, invite, name, room) {
                  usersTable.style.setProperty('pointer-events', 'none');	// заблокировать все меню
                  let div=document.createElement('div');
                  document.querySelector('.controlPanel').appendChild(div);
                  div.className='connectionDialog';
                  div.style.visibility='visible';
                  if(userData[1]!=myRoom) {		// если это не моя комната
                    div.innerHTML=`${join}${invite}<div class='call'>"${userData[0]}"</div>${blockage}<div class='cancel' data-lang-en='cancel' data-lang-ru='отмена'></div>`;
                    div.querySelector('.join').onclick=(e)=>{
                      socket.send('join:'+room);
                      e.target.parentNode.remove();
                      usersTable.style.setProperty('pointer-events', 'auto');
                      notice(`<div data-lang-en='waiting for reply ' data-lang-ru='ожидание ответа ' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 15000, true);
                    };
                    div.querySelector('.invite').onclick=(e)=>{
                      socket.send('invite:'+name);
                      e.target.parentNode.remove();
                      usersTable.style.setProperty('pointer-events', 'auto');
                      notice(`<div data-lang-en='waiting for reply ' data-lang-ru='ожидание ответа ' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 15000, true);
                    };
                  } else {				// если это комната, в которой я играю
                    div.innerHTML=`<div class='call'>"${userData[0]}"</div>`;
                    if(userData[0]!=myRoom) div.innerHTML+=blockage;	// если он не хозяин комнаты, в которой я играю
                    div.innerHTML+=`<div class='cancel' data-lang-en='cancel' data-lang-ru='отмена'></div>`;
                    if(myID==myRoom) {
                      div.innerHTML=`<div class='expel' data-lang-en='expel ' data-lang-ru='выгнать '>"${name}"</div>`+div.innerHTML;	// если это моя комната
                      div.querySelector('.expel').onclick=(e)=>{
                        socket.send('expel:'+name);
                        e.target.parentNode.remove();
                        usersTable.style.setProperty('pointer-events', 'auto');
                      };
                    }
                  }
                  div.querySelectorAll('*').forEach(e=>e.setAttribute('lang', document.querySelector('[lang]').getAttribute('lang')));	// установить узлам элементам текущий язык игры
                  if(conversators.has(userData[0])) {	// если игрок есть в списке тех, с кем ведется разговор
                    if(conversators.get(userData[0])) {	// и разговор с ним ведется
                      div.querySelector('.call').setAttribute('data-lang-en', 'stop converstation with ');
                      div.querySelector('.call').setAttribute('data-lang-ru', 'завершить разговор с ');
                    } else {				// если я жду пока он возьмет трубку
                      div.querySelector('.call').setAttribute('data-lang-en', 'calling to ');
                      div.querySelector('.call').setAttribute('data-lang-ru', 'идет дозвон к ');
                    }
                  } else {				// если игрока нет в списке тех, с кем ведется разговор
                    div.querySelector('.call').setAttribute('data-lang-en', 'start converstation with ');
                    div.querySelector('.call').setAttribute('data-lang-ru', 'начать разговор с ');
                  }
                  div.querySelector('.call').onclick=(e)=>{
                    if(conversators.has(userData[0])) {		// если игрок есть в списке тех, с кем ведется разговор
                      if(conversators.get(userData[0])) {	// и разговор с ним ведется
                        socket.send('closeConversation:'+userData[0]);
                        conversators.delete(userData[0]);
                        if(conversators.size==0) rec.stop();
                      }
                    } else {					// если игрока нет в списке тех, с кем ведется разговор
                      socket.send('inviteConversation:'+userData[0]);
                      conversators.set(userData[0], false);
                    }
                    e.target.parentNode.remove();
                    usersTable.style.setProperty('pointer-events', 'auto');
                  };
                  if(div.querySelector('.blockage')) div.querySelector('.blockage').onclick=(e)=>{
                    socket.send('blocked:'+blocked+name);
                    e.target.parentNode.remove();
                    usersTable.style.setProperty('pointer-events', 'auto');
                  };
                  div.querySelector('.cancel').onclick=(e)=>{
                    e.target.parentNode.remove();
                    usersTable.style.setProperty('pointer-events', 'auto');
                  };
                })(e, join, invite, userData[0], userData[1], blocked)};
              }//конец if
              for(let n=document.querySelectorAll('th').length-1; n>=0; n--) {	// сортировщик таблицы
                document.querySelectorAll('th')[n].onclick=(function() {
                  let switcher=true;
                  return function(e) {
                    let tbody=e.target.parentNode.parentNode;
                    let trs=tbody.children;
                    if(switcher) {
                      for(let i=1, endI=trs.length; i<endI; i++) {
                        for(let j=1, endJ=endI-i; j<endJ; j++) {
                          if(trs[j].children[n].innerHTML>trs[j+1].children[n].innerHTML) tbody.insertBefore(trs[j+1], trs[j])
                        }
                      }
                    } else {
                      for(let i=1, endI=trs.length; i<endI; i++) {
                        for(let j=1, endJ=endI-i; j<endJ; j++) {
                          if(trs[j].children[n].innerHTML<trs[j+1].children[n].innerHTML) tbody.insertBefore(trs[j+1], trs[j])
                        }
                      }
                    }
                    switcher=!switcher;
                  };
                })();
              }
            }
          }
        }//конец постоения таблицы
      //конец 'users:'

      //уведомления об аудиосвязи
      } else if(e.data.includes('inviteConversation:')) {
        let user=e.data.substring(19);
        let div=notice(`<div data-lang-en='"${user}" calls' data-lang-ru='звонок от "${user}"' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div><br /><div class='accept row active' data-lang-en='accept' data-lang-ru='принять' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div><div class='reject row active' data-lang-en='reject' data-lang-ru='отклонить' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 15000);
        div.querySelector('.accept').onclick=(e)=>{
          socket.send('acceptConversation:'+user);
          conversators.set(user, true);
          e.target.parentNode.remove();
          if(rec.state!='recording') rec.start(1000);
        };
        div.querySelector('.reject').onclick=(e)=>{
          socket.send('rejectConversation:'+user);
          e.target.parentNode.remove();
        };
      } else if(e.data.includes('acceptConversation:')) {
        let who=e.data.substring(19);
        let divcall=document.querySelector('.call');
        if(divcall && divcall.innerHTML.slice(1,-1)==who) {
          divcall.setAttribute('data-lang-en', 'stop converstation with ');
          divcall.setAttribute('data-lang-ru', 'завершить разговор с ');
        };
        conversators.set(who, true);
        if(rec.state!='recording') rec.start(1000);
      } else if(e.data.includes('rejectConversation:')) {
        let who=e.data.substring(19);
        let divcall=document.querySelector('.call');
        if(divcall && divcall.innerHTML.slice(1,-1)==who) {
          divcall.setAttribute('data-lang-en', 'start converstation with ');
          divcall.setAttribute('data-lang-ru', 'начать разговор с ');
        };
        notice(`<div data-lang-en='"${who}" rejected conversation' data-lang-ru='"${who}" не принимает звонок' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 3000);
      } else if(e.data.includes('closeConversation:')) {
        notice(`<div data-lang-en='"${e.data.substring(18)}" closed conversation' data-lang-ru='"${e.data.substring(18)}" завершил звонок' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 3000);
        conversators.delete(e.data.substring(18));
        if(conversators.size==0) rec.stop();
      }
    };
  };
  document.querySelector('.disconnect').onclick=(e)=>{
    socket.close();
    document.querySelector('.usersTable').innerHTML=null;
    otherPlayers.clear();
    document.querySelector('.chat').style.visibility='hidden';
  };
  document.querySelector('.blockall').onclick=(e)=>{
    if(e.target.getAttribute('data-lang-en')=='block all') {
      e.target.setAttribute('data-lang-en', 'unblock all');
      e.target.setAttribute('data-lang-ru', 'разблокировать всех');
      socket.send('blockall:1');
    } else {
      e.target.setAttribute('data-lang-en', 'block all');
      e.target.setAttribute('data-lang-ru', 'заблокировать всех');
      socket.send('blockall:0');
    }
  };
  document.querySelector('.save').onclick=saveGame;
  document.querySelector('.load').onclick=loadGame;
  document.onkeydown=(e)=>{
    switch(e.key) {
      case 'F5':
               e.preventDefault();
               saveGame();
               notice(`<div data-lang-en='game saved' data-lang-ru='игра сохранена' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 1000);
               break;
      case 'F9':
               e.preventDefault();
               loadGame();
               break;
    }
  }

  for (let i=0; i<4; i++) {
    let skinSetter=document.querySelectorAll('.setSkin')[i];
    skinSetter.width=24;
    skinSetter.height=30;
    let cx=skinSetter.getContext("2d");
    cx.drawImage(playerSprites[i],
                     192, 0, 24, 30,
                      0, 0, 24, 30
    );
    skinSetter.onclick=(e)=>{spriteNumber=i};
  }

  function setImage(spriteName, e, source) {			// установить загруженное изображение вместо стандартного и поменять в меню
    let reader = new FileReader();
    reader.onloadend=()=>{
      if(spriteName=='background') background.src = reader.result;	// замена фона для мобильной версии
      else otherSprites[spriteName].src = reader.result;
      if(e.target.firstElementChild) e.target.firstElementChild.src = reader.result;
      else e.target.src = reader.result;
    };
    if(source.type.substring(0,5)=='image') reader.readAsDataURL(source);
    else notice(`<div data-lang-en='need to choose an image' data-lang-ru='нужно выбрать изображение' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 3000);
  }

  document.querySelectorAll('.setSprite').forEach(element=>{
    let spriteName=element.getAttribute('elem');
    let loadFile=(e)=>{
      let f=document.createElement("input");
      f.type="file";
      f.onchange=()=>setImage(spriteName, e, f.files[0]);
      document.body.appendChild(f);
      f.click();
      f.remove();
    };

    element.onclick=(e)=>{					//нажатие на элемент, позволит загрузить новое изображение
      notice(`<div data-lang-en='drag or choose image for "${element.previousElementSibling.getAttribute('data-lang-en')}"' data-lang-ru='перетащите или выберите изображение для "${element.previousElementSibling.getAttribute('data-lang-ru')}"' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 3000);
      loadFile(e);
    }
    element.ondragenter=(e)=>{
      e.target.style.backgroundColor='#69e';
    }
    element.ondragleave=(e)=>{
      e.target.style.backgroundColor='#369';
    }
    element.ondrop=(e)=>{					// новое изображение также можно просто перетащить
      e.target.style.backgroundColor='#369';
      dragNdropDefaultFunction(e);
      setImage(spriteName, e, e.dataTransfer.files[0]);
    }
  });

  document.querySelectorAll('[lang]').forEach(e=>e.setAttribute('lang', (window.navigator.language||window.navigator.systemLanguage||window.navigator.userLanguage).substring(0,2)));	// изначально установить язык браузера
  document.querySelectorAll('.setLang').forEach(element=>{
    if(element.innerText=='English') element.onclick=(e)=>{
      document.querySelectorAll('[lang]').forEach(e=>e.setAttribute('lang', 'en'));
    }
    else if(element.innerText=='Русский') element.onclick=(e)=>{
      document.querySelectorAll('[lang]').forEach(e=>e.setAttribute('lang', 'ru'));
    }
  });

  // применение кода в зависимости от устройства
  if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|BB|PlayBook|IEMobile|Windows Phone|Kindle|Silk|Opera Mini/i.test(navigator.userAgent)) {
    let arrows=document.querySelectorAll('.arrow');
    arrows[0].ontouchstart=(e)=>{trackedKeys[0]=true};
    arrows[0].ontouchend=(e)=>{trackedKeys[0]=false};
    arrows[1].ontouchstart=(e)=>{trackedKeys[1]=true};
    arrows[1].ontouchend=(e)=>{trackedKeys[1]=false};
    arrows[2].ontouchstart=(e)=>{trackedKeys[2]=true};
    arrows[2].ontouchend=(e)=>{trackedKeys[2]=false};
  } else {
    document.querySelectorAll('.setButton').forEach(element=>{
      element.onclick=(e)=>{
        notice(`<div data-lang-en='set button for "${e.target.previousElementSibling.getAttribute('data-lang-en')}"' data-lang-ru='назначьте клавишу для "${e.target.previousElementSibling.getAttribute('data-lang-ru')}"' lang='${document.querySelector('[lang]').getAttribute('lang')}'></div>`, 3000);
        function setButtonGetter(event) {
          event.preventDefault();
          e.target.innerHTML=event.key;
          document.onkeydown=undefined;
          let newKeys=[];
          document.querySelectorAll('.setButton').forEach(e=>newKeys.push(e.innerHTML));
          trackedKeys = trackKeys(newKeys);
        }
        document.onkeydown=setButtonGetter;
      }
    });
  }

  document.querySelector('.chat').onclick=(e)=>{
    if(!document.querySelector('.notice') || !document.querySelector('.notice').querySelector('input')) {	// если такого окна еще нет
      let div=notice(`<input type='text' placeholder='Type a message to chat'></input><button>&#x2573</button>`);
      div.querySelector('input').focus();
      div.onkeydown=(e)=>{
        if(e.key=='Enter') socket.send('chat:'+e.target.value);
        if(e.key=='Escape') div.remove();
      }
      div.querySelector('button').onclick=(e)=>div.remove();
    }
  }
}