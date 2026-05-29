/**
 * CALC — Precision Calculator
 * script.js
 *
 * Architecture:
 *  - CalcState   : pure state machine (no DOM)
 *  - CalcUI      : all DOM read/write
 *  - Event wiring: buttons + keyboard
 */

'use strict';

/* =====================================================
   1. STATE MACHINE
   ===================================================== */

const CalcState = (() => {

  /* Internal state */
  let currentInput  = '0';   // what's on the active display
  let storedValue   = null;  // left-hand operand
  let pendingOp     = null;  // pending operator symbol
  let justEqualed   = false; // did we just press "="?
  let freshInput    = true;  // next digit replaces rather than appends

  /* ── Helpers ── */

  /** Format a number for display (max 12 significant digits) */
  function formatNumber(num) {
    if (!isFinite(num)) return 'Error';
    // Use toPrecision to avoid floating-point drift, then strip trailing zeros
    const str = parseFloat(num.toPrecision(12)).toString();
    return str;
  }

  /** Evaluate the pending operation and return the result */
  function evaluate(a, op, b) {
    switch (op) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷':
        if (b === 0) return 'DIV_ZERO';
        return a / b;
      default:  return b;
    }
  }

  /* ── Public API ── */

  /** Handle a digit (0-9) */
  function digit(d) {
    // After "=", start fresh
    if (justEqualed) {
      currentInput = d;
      freshInput = false;
      justEqualed = false;
      return snapshot();
    }
    if (freshInput) {
      currentInput = d;
      freshInput = false;
    } else {
      // Limit display to 12 characters
      if (currentInput.replace('-', '').replace('.', '').length >= 12) return snapshot();
      currentInput = (currentInput === '0') ? d : currentInput + d;
    }
    return snapshot();
  }

  /** Handle decimal point */
  function decimal() {
    if (justEqualed) { currentInput = '0.'; freshInput = false; justEqualed = false; return snapshot(); }
    if (freshInput)  { currentInput = '0.'; freshInput = false; return snapshot(); }
    if (!currentInput.includes('.')) currentInput += '.';
    return snapshot();
  }

  /** Handle operator (+, −, ×, ÷) */
  function operator(op) {
    justEqualed = false;

    const current = parseFloat(currentInput);

    // Chain: if there's already a pending op and we haven't started fresh input,
    // evaluate the previous operation first
    if (storedValue !== null && !freshInput) {
      const result = evaluate(storedValue, pendingOp, current);
      if (result === 'DIV_ZERO') {
        return errorState();
      }
      storedValue  = result;
      currentInput = formatNumber(result);
    } else {
      storedValue = current;
    }

    pendingOp  = op;
    freshInput = true;           // next digit starts a new number
    return snapshot();
  }

  /** Handle equals */
  function equals() {
    if (storedValue === null || pendingOp === null) return snapshot();

    const current = parseFloat(currentInput);
    const result  = evaluate(storedValue, pendingOp, current);

    if (result === 'DIV_ZERO') {
      return errorState();
    }

    const formatted = formatNumber(result);
    currentInput = formatted;
    storedValue  = null;
    pendingOp    = null;
    freshInput   = true;
    justEqualed  = true;
    return snapshot();
  }

  /** Toggle positive/negative */
  function toggleSign() {
    if (currentInput === '0' || currentInput === 'Error') return snapshot();
    currentInput = currentInput.startsWith('-')
      ? currentInput.slice(1)
      : '-' + currentInput;
    return snapshot();
  }

  /** Convert to percentage */
  function percent() {
    const val = parseFloat(currentInput);
    if (isNaN(val)) return snapshot();
    currentInput = formatNumber(val / 100);
    return snapshot();
  }

  /** Clear all state */
  function clear() {
    currentInput = '0';
    storedValue  = null;
    pendingOp    = null;
    freshInput   = true;
    justEqualed  = false;
    return snapshot();
  }

  /** Produce a div-by-zero error state */
  function errorState() {
    currentInput = 'Cannot ÷ by 0';
    storedValue  = null;
    pendingOp    = null;
    freshInput   = true;
    justEqualed  = false;
    return { ...snapshot(), isError: true };
  }

  /** Return a read-only snapshot of current state for the UI */
  function snapshot() {
    return {
      display:    currentInput,
      expression: buildExpression(),
      activeOp:   pendingOp,
      isError:    false,
    };
  }

  /** Build the expression string shown above the main display */
  function buildExpression() {
    if (storedValue === null) return '';
    const left = formatNumber(storedValue);
    if (freshInput) return `${left} ${pendingOp}`;  // waiting for second operand
    return `${left} ${pendingOp} ${currentInput}`;
  }

  return { digit, decimal, operator, equals, toggleSign, percent, clear, snapshot };
})();


/* =====================================================
   2. UI CONTROLLER
   ===================================================== */

const CalcUI = (() => {

  const resultEl     = document.getElementById('result');
  const expressionEl = document.getElementById('expression');

  /** Render state to DOM */
  function render(state) {
    // Expression row
    expressionEl.textContent = state.expression;

    // Result row
    resultEl.textContent = state.display;

    // Error styling
    if (state.isError) {
      resultEl.classList.add('is-error');
    } else {
      resultEl.classList.remove('is-error');
    }

    // Pop animation on result change
    triggerAnimation(resultEl, 'pop');

    // Active operator highlight
    document.querySelectorAll('.btn-op').forEach(btn => {
      const isActive = btn.dataset.value === state.activeOp;
      btn.classList.toggle('is-active', isActive);
    });

    // Auto-shrink text for long numbers
    adjustFontSize(state.display);
  }

  /** Shrink display font when number is long */
  function adjustFontSize(text) {
    const len = text.length;
    if      (len > 14) resultEl.style.fontSize = '1.4rem';
    else if (len > 10) resultEl.style.fontSize = '1.9rem';
    else if (len > 7)  resultEl.style.fontSize = '2.2rem';
    else               resultEl.style.fontSize = '';
  }

  /** Remove then re-add a CSS animation class to re-trigger it */
  function triggerAnimation(el, cls) {
    el.classList.remove(cls);
    // Force reflow
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** Flash a button with a pulse animation */
  function pulseButton(el) {
    if (!el) return;
    triggerAnimation(el, 'pulse-anim');
  }

  return { render, pulseButton };
})();


/* =====================================================
   3. EVENT WIRING
   ===================================================== */

(function initEvents() {

  /** Dispatch a button action and render the resulting state */
  function dispatch(action, value, btnEl) {
    let state;

    switch (action) {
      case 'digit':    state = CalcState.digit(value);       break;
      case 'decimal':  state = CalcState.decimal();          break;
      case 'operator': state = CalcState.operator(value);    break;
      case 'equals':   state = CalcState.equals();           break;
      case 'clear':    state = CalcState.clear();            break;
      case 'sign':     state = CalcState.toggleSign();       break;
      case 'percent':  state = CalcState.percent();          break;
      default:         return;
    }

    CalcUI.render(state);
    CalcUI.pulseButton(btnEl);
  }

  /* ── Mouse / Touch: delegate to .btn-grid ── */
  const grid = document.querySelector('.btn-grid');

  grid.addEventListener('click', e => {
    const btn = e.target.closest('.btn');
    if (!btn) return;

    const action = btn.dataset.action;
    const value  = btn.dataset.value || null;
    dispatch(action, value, btn);
  });

  /* ── Keyboard support ── */
  const KEY_MAP = {
    '0': { action: 'digit',    value: '0' },
    '1': { action: 'digit',    value: '1' },
    '2': { action: 'digit',    value: '2' },
    '3': { action: 'digit',    value: '3' },
    '4': { action: 'digit',    value: '4' },
    '5': { action: 'digit',    value: '5' },
    '6': { action: 'digit',    value: '6' },
    '7': { action: 'digit',    value: '7' },
    '8': { action: 'digit',    value: '8' },
    '9': { action: 'digit',    value: '9' },
    '.': { action: 'decimal'              },
    ',': { action: 'decimal'              },
    '+': { action: 'operator', value: '+' },
    '-': { action: 'operator', value: '−' },
    '*': { action: 'operator', value: '×' },
    'x': { action: 'operator', value: '×' },
    '/': { action: 'operator', value: '÷' },
    'Enter':      { action: 'equals'  },
    '=':          { action: 'equals'  },
    'Backspace':  { action: 'clear'   },
    'Escape':     { action: 'clear'   },
    'Delete':     { action: 'clear'   },
    '%':          { action: 'percent' },
  };

  document.addEventListener('keydown', e => {
    // Don't interfere if user is typing in an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const mapping = KEY_MAP[e.key];
    if (!mapping) return;

    e.preventDefault();

    // Find the matching DOM button for visual feedback
    let btnEl = null;
    if (mapping.value) {
      btnEl = document.querySelector(
        `[data-action="${mapping.action}"][data-value="${mapping.value}"]`
      );
    } else {
      btnEl = document.querySelector(`[data-action="${mapping.action}"]`);
    }

    // Visual press feedback
    if (btnEl) {
      btnEl.classList.add('is-active');
      setTimeout(() => btnEl.classList.remove('is-active'), 120);
    }

    dispatch(mapping.action, mapping.value || null, btnEl);
  });

  /* ── Initial render ── */
  CalcUI.render(CalcState.snapshot());

})();