/* ============================================================
   Tablecraft · static studio client
   Hash routing · JSON API · agent runs · settings
   ============================================================ */

(() => {
  "use strict";

  const API = "/api";
  const STAGE_KEYS = ["ruleset", "visuals", "simulation"];
  const STAGE_META = {
    ruleset: {
      label: "Ruleset",
      blurb: "Procedures, edge cases, component constraints",
      tab: "ruleset",
    },
    visuals: {
      label: "Visuals",
      blurb: "Art direction, asset library, print prep",
      tab: "assets",
    },
    simulation: {
      label: "Simulation",
      blurb: "Monte Carlo matches, balance, tuning",
      tab: "playtests",
    },
  };
  const TAB_KEYS = ["summary", "ruleset", "assets", "model", "code"];

  let fcState = { nodes: [], edges: [], selected: null, drag: null, pan: { x: 0, y: 0 } };
  let fcProject = null;
  const state = {
    editing: {},
    tabChats: {},
    tabChatThinking: {},
    projects: [],
    projectsLoaded: false,
    health: null,
    settings: null,
    providers: [],
    framework: null,
    activeProject: null,
    activeRuns: [],
    activeTab: "ruleset",
    codeIndex: {},
    drafts: {},
    agentBusy: false,
    renderSeq: 0,
    lastRoute: "",
    toastTimer: null,
    pendingScroll: "",
  };

  const $ = (selector, scope = document) => scope.querySelector(selector);

  /* ------------------------------ utilities ------------------------------ */

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function money(value) {
    return Number(value || 0).toLocaleString("en-US");
  }

  function timeAgo(iso) {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "";
    const diff = Date.now() - then;
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.round(months / 12)}y ago`;
  }

  function dateShort(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function statusClass(status = "") {
    const value = String(status).toLowerCase();
    if (/(final|passed|complete|connected|live|active|ok)/.test(value)) return "good";
    if (/(review|tuning|development|warning|prototype|in progress)/.test(value)) return "warm";
    if (/(draft|playtest|concept|new)/.test(value)) return "cool";
    return "neutral";
  }

  function progressBar(percent) {
    const safe = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    return `<div class="progress"><span style="width:${safe}%"></span></div>`;
  }

  function providerName(id) {
    const found = state.providers.find((item) => item.id === id);
    return found ? found.name : id || "unknown";
  }

  function catalogProvider(id) {
    return state.providers.find((item) => item.id === id) || null;
  }

  function projectTabHref(project, tab) {
    return `#/project/${encodeURIComponent(project.id)}/${tab}`;
  }

  function setCrumbs(html) {
    const crumbs = $("#crumbs");
    if (crumbs) crumbs.innerHTML = html;
  }

  function setNav(name) {
    document.querySelectorAll(".side-nav a[data-nav]").forEach((link) => {
      link.classList.toggle("active", link.dataset.nav === name);
    });
  }

  function setButtonBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.idleLabel) button.dataset.idleLabel = button.innerHTML;
      button.disabled = true;
      button.innerHTML = label || "Working…";
    } else {
      button.disabled = false;
      if (button.dataset.idleLabel) button.innerHTML = button.dataset.idleLabel;
    }
  }

  let toastTimer = null;
  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message || "";
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 4600);
  }

  /* -------------------------------- markdown ------------------------------ */

  function inlineMd(text) {
    let output = escapeHtml(text);
    output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
    return output;
  }

  function markdown(text) {
    if (!text) return "";
    const lines = String(text).replace(/\r\n/g, "\n").split("\n");
    let html = "";
    let list = null;
    const closeList = () => {
      if (list) {
        html += `</${list}>`;
        list = null;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        closeList();
        continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        closeList();
        const level = Math.min(6, heading[1].length + 2);
        html += `<h${level}>${inlineMd(heading[2])}</h${level}>`;
        continue;
      }
      const quote = line.match(/^>\s?(.*)$/);
      if (quote) {
        closeList();
        html += `<blockquote style="border-left:3px solid var(--accent);padding:6px 12px;margin:8px 0;color:var(--ink-soft);background:var(--accent-soft);border-radius:0 6px 6px 0;">${inlineMd(quote[1])}</blockquote>`;
        continue;
      }
      const bullet = line.match(/^[-*]\s+(.*)$/);
      if (bullet) {
        if (list !== "ul") {
          closeList();
          html += "<ul>";
          list = "ul";
        }
        html += `<li>${inlineMd(bullet[1])}</li>`;
        continue;
      }
      const numbered = line.match(/^\d+[.)]\s+(.*)$/);
      if (numbered) {
        if (list !== "ol") {
          closeList();
          html += "<ol>";
          list = "ol";
        }
        html += `<li>${inlineMd(numbered[1])}</li>`;
        continue;
      }
      closeList();
      html += `<p>${inlineMd(line)}</p>`;
    }
    closeList();
    return html;
  }

  /* ---------------------------------- API --------------------------------- */

  async function api(path, options = {}) {
    const config = {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    };
    if (options.body !== undefined) {
      config.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }
    let response;
    try {
      response = await fetch(API + path, config);
    } catch (error) {
      throw new Error("The studio API is unreachable. Start it with python3 run.py.");
    }
    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }
    if (!response.ok) {
      const detail = data && (data.detail || data.message);
      throw new Error(typeof detail === "string" ? detail : `Request failed (${response.status})`);
    }
    return data;
  }

  async function loadProjects(force = false) {
    if (state.projectsLoaded && !force) return state.projects;
    const data = await api("/projects");
    state.projects = data.projects || [];
    state.projectsLoaded = true;
    return state.projects;
  }

  async function refreshHealth() {
    try {
      state.health = await api("/health");
    } catch (error) {
      state.health = null;
    }
    paintHealth();
    return state.health;
  }

  async function loadSettings(force = false) {
    if (state.settings && state.framework && !force) return;
    const [settingsData, frameworkData] = await Promise.all([api("/settings"), api("/framework")]);
    state.settings = settingsData.settings;
    state.providers = settingsData.providers || [];
    state.framework = frameworkData;
  }

  function paintHealth() {
    const health = state.health;
    const online = Boolean(health && health.status === "ok");
    const demo = online && health.demo_mode;
    const provider = online ? health.provider : "";
    const model = online ? health.model : "";

    const dotState = online ? "" : "offline";
    const sideDot = $("#side-dot");
    const topDot = $("#top-dot");
    if (sideDot) sideDot.className = `dot ${dotState}`.trim();
    if (topDot) topDot.className = `dot ${dotState}`.trim();

    const sideLabel = $("#side-status-label");
    if (sideLabel) {
      sideLabel.textContent = online
        ? demo
          ? "Demo framework"
          : "Provider connected"
        : "API offline";
    }

    const sideProvider = $("#side-provider");
    if (sideProvider) {
      sideProvider.textContent = online ? `${provider} · ${model}` : "Start python3 run.py";
    }

    const topLabel = $("#top-api-label");
    if (topLabel) {
      topLabel.textContent = online ? (demo ? "Demo mode" : `${provider} · ${model}`) : "API offline";
    }

    const heroStatus = $("#hero-status");
    if (heroStatus) {
      heroStatus.className = `status ${online ? "good" : "neutral"}`;
      heroStatus.textContent = online ? "Studio online" : "Studio offline";
    }
  }

  /* -------------------------------- router -------------------------------- */

  function parseRoute() {
    const raw = window.location.hash.replace(/^#/, "") || "/";
    const parts = raw.split("/").filter(Boolean);
    if (parts[0] === "project" && parts[1]) {
      return {
        name: "project",
        id: decodeURIComponent(parts[1]),
        tab: parts[2] || "",
        key: `project/${parts[1]}`,
      };
    }
    if (parts[0] === "projects") return { name: "projects", key: "projects" };
    if (parts[0] === "chat") return { name: "chat", key: "chat" };
    if (parts[0] === "new") return { name: "new", key: "new" };
    if (parts[0] === "settings") return { name: "settings", key: "settings" };
    if (parts[0] === "compose") return { name: "landing", compose: true, key: "compose" };
    return { name: "landing", key: "landing" };
  }

  async function render() {
    const seq = ++state.renderSeq;
    const route = parseRoute();
    const routeChanged = state.lastRoute !== route.key;
    state.lastRoute = route.key;

    if (routeChanged) window.scrollTo(0, 0);

    try {
      if (route.name === "landing" || route.name === "projects") {
        setNav(route.name === "landing" ? "studio" : "projects");
        await loadProjects();
        if (seq !== state.renderSeq) return;
        if (route.name === "landing") {
          renderLanding(route);
        } else {
          renderProjects();
        }
      } else if (route.name === "project") {
        setNav("projects");
        setCrumbs(
          `<a href="#/">Studio</a><span class="sep">/</span><a href="#/projects">Projects</a><span class="sep">/</span><span class="current">Loading…</span>`,
        );
        const data = await api(`/projects/${encodeURIComponent(route.id)}`);
        if (seq !== state.renderSeq) return;
        state.activeProject = data.project;
        state.activeRuns = data.runs || [];
        state.activeTab = TAB_KEYS.includes(route.tab) ? route.tab : "summary";
        renderProject();
      } else if (route.name === "new") {
        setNav("studio");
        document.title = "New game — Tablecraft";
        setCrumbs(`<a href="#/">Studio</a><span class="sep">/</span><span class="current">New game</span>`);
        renderNewGame();
      } else if (route.name === "chat") {
        setNav("chat");
        document.title = "Chat — Tablecraft";
        setCrumbs(`<a href="#/">Studio</a><span class="sep">/</span><span class="current">Chat</span>`);
        renderChat();
      } else if (route.name === "settings") {
        setNav("settings");
        await Promise.all([loadSettings(), refreshHealth()]);
        if (seq !== state.renderSeq) return;
        renderSettings();
        detectLocalModels();
        if (state.settings && state.settings.provider === "local") {
          updateProviderFields("local");
        }
        if (state.pendingScroll) {
          const target = state.pendingScroll;
          state.pendingScroll = "";
          scrollToSection(target);
        }
      }
    } catch (error) {
      if (seq !== state.renderSeq) return;
      renderError(error);
    }
  }

  function go(hash) {
    if (window.location.hash === hash) {
      render();
    } else {
      window.location.hash = hash;
    }
  }

  function scrollToSection(id) {
    let tries = 0;
    const tick = () => {
      const node = document.getElementById(id);
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (tries++ < 12) {
        setTimeout(tick, 90);
      }
    };
    tick();
  }

  /* -------------------------------- landing ------------------------------- */

  function projectCard(project) {
    const progress = project.progress || {};
    return `
      <a class="project-card" href="#/project/${encodeURIComponent(project.id)}">
        <div class="cover">${project.cover_svg || ""}</div>
        <div class="card-body">
          <div class="card-top">
            <span class="status ${statusClass(project.status)}">${escapeHtml(project.status)}</span>
            <span class="card-genre">${escapeHtml(project.genre)}</span>
          </div>
          <h3>${escapeHtml(project.name)}</h3>
          <p class="card-tagline">${escapeHtml(project.tagline)}</p>
          <div class="card-meta">
            <span>${escapeHtml(project.players)} players</span>
            <span>${escapeHtml(project.playtime)}</span>
            <span>${escapeHtml(project.age)}</span>
          </div>
          <div class="card-footer">
            <span>Updated ${timeAgo(project.updated_at)}</span>
            <span class="card-open">Open →</span>
          </div>
        </div>
      </a>`;
  }

  function renderLanding(route) {
    const projects = state.projects || [];
    const shown = projects.slice(0, 3);
    const playtests = projects.reduce((sum, project) => sum + (project.playtests?.length || 0), 0);
    const avg = projects.length
      ? Math.round(
          projects.reduce((sum, project) => {
            const progress = project.progress || {};
            const total = STAGE_KEYS.reduce((inner, key) => inner + (Number(progress[key]) || 0), 0);
            return sum + total / STAGE_KEYS.length;
          }, 0) / projects.length,
        )
      : 0;
    const updated = projects.length ? timeAgo(projects[0].updated_at) : "new";

    document.title = "Tablecraft — Board game design studio";
    setCrumbs(`<span class="current">Studio</span>`);

    const cards = shown.length
      ? shown.map(projectCard).join("")
      : `<div class="empty" style="grid-column:1/-1"><h3>No projects yet.</h3><p>Describe a game above and the studio will lay the foundation.</p></div>`;

    const view = $("#view");
    view.innerHTML = `
      <section class="hero-grid">
        <div class="hero">
          <span class="kicker accent">Board game design studio</span>
          <h1>Make a game worth <em>playing.</em></h1>
          <p class="hero-lede">
            Tablecraft is a studio agent for board game design. Bring a sentence; leave with a
            testable ruleset, a print-aware visual library, and virtual playtests that stress the
            balance before anyone sits down at the table.
          </p>
          <div class="hero-note">
            <span id="hero-status" class="status ${state.health && state.health.status === "ok" ? "good" : "neutral"}">
              ${state.health && state.health.status === "ok" ? "Studio online" : "Studio offline"}
            </span>
            Ruleset → visuals → simulation, in one continuous loop.
          </div>
        </div>

        <aside class="pipeline-card">
          <div class="pipeline-head">
            <span class="kicker">The studio loop</span>
            <span class="live-badge">Agent runtime</span>
          </div>
          <div class="pipeline-step">
            <span class="step-num">01</span>
            <div>
              <div class="step-title">Ruleset</div>
              <p>Rulesmith turns intent into procedures, edge cases, and a component manifest.</p>
            </div>
          </div>
          <div class="pipeline-step">
            <span class="step-num">02</span>
            <div>
              <div class="step-title">Visuals</div>
              <p>Artificer writes art direction, generates cover and asset concepts, and checks print constraints.</p>
            </div>
          </div>
          <div class="pipeline-step">
            <span class="step-num">03</span>
            <div>
              <div class="step-title">Simulation</div>
              <p>Playtester runs abstract matches, surfaces balance risk, and proposes tuning.</p>
            </div>
          </div>
          <div class="pipeline-foot">
            <span>Director → specialist → critic</span>
            <strong>${projects.length} projects · ${playtests} playtests</strong>
          </div>
        </aside>
      </section>

      <div class="composer-label" id="composer">
        <div>
          <span class="kicker">Start here</span>
          <h2>Start a new game.</h2>
        </div>
        <span class="note">Answer a few questions and the studio sets up the folder.</span>
      </div>

      <div class="composer-card" style="text-align:center;padding:32px 24px;">
        <div class="focus-tags" style="justify-content:center;">
          <span class="focus-tag">Players</span>
          <span class="focus-tag">Type</span>
          <span class="focus-tag">Medium</span>
          <span class="focus-tag">Style</span>
          <span class="focus-tag">References</span>
        </div>
        <p class="composer-hint" style="margin:14px 0 18px;">Each step is skippable. After the folder is created, each section gets its own prompt box.</p>
        <a class="btn primary" href="#/new" style="min-width:220px;">Start a new game</a>
      </div>

      <div class="section-head">
        <div>
          <span class="kicker">The shelf</span>
          <h2>Projects in the studio</h2>
        </div>
        <div class="note">
          ${projects.length} project${projects.length === 1 ? "" : "s"} · last touched ${updated}<br />
          <a href="#/projects" style="color:inherit">View all →</a>
        </div>
      </div>
      <div class="project-grid">${cards}</div>

      <div class="section-head">
        <div>
          <span class="kicker">How it works</span>
          <h2>Three disciplines, one studio loop</h2>
        </div>
        <div class="note">Every run updates the project, not just the chat.</div>
      </div>
      <div class="process-grid">
        <article class="process-card">
          <span class="process-num">01 / RULESET</span>
          <h3>Make the rules testable.</h3>
          <p>Procedures, timing, exceptions, component counts, and win conditions — written so a table can actually run them.</p>
          <div class="process-agent"><span>Specialist</span><strong>Rulesmith</strong></div>
        </article>
        <article class="process-card">
          <span class="process-num">02 / VISUALS</span>
          <h3>Give it a face.</h3>
          <p>Cover direction, palette, board and card concepts, typography, and the print notes that keep the fiction intact on paper.</p>
          <div class="process-agent"><span>Specialist</span><strong>Artificer</strong></div>
        </article>
        <article class="process-card">
          <span class="process-num">03 / SIMULATION</span>
          <h3>Stress it before the table.</h3>
          <p>Abstract Monte Carlo matches test turn order, game length, strategy spread, and the failure states that ruin a first play.</p>
          <div class="process-agent"><span>Specialist</span><strong>Playtester</strong></div>
        </article>
      </div>

      <section class="close-band">
        <span class="kicker">The studio loop</span>
        <h2>One brief. Three disciplines. A tighter game.</h2>
        <p>
          The agent keeps a shared project memory: rules, assets, simulation reports, and critic
          notes. Each pass makes the next one more specific.
        </p>
        <div class="close-stats">
          <div class="close-stat"><strong>${money(projects.length)}</strong><span>Projects</span></div>
          <div class="close-stat"><strong>${money(playtests)}</strong><span>Playtest reports</span></div>
          <div class="close-stat"><strong>${avg}%</strong><span>Average completion</span></div>
        </div>
      </section>`;

    if (route && route.compose) {
      const compose = $("#brief-input");
      if (compose) {
        setTimeout(() => {
          compose.scrollIntoView({ behavior: "smooth", block: "center" });
          compose.focus({ preventScroll: true });
        }, 90);
      }
    }
  }

  function renderProjects() {
    const projects = state.projects || [];
    document.title = "Projects — Tablecraft";
    setCrumbs(
      `<a href="#/">Studio</a><span class="sep">/</span><span class="current">Projects</span>`,
    );

    const cards = projects.length
      ? projects.map(projectCard).join("")
      : `<div class="empty" style="grid-column:1/-1"><h3>Nothing on the shelf yet.</h3><p>Start from a sentence in the studio composer.</p></div>`;

    $("#view").innerHTML = `
      <div class="settings-hero">
        <span class="kicker accent">The shelf</span>
        <h1>All <em>projects.</em></h1>
        <p>Every game keeps its ruleset, visual library, code notes, and playtest history in one workspace.</p>
        <div class="project-actions" style="margin-top:16px">
          <a class="btn primary" href="#/compose">New game</a>
          <button class="btn" type="button" data-action="import-project">Import project</button>
          <input type="file" id="import-file" accept="application/json,.json" style="display:none" />
        </div>
      </div>
      <h2 class="sr-only">All projects</h2>
      <div class="project-grid">${cards}</div>`;
  }

  /* --------------------------------- chat --------------------------------- */

  let chatHistory = [];
  let chatBusy = false;

  function renderChat() {
    document.title = "Chat — Tablecraft";
    $("#view").innerHTML = `
      <div class="settings-hero">
        <span class="kicker accent">Local model</span>
        <h1>Chat with <em>your model.</em></h1>
        <p>Powered by the local Python server on port 8000 (Ollama). Pick a model and start a conversation.</p>
      </div>

      <div class="panel" style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <label for="chat-model" style="font-size:0.66rem;font-weight:500;color:var(--ink-soft);">Model</label>
          <select id="chat-model" class="code-select" style="margin:0;flex:1;min-width:200px;"></select>
          <span id="chat-status" class="status warm">Connecting…</span>
        </div>
        <div id="chat-log" style="min-height:260px;max-height:460px;overflow-y:auto;border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--soft);display:flex;flex-direction:column;gap:10px;"></div>
        <form id="chat-form" class="composer-card" style="padding:12px;">
          <textarea id="chat-prompt" placeholder="Ask anything…" rows="2" style="min-height:56px;"></textarea>
          <div class="composer-foot" style="margin-top:8px;">
            <span class="composer-hint">Enter to send · Shift+Enter for newline</span>
            <button class="btn primary" type="submit" id="chat-send">Send</button>
          </div>
        </form>
      </div>`;

    const log = $("#chat-log");
    const modelSel = $("#chat-model");
    const form = $("#chat-form");
    const prompt = $("#chat-prompt");
    const sendBtn = $("#chat-send");
    const status = $("#chat-status");

    function append(role, text) {
      const div = document.createElement("div");
      div.style.cssText = "padding:10px 12px;border-radius:10px;max-width:88%;white-space:pre-wrap;word-wrap:break-word;font-size:0.85rem;line-height:1.55;";
      div.style.background = role === "user" ? "var(--dark)" : "var(--surface)";
      div.style.color = role === "user" ? "#f5f1fb" : "var(--ink)";
      div.style.alignSelf = role === "user" ? "flex-end" : "flex-start";
      div.style.border = role === "user" ? "0" : "1px solid var(--line)";
      div.textContent = text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    async function loadModels() {
      try {
        const res = await fetch(`/api/chat/models`);
        const data = await res.json();
        const models = data.models || [];
        modelSel.innerHTML = models.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
        if (models.includes(data.default)) modelSel.value = data.default;
        status.textContent = "Online";
        status.className = "status good";
      } catch (e) {
        modelSel.innerHTML = `<option value="">unavailable</option>`;
        status.textContent = "Offline";
        status.className = "status neutral";
      }
    }

    async function send() {
      const text = prompt.value.trim();
      if (!text || chatBusy) return;
      chatBusy = true;
      sendBtn.disabled = true;
      append("user", text);
      chatHistory.push({ role: "user", content: text });
      prompt.value = "";
      const thinking = document.createElement("div");
      thinking.style.cssText = "padding:10px 12px;border-radius:10px;align-self:flex-start;background:var(--surface);border:1px solid var(--line);color:var(--muted);font-size:0.85rem;font-style:italic;";
      thinking.textContent = "Thinking…";
      log.appendChild(thinking);
      log.scrollTop = log.scrollHeight;
      try {
        const res = await fetch(`/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: chatHistory, model: modelSel.value }),
        });
        const data = await res.json();
        thinking.remove();
        if (!res.ok) {
          append("assistant", `Error: ${data.detail || res.statusText}`);
        } else {
          const reply = data.content || "(no response)";
          append("assistant", reply);
          chatHistory.push({ role: "assistant", content: reply });
        }
      } catch (e) {
        thinking.remove();
        append("assistant", `Network error: ${e.message}.`);
      } finally {
        chatBusy = false;
        sendBtn.disabled = false;
        prompt.focus();
      }
    }

    form.addEventListener("submit", (e) => { e.preventDefault(); send(); });
    prompt.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });

    loadModels().catch(e => { console.error("loadModels failed", e); });
  }

  /* ------------------------------- new game wizard ------------------------- */

  const WIZARD_STEPS = ["players", "type", "medium", "style", "references"];
  const wizard = { step: 0, players_range: "", game_type: [], medium: [], style_mood: "", references: [], title: "" };

  function resetWizard() {
    wizard.step = 0;
    wizard.players_range = "";
    wizard.game_type = [];
    wizard.medium = [];
    wizard.style_mood = "";
    wizard.references = [];
    wizard.title = "";
  }

  function renderNewGame() {
    const step = WIZARD_STEPS[wizard.step];
    document.title = "New game — Tablecraft";
    const progress = WIZARD_STEPS.map((s, i) => `<span class="wiz-dot ${i === wizard.step ? "active" : i < wizard.step ? "done" : ""}"></span>`).join("");
    let body = "";
    if (step === "players") {
      const opts = ["1", "2", "1–2", "2–4", "3–5", "1–4", "5+"];
      body = `
        <h2>How many players?</h2>
        <p class="muted" style="margin-bottom:16px;">Pick a range, or skip.</p>
        <div class="chip-row">
          ${opts.map(o => `<button type="button" class="chip ${wizard.players_range === o ? "active" : ""}" data-wiz-pick="players" data-value="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join("")}
        </div>
        <div class="field" style="margin-top:18px;">
          <label>Or type a custom range</label>
          <input id="wiz-players" value="${escapeHtml(wizard.players_range)}" placeholder="e.g. 2–6" />
        </div>`;
    } else if (step === "type") {
      const opts = ["Worker placement", "Deck building", "Drafting", "Area control", "Cooperative", "Duel", "Party", "Puzzle", "Legacy", "Roll & write", "Tile laying", "Engine building"];
      body = `
        <h2>What kind of game?</h2>
        <p class="muted" style="margin-bottom:16px;">Pick any that fit. You can skip.</p>
        <div class="chip-row">
          ${opts.map(o => `<button type="button" class="chip ${wizard.game_type.includes(o) ? "active" : ""}" data-wiz-toggle="type" data-value="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join("")}
        </div>`;
    } else if (step === "medium") {
      const opts = ["Cards", "Board", "Tiles", "Dice", "Tokens", "Paper & pencil", "App-assisted"];
      body = `
        <h2>What's the medium?</h2>
        <p class="muted" style="margin-bottom:16px;">Pick any that apply.</p>
        <div class="chip-row">
          ${opts.map(o => `<button type="button" class="chip ${wizard.medium.includes(o) ? "active" : ""}" data-wiz-toggle="medium" data-value="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join("")}
        </div>`;
    } else if (step === "style") {
      body = `
        <h2>Style and mood?</h2>
        <p class="muted" style="margin-bottom:16px;">Describe the look and feel. You can skip.</p>
        <div class="field">
          <textarea id="wiz-style" rows="3" placeholder="e.g. cozy, hand-drawn, warm autumn palette, quiet and intimate…">${escapeHtml(wizard.style_mood)}</textarea>
        </div>`;
    } else if (step === "references") {
      body = `
        <h2>References</h2>
        <p class="muted" style="margin-bottom:16px;">Name a game or work, and what you want to take from it. You can skip.</p>
        <div class="field" style="margin-bottom:12px;">
          <label>Name your game (optional)</label>
          <input id="wiz-title" value="${escapeHtml(wizard.title)}" placeholder="Leave blank to auto-generate" />
        </div>
        <div id="wiz-refs" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
          ${wizard.references.map((r, i) => `
            <div class="ref-row" data-index="${i}" style="display:grid;grid-template-columns:1fr 2fr auto;gap:8px;">
              <input class="ref-name" value="${escapeHtml(r.name)}" placeholder="Reference name" />
              <input class="ref-note" value="${escapeHtml(r.annotation)}" placeholder="What to take from it" />
              <button type="button" class="btn small" data-wiz-remove-ref="${i}">Remove</button>
            </div>`).join("")}
        </div>
        <button type="button" class="btn small" id="wiz-add-ref">+ Add reference</button>`;
    }

    const isLast = wizard.step === WIZARD_STEPS.length - 1;
    $("#view").innerHTML = `
      <a class="back-link" href="#/">← Back to studio</a>
      <div class="settings-hero">
        <span class="kicker accent">New game</span>
        <h1>Step ${wizard.step + 1} of ${WIZARD_STEPS.length}</h1>
        <div class="wiz-progress" style="display:flex;gap:6px;margin:12px 0 4px;">${progress}</div>
      </div>
      <div class="panel" style="max-width:720px;">
        ${body}
        <div class="form-actions" style="margin-top:22px;">
          <button class="btn" type="button" id="wiz-skip">Skip</button>
          <button class="btn" type="button" id="wiz-back" ${wizard.step === 0 ? "disabled" : ""}>Back</button>
          <button class="btn primary" type="button" id="wiz-next">${isLast ? "Create game" : "Next"}</button>
        </div>
      </div>`;

    // bind
    document.querySelectorAll("[data-wiz-pick]").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.wizPick;
        const val = btn.dataset.value;
        if (key === "players") wizard.players_range = (wizard.players_range === val) ? "" : val;
        renderNewGame();
      });
    });
    document.querySelectorAll("[data-wiz-toggle]").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.wizToggle;
        const val = btn.dataset.value;
        const arr = key === "type" ? wizard.game_type : wizard.medium;
        const idx = arr.indexOf(val);
        if (idx >= 0) arr.splice(idx, 1); else arr.push(val);
        renderNewGame();
      });
    });
    document.querySelectorAll("[data-wiz-remove-ref]").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.wizRemoveRef);
        wizard.references.splice(i, 1);
        renderNewGame();
      });
    });
    const addRef = document.getElementById("wiz-add-ref");
    if (addRef) addRef.addEventListener("click", () => {
      wizard.references.push({ name: "", annotation: "" });
      renderNewGame();
    });

    const skipBtn = document.getElementById("wiz-skip");
    if (skipBtn) skipBtn.addEventListener("click", () => { wizard.step = Math.min(WIZARD_STEPS.length - 1, wizard.step + 1); if (wizard.step === WIZARD_STEPS.length) createFromWizard(); else renderNewGame(); });
    const backBtn = document.getElementById("wiz-back");
    if (backBtn) backBtn.addEventListener("click", () => { if (wizard.step > 0) { wizard.step--; renderNewGame(); } });
    const nextBtn = document.getElementById("wiz-next");
    if (nextBtn) nextBtn.addEventListener("click", () => {
      // collect current step inputs
      const playersInput = document.getElementById("wiz-players");
      if (playersInput) wizard.players_range = playersInput.value.trim() || wizard.players_range;
      const styleInput = document.getElementById("wiz-style");
      if (styleInput) wizard.style_mood = styleInput.value.trim();
      const titleInput = document.getElementById("wiz-title");
      if (titleInput) wizard.title = titleInput.value.trim();
      // collect refs
      document.querySelectorAll(".ref-row").forEach((row, i) => {
        const n = row.querySelector(".ref-name");
        const a = row.querySelector(".ref-note");
        if (wizard.references[i]) {
          wizard.references[i].name = n ? n.value.trim() : wizard.references[i].name;
          wizard.references[i].annotation = a ? a.value.trim() : wizard.references[i].annotation;
        }
      });
      if (wizard.step < WIZARD_STEPS.length - 1) {
        wizard.step++;
        renderNewGame();
      } else {
        createFromWizard();
      }
    });
  }

  async function createFromWizard() {
    // collect final inputs
    const playersInput = document.getElementById("wiz-players");
    if (playersInput) wizard.players_range = playersInput.value.trim() || wizard.players_range;
    const styleInput = document.getElementById("wiz-style");
    if (styleInput) wizard.style_mood = styleInput.value.trim();
    const titleInput = document.getElementById("wiz-title");
    if (titleInput) wizard.title = titleInput.value.trim();
    document.querySelectorAll(".ref-row").forEach((row, i) => {
      const n = row.querySelector(".ref-name");
      const a = row.querySelector(".ref-note");
      if (wizard.references[i]) {
        wizard.references[i].name = n ? n.value.trim() : wizard.references[i].name;
        wizard.references[i].annotation = a ? a.value.trim() : wizard.references[i].annotation;
      }
    });
    // filter empty refs
    wizard.references = wizard.references.filter(r => r.name.trim());

    const title = wizard.title || "Untitled Game";
    try {
      const brief = [wizard.style_mood, wizard.game_type.join(" "), wizard.medium.join(" "), wizard.players_range].filter(Boolean).join(" ");
      const data = await api("/projects", {
        method: "POST",
        body: {
          title: wizard.title || "",
          brief,
          players_range: wizard.players_range,
          game_type: wizard.game_type,
          medium: wizard.medium,
          style_mood: wizard.style_mood,
          references: wizard.references,
        },
      });
      const project = data.project;
      resetWizard();
      toast(`${project.name} is on the shelf.`);
      go(`#/project/${encodeURIComponent(project.id)}`);
    } catch (e) {
      toast(e.message);
    }
  }

  /* ------------------------------- project -------------------------------- */

  function renderProject() {
    const project = state.activeProject;
    if (!project) {
      renderError(new Error("Project not found."));
      return;
    }
    const progress = project.progress || {};
    const assets = project.assets || [];
    const playtests = project.playtests || [];
    const simulations = playtests.reduce((sum, test) => sum + (Number(test.simulations) || 0), 0);

    document.title = `${project.name} — Tablecraft`;
    setCrumbs(
      `<a href="#/">Studio</a><span class="sep">/</span><a href="#/projects">Projects</a><span class="sep">/</span><span class="current">${escapeHtml(project.name)}</span>`,
    );

    const stages = STAGE_KEYS.map((key, index) => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(progress[key]) || 0)));
      const active = project.stage === key;
      return `
        <div class="stage-card ${pct >= 100 ? "done" : ""} ${active ? "active" : ""}">
          <div class="stage-top">
            <span class="stage-number">0${index + 1}</span>
            ${pct >= 100 ? `<span class="stage-check">✓ complete</span>` : ""}
          </div>
          <h2>${STAGE_META[key].label}</h2>
          <p>${STAGE_META[key].blurb}</p>
          ${progressBar(pct)}
          <div class="stage-pct">${pct}%</div>
        </div>`;
    }).join("");

    const tabs = TAB_KEYS.map((key) => {
      const labels = { summary: "Summary", ruleset: "Ruleset", assets: "Assets", code: "Code", model: "Flowchart" };
      return `<a class="tab ${state.activeTab === key ? "active" : ""}" href="${projectTabHref(project, key)}">${labels[key]}</a>`;
    }).join("");

    const tags = (project.tags || []).map(t => `<span class="meta-pill" style="display:inline-flex;align-items:center;gap:4px;background:var(--accent-soft);color:var(--accent-strong);padding:2px 8px;line-height:1.2;">${escapeHtml(t)} <button type="button" data-action="remove-tag" data-tag="${escapeHtml(t)}" style="background:none;border:none;cursor:pointer;color:var(--accent-strong);padding:0;font-size:0.7rem;line-height:1;vertical-align:middle;">×</button></span>`).join(" ");
    $("#view").innerHTML = `
      <a class="back-link" href="#/projects">← Back to projects</a>

      <header class="project-simple-head" style="align-items:center;">
        <div style="flex:1;">
          <span class="status ${project.visibility === "public" ? "good" : "neutral"}">${escapeHtml(project.visibility || "private")}</span>
          ${state.editing.title ? `
            <div style="display:flex;gap:8px;align-items:center;margin:6px 0 8px;">
              <input id="edit-title" value="${escapeHtml(project.name)}" style="font-size:1.6rem;font-weight:500;border:1px solid var(--line-strong);border-radius:8px;padding:4px 8px;flex:1;" />
              <button class="btn small primary" type="button" data-action="save-title">Save</button>
              <button class="btn small" type="button" data-action="cancel-edit" data-section="title">Cancel</button>
            </div>` : `
            <h1 class="project-title" style="margin:6px 0 8px;">${escapeHtml(project.name)} <button class="btn small" type="button" data-action="edit-section" data-section="title" title="Edit title" style="vertical-align:middle;">✎</button></h1>`}
          <div class="meta-row" style="margin:4px 0 0;">
            <span class="meta-pill">${escapeHtml(project.genre)}</span>
            <span class="meta-pill">${escapeHtml(project.players)} players</span>
            <span class="meta-pill">${escapeHtml(project.playtime)}</span>
            <span class="meta-pill">${escapeHtml(project.age)}</span>
          </div>
        </div>
        <div class="project-actions" style="flex:0 0 auto;">
          <button class="btn small" type="button" data-action="publish-project">${project.visibility === "public" ? "Make private" : "Publish"}</button>
          <button class="btn small" type="button" data-action="export-project">Export</button>
          <button class="btn small" type="button" data-action="delete-project" style="color:#a32253;border-color:#eccbdb;">Delete</button>
        </div>
      </header>

      <nav class="tabs" aria-label="Project sections" style="margin:16px 0 12px;">${tabs}</nav>

      <div id="tab-panel">${renderTab(project)}</div>`;
  }

  function renderTab(project) {
    switch (state.activeTab) {
      case "ruleset":
        return renderRuleset(project);
      case "assets":
        return renderAssets(project);
      case "code":
        return renderCode(project);
      case "model":
        return renderModel(project);
      default:
        return renderSummary(project);
    }
  }

  function tabChat(project, focus, placeholder) {
    const key = project.id + ":" + focus;
    const msgs = (state.tabChats || {})[key] || [];
    const thinking = (state.tabChatThinking || {})[key];
    const log = msgs.map((m, i) => `<div class="tchat-msg ${m.role}"><div class="tchat-bubble">${escapeHtml(m.content)}${m.role === "assistant" ? ` <button type="button" class="btn small" data-action="copy-tchat" data-text="${escapeHtml(m.content)}" title="Copy" style="margin-left:6px;padding:2px 6px;font-size:0.7rem;">📋</button>` : ""}</div></div>`).join("") +
      (thinking ? `<div class="tchat-msg assistant"><div class="tchat-bubble"><div class="typing"><span></span><span></span><span></span></div></div></div>` : "");
    return `<div class="tchat" data-project="${escapeHtml(project.id)}" data-focus="${escapeHtml(focus)}">
      <div class="tchat-log" id="tchat-log-${escapeHtml(project.id)}-${escapeHtml(focus)}">${log || `<div class="muted" style="font-size:0.75rem;padding:8px;">No messages yet. Ask something below.</div>`}</div>
      <form class="tchat-form" style="display:flex;gap:8px;margin-top:8px;align-items:flex-end;">
        <textarea name="prompt" rows="1" placeholder="${escapeHtml(placeholder)}" style="flex:1;min-height:40px;max-height:140px;padding:8px 10px;border:1px solid var(--line-strong);border-radius:8px;resize:none;font:inherit;font-size:0.85rem;"></textarea>
        <button type="submit" class="btn primary small" style="min-height:40px;">Send</button>
      </form>
    </div>`;
  }

  function responsePanel(project, focus) {
    return "";
  }

  function renderSummary(project) {
    const rules = project.ruleset || {};
    const editing = state.editing.summary;
    const assets = project.assets || [];
    const playtests = project.playtests || [];
    const latest = playtests[0];
    return `
      <div class="summary-block">
        ${editing ? `
          <div class="field"><label>Description (Markdown)</label><textarea id="edit-description" rows="8" style="font-family:ui-monospace,monospace;font-size:0.8rem;">${escapeHtml(project.description)}</textarea></div>
          <div class="field-row">
            <div class="field"><label>Genre</label><input id="edit-genre" value="${escapeHtml(project.genre)}" /></div>
            <div class="field"><label>Players</label><input id="edit-players" value="${escapeHtml(project.players)}" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Playtime</label><input id="edit-playtime" value="${escapeHtml(project.playtime)}" /></div>
            <div class="field"><label>Age</label><input id="edit-age" value="${escapeHtml(project.age)}" /></div>
          </div>
          <div class="field"><label>Tags (comma separated)</label><input id="edit-tags" value="${escapeHtml((project.tags || []).join(", "))}" placeholder="e.g. cozy, strategic, 2-player" /></div>
          <div class="form-actions" style="margin-top:10px;">
            <button class="btn primary small" type="button" data-action="save-summary">Save</button>
            <button class="btn small" type="button" data-action="cancel-edit" data-section="summary">Cancel</button>
          </div>
        ` : `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
            <span class="kicker">README.md</span>
            <button class="btn small" type="button" data-action="edit-section" data-section="summary" title="Edit" style="vertical-align:middle;">✎ Edit</button>
          </div>
          <div style="margin-bottom:12px;">
            <span class="kicker" style="display:block;margin-bottom:6px;">Tags</span>
            <div class="meta-row" style="margin:0;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
              ${(project.tags || []).map(t => `<span class="meta-pill" style="display:inline-flex;align-items:center;gap:4px;background:var(--accent-soft);color:var(--accent-strong);padding:2px 8px;line-height:1.2;">${escapeHtml(t)} <button type="button" data-action="remove-tag" data-tag="${escapeHtml(t)}" style="background:none;border:none;cursor:pointer;color:var(--accent-strong);padding:0;font-size:0.7rem;line-height:1;vertical-align:middle;">×</button></span>`).join("")}
              <button class="btn small" type="button" data-action="add-tag" title="Add tag" style="padding:2px 8px;">+ tag</button>
            </div>
            <div id="tag-input-wrap" style="display:none;margin-top:6px;">
              <input id="new-tag-input" placeholder="Type a tag and press Enter" style="padding:6px 10px;border:1px solid var(--line-strong);border-radius:8px;font:inherit;font-size:0.8rem;width:240px;" />
            </div>
          </div>
          <div class="md-viewer">${markdown(project.description)}</div>
        `}
      </div>

      `;

  }

  function renderRuleset(project) {
    const rules = project.ruleset || {};
    const editing = state.editing.ruleset;
    const sections = rules.sections || [];
    const components = rules.components || [];
    const notes = rules.design_notes || [];
    const pillars = rules.pillars || [];

    const sectionMarkup = sections
      .map((section, index) => {
        const bodyHtml = editing
          ? `<textarea class="rule-edit-body" data-index="${index}" rows="6" style="width:100%;padding:8px;border:1px solid var(--line-strong);border-radius:8px;font:inherit;font-size:0.8rem;">${escapeHtml(section.body)}</textarea>`
          : `<div class="rule-body">${markdown(section.body)}</div>`;
        return `<section class="rule-section">
          <div class="rule-heading">
            <span class="rule-index">${String(index + 1).padStart(2, "0")}</span>
            <h3>${escapeHtml(section.title)}</h3>
          </div>
          ${bodyHtml}
        </section>`;
      })
      .join("");

    const componentRows = components
      .map(
        (component) => `
        <tr>
          <td>${escapeHtml(component.name)}</td>
          <td>${escapeHtml(component.count)}</td>
          <td class="kind">${escapeHtml(component.kind)}</td>
          <td>${escapeHtml(component.note || "—")}</td>
        </tr>`,
      )
      .join("");

    const notesMarkup = notes.length
      ? `<div class="note-list">${notes.map((note) => `<div class="design-note">${escapeHtml(note)}</div>`).join("")}</div>`
      : `<p class="muted" style="font-size:.66rem">No open design notes yet.</p>`;

    const winHtml = editing
      ? `<section class="rule-section">
           <div class="rule-heading"><span class="rule-index">★</span><h3>Win condition</h3></div>
           <textarea id="edit-win-condition" rows="2" style="width:100%;padding:8px;border:1px solid var(--line-strong);border-radius:8px;font:inherit;font-size:0.8rem;">${escapeHtml(rules.win_condition || "")}</textarea>
         </section>`
      : (rules.win_condition
          ? `<section class="rule-section">
               <div class="rule-heading"><span class="rule-index">★</span><h3>Win condition</h3></div>
               <div class="rule-callout">${escapeHtml(rules.win_condition)}</div>
             </section>`
          : "");

    const loglineHtml = editing
      ? `<h2 style="color:#f8f6fd;">${escapeHtml(rules.logline || project.tagline)}</h2>`
      : `<h2>${escapeHtml(rules.logline || project.tagline)} <button class="btn small" type="button" data-action="edit-section" data-section="ruleset" title="Edit" style="vertical-align:middle;background:transparent;border-color:#463b5e;color:#b9adcd;">✎</button></h2>`;

    return `
      <div style="margin-bottom:12px;">
        <span class="kicker">Ruleset · v${escapeHtml(rules.version || "0.1")}</span>
        <h2 style="font-size:1.5rem;margin-top:4px;">Rules</h2>
      </div>
      <div class="rules-doc">
        ${sectionMarkup || `<p class="muted" style="padding:20px 0">The rules document is still empty. Ask the agent for a first pass.</p>`}
        ${winHtml}
      </div>

      <div class="component-card">
        <span class="kicker">Component manifest</span>
        <h3>What is in the box</h3>
        ${
          components.length
            ? `<table class="component-table">
                 <thead><tr><th>Component</th><th>Count</th><th>Format</th><th>Note</th></tr></thead>
                 <tbody>${componentRows}</tbody>
               </table>`
            : `<p class="muted" style="font-size:.7rem">No components defined yet.</p>`
        }
      </div>

      ${(() => {
        const dnHtml = editing
          ? `<textarea id="edit-design-notes" rows="4" style="width:100%;padding:8px;border:1px solid var(--line-strong);border-radius:8px;font:inherit;font-size:0.8rem;">${escapeHtml((rules.design_notes || []).join("\\n"))}</textarea>`
          : notesMarkup;
        const saveBar = editing ? `<div class="form-actions" style="margin-top:12px;"><button class="btn primary small" type="button" data-action="save-ruleset">Save</button><button class="btn small" type="button" data-action="cancel-edit" data-section="ruleset">Cancel</button></div>` : "";
        return `${saveBar}`;
      })()}`;
  }

  function renderAssets(project) {
    const assets = project.assets || [];
    const editing = state.editing.assets;
    if (!assets.length && !editing) {
      return `${composer}<div class="empty">
        <h3>No visual assets yet.</h3>
        <p>Ask the agent for a cover direction or a board concept below.</p>
      </div>`;
    }

    const editToggle = `<div style="margin-bottom:10px;"><button class="btn small" type="button" data-action="${editing ? "cancel-edit" : "edit-section"}" data-section="assets">${editing ? "Cancel" : "✎ Edit assets"}</button>${editing ? ` <button class="btn small primary" type="button" data-action="save-assets">Save</button>` : ""}</div>`;

    const cards = assets.map((asset, i) => editing ? `
      <article class="asset-card">
        <div class="asset-preview">${asset.preview_svg || ""}</div>
        <div class="asset-body" style="display:flex;flex-direction:column;gap:6px;">
          <input data-asset="${i}" data-field="name" value="${escapeHtml(asset.name)}" placeholder="Name" style="padding:6px;border:1px solid var(--line-strong);border-radius:6px;font:inherit;font-size:0.85rem;" />
          <input data-asset="${i}" data-field="kind" value="${escapeHtml(asset.kind)}" placeholder="Kind" style="padding:6px;border:1px solid var(--line-strong);border-radius:6px;font:inherit;font-size:0.85rem;" />
          <input data-asset="${i}" data-field="status" value="${escapeHtml(asset.status)}" placeholder="Status" style="padding:6px;border:1px solid var(--line-strong);border-radius:6px;font:inherit;font-size:0.85rem;" />
          <input data-asset="${i}" data-field="folder" value="${escapeHtml(asset.folder || "")}" placeholder="Folder (optional)" style="padding:6px;border:1px solid var(--line-strong);border-radius:6px;font:inherit;font-size:0.85rem;" />
          <textarea data-asset="${i}" data-field="description" rows="2" style="padding:6px;border:1px solid var(--line-strong);border-radius:6px;font:inherit;font-size:0.8rem;margin-bottom:8px;">${escapeHtml(asset.description)}</textarea>
          <label style="font-size:0.7rem;color:var(--muted);">Upload image: <input type="file" accept="image/*" data-asset-img="${i}" /></label>
          ${asset.image ? `<button type="button" class="btn small" data-action="remove-asset-image" data-asset="${i}">Remove image</button>` : ""}
        </div>
      </article>` : `
      <article class="asset-card">
        <div class="asset-preview">${asset.image ? `<img src="${escapeHtml(asset.image)}" alt="${escapeHtml(asset.name)}" style="width:100%;height:auto;display:block;" />` : (asset.preview_svg || "")}</div>
        <div class="asset-body">
          <div class="asset-top">
            <span class="asset-kind">${escapeHtml(asset.kind)}</span>
          </div>
          <h3>${escapeHtml(asset.name)}</h3>
          <p class="asset-desc">${escapeHtml(asset.description)}</p>
          <div class="asset-foot">
            <span>${escapeHtml(asset.format)} · ${escapeHtml(asset.resolution)}${asset.folder ? " · " + escapeHtml(asset.folder) : ""}</span>
            <span>${timeAgo(asset.created_at)}</span>
          </div>
        </div>
      </article>`).join("");

    return `${editToggle}<div class="asset-grid">${cards}</div>`;
  }

  function renderCode(project) {
    const files = project.code || [];
    const editing = state.editing.code;
    if (!files.length && !editing) {
      return `${composer}<div class="empty"><h3>No code notes yet.</h3><p>Generate scaffolding with the box above.</p></div>`;
    }

    const index = Math.min(Math.max(Number(state.codeIndex[project.id]) || 0, 0), files.length - 1);
    const file = files[index];
    const options = files
      .map(
        (item, itemIndex) =>
          `<option value="${itemIndex}" ${itemIndex === index ? "selected" : ""}>${escapeHtml(item.path)}</option>`,
      )
      .join("");

    const codeHtml = editing
      ? `<div class="field"><label>Path</label><input id="edit-code-path" value="${escapeHtml(file.path)}" style="width:100%;padding:8px;border:1px solid var(--line-strong);border-radius:8px;font:inherit;font-size:0.8rem;" /></div>
         <div class="field"><label>Language</label><input id="edit-code-lang" value="${escapeHtml(file.language)}" style="width:100%;padding:8px;border:1px solid var(--line-strong);border-radius:8px;font:inherit;font-size:0.8rem;" /></div>
         <div class="field"><label>Description</label><input id="edit-code-desc" value="${escapeHtml(file.description || "")}" style="width:100%;padding:8px;border:1px solid var(--line-strong);border-radius:8px;font:inherit;font-size:0.8rem;" /></div>
         <div class="field"><label>Code</label><textarea id="edit-code-body" rows="16" style="width:100%;padding:8px;border:1px solid var(--line-strong);border-radius:8px;font-family:ui-monospace,monospace;font-size:0.75rem;">${escapeHtml(file.code)}</textarea></div>`
      : `<div class="code-head">
           <span class="code-path">${escapeHtml(file.path)}</span>
           <button class="btn small" type="button" data-action="copy-code">Copy</button>
         </div>
         <select id="code-select" class="code-select" aria-label="Choose a code file">${options}</select>
         <div class="code-meta">
           <div>
             <strong>${escapeHtml(file.path)}</strong>
             <span>${escapeHtml(file.description || "Project source")}</span>
           </div>
           <span class="status neutral">${escapeHtml(file.language)}</span>
         </div>
         <pre class="code-block"><code>${escapeHtml(file.code)}</code></pre>`;

    return `
      <div style="margin-bottom:10px;">
        <button class="btn small" type="button" data-action="${editing ? "cancel-edit" : "edit-section"}" data-section="code">${editing ? "Cancel" : "✎ Edit code"}</button>
        ${editing ? `<button class="btn small primary" type="button" data-action="save-code">Save</button>` : ""}
      </div>
      ${codeHtml}`;
  }

  function renderModel(project) {
    const assets = project.assets || [];
    const html = `
      <div id="fc-mount" style="height:640px;border:1px solid var(--line);border-radius:12px;overflow:hidden;"></div>
      <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button class="btn primary small" type="button" id="fc-save-btn">Save flowchart</button>
        <button class="btn small" type="button" id="fc-sync-btn">Sync to XState JSON</button>
        <textarea id="model-json" rows="6" style="flex:1;padding:6px;border:1px solid var(--line-strong);border-radius:6px;font-family:ui-monospace,monospace;font-size:0.7rem;">${escapeHtml(JSON.stringify(project.model || {}, null, 2))}</textarea>
      </div>`;

    setTimeout(() => {
      const root = document.getElementById("tab-panel");
      if (root) root.innerHTML = html;
      const mount = document.getElementById("fc-mount");
      if (!mount) return;
      const editor = new FlowchartEditor(mount, { project, assets });
      const saveBtn = document.getElementById("fc-save-btn");
      if (saveBtn) saveBtn.onclick = async () => {
        const st = editor.getState();
        project.flowchart = { nodes: st.nodes, edges: st.connections };
        const states = {};
        st.nodes.forEach(n => { states[n.id] = { label: n.label || n.id, on: {} }; });
        st.connections.forEach(e => {
          if (states[e.from]) {
            states[e.from].on = states[e.from].on || {};
            states[e.from].on[e.label || "NEXT"] = e.to;
          }
        });
        project.model = { initial: st.nodes[0] ? st.nodes[0].id : undefined, states };
        await saveProject(project);
      };
      const syncBtn = document.getElementById("fc-sync-btn");
      if (syncBtn) syncBtn.onclick = () => {
        const st = editor.getState();
        const states = {};
        st.nodes.forEach(n => { states[n.id] = { label: n.label || n.id, on: {} }; });
        st.connections.forEach(e => {
          if (states[e.from]) {
            states[e.from].on = states[e.from].on || {};
            states[e.from].on[e.label || "NEXT"] = e.to;
          }
        });
        const machine = { initial: st.nodes[0] ? st.nodes[0].id : undefined, states };
        const ta = document.getElementById("model-json");
        if (ta) ta.value = JSON.stringify(machine, null, 2);
        toast("Synced to XState JSON. Click Save flowchart to persist.");
      };
    }, 0);

    return html;
  }

  function renderPlaytests(project) {
    const reports = project.playtests || [];
    if (!reports.length) {
      return `<div class="empty">
        <h3>No playtests yet.</h3>
        <p>Run the virtual harness to get balance signals before the first table.</p>
        <div class="project-actions" style="justify-content:center;margin-top:14px">
          <button class="btn primary" type="button" data-action="quick-playtest">Run a playtest</button>
        </div>
      </div>`;
    }

    const latest = reports[0];
    const metrics = (latest.metrics || [])
      .map(
        (metric) => `
        <div class="metric">
          <strong>${escapeHtml(metric.value)}</strong>
          <span>${escapeHtml(metric.label)}</span>
          ${metric.delta ? `<em>${escapeHtml(metric.delta)}</em>` : ""}
        </div>`,
      )
      .join("");

    const findings = (latest.findings || [])
      .map(
        (finding, index) => `
        <div class="finding">
          <span class="finding-num">${String(index + 1).padStart(2, "0")}</span>
          <span>${escapeHtml(finding)}</span>
        </div>`,
      )
      .join("");

    const eventLog = (latest.event_log || []).map((line) => `<div>${escapeHtml(line)}</div>`).join("");

    const older = reports.slice(1);

    return `
      <div class="test-hero">
        <div class="test-hero-top">
          <span class="kicker">Latest playtest</span>
          <span class="status ${statusClass(latest.status)}">${escapeHtml(latest.status)}</span>
        </div>
        <div class="test-meta">${money(latest.simulations)} simulated matches · ${dateShort(latest.created_at)}</div>
        <h2>${escapeHtml(latest.headline)}</h2>
        <div class="metric-grid">${metrics}</div>
      </div>

      ${
        findings
          ? `<div class="test-card"><span class="kicker">Findings</span><h3>What the harness saw</h3>${findings}</div>`
          : ""
      }
      ${
        eventLog
          ? `<div class="test-card"><span class="kicker">Trace</span><h3>Event log</h3><div class="event-log">${eventLog}</div></div>`
          : ""
      }
      ${
        older.length
          ? `<div class="section-head" style="margin-top:34px"><div><span class="kicker">History</span><h2 style="font-size:1.8rem">Earlier runs</h2></div><div class="note">${older.length} report${older.length === 1 ? "" : "s"}</div></div>
             ${older
               .map(
                 (report) => `
                 <div class="test-card">
                   <div class="test-hero-top">
                     <span class="test-meta">${money(report.simulations)} matches · ${dateShort(report.created_at)}</span>
                     <span class="status ${statusClass(report.status)}">${escapeHtml(report.status)}</span>
                   </div>
                   <h3>${escapeHtml(report.headline)}</h3>
                   <p class="test-caption">${report.metrics?.map((metric) => `${escapeHtml(metric.label)} ${escapeHtml(metric.value)}`).join(" · ") || ""}</p>
                 </div>`,
               )
               .join("")}`
          : ""
      }`;
  }

  function renderAgentPanel(project) {
    const progress = project.progress || {};
    const runs = state.activeRuns || [];
    const latest = runs[0];
    const settings = state.settings || {};
    const demo = state.health ? state.health.demo_mode : settings.demo_mode;
    const providerBadge = demo ? "DEMO" : String(settings.provider || "OPENAI").toUpperCase();
    const draft = state.drafts[project.id] || "";

    const stages = STAGE_KEYS.map((key) => {
      const pct = Math.round(Number(progress[key]) || 0);
      const dot = pct >= 100 ? "done" : project.stage === key ? "active" : "";
      return `
        <div class="agent-stage">
          <span class="stage-dot ${dot}"></span>
          <span>${STAGE_META[key].label}</span>
          <span class="pct">${pct}%</span>
        </div>`;
    }).join("");

    let chat;
    if (!latest) {
      chat = `<div class="agent-empty">
        <strong>No runs yet.</strong><br />
        Ask for a rules pass, an art direction, or a balance test. The agent reads the current
        project before it answers, and the result is written back into the workspace.
      </div>`;
    } else {
      const messages = (latest.messages || [])
        .map((message) => {
          const role = message.role || "system";
          const initial = (message.agent || "?").slice(0, 1).toUpperCase();
          return `
            <div class="agent-message">
              <span class="agent-avatar ${role}">${escapeHtml(initial)}</span>
              <div>
                <div class="agent-msg-head">
                  <strong>${escapeHtml(message.agent)}</strong>
                  <span>${escapeHtml(role)}</span>
                </div>
                <div class="agent-bubble">${markdown(message.content)}</div>
              </div>
            </div>`;
        })
        .join("");

      chat = `
        <div class="agent-run-meta top">
          <span>${escapeHtml(latest.provider || "studio-demo")}</span>
          <span>${escapeHtml(latest.focus)} · ${(Number(latest.duration_ms) / 1000).toFixed(1)}s · ${timeAgo(latest.created_at)}</span>
        </div>
        ${messages || `<div class="agent-empty">This run has no messages.</div>`}
        <div class="agent-run-meta">
          <span>${escapeHtml(latest.summary || "Run complete")}</span>
          <span>${escapeHtml(latest.id?.slice(-6) || "")}</span>
        </div>`;
    }

    return `
      <aside class="agent-panel">
        <div class="agent-head">
          <div class="agent-brand">
            <span class="agent-orb" aria-hidden="true"></span>
            <div>
              <h3>Studio agent</h3>
              <p>Director · specialist · critic</p>
            </div>
          </div>
          <span class="provider-badge">${escapeHtml(providerBadge)}</span>
        </div>

        <div class="agent-stages">${stages}</div>
        <div class="agent-chat">${chat}</div>

        <div class="agent-form-wrap">
          <span class="kicker">Direct the agent</span>
          <form id="agent-form" class="agent-form" data-project="${escapeHtml(project.id)}">
            <textarea
              id="agent-prompt"
              name="prompt"
              maxlength="4000"
              required
              placeholder="Tighten the endgame, then test whether the starting player still has an edge…"
            >${escapeHtml(draft)}</textarea>
            <div class="agent-row">
              <select id="agent-focus" name="focus" aria-label="Run focus">
                <option value="auto">Auto focus</option>
                <option value="ruleset">Ruleset</option>
                <option value="visuals">Visuals</option>
                <option value="simulation">Simulation</option>
              </select>
              <button class="btn primary" type="submit" ${state.agentBusy ? "disabled" : ""}>
                ${state.agentBusy ? "Running…" : "Run agent"}
              </button>
            </div>
          </form>
        </div>
      </aside>`;
  }

  /* -------------------------------- settings ------------------------------- */

  function modelOptions(providerId, current) {
    const provider = catalogProvider(providerId);
    const models = provider ? [...provider.models] : [];
    if (current && !models.includes(current)) models.unshift(current);
    return models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
  }

  function renderSettings() {
    const settings = state.settings || {};
    const framework = state.framework || {};
    const health = state.health;
    const demo = settings.demo_mode;
    const connected = settings.has_api_key;
    const provider = settings.provider || "openai";
    const catalog = catalogProvider(provider);
    const baseUrl = settings.base_url || catalog?.base_url || "";

    document.title = "Settings — Tablecraft";
    setCrumbs(
      `<a href="#/">Studio</a><span class="sep">/</span><span class="current">Settings</span>`,
    );

    const providerOptions = state.providers
      .map(
        (item) =>
          `<option value="${escapeHtml(item.id)}" ${item.id === provider ? "selected" : ""}>${escapeHtml(item.name)}</option>`,
      )
      .join("");

    const stageMarkup = (framework.stages || [])
      .map(
        (stage, index) => `
        <div class="framework-agent">
          <span class="framework-index">0${index + 1}</span>
          <div>
            <h3>${escapeHtml(stage.label)} · ${escapeHtml(stage.agent)}</h3>
            <p>${escapeHtml(stage.description)}</p>
            <div class="tools">${(stage.tools || []).map((tool) => `<span class="tool">${escapeHtml(tool)}</span>`).join("")}</div>
          </div>
        </div>`,
      )
      .join("");

    const connectionRows = [
      ["Provider", providerName(provider)],
      ["Model", settings.model || "—"],
      ["Base URL", baseUrl || "—"],
      ["Credential", settings.key_hint || "Not connected"],
      ["Key source", settings.key_source || "none"],
      ["API health", health && health.status === "ok" ? "Online" : "Offline"],
      ["Runtime mode", demo ? "Demo framework" : "Live provider"],
    ]
      .map(
        ([label, value]) =>
          `<div class="connection-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`,
      )
      .join("");

    $("#view").innerHTML = `
      <div class="settings-hero">
        <span class="kicker accent">Studio configuration</span>
        <h1>Settings &amp; <em>runtime.</em></h1>
        <p>
          Connect a model provider to replace the deterministic demo framework, or keep the
          studio local and offline. Keys are stored only on this machine, in
          <code style="font-family:'Roboto Mono',monospace;font-size:.8em">.data/settings.json</code>.
        </p>
      </div>

      <div class="settings-grid">
        <div class="stack">
          <div class="panel" id="providers">
            <span class="kicker accent">Model provider</span>
            <h2>Connect the studio</h2>
            <p>The agent will use this provider for rules, art direction, and balance analysis. Without a key it falls back to the local studio framework.</p>
            <form id="settings-form" class="form-grid">
              <div class="field-row">
                <div class="field">
                  <label for="provider-select">Provider</label>
                  <select id="provider-select" name="provider">${providerOptions}</select>
                </div>
                <div class="field">
                  <label for="model-select">Model</label>
                  <select id="model-select" name="model">${modelOptions(provider, settings.model)}</select>
                </div>
              </div>
              <div class="field">
                <label for="base-url">Base URL</label>
                <input id="base-url" name="base_url" value="${escapeHtml(baseUrl)}" autocomplete="off" spellcheck="false" />
                <span class="hint">Change this for proxies, Azure endpoints, or self-hosted models.</span>
              </div>
              <div class="field">
                <label for="api-key">API key</label>
                <input
                  id="api-key"
                  name="api_key"
                  type="password"
                  autocomplete="new-password"
                  placeholder="${connected ? "Saved — enter a new key to replace it" : "Paste a key to unlock live models"}"
                />
                <span class="hint">${connected ? `Currently ${settings.key_source === "environment" ? "reading from the environment" : "using a saved key"}.` : "Leave blank to keep using the demo framework."}</span>
              </div>
              <div class="key-status">
                <div>
                  <strong>${escapeHtml(settings.key_hint || "Not connected")}</strong>
                  <span>${escapeHtml(settings.key_source || "none")} credential</span>
                </div>
                <em>${connected ? "Active" : "Demo only"}</em>
              </div>
              <div class="form-actions">
                <button class="btn primary" type="submit">Save settings</button>
                <button class="btn" type="button" data-action="test-connection">Test connection</button>
              </div>
              <div id="settings-feedback"></div>
            </form>
          </div>

          <div class="panel" id="local-models">
            <span class="kicker accent">Local models</span>
            <h2>Ollama detection</h2>
            <p>Detect models served by a local Ollama instance and switch the studio to use one.</p>
            <div id="local-model-list" class="muted" style="font-size:.75rem;margin:8px 0;">Checking…</div>
            <div class="form-actions">
              <button class="btn" type="button" data-action="detect-local">Detect local models</button>
              <button class="btn primary" type="button" data-action="use-local">Use local model</button>
            </div>
            <div id="local-model-feedback"></div>
          </div>

          <div class="panel" id="framework">
            <span class="kicker accent">Custom framework</span>
            <h2>${escapeHtml(framework.name || "Tablecraft Agent Runtime")}</h2>
            <p>
              ${escapeHtml(framework.orchestration || "director → specialist → critic")} ·
              v${escapeHtml(framework.version || "0.3.0")}. Each specialist can read the project
              manifest and write back to it.
            </p>
            <div style="margin-top:12px">${stageMarkup || `<p class="muted" style="font-size:.7rem">Framework manifest unavailable.</p>`}</div>
            <div class="framework-foot">
              <span>Final reviewer</span>
              <strong>${escapeHtml(framework.critic || "Critic")}</strong>
            </div>
          </div>

          <div class="danger-zone">
            <h3>Reset demo data</h3>
            <p>Restores the three demo projects and clears all agent run history. This cannot be undone.</p>
            <label class="confirm-row">
              <input type="checkbox" id="reset-confirm" />
              <span>I understand this replaces every project.</span>
            </label>
            <button class="btn small" type="button" data-action="reset-demo" id="reset-button" disabled>Reset studio</button>
          </div>
        </div>

        <div class="stack" style="position:sticky;top:84px">
          <div class="panel-dark">
            <div class="connection-head">
              <div>
                <span class="kicker">Connection</span>
                <h2>Studio runtime</h2>
              </div>
              <span class="status ${connected && !demo ? "good" : "warm"}">${connected && !demo ? "Connected" : "Demo mode"}</span>
            </div>
            ${connectionRows}
          </div>

          <div class="panel">
            <span class="kicker">Credentials</span>
            <h2>API keys</h2>
            <p>Keys live only in the local data folder. Environment variables take priority over saved keys.</p>
            <div class="key-status">
              <div>
                <strong>${escapeHtml(settings.key_hint || "Not connected")}</strong>
                <span>${escapeHtml(settings.key_source || "none")}</span>
              </div>
              <em>${connected ? "Active" : "Not set"}</em>
            </div>
            <div class="form-actions" style="margin-top:12px">
              <button class="btn small" type="button" data-action="test-connection">Test connection</button>
              <button class="btn small" type="button" data-action="delete-key" ${connected && settings.key_source === "saved" ? "" : "disabled"}>Remove saved key</button>
            </div>
            <div id="key-feedback"></div>
            <div class="settings-note">
              <strong style="font-family:Lexend;font-size:.64rem">Environment variables</strong>
              <p>OPENAI_API_KEY · ANTHROPIC_API_KEY · GOOGLE_API_KEY · OLLAMA_API_KEY</p>
            </div>
          </div>

          <div class="panel">
            <span class="kicker">Framework</span>
            <h2>Agent contract</h2>
            <p>Every run follows the same envelope: context, specialist draft, critic review, project write-back.</p>
            <div class="framework-foot" style="margin-top:0">
              <span>Provider ready</span>
              <strong>${framework.provider_ready ? "yes" : "no — demo"}</strong>
            </div>
            <div class="framework-foot">
              <span>Demo fallback</span>
              <strong>${framework.demo_mode ? "enabled" : "disabled"}</strong>
            </div>
            <div class="framework-foot">
              <span>Stages</span>
              <strong>${(framework.stages || []).length}</strong>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* --------------------------------- errors -------------------------------- */

  function renderError(error) {
    const message = error && error.message ? error.message : "Something went wrong.";
    const missing = /not found/i.test(message);
    setCrumbs(`<span class="current">Studio</span>`);
    $("#view").innerHTML = `
      <div class="offline-card">
        <span class="kicker accent">${missing ? "Project" : "Connection"}</span>
        <h1>${missing ? "That project is missing." : "The studio is offline."}</h1>
        <p>${escapeHtml(message)}</p>
        ${
          missing
            ? `<p>Pick another game from the shelf and the workspace will load normally.</p>`
            : `<div class="code-inline">python3 run.py</div>
               <p>Then open <strong>http://127.0.0.1:8787</strong> and try again.</p>`
        }
        <div class="project-actions" style="margin-top:16px">
          ${missing
            ? `<a class="btn primary" href="#/projects">Back to projects</a>`
            : `<button class="btn primary" type="button" data-action="reload">Retry connection</button>`}
          <a class="btn" href="#/">Back to studio</a>
        </div>
      </div>`;
  }

  /* --------------------------------- actions ------------------------------- */

  function setAgentBusy(busy) {
    state.agentBusy = busy;
    const form = $("#agent-form");
    if (!form) return;
    const button = form.querySelector('button[type="submit"]');
    const field = form.querySelector("textarea");
    const select = form.querySelector("select");
    if (button) {
      button.disabled = busy;
      button.textContent = busy ? "Running…" : "Run agent";
    }
    if (field) field.disabled = busy;
    if (select) select.disabled = busy;
    const quick = document.querySelector('[data-action="quick-playtest"]');
    if (quick) {
      quick.disabled = busy;
      quick.textContent = busy ? "Running…" : "Run quick playtest";
    }
  }

  async function createProject(form) {
    const field = form.querySelector("textarea");
    const button = form.querySelector('button[type="submit"]');
    const brief = field ? field.value.trim() : "";
    if (brief.length < 3) {
      toast("Give the studio a sentence to work with.");
      if (field) field.focus();
      return;
    }
    setButtonBusy(button, true, "Starting…");
    try {
      const data = await api("/projects", { method: "POST", body: { brief } });
      const project = data.project;
      state.projects = [project, ...state.projects.filter((item) => item.id !== project.id)];
      state.projectsLoaded = true;
      if (field) field.value = "";
      toast(`${project.name} is on the shelf.`);
      go(`#/project/${encodeURIComponent(project.id)}`);
    } catch (error) {
      toast(error.message);
      setButtonBusy(button, false);
    }
  }

  async function importProject(file) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const data = await api("/projects/import", { method: "POST", body: payload });
      state.projects = [data.project, ...state.projects.filter(p => p.id !== data.project.id)];
      state.projectsLoaded = true;
      toast(`Imported ${data.project.name}.`);
      go(`#/project/${encodeURIComponent(data.project.id)}`);
    } catch (error) {
      toast(`Import failed: ${error.message}`);
    }
  }

  async function submitTabComposer(form) {
    const projectId = form.dataset.project;
    const focus = form.dataset.focus || "auto";
    const textarea = form.querySelector("textarea");
    const prompt = textarea ? textarea.value.trim() : "";
    if (!prompt) { toast("Type a prompt first."); return; }
    if (textarea) textarea.value = "";
    await runAgentRequest(projectId, prompt, focus);
  }

  async function submitTchat(form) {
    const wrap = form.closest(".tchat") || form.parentElement;
    const projectId = (wrap && wrap.dataset.project) || form.dataset.project;
    const focus = (wrap && wrap.dataset.focus) || form.dataset.focus || "auto";
    console.log("submitTchat fired", projectId, focus);
    const textarea = form.querySelector("textarea");
    const prompt = textarea ? textarea.value.trim() : "";
    if (!prompt) { console.log("submitTchat empty prompt"); return; }
    if (textarea) { textarea.value = ""; textarea.style.height = "auto"; }
    const key = projectId + ":" + focus;
    state.tabChats = state.tabChats || {};
    state.tabChatThinking = state.tabChatThinking || {};
    state.tabChats[key] = state.tabChats[key] || [];
    state.tabChats[key].push({ role: "user", content: prompt });
    state.tabChatThinking[key] = true;
    // re-render to show user msg + thinking
    renderProject();
    // call model
    const system = `You are a helpful board game design assistant focusing on the ${focus} aspect of the project "${state.activeProject?.name || ""}". Be concise.`;
    const messages = [{ role: "system", content: system }, ...state.tabChats[key].map(m => ({ role: m.role, content: m.content }))];
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, model: (state.settings && state.settings.model) || undefined }),
      });
      const data = await res.json();
      const reply = data.content || (res.ok ? "(no response)" : `Error: ${data.detail || res.statusText}`);
      state.tabChats[key].push({ role: "assistant", content: reply });
    } catch (e) {
      state.tabChats[key].push({ role: "assistant", content: `Network error: ${e.message}` });
    }
    state.tabChatThinking[key] = false;
    renderProject();
  }

  async function saveProject(project) {
    const data = await api(`/projects/${encodeURIComponent(project.id)}`, { method: "PUT", body: project });
    state.activeProject = data.project;
    toast("Saved.");
    // refresh list
    try { await loadProjects(true); } catch (e) {}
    renderProject();
  }

  async function deleteProject(project) {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    try {
      await api(`/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      state.activeProject = null;
      state.activeRuns = [];
      toast(`Deleted ${project.name}.`);
      await loadProjects(true);
      go("#/projects");
    } catch (e) {
      toast(e.message);
    }
  }

  async function runAgentRequest(projectId, prompt, focus) {
    if (state.agentBusy) return;
    setAgentBusy(true);
    try {
      const data = await api(`/projects/${encodeURIComponent(projectId)}/agent/run`, {
        method: "POST",
        body: { prompt, focus },
      });
      state.activeProject = data.project;
      state.activeRuns = [data.run, ...state.activeRuns];
      state.drafts[projectId] = "";
      // (model response is reflected via the updated project content)
      const tab =
        data.run.focus === "visuals" ? "assets" : data.run.focus === "simulation" ? "playtests" : "ruleset";
      state.activeTab = tab;
      state.agentBusy = false;
      history.replaceState(null, "", `#/project/${encodeURIComponent(projectId)}/${tab}`);
      try {
        await loadProjects(true);
      } catch (error) {
        state.projectsLoaded = false;
      }
      renderProject();
      toast(data.run.summary || "Agent run complete.");
      refreshHealth();
    } catch (error) {
      state.agentBusy = false;
      setAgentBusy(false);
      toast(error.message);
    }
  }

  async function submitAgent(form) {
    const promptField = form.querySelector("textarea");
    const focusField = form.querySelector("select");
    const projectId = form.dataset.project;
    const prompt = promptField ? promptField.value.trim() : "";
    if (!prompt) {
      toast("Tell the agent what to work on.");
      if (promptField) promptField.focus();
      return;
    }
    state.drafts[projectId] = prompt;
    await runAgentRequest(projectId, prompt, focusField ? focusField.value : "auto");
  }

  function exportProject() {
    const project = state.activeProject;
    if (!project) return;
    const payload = {
      exported_at: new Date().toISOString(),
      project,
      runs: state.activeRuns,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
    link.href = url;
    link.download = `${slug}.tablecraft.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${project.name}.`);
  }

  async function copyCode() {
    const project = state.activeProject;
    if (!project) return;
    const files = project.code || [];
    if (!files.length) return;
    const index = Math.min(Math.max(Number(state.codeIndex[project.id]) || 0, 0), files.length - 1);
    try {
      await navigator.clipboard.writeText(files[index].code);
      toast("Code copied to clipboard.");
    } catch (error) {
      toast("Clipboard access was blocked.");
    }
  }

  async function saveSettings(form) {
    const provider = form.querySelector("#provider-select").value;
    const model = form.querySelector("#model-select").value;
    const baseUrl = form.querySelector("#base-url").value;
    const apiKey = form.querySelector("#api-key").value;
    const submit = form.querySelector('button[type="submit"]');
    const feedback = $("#settings-feedback");
    setButtonBusy(submit, true, "Saving…");
    if (feedback) feedback.innerHTML = "";
    try {
      const data = await api("/settings", {
        method: "PUT",
        body: { provider, model, base_url: baseUrl, api_key: apiKey },
      });
      state.settings = data.settings;
      toast("Settings saved.");
      await refreshHealth();
      renderSettings();
      toast(state.settings.demo_mode ? "Saved. Studio is in demo mode." : "Saved. Live provider ready.");
    } catch (error) {
      if (feedback) feedback.innerHTML = `<div class="inline-error">${escapeHtml(error.message)}</div>`;
      setButtonBusy(submit, false);
    }
  }

  async function testConnection() {
    const buttons = document.querySelectorAll('[data-action="test-connection"]');
    buttons.forEach((button) => setButtonBusy(button, true, "Testing…"));
    const target = $("#settings-feedback") || $("#key-feedback");
    try {
      const data = await api("/settings/test", { method: "POST" });
      const message = data.connected
        ? `${data.provider} · ${data.model} — ${data.message}`
        : data.message;
      if (target) {
        target.innerHTML = `<div class="${data.connected ? "inline-ok" : "inline-error"}">${escapeHtml(message)}</div>`;
      }
      toast(message);
    } catch (error) {
      if (target) target.innerHTML = `<div class="inline-error">${escapeHtml(error.message)}</div>`;
      toast(error.message);
    } finally {
      buttons.forEach((button) => setButtonBusy(button, false));
    }
  }

  async function detectLocalModels() {
    const list = $("#local-model-list");
    const feedback = $("#local-model-feedback");
    if (list) list.textContent = "Checking…";
    try {
      const data = await api("/local/models");
      if (data.available && data.models && data.models.length) {
        if (list) list.innerHTML = data.models.map((m) => `<div>• ${escapeHtml(m)}</div>`).join("");
        if (feedback) feedback.innerHTML = `<div class="inline-ok">Detected ${data.models.length} local model(s).</div>`;
        state.localModels = data.models;
        state.localBaseUrl = data.base_url;
      } else {
        if (list) list.textContent = "No local models found.";
        if (feedback) feedback.innerHTML = `<div class="inline-error">${escapeHtml(data.error || "Ollama is not reachable on " + (data.base_url || "localhost:11434"))}</div>`;
      }
    } catch (e) {
      if (list) list.textContent = "No local models found.";
      if (feedback) feedback.innerHTML = `<div class="inline-error">${escapeHtml(e.message)}</div>`;
    }
  }

  async function useLocalModel() {
    const models = state.localModels || [];
    if (!models.length) {
      await detectLocalModels();
    }
    if (!(state.localModels || []).length) {
      toast("No local models detected.");
      return;
    }
    const model = state.localModels[0];
    const base_url = state.localBaseUrl || "http://localhost:11434";
    try {
      const data = await api("/settings", {
        method: "PUT",
        body: JSON.stringify({ provider: "local", model, base_url, api_key: "" }),
      });
      state.settings = data.settings;
      await refreshHealth();
      renderSettings();
      toast("Switched to local model: " + model);
    } catch (e) {
      toast(e.message);
    }
  }

  async function deleteKey() {
    const button = document.querySelector('[data-action="delete-key"]');
    setButtonBusy(button, true, "Removing…");
    try {
      const data = await api("/settings/key", { method: "DELETE" });
      state.settings = data.settings;
      toast("Saved key removed. Demo framework enabled.");
      await refreshHealth();
      renderSettings();
    } catch (error) {
      toast(error.message);
      setButtonBusy(button, false);
    }
  }

  async function resetDemo() {
    const checkbox = $("#reset-confirm");
    const button = $("#reset-button");
    if (!checkbox || !checkbox.checked) {
      toast("Tick the confirmation box first.");
      return;
    }
    setButtonBusy(button, true, "Resetting…");
    try {
      const data = await api("/demo/reset", { method: "POST" });
      state.projects = data.projects || [];
      state.projectsLoaded = true;
      state.activeProject = null;
      state.activeRuns = [];
      state.drafts = {};
      state.codeIndex = {};
      toast(data.message || "Demo projects restored.");
      go("#/");
    } catch (error) {
      toast(error.message);
      setButtonBusy(button, false);
    }
  }

  /* --------------------------------- events -------------------------------- */

  async function loadLocalModels() {
    try {
      const data = await api("/chat/models");
      const models = data.models || [];
      state.localModels = models;
      return { models, default: data.default };
    } catch (e) {
      state.localModels = [];
      return { models: [], default: null };
    }
  }

  async function updateProviderFields(providerId) {
    const provider = catalogProvider(providerId);
    if (!provider) return;
    const modelSelect = $("#model-select");
    const baseUrl = $("#base-url");
    const keyInput = $("#api-key");
    if (baseUrl) baseUrl.value = provider.base_url || "";
    if (keyInput) keyInput.placeholder = provider.key_label || "API key";

    if (providerId === "local") {
      const { models, default: def } = await loadLocalModels();
      const current = (state.settings && state.settings.provider === "local" && state.settings.model) || def || (models[0] || "");
      if (modelSelect) {
        const opts = models.length ? models : provider.models;
        if (current && !opts.includes(current)) opts.unshift(current);
        modelSelect.innerHTML = opts.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
        if (current) modelSelect.value = current;
      }
      const status = $("#settings-feedback");
      if (status) {
        status.innerHTML = models.length
          ? `<div class="inline-ok">Detected ${models.length} local model(s): ${escapeHtml(models.join(", "))}</div>`
          : `<div class="inline-error">No local models detected. Is Ollama running on the base URL?</div>`;
      }
    } else if (modelSelect) {
      modelSelect.innerHTML = modelOptions(providerId, provider.models[0]);
    }
  }

  function onSubmit(event) {
    console.log("onSubmit fired", event.target && event.target.className);
    const form = event.target;
    if (form.classList && form.classList.contains("tchat-form")) {
      event.preventDefault();
      submitTchat(form).catch(e => console.error("submitTchat error", e));
    } else if (form.id === "brief-form") {
      event.preventDefault();
      createProject(form);
    } else if (form.id === "agent-form") {
      event.preventDefault();
      submitAgent(form);
    } else if (form.id === "settings-form") {
      event.preventDefault();
      saveSettings(form);
    }
  }

  function onClick(event) {
    const actionEl = event.target.closest("[data-action]");
    if (actionEl && !actionEl.disabled) {
      const action = actionEl.dataset.action;
      if (action === "edit-section") {
        state.editing[actionEl.dataset.section] = true;
        renderProject();
      } else if (action === "cancel-edit") {
        delete state.editing[actionEl.dataset.section];
        renderProject();
      } else if (action === "save-title") {
        const input = document.getElementById("edit-title");
        const project = state.activeProject;
        project.name = input ? input.value.trim() || project.name : project.name;
        delete state.editing.title;
        saveProject(project);
      } else if (action === "save-ruleset") {
        const project = state.activeProject;
        const rules = project.ruleset || {};
        const wc = document.getElementById("edit-win-condition");
        const dn = document.getElementById("edit-design-notes");
        if (wc) rules.win_condition = wc.value;
        if (dn) rules.design_notes = dn.value.split("\\n").map(s => s.trim()).filter(Boolean);
        // section bodies
        document.querySelectorAll(".rule-edit-body").forEach(ta => {
          const idx = Number(ta.dataset.index);
          if (rules.sections && rules.sections[idx]) rules.sections[idx].body = ta.value;
        });
        project.ruleset = rules;
        delete state.editing.ruleset;
        saveProject(project);
      } else if (action === "save-code") {
        const project = state.activeProject;
        const files = project.code || [];
        const index = Math.min(Math.max(Number(state.codeIndex[project.id]) || 0, 0), files.length - 1);
        const path = document.getElementById("edit-code-path");
        const lang = document.getElementById("edit-code-lang");
        const desc = document.getElementById("edit-code-desc");
        const body = document.getElementById("edit-code-body");
        if (files[index]) {
          if (path) files[index].path = path.value;
          if (lang) files[index].language = lang.value;
          if (desc) files[index].description = desc.value;
          if (body) files[index].code = body.value;
        }
        project.code = files;
        delete state.editing.code;
        saveProject(project);
      } else if (action === "save-assets") {
        const project = state.activeProject;
        const assets = project.assets || [];
        document.querySelectorAll("[data-asset]").forEach(el => {
          const i = Number(el.dataset.asset);
          const field = el.dataset.field;
          if (assets[i]) assets[i][field] = el.value;
        });
        project.assets = assets;
        delete state.editing.assets;
        saveProject(project);
      } else if (action === "save-summary") {
        const project = state.activeProject;
        const desc = document.getElementById("edit-description");
        const genre = document.getElementById("edit-genre");
        const players = document.getElementById("edit-players");
        const playtime = document.getElementById("edit-playtime");
        const age = document.getElementById("edit-age");
        const tags = document.getElementById("edit-tags");
        if (desc) project.description = desc.value;
        if (genre) project.genre = genre.value;
        if (players) project.players = players.value;
        if (playtime) project.playtime = playtime.value;
        if (age) project.age = age.value;
        if (tags) project.tags = tags.value.split(",").map(s => s.trim()).filter(Boolean);
        delete state.editing.summary;
        saveProject(project);
      } else if (action === "remove-asset-image") {
        const idx = Number(actionEl.dataset.asset);
        const project = state.activeProject;
        if (project && project.assets && project.assets[idx]) {
          project.assets[idx].image = "";
          saveProject(project);
        }
      } else if (action === "delete-project") {
        if (state.activeProject) deleteProject(state.activeProject);
      } else if (action === "publish-project") {
        const project = state.activeProject;
        project.visibility = (project.visibility === "public") ? "private" : "public";
        saveProject(project);
      } else if (action === "save-model-json") {
        const project = state.activeProject;
        const ta = document.getElementById("model-json");
        try {
          const parsed = JSON.parse(ta.value);
          project.model = parsed;
          saveProject(project);
        } catch (e) {
          toast("Invalid JSON: " + e.message);
        }
      } else if (action === "add-state") {
        const project = state.activeProject;
        const model = project.model || {};
        model.states = model.states || {};
        const id = (document.getElementById("new-state-id").value || "").trim();
        const label = (document.getElementById("new-state-label").value || "").trim() || id;
        const desc = (document.getElementById("new-state-desc").value || "").trim();
        const asset = document.getElementById("new-state-asset").value;
        if (!id) { toast("State id required."); return; }
        if (model.states[id]) { toast("State already exists."); return; }
        model.states[id] = { label, description: desc, on: {} };
        if (asset) model.states[id].assets = [asset];
        if (!model.initial) model.initial = id;
        project.model = model;
        saveProject(project);
      } else if (action === "add-transition") {
        const project = state.activeProject;
        const model = project.model || {};
        model.states = model.states || {};
        const from = document.getElementById("tr-from").value;
        const ev = (document.getElementById("tr-event").value || "").trim();
        const to = document.getElementById("tr-to").value;
        if (!from || !ev || !to) { toast("Fill all transition fields."); return; }
        if (!model.states[from]) { toast("Unknown from state."); return; }
        model.states[from].on = model.states[from].on || {};
        model.states[from].on[ev] = to;
        project.model = model;
        saveProject(project);
      } else if (action === "copy-tchat") {
        const text = actionEl.dataset.text || "";
        if (text) {
          navigator.clipboard.writeText(text).then(() => toast("Copied."), () => toast("Copy failed."));
        }
      } else if (action === "export-project") exportProject();
      else if (action === "import-project") {
        const input = document.getElementById("import-file");
        if (input) input.click();
      }
      else if (action === "quick-playtest") quickPlaytest();
      else if (action === "copy-code") copyCode();
      else if (action === "test-connection") testConnection();
      else if (action === "detect-local") detectLocalModels();
      else if (action === "use-local") useLocalModel();
      else if (action === "delete-key") deleteKey();
      else if (action === "reset-demo") resetDemo();
      else if (action === "reload") window.location.reload();
      return;
    }

    const scrollEl = event.target.closest("[data-scroll]");
    if (scrollEl) {
      const target = scrollEl.dataset.scroll;
      state.pendingScroll = target;
      if (!window.location.hash.startsWith("#/settings")) {
        window.location.hash = "#/settings";
      } else {
        state.pendingScroll = "";
        scrollToSection(target);
      }
    }
  }

  function onChange(event) {
    if (event.target.id === "provider-select") {
      updateProviderFields(event.target.value);
    } else if (event.target.id === "code-select") {
      const project = state.activeProject;
      if (!project) return;
      state.codeIndex[project.id] = Number(event.target.value) || 0;
      const panel = $("#tab-panel");
      if (panel) panel.innerHTML = renderTab(project);
    } else if (event.target.id === "import-file") {
      const file = event.target.files && event.target.files[0];
      if (file) importProject(file);
      event.target.value = "";
    } else if (event.target.dataset && event.target.dataset.assetImg !== undefined) {
      const input = event.target;
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const idx = Number(input.dataset.assetImg);
        const project = state.activeProject;
        if (project && project.assets && project.assets[idx]) {
          project.assets[idx].image = reader.result;
          // update preview in DOM
          const card = input.closest(".asset-card");
          const preview = card && card.querySelector(".asset-preview");
          if (preview) preview.innerHTML = `<img src="${reader.result}" alt="" style="width:100%;height:auto;display:block;" />`;
        }
      };
      reader.readAsDataURL(file);
    } else if (event.target.id === "reset-confirm") {
      const button = $("#reset-button");
      if (button) button.disabled = !event.target.checked;
    }
  }

  function onInput(event) {
    if (event.target.id === "agent-prompt") {
      const form = event.target.closest("#agent-form");
      if (form && form.dataset.project) {
        state.drafts[form.dataset.project] = event.target.value;
      }
    }
  }

  function onKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      const route = parseRoute();
      if (route.name === "project") {
        const prompt = $("#agent-prompt");
        if (prompt) {
          prompt.focus();
          prompt.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else {
        const brief = $("#brief-input");
        if (brief) {
          brief.focus();
          brief.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          go("#/compose");
        }
      }
    }
  }

  function quickPlaytest() {
    const project = state.activeProject;
    if (!project) return;
    runAgentRequest(
      project.id,
      "Run a virtual playtest on the current build. Report the biggest balance risk, the strongest strategy, and one concrete tuning change.",
      "simulation",
    );
  }

  /* ---------------------------------- boot --------------------------------- */

  function init() {
    window.addEventListener("hashchange", render);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);
    document.addEventListener("keydown", onKeydown);

    paintHealth();
    refreshHealth();
    loadSettings().catch(() => {
      state.settings = null;
      state.framework = null;
    });
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
