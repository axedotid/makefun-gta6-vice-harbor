// Keyboard and mouse input with the two questions the game actually asks:
// "is this down?" and "did this just get pressed?".

import { VIEW } from './config.js';

const PREVENT = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Tab',
  'KeyE',
  'KeyR',
  'KeyC',
  'KeyM',
]);

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = {
    x: VIEW.width / 2,
    y: VIEW.height / 2,
    worldX: 0,
    worldY: 0,
    down: false,
    clicked: false,
    rightDown: false,
    moved: false,
    inside: false,
  };

  function toCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    mouse.x = ((event.clientX - rect.left) / rect.width) * VIEW.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * VIEW.height;
    mouse.inside = true;
  }

  const onKeyDown = (event) => {
    if (PREVENT.has(event.code)) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
  };
  const onKeyUp = (event) => {
    keys.delete(event.code);
  };
  const onMove = (event) => {
    toCanvas(event);
    mouse.moved = true;
  };
  const onDown = (event) => {
    toCanvas(event);
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    } else if (event.button === 2) {
      mouse.rightDown = true;
    }
    event.preventDefault();
  };
  const onUp = (event) => {
    if (event.button === 0) mouse.down = false;
    else if (event.button === 2) mouse.rightDown = false;
  };
  const onBlur = () => {
    keys.clear();
    mouse.down = false;
    mouse.rightDown = false;
  };
  const onEnter = () => {
    mouse.inside = true;
  };
  const onLeave = () => {
    mouse.inside = false;
    mouse.down = false;
  };
  const onContext = (event) => event.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('mouseenter', onEnter);
  canvas.addEventListener('mouseleave', onLeave);
  canvas.addEventListener('contextmenu', onContext);

  const input = {
    keys,
    pressed,
    mouse,
    isDown(code) {
      return keys.has(code);
    },
    wasPressed(code) {
      return pressed.has(code);
    },
    anyPressed(...codes) {
      return codes.some((c) => pressed.has(c));
    },
    consumeClick() {
      if (!mouse.clicked) return false;
      mouse.clicked = false;
      return true;
    },
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
      mouse.moved = false;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseenter', onEnter);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('contextmenu', onContext);
    },
  };
  return input;
}