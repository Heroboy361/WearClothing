// Passwort-Sperrbildschirm.
// Hinweis: Das ist ein Zugangsschutz für neugierige Blicke, keine echte Verschlüsselung –
// deine persönlichen Daten (Maße, Fotos, Outfits) liegen ohnehin nur lokal auf deinem Gerät.
//
// Passwort ändern: In der Browser-Konsole den Hash des neuen Passworts erzeugen mit
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('NeuesPasswort'))
//     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')))
// und unten bei PASS_HASH eintragen.
(function () {
  const PASS_HASH = '1fb20d680c59e1bd7f709bd0a8eb494594101415d782a845799d46e3f7f340d6';
  const KEY = 'wearclothing.unlock';

  if (localStorage.getItem(KEY) === PASS_HASH) return; // Gerät ist bereits freigeschaltet

  const overlay = document.createElement('div');
  overlay.id = 'lock-overlay';
  overlay.innerHTML = `
    <div class="lock-card">
      <div class="lock-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg></div>
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
