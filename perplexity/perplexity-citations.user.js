// ==UserScript==
// @name         Perplexity citation fix for Vimium
// @namespace    https://www.perplexity.ai/
// @version      0.3.0
// @description  Make multi-source citations Vimium-accessible: adds tabindex so Vimium shows a hint, click to lock the popup open, press f again to follow any source link inside it.
// @match        https://www.perplexity.ai/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=perplexity.ai
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/**
 * How it works
 * ───────────────────────────────────────────────────────────────────────────
 * Single-source citations already have an <a href> child – Vimium detects
 * them fine. Multi-source ones (`span.group/trigger[data-state]`) are
 * hover-only Radix UI popovers with no link child, so Vimium ignores them.
 *
 * Fix:
 *  1. Add tabindex="0" + role="button" → Vimium shows a hint on every
 *     multi-source citation.
 *  2. Click (Vimium hint activation) → dispatch hover events to open the
 *     Radix popup, then "lock" it open.
 *  3. While locked, block pointerout/mouseout at document-capture phase.
 *     This runs BEFORE React 17+'s root-container delegation, so React
 *     never sees the leave events and the popup stays open.
 *  4. Press f again → Vimium finds the <a> links inside the now-visible
 *     popup portal and shows hints for each source.
 *  5. Escape or click outside trigger/popup → unlock, popup closes.
 *
 * v0.3.0 fix: also block blur/focusout at document-capture so Vimium
 * entering hint-mode (which steals focus from the trigger) no longer causes
 * the popup to close before the user can follow a link.
 * React 17+ uses the bubbling focusout event for onBlur delegation, so
 * intercepting at document-capture fires before React's root handler.
 *
 * Visual feedback: a subtle ring is shown on the locked trigger via CSS
 * injected once at startup.
 */

(function () {
    'use strict';

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Returns true when `el` is a multi-source citation trigger we should patch. */
    function isMultiCitationTrigger(el) {
        return (
            el.tagName === 'SPAN' &&
            el.hasAttribute('data-state') &&
            el.className.includes('group/trigger') &&
            // Multi-source: no direct <a> child (single-source has one)
            !el.querySelector('a[href]')
        );
    }

    // ── Global lock state ─────────────────────────────────────────────────────

    /** The currently "click-locked" trigger whose popup we keep open. */
    let lockedTrigger = null;

    function lock(trigger) {
        if (lockedTrigger === trigger) return;
        if (lockedTrigger) unlock();
        lockedTrigger = trigger;
        trigger.setAttribute('data-pplx-locked', '');
    }

    function unlock() {
        if (!lockedTrigger) return;
        const trigger = lockedTrigger;
        // Clear FIRST so our capture interceptors stop blocking events.
        lockedTrigger = null;
        trigger.removeAttribute('data-pplx-locked');

        // Let leave/blur events through again so Radix closes the popup.
        trigger.dispatchEvent(
            new PointerEvent('pointerout', { bubbles: true, cancelable: true, relatedTarget: document.body })
        );
        trigger.dispatchEvent(
            new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: document.body })
        );
        trigger.blur();
    }

    // ── Popup-open helper ─────────────────────────────────────────────────────

    /**
     * Fire the events that tell a Radix Tooltip / HoverCard to open:
     *  - focus            (Radix Tooltip: onFocus → open)
     *  - pointerover/move (Radix HoverCard / Tooltip: onPointerMove → open)
     */
    function openPopup(trigger) {
        trigger.focus({ preventScroll: true });

        const opts = { bubbles: true, cancelable: true };
        trigger.dispatchEvent(new PointerEvent('pointerover', opts));
        trigger.dispatchEvent(new PointerEvent('pointermove',  opts));
        trigger.dispatchEvent(new MouseEvent('mouseover',      opts));
        trigger.dispatchEvent(new MouseEvent('mousemove',      opts));
    }

    // ── Document-level event interception ────────────────────────────────────
    //
    // React 17+ delegates events to the root container, NOT document. So our
    // document-capture listeners fire BEFORE React can process them.
    // Calling stopImmediatePropagation() here prevents the event from ever
    // reaching React's root-container handler.

    function isOnLockedTrigger(e) {
        return (
            lockedTrigger !== null &&
            (e.target === lockedTrigger || lockedTrigger.contains(e.target))
        );
    }

    function isLeavingLockedTrigger(e) {
        return isOnLockedTrigger(e) && !lockedTrigger.contains(e.relatedTarget);
    }

    // Block pointer-leave events so hovering away doesn't close the popup.
    ['pointerout', 'mouseout'].forEach(type => {
        document.addEventListener(type, e => {
            if (isLeavingLockedTrigger(e)) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        }, { capture: true });
    });

    // Block blur/focusout so Vimium stealing focus doesn't close the popup.
    // blur is not cancelable, so only stopImmediatePropagation is used.
    // focusout bubbles and is what React 17+ uses for onBlur delegation.
    ['blur', 'focusout'].forEach(type => {
        document.addEventListener(type, e => {
            if (isOnLockedTrigger(e)) {
                e.stopImmediatePropagation();
            }
        }, { capture: true });
    });

    // Escape → unlock
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && lockedTrigger) unlock();
    });

    // Click outside trigger AND outside any open Radix popup → unlock
    document.addEventListener('click', e => {
        if (!lockedTrigger) return;
        if (lockedTrigger.contains(e.target)) return;

        // Allow clicks inside an open Radix popup portal
        const wrapper = e.target.closest('[data-radix-popper-content-wrapper]');
        if (wrapper) return;

        unlock();
    }, { capture: true });

    // ── Per-trigger patching ──────────────────────────────────────────────────

    function patchTrigger(trigger) {
        if (trigger.dataset.pplxPatched) return;
        trigger.dataset.pplxPatched = '1';

        // Make Vimium (and any keyboard user) see this as a focusable button
        trigger.setAttribute('tabindex', '0');
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('aria-label', 'Show all citation sources');

        trigger.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();

            if (lockedTrigger === trigger) {
                // Second click on same trigger → close
                unlock();
            } else {
                lock(trigger);
                openPopup(trigger);
            }
        });

        // Also open on Enter/Space for keyboard users (Vimium may use these)
        trigger.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                trigger.click();
            }
        });
    }

    // ── DOM scanning ──────────────────────────────────────────────────────────

    function scanAndPatch() {
        document.querySelectorAll('span[data-state]').forEach(el => {
            if (isMultiCitationTrigger(el)) patchTrigger(el);
        });
    }

    // Watch for dynamically rendered answer content
    const observer = new MutationObserver(scanAndPatch);
    observer.observe(document.body, { childList: true, subtree: true });

    scanAndPatch();

    // ── Visual indicator ──────────────────────────────────────────────────────

    const style = document.createElement('style');
    style.textContent = `
        /* Subtle ring when a multi-citation is click-locked open */
        span[data-pplx-locked] {
            outline: 2px solid oklch(var(--super-color, 65% 0.22 290)) !important;
            outline-offset: 1px;
            border-radius: 3px;
        }
    `;
    document.head.appendChild(style);
})();
