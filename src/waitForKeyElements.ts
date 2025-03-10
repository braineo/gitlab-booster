/// exact copy from https://github.com/CoeJoder/waitForKeyElements.js/blob/16f3c035e2c41f8af0437a1eca1c9899e722ec37/waitForKeyElements.js
/// do not lint this file

/**
 * A utility function for userscripts that detects and handles AJAXed content.
 *
 * @example
 * waitForKeyElements("div.comments", (element) => {
 *   element.innerHTML = "This text inserted by waitForKeyElements().";
 * });
 *
 * waitForKeyElements(() => {
 *   const iframe = document.querySelector('iframe');
 *   if (iframe) {
 *     const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
 *     return iframeDoc.querySelectorAll("div.comments");
 *   }
 *   return null;
 * }, callbackFunc);
 *
 * @param {(string|function)} selectorOrFunction - The selector string or function.
 * @param {function}          callback           - The callback function; takes a single DOM element as parameter.
 *                                                 If returns true, element will be processed again on subsequent iterations.
 * @param {boolean}           [waitOnce=true]    - Whether to stop after the first elements are found.
 * @param {number}            [interval=300]     - The time (ms) to wait between iterations.
 * @param {number}            [maxIntervals=-1]  - The max number of intervals to run (negative number for unlimited).
 */

interface IWaitForKeyElements {
  (
    selectorOrFunction: string | (() => [Element]),
    callback: (arg0: Element) => boolean | void,
    waitOnce?: boolean,
    interval?: number,
    maxIntervals?: number,
  ): void;

  namespace: string;
}

export const waitForKeyElements = <IWaitForKeyElements>(
  function (selectorOrFunction, callback, waitOnce, interval, maxIntervals) {
    if (typeof waitOnce === 'undefined') {
      waitOnce = true;
    }
    if (typeof interval === 'undefined') {
      interval = 300;
    }
    if (typeof maxIntervals === 'undefined') {
      maxIntervals = -1;
    }
    if (typeof waitForKeyElements.namespace === 'undefined') {
      waitForKeyElements.namespace = Date.now().toString();
    }
    var targetNodes =
      typeof selectorOrFunction === 'function'
        ? selectorOrFunction()
        : document.querySelectorAll(selectorOrFunction);

    var targetsFound = targetNodes && targetNodes.length > 0;
    if (targetsFound) {
      targetNodes.forEach(function (targetNode) {
        var attrAlreadyFound = `data-userscript-${waitForKeyElements.namespace}-alreadyFound`;
        var alreadyFound = targetNode.getAttribute(attrAlreadyFound) || false;
        if (!alreadyFound) {
          var cancelFound = callback(targetNode);
          if (cancelFound) {
            targetsFound = false;
          } else {
            targetNode.setAttribute(attrAlreadyFound, 'true');
          }
        }
      });
    }

    if (maxIntervals !== 0 && !(targetsFound && waitOnce)) {
      maxIntervals -= 1;
      setTimeout(function () {
        waitForKeyElements(
          selectorOrFunction,
          callback,
          waitOnce,
          interval,
          maxIntervals,
        );
      }, interval);
    }
  }
);
