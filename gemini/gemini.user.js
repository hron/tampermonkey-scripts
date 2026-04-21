// ==UserScript==
// @name         Gemini keyboard shortcuts
// @namespace    https://gemini.google.com/
// @version      0.1.0
// @description  Adds navigation and scrolling shortcuts on gemini.google.com, mirroring the Perplexity shortcuts
// @match        https://gemini.google.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gemini.google.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/**
 * Shortcut map (same as the Perplexity script)
 * ─────────────────────────────────────────────
 * Ctrl+Alt+ArrowUp        scroll up one "line"  (120 px)
 * Ctrl+Alt+ArrowDown      scroll down one "line"
 * Ctrl+Alt+PageUp         scroll up one page    (90 % of viewport)
 * Ctrl+Alt+PageDown       scroll down one page
 * Ctrl+Alt+Home           scroll to very top
 * Ctrl+Alt+End            scroll to very bottom
 * Ctrl+Alt+Shift+ArrowUp  jump to previous conversation turn
 * Ctrl+Alt+Shift+ArrowDown jump to next conversation turn
 * Escape / Alt+i          focus the scroll container (blur the input)
 *
 * Gemini DOM notes
 * ────────────────
 * Gemini is an Angular SPA. The relevant elements are Angular custom elements
 * (tag names, not class names):
 *
 *   Scroll container  – <chat-window>  (contains <infinite-scroller> inside;
 *                        we scroll the first overflow-y:auto/scroll ancestor
 *                        of the message list, discovered at runtime)
 *   Conversation turns – <user-query> and <model-response>
 *   Input             – div[contenteditable] inside <rich-textarea>
 *
 * Because Angular renders asynchronously, selectors are resolved lazily on
 * every key event rather than cached at startup.
 */

(function () {
    'use strict';

    const LINE_SCROLL_PX = 120;
    const PAGE_SCROLL_FACTOR = 0.9;

    // Selectors for the two sides of a conversation turn.
    // Both are Angular custom-element tag names that appear in the DOM.
    const MESSAGE_SELECTORS = ['user-query', 'model-response'];

    // ── Scroll container ──────────────────────────────────────────────────────

    /**
     * Gemini renders its chat inside <chat-window> → <infinite-scroller>.
     * The actual scrollable element is whichever ancestor has overflow-y
     * set to auto or scroll.  We walk up from a known inner element to find
     * it so the script survives minor DOM refactors.
     */
    function getScrollableContainer() {
        // // Prefer the explicit chat-window element.
        // const chatWindow = document.querySelector('chat-window');
        // if (chatWindow) {
        //     // Walk up to find the actual scrolling ancestor.
        //     const scroller = findScrollableAncestorOrSelf(chatWindow);
        //     if (scroller) return scroller;
        // }

        // // Fallback: find via infinite-scroller (older Gemini builds).
        // const infiniteScroller = document.querySelector('infinite-scroller');
        // if (infiniteScroller) {
        //     const scroller = findScrollableAncestorOrSelf(infiniteScroller);
        //     if (scroller) return scroller;
        // }

        // // Last resort: the Angular Material sidenav content area.
        // return document.querySelector('mat-sidenav-content') || document.documentElement;
        return document.querySelector('model-response');
    }

    function findScrollableAncestorOrSelf(el) {
        let node = el;
        while (node && node !== document.documentElement) {
            const style = window.getComputedStyle(node);
            const overflow = style.overflowY;
            if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) {
                return node;
            }
            node = node.parentElement;
        }
        // If nothing found, return el itself (best effort).
        return el;
    }

    // ── Scroll actions ────────────────────────────────────────────────────────

    function scrollByLines(direction) {
        getScrollableContainer().scrollBy({ top: LINE_SCROLL_PX * direction });
    }

    function scrollByPage(direction) {
        const container = getScrollableContainer();
        const amount = Math.max(200, Math.floor(window.innerHeight * PAGE_SCROLL_FACTOR)) * direction;
        container.scrollBy({ top: amount, behavior: 'auto' });
    }

    function scrollToTop() {
        getScrollableContainer().scrollTo({ top: 0 });
    }

    function scrollToBottom() {
        const container = getScrollableContainer();
        container.scrollTo({ top: container.scrollHeight });
    }

    // ── Message-jump ──────────────────────────────────────────────────────────

    function getMessageAnchors() {
        const selector = MESSAGE_SELECTORS.join(', ');
        return Array.from(document.querySelectorAll(selector))
            .filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.height > 10 && rect.width > 10;
            });
    }

    function scrollToAdjacentMessage(direction) {
        const anchors = getMessageAnchors();
        if (!anchors.length) return;

        const focusLine = window.innerHeight * 0.25;
        let currentIndex = 0;
        let bestDistance = Infinity;

        for (let i = 0; i < anchors.length; i++) {
            const rect = anchors[i].getBoundingClientRect();
            const distance = Math.abs(rect.top - focusLine);
            if (distance < bestDistance) {
                bestDistance = distance;
                currentIndex = i;
            }
        }

        let targetIndex = currentIndex + direction;

        if (direction > 0) {
            while (
                targetIndex < anchors.length &&
                anchors[targetIndex].getBoundingClientRect().top <= focusLine + 4
            ) {
                targetIndex++;
            }
        } else {
            while (
                targetIndex >= 0 &&
                anchors[targetIndex].getBoundingClientRect().top >= focusLine - 4
            ) {
                targetIndex--;
            }
        }

        targetIndex = Math.max(0, Math.min(anchors.length - 1, targetIndex));
        if (targetIndex === currentIndex) return;

        anchors[targetIndex].scrollIntoView({ block: 'start' });
    }

    // ── Focus helpers ─────────────────────────────────────────────────────────

    /**
     * Returns true if the active element is an editable field where we must
     * NOT steal keypresses (user is typing a message).
     */
    function isTyping() {
        const el = document.activeElement;
        if (!el) return false;
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function blurToContainer() {
        getScrollableContainer().focus();
    }

    // ── Key handler ───────────────────────────────────────────────────────────

    function normalizeKey(key) {
        if (key === 'Up') return 'ArrowUp';
        if (key === 'Down') return 'ArrowDown';
        return key;
    }

    function handleKeydown(event) {
        const key = normalizeKey(event.key);

        // Escape / Alt+i → blur input, focus scroll container.
        if (
            (key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey) ||
            (key === 'i' && !event.ctrlKey && event.altKey && !event.shiftKey)
        ) {
            blurToContainer();
            return;
        }

        // All remaining shortcuts require Ctrl+Alt.
        if (!event.ctrlKey || !event.altKey) return;

        // Don't fire if the user is currently typing, except for the
        // Escape/Alt+i branch handled above.
        if (isTyping()) return;

        const preventDefault = () => {
            event.preventDefault();
            event.stopPropagation();
        };

        if (!event.shiftKey) {
            switch (key) {
                case 'ArrowUp': preventDefault(); scrollByLines(-1); return;
                case 'ArrowDown': preventDefault(); scrollByLines(1); return;
                case 'PageUp': preventDefault(); scrollByPage(-1); return;
                case 'PageDown': preventDefault(); scrollByPage(1); return;
                case 'Home': preventDefault(); scrollToTop(); return;
                case 'End': preventDefault(); scrollToBottom(); return;
            }
        } else {
            switch (key) {
                case 'ArrowUp': preventDefault(); scrollToAdjacentMessage(-1); return;
                case 'ArrowDown': preventDefault(); scrollToAdjacentMessage(1); return;
            }
        }
    }

    document.addEventListener('keydown', handleKeydown, true);
    console.log("gemini.user.js");
})();
