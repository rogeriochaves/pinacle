/**
 * Proxy Injection Script
 *
 * This script is injected into all HTML pages served through the proxy.
 * It enables communication between the iframe and the parent workbench.
 */

export const getProxyInjectionScript = (nonce?: string) => {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";

  return `
<script${nonceAttr}>
(function() {
  // Track and report navigation changes to parent
  function reportNavigation() {
    try {
      window.parent.postMessage({
        type: 'pinacle-navigation',
        url: window.location.href,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash
      }, '*');
    } catch (e) {
      // Ignore errors
    }
  }

  // Report when navigation starts (before page unloads)
  function reportNavigationStart() {
    try {
      window.parent.postMessage({
        type: 'pinacle-navigation-start',
        url: window.location.href
      }, '*');
    } catch (e) {
      // Ignore errors
    }
  }

  // Detect navigation via beforeunload (catches all actual navigation including programmatic)
  // Note: We don't use click/submit listeners because they fire before preventDefault()
  // is called, causing false positives for SPA navigation (React Router, etc.)
  window.addEventListener('beforeunload', function() {
    reportNavigationStart();
  });

  // Report initial navigation
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', reportNavigation);
  } else {
    // DOM already loaded
    reportNavigation();
  }

  // Listen for popstate events (back/forward navigation)
  window.addEventListener('popstate', function() {
    reportNavigation();
  });

  // Listen for pushState/replaceState (React Router, etc.)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function() {
    originalPushState.apply(history, arguments);
    reportNavigation();
  };

  history.replaceState = function() {
    originalReplaceState.apply(history, arguments);
    reportNavigation();
  };

  // Also listen for hashchange events
  window.addEventListener('hashchange', function() {
    reportNavigation();
  });

  // Forward keyboard shortcuts from iframe to parent
  window.addEventListener('keydown', function(event) {
    // Only forward Cmd/Ctrl + number shortcuts
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
      const key = event.key;
      const num = parseInt(key, 10);

      if (num >= 1 && num <= 9) {
        // Prevent default browser behavior (tab switching)
        event.preventDefault();

        // Forward to parent window
        window.parent.postMessage({
          type: 'pinacle-keyboard-shortcut',
          key: key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey
        }, '*');
      }
    }
  });

  // Helper function to capture screenshot using html2canvas
  function captureScreenshotWithHtml2Canvas(requestId) {
    setTimeout(function() {
      try {
        // Try with foreignObjectRendering first (more compatible with modern CSS like oklch)
        window.html2canvas(document.documentElement, {
          scale: 1,
          logging: false,
          useCORS: true,
          allowTaint: true,
          foreignObjectRendering: true, // True avoids CSS parsing (handles oklch, etc)
          width: window.innerWidth,
          height: window.innerHeight,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          imageTimeout: 15000, // Wait up to 15s for images to load
          removeContainer: true,
          ignoreElements: function(element) {
            // Skip elements that might cause issues
            return element.tagName === 'SCRIPT' || element.tagName === 'NOSCRIPT';
          },
        }).then(function(canvas) {
          // Convert canvas to data URL
          var dataUrl = canvas.toDataURL('image/png', 0.7);

          // Send screenshot back to parent
          window.parent.postMessage({
            type: 'pinacle-screenshot-captured',
            dataUrl: dataUrl,
            requestId: requestId
          }, '*');
        }).catch(function(err) {
          console.error('Screenshot capture failed with foreignObjectRendering, trying fallback:', err);

          // Fallback: Try without foreignObjectRendering and remove problematic stylesheets
          window.html2canvas(document.documentElement, {
            scale: 1,
            logging: false,
            useCORS: true,
            allowTaint: true,
            foreignObjectRendering: false, // False gives better image/SVG rendering
            width: window.innerWidth,
            height: window.innerHeight,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            imageTimeout: 15000,
            removeContainer: true,
            ignoreElements: function(element) {
              return element.tagName === 'SCRIPT' || element.tagName === 'NOSCRIPT';
            },
            onclone: function(clonedDoc) {
              // Remove problematic CSS that html2canvas can't parse (like oklch)
              var styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
              for (var i = 0; i < styles.length; i++) {
                try {
                  var style = styles[i];
                  if (style.sheet) {
                    // Try to access rules to see if we can modify them
                    var rules = style.sheet.cssRules || style.sheet.rules;
                    // If we can access, leave it, otherwise remove
                  }
                } catch (e) {
                  // Cross-origin stylesheet, skip
                }
              }
            }
          }).then(function(canvas) {
            var dataUrl = canvas.toDataURL('image/png', 0.7);
            window.parent.postMessage({
              type: 'pinacle-screenshot-captured',
              dataUrl: dataUrl,
              requestId: requestId
            }, '*');
          }).catch(function(fallbackErr) {
            console.error('Screenshot fallback also failed:', fallbackErr);
            window.parent.postMessage({
              type: 'pinacle-screenshot-error',
              error: fallbackErr.message || 'Screenshot capture failed',
              requestId: requestId
            }, '*');
          });
        });
      } catch (err) {
        console.error('Screenshot error:', err);
        window.parent.postMessage({
          type: 'pinacle-screenshot-error',
          error: err.message || 'Screenshot error',
          requestId: requestId
        }, '*');
      }
    }, 3000);
  }

  // Listen for messages from parent window
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'pinacle-navigation-back') {
      // Handle back navigation request
      window.history.back();
    } else if (event.data && event.data.type === 'pinacle-navigation-forward') {
      // Handle forward navigation request
      window.history.forward();
    } else if (event.data && event.data.type === 'pinacle-capture-screenshot') {
      // Handle screenshot capture request from parent
      try {
        // Check if html2canvas is already loaded
        if (typeof window.html2canvas === 'function') {
          captureScreenshotWithHtml2Canvas(event.data.requestId);
        } else {
          // Load html2canvas script dynamically
          var script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
          script.onload = function() {
            captureScreenshotWithHtml2Canvas(event.data.requestId);
          };
          script.onerror = function() {
            console.error('Failed to load html2canvas');
            window.parent.postMessage({
              type: 'pinacle-screenshot-error',
              error: 'Failed to load html2canvas library',
              requestId: event.data.requestId
            }, '*');
          };
          document.head.appendChild(script);
        }
      } catch (err) {
        console.error('Screenshot error:', err);
        window.parent.postMessage({
          type: 'pinacle-screenshot-error',
          error: err.message,
          requestId: event.data.requestId
        }, '*');
      }
    } else if (event.data && event.data.type === 'pinacle-focus') {
      // Try multiple methods to ensure focus works
      window.focus();
      document.body.focus();

      // If VS Code, focus the open tab
      const openTab = document.querySelector(".tabs-and-actions-container .tab.active.selected a");
      if (openTab) {
        const syntheticEvent = new PointerEvent("mousedown", { bubbles: true, cancelable: true });
        openTab.dispatchEvent(syntheticEvent);
      } else {
        // Find first focusable element and focus it
        const focusable = document.querySelector('input, textarea, [contenteditable], [tabindex]:not([tabindex="-1"])');
        if (focusable) {
          focusable.focus();
        }
      }

      // Dispatch a custom event that apps can listen to
      window.dispatchEvent(new CustomEvent('pinacle-focused'));
    }

    if (event.data && event.data.type === 'pinacle-source-control-view') {
      const sourceControlViewIcon = document.querySelector(".action-label.codicon.codicon-source-control-view-icon");
      if (sourceControlViewIcon && !sourceControlViewIcon.parentElement?.classList.contains("checked")) {
        sourceControlViewIcon.click();
        let attempts = 0;
        let searchInterval = setInterval(() => {
          const resourceGroup = document.querySelector(".resource-group");
          if (resourceGroup) {
            clearInterval(searchInterval);
            setTimeout(() => {
              const firstModifiedFile = document.querySelector(".resource[data-tooltip='Modified']");
              if (firstModifiedFile) {
                firstModifiedFile.click();
              }
            }, attempts > 0 ? 2000 : 500);
          }
          attempts++;
          if (attempts > 10) {
            clearInterval(searchInterval);
          }
        }, 1000);
      } else {
        // alreaty opened or not found, do nothing
      }
    }
  });
})();
</script>`;
};

