const gamebody=`<div class='nameofgame'>
    <div class='gameScreen'></div>
    <nav class='controlPanel layer1'>
      <div class='menuButton' data-lang-en='Menu' data-lang-ru='Меню' lang='ru'></div>
      <br />
      <ul class='gameMenu'>
        <li data-lang-en='Multiplayer' data-lang-ru='Игра по сети' lang='ru'>
          <ul>
           <li>
             <input class='registrationInput' type='text' maxlength='10' placeholder='Enter your login'></input>
           </li>
           <table>
             <tr><td class='disconnect active' data-lang-en='disconnect' data-lang-ru='отключиться от сети' lang='ru'></td><td class='blockall active' data-lang-en='block all' data-lang-ru='заблокировать всех' lang='ru'></td></tr>
           </table>
           <table>
             <thead><tr><th width='75px' data-lang-en='user' data-lang-ru='игрок' lang='ru'></th><th width='75px' data-lang-en='room' data-lang-ru='комната' lang='ru'></th><th width='75px' data-lang-en='users in room' data-lang-ru='игроков в комнате' lang='ru'></th><th width='75px' data-lang-en='level' data-lang-ru='уровень' lang='ru'></th></tr></thead>
           </table>
           <div class='tableScroll'>
             <table>
               <tbody class='usersTable'></tbody>
             </table>
           </div>
          </ul>
        </li>
        <li class='options' data-lang-en='Options' data-lang-ru='Настройки' lang='ru'>
          <ul>
           <table>
             <tr>
                 <td colspan='4' data-lang-en='Skin select' data-lang-ru='Выбор скина' lang='ru'></td>
                 <td colspan='2' data-lang-en='Language select' data-lang-ru='Выбор языка' lang='ru'></td>
             </tr>
             <tr>
               <td><canvas class='setSkin active'></canvas></td>
               <td><canvas class='setSkin active'></canvas></td>
               <td><canvas class='setSkin active'></canvas></td>
               <td><canvas class='setSkin active'></canvas></td>
               <td class='setLang active'>English</td><td class='setLang active'>Русский</td>
             </tr>
           </table>
           <table>
             <tr><td data-lang-en='Fullscreen' data-lang-ru='На весь экран' lang='ru'><input class='setScreenSize' type='checkbox' /></td></tr>
           </table>
           <table class='buttonSetters'>
             <tr><td colspan='2' data-lang-en='Set keys' data-lang-ru='Назначить клавиши' lang='ru'></td></tr>
             <tr><td data-lang-en='move left' data-lang-ru='двигаться влево' lang='ru'></td><td class='setButton active'>ArrowLeft</td></tr>
             <tr><td data-lang-en='move right' data-lang-ru='двигаться вправо' lang='ru'></td><td class='setButton active'>ArrowRight</td></tr>
             <tr><td data-lang-en='jump' data-lang-ru='прыжок' lang='ru'></td><td class='setButton active'>ArrowUp</td></tr>
           </table>
           <table class='spriteSetters'>
             <tr><td colspan='2' data-lang-en='Set sprites' data-lang-ru='Назначить спрайты' lang='ru'></td></tr>
             <tr><td data-lang-en='wall' data-lang-ru='стена' lang='ru'></td><td class='setSprite active' elem='wall'><img src='img/wall.png' width='20px' height='20px' /></td></tr>
             <tr><td data-lang-en='lava' data-lang-ru='лава' lang='ru'></td><td class='setSprite active' elem='lava'><img src='img/lava.png' width='20px' height='20px' /></td></tr>
             <tr><td data-lang-en='coin' data-lang-ru='монета' lang='ru'></td><td class='setSprite active' elem='coin'><img src='img/coin.png' width='12px' height='12px' /></td></tr>
             <tr><td data-lang-en='background' data-lang-ru='фон' lang='ru'></td><td class='setSprite active backgroundSprite' elem='background'><img src='img/Koala.jpg' width='20px' height='20px' /></td></tr>
           </table>
          </ul>
        </li>
        <li data-lang-en='Saves' data-lang-ru='Сохранения' lang='ru'>
          <ul>
           <li class='save' data-lang-en='save' data-lang-ru='сохранить' lang='ru'> (F5)</li>
           <li class='load' data-lang-en='load' data-lang-ru='загрузить' lang='ru'> (F9)</li>
          </ul>
        </li>
        <li class='chooseLevel' data-lang-en='Choose level' data-lang-ru='Выбрать уровень' lang='ru'>
          <ul>
          </ul>
        </li>
      </ul>
      <div class='mobileButtons'>
        <input class='arrow' type='button' value='&#9668'/>
        <input class='arrow' type='button' value='&#9658'/>
        <div class='chat' data-lang-en='Chat: Welcome!' data-lang-ru='Чат: Добро пожаловать!' lang='ru'>
        </div>
        <input class='arrow' type='button' value='&#9650'/>
      </div>
    </nav>
  </div>`