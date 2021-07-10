/*
 * NoScript Commons Library
 * Reusable building blocks for cross-browser security/privacy WebExtensions.
 * Copyright (C) 2020-2021 Giorgio Maone <https://maone.net>
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

// depends on /nscl/common/uuid.js

"use strict";
function prefetchCSSResources(only3rdParty = false, ruleCallback = null) {
  async function sendMessage(type, opts) {
    return await browser.runtime.sendMessage({
      __prefetchCSSResources__: {
        type, opts
      }
    });
  }

  let createElement = tagName => document.createElementNS("http://www.w3.org/1999/xhtml", tagName);

  let corsSheetURLs = new Set();

  (patchWindow((win, env) => {
    let { StyleSheet } = win;
    let ssProto = StyleSheet.prototype;
    let cssProto = win.CSSStyleSheet.prototype;
    // prevent getting fooled by redefined getters
    let getOwnerNode = Object.getOwnPropertyDescriptor(ssProto, "ownerNode").get;
    let postMessage = (msg, target) => {
      if (target instanceof StyleSheet) target = getOwnerNode.apply(target);
      return target && env.port.postMessage(msg, target);
    };
    if (!window.wrappedJSObject) {
      // Only for Chromium, requiring relaxed CORS and therefore
      // needing cssRules protection for "privileged" cross-site links.
      for (let prop of ["rules", "cssRules"]) {
        let originalGetter = Object.getOwnPropertyDescriptor(cssProto, prop).get;
        exportFunction(function() {
          if (!postMessage("accessRules", this)) {
            throw new DOMException("Security Error",
              `Failed to read the '${prop}' property from 'CSSStyleSheet': Cannot access rules`);
          }
          return originalGetter.apply(this);
        }, cssProto, {defineAs: `get ${prop}`});
      }
    }
    let mmProto = win.MediaList.prototype;
    let { appendMedium, deleteMedium, item } = mmProto;
    // make disable property temporarily readonly if tagged as _keepDisabled
    for (let p of [ssProto, win.HTMLStyleElement.prototype, win.HTMLLinkElement.prototype]) {
      let prop = "media";
      let des = Object.getOwnPropertyDescriptor(p, prop);
      exportFunction(function(value) {
        if (postMessage("isDisabled", this)) {
          if (this instanceof StyleSheet) {
            return new Proxy(this.media, {
              get(target, prop, receiver) {
                if (typeof target[prop] === "function") {
                  return new Proxy(target[prop], {
                    apply(target, that, args) {
                      if (target === appendMedium || target === deleteMedium) {
                        return;
                      }
                      if (target === item) {
                        return null;
                      }
                      return Reflect.apply(...arguments);
                    }
                  });
                }
                switch(prop) {
                  case "length":
                    return 0;
                  case "mediaText":
                    return ""
                }
                return Reflect.get(...arguments);
              },
              set(target, prop, newVal) {
                switch(prop) {
                  case "mediaText": return true;
                }
                return Reflect.set(...arguments);
             }
            });
          }
          return "";
        }
        return des.get.call(this, value);
      }, p, {defineAs: `get ${prop}`});
      exportFunction(function(value) {
        if (postMessage("isDisabled", this)) {
          return value;
        }
        return des.set.call(this, value);
      }, p, {defineAs: `set ${prop}`});
    }
  }).onMessage = (msg, {target: node}) => {
    switch(msg) {
      case "isDisabled":
        return node._keepDisabled || (node.sheet && node.sheet._keepDisabled);
      case "accessRules":
        return corsSheetURLs.has(node.sheet.href);
    }
  });

  if (typeof ruleCallback !== "function") {
    ruleCallback = null;
  }

  let processed = new WeakSet();
  let { hostname } = location;
  let { baseURI } = document;
  let resources = new Set();

  let seen = new WeakSet();

  const MEDIA_DISABLER = "speech and (width > 0px)"

  let keepDisabled = (o, v = true) => {
    if (!v === !o._keepDisabled) return false;
    let isSheet = o instanceof StyleSheet;
    if (!("_keepDisabled" in o || isSheet)) {
      if (o instanceof HTMLStyleElement) {
        observer.observe(o, { characterData: true, attributeFilter: ["media"] });
      } else {
        observer.observe(o, {attributeFilter: ["href", "media", "rel"]});
      }
    }
    o._keepDisabled = v;
    let toggleMedia = (o, prop, disabler = MEDIA_DISABLER) => {
      if (v === (o[prop] === disabler || prop === "mediaText" && o[prop] === "not all")) return;
      if (v) {
        if (!("_originalMedia" in o)) {
          o._originalMedia = o[prop];
          o[prop] = disabler;
        }
      } else if ("_originalMedia" in o) {
        o[prop] = o._originalMedia;
      }
    }
    toggleMedia(...(isSheet ?
        [o.media, "mediaText"]
      : [o, "media"]));
    return true;
  };

  // we can afford strict parsing because cssText gets normalized
  let resourceFinderRx = /url\("([^"]+)/g;

  let checkRule = rule => {
    if (!(rule instanceof CSSStyleRule)) {
      if (rule instanceof CSSImportRule) {
        if (rule.styleSheet) {
          process(rule.styleSheet);
        } else {
          let loader = new Image();
          return new Promise(resolve => {
            loader.onerror = loader.onload = () => {
              resolve(process(rule.styleSheet));
            }
            loader.src = rule.href;
          });
        }
      }
      return false;
    }
    let { cssText, parentStyleSheet } = rule;
    let base = parentStyleSheet.href || baseURI;
    let matches = cssText.match(resourceFinderRx);
    for (let m; (m = resourceFinderRx.exec(cssText));) {
      let resource = m[1];
      let url;
      try {
        url = new URL(resource, base);
      } catch (e) {
        continue;
      }
      if (only3rdParty && url.hostname === hostname) {
        continue;
      }

      let { origin } = url;
      if (resources.has(origin)) continue;
      resources.add(origin);
      if (ruleCallback && ruleCallback(rule, url)) {
        // if ruleCallback returns true we assume it handled or suppressed prefetching by itself
        continue;
      }
      let { href } = url; // href might have been transformed by the callback
      // First let's try with DNS prefetching, which works nicely on Chromium.
      try {
        let l = createElement("link");
        l.href = href;
        l.rel = "dns-prefetch";
        document.documentElement.insertBefore(l, null);
        l.remove();
      } catch (e) {}
      // Unfortunately sometimes we need to actually prefetch the resource due to dns-prefetch unreliablity on Firefox.
      new Image().src = url.href;
    }
    return false;
  };

  let process = sheet => {
    if (!sheet || processed.has(sheet)) return;
    processed.add(sheet);
    let { ownerNode } = sheet;
    let rules;
    try {
      rules = sheet.cssRules;
    } catch (e) {
      let {href} = sheet;
      if (!/^(?:(?:ht|f)tps?):/.test(href) || ownerNode && ownerNode._prefetching === href) {
        if (/\bstill-loading\b/.test(e.message)) {
          // too early, let's retry on load
          processed.remove(sheet);
          return;
        }
        // just give up: either it's another extension (e.g. Stylus), or we've already tried, failing
        console.error("Error processing sheet", sheet, e);
        if (ownerNode) {
          keepDisabled(ownerNode, false);
        }
        return;
      }
      keepDisabled(sheet);

      let link = createElement("link");
      let url = `${href}#${uuid()}`;
      corsSheetURLs.add(link._prefetching = link.href = url);
      link.rel = "stylesheet";
      link.type = "text/css";
      link.crossOrigin = "anonymous";
      link.onerror = () => {
        console.error("Error fetching", link);
      }
      return new Promise(resolve => {
        link.onload = () => {
          resolve(process(link.sheet));
          link.remove();
          keepDisabled(sheet, false);
          if (ownerNode) {
            keepDisabled(ownerNode, false);
          }
        }
        (async () => {
          await sendMessage("enableCORS", {url});
          let parent = ownerNode && ownerNode.parentElement || document.documentElement;
          parent.insertBefore(link, ownerNode || null);
        })();
      });
    }
    keepDisabled(sheet);
    let pending = [];
    for (let rule of sheet.cssRules) {
      pending.push(checkRule(rule));
    }
    Promise.all(pending).then(() => {
      keepDisabled(sheet, false);
      if (ownerNode) keepDisabled(ownerNode, false)
    });
  };

  let processAll = () => {
    for (let sheet of document.styleSheets) {
      process(sheet);
    }
  }

  let checkNode = styleNode => {
    if (styleNode._keepDisabled) return;
    let { sheet } = styleNode;
    if (sheet) {
      process(sheet);
    } else if (styleNode instanceof HTMLStyleElement) {
      let { textContent } = styleNode;
      if (/(?:^|[\s;}])@import\b/i.test(textContent)) {
        keepDisabled(styleNode);
        let importFinderRx = /(?:^|[\s;}])@import\s*(?:url\(\s*['"]?|['"])([^'"]+)/gi;
        for (let m; m = importFinderRx.exec(textContent);) {
          try {
            let url = new URL(m[1], baseURI);
            let loader = new Image();
            loader.onerror = e => {
              process(styleNode.sheet)
            };
            loader.src = url;
          } catch (e) { }
        }
      }
    } else if (styleNode instanceof HTMLLinkElement
      && styleNode.relList.contains("stylesheet")
      && styleNode.href) {
      keepDisabled(styleNode);
    }
  }

  let observer = new MutationObserver(records => {
    for (let r of records) {
      switch(r.type) {
        case "childList": // any new link / style element?
          if (r.addedNodes) {
            for (let n of r.addedNodes) {
              checkNode(n);
            }
          }
          break;
        case "characterData": // content of a style element changed?
          checkNode(r.target.parentElement);
        break;
        case "attributes":
          if (r.attributeName === "media") {
            let {target} = r;
            if (target._keepDisabled && target.media !== MEDIA_DISABLER) {
              target._originalMedia = target.media;
              target.media = MEDIA_DISABLER;
            }
          } else {
            checkNode(r.target);
          }
      }
      if (r.addedNodes) {
        for (let n of r.addedNodes) {
          checkNode(n);
        }
      } else if (r.type === "characterData") {
        checkNode(r.target.parentElement);
      }
    }
    processAll();
  });

  observer.observe(document.documentElement, { subtree: true, childList: true });

  document.documentElement.addEventListener("load", ev => {
    if (ev.target instanceof HTMLLinkElement) {
      processAll();
    }
  }, true);

  document.addEventListener("readystatechange", () => {
    processAll();
  }, true);

  for (let styleNode of document.querySelectorAll("style")) {
    checkNode(styleNode);
  }
  processAll();
}