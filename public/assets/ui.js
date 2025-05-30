// ui.js — Popup-ები, overlay-ები, ღილაკები

// გასვლის popup
export function showExitPopup() {
  let popup = document.getElementById('exit-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'exit-popup';
    popup.style.position = 'fixed';
    popup.style.top = '0';
    popup.style.left = '0';
    popup.style.width = '100vw';
    popup.style.height = '100vh';
    popup.style.background = 'rgba(0,0,0,0.32)';
    popup.style.display = 'flex';
    popup.style.alignItems = 'center';
    popup.style.justifyContent = 'center';
    popup.style.zIndex = '2000';
    popup.innerHTML = `
      <div style="background:#fff;color:#222;padding:32px 28px 24px 28px;border-radius:16px;box-shadow:0 2px 24px #0008;min-width:260px;text-align:center;max-width:90vw;">
        <div style="font-size:1.2em;margin-bottom:18px;">ნამდვილად გსურთ თამაშიდან გასვლა?</div>
        <div style="display:flex;gap:18px;justify-content:center;">
          <button id="exit-yes" style="background:#e74c3c;color:#fff;padding:8px 22px;font-size:1.1em;border:none;border-radius:7px;cursor:pointer;">დიახ</button>
          <button id="exit-no" style="background:#bbb;color:#222;padding:8px 22px;font-size:1.1em;border:none;border-radius:7px;cursor:pointer;">არა</button>
        </div>
      </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('exit-yes').onclick = function() {
      window.location.href = 'index.html';
    };
    document.getElementById('exit-no').onclick = function() {
      popup.remove();
    };
  }
}

// ფერის არჩეული overlay
export function ensureColorSelected(myColor) {
  let overlay = document.getElementById('color-required-overlay');
  if (!myColor) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'color-required-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.background = 'rgba(0,0,0,0.65)';
      overlay.style.zIndex = '2000';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.innerHTML = '<div style="background:#fff;color:#222;padding:32px 28px 24px 28px;border-radius:16px;box-shadow:0 2px 24px #0008;min-width:260px;text-align:center;max-width:90vw;font-size:1.2em;">ფერი არ არის არჩეული! გთხოვთ დაბრუნდეთ ლობიში და აირჩიოთ ფერი.</div>';
      document.body.appendChild(overlay);
    }
    // Disable pointer events on board
    const board = document.getElementById('board');
    if (board) board.style.pointerEvents = 'none';
  } else {
    if (overlay) overlay.remove();
    const board = document.getElementById('board');
    if (board) board.style.pointerEvents = '';
  }
}

// ლობი ღილაკის ინიციალიზაცია
export function initLobbyButton() {
  const btn = document.getElementById('lobby-btn');
  if (btn) btn.onclick = showExitPopup;
}

// ლობი ღილაკის ტექსტის განახლება ენის მიხედვით
export function setLobbyBtnText() {
  const btn = document.getElementById('lobby-btn');
  if (!btn) return;
  let lang = 'ka';
  try {
    const lobby = JSON.parse(localStorage.getItem('great7-lobby'));
    if (lobby && lobby.lang) lang = lobby.lang;
  } catch (e) {}
  btn.textContent = lang === 'en' ? 'Lobby' : 'ლობი';
} 