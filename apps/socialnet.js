/* ==========================================================================
   App | Social Networks (Class 5 - Culture)
   Head TA only: the "headta" password gate now lives in assets/shell.js and
   covers this app plus the six data apps, so one unlock opens them all. What
   is behind the gate here is still just APP TBD.
   ========================================================================== */

(function () {
  'use strict';

  function mount(container) {
    container.innerHTML = '' +
      '<div class="app-title"><h2>🕸️ Social Networks</h2>' +
      '<span class="sub">Head TA only.</span></div>' +
      '<div style="display:flex;align-items:center;justify-content:center;min-height:50vh">' +
      '  <div style="text-align:center">' +
      '    <div style="font-size:56px;margin-bottom:10px">🕸️</div>' +
      '    <h2 style="margin:0">APP TBD</h2>' +
      '  </div>' +
      '</div>';
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
})();
