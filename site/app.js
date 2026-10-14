/* ===========================
   Modern Java — app.js
   Vanilla JS for search, filters, syntax highlighting, and interactions
   =========================== */

(() => {
  'use strict';

  /* ---------- Locale Detection ---------- */
  const detectLocale = () => {
    const path = location.pathname;
    const match = path.match(/^\/([a-z]{2}(?:-[A-Z]{2})?)\//);
    return match ? match[1] : 'en';
  };
  const locale = detectLocale();
  const localePrefix = locale === 'en' ? '' : '/' + locale;

  /* ---------- Browser Locale Auto-Redirect ---------- */
  const autoRedirectLocale = () => {
    // Topic and agent plugin pages are canonical English-only pages.
    if (['topic', 'agent-plugin'].includes(document.body.dataset.page)) return;
    if (locale !== 'en') return; // already on a non-English locale
    const available = (window.i18n && window.i18n.availableLocales) || [];
    if (available.length <= 1) return;

    // Respect explicit user choice (set when using locale picker)
    const preferred = localStorage.getItem('preferred-locale');
    if (preferred === 'en') return; // user explicitly chose English
    if (preferred && available.includes(preferred)) {
      window.location.replace('/' + preferred + location.pathname + location.search + location.hash);
      return;
    }

    // Match browser language to available locales
    const langs = navigator.languages || [navigator.language];
    for (const lang of langs) {
      // Exact match (e.g. pt-BR)
      if (lang !== 'en' && available.includes(lang)) {
        window.location.replace('/' + lang + location.pathname + location.search + location.hash);
        return;
      }
      // Prefix match (e.g. pt matches pt-BR)
      const prefix = lang.split('-')[0];
      if (prefix !== 'en') {
        const match = available.find(l => l.startsWith(prefix + '-') || l === prefix);
        if (match) {
          window.location.replace('/' + match + location.pathname + location.search + location.hash);
          return;
        }
      }
    }
  };
  autoRedirectLocale();

  /* ---------- Snippets Data ---------- */
  let snippets = [];

  const loadSnippets = async () => {
    try {
      const indexPath = locale === 'en'
        ? '/data/snippets.json'
        : '/' + locale + '/data/snippets.json';
      const res = await fetch(indexPath);
      snippets = await res.json();
    } catch (e) {
      console.warn('Could not load snippets.json:', e);
    }
  };

  /* ==========================================================
     1. Search Overlay (⌘K / Ctrl+K)
     ========================================================== */
  const initSearch = () => {
    const overlay = document.querySelector('.search-overlay');
    const cmdBar = document.querySelector('.cmd-bar');
    if (!overlay) return;

    const input = overlay.querySelector('.search-input');
    const resultsContainer = overlay.querySelector('.search-results');
    let selectedIndex = -1;
    let visibleResults = [];

    const openSearch = () => {
      overlay.classList.add('active');
      if (input) {
        input.value = '';
        // Double requestAnimationFrame ensures focus after visibility transition
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            input.focus();
          });
        });
      }
      renderResults('');
    };

    const closeSearch = () => {
      overlay.classList.remove('active');
      selectedIndex = -1;
    };

    // Fuzzy match: check if query words appear in target string
    const fuzzyMatch = (query, text) => {
      const lower = text.toLowerCase();
      return query.toLowerCase().split(/\s+/).filter(Boolean)
        .every(word => lower.includes(word));
    };

    const renderResults = (query) => {
      if (!resultsContainer) return;

      if (!query.trim()) {
        visibleResults = snippets.slice(0, 12);
      } else {
        visibleResults = snippets.filter(s =>
          fuzzyMatch(query, s.title) ||
          fuzzyMatch(query, s.category) ||
          fuzzyMatch(query, s.summary) ||
          (Array.isArray(s.tags) && s.tags.some(t => fuzzyMatch(query, t)))
        );
      }

      selectedIndex = visibleResults.length > 0 ? 0 : -1;

      resultsContainer.innerHTML = visibleResults.map((s, i) => `
        <div class="search-result${i === 0 ? ' selected' : ''}" data-slug="${s.slug}" data-category="${s.category}">
          <div>
            <div class="title">${escapeHtml(s.title)}</div>
            <div class="desc">${escapeHtml(s.summary)}</div>
          </div>
          <span class="badge ${s.category}">${s.category}</span>
        </div>
      `).join('');

      // Click handlers on results
      resultsContainer.querySelectorAll('.search-result').forEach(el => {
        el.addEventListener('click', () => {
          window.location.href = localePrefix + '/' + el.dataset.category + '/' + el.dataset.slug + '.html';
        });
      });
    };

    const updateSelection = () => {
      const items = resultsContainer.querySelectorAll('.search-result');
      items.forEach((el, i) => {
        el.classList.toggle('selected', i === selectedIndex);
      });
      // Scroll selected into view
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
      }
    };

    // Keyboard shortcut: ⌘K / Ctrl+K
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
      if (e.key === 'Escape') {
        closeSearch();
      }
    });

    // Cmd-bar click
    if (cmdBar) {
      cmdBar.addEventListener('click', openSearch);
    }

    // Click backdrop to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });

    // Search input events
    if (input) {
      input.addEventListener('input', () => {
        renderResults(input.value);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (visibleResults.length > 0) {
            selectedIndex = (selectedIndex + 1) % visibleResults.length;
            updateSelection();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (visibleResults.length > 0) {
            selectedIndex = (selectedIndex - 1 + visibleResults.length) % visibleResults.length;
            updateSelection();
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedIndex >= 0 && visibleResults[selectedIndex]) {
            window.location.href = localePrefix + '/' + visibleResults[selectedIndex].category + '/' + visibleResults[selectedIndex].slug + '.html';
          }
        }
      });
    }
  };

  /* ==========================================================
     2. Category + JDK Dropdown Filters (homepage)
     ========================================================== */
  const initFilters = () => {
    const cards = document.querySelectorAll('.tip-card');
    if (!cards.length) return;

    let activeCategory = null;
    let activeJdk = null;
    let hasSelection = false;
    let showingAll = false;

    // LTS cycle ranges: each entry covers all versions introduced since the previous LTS
    const LTS_RANGES = {
      '11': [9, 11],
      '17': [12, 17],
      '21': [18, 21],
      '25': [22, 25]
    };

    const noResultsMsg = document.getElementById('noResultsMessage');
    const startMessage = document.getElementById('patternStartMessage');
    const showAllButton = document.getElementById('showAllButton');
    const isDiscoveryHome = !!showAllButton;
    hasSelection = !isDiscoveryHome;

    const updateShowAllButton = () => {
      if (!showAllButton) return;
      showAllButton.querySelector('.show-all-btn-text').textContent = showingAll
        ? showAllButton.dataset.hideLabel
        : showAllButton.dataset.showLabel;
    };

    const applyFilters = () => {
      let visibleCount = 0;
      cards.forEach(card => {
        const matchesCategory = !activeCategory || card.dataset.category === activeCategory;
        let matchesJdk = true;
        if (activeJdk) {
          const version = parseInt(card.dataset.jdk, 10);
          const range = LTS_RANGES[activeJdk];
          matchesJdk = range && version >= range[0] && version <= range[1];
        }
        const visible = hasSelection && matchesCategory && matchesJdk;
        card.classList.toggle('filter-hidden', !visible);
        if (visible) visibleCount++;
      });

      if (startMessage) {
        startMessage.hidden = hasSelection;
      }

      if (noResultsMsg) {
        noResultsMsg.style.display = hasSelection && visibleCount === 0 ? '' : 'none';
      }

      if (window.updateViewToggleState) {
        window.updateViewToggleState();
      }
    };

    // Generic helper to wire up a dropdown
    const initDropdown = (dropdownEl, dataAttribute, onSelect) => {
      if (!dropdownEl) return;
      const toggleBtn = dropdownEl.querySelector('.jdk-dropdown-toggle');
      const labelEl = dropdownEl.querySelector('.jdk-label');
      const list = dropdownEl.querySelector('ul');

      const openDropdown = () => {
        list.style.display = 'block';
        // Flip dropdown below button if not enough space above
        const rect = toggleBtn.getBoundingClientRect();
        const listHeight = list.offsetHeight;
        if (rect.top < listHeight + 12) {
          list.style.bottom = 'auto';
          list.style.top = 'calc(100% + 6px)';
        } else {
          list.style.top = 'auto';
          list.style.bottom = 'calc(100% + 6px)';
        }
        toggleBtn.setAttribute('aria-expanded', 'true');
      };

      const closeDropdown = () => {
        list.style.display = 'none';
        toggleBtn.setAttribute('aria-expanded', 'false');
      };

      const selectItem = (li) => {
        list.querySelectorAll('li').forEach(l => l.classList.remove('active'));
        li.classList.add('active');
        if (labelEl) labelEl.textContent = li.textContent.trim();
      };

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        list.style.display === 'block' ? closeDropdown() : openDropdown();
      });

      document.addEventListener('click', closeDropdown);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDropdown();
      });

      list.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          closeDropdown();
          selectItem(li);
          onSelect(li, toggleBtn);
        });
      });

      return { closeDropdown, setActive: (value) => {
        const target = list.querySelector(`li[data-${dataAttribute}="${value}"]`);
        if (target) {
          selectItem(target);
          toggleBtn.classList.toggle('has-filter', value !== 'all');
          return true;
        }
        return false;
      }};
    };

    // Category dropdown
    const categoryDropdown = document.getElementById('categoryDropdown');
    const catDropdownCtrl = initDropdown(categoryDropdown, 'filter', (li, toggleBtn) => {
      const category = li.dataset.filter;
      hasSelection = true;
      activeCategory = category !== 'all' ? category : null;
      showingAll = !activeCategory && !activeJdk;
      updateShowAllButton();
      toggleBtn.classList.toggle('has-filter', !!activeCategory);
      if (activeCategory) {
        history.replaceState(null, '', '#' + activeCategory);
      } else {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      applyFilters();
    });

    // JDK dropdown
    const jdkDropdown = document.getElementById('jdkDropdown');
    const jdkDropdownCtrl = initDropdown(jdkDropdown, 'jdk-filter', (li, toggleBtn) => {
      const version = li.dataset.jdkFilter;
      hasSelection = true;
      activeJdk = version !== 'all' ? version : null;
      showingAll = !activeCategory && !activeJdk;
      updateShowAllButton();
      toggleBtn.classList.toggle('has-filter', !!activeJdk);
      applyFilters();
    });

    if (showAllButton) {
      showAllButton.addEventListener('click', () => {
        activeCategory = null;
        activeJdk = null;
        if (catDropdownCtrl) catDropdownCtrl.setActive('all');
        if (jdkDropdownCtrl) jdkDropdownCtrl.setActive('all');
        history.replaceState(null, '', window.location.pathname + window.location.search);
        showingAll = !showingAll;
        hasSelection = showingAll;
        updateShowAllButton();
        applyFilters();
      });
    }

    // Apply filter from a given category string (or "all" / empty for no filter)
    const applyHashFilter = (category) => {
      if (category === 'browse-all' && showAllButton) {
        activeCategory = null;
        activeJdk = null;
        if (catDropdownCtrl) catDropdownCtrl.setActive('all');
        if (jdkDropdownCtrl) jdkDropdownCtrl.setActive('all');
        showingAll = true;
        hasSelection = true;
        updateShowAllButton();
        applyFilters();
        const section = document.getElementById('all-comparisons');
        if (section) section.scrollIntoView({ behavior: 'smooth' });
      } else if (category && catDropdownCtrl && catDropdownCtrl.setActive(category)) {
        hasSelection = true;
        activeCategory = category;
        showingAll = false;
        updateShowAllButton();
        applyFilters();
        const section = document.getElementById('all-comparisons');
        if (section) section.scrollIntoView({ behavior: 'smooth' });
      } else if (catDropdownCtrl) {
        catDropdownCtrl.setActive('all');
        activeCategory = null;
        hasSelection = !isDiscoveryHome;
        showingAll = false;
        updateShowAllButton();
        applyFilters();
      } else {
        // No filter dropdowns (e.g. topic pages) — show all cards
        applyFilters();
      }
    };

    // On load, a category hash reveals its matches; otherwise keep the discovery state.
    applyHashFilter(window.location.hash.slice(1));

    // Also react to browser back/forward hash changes
    window.addEventListener('hashchange', () => {
      applyHashFilter(window.location.hash.slice(1));
    });
  };

  /* ==========================================================
     3. Card Hover / Touch Toggle (homepage)
     ========================================================== */
  const initCardToggle = () => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    // Update hover hints for touch devices
    document.querySelectorAll('.hover-hint').forEach(hint => {
      hint.textContent = (window.i18n && window.i18n.touchHint) || '👆 tap or swipe →';
    });

    document.querySelectorAll('.tip-card').forEach(card => {
      let touchStartX = 0;
      let touchStartY = 0;
      let touchEndX = 0;
      let touchEndY = 0;

      // Track touch start
      card.addEventListener('touchstart', (e) => {
        // Only track touches on the card-code area
        if (!e.target.closest('.card-code')) return;
        
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
      }, { passive: true });

      // Handle touch end for swipe or tap
      // Note: passive:false allows us to preventDefault on tap/swipe while still allowing vertical scrolling
      card.addEventListener('touchend', (e) => {
        // Only handle touches on the card-code area
        if (!e.target.closest('.card-code')) return;

        // Don't handle touch events when in expanded mode
        const tipsGrid = document.getElementById('tipsGrid');
        if (tipsGrid && tipsGrid.classList.contains('expanded')) {
          return;
        }

        touchEndX = e.changedTouches[0].clientX;
        touchEndY = e.changedTouches[0].clientY;

        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);

        // Determine if it's a swipe (horizontal movement > 50px and more horizontal than vertical)
        const isHorizontalSwipe = absDeltaX > 50 && absDeltaX > absDeltaY;
        
        if (isHorizontalSwipe) {
          // Prevent default navigation for horizontal swipes
          e.preventDefault();
          // Swipe left = show modern, swipe right = show old
          if (deltaX < 0) {
            // Swipe left - show modern
            card.classList.add('toggled');
          } else {
            // Swipe right - show old
            card.classList.remove('toggled');
          }
        } else if (absDeltaX < 10 && absDeltaY < 10) {
          // It's a tap (movement under 10px threshold)
          e.preventDefault();
          card.classList.toggle('toggled');
        }
        // Note: Vertical scrolling (large deltaY, small deltaX) doesn't call preventDefault
      }, { passive: false });

      // Prevent click events on card-code from navigating (touch devices only)
      // This is a safety net in case touch events trigger click as fallback
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-code')) {
          // Don't prevent navigation when in expanded mode
          const tipsGrid = document.getElementById('tipsGrid');
          if (tipsGrid && tipsGrid.classList.contains('expanded')) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
        }
      });
    });
  };

  /* ==========================================================
     4. Copy-to-Clipboard (article pages)
     ========================================================== */
  const initCopyButtons = () => {
    document.querySelectorAll('.copy-btn, .command-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const codeBlock = btn.closest('.install-command')?.querySelector('code')
          || btn.closest('.code-header')?.nextElementSibling
          || btn.closest('.compare-panel-header')?.nextElementSibling?.querySelector('pre, code, .code-text')
          || btn.parentElement?.querySelector('pre, code, .code-text');
        if (!codeBlock) return;

        const text = codeBlock.textContent;
        const originalContent = btn.innerHTML;
        const originalLabel = btn.getAttribute('aria-label');
        const showCopied = () => {
          btn.classList.add('copied');
          if (btn.classList.contains('command-copy-btn')) {
            btn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m3 8.25 3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            btn.setAttribute('aria-label', 'Command copied');
          } else {
            btn.textContent = (window.i18n && window.i18n.copied) || 'Copied!';
          }
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = originalContent;
            if (originalLabel) btn.setAttribute('aria-label', originalLabel);
          }, 2000);
        };
        const fallbackCopy = () => {
          // Fallback for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          showCopied();
        };

        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(showCopied).catch(fallbackCopy);
        } else {
          fallbackCopy();
        }
      });
    });
  };

  /* ==========================================================
     5. Syntax Highlighting (Java)
     ========================================================== */
  const JAVA_KEYWORDS = new Set([
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch',
    'char', 'class', 'const', 'continue', 'default', 'do', 'double',
    'else', 'enum', 'extends', 'final', 'finally', 'float', 'for',
    'goto', 'if', 'implements', 'import', 'instanceof', 'int',
    'interface', 'long', 'module', 'native', 'new', 'null', 'package',
    'permits', 'private', 'protected', 'public', 'record', 'return',
    'sealed', 'short', 'static', 'strictfp', 'super', 'switch',
    'synchronized', 'this', 'throw', 'throws', 'transient', 'try',
    'var', 'void', 'volatile', 'when', 'while', 'yield'
  ]);

  const highlightJava = (code) => {
    const tokens = [];
    let i = 0;
    const len = code.length;

    while (i < len) {
      // Block comments: /* ... */
      if (code[i] === '/' && code[i + 1] === '*') {
        let end = code.indexOf('*/', i + 2);
        if (end === -1) end = len - 2;
        const text = code.slice(i, end + 2);
        tokens.push(`<span class="cmt">${escapeHtml(text)}</span>`);
        i = end + 2;
        continue;
      }

      // Line comments: // ...
      if (code[i] === '/' && code[i + 1] === '/') {
        let end = code.indexOf('\n', i);
        if (end === -1) end = len;
        const text = code.slice(i, end);
        tokens.push(`<span class="cmt">${escapeHtml(text)}</span>`);
        i = end;
        continue;
      }

      // Text blocks: """ ... """
      if (code[i] === '"' && code[i + 1] === '"' && code[i + 2] === '"') {
        let end = code.indexOf('"""', i + 3);
        if (end === -1) end = len - 3;
        const text = code.slice(i, end + 3);
        tokens.push(`<span class="str">${escapeHtml(text)}</span>`);
        i = end + 3;
        continue;
      }

      // String literals: "..."
      if (code[i] === '"') {
        let j = i + 1;
        while (j < len && code[j] !== '"') {
          if (code[j] === '\\') j++; // skip escaped char
          j++;
        }
        const text = code.slice(i, j + 1);
        tokens.push(`<span class="str">${escapeHtml(text)}</span>`);
        i = j + 1;
        continue;
      }

      // Char literals: '...'
      if (code[i] === "'") {
        let j = i + 1;
        while (j < len && code[j] !== "'") {
          if (code[j] === '\\') j++;
          j++;
        }
        const text = code.slice(i, j + 1);
        tokens.push(`<span class="str">${escapeHtml(text)}</span>`);
        i = j + 1;
        continue;
      }

      // Annotations: @Word
      if (code[i] === '@' && i + 1 < len && /[A-Za-z_]/.test(code[i + 1])) {
        let j = i + 1;
        while (j < len && /[\w]/.test(code[j])) j++;
        const text = code.slice(i, j);
        tokens.push(`<span class="ann">${escapeHtml(text)}</span>`);
        i = j;
        continue;
      }

      // Numbers: digits (including hex, binary, underscores, suffixes)
      if (/[0-9]/.test(code[i]) && (i === 0 || !/[\w]/.test(code[i - 1]))) {
        let j = i;
        // Hex/binary prefix
        if (code[j] === '0' && (code[j + 1] === 'x' || code[j + 1] === 'X' ||
            code[j + 1] === 'b' || code[j + 1] === 'B')) {
          j += 2;
        }
        while (j < len && /[0-9a-fA-F_]/.test(code[j])) j++;
        // Decimal part
        if (code[j] === '.' && /[0-9]/.test(code[j + 1])) {
          j++;
          while (j < len && /[0-9_]/.test(code[j])) j++;
        }
        // Exponent
        if (code[j] === 'e' || code[j] === 'E') {
          j++;
          if (code[j] === '+' || code[j] === '-') j++;
          while (j < len && /[0-9_]/.test(code[j])) j++;
        }
        // Type suffix (L, f, d)
        if (/[LlFfDd]/.test(code[j])) j++;
        const text = code.slice(i, j);
        tokens.push(`<span class="num">${escapeHtml(text)}</span>`);
        i = j;
        continue;
      }

      // Words: keywords, types, method calls
      if (/[A-Za-z_$]/.test(code[i])) {
        let j = i;
        while (j < len && /[\w$]/.test(code[j])) j++;
        const word = code.slice(i, j);

        // Look ahead for method call: word(
        let k = j;
        while (k < len && code[k] === ' ') k++;

        if (JAVA_KEYWORDS.has(word)) {
          tokens.push(`<span class="kw">${escapeHtml(word)}</span>`);
        } else if (code[k] === '(' && !/^[A-Z]/.test(word)) {
          tokens.push(`<span class="fn">${escapeHtml(word)}</span>`);
        } else if (/^[A-Z]/.test(word)) {
          tokens.push(`<span class="typ">${escapeHtml(word)}</span>`);
        } else {
          tokens.push(escapeHtml(word));
        }
        i = j;
        continue;
      }

      // Everything else: operators, punctuation, whitespace
      tokens.push(escapeHtml(code[i]));
      i++;
    }

    return tokens.join('');
  };

  const initSyntaxHighlighting = () => {
    document.querySelectorAll('.code-text').forEach(el => {
      // Skip if already highlighted
      if (el.dataset.highlighted) return;
      el.dataset.highlighted = 'true';

      const raw = el.textContent;
      el.innerHTML = highlightJava(raw);
    });
  };

  /* ==========================================================
     6. Newsletter Form
     ========================================================== */
  const initNewsletter = () => {
    const form = document.querySelector('.newsletter-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const box = form.closest('.newsletter-box');
      if (box) {
        box.innerHTML = '<p style="color: var(--accent); font-weight: 600;">Thanks! 🎉 You\'re on the list.</p>';
      } else {
        form.innerHTML = '<p style="color: var(--accent); font-weight: 600;">Thanks!</p>';
      }
    });
  };

  /* ==========================================================
     6. View Toggle (Expand/Collapse All Cards)
     ========================================================== */
  const initViewToggle = () => {
    const toggleBtn = document.getElementById('viewToggle');
    const tipsGrid = document.getElementById('tipsGrid');
    if (!toggleBtn || !tipsGrid) return;

    let isExpanded = false;

    const updateButtonState = () => {
      const visibleCards = document.querySelectorAll('.tip-card:not(.filter-hidden)');
      const hasVisibleCards = visibleCards.length > 0;
      
      toggleBtn.disabled = !hasVisibleCards;
      if (!hasVisibleCards) {
        toggleBtn.style.opacity = '0.5';
        toggleBtn.style.cursor = 'not-allowed';
      } else {
        toggleBtn.style.opacity = '1';
        toggleBtn.style.cursor = 'pointer';
      }
    };

    toggleBtn.addEventListener('click', () => {
      isExpanded = !isExpanded;
      
      if (isExpanded) {
        tipsGrid.classList.add('expanded');
        toggleBtn.querySelector('.view-toggle-icon').textContent = '⊟';
        toggleBtn.querySelector('.view-toggle-text').textContent = (window.i18n && window.i18n.collapseAll) || 'Collapse All';
        
        // Remove toggled class from all cards when expanding
        document.querySelectorAll('.tip-card').forEach(card => {
          card.classList.remove('toggled');
        });
      } else {
        tipsGrid.classList.remove('expanded');
        toggleBtn.querySelector('.view-toggle-icon').textContent = '⊞';
        toggleBtn.querySelector('.view-toggle-text').textContent = (window.i18n && window.i18n.expandAll) || 'Expand All';
      }
    });

    // Check initial state
    updateButtonState();

    // Make updateButtonState available for filter to call
    window.updateViewToggleState = updateButtonState;
  };

  /* ==========================================================
     7. Theme Toggle
     ========================================================== */
  const initThemeToggle = () => {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;

    const updateButton = (theme) => {
      btn.textContent = theme === 'dark' ? '☀️' : '🌙';
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    };

    // The anti-FOUC inline script already applied the theme; just sync the button state
    updateButton(document.documentElement.getAttribute('data-theme') || 'dark');

    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      updateButton(next);
    });
  };

  /* ==========================================================
     8. Locale Picker
     ========================================================== */
  const initLocalePicker = () => {
    const picker = document.getElementById('localePicker');
    if (!picker) return;

    const toggleBtn = picker.querySelector('.locale-toggle');
    const list = picker.querySelector('ul');

    const open = () => {
      list.style.display = 'block';
      toggleBtn.setAttribute('aria-expanded', 'true');
    };

    const close = () => {
      list.style.display = 'none';
      toggleBtn.setAttribute('aria-expanded', 'false');
    };

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      list.style.display === 'block' ? close() : open();
    });

    document.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    list.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetLocale = li.dataset.locale;
        if (targetLocale === locale) { close(); return; }

        // Rewrite current path for the target locale
        let path = location.pathname;

        // Strip current locale prefix if present
        if (locale !== 'en') {
          path = path.replace(new RegExp('^/' + locale.replace('-', '\\-')), '');
        }

        // Add target locale prefix
        if (targetLocale !== 'en') {
          path = '/' + targetLocale + path;
        }

        localStorage.setItem('preferred-locale', targetLocale);
        window.location.href = path;
      });
    });
  };

  /* ==========================================================
     9. Contribute Dropdown
     ========================================================== */
  const initContributeDropdown = () => {
    const dropdown = document.getElementById('contributeDropdown');
    if (!dropdown) return;

    const toggleBtn = dropdown.querySelector('.contribute-toggle');
    const list = dropdown.querySelector('ul');

    const open = () => {
      list.style.display = 'block';
      toggleBtn.setAttribute('aria-expanded', 'true');
    };

    const close = () => {
      list.style.display = 'none';
      toggleBtn.setAttribute('aria-expanded', 'false');
    };

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      list.style.display === 'block' ? close() : open();
    });

    document.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  };

  /* ==========================================================
     Utilities
     ========================================================== */
  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  /* ==========================================================
     Init
     ========================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    loadSnippets().then(() => {
      initSearch();
    });
    initFilters();
    initCardToggle();
    initViewToggle();
    initCopyButtons();
    initSyntaxHighlighting();
    initNewsletter();
    initThemeToggle();
    initLocalePicker();
    initContributeDropdown();
  });
})();
