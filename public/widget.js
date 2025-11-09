(function () {
  "use strict";

  var MESSAGE_SOURCE = "dealerchat-widget";
  if (typeof window === "undefined") {
    return;
  }

  if (window.__dealerchatWidgetLoaded) {
    return;
  }
  window.__dealerchatWidgetLoaded = true;

  var script = document.currentScript;
  if (!script) {
    console.error("[DealerChat] Unable to locate current script element.");
    return;
  }

  var dataset = script.dataset || {};
  var dealershipId = dataset.dealershipId || "";
  var positionAttr = dataset.position === "bottom-left" ? "bottom-left" : "bottom-right";

  var baseUrl;
  try {
    baseUrl = new URL(script.src, window.location.href);
  } catch (error) {
    console.error("[DealerChat] Invalid script src URL.", error);
    return;
  }

  var iframe = null;
  var isOpen = false;

  function adjustFrame(sizeOpen) {
    if (!iframe) return;
    var openWidth = Math.min(400, window.innerWidth - 24);
    var collapsedWidth = Math.min(280, window.innerWidth - 24);
    var openHeight = Math.min(600, window.innerHeight - 24);
    var collapsedHeight = Math.min(96, window.innerHeight - 24);

    iframe.style.width = (sizeOpen ? openWidth : collapsedWidth) + "px";
    iframe.style.height = (sizeOpen ? openHeight : collapsedHeight) + "px";
    iframe.style[positionAttr === "bottom-left" ? "left" : "right"] = "16px";
    iframe.style[positionAttr === "bottom-left" ? "right" : "left"] = "auto";
  }

  function handleMessage(event) {
    if (!baseUrl || event.origin !== baseUrl.origin) {
      return;
    }
    var data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE) {
      return;
    }

    if (data.type === "state-change") {
      isOpen = Boolean(data.open);
      adjustFrame(isOpen);
    } else if (data.type === "ready") {
      sendConfig();
    }
  }

  function sendConfig() {
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        source: "dealerchat-host",
        type: "config",
        dealershipId: dealershipId,
        position: positionAttr
      },
      baseUrl.origin
    );
  }

  function createIframe() {
    if (iframe || !document.body) return;

    iframe = document.createElement("iframe");
    iframe.title = "DealerChat AI Widget";
    iframe.src =
      baseUrl.origin +
      "/widget/embed?dealershipId=" +
      encodeURIComponent(dealershipId) +
      "&position=" +
      encodeURIComponent(positionAttr);
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = "clipboard-read; clipboard-write";
    iframe.style.position = "fixed";
    iframe.style.bottom = "16px";
    iframe.style.border = "none";
    iframe.style.background = "transparent";
    iframe.style.zIndex = "2147483646";
    iframe.style.boxSizing = "border-box";
    iframe.style.maxWidth = "100vw";
    iframe.style.maxHeight = "100vh";
    iframe.setAttribute("aria-live", "polite");

    iframe.addEventListener("error", function (error) {
      console.error("[DealerChat] Failed to load widget iframe.", error);
    });

    document.body.appendChild(iframe);
    adjustFrame(false);
  }

  function lazyMount() {
    try {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(
          function () {
            createIframe();
          },
          { timeout: 2000 }
        );
      } else {
        setTimeout(createIframe, 600);
      }
    } catch (error) {
      console.error("[DealerChat] Failed to initialize widget.", error);
    }
  }

  window.addEventListener("message", handleMessage);

  if (document.readyState === "complete" || document.readyState === "interactive") {
    lazyMount();
  } else {
    document.addEventListener("DOMContentLoaded", lazyMount);
  }

  window.addEventListener("unload", function () {
    window.removeEventListener("message", handleMessage);
  });
})();

