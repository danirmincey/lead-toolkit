/* ==========================================================================
   App | Social Networks (Class 5 - Culture)
   Password-gated placeholder per Dani's spec: entering "headta" (any casing)
   reveals the app area, which for now just says APP TBD.
   ========================================================================== */

(function () {
  'use strict';

  var PASSWORD = 'headta';

  function checkPassword(input) {
    return String(input || '').trim().toLowerCase() === PASSWORD;
  }

  function mount(container) {
    container.innerHTML = '' +
      '<div class="app-title"><h2>🕸️ Social Networks</h2>' +
      '<span class="sub">Head TA only.</span></div>' +
      '<div style="display:flex;align-items:center;justify-content:center;min-height:50vh">' +
      '  <div id="sn-gate" style="text-align:center">' +
      '    <div style="font-size:44px;margin-bottom:14px">🔒</div>' +
      '    <div class="row" style="justify-content:center">' +
      '      <input type="password" id="sn-pass" placeholder="password" autocomplete="off" style="max-width:220px">' +
      '      <button id="sn-go" class="primary">Enter</button>' +
      '    </div>' +
      '    <div class="small-note" id="sn-msg" style="min-height:1.4em;margin-top:8px"></div>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return container.querySelector('#' + id); };

    function tryEnter() {
      if (checkPassword($('sn-pass').value)) {
        container.querySelector('div[style*="min-height"]').innerHTML =
          '<div style="text-align:center">' +
          '  <div style="font-size:56px;margin-bottom:10px">🕸️</div>' +
          '  <h2 style="margin:0">APP TBD</h2>' +
          '</div>';
      } else {
        $('sn-msg').textContent = 'nope';
        $('sn-pass').value = '';
        $('sn-pass').focus();
      }
    }

    $('sn-go').addEventListener('click', tryEnter);
    $('sn-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryEnter(); });
    setTimeout(function () { $('sn-pass').focus(); }, 50);
  }

  if (typeof window !== 'undefined' && window.LeadToolkit) {
    window.LeadToolkit.registerApp({
      id: 'socialnet',
      icon: '🕸️',
      group: 'Class 5 - Culture',
      name: 'Social Networks',
      code: 'OTH-SNW',
      appType: 'Other',
      intro: { verb: 'Enter', upload: 'the Head TA password', to: 'the social networks exercise (TBD)' },
      tags: ['social networks', 'password', 'tbd', 'gate'],
      description: 'Password-protected area for the social networks exercise. Head TA only.',
      mount: mount
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { checkPassword: checkPassword };
  }
})();
