// Passwort-Sperrbildschirm.
// Hinweis: Das ist ein Zugangsschutz für neugierige Blicke, keine echte Verschlüsselung –
// deine persönlichen Daten (Maße, Fotos, Outfits) liegen ohnehin nur lokal auf deinem Gerät.
//
// Passwort ändern: In der Browser-Konsole den Hash des neuen Passworts erzeugen mit
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('NeuesPasswort'))
//     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')))
// und unten bei PASS_HASH eintragen.
(function () {
  const PASS_HASH = '3a60f2810ad73954c82b96bf86f30f2df62d443164eda7c49e84bc99b71135b2';
  const KEY = 'wearclothing.unlock';

  if (localStorage.getItem(KEY) === PASS_HASH) return; // Gerät ist bereits freigeschaltet

  const overlay = document.createElement('div');
  overlay.id = 'lock-overlay';
  overlay.innerHTML = `
    <div class="lock-card">
      <div class="lock-icon">🔒</div>
      <h1>WearClothing</h1>
      <p>Diese App ist privat. Bitte Passwort eingeben:</p>
      <input type="password" id="lock-pw" autocomplete="current-password" placeholder="Passwort" inputmode="text">
      <button id="lock-btn">Entsperren</button>
      <p id="lock-err" class="lock-err"></p>
    </div>`;

  async function hash(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  async function tryUnlock() {
    const input = overlay.querySelector('#lock-pw');
    const err = overlay.querySelector('#lock-err');
    let h;
    try {
      h = await hash(input.value);
    } catch {
      err.textContent = 'Entsperren braucht HTTPS (oder localhost).';
      return;
    }
    if (h === PASS_HASH) {
      localStorage.setItem(KEY, PASS_HASH); // Gerät merken – nur einmal pro Gerät nötig
      overlay.remove();
      document.documentElement.classList.remove('locked');
    } else {
      err.textContent = 'Falsches Passwort.';
      input.value = '';
      input.focus();
    }
  }

  function mount() {
    document.documentElement.classList.add('locked');
    document.body.appendChild(overlay);
    overlay.querySelector('#lock-btn').addEventListener('click', tryUnlock);
    overlay.querySelector('#lock-pw').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryUnlock();
    });
    overlay.querySelector('#lock-pw').focus();
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
