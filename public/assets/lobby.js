window.i18n = {
  ka: {
    homeTitle: "ლობი",
    homeDesc: "ითამაშეთ მეგობრებთან ან შექმენით ახალი ოთახი!",
    login: "შესვლა",
    register: "რეგისტრაცია",
    email: "ელფოსტა",
    password: "პაროლი",
    name: "სახელი",
    repeatPassword: "გაიმეორეთ პაროლი",
    submit: "გაგზავნა",
    toRegister: "არ გაქვთ ანგარიში? რეგისტრაცია",
    toLogin: "უკვე გაქვთ ანგარიში? შესვლა",
    lobby: "ლობი",
    logout: "გამოსვლა",
    createRoom: "ოთახის შექმნა",
    roomName: "ოთახის სახელი",
    join: "შესვლა",
    stats: "სტატისტიკა",
    rooms: "ოთახები",
    error: "დაფიქსირდა შეცდომა",
    userStats: "მოთამაშის სტატისტიკა",
    profile: "პროფილი",
    emailExists: "ეს ელფოსტა უკვე რეგისტრირებულია",
    loginIncorrect: "ელფოსტა ან პაროლი არასწორია"
  },
  en: {
    homeTitle: "lobby",
    homeDesc: "play with friends or create a new room!",
    login: "Login",
    register: "Register",
    email: "Email",
    password: "Password",
    name: "Name",
    repeatPassword: "Repeat password",
    submit: "Submit",
    toRegister: "Don't have an account? Register",
    toLogin: "Already have an account? Login",
    lobby: "Lobby",
    logout: "Logout",
    createRoom: "Create Room",
    roomName: "Room name",
    join: "Join",
    stats: "Stats",
    rooms: "Rooms",
    error: "An error occurred",
    userStats: "Player stats",
    profile: "Profile",
    emailExists: "Email already registered",
    loginIncorrect: "Email or password is incorrect"
  },
  ru: {
    homeTitle: "115-star lobby",
    homeDesc: "Enter the lobby, play with friends or create a new room!",
    login: "Login",
    register: "Register",
    email: "Email",
    password: "Password",
    name: "Name",
    repeatPassword: "Repeat password",
    submit: "Submit",
    toRegister: "Don't have an account? Register",
    toLogin: "Already have an account? Login",
    lobby: "Lobby",
    logout: "Logout",
    createRoom: "Create Room",
    roomName: "Room name",
    join: "Join",
    stats: "Stats",
    rooms: "Rooms",
    error: "An error occurred",
    userStats: "Player stats",
    profile: "Profile",
    emailExists: "Email already registered",
    loginIncorrect: "Email or password is incorrect"
  }
};
const i18n = window.i18n;
let lang = localStorage.getItem('lang') || 'ka';
function t(key) { return i18n[lang][key] || key; }
function setLang(newLang) {
  if (newLang === 'ru') {
    showRussianPopup();
    return;
  }
  lang = newLang;
  window.lang = lang;
  localStorage.setItem('lang', lang);
  // Update home page button texts if present
  if (document.getElementById('login-btn')) document.getElementById('login-btn').textContent = t('login');
  if (document.getElementById('register-btn')) document.getElementById('register-btn').textContent = t('register');
  // If in lobby, re-render lobby, else re-render home
  const lobbySection = document.getElementById('lobby-section');
  if (lobbySection && lobbySection.style.display === 'block') {
    renderLobby(true);
  } else {
    renderHome();
  }
}

// SPA routing
function showSection(id) {
  ['home-section','login-section','register-section','lobby-section'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = (s===id)?'block':'none';
  });
}

window.addEventListener('DOMContentLoaded', function() {
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) loginBtn.onclick = () => renderLogin();

  const registerBtn = document.getElementById('register-btn');
  if (registerBtn) registerBtn.onclick = () => renderRegister();
});

function renderHome() {
  showSection('home-section');
  if (!document.getElementById('lang-switch-wrap')) {
    const header = document.querySelector('header');
    const wrap = document.createElement('div');
    wrap.id = 'lang-switch-wrap';
    wrap.style.float = 'right';
    header.appendChild(wrap);
  }
  renderLangDropdown('lang-switch-wrap', lang, setLang);
  if (document.getElementById('home-title')) document.getElementById('home-title').textContent = t('homeTitle');
  if (document.getElementById('home-desc')) document.getElementById('home-desc').textContent = t('homeDesc');
  if (document.getElementById('login-btn')) document.getElementById('login-btn').textContent = t('login');
  if (document.getElementById('register-btn')) document.getElementById('register-btn').textContent = t('register');
}

function renderLogin(errorMsg) {
  showSection('login-section');
  const el = document.getElementById('login-section');
  el.innerHTML = `<div class="form-box">
    <div class="form-title">${t('login')}</div>
    ${errorMsg?`<div class="form-error">${errorMsg}</div>`:''}
    <form id="login-form">
      <div class="form-group">
        <label class="form-label">${t('email')}</label>
        <input class="form-input" type="email" name="email" required />
      </div>
      <div class="form-group">
        <label class="form-label">${t('password')}</label>
        <input class="form-input" type="password" name="password" required />
      </div>
      <button class="form-btn" type="submit">${t('login')}</button>
    </form>
    <div style="margin-top:10px;text-align:center"><a href="#" id="to-register">${t('toRegister')}</a></div>
  </div>`;
  document.getElementById('to-register').onclick = (e) => { e.preventDefault(); renderRegister(); };
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') })
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('token', data.token);
      renderLobby();
    } else if (res.status === 401) {
      renderLogin(t('loginIncorrect'));
    } else {
      renderLogin(t('error'));
    }
  };
}

function renderRegister(errorMsg) {
  showSection('register-section');
  const el = document.getElementById('register-section');
  el.innerHTML = `<div class="form-box">
    <div class="form-title">${t('register')}</div>
    ${errorMsg?`<div class="form-error">${errorMsg}</div>`:''}
    <form id="register-form">
      <div class="form-group">
        <label class="form-label">${t('name')}</label>
        <input class="form-input" type="text" name="name" required />
      </div>
      <div class="form-group">
        <label class="form-label">${t('email')}</label>
        <input class="form-input" type="email" name="email" required />
      </div>
      <div class="form-group">
        <label class="form-label">${t('password')}</label>
        <input class="form-input" type="password" name="password" required />
      </div>
      <div class="form-group">
        <label class="form-label">${t('repeatPassword')}</label>
        <input class="form-input" type="password" name="repeatPassword" required />
      </div>
      <button class="form-btn" type="submit">${t('register')}</button>
    </form>
    <div style="margin-top:10px;text-align:center"><a href="#" id="to-login">${t('toLogin')}</a></div>
  </div>`;
  document.getElementById('to-login').onclick = (e) => { e.preventDefault(); renderLogin(); };
  document.getElementById('register-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get('password') !== fd.get('repeatPassword')) {
      renderRegister(t('error'));
      return;
    }
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fd.get('name'), email: fd.get('email'), password: fd.get('password') })
    });
    if (res.ok) {
      renderLogin();
    } else if (res.status === 409) {
      renderRegister(t('emailExists'));
    } else {
      renderRegister(t('error'));
    }
  };
}

let lobbyRoomsInterval = null;

async function fetchAndRenderRooms(el, user) {
  const token = localStorage.getItem('token');
  const resRooms = await fetch('/api/rooms', { headers: { 'Authorization': 'Bearer '+token } });
  const rooms = await resRooms.json();
  const roomsHtml = rooms.map(room => {
    // Compose joined count text (e.g. "4/3")
    const joinedText = `${room.players}/${room.joined}`;
    return `
      <div class="lobby-room">
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span class="lobby-room-title">${room.name}</span>
          <span style="font-size:0.93em;color:#fff;background:#23272f;border-radius:6px;padding:2px 8px;display:inline-block;width:max-content;margin-top:2px;">${joinedText}</span>
        </div>
        <button class="lobby-room-join" data-id="${room.id}">${t('join')}</button>
      </div>
    `;
  }).join('');
  el.querySelector('.lobby-rooms').innerHTML = `<h3>${t('rooms')}</h3>${roomsHtml}`;
  el.querySelectorAll('.lobby-room-join').forEach(btn => {
    btn.onclick = () => {
      window.location.href = `great7.html?room=${btn.dataset.id}`;
    };
  });
}

async function renderLobby(keepUser) {
  showSection('lobby-section');
  const el = document.getElementById('lobby-section');
  if (!el) return;
  const token = localStorage.getItem('token');
  if (!token) { renderLogin(); return; }
  let user = null;
  if (keepUser && window._lastLobbyUser) {
    user = window._lastLobbyUser;
  } else {
    try {
      const resUser = await fetch('/api/me', { headers: { 'Authorization': 'Bearer '+token } });
      user = await resUser.json();
      window._lastLobbyUser = user;
      console.log('LOBBY USER:', user);
    } catch (e) {
      renderLogin();
      return;
    }
  }
  el.innerHTML = `
    <div class="lobby-header" role="navigation">
      <span class="lobby-user">${user.name} (${user.email})</span>
      <button class="main-btn" id="rules-btn" aria-label="თამაშის წესები" tabindex="0">თამაშის წესები</button>
      <button class="main-btn" id="profile-btn" aria-label="პროფილი" tabindex="0">${t('profile')}</button>
    </div>
    <div class="lobby-stats" style="margin-bottom:12px;">
      <b>${t('stats')||'სტატისტიკა'}:</b>
      ${user.wins !== undefined ? `
        <div style="margin-top:4px;">${t('wins')||'მოგება'}: ${user.wins}</div>
        <div>${t('losses')||'წაგება'}: ${user.losses}</div>
        <div>${t('gamesPlayed')||'თამაშები'}: ${user.gamesPlayed}</div>
        <div>Level: ${user.level} <span style="font-size:0.95em;color:#fff;">(XP: ${user.xp})</span></div>
      ` : '-'}
    </div>
    <div class="lobby-rooms"></div>
    <div class="lobby-create">
      <button class="lobby-create-btn" id="create-room-btn">${t('createRoom')}</button>
    </div>
    <div id="modal-bg" style="display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000a;z-index:1000;justify-content:center;align-items:center;">
      <div id="modal-box" style="background:#23272f;padding:24px 20px;border-radius:12px;min-width:260px;max-width:90vw;box-shadow:0 2px 16px #0008;"></div>
    </div>
    <div class="lobby-logout-wrap" style="margin-top:32px;display:flex;justify-content:center;">
      <button class="main-btn" id="logout-btn" aria-label="გამოსვლა" tabindex="0" style="min-width:160px;">${t('logout')}</button>
    </div>
    <span style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">ნავიგაცია: პროფილი და გამოსვლის ღილაკები ხელმისაწვდომია კლავიატურით და ეკრანის მკითხველით</span>
  `;
  renderLangDropdown('lang-switch-wrap', lang, setLang);
  document.getElementById('rules-btn').onclick = function() {
    let modal = document.getElementById('rules-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'rules-modal';
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100vw';
      modal.style.height = '100vh';
      modal.style.background = 'rgba(0,0,0,0.32)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = '3000';
      const lang = (JSON.parse(localStorage.getItem('great7-lobby'))?.lang)||'ka';
      modal.innerHTML = `
        <div style=\"background:#fff;color:#222;padding:32px 28px 24px 28px;border-radius:16px;box-shadow:0 2px 24px #0008;min-width:260px;max-width:90vw;text-align:left;max-height:90vh;overflow-y:auto;\">
          <div style=\"font-size:1.3em;font-weight:bold;margin-bottom:12px;text-align:center;\">თამაშის წესები</div>
          <div id=\"rules-ka\" style=\"font-size:1.05em;line-height:1.6;display:${lang==='ka'?'':'none'};\">
            <b>Great 7 </b> არის 2-6 მოთამაშეზე გათვლილი სტრატეგიული თამაში. <br><br>
            <b>მიზანი:</b>თამაშის მოსაგებად გადაიყვანე შენი ყველა ქვა საპირისპირო კუთხეში მდებარე რგოლში.<br><br>
            <b>სვლები:</b> თითოეულ სვლაზე შეგიძლია გადაადგილო ერთი ქვა მეზობელ ცარიელ ბუდეში ან გადახტე სხვა ქვაზე (ან რიგ-რიგობით რამდენიმე გადახტომა).<br><br>
            <b>გადახტომა:</b> ქვა შეიძლება გადახტეს მეზობელ ქვაზე და დაეშვას მის იქით არსებულ ცარიელ ბუდეში. შესაძლებელია რამდენიმე გადაბმული გადახტომა.<br><br>
            <b>სვლების დასრულება:</b> თუ შეგიძლია გადახტომა, შეგიძლია გააგრძელო ან დაასრულო სვლა ნებისმიერ დროს.<br><br>
            <b>დრო:</b> თითოეულ მოთამაშეს აქვს შეზღუდული დრო სვლისთვის.<br><br>
            <b>მოგება:</b> ვინც პირველი გადაიყვანს ყველა თავის ქვას მიზნის ზონაში, ის იგებს.<br><br>
          </div>
          <div id=\"rules-en\" style=\"font-size:1.05em;line-height:1.6;display:${lang==='en'?'':'none'};\">
            <b>Overview of \"Great 7\" Board Game</b><br><br>
            <b>Game Concept</b><br>
            \"Great 7\" is a unique, high-strategy board game designed for 2–6 players.<br><br>
            <b>Objective</b><br>
            The first player to transfer all seven of their stones into the opponent's starting \"ring\" (goal zone) wins the game.<br><br>
            <b>Setup</b><br>
            The board is an NxN grid laid out as a strategic labyrinth.<br>
            Each player places their seven stones on designated starting positions.<br><br>
            <b>Types of Moves</b><br>
            <u>Adjacent Move</u><br>
            Move one stone into an adjacent empty square.<br><br>
            <u>Jump Move</u><br>
            A stone may jump over another stone in a chosen direction.<br>
            If the stone to be jumped is K squares away, the jumping stone lands K+1 squares beyond it (leveraging advanced corporate-level strategy).<br>
            Multiple consecutive jumps are allowed in a single turn, at the player's discretion.<br><br>
            <b>Ending a Turn</b><br>
            A turn may be ended at any time after at least one adjacent move or jump has been executed.<br><br>
            <b>Time Constraint</b><br>
            Each player has a time limit per move (Move Timer) to maintain game flow and uphold optimal strategic planning.<br><br>
            <b>Winning the Game</b><br>
            The first player to transfer all seven stones into the opponent's ring zone is declared the winner.<br>
          </div>
          <div style=\"text-align:center;margin-top:18px;\">
            <button id=\"close-rules-modal\" style=\"background:#e74c3c;color:#fff;padding:8px 22px;font-size:1.1em;border:none;border-radius:7px;cursor:pointer;\">დახურვა</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById('close-rules-modal').onclick = function() {
        modal.remove();
      };
      modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    }
  };
  document.getElementById('profile-btn').onclick = () => {
    window.location.href = '/profile.html';
  };
  document.getElementById('logout-btn').onclick = () => { 
    localStorage.removeItem('token'); 
    localStorage.removeItem('great7-lobby');
    if (lobbyRoomsInterval) clearInterval(lobbyRoomsInterval);
    renderHome(); 
  };
  document.getElementById('create-room-btn').onclick = () => showCreateRoomModal();
  fetchAndRenderRooms(el, user);
  if (lobbyRoomsInterval) clearInterval(lobbyRoomsInterval);
  lobbyRoomsInterval = setInterval(() => fetchAndRenderRooms(el, user), 2000);
}

function showCreateRoomModal() {
  const modalBg = document.getElementById('modal-bg');
  const modalBox = document.getElementById('modal-box');
  modalBg.style.display = 'flex';
  modalBox.innerHTML = `
    <div class="form-title">${t('createRoom')}</div>
    <form id="modal-create-room-form">
      <div class="form-group">
        <label class="form-label">${t('roomName')}</label>
        <input class="form-input" type="text" name="roomName" id="modal-room-name" maxlength="32" placeholder="${t('roomName')}" required />
      </div>
      <div class="form-group">
        <label class="form-label">${t('players')}</label>
        <select class="form-input" name="players" id="modal-players">
          ${[2,3,4,5,6].map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
      </div>
      <button class="form-btn" type="submit">${t('createRoom')}</button>
      <button class="form-btn" type="button" id="modal-cancel" style="background:#444;color:#fff;margin-top:8px;">გაუქმება</button>
    </form>
  `;
  document.getElementById('modal-cancel').onclick = () => { modalBg.style.display = 'none'; };
  document.getElementById('modal-create-room-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const players = parseInt(fd.get('players'), 10);
    const roomName = fd.get('roomName')?.trim() || '';
    if (!roomName) {
      document.getElementById('modal-room-name').focus();
      return;
    }
    const token = localStorage.getItem('token');
    // ოთახის შექმნა API-ში
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+token },
      body: JSON.stringify({ players, name: roomName })
    });
    if (res.ok) {
      const room = await res.json();
      // Save player count to localStorage for game page
      localStorage.setItem('great7-lobby', JSON.stringify({ n: players }));
      modalBg.style.display = 'none';
      window.location.href = `great7.html?room=${room.id}`;
    }
  };
}

// Auto-login if token exists
if (localStorage.getItem('token')) renderLobby();
else renderHome();

// Add missing translations for stats fields
if (!i18n.ka.stats) i18n.ka.stats = 'სტატისტიკა';
if (!i18n.en.stats) i18n.en.stats = 'Stats';
if (!i18n.ru.stats) i18n.ru.stats = 'Статистика';
if (!i18n.ka.wins) i18n.ka.wins = 'მოგება';
if (!i18n.en.wins) i18n.en.wins = 'Wins';
if (!i18n.ru.wins) i18n.ru.wins = 'Победы';
if (!i18n.ka.losses) i18n.ka.losses = 'წაგება';
if (!i18n.en.losses) i18n.en.losses = 'Losses';
if (!i18n.ru.losses) i18n.ru.losses = 'Поражения';
if (!i18n.ka.gamesPlayed) i18n.ka.gamesPlayed = 'თამაშები';
if (!i18n.en.gamesPlayed) i18n.en.gamesPlayed = 'Games';
if (!i18n.ru.gamesPlayed) i18n.ru.gamesPlayed = 'Игры';

// Dropdown language selector
function renderLangDropdown(parentId, currentLang, onSelect) {
  const langs = [
    { code: 'ka', label: 'ქართული' },
    { code: 'en', label: 'English' },
    { code: 'ru', label: 'Русский' }
  ];
  const currentLangObj = langs.find(l=>l.code===currentLang) || langs[0];
  let html = `<div class="lang-dropdown"><button class="lang-dropdown-btn" id="lang-dropdown-btn">${currentLangObj.label} ▼</button><div class="lang-dropdown-list" id="lang-dropdown-list">`;
  for (const l of langs) {
    html += `<button class="lang-dropdown-item${l.code===currentLang?' active':''}" data-lang="${l.code}">${l.label}</button>`;
  }
  html += `</div></div>`;
  const parent = document.getElementById(parentId);
  if (!parent) return;
  parent.innerHTML = html;
  setTimeout(() => {
    const dropdownBtn = document.getElementById('lang-dropdown-btn');
    if (dropdownBtn) {
      dropdownBtn.onclick = function(e) {
        e.stopPropagation();
        const list = document.getElementById('lang-dropdown-list');
        if (list) list.classList.toggle('active');
      };
    }
    document.querySelectorAll('.lang-dropdown-item').forEach(btn => {
      btn.onclick = function(e) {
        e.stopPropagation();
        const lang = btn.getAttribute('data-lang');
        const list = document.getElementById('lang-dropdown-list');
        if (list) list.classList.remove('active');
        onSelect(lang);
      };
    });
  }, 0);
  document.body.onclick = function() {
    const list = document.getElementById('lang-dropdown-list');
    if (list) list.classList.remove('active');
  };
}

// Russian popup logic
function showRussianPopup() {
  let popup = document.getElementById('russian-popup-bg');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'russian-popup-bg';
    popup.className = 'geoflag';
    popup.innerHTML = `<div id="russian-popup-box"><button id="russian-popup-close">×</button><div id="russian-popup-title">📌 Уведомление</div><div id="russian-popup-text">Российская Федерация на протяжении десятилетий проводит агрессивную и экспансионистскую политику по отношению к соседним странам. Одним из самых ярких примеров этого является вторжение в Грузию в 2008 году и последующая оккупация около 20% её территории — Абхазии и Цхинвальского региона (т.н. Южной Осетии).<br><br>Несмотря на международное осуждение, Россия продолжает удерживать эти регионы под своим контролем, активно вмешиваясь во внутренние дела Грузии — через военное присутствие, поддержку сепаратизма и информационные кампании.<br><br>В условиях продолжающейся оккупации и отсутствия признания со стороны России своих преступных действий, использование русского языка на данном веб-сайте временно ограничено.<br><br>📣 Русская версия сайта будет доступна только после того, как российское правительство официально признает совершённые преступления, принесёт извинения народу Грузии и вернёт оккупированные территории.</div></div>`;
    document.body.appendChild(popup);
    document.getElementById('russian-popup-close').onclick = function() { popup.style.display = 'none'; };
  }
  popup.style.display = 'flex';
} 