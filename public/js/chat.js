/* ═══════════════════════════════════════════════════
   KARACHI BITES – Chat Widget
═══════════════════════════════════════════════════ */

(function () {
  // ── State ────────────────────────────────────────
  let sessionId = localStorage.getItem('kb_session_id') || generateSessionId();
  let isLoading = false;
  let isOpen = false;

  localStorage.setItem('kb_session_id', sessionId);

  // ── DOM refs ──────────────────────────────────────
  const toggle = document.getElementById('chat-toggle');
  const chatWindow = document.getElementById('chat-window');
  const closeBtn = document.getElementById('chatClose');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');
  const messagesContainer = document.getElementById('chatMessages');
  const badge = document.getElementById('chatBadge');

  // ── Session ID generator ───────────────────────────
  function generateSessionId() {
    return 'kb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // ── Open / Close ──────────────────────────────────
  function openChat() {
    isOpen = true;
    chatWindow.classList.remove('hidden');
    badge.classList.add('hidden');
    toggle.innerHTML = '<span style="font-size:1.4rem;color:#fff;">✕</span>';
    input.focus();

    // Show welcome message if no messages yet
    if (messagesContainer.children.length === 0) {
      showWelcome();
    }

    scrollToBottom();
  }

  function closeChat() {
    isOpen = false;
    chatWindow.classList.add('hidden');
    toggle.innerHTML = '<span class="chat-toggle-icon">💬</span><span class="chat-badge hidden" id="chatBadge">1</span>';
  }

  function toggleChat() {
    if (isOpen) closeChat(); else openChat();
  }

  // ── Welcome Message ───────────────────────────────
  function showWelcome() {
    const welcomeText = 'Welcome to **Karachi Bites**! 🍔\n\nI\'m Zara, your AI assistant. I can help you:\n• View our menu\n• Place an order\n• Answer your questions\n\nHow can I help you today?';
    appendMessage(welcomeText, 'bot');
  }

  // ── Append Message ────────────────────────────────
  function appendMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `message-${sender}`);

    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble');
    bubble.innerHTML = formatText(text);

    const timeEl = document.createElement('div');
    timeEl.classList.add('message-time');
    timeEl.textContent = formatTime(new Date());

    messageDiv.appendChild(bubble);
    messageDiv.appendChild(timeEl);
    messagesContainer.appendChild(messageDiv);

    scrollToBottom();
    return messageDiv;
  }

  // ── Order Confirmation Card ────────────────────────
  function appendOrderCard(orderId) {
    const card = document.createElement('div');
    card.classList.add('message', 'message-bot');

    const innerCard = document.createElement('div');
    innerCard.classList.add('order-confirm-card');
    innerCard.innerHTML = `
      <div class="order-icon">✅</div>
      <strong>Order Placed Successfully!</strong>
      <p>Your order is being processed.</p>
      <p>⏱ Estimated time: 30–45 minutes</p>
      <span class="order-id">📋 ${orderId}</span>
    `;

    card.appendChild(innerCard);
    messagesContainer.appendChild(card);
    scrollToBottom();
  }

  // ── Typing Indicator ──────────────────────────────
  function showTyping() {
    const typingDiv = document.createElement('div');
    typingDiv.classList.add('message', 'message-bot');
    typingDiv.id = 'typing-indicator';

    const indicator = document.createElement('div');
    indicator.classList.add('typing-indicator');
    indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

    typingDiv.appendChild(indicator);
    messagesContainer.appendChild(typingDiv);
    scrollToBottom();
  }

  function removeTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  // ── Send Message ──────────────────────────────────
  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isLoading) return;

    input.value = '';
    isLoading = true;
    sendBtn.disabled = true;

    appendMessage(text, 'user');
    showTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      });

      const data = await res.json();
      removeTyping();

      if (!res.ok) {
        appendMessage(data.error || 'Sorry, something went wrong. Please try again.', 'bot');
      } else {
        if (data.reply) {
          appendMessage(data.reply, 'bot');
        }
        if (data.orderCreated && data.orderId) {
          appendOrderCard(data.orderId);
        }
      }
    } catch (err) {
      removeTyping();
      appendMessage('Connection error. Please check your internet and try again.', 'bot');
    }

    isLoading = false;
    sendBtn.disabled = false;
    input.focus();
  }

  // ── Format Text (light markdown) ──────────────────
  function formatText(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br />');
  }

  // ── Format Time ───────────────────────────────────
  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── Scroll to Bottom ──────────────────────────────
  function scrollToBottom() {
    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 50);
  }

  // ── Event Listeners ───────────────────────────────
  toggle.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', closeChat);
  sendBtn.addEventListener('click', sendMessage);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // "Order" buttons on menu cards
  document.querySelectorAll('.add-to-chat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.getAttribute('data-item');
      if (!isOpen) openChat();
      setTimeout(() => {
        input.value = `I'd like to order ${item}`;
        input.focus();
      }, 100);
    });
  });

  // Hero & nav "Order Now" buttons
  const heroBtn = document.getElementById('heroOrderBtn');
  const navBtn = document.getElementById('navOrderBtn');

  if (heroBtn) {
    heroBtn.addEventListener('click', () => {
      if (!isOpen) openChat();
    });
  }

  if (navBtn) {
    navBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!isOpen) openChat();
    });
  }

  // ── Navbar scroll effect ──────────────────────────
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    });
  }

  // ── Mobile nav toggle ─────────────────────────────
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });

    // Close nav when a link is clicked
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // ── Menu tabs ─────────────────────────────────────
  const menuTabs = document.querySelectorAll('.menu-tab');
  const menuGrids = document.querySelectorAll('.menu-grid');

  menuTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      menuTabs.forEach(t => t.classList.remove('active'));
      menuGrids.forEach(g => g.classList.add('hidden'));

      tab.classList.add('active');
      const category = tab.getAttribute('data-category');
      const grid = document.getElementById(`cat-${category}`);
      if (grid) grid.classList.remove('hidden');
    });
  });

  // Show welcome badge after 2 seconds if chat not opened
  setTimeout(() => {
    if (!isOpen) {
      const b = document.getElementById('chatBadge') || badge;
      if (b) b.classList.remove('hidden');
    }
  }, 2000);

})();
