// ==UserScript==
// @name         Perplexity keyboard shortcuts
// @namespace    https://www.perplexity.ai/
// @version      0.3.0
// @description  Adds navigation and scrolling shortcuts on perplexity.ai
// @match        https://www.perplexity.ai/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=perplexity.ai
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const LIBRARY_URL = "https://www.perplexity.ai/library";
    const LINE_SCROLL_PX = 120;
    const PAGE_SCROLL_FACTOR = 0.9;
    const MESSAGE_ANCHOR_SELECTOR = ".group\\/query";
    const ASK_INPUT = "#ask-input";

    function normalizeKey(key) {
        if (key === "Up") return "ArrowUp";
        if (key === "Down") return "ArrowDown";
        return key;
    }

    function getScrollableContainer() {
        return document.querySelector(".scrollable-container");
    }

    function scrollByLines(direction) {
        const container = getScrollableContainer();
        container.scrollBy({ top: LINE_SCROLL_PX * direction });
    }

    function scrollByPage(direction) {
        const container = getScrollableContainer();
        const amount =
            Math.max(200, Math.floor(window.innerHeight * PAGE_SCROLL_FACTOR)) *
            direction;
        container.scrollBy({
            top: amount,
            behavior: "auto",
        });
    }

    function scrollToTop() {
        getScrollableContainer().scrollTo({ top: 0 });
    }

    function scrollToBottom() {
        const container = getScrollableContainer();
        container.scrollBy({ top: container.scrollHeight });
    }

    function getMessageAnchors() {
        return Array.from(document.querySelectorAll(MESSAGE_ANCHOR_SELECTOR))
            .filter((el) => el instanceof HTMLElement)
            .filter((el) => {
                const rect = el.getBoundingClientRect();
                return rect.height > 10 && rect.width > 10;
            });
    }

    function scrollToAdjacentMessage(direction) {
        const anchors = getMessageAnchors();
        console.log(anchors);
        if (!anchors.length) return;

        const focusLine = innerHeight * 0.25;
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

        anchors[targetIndex].scrollIntoView({ block: "start" });
    }

    function openLibrary() {
        if (location.href !== LIBRARY_URL) {
            location.href = LIBRARY_URL;
        }
    }

    function handleKeydown(event) {
        const key = normalizeKey(event.key);

        if (
            event.ctrlKey &&
            event.shiftKey &&
            !event.altKey &&
            (key === "h" || key === "H")
        ) {
            if (!event.repeat) {
                event.preventDefault();
                event.stopPropagation();
                openLibrary();
            }
            return;
        }

        if ((key === "Escape" && !event.ctrlKey && !event.altKey && !event.shiftKey) ||
            (key === "i" && !event.ctrlKey && event.altKey && !event.shiftKey)) {
            getScrollableContainer().focus();
        }

        if (!(event.ctrlKey && event.altKey)) return;

        if (!event.shiftKey && key === "PageUp") {
            event.preventDefault();
            event.stopPropagation();
            scrollByPage(-1);
            return;
        }

        if (!event.shiftKey && key === "PageDown") {
            event.preventDefault();
            event.stopPropagation();
            scrollByPage(1);
            return;
        }

        if (!event.shiftKey && key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            scrollByLines(-1);
            return;
        }

        if (!event.shiftKey && key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            scrollByLines(1);
            return;
        }

        if (!event.shiftKey && key === "Home") {
            event.preventDefault();
            event.stopPropagation();
            scrollToTop();
            return;
        }

        if (!event.shiftKey && key === "End") {
            event.preventDefault();
            event.stopPropagation();
            scrollToBottom();
            return;
        }

        if (event.shiftKey && key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            scrollToAdjacentMessage(-1);
            return;
        }

        if (event.shiftKey && key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            scrollToAdjacentMessage(1);
            return;
        }
    }

    document.addEventListener("keydown", handleKeydown, true);

    // function focusSearchWhenReady() {
    //     const searchElement = document.querySelector('input[type="search"]');
    //     console.log(searchElement);
    //     if (searchElement) {
    //         searchElement.focus();
    //         return;
    //     }

    //     const observer = new MutationObserver(() => {
    //         const input = document.querySelector('input[type="search"]');
    //         console.log(input);
    //         if (input) {
    //             input.focus();
    //             observer.disconnect();
    //         }
    //     });

    //     observer.observe(document.body, {
    //         childList: true,
    //         subtree: true,
    //     });
    // }

    // console.log(document.location.pathname);
    // if (document.location.pathname === "/library") {
    //     focusSearchWhenReady();
    // }
})();
