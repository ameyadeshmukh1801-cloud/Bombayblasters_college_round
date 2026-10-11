/**
 * Handsfree App Main Entry Point (app.js)
 * Wires computer vision head tracking, dwell selection, voice command navigation,
 * web browser sandbox, calibration wizard, and metrics telemetry.
 */

import { CursorFilter } from './tracking/cursorFilter.js';
import { DwellEngine } from './tracking/dwellEngine.js';
import { HeadTracker } from './tracking/headTracker.js';
import { HandTracker } from './tracking/handTracker.js';
import { WebcamManager } from './tracking/webcam.js';

import { SpeechRecognitionEngine } from './voice/speechRecognition.js';
import { CommandParser } from './voice/commandParser.js';
import { ElementTagger } from './voice/elementTagger.js';
import { TextDictationHandler } from './voice/textDictation.js';

import { CalibrationWizard } from './calibration/calibrationWizard.js';
import { BrowserSandboxManager } from './browser/browserSandbox.js';
import { MockAppsManager } from './browser/mockApps.js';

import { MetricsTracker } from './evaluation/metricsTracker.js';
import { BenchmarkSuite } from './evaluation/benchmarkSuite.js';

import { VisualEffectsSynthesizer } from './ui/visualEffects.js';
import { ThemeManager } from './ui/themeManager.js';
import { HUDController } from './ui/hudController.js';
import { AuroraBgManager } from './ui/auroraBgManager.js';

class HandsfreeApp {
  constructor() {
    this.isTrackingActive = false;

    // 1. Initialize UI & Audio Synthesizer & Living Aurora Background
    this.visualFX = new VisualEffectsSynthesizer();
    this.themeMgr = new ThemeManager();
    this.auroraBg = new AuroraBgManager();
    
    this.hudController = new HUDController({
      onToggleCam: () => this.toggleTracking(),
      onToggleVoice: () => this.toggleVoice(),
      onRecalibrate: () => this.recalibrateHeadCenter()
    });

    // 2. Initialize Tracking & Motion Filters
    this.cursorFilter = new CursorFilter({ alpha: 0.32, sensitivity: 2.0 });

    this.dwellEngine = new DwellEngine({
      dwellTimeout: 1000,
      onDwellStart: () => this.visualFX.playDwellStartSound(),
      onDwellComplete: (el) => {
        this.visualFX.playClickSound();
        this.auroraBg.triggerSuccessPulse();
        this.metricsTracker.logDwellClick(el);
      }
    });

    this.headTracker = new HeadTracker({
      onHeadMove: (coords) => this.handleRawHeadMove(coords),
      onBlink: () => this.handleBlinkTrigger()
    });

    this.handTracker = new HandTracker({
      onHandMove: (coords) => this.handleRawHandMove(coords),
      onPinch: () => this.handlePinchTrigger()
    });

    this.webcamManager = new WebcamManager({
      onFaceResults: (landmarks) => this.headTracker.processFaceLandmarks(landmarks),
      onHandResults: (hands) => this.handTracker.processHandLandmarks(hands)
    });

    // 3. Initialize Voice & Intent Parsing
    this.elementTagger = new ElementTagger();
    this.textDictation = new TextDictationHandler();

    this.commandParser = new CommandParser({
      onCommandMatched: (cmd) => {
        this.auroraBg.triggerSuccessPulse();
        this.handleVoiceCommand(cmd);
      },
      onDictationText: (text) => this.textDictation.handleDictationText(text)
    });

    this.speechEngine = new SpeechRecognitionEngine({
      onTranscript: (text, isFinal, confidence = 1.0) => {
        this.auroraBg.triggerSpeechSwell(true);
        if (isFinal) {
          this.hudController.updateSpeechStatus(`"${text}"`);
          this.handleSpeechTranscript(text, confidence);
        } else {
          this.hudController.updateSpeechStatus(`... ${text}`);
        }
      },
      onStatusChange: (status) => this.hudController.updateSpeechStatus(status)
    });

    // 4. Initialize Sandbox, Calibration & Metrics
    this.browserSandbox = new BrowserSandboxManager();
    this.mockApps = new MockAppsManager();
    this.metricsTracker = new MetricsTracker();
    this.benchmarkSuite = new BenchmarkSuite();

    this.calibrationWizard = new CalibrationWizard({
      onSensitivityChange: (val) => this.cursorFilter.setSensitivity(val),
      onDwellSpeedChange: (val) => this.dwellEngine.setDwellTimeout(val),
      onComplete: () => this.visualFX.showToast('Calibration complete!')
    });

    this.initGlobalEvents();
  }

  initGlobalEvents() {
    const mainToggleBtn = document.getElementById('toggle-tracking-btn');
    const calibBtn = document.getElementById('open-calibration-btn');
    const tagsBtn = document.getElementById('show-element-tags-btn');

    if (mainToggleBtn) {
      mainToggleBtn.addEventListener('click', () => this.toggleTracking());
    }

    if (calibBtn) {
      calibBtn.addEventListener('click', () => this.calibrationWizard.open());
    }

    if (tagsBtn) {
      tagsBtn.addEventListener('click', () => this.elementTagger.toggleTags());
    }

    // Auto-start speech recognition on startup
    this.speechEngine.start();

    // Mouse fallback tracking if user moves mouse or webcam is standby
    window.addEventListener('mousemove', (e) => {
      if (!this.isTrackingActive) {
        this.cursorFilter.currentX = e.clientX;
        this.cursorFilter.currentY = e.clientY;
        this.updatePointerDOM(e.clientX, e.clientY);
        this.dwellEngine.processPosition(e.clientX, e.clientY);
      }
    });

    // Make draggable widgets movable
    this.initDraggableWidgets();
  }

  initDraggableWidgets() {
    // ─── Webcam Preview Widget Drag ────────────────────────────────────────────
    const webcamWidget = document.getElementById('webcam-preview-box');
    const dragHandle   = document.getElementById('webcam-drag-handle');

    if (webcamWidget && dragHandle) {
      let dragging = false;
      let startX = 0, startY = 0;
      let startLeft = 0, startTop = 0;

      // Convert fixed right/top to explicit left/top so we can drag it
      const snapToPixelPosition = () => {
        const rect = webcamWidget.getBoundingClientRect();
        webcamWidget.style.right = 'auto';
        webcamWidget.style.left  = rect.left + 'px';
        webcamWidget.style.top   = rect.top  + 'px';
      };

      const onPointerDown = (e) => {
        // Only allow drag via the handle
        if (!dragHandle.contains(e.target)) return;
        e.preventDefault();

        // Ensure we use pixel-based left/top
        snapToPixelPosition();

        dragging = true;
        webcamWidget.classList.add('is-dragging');

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        startX = clientX;
        startY = clientY;
        startLeft = parseInt(webcamWidget.style.left, 10);
        startTop  = parseInt(webcamWidget.style.top,  10);

        document.addEventListener('mousemove', onPointerMove, { passive: false });
        document.addEventListener('touchmove', onPointerMove, { passive: false });
        document.addEventListener('mouseup',   onPointerUp);
        document.addEventListener('touchend',  onPointerUp);
      };

      const onPointerMove = (e) => {
        if (!dragging) return;
        e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const dx = clientX - startX;
        const dy = clientY - startY;

        let newLeft = startLeft + dx;
        let newTop  = startTop  + dy;

        // Clamp within viewport
        const ww = window.innerWidth  - webcamWidget.offsetWidth;
        const wh = window.innerHeight - webcamWidget.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, ww));
        newTop  = Math.max(0, Math.min(newTop,  wh));

        webcamWidget.style.left = newLeft + 'px';
        webcamWidget.style.top  = newTop  + 'px';
      };

      const onPointerUp = () => {
        dragging = false;
        webcamWidget.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('mouseup',   onPointerUp);
        document.removeEventListener('touchend',  onPointerUp);
      };

      dragHandle.addEventListener('mousedown',  onPointerDown);
      dragHandle.addEventListener('touchstart', onPointerDown, { passive: false });
    }

    // ─── Webcam Expand / Collapse Toggle ─────────────────────────────────────
    const expandBtn = document.getElementById('toggle-webcam-size-btn');
    if (expandBtn && webcamWidget) {
      expandBtn.addEventListener('click', () => {
        webcamWidget.classList.toggle('expanded');
        const icon = expandBtn.querySelector('i');
        if (icon) {
          icon.className = webcamWidget.classList.contains('expanded')
            ? 'fa-solid fa-compress'
            : 'fa-solid fa-expand';
        }
      });
    }

    // ─── Metrics Modal ────────────────────────────────────────────────────────
    const metricsBtn      = document.getElementById('open-metrics-btn');
    const metricsBackdrop = document.getElementById('metrics-modal-backdrop');
    const closeMetricsBtn = document.getElementById('close-metrics-modal-btn');

    if (metricsBtn && metricsBackdrop) {
      metricsBtn.addEventListener('click', () => {
        metricsBackdrop.style.display = 'flex';
      });
    }
    if (closeMetricsBtn && metricsBackdrop) {
      closeMetricsBtn.addEventListener('click', () => {
        metricsBackdrop.style.display = 'none';
      });
      metricsBackdrop.addEventListener('click', (e) => {
        if (e.target === metricsBackdrop) metricsBackdrop.style.display = 'none';
      });
    }
  }

  async toggleTracking() {
    this.isTrackingActive = !this.isTrackingActive;

    const btnText = document.getElementById('tracking-btn-text');
    const statusBadge = document.getElementById('system-status-badge');

    if (this.isTrackingActive) {
      const initialized = await this.webcamManager.initialize();
      const started = await this.webcamManager.startCamera();

      if (started) {
        this.headTracker.resetCalibration();
        this.cursorFilter.reset(window.innerWidth / 2, window.innerHeight / 2);
        if (btnText) btnText.textContent = 'Stop Handsfree';
        if (statusBadge) {
          statusBadge.className = 'badge badge-active';
          statusBadge.innerHTML = '<span class="pulse-dot"></span> Tracking Active';
        }
        this.visualFX.showToast('Handsfree webcam tracking started! Centered on your view.', 'success');
      } else {
        this.isTrackingActive = false;
        this.visualFX.showToast('Could not access webcam. Using fallback mouse simulation.', 'warning');
      }
    } else {
      this.webcamManager.stopCamera();
      if (btnText) btnText.textContent = 'Start Handsfree';
      if (statusBadge) {
        statusBadge.className = 'badge badge-standby';
        statusBadge.innerHTML = '<span class="pulse-dot"></span> Standby';
      }
      this.visualFX.showToast('Webcam tracking paused.');
    }
  }

  toggleVoice() {
    if (this.speechEngine.isListening) {
      this.speechEngine.stop();
      this.visualFX.showToast('Voice recognition paused.');
    } else {
      this.speechEngine.start();
      this.visualFX.showToast('Voice recognition active!');
    }
  }

  handleSpeechTranscript(text, confidence = 1.0) {
    if (!text) return;
    const cleanText = text.trim();
    // Execute the command directly
    this.commandParser.parse(cleanText);
  }

  handleRawHeadMove(coords) {
    if (!coords) return;
    const smoothed = this.cursorFilter.update(coords.x, coords.y);
    this.updatePointerDOM(smoothed.x, smoothed.y);
    this.dwellEngine.processPosition(smoothed.x, smoothed.y);
  }

  handleRawHandMove(coords) {
    if (!coords) return;
    const smoothed = this.cursorFilter.update(coords.x, coords.y);
    this.updatePointerDOM(smoothed.x, smoothed.y);
    this.dwellEngine.processPosition(smoothed.x, smoothed.y);
  }

  updatePointerDOM(x, y) {
    const pointer = document.getElementById('handsfree-virtual-pointer');
    if (pointer) {
      pointer.style.transform = `translate3d(${Math.round(x - 18)}px, ${Math.round(y - 18)}px, 0)`;
    }
  }

  handleBlinkTrigger() {
    const pointer = document.getElementById('handsfree-virtual-pointer');
    const el = document.elementFromPoint(
      this.cursorFilter.currentX,
      this.cursorFilter.currentY
    );
    if (el) {
      this.dwellEngine.triggerClick(el, this.cursorFilter.currentX, this.cursorFilter.currentY);
      this.visualFX.showToast('Eye Blink Click Triggered!');
    }
  }

  handlePinchTrigger() {
    const el = document.elementFromPoint(
      this.cursorFilter.currentX,
      this.cursorFilter.currentY
    );
    if (el) {
      this.dwellEngine.triggerClick(el, this.cursorFilter.currentX, this.cursorFilter.currentY);
      this.visualFX.showToast('Hand Pinch Click Triggered!');
    }
  }

  recalibrateHeadCenter() {
    this.headTracker.resetCalibration();
    this.cursorFilter.reset(window.innerWidth / 2, window.innerHeight / 2);
    this.visualFX.showToast('Head center position recalibrated! Position cursor to center.', 'success');
  }

  handleVoiceCommand(cmd) {
    const { action, payload } = cmd;
    this.metricsTracker.logVoiceCommand(action, true);

    switch (action) {
      case 'CLICK_CURRENT_POINTER': {
        const el = document.elementFromPoint(
          this.cursorFilter.currentX,
          this.cursorFilter.currentY
        );
        if (el) this.dwellEngine.triggerClick(el, this.cursorFilter.currentX, this.cursorFilter.currentY);
        break;
      }
      case 'CLICK_ELEMENT_NUMBER': {
        this.elementTagger.clickElementByNumber(payload);
        break;
      }
      case 'TOGGLE_ELEMENT_TAGS': {
        this.elementTagger.toggleTags(payload);
        break;
      }
      case 'SCROLL': {
        const container = document.getElementById('browser-content-container') || window;
        if (payload.direction === 'down') container.scrollBy({ top: payload.amount, behavior: 'smooth' });
        if (payload.direction === 'up') container.scrollBy({ top: -payload.amount, behavior: 'smooth' });
        if (payload.direction === 'top') container.scrollTo({ top: 0, behavior: 'smooth' });
        if (payload.direction === 'bottom') container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        break;
      }
      case 'NAVIGATE_BACK': this.browserSandbox.navigateBack(); break;
      case 'NAVIGATE_FORWARD': this.browserSandbox.navigateForward(); break;
      case 'NAVIGATE_REFRESH': this.browserSandbox.refreshCurrentTab(); break;
      case 'NAVIGATE_HOME': this.browserSandbox.switchTab('search'); break;
      case 'MEDIA_PLAY':
      case 'MEDIA_PAUSE': {
        const playBtn = document.getElementById('video-play-btn');
        if (playBtn) playBtn.click();
        break;
      }
      case 'MEDIA_MUTE': {
        const muteBtn = document.getElementById('video-mute-btn');
        if (muteBtn) muteBtn.click();
        break;
      }
      case 'MEDIA_FULLSCREEN': {
        const fsBtn = document.getElementById('video-fullscreen-btn');
        if (fsBtn) fsBtn.click();
        break;
      }
      case 'MEDIA_REWIND': {
        const rewBtn = document.getElementById('video-rewind-btn');
        if (rewBtn) rewBtn.click();
        break;
      }
      case 'MEDIA_FORWARD': {
        const fwdBtn = document.getElementById('video-forward-btn');
        if (fwdBtn) fwdBtn.click();
        break;
      }
      case 'MEDIA_UPLOAD': {
        const upBtn = document.getElementById('video-upload-trigger-btn');
        if (upBtn) upBtn.click();
        break;
      }
      case 'DICTATION_NEW_LINE':
      case 'DICTATION_DELETE_WORD':
      case 'DICTATION_CLEAR': {
        this.textDictation.handleEditingCommand(action);
        break;
      }
      case 'TRIGGER_SEARCH': {
        const searchInput = document.getElementById('search-input-field');
        const searchBtn = document.getElementById('trigger-search-btn');
        if (searchInput) searchInput.value = payload;
        if (searchBtn) searchBtn.click();
        break;
      }
    }
  }
}

// Instantiate App on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.handsfreeApp = new HandsfreeApp();
});
