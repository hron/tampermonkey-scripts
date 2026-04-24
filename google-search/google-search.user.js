// ==UserScript==
// @name         Google Search keyboard shortcuts
// @namespace    https://www.google.com/
// @version      0.3.0
// @description  Keyboard shortcuts for Google Search: new search + focus + scrolling
// @match        https://www.google.com/search*
// @match        https://www.google.com/*
// @icon         https://www.google.com/favicon.ico
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const LINE_SCROLL = 120;

    function normalizeKey(key) {
        if (key === 'Up') return 'ArrowUp';
        if (key === 'Down') return 'ArrowDown';
        return key;
    }

    function isVisible(el) {
        if (!(el instanceof HTMLElement)) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        return true;
    }

    function isEditable(el) {
        if (!(el instanceof HTMLElement)) return false;
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function isTyping() {
        return isEditable(document.activeElement);
    }

    function queryVisible(selector, scope = document) {
        return Array.from(scope.querySelectorAll(selector)).filter(isVisible);
    }

    function clickElement(el) {
        if (!(el instanceof HTMLElement)) return false;
        el.click();
        return true;
    }

    function getSearchInput() {
        // AI Mode textarea: placeholder "Ask anything"
        const aiTextarea = queryVisible('textarea[placeholder*="Ask" i]')[0];
        if (aiTextarea && isVisible(aiTextarea)) return aiTextarea;

        // Traditional search: input[name="q"]
        return queryVisible('input[name="q"]')[0] || null;
    }

    function focusSearchInputWhenReady() {
        const tryFocus = () => {
            const input = getSearchInput();
            if (input) {
                input.focus();
                return true;
            }
            return false;
        };

        if (!tryFocus()) {
            let attempts = 0;
            const interval = setInterval(() => {
                if (tryFocus() || attempts++ > 15) clearInterval(interval);
            }, 150);
        }
    }

    function openNewSearch() {
        // Open new search in AI Mode
        // Navigate to google.com home and click AI Mode link
        if (location.pathname !== '/' || location.search !== '') {
            location.assign('https://www.google.com/');
            return;
        }
        
        // On home page, find and click AI Mode link
        const links = queryVisible('a');
        for (const el of links) {
            const text = (el.textContent || '').toLowerCase();
            if (text.includes('ai mode')) {
                el.click();
                return;
            }
        }
        
        // Fallback: use search URL with empty query
        location.assign('https://www.google.com/search?q=');
    }

    function scrollByLines(direction) {
        window.scrollBy({ top: LINE_SCROLL * direction, behavior: 'auto' });
    }

    function scrollByPage(direction) {
        window.scrollBy({ top: window.innerHeight * 0.9 * direction, behavior: 'auto' });
    }

    function scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'auto' });
    }

    function scrollToBottom() {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
    }

    function handleKeydown(event) {
        const key = normalizeKey(event.key);
        const lowerKey = key.toLowerCase();
        const prevent = () => { event.preventDefault(); event.stopPropagation(); };

        // Ctrl+I => new search
        if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && lowerKey === 'i') {
            prevent();
            if (!event.repeat) openNewSearch();
            return;
        }

        // Ctrl+J => focus search input
        if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && lowerKey === 'j') {
            prevent();
            if (!event.repeat) focusSearchInputWhenReady();
            return;
        }

        // Escape => blur to scroll
        if (key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            return;
        }

        if (event.metaKey) return;

        // Scrolling: Ctrl+Alt+arrows, PageUp/Down, Home/End
        if (event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey) {
            switch (key) {
                case 'ArrowUp': prevent(); scrollByLines(-1); return;
                case 'ArrowDown': prevent(); scrollByLines(1); return;
                case 'PageUp': prevent(); scrollByPage(-1); return;
                case 'PageDown': prevent(); scrollByPage(1); return;
                case 'Home': prevent(); scrollToTop(); return;
                case 'End': prevent(); scrollToBottom(); return;
            }
        }

        // Don't steal shortcuts while typing
        if (isTyping()) return;
    }

    document.addEventListener('keydown', handleKeydown, true);
})();