export class DiagramBuilder {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      gridSize: options.gridSize || 20,
      snapToGrid: options.snapToGrid !== false,
      onNodeSelect: options.onNodeSelect || (() => {}),
      onConnectionCreate: options.onConnectionCreate || (() => {}),
      onDiagramChange: options.onDiagramChange || (() => {}),
      ...options
    };
    
    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
    this.dragging = null;
    this.connecting = null;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    
    this.nodeTypes = this.getDefaultNodeTypes();
    this.init();
  }

  getDefaultNodeTypes() {
    return {
      service: { icon: '⚙️', color: '#3b82f6', label: 'Service' },
      database: { icon: '🗄️', color: '#10b981', label: 'Database' },
      api: { icon: '🔌', color: '#8b5cf6', label: 'API' },
      queue: { icon: '📨', color: '#f59e0b', label: 'Queue' },
      storage: { icon: '💾', color: '#06b6d4', label: 'Storage' },
      function: { icon: '⚡', color: '#ef4444', label: 'Function' },
      user: { icon: '👤', color: '#ec4899', label: 'User' },
      ai: { icon: '🤖', color: '#a855f7', label: 'AI Model' },
      gateway: { icon: '🚪', color: '#14b8a6', label: 'Gateway' },
      cache: { icon: '💨', color: '#f97316', label: 'Cache' },
      cdn: { icon: '🌐', color: '#0ea5e9', label: 'CDN' },
      container: { icon: '📦', color: '#6366f1', label: 'Container' },
      lambda: { icon: 'λ', color: '#fbbf24', label: 'Lambda' },
      loadbalancer: { icon: '⚖️', color: '#84cc16', label: 'Load Balancer' },
      firewall: { icon: '🔥', color: '#dc2626', label: 'Firewall' },
      dns: { icon: '📡', color: '#2dd4bf', label: 'DNS' },
      cloud: { icon: '☁️', color: '#60a5fa', label: 'Cloud' },
      web: { icon: '🌍', color: '#34d399', label: 'Web' }
    };
  }

  init() {
    if (!this.container) {
      console.error('DiagramBuilder: Container not found');
      return;
    }

    this.container.innerHTML = '';
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.backgroundColor = '#0f172a';
    this.container.style.border = '1px solid #334155';
    this.container.style.borderRadius = '8px';

    this.svgLayer = this.createSvgLayer();
    this.nodeLayer = document.createElement('div');
    this.nodeLayer.style.position = 'absolute';
    this.nodeLayer.style.top = '0';
    this.nodeLayer.style.left = '0';
    this.nodeLayer.style.width = '100%';
    this.nodeLayer.style.height = '100%';
    this.nodeLayer.style.pointerEvents = 'none';

    this.container.appendChild(this.svgLayer);
    this.container.appendChild(this.nodeLayer);

    this.toolbar = this.createToolbar();
    this.container.appendChild(this.toolbar);

    this.setupEventListeners();
    this.renderGrid();
  }

  createSvgLayer() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#64748b"/>
      </marker>
      <marker id="arrowhead-selected" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
      </marker>
    `;
    svg.appendChild(defs);
    
    this.connectionsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(this.connectionsGroup);
    
    this.gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.insertBefore(this.gridGroup, this.connectionsGroup);
    
    return svg;
  }

  createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.style.position = 'absolute';
    toolbar.style.top = '10px';
    toolbar.style.left = '10px';
    toolbar.style.display = 'flex';
    toolbar.style.gap = '4px';
    toolbar.style.zIndex = '100';
    toolbar.style.pointerEvents = 'auto';

    const buttons = [
      { icon: '🗑️', title: 'Clear', action: () => this.clear() },
      { icon: '📤', title: 'Export', action: () => this.export() },
      { icon: '📥', title: 'Import', action: () => this.import() },
      { icon: '🔍+', title: 'Zoom In', action: () => this.zoomIn() },
      { icon: '🔍-', title: 'Zoom Out', action: () => this.zoomOut() },
      { icon: '⬜', title: 'Fit', action: () => this.fitToView() },
      { icon: '📊', title: 'Mermaid', action: () => this.exportMermaid() }
    ];

    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.innerHTML = btn.icon;
      button.title = btn.title;
      button.style.cssText = `
        width: 32px; height: 32px; border: 1px solid #334155; border-radius: 4px;
        background: #1e293b; color: #e2e8f0; cursor: pointer; font-size: 14px;
      `;
      button.onmouseover = () => button.style.background = '#334155';
      button.onmouseout = () => button.style.background = '#1e293b';
      button.onclick = btn.action;
      toolbar.appendChild(button);
    });

    const palette = document.createElement('div');
    palette.style.cssText = `
      position: absolute; top: 50px; left: 10px; display: flex; flex-direction: column;
      gap: 4px; z-index: 100; pointer-events: auto; background: #1e293b;
      border: 1px solid #334155; border-radius: 4px; padding: 8px;
    `;

    Object.entries(this.nodeTypes).forEach(([type, config]) => {
      const item = document.createElement('div');
      item.innerHTML = `${config.icon} ${config.label}`;
      item.draggable = true;
      item.dataset.nodeType = type;
      item.style.cssText = `
        padding: 6px 10px; cursor: grab; border-radius: 4px; font-size: 12px;
        color: #e2e8f0; background: ${config.color}22; border: 1px solid ${config.color}44;
      `;
      item.ondragstart = (e) => {
        e.dataTransfer.setData('nodeType', type);
      };
      item.onmouseover = () => item.style.background = config.color + '44';
      item.onmouseout = () => item.style.background = config.color + '22';
      palette.appendChild(item);
    });

    this.container.appendChild(palette);
    return toolbar;
  }

  setupEventListeners() {
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    this.container.addEventListener('drop', (e) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('nodeType');
      if (nodeType) {
        const rect = this.container.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.pan.x) / this.zoom;
        const y = (e.clientY - rect.top - this.pan.y) / this.zoom;
        this.addNode(nodeType, x, y);
      }
    });

    this.container.addEventListener('mousedown', (e) => {
      if (e.target === this.container || e.target === this.svgLayer) {
        this.selectNode(null);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' && this.selectedNode) {
        this.removeNode(this.selectedNode.id);
      }
    });
  }

  renderGrid() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const size = this.options.gridSize * this.zoom;

    this.gridGroup.innerHTML = '';
    
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', 'grid');
    pattern.setAttribute('width', size);
    pattern.setAttribute('height', size);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', size / 2);
    dot.setAttribute('cy', size / 2);
    dot.setAttribute('r', '1');
    dot.setAttribute('fill', '#334155');
    pattern.appendChild(dot);

    const defs = this.svgLayer.querySelector('defs');
    defs.appendChild(pattern);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', 'url(#grid)');
    rect.setAttribute('transform', `translate(${this.pan.x}, ${this.pan.y})`);
    this.gridGroup.appendChild(rect);
  }

  addNode(type, x, y, data = {}) {
    const config = this.nodeTypes[type] || this.nodeTypes.service;
    const id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const snappedX = this.options.snapToGrid 
      ? Math.round(x / this.options.gridSize) * this.options.gridSize
      : x;
    const snappedY = this.options.snapToGrid 
      ? Math.round(y / this.options.gridSize) * this.options.gridSize
      : y;

    const node = {
      id,
      type,
      x: snappedX,
      y: snappedY,
      width: 120,
      height: 60,
      label: data.label || config.label,
      ...data
    };

    this.nodes.push(node);
    this.renderNode(node);
    this.options.onDiagramChange(this.getData());
    return node;
  }

  renderNode(node) {
    const config = this.nodeTypes[node.type] || this.nodeTypes.service;
    
    const el = document.createElement('div');
    el.id = node.id;
    el.className = 'diagram-node';
    el.style.cssText = `
      position: absolute; left: ${node.x}px; top: ${node.y}px;
      width: ${node.width}px; min-height: ${node.height}px;
      background: linear-gradient(135deg, ${config.color}22, ${config.color}11);
      border: 2px solid ${config.color}66; border-radius: 8px;
      padding: 8px; cursor: move; user-select: none;
      pointer-events: auto; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 4px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);
      transform: translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom});
      transform-origin: top left;
    `;

    const icon = document.createElement('span');
    icon.style.fontSize = '24px';
    icon.textContent = config.icon;
    el.appendChild(icon);

    const label = document.createElement('span');
    label.style.cssText = 'font-size: 11px; color: #e2e8f0; text-align: center; word-break: break-word;';
    label.textContent = node.label;
    el.appendChild(label);

    const connector = document.createElement('div');
    connector.style.cssText = `
      position: absolute; right: -8px; top: 50%; transform: translateY(-50%);
      width: 16px; height: 16px; background: ${config.color};
      border-radius: 50%; cursor: crosshair; border: 2px solid #0f172a;
    `;
    connector.dataset.nodeId = node.id;
    connector.dataset.type = 'output';
    el.appendChild(connector);

    const inputConnector = document.createElement('div');
    inputConnector.style.cssText = `
      position: absolute; left: -8px; top: 50%; transform: translateY(-50%);
      width: 16px; height: 16px; background: ${config.color};
      border-radius: 50%; cursor: crosshair; border: 2px solid #0f172a;
    `;
    inputConnector.dataset.nodeId = node.id;
    inputConnector.dataset.type = 'input';
    el.appendChild(inputConnector);

    this.setupNodeEvents(el, node);
    this.nodeLayer.appendChild(el);
  }

  setupNodeEvents(el, node) {
    let startX, startY, startNodeX, startNodeY;

    el.addEventListener('mousedown', (e) => {
      if (e.target.dataset.type === 'output') {
        this.connecting = { fromNode: node.id, fromEl: el };
        e.stopPropagation();
        return;
      }
      
      if (e.target.dataset.type === 'input' && this.connecting) {
        this.addConnection(this.connecting.fromNode, node.id);
        this.connecting = null;
        e.stopPropagation();
        return;
      }

      this.selectNode(node);
      this.dragging = node;
      startX = e.clientX;
      startY = e.clientY;
      startNodeX = node.x;
      startNodeY = node.y;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (this.dragging !== node) return;
      
      const dx = (e.clientX - startX) / this.zoom;
      const dy = (e.clientY - startY) / this.zoom;
      
      let newX = startNodeX + dx;
      let newY = startNodeY + dy;
      
      if (this.options.snapToGrid) {
        newX = Math.round(newX / this.options.gridSize) * this.options.gridSize;
        newY = Math.round(newY / this.options.gridSize) * this.options.gridSize;
      }
      
      node.x = newX;
      node.y = newY;
      el.style.left = `${newX}px`;
      el.style.top = `${newY}px`;
      this.renderConnections();
    });

    document.addEventListener('mouseup', () => {
      if (this.dragging === node) {
        this.dragging = null;
        this.options.onDiagramChange(this.getData());
      }
    });

    el.addEventListener('dblclick', () => {
      const newLabel = prompt('Enter label:', node.label);
      if (newLabel !== null) {
        node.label = newLabel;
        el.querySelector('span:last-of-type').textContent = newLabel;
        this.options.onDiagramChange(this.getData());
      }
    });
  }

  selectNode(node) {
    if (this.selectedNode) {
      const prevEl = document.getElementById(this.selectedNode.id);
      if (prevEl) prevEl.style.border = `2px solid ${this.nodeTypes[this.selectedNode.type]?.color || '#3b82f6'}66`;
    }
    
    this.selectedNode = node;
    
    if (node) {
      const el = document.getElementById(node.id);
      if (el) el.style.border = '2px solid #3b82f6';
      this.options.onNodeSelect(node);
    }
  }

  removeNode(nodeId) {
    const idx = this.nodes.findIndex(n => n.id === nodeId);
    if (idx !== -1) {
      this.nodes.splice(idx, 1);
      const el = document.getElementById(nodeId);
      if (el) el.remove();
      this.connections = this.connections.filter(c => c.from !== nodeId && c.to !== nodeId);
      this.renderConnections();
      this.options.onDiagramChange(this.getData());
    }
  }

  addConnection(fromId, toId, label = '') {
    if (fromId === toId) return;
    if (this.connections.some(c => c.from === fromId && c.to === toId)) return;
    
    this.connections.push({ from: fromId, to: toId, label });
    this.renderConnections();
    this.options.onDiagramChange(this.getData());
  }

  removeConnection(fromId, toId) {
    this.connections = this.connections.filter(c => !(c.from === fromId && c.to === toId));
    this.renderConnections();
    this.options.onDiagramChange(this.getData());
  }

  renderConnections() {
    this.connectionsGroup.innerHTML = '';
    
    this.connections.forEach(conn => {
      const fromNode = this.nodes.find(n => n.id === conn.from);
      const toNode = this.nodes.find(n => n.id === conn.to);
      if (!fromNode || !toNode) return;

      const x1 = (fromNode.x + fromNode.width) * this.zoom + this.pan.x;
      const y1 = (fromNode.y + fromNode.height / 2) * this.zoom + this.pan.y;
      const x2 = toNode.x * this.zoom + this.pan.x;
      const y2 = (toNode.y + toNode.height / 2) * this.zoom + this.pan.y;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const midX = (x1 + x2) / 2;
      path.setAttribute('d', `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
      path.setAttribute('stroke', '#64748b');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'none');
      path.setAttribute('marker-end', 'url(#arrowhead)');
      path.style.pointerEvents = 'stroke';
      path.style.cursor = 'pointer';
      
      path.addEventListener('click', () => {
        if (confirm('Remove this connection?')) {
          this.removeConnection(conn.from, conn.to);
        }
      });
      
      this.connectionsGroup.appendChild(path);
    });
  }

  zoomIn() {
    this.zoom = Math.min(2, this.zoom + 0.1);
    this.applyTransform();
  }

  zoomOut() {
    this.zoom = Math.max(0.5, this.zoom - 0.1);
    this.applyTransform();
  }

  applyTransform() {
    this.nodeLayer.querySelectorAll('.diagram-node').forEach(el => {
      el.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    });
    this.renderConnections();
    this.renderGrid();
  }

  fitToView() {
    if (this.nodes.length === 0) return;
    
    const bounds = this.nodes.reduce((acc, n) => ({
      minX: Math.min(acc.minX, n.x),
      minY: Math.min(acc.minY, n.y),
      maxX: Math.max(acc.maxX, n.x + n.width),
      maxY: Math.max(acc.maxY, n.y + n.height)
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

    const padding = 50;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const scaleX = (width - padding * 2) / (bounds.maxX - bounds.minX + 100);
    const scaleY = (height - padding * 2) / (bounds.maxY - bounds.minY + 100);
    
    this.zoom = Math.min(1, Math.min(scaleX, scaleY));
    this.pan.x = padding - bounds.minX * this.zoom + 50;
    this.pan.y = padding - bounds.minY * this.zoom + 50;
    
    this.applyTransform();
  }

  getData() {
    return {
      nodes: this.nodes.map(n => ({ ...n })),
      connections: this.connections.map(c => ({ ...c }))
    };
  }

  setData(data) {
    this.clear();
    data.nodes.forEach(n => this.addNode(n.type, n.x, n.y, n));
    data.connections.forEach(c => this.addConnection(c.from, c.to, c.label));
  }

  clear() {
    this.nodes = [];
    this.connections = [];
    this.nodeLayer.querySelectorAll('.diagram-node').forEach(el => el.remove());
    this.connectionsGroup.innerHTML = '';
    this.options.onDiagramChange(this.getData());
  }

  export() {
    const data = JSON.stringify(this.getData(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  import() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          this.setData(data);
        } catch (err) {
          alert('Invalid diagram file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  exportMermaid() {
    const nodeIds = {};
    this.nodes.forEach((n, i) => {
      nodeIds[n.id] = `N${i}`;
    });

    let mermaid = 'flowchart TD\n';
    
    this.nodes.forEach((n, i) => {
      const config = this.nodeTypes[n.type] || this.nodeTypes.service;
      mermaid += `    ${nodeIds[n.id]}["${config.icon} ${n.label}"]\n`;
    });
    
    this.connections.forEach(c => {
      mermaid += `    ${nodeIds[c.from]} --> ${nodeIds[c.to]}\n`;
    });

    return mermaid;
  }
}

window.DiagramBuilder = DiagramBuilder;
