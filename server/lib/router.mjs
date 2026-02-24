function normalizePeer(peer) {
  if (!peer || typeof peer !== "object") {
    return null;
  }
  if (!peer.kind || !peer.id) {
    return null;
  }
  return {
    kind: String(peer.kind),
    id: String(peer.id)
  };
}

function peerMatches(bindingPeer, requestPeer) {
  if (!bindingPeer) {
    return true;
  }
  if (!requestPeer) {
    return false;
  }
  return bindingPeer.kind === requestPeer.kind && bindingPeer.id === requestPeer.id;
}

function scoreBinding(binding, input) {
  const match = binding.match || {};
  if (!match.channel || match.channel !== input.channel) {
    return -1;
  }

  if (match.accountId && match.accountId !== "*" && match.accountId !== input.accountId) {
    return -1;
  }

  if (!peerMatches(normalizePeer(match.peer), input.peer)) {
    return -1;
  }

  let score = 0;
  if (match.peer) {
    score += 100;
  }
  if (match.accountId && match.accountId !== "*") {
    score += 50;
  }
  if (match.accountId === "*") {
    score += 10;
  }

  return score;
}

function computeRouteKey({ channel, accountId, peer, dmScope = "per-channel-peer" }) {
  const normalizedPeer = normalizePeer(peer);
  if (!normalizedPeer) {
    return `${channel}:${accountId}:main`;
  }

  if (normalizedPeer.kind !== "direct") {
    return `${channel}:${accountId}:${normalizedPeer.kind}:${normalizedPeer.id}`;
  }

  if (dmScope === "main") {
    return `${channel}:${accountId}:main`;
  }
  if (dmScope === "per-peer") {
    return `direct:${normalizedPeer.id}`;
  }
  return `${channel}:${accountId}:direct:${normalizedPeer.id}`;
}

export class Router {
  constructor(config) {
    const agents = Array.isArray(config?.agents?.list) ? config.agents.list : [];
    this.agents = agents;
    this.defaultAgent =
      agents.find((agent) => agent.default) || agents[0] || { id: "main", name: "Main" };
    this.bindings = Array.isArray(config?.bindings) ? config.bindings : [];
    this.dmScope = config?.session?.dmScope || "per-channel-peer";
  }

  resolve(input) {
    const resolvedInput = {
      channel: String(input?.channel || "api"),
      accountId: String(input?.accountId || "default"),
      peer: normalizePeer(input?.peer)
    };

    const scored = this.bindings
      .map((binding) => ({ binding, score: scoreBinding(binding, resolvedInput) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score);

    const selected = scored[0]?.binding;
    const agentId = selected?.agentId || this.defaultAgent.id;
    const agent = this.agents.find((candidate) => candidate.id === agentId) || this.defaultAgent;

    return {
      agentId: agent.id,
      agentName: agent.name || agent.id,
      routeKey: computeRouteKey({ ...resolvedInput, dmScope: this.dmScope }),
      source: resolvedInput,
      binding: selected || null
    };
  }
}
