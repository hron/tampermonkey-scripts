// ==UserScript==
// @name         Gemini keyboard shortcuts
// @namespace    https://gemini.google.com/
// @version      0.3.0
// @description  Keyboard shortcuts for Gemini: search/new chat/input/model/tools/plus + scrolling navigation
// @match        https://gemini.google.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gemini.google.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const GEMINI_ORIGIN = 'https://gemini.google.com';
    const SEARCH_PATH = '/search';
    const NEW_CHAT_PATH = '/app';

    const LINE_SCROLL_PX = 120;
    const PAGE_SCROLL_FACTOR = 0.9;
    const MESSAGE_SELECTORS = ['user-query', 'model-response'];

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
        
        // Handle Gemini's specific rich-text editor div structure where the parent might have contenteditable
        if (el.classList && el.classList.contains('ql-editor')) return true;
        
        return false;
    }

    function isTyping() {
        return isEditable(document.activeElement);
    }

    function getElementName(el) {
        if (!(el instanceof HTMLElement)) return '';
        const parts = [
            el.getAttribute('aria-label') || '',
            el.getAttribute('title') || '',
            el.getAttribute('data-tooltip') || '',
            el.textContent || '',
        ];

        return parts
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function queryVisible(selector, scope = document) {
        return Array.from(scope.querySelectorAll(selector)).filter(isVisible);
    }

    function clickElement(el) {
        if (!(el instanceof HTMLElement)) return false;
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.click();
        return true;
    }

    function matchesPatterns(text, patterns) {
        return patterns.some((pattern) => {
            if (typeof pattern === 'string') return text.includes(pattern.toLowerCase());
            return pattern.test(text);
        });
    }

    function getComposerInput() {
        const selectors = [
            'rich-textarea [contenteditable="true"]',
            '[contenteditable="true"][role="textbox"]',
            'textarea[aria-label*="message" i]',
            '[contenteditable="true"][aria-label*="message" i]',
            '[contenteditable="true"][aria-label*="prompt" i]',
            'textarea',
            '[contenteditable="true"]',
        ];

        const candidates = [];
        for (const selector of selectors) {
            for (const el of queryVisible(selector)) {
                if (!isEditable(el)) continue;
                if (isSearchInput(el)) continue;
                candidates.push(el);
            }
            if (candidates.length) break;
        }

        if (!candidates.length) return null;

        candidates.sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return br.bottom - ar.bottom;
        });

        return candidates[0];
    }

    function focusCaretAtEnd(el) {
        if (!(el instanceof HTMLElement)) return;
        el.focus({ preventScroll: true });

        if (el.isContentEditable) {
            const selection = window.getSelection();
            if (!selection) return;
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    function focusComposerInput() {
        const maxAttempts = 12;
        let attempts = 0;

        const tryFocus = () => {
            attempts += 1;
            const input = getComposerInput();
            if (input) {
                focusCaretAtEnd(input);
                return;
            }
            if (attempts < maxAttempts) setTimeout(tryFocus, 120);
        };

        tryFocus();
    }

    function isSearchInput(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (!isEditable(el)) return false;

        const label = getElementName(el);
        if (label.includes('search')) return true;

        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        if (placeholder.includes('search')) return true;

        if (el.getAttribute('type') === 'search') return true;
        return false;
    }

    function getSearchInput() {
        const selectors = [
            '[role="dialog"] input[type="search"]',
            '[role="dialog"] input[aria-label*="search" i]',
            '[role="dialog"] input[placeholder*="search" i]',
            'input[type="search"]',
            'input[aria-label*="search" i]',
            'input[placeholder*="search" i]',
            'textarea[aria-label*="search" i]',
        ];

        for (const selector of selectors) {
            const element = queryVisible(selector)[0];
            if (element) return element;
        }

        return null;
    }

    function focusSearchInputWhenReady() {
        const maxAttempts = 20;
        let attempts = 0;

        const tryFocus = () => {
            attempts += 1;
            const input = getSearchInput();
            if (input) {
                input.focus({ preventScroll: true });
                if (typeof input.select === 'function') input.select();
                return;
            }
            if (attempts < maxAttempts) setTimeout(tryFocus, 120);
        };

        tryFocus();
    }

    function getSearchScope() {
        const dialogs = queryVisible('[role="dialog"]');
        for (const dialog of dialogs) {
            const input = dialog.querySelector('input[type="search"], input[aria-label*="search" i], input[placeholder*="search" i]');
            if (input && isVisible(input)) return dialog;
            if (getElementName(dialog).includes('search chats')) return dialog;
        }

        if (location.pathname.startsWith(SEARCH_PATH)) return document;
        return null;
    }

    function isSearchContextActive() {
        return !!getSearchScope();
    }

    function isScrollableElement(el) {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const canScroll = el.scrollHeight > el.clientHeight + 4;
        return canScroll && (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay');
    }

    function findScrollableAncestorOrSelf(el) {
        let node = el;
        while (node && node !== document.documentElement) {
            if (isScrollableElement(node)) return node;
            node = node.parentElement;
        }
        return null;
    }

    function getScrollableContainer() {
        const candidates = [];

        const addCandidate = (el) => {
            if (!(el instanceof HTMLElement)) return;
            if (!candidates.includes(el)) candidates.push(el);
            const ancestor = findScrollableAncestorOrSelf(el);
            if (ancestor && !candidates.includes(ancestor)) candidates.push(ancestor);
        };

        const selectors = [
            'infinite-scroller.chat-history',
            'chat-window infinite-scroller',
            'infinite-scroller',
            'chat-window',
            'mat-sidenav-content',
            'main',
        ];

        for (const selector of selectors) {
            for (const el of document.querySelectorAll(selector)) {
                addCandidate(el);
            }
        }

        const messageAnchor = document.querySelector('model-response, user-query, message-content, structured-content-container');
        if (messageAnchor) addCandidate(messageAnchor);

        const bestScrollable = candidates
            .filter(isScrollableElement)
            .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];

        if (bestScrollable) return bestScrollable;

        const pageScroller = document.scrollingElement;
        if (pageScroller instanceof HTMLElement && pageScroller.scrollHeight > pageScroller.clientHeight + 4) {
            return pageScroller;
        }

        return candidates[0] || document.documentElement;
    }

    function scrollTargetBy(container, deltaY) {
        if (container instanceof HTMLElement) {
            container.scrollBy({ top: deltaY, behavior: 'auto' });
            return;
        }

        window.scrollBy({ top: deltaY, behavior: 'auto' });
    }

    function scrollTargetTo(container, targetY) {
        if (container instanceof HTMLElement) {
            container.scrollTo({ top: targetY, behavior: 'auto' });
            return;
        }

        window.scrollTo({ top: targetY, behavior: 'auto' });
    }

    function scrollByLines(direction) {
        scrollTargetBy(getScrollableContainer(), LINE_SCROLL_PX * direction);
    }

    function scrollByPage(direction) {
        const amount = Math.max(200, Math.floor(window.innerHeight * PAGE_SCROLL_FACTOR)) * direction;
        scrollTargetBy(getScrollableContainer(), amount);
    }

    function scrollToTop() {
        scrollTargetTo(getScrollableContainer(), 0);
    }

    function scrollToBottom() {
        const container = getScrollableContainer();
        if (container instanceof HTMLElement) {
            scrollTargetTo(container, container.scrollHeight);
            return;
        }

        scrollTargetTo(container, document.documentElement.scrollHeight || document.body.scrollHeight || 0);
    }

    function getMessageAnchors() {
        const selector = MESSAGE_SELECTORS.join(', ');
        return Array.from(document.querySelectorAll(selector))
            .filter(el => el instanceof HTMLElement)
            .filter((el) => {
                const rect = el.getBoundingClientRect();
                return rect.height > 10 && rect.width > 10;
            });
    }

    function scrollToAdjacentMessage(direction) {
        const anchors = getMessageAnchors();
        if (!anchors.length) return;

        const scroller = getScrollableContainer();
        const scrollerRect = (scroller instanceof HTMLElement && scroller !== document.documentElement && scroller !== document.body) 
            ? scroller.getBoundingClientRect() 
            : { top: 0, height: window.innerHeight };
        
        // Use a focus line near the top of the scroller
        const focusLine = scrollerRect.top + (scrollerRect.height * 0.1);

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
                (anchors[targetIndex].getBoundingClientRect().top - scrollerRect.top) <= 10
            ) {
                targetIndex++;
            }
        } else {
            while (
                targetIndex >= 0 &&
                (anchors[targetIndex].getBoundingClientRect().top - scrollerRect.top) >= -10
            ) {
                targetIndex--;
            }
        }

        targetIndex = Math.max(0, Math.min(anchors.length - 1, targetIndex));
        if (targetIndex === currentIndex) return;

        const targetEl = anchors[targetIndex];

        if (scroller instanceof HTMLElement && scroller !== document.documentElement && scroller !== document.body) {
            const elRect = targetEl.getBoundingClientRect();
            // Scroll so the element's top is near the top of the scroller
            const offset = elRect.top - scrollerRect.top + scroller.scrollTop - 20;
            scroller.scrollTo({ top: offset, behavior: 'auto' });
        } else {
            targetEl.scrollIntoView({ block: 'start' });
        }
    }

    function focusScrollableContainer() {
        const container = getScrollableContainer();
        if (container instanceof HTMLElement) {
            // Focus the container so native keys work
            if (!container.hasAttribute('tabindex')) {
                container.setAttribute('tabindex', '-1');
            }
            container.focus({ preventScroll: true });
            
            // Also explicitly blur active element if it's an input
            const active = document.activeElement;
            if (active instanceof HTMLElement && isEditable(active)) {
                active.blur();
            }
            return true;
        }


        if (document.body instanceof HTMLElement) {
            document.body.focus({ preventScroll: true });
            return true;
        }

        return false;
    }

    function blurToScrollableContainer() {
        const active = document.activeElement;
        if (active instanceof HTMLElement && isEditable(active)) {
            active.blur();
        }

        focusScrollableContainer();
    }

    function getClickableCandidates(scope = document) {
        return queryVisible(
            'button, [role="button"], a[href], a[role="button"], [tabindex]:not([tabindex="-1"])',
            scope,
        ).filter((el) => {
            if (el.getAttribute('disabled') != null) return false;
            if (el.getAttribute('aria-disabled') === 'true') return false;
            return true;
        });
    }

    function findBestMatch({ selectors, patterns, scopes, preferBottom = false, preferRight = false, preferLeft = false }) {
        for (const scope of scopes) {
            if (!scope) continue;
            for (const selector of selectors) {
                const match = queryVisible(selector, scope)[0];
                if (match) return match;
            }
        }

        let best = null;
        let bestScore = -Infinity;

        for (const scope of scopes) {
            if (!scope) continue;
            for (const el of getClickableCandidates(scope)) {
                const name = getElementName(el);
                if (!name) continue;
                if (!matchesPatterns(name, patterns)) continue;

                const rect = el.getBoundingClientRect();
                let score = 50;

                if (preferBottom) score += rect.top > window.innerHeight * 0.58 ? 8 : -4;
                if (preferRight) score += rect.left > window.innerWidth * 0.55 ? 6 : -2;
                if (preferLeft) score += rect.right < window.innerWidth * 0.45 ? 6 : -2;

                if (scope !== document) score += 2;

                if (score > bestScore) {
                    bestScore = score;
                    best = el;
                }
            }
        }

        return best;
    }

    function getComposerScope() {
        const input = getComposerInput();
        if (!input) return null;
        return input.closest('form') || input.closest('footer') || input.parentElement || null;
    }

    function dispatchGeminiShortcut(letter) {
        const key = letter.toLowerCase();
        const code = `Key${letter.toUpperCase()}`;
        const target = document.activeElement || document.body || document.documentElement;

        const eventInit = {
            key,
            code,
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
            composed: true,
        };

        target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        target.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    }

    function openSearchChats() {
        if (isSearchContextActive()) {
            focusSearchInputWhenReady();
            return;
        }

        dispatchGeminiShortcut('k'); // Gemini native: Ctrl+Shift+K

        setTimeout(() => {
            if (isSearchContextActive()) {
                focusSearchInputWhenReady();
                return;
            }
            location.assign(new URL(SEARCH_PATH, GEMINI_ORIGIN).toString());
        }, 220);
    }

    function clickNewChatButton() {
        const target = findBestMatch({
            selectors: [
                'button[aria-label*="New chat" i]',
                'button[title*="New chat" i]',
                'a[href="/app"]',
            ],
            patterns: [/new chat/i, /new conversation/i],
            scopes: [document],
        });

        if (!target) return false;
        return clickElement(target);
    }

    function openNewChat() {
        if (clickNewChatButton()) return;

        dispatchGeminiShortcut('o'); // Gemini native: Ctrl+Shift+O

        setTimeout(() => {
            if (location.pathname.startsWith(SEARCH_PATH)) {
                location.assign(new URL(NEW_CHAT_PATH, GEMINI_ORIGIN).toString());
            }
        }, 220);
    }

    function openModelPicker() {
        const composerScope = getComposerScope();

        const target = findBestMatch({
            selectors: [
                '[aria-label*="Open mode picker" i]',
                '[title*="Open mode picker" i]',
                '[aria-label*="Model" i]',
                '[title*="Model" i]',
                '[aria-haspopup="menu"][aria-label*="Gemini" i]',
            ],
            patterns: [/mode picker/i, /model/i, /gemini\s*\d/i, /flash/i, /pro/i, /thinking/i],
            scopes: [composerScope, document],
            preferBottom: true,
            preferRight: true,
        });

        if (target) clickElement(target);
    }

    function openToolsMenu() {
        const composerScope = getComposerScope();

        const target = findBestMatch({
            selectors: [
                '[aria-label*="Tools" i]',
                '[title*="Tools" i]',
            ],
            patterns: [/tools?/i],
            scopes: [composerScope, document],
            preferBottom: true,
            preferRight: true,
        });

        if (target) clickElement(target);
    }

    function openPlusMenu() {
        const composerScope = getComposerScope();

        const target = findBestMatch({
            selectors: [
                '[aria-label*="Plus" i]',
                '[aria-label*="Add" i]',
                '[aria-label*="Attach" i]',
                '[title*="Add" i]',
                '[title*="Attach" i]',
            ],
            patterns: [/^\+$/i, /\bplus\b/i, /\badd\b/i, /attach/i, /upload/i],
            scopes: [composerScope, document],
            preferBottom: true,
            preferLeft: true,
        });

        if (target) clickElement(target);
    }

    function handleKeydown(event) {
        const key = normalizeKey(event.key);
        const lowerKey = key.toLowerCase();

        const prevent = () => {
            event.preventDefault();
            event.stopPropagation();
        };

        // Ctrl+Shift+H => open Search chats (delegates to Gemini's Ctrl+Shift+K + fallback /search).
        if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && lowerKey === 'h') {
            prevent();
            if (!event.repeat) openSearchChats();
            return;
        }

        // Ctrl+I => open new chat.
        if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && lowerKey === 'i') {
            prevent();
            if (!event.repeat) openNewChat();
            return;
        }

        // Ctrl+J => focus prompt input.
        if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && lowerKey === 'j') {
            prevent();
            if (!event.repeat) focusComposerInput();
            return;
        }

        // Alt+L => model picker.
        if (!event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && lowerKey === 'l') {
            prevent();
            if (!event.repeat) openModelPicker();
            return;
        }

        // Alt+T => tools.
        if (!event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && lowerKey === 't') {
            prevent();
            if (!event.repeat) openToolsMenu();
            return;
        }

        // Alt+. => plus menu.
        if (!event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && (key === '.' || event.code === 'Period')) {
            prevent();
            if (!event.repeat) openPlusMenu();
            return;
        }

        // Escape / Alt+I => blur input and focus scroll container.
        if ((key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) ||
            (lowerKey === 'i' && !event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey)) {
            if (lowerKey === 'i') {
                prevent();
            }
            if (!event.repeat) {
                setTimeout(() => blurToScrollableContainer(), 0);
            }
            return;
        }

        if (event.metaKey) return;

        // Message jumping (Ctrl+Alt+Shift)
        const isCtrlAltShift = event.ctrlKey && event.altKey && event.shiftKey && !event.metaKey;
        if (isCtrlAltShift) {
            if (key === 'ArrowUp') {
                prevent();
                scrollToAdjacentMessage(-1);
                return;
            }
            if (key === 'ArrowDown') {
                prevent();
                scrollToAdjacentMessage(1);
                return;
            }
        }

        // Scrolling (Ctrl+Alt)
        const isCtrlAlt = event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey;
        if (isCtrlAlt) {
            switch (key) {
                case 'ArrowUp': prevent(); scrollByLines(-1); return;
                case 'ArrowDown': prevent(); scrollByLines(1); return;
                case 'PageUp': prevent(); scrollByPage(-1); return;
                case 'PageDown': prevent(); scrollByPage(1); return;
                case 'Home': prevent(); scrollToTop(); return;
                case 'End': prevent(); scrollToBottom(); return;
            }
        }

        // Don't steal plain/navigation shortcuts while user is typing in an editable field.
        if (isTyping()) return;

        // If the scroll container has focus, let plain PageUp/PageDown/Home/End also drive chat scrolling.
        const active = document.activeElement;
        const scroller = getScrollableContainer();
        const plainPaging = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
        const activeIsScroller = active && scroller && active === scroller;

        if (plainPaging && activeIsScroller) {
            switch (key) {
                case 'PageUp': prevent(); scrollByPage(-1); return;
                case 'PageDown': prevent(); scrollByPage(1); return;
                case 'Home': prevent(); scrollToTop(); return;
                case 'End': prevent(); scrollToBottom(); return;
            }
        }
    }

    document.addEventListener('keydown', handleKeydown, true);
})();
