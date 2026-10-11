/**
 * Handsfree Chrome Extension Content Script
 * Injects virtual cursor pointer, dwell selection ring, and floating speech HUD on any webpage.
 */

(function () {
  console.log("Handsfree Extension Overlay Active.");

  // Inject virtual cursor pointer DOM
  if (!document.getElementById('handsfree-virtual-pointer')) {
    const pointer = document.createElement('div');
    pointer.id = 'handsfree-virtual-pointer';
    pointer.innerHTML = `
      <div class="pointer-dot"></div>
      <svg class="dwell-svg" viewBox="0 0 44 44">
        <circle class="dwell-circle-bg" cx="22" cy="22" r="20"></circle>
        <circle id="dwell-circle-progress" class="dwell-circle-progress" cx="22" cy="22" r="20"></circle>
      </svg>
    `;
    document.body.appendChild(pointer);
  }
})();
