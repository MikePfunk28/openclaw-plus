import { expertRouter, EXPERT_DOMAINS } from "./expert-router.mjs";

export class ExpertAdapter {
  constructor() {
    this.activeExperts = new Map();
  }

  setExpert(sessionId, domainId) {
    const expert = expertRouter.getExpert(domainId);
    if (!expert) {
      throw new Error(`Unknown expert domain: ${domainId}`);
    }
    this.activeExperts.set(sessionId, {
      domainId,
      expert,
      activatedAt: Date.now()
    });
    return expert;
  }

  getExpert(sessionId) {
    const entry = this.activeExperts.get(sessionId);
    if (entry) {
      return entry.expert;
    }
    return EXPERT_DOMAINS.general;
  }

  getExpertId(sessionId) {
    const entry = this.activeExperts.get(sessionId);
    return entry ? entry.domainId : "general";
  }

  detectAndSet(sessionId, query) {
    const domainId = expertRouter.detectDomain(query);
    return this.setExpert(sessionId, domainId);
  }

  buildSystemPrompt(sessionId, basePrompt = "") {
    const expert = this.getExpert(sessionId);
    if (basePrompt) {
      return `${expert.systemPrompt}\n\n${basePrompt}`;
    }
    return expert.systemPrompt;
  }

  getPreferredSkills(sessionId) {
    const expert = this.getExpert(sessionId);
    return expert.preferredSkills || [];
  }

  listExperts() {
    return expertRouter.getAllExperts();
  }
}

export const expertAdapter = new ExpertAdapter();
