(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__GY_CHATBOT_BOOTED__) return;

  var script = document.currentScript;
  if (!(script instanceof HTMLScriptElement)) {
    script = document.querySelector('script[data-gy-chatbot-loader="true"]');
  }
  if (!(script instanceof HTMLScriptElement)) return;

  var dataset = script.dataset || {};
  var enabled = parseBoolean(dataset.enabled, true);
  if (!enabled) return;

  window.__GY_CHATBOT_BOOTED__ = true;

  var config = {
    site: dataset.site || 'marketing',
    title: dataset.title || 'Gameye AI Assistant',
    greeting:
      dataset.greeting ||
      'Ask about setup, regions, sessions, pricing, or migration and I will point you to the right source.',
    apiEndpoint: dataset.apiEndpoint || '',
    minConfidence: parseNumber(dataset.minConfidence, 0.62),
    stylesheet: dataset.stylesheet || '/chatbot/chatbot.css',
    primaryLabel: dataset.primaryLabel || defaultPrimaryLabel(dataset.site || 'marketing'),
    primaryUrl: dataset.primaryUrl || defaultPrimaryUrl(dataset.site || 'marketing'),
    secondaryLabel: dataset.secondaryLabel || 'Contact support',
    secondaryUrl: dataset.secondaryUrl || 'https://gameye.com/contact-us/',
    requestTimeoutMs: 12000,
  };

  ensureStylesheet(config.stylesheet);

  var root = document.createElement('section');
  root.className = 'gy-chatbot-root';
  root.setAttribute('data-gy-chatbot', 'true');
  root.innerHTML =
    '<button class="gy-chatbot-launcher" type="button" aria-expanded="false" aria-controls="gy-chatbot-panel">AI Assistant</button>' +
    '<div class="gy-chatbot-panel" id="gy-chatbot-panel" hidden>' +
    '<header class="gy-chatbot-header">' +
    '<h2 class="gy-chatbot-title"></h2>' +
    '<button class="gy-chatbot-close" type="button" aria-label="Close assistant">Close</button>' +
    '</header>' +
    '<div class="gy-chatbot-messages" role="log" aria-live="polite"></div>' +
    '<form class="gy-chatbot-form">' +
    '<label class="gy-chatbot-label" for="gy-chatbot-input">Your question</label>' +
    '<div class="gy-chatbot-input-row">' +
    '<input class="gy-chatbot-input" id="gy-chatbot-input" type="text" maxlength="300" placeholder="Ask a question..." required />' +
    '<button class="gy-chatbot-submit" type="submit">Send</button>' +
    '</div>' +
    '</form>' +
    '<p class="gy-chatbot-footnote">Citations are included when available. Confidence gates route uncertain answers.</p>' +
    '</div>';

  document.body.appendChild(root);

  var launcher = root.querySelector('.gy-chatbot-launcher');
  var panel = root.querySelector('.gy-chatbot-panel');
  var closeBtn = root.querySelector('.gy-chatbot-close');
  var title = root.querySelector('.gy-chatbot-title');
  var messages = root.querySelector('.gy-chatbot-messages');
  var form = root.querySelector('.gy-chatbot-form');
  var input = root.querySelector('.gy-chatbot-input');

  if (!(launcher instanceof HTMLButtonElement)) return;
  if (!(panel instanceof HTMLElement)) return;
  if (!(closeBtn instanceof HTMLButtonElement)) return;
  if (!(title instanceof HTMLElement)) return;
  if (!(messages instanceof HTMLElement)) return;
  if (!(form instanceof HTMLFormElement)) return;
  if (!(input instanceof HTMLInputElement)) return;

  title.textContent = config.title;

  var chatHistory = [];

  addMessage('assistant', config.greeting, {
    citations: [
      {
        title: 'Gameye Docs',
        url: 'https://docs.gameye.com/',
        snippet: 'Canonical API and operational guides.',
      },
    ],
  });

  launcher.addEventListener('click', function () {
    var isOpen = !panel.hidden;
    if (isOpen) {
      closePanel();
      return;
    }
    openPanel();
    track('gy_chatbot_opened', {
      site: config.site,
      page_url: window.location.href,
    });
  });

  closeBtn.addEventListener('click', closePanel);

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !panel.hidden) {
      closePanel();
    }
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var query = input.value.trim();
    if (!query) return;

    input.value = '';
    addMessage('user', query);
    chatHistory.push({ role: 'user', content: query });

    track('gy_chatbot_question_submitted', {
      site: config.site,
      question_length: query.length,
      page_url: window.location.href,
    });

    var typingNode = addTypingIndicator();

    requestAssistantResponse(query, chatHistory)
      .then(function (response) {
        removeNode(typingNode);

        if (!response || typeof response !== 'object') {
          throw new Error('Assistant response missing');
        }

        var normalized = normalizeResponse(response);
        var lowConfidence =
          normalized.lowConfidence || normalized.confidence < config.minConfidence || !normalized.answer;

        if (lowConfidence) {
          var fallbackLinks = resolveFallbackLinks(config, normalized.fallback);
          addMessage(
            'assistant',
            normalized.answer ||
              'I am not confident enough to answer directly yet. Use one of these routes for verified support.',
            {
              citations: normalized.citations,
              fallbackLinks: fallbackLinks,
            }
          );

          track('gy_chatbot_fallback_routed', {
            site: config.site,
            confidence: normalized.confidence,
            threshold: config.minConfidence,
            request_id: normalized.requestId || '',
            page_url: window.location.href,
          });
        } else {
          addMessage('assistant', normalized.answer, {
            citations: normalized.citations,
          });
        }

        chatHistory.push({ role: 'assistant', content: normalized.answer || '' });

        track('gy_chatbot_response_received', {
          site: config.site,
          confidence: normalized.confidence,
          low_confidence: lowConfidence,
          citation_count: normalized.citations.length,
          request_id: normalized.requestId || '',
          page_url: window.location.href,
        });
      })
      .catch(function () {
        removeNode(typingNode);

        var fallbackLinks = resolveFallbackLinks(config, null);
        addMessage(
          'assistant',
          'I could not complete that request right now. Please use one of these direct routes.',
          { fallbackLinks: fallbackLinks }
        );

        track('gy_chatbot_error', {
          site: config.site,
          page_url: window.location.href,
        });
      });
  });

  function openPanel() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    root.setAttribute('data-open', 'true');
    setTimeout(function () {
      input.focus();
    }, 0);
  }

  function closePanel() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    root.setAttribute('data-open', 'false');
  }

  function addMessage(role, text, options) {
    var safeOptions = options || {};
    var wrapper = document.createElement('article');
    wrapper.className = 'gy-chatbot-message gy-chatbot-message--' + role;

    var bubble = document.createElement('div');
    bubble.className = 'gy-chatbot-bubble';
    var paragraph = document.createElement('p');
    paragraph.textContent = text;
    bubble.appendChild(paragraph);

    var citations = Array.isArray(safeOptions.citations) ? safeOptions.citations : [];
    if (citations.length > 0) {
      var citationList = document.createElement('ul');
      citationList.className = 'gy-chatbot-citations';

      citations.forEach(function (citation) {
        var item = document.createElement('li');
        var link = document.createElement('a');
        link.href = citation.url;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = citation.title || citation.url;

        link.addEventListener('click', function () {
          track('gy_chatbot_citation_clicked', {
            site: config.site,
            citation_url: citation.url,
            page_url: window.location.href,
          });
        });

        item.appendChild(link);

        if (citation.snippet) {
          var snippet = document.createElement('small');
          snippet.textContent = citation.snippet;
          item.appendChild(snippet);
        }

        citationList.appendChild(item);
      });

      bubble.appendChild(citationList);
    }

    var fallbackLinks = Array.isArray(safeOptions.fallbackLinks) ? safeOptions.fallbackLinks : [];
    if (fallbackLinks.length > 0) {
      var actions = document.createElement('div');
      actions.className = 'gy-chatbot-fallback-actions';

      fallbackLinks.forEach(function (linkData) {
        var action = document.createElement('a');
        action.href = linkData.url;
        action.className = 'gy-chatbot-fallback-link';
        action.textContent = linkData.label;
        action.addEventListener('click', function () {
          track('gy_chatbot_fallback_link_clicked', {
            site: config.site,
            link_url: linkData.url,
            label: linkData.label,
            page_url: window.location.href,
          });
        });
        actions.appendChild(action);
      });

      bubble.appendChild(actions);
    }

    wrapper.appendChild(bubble);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
    return wrapper;
  }

  function addTypingIndicator() {
    var wrapper = document.createElement('article');
    wrapper.className = 'gy-chatbot-message gy-chatbot-message--assistant gy-chatbot-typing';

    var bubble = document.createElement('div');
    bubble.className = 'gy-chatbot-bubble';
    bubble.textContent = 'Thinking...';

    wrapper.appendChild(bubble);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
    return wrapper;
  }

  async function requestAssistantResponse(query, history) {
    if (!config.apiEndpoint) {
      return buildLocalResponse(query, config.site);
    }

    var controller = new AbortController();
    var timeout = setTimeout(function () {
      controller.abort();
    }, config.requestTimeoutMs);

    try {
      var response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gy-chatbot-site': config.site,
        },
        body: JSON.stringify({
          query: query,
          history: history.slice(-8),
          context: {
            site: config.site,
            pageUrl: window.location.href,
            pageTitle: document.title,
            language: document.documentElement.lang || 'en',
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Assistant endpoint returned ' + response.status);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function buildLocalResponse(query, site) {
    var lowered = query.toLowerCase();
    var knowledge = [
      {
        keywords: ['pricing', 'estimate', 'cost', 'monthly'],
        answer:
          'Use the pricing estimator to model monthly orchestration cost, then validate assumptions with support for production workloads.',
        confidence: 0.81,
        citations: [
          {
            title: 'Pricing estimator',
            url: 'https://gameye.com/pricing/',
            snippet: 'Interactive cost model by workload profile and region strategy.',
          },
        ],
      },
      {
        keywords: ['api', 'session', 'openapi', 'reference'],
        answer:
          'Use the canonical OpenAPI reference for request/response details and version-safe session lifecycle flows.',
        confidence: 0.84,
        citations: [
          {
            title: 'Gameye API reference',
            url: 'https://docs.gameye.com/api/reference',
            snippet: 'Canonical operations for session run, list, describe, stop, and logs.',
          },
        ],
      },
      {
        keywords: ['region', 'location', 'latency', 'deploy'],
        answer:
          'Choose primary and fallback regions together, then validate available locations before launching sessions.',
        confidence: 0.74,
        citations: [
          {
            title: 'Regions and locations',
            url: 'https://docs.gameye.com/api/regions-and-locations',
            snippet: 'Region strategy and location behavior for Gameye orchestration.',
          },
        ],
      },
      {
        keywords: ['docker', 'image', 'container'],
        answer:
          'Confirm your Docker image structure and publish flow first, then run sessions using the validated image tags.',
        confidence: 0.72,
        citations: [
          {
            title: 'Working with Docker',
            url: 'https://docs.gameye.com/guides/working-with-docker',
            snippet: 'Build, push, and validate game server images for Gameye sessions.',
          },
        ],
      },
      {
        keywords: ['support', 'incident', 'error', 'identifier'],
        answer:
          'For incidents, include the API identifier and region details so support can trace and resolve quickly.',
        confidence: 0.76,
        citations: [
          {
            title: 'Getting support',
            url: 'https://docs.gameye.com/guides/getting-support',
            snippet: 'Escalation paths and information to include with production-impacting issues.',
          },
        ],
      },
    ];

    var best = null;
    var bestScore = 0;

    knowledge.forEach(function (item) {
      var score = item.keywords.reduce(function (total, keyword) {
        return total + (lowered.indexOf(keyword) >= 0 ? 1 : 0);
      }, 0);

      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    });

    if (best && bestScore > 0) {
      return {
        answer: best.answer,
        confidence: best.confidence,
        citations: best.citations,
        lowConfidence: best.confidence < config.minConfidence,
        requestId: 'local-' + site,
      };
    }

    return {
      answer:
        'I do not have enough confidence from local knowledge to answer this safely. Please use a direct support route.',
      confidence: 0.33,
      citations: [],
      lowConfidence: true,
      requestId: 'local-' + site,
    };
  }

  function normalizeResponse(raw) {
    var citationsRaw = raw.citations || raw.sources || raw.references || [];

    return {
      answer: toText(raw.answer || raw.message || ''),
      confidence: parseNumber(raw.confidence != null ? raw.confidence : raw.score, 0),
      citations: normalizeCitations(citationsRaw),
      lowConfidence: Boolean(raw.lowConfidence),
      requestId: toText(raw.requestId || raw.traceId || ''),
      fallback: normalizeFallback(raw.fallback),
    };
  }

  function normalizeCitations(citationsRaw) {
    if (!Array.isArray(citationsRaw)) return [];

    return citationsRaw
      .map(function (item) {
        if (!item) return null;

        if (typeof item === 'string') {
          return {
            title: item,
            url: item,
            snippet: '',
          };
        }

        var url = toText(item.url || item.href || item.link || '');
        if (!url) return null;

        return {
          title: toText(item.title || item.label || url),
          url: url,
          snippet: toText(item.snippet || item.description || ''),
        };
      })
      .filter(Boolean)
      .slice(0, 4);
  }

  function normalizeFallback(fallbackRaw) {
    if (!fallbackRaw || typeof fallbackRaw !== 'object') return null;

    var primary = fallbackRaw.primary || fallbackRaw.first || null;
    var secondary = fallbackRaw.secondary || fallbackRaw.second || null;

    return {
      primaryLabel: toText((primary && primary.label) || fallbackRaw.primaryLabel || ''),
      primaryUrl: toText((primary && primary.url) || fallbackRaw.primaryUrl || ''),
      secondaryLabel: toText((secondary && secondary.label) || fallbackRaw.secondaryLabel || ''),
      secondaryUrl: toText((secondary && secondary.url) || fallbackRaw.secondaryUrl || ''),
    };
  }

  function resolveFallbackLinks(baseConfig, responseFallback) {
    var primaryLabel =
      toText(responseFallback && responseFallback.primaryLabel) || baseConfig.primaryLabel;
    var primaryUrl = toText(responseFallback && responseFallback.primaryUrl) || baseConfig.primaryUrl;
    var secondaryLabel =
      toText(responseFallback && responseFallback.secondaryLabel) || baseConfig.secondaryLabel;
    var secondaryUrl =
      toText(responseFallback && responseFallback.secondaryUrl) || baseConfig.secondaryUrl;

    return [
      { label: primaryLabel, url: toAbsoluteUrl(primaryUrl) },
      { label: secondaryLabel, url: toAbsoluteUrl(secondaryUrl) },
    ].filter(function (item) {
      return item.label && item.url;
    });
  }

  function ensureStylesheet(href) {
    if (!href) return;
    if (document.querySelector('link[data-gy-chatbot-style="true"]')) return;

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-gy-chatbot-style', 'true');
    document.head.appendChild(link);
  }

  function parseBoolean(value, fallback) {
    if (typeof value !== 'string') return fallback;
    var normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
  }

  function parseNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function toText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function toAbsoluteUrl(value) {
    var text = toText(value);
    if (!text) return '';

    try {
      return new URL(text, window.location.origin).toString();
    } catch (error) {
      return '';
    }
  }

  function defaultPrimaryLabel(site) {
    return site === 'docs' ? 'Open troubleshooting' : 'Open docs';
  }

  function defaultPrimaryUrl(site) {
    return site === 'docs' ? '/troubleshooting' : 'https://docs.gameye.com/';
  }

  function removeNode(node) {
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  function track(eventName, detail) {
    var payload = detail || {};

    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: payload,
      })
    );

    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push(
        Object.assign(
          {
            event: eventName,
            component: 'gameye_ai_chatbot',
          },
          payload
        )
      );
    }
  }
})();
