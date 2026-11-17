// Flowchart editor module — adapted from graphical-flowchart-ex.html, Tablecraft-styled.
// Usage: FlowchartEditor.mount(container, { project, assets, onSave, onSync })
(function () {
  "use strict";

  const BASE_GRID = 20;
  const MIN_NODE = 40;

  function FlowchartEditor(container, opts) {
    this.container = container;
    this.project = opts.project || {};
    this.assets = opts.assets || [];
    this.onSave = opts.onSave || function () {};
    this.onSync = opts.onSync || function () {};
    this.state = this.project.flowchart
      ? { nodes: this.project.flowchart.nodes || [], connections: this.project.flowchart.edges ? this.project.flowchart.edges.map(e => ({ id: e.id || ("conn_" + Math.random().toString(36).slice(2)), from: e.from, to: e.to, label: e.label || "" })) : [] }
      : { nodes: [], connections: [] };
    // normalize
    if (!this.state.nodes) this.state.nodes = [];
    if (!this.state.connections) this.state.connections = [];
    this.state.nodes = this.state.nodes.map(n => ({
      id: n.id, type: n.type || n.shape || "rect", x: n.x || 0, y: n.y || 0,
      width: n.width || 120, height: n.height || 60, label: n.label || n.id,
      assets: n.assets || (n.asset ? [n.asset] : [])
    }));

    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.startX = 0; this.startY = 0;
    this.selectedId = null;
    this.isArrowMode = false;
    this.connectionSource = null;

    this.build();
    this.renderFromState();
  }

  FlowchartEditor.prototype.build = function () {
    const c = this.container;
    c.innerHTML = "";
    c.className = "fc-root";
    c.innerHTML = `
      <div class="fc-page">
        <div class="fc-editor-section">
          <div id="fc-json-panel" class="fc-json-panel">
            <div class="fc-panel-header">
              <span>JSON SPECIFICATION</span>
              <button class="fc-btn-apply" id="fc-apply-json">Apply JSON</button>
            </div>
            <textarea id="fc-json-editor" class="fc-json-editor" spellcheck="false"></textarea>
          </div>
          <button class="fc-btn-toggle" id="fc-toggle-json" title="Toggle JSON Panel">❮ JSON</button>
          <div class="fc-viewport" id="fc-viewport">
            <div class="fc-canvas-content" id="fc-canvas-content">
              <svg id="fc-svg-layer" class="fc-svg-layer">
                <defs>
                  <marker id="fc-arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#495057" /></marker>
                  <marker id="fc-arrowhead-sel" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#6c4cf1" /></marker>
                </defs>
              </svg>
            </div>
          </div>
          <div id="fc-zoom-indicator" class="fc-zoom-indicator">Zoom: 100%</div>
          <div style="position:absolute;bottom:20px;right:120px;display:flex;gap:4px;z-index:1000;">
            <button class="fc-tool-btn" id="fc-zoom-in" title="Zoom in" style="width:32px;height:32px;">+</button>
            <button class="fc-tool-btn" id="fc-zoom-out" title="Zoom out" style="width:32px;height:32px;">−</button>
            <button class="fc-tool-btn" id="fc-zoom-reset" title="Reset zoom" style="width:32px;height:32px;font-size:11px;">1:1</button>
          </div>
          <div class="fc-sidebar" id="fc-sidebar">
            <button class="fc-tool-btn" data-shape="rect" title="Rectangle"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="0"/></svg></button>
            <button class="fc-tool-btn" data-shape="rounded" title="Rounded Rectangle"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="5"/></svg></button>
            <button class="fc-tool-btn" data-shape="diamond" title="Diamond"><svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" transform="rotate(45 12 12)"/></svg></button>
            <button class="fc-tool-btn" data-shape="hexagon" title="Hexagon"><svg viewBox="0 0 24 24"><polygon points="12,2 21,7 21,17 12,22 3,17 3,7"/></svg></button>
            <button class="fc-tool-btn" data-shape="circle" title="Circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg></button>
            <button class="fc-tool-btn" id="fc-arrow-btn" title="Connect Nodes with Arrow"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
          </div>
        </div>
      </div>`;

    this.viewport = c.querySelector("#fc-viewport");
    this.canvasContent = c.querySelector("#fc-canvas-content");
    this.svgLayer = c.querySelector("#fc-svg-layer");
    this.jsonPanel = c.querySelector("#fc-json-panel");
    this.jsonEditor = c.querySelector("#fc-json-editor");
    this.zoomIndicator = c.querySelector("#fc-zoom-indicator");
    this.arrowBtn = c.querySelector("#fc-arrow-btn");
    this.zoomInBtn = c.querySelector("#fc-zoom-in");
    this.zoomOutBtn = c.querySelector("#fc-zoom-out");
    this.zoomResetBtn = c.querySelector("#fc-zoom-reset");
    this.syncJson();
    this.bindEvents();
    this.updateTransform();
    this.renderFromState();
  };

  FlowchartEditor.prototype.updateTransform = function () {
    this.canvasContent.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    let effectiveGap = BASE_GRID * this.scale;
    let dotSize = 1.5;
    if (this.scale < 0.5) { effectiveGap *= 2; dotSize = 1.0; }
    if (this.scale < 0.25) { dotSize = 0.8; }
    this.viewport.style.setProperty('--grid-gap', effectiveGap + 'px');
    this.viewport.style.setProperty('--dot-size', dotSize + 'px');
    this.viewport.style.backgroundPosition = this.panX + 'px ' + this.panY + 'px';
    this.zoomIndicator.textContent = 'Zoom: ' + Math.round(this.scale * 100) + '%';
  };

  FlowchartEditor.prototype.syncJson = function () {
    this.jsonEditor.value = JSON.stringify(this.state, null, 2);
  };

  FlowchartEditor.prototype.applyJson = function () {
    try {
      const parsed = JSON.parse(this.jsonEditor.value);
      if (parsed.nodes && parsed.connections) {
        this.state = parsed;
        this.renderFromState();
        this.syncJson();
      }
    } catch (err) {
      alert("Syntax Error in JSON configuration!");
    }
  };

  FlowchartEditor.prototype.toggleJson = function () {
    this.jsonPanel.classList.toggle('collapsed');
    const btn = this.container.querySelector('.fc-btn-toggle');
    btn.innerText = this.jsonPanel.classList.contains('collapsed') ? '❯ JSON' : '❮ JSON';
  };

  FlowchartEditor.prototype.snapToGrid = function (val) {
    return Math.round(val / BASE_GRID) * BASE_GRID;
  };

  FlowchartEditor.prototype.renderFromState = function () {
    const canvasContent = this.canvasContent;
    const svgLayer = this.svgLayer;
    // remove old
    canvasContent.querySelectorAll('.fc-shape').forEach(n => n.remove());
    svgLayer.querySelectorAll('.fc-connector-path').forEach(p => p.remove());
    canvasContent.querySelectorAll('.fc-connection-label').forEach(l => l.remove());

    const self = this;
    this.state.nodes.forEach(node => {
      const el = document.createElement('div');
      el.id = node.id;
      el.className = 'fc-shape fc-shape-' + node.type + (this.selectedId === node.id ? ' selected' : '');
      el.style.width = node.width + 'px';
      el.style.height = node.height + 'px';
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';

      const textDiv = document.createElement('div');
      textDiv.className = 'fc-editable-text';
      textDiv.contentEditable = true;
      textDiv.spellcheck = false;
      textDiv.innerText = node.label;
      textDiv.addEventListener('input', () => { node.label = textDiv.innerText; self.syncJson(); });
      textDiv.addEventListener('mousedown', (e) => e.stopPropagation());

      if (node.type === 'hexagon') {
        const svgHex = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgHex.setAttribute('class', 'fc-shape-hexagon-svg');
        svgHex.setAttribute('viewBox', '0 0 100 100');
        svgHex.setAttribute('preserveAspectRatio', 'none');
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '25,2 75,2 98,50 75,98 25,98 2,50');
        svgHex.appendChild(polygon);
        el.appendChild(svgHex);
        el.appendChild(textDiv);
      } else if (node.type === 'diamond') {
        const inner = document.createElement('div');
        inner.className = 'fc-shape-diamond-inner';
        inner.appendChild(textDiv);
        el.appendChild(inner);
      } else {
        el.appendChild(textDiv);
      }

      ['nw','ne','sw','se'].forEach(dir => {
        const handle = document.createElement('div');
        handle.className = 'fc-resize-handle ' + dir;
        handle.addEventListener('mousedown', (e) => self.initResize(e, node, dir));
        el.appendChild(handle);
      });

      el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        self.handleNodeClick(node.id);
      });

      this.makeDraggable(el, node);
      canvasContent.appendChild(el);
    });

    this.updateConnections();
    this.syncJson();
  };

  FlowchartEditor.prototype.updateConnections = function () {
    const svgLayer = this.svgLayer;
    const canvasContent = this.canvasContent;
    svgLayer.querySelectorAll('.fc-connector-path').forEach(p => p.remove());
    canvasContent.querySelectorAll('.fc-connection-label').forEach(l => l.remove());

    const self = this;
    this.state.connections.forEach(conn => {
      const fromNode = this.state.nodes.find(n => n.id === conn.from);
      const toNode = this.state.nodes.find(n => n.id === conn.to);
      if (!fromNode || !toNode) return;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.id = conn.id;
      path.setAttribute('class', 'fc-connector-path' + (this.selectedId === conn.id ? ' selected' : ''));
      path.setAttribute('marker-end', this.selectedId === conn.id ? 'url(#fc-arrowhead-sel)' : 'url(#fc-arrowhead)');

      const pts = this.calculateConnectionPoints(fromNode, toNode);
      path.setAttribute('d', 'M ' + pts.x1 + ' ' + pts.y1 + ' L ' + pts.x2 + ' ' + pts.y2);

      path.addEventListener('mousedown', (e) => { e.stopPropagation(); self.selectElement(conn.id); });

      svgLayer.appendChild(path);

      const labelDiv = document.createElement('div');
      labelDiv.className = 'fc-connection-label';
      labelDiv.contentEditable = true;
      labelDiv.spellcheck = false;
      labelDiv.innerText = conn.label || '';
      labelDiv.style.left = ((pts.x1 + pts.x2) / 2) + 'px';
      labelDiv.style.top = ((pts.y1 + pts.y2) / 2) + 'px';

      labelDiv.addEventListener('input', () => { conn.label = labelDiv.innerText; self.syncJson(); });
      labelDiv.addEventListener('mousedown', (e) => { e.stopPropagation(); self.selectElement(conn.id); });

      canvasContent.appendChild(labelDiv);
    });
  };

  FlowchartEditor.prototype.calculateConnectionPoints = function (from, to) {
    const c1x = from.x + from.width / 2;
    const c1y = from.y + from.height / 2;
    const c2x = to.x + to.width / 2;
    const c2y = to.y + to.height / 2;
    const angle = Math.atan2(c2y - c1y, c2x - c1x);
    return {
      x1: c1x + (from.width / 2) * Math.cos(angle),
      y1: c1y + (from.height / 2) * Math.sin(angle),
      x2: c2x - (to.width / 2) * Math.cos(angle),
      y2: c2y - (to.height / 2) * Math.sin(angle)
    };
  };

  FlowchartEditor.prototype.makeDraggable = function (el, nodeData) {
    const self = this;
    let startMouseX = 0, startMouseY = 0, initialX = 0, initialY = 0;
    el.addEventListener('mousedown', (e) => {
      if (e.target.isContentEditable || e.target.classList.contains('fc-resize-handle') || self.isArrowMode) return;
      startMouseX = e.clientX; startMouseY = e.clientY;
      initialX = nodeData.x; initialY = nodeData.y;
      const onMouseMove = (moveEvent) => {
        const dx = (moveEvent.clientX - startMouseX) / self.scale;
        const dy = (moveEvent.clientY - startMouseY) / self.scale;
        nodeData.x = self.snapToGrid(initialX + dx);
        nodeData.y = self.snapToGrid(initialY + dy);
        el.style.left = nodeData.x + 'px';
        el.style.top = nodeData.y + 'px';
        self.updateConnections();
        self.syncJson();
      };
      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  };

  FlowchartEditor.prototype.initResize = function (e, nodeData, dir) {
    e.stopPropagation();
    const startMouseX = e.clientX, startMouseY = e.clientY;
    const initX = nodeData.x, initY = nodeData.y, initW = nodeData.width, initH = nodeData.height;
    const self = this;
    const onMouseMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startMouseX) / self.scale;
      const dy = (moveEvent.clientY - startMouseY) / self.scale;
      let newW = initW, newH = initH, newX = initX, newY = initY;
      if (dir.includes('e')) newW = Math.max(MIN_NODE_SIZE, self.snapToGrid(initW + dx));
      if (dir.includes('s')) newH = Math.max(MIN_NODE_SIZE, self.snapToGrid(initH + dy));
      if (dir.includes('w')) {
        const proposedW = self.snapToGrid(initW - dx);
        if (proposedW >= MIN_NODE_SIZE) { newW = proposedW; newX = self.snapToGrid(initX + dx); }
      }
      if (dir.includes('n')) {
        const proposedH = self.snapToGrid(initH - dy);
        if (proposedH >= MIN_NODE_SIZE) { newH = proposedH; newY = self.snapToGrid(initY + dy); }
      }
      nodeData.x = newX; nodeData.y = newY; nodeData.width = newW; nodeData.height = newH;
      const el = document.getElementById(nodeData.id);
      if (el) { el.style.left = newX + 'px'; el.style.top = newY + 'px'; el.style.width = newW + 'px'; el.style.height = newH + 'px'; }
      self.updateConnections();
      self.syncJson();
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  FlowchartEditor.prototype.handleNodeClick = function (id) {
    if (this.isArrowMode) {
      if (!this.connectionSource) {
        this.connectionSource = id;
        const el = document.getElementById(id);
        if (el) el.classList.add('connecting-target');
      } else if (this.connectionSource !== id) {
        this.state.connections.push({ id: 'conn_' + Date.now(), from: this.connectionSource, to: id, label: '' });
        this.toggleArrow(false);
        this.renderFromState();
        this.selectElement('conn_' + (this.state.connections.length));
      }
    } else {
      this.selectElement(id);
    }
  };

  FlowchartEditor.prototype.selectElement = function (id) {
    this.deselectAll();
    this.selectedId = id;
    const nodeEl = document.getElementById(id);
    if (nodeEl) nodeEl.classList.add('selected');
    const pathEl = document.getElementById(id);
    if (pathEl && pathEl.classList.contains('fc-connector-path')) {
      pathEl.classList.add('selected');
      pathEl.setAttribute('marker-end', 'url(#fc-arrowhead-sel)');
    }
  };

  FlowchartEditor.prototype.deselectAll = function () {
    this.selectedId = null;
    document.querySelectorAll('.fc-shape').forEach(n => n.classList.remove('selected'));
    document.querySelectorAll('.fc-connector-path').forEach(p => {
      p.classList.remove('selected');
      p.setAttribute('marker-end', 'url(#fc-arrowhead)');
    });
  };

  FlowchartEditor.prototype.toggleArrow = function (force) {
    this.isArrowMode = (force === undefined) ? !this.isArrowMode : force;
    this.connectionSource = null;
    this.arrowBtn.classList.toggle('active', this.isArrowMode);
    document.querySelectorAll('.fc-shape').forEach(el => el.classList.remove('connecting-target'));
  };

  FlowchartEditor.prototype.addShape = function (type) {
    const id = 'node_' + Date.now();
    const rect = this.viewport.getBoundingClientRect();
    const centerX = this.snapToGrid((-this.panX + rect.width / 2 - 60) / this.scale);
    const centerY = this.snapToGrid((-this.panY + rect.height / 2 - 40) / this.scale);
    let width = 120, height = 60;
    if (type === 'circle') { width = 100; height = 100; }
    else if (type === 'diamond') { width = 90; height = 90; }
    else if (type === 'hexagon') { width = 110; height = 90; }

    this.state.nodes.push({ id, type, x: centerX, y: centerY, width, height, label: type.charAt(0).toUpperCase() + type.slice(1), assets: [] });
    this.renderFromState();
    this.selectElement(id);
  };

  FlowchartEditor.prototype.bindEvents = function () {
    const self = this;
    const viewport = this.viewport;
    const canvasContent = this.canvasContent;

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(self.scale * zoomFactor, 0.15), 3.0);
      const mouseX = e.clientX - viewport.getBoundingClientRect().left;
      const mouseY = e.clientY - viewport.getBoundingClientRect().top;
      self.panX = mouseX - (mouseX - self.panX) * (newScale / self.scale);
      self.panY = mouseY - (mouseY - self.panY) * (newScale / self.scale);
      self.scale = newScale;
      self.updateTransform();
    }, { passive: false });

    viewport.addEventListener('mousedown', (e) => {
      if (e.target === viewport || e.target === canvasContent || e.target === self.svgLayer) {
        self.deselectAll();
        self.isPanning = true;
        self.startX = e.clientX - self.panX;
        self.startY = e.clientY - self.panY;
        viewport.classList.add('panning');
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (self.isPanning) {
        self.panX = e.clientX - self.startX;
        self.panY = e.clientY - self.startY;
        self.updateTransform();
      }
    });

    window.addEventListener('mouseup', () => {
      self.isPanning = false;
      viewport.classList.remove('panning');
    });

    // sidebar tool buttons
    this.container.querySelectorAll('.fc-tool-btn[data-shape]').forEach(btn => {
      btn.addEventListener('click', () => self.addShape(btn.dataset.shape));
    });
    this.arrowBtn.addEventListener('click', () => self.toggleArrow());
    if (this.zoomInBtn) this.zoomInBtn.addEventListener('click', () => { self.scale = Math.min(3, self.scale * 1.2); self.updateTransform(); });
    if (this.zoomOutBtn) this.zoomOutBtn.addEventListener('click', () => { self.scale = Math.max(0.15, self.scale / 1.2); self.updateTransform(); });
    if (this.zoomResetBtn) this.zoomResetBtn.addEventListener('click', () => { self.scale = 1; self.panX = 0; self.panY = 0; self.updateTransform(); });
    // json panel
    const toggleBtn = this.container.querySelector('.fc-btn-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', () => self.toggleJson());
    const applyBtn = this.container.querySelector('.fc-btn-apply');
    if (applyBtn) applyBtn.addEventListener('click', () => self.applyJson());

    // keyboard delete
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && self.selectedId) {
        if (document.activeElement && document.activeElement.isContentEditable) return;
        self.state.nodes = self.state.nodes.filter(n => n.id !== self.selectedId);
        self.state.connections = self.state.connections.filter(c => c.id !== self.selectedId && c.from !== self.selectedId && c.to !== self.selectedId);
        self.selectedId = null;
        self.renderFromState();
      }
    });
  };

  FlowchartEditor.prototype.getState = function () { return this.state; };

  window.FlowchartEditor = FlowchartEditor;
})();
