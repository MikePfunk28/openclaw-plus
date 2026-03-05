import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// In-memory store (persisted to workspace/.pm/)
// ---------------------------------------------------------------------------

class PMStore {
  constructor() {
    this.projects = new Map();
    this.roadmaps = new Map();
    this.prds = new Map();
    this.stories = new Map();
    this.sprints = new Map();
    this.okrs = new Map();
    this.milestones = new Map();
    this.personas = new Map();
    this.releases = new Map();
    this.retros = new Map();
    this._dataDir = null;
    this._loaded = false;
  }

  async init(workspaceRoot) {
    this._dataDir = join(workspaceRoot, ".pm");
    await mkdir(this._dataDir, { recursive: true });
    await this._load();
    this._loaded = true;
  }

  async _load() {
    const collections = [
      "projects",
      "roadmaps",
      "prds",
      "stories",
      "sprints",
      "okrs",
      "milestones",
      "personas",
      "releases",
      "retros",
    ];
    for (const col of collections) {
      const file = join(this._dataDir, `${col}.json`);
      try {
        const raw = await readFile(file, "utf-8");
        const data = JSON.parse(raw);
        this[col] = new Map(Object.entries(data));
      } catch {
        this[col] = new Map();
      }
    }
  }

  async _save(collection) {
    if (!this._dataDir) return;
    const file = join(this._dataDir, `${collection}.json`);
    const data = Object.fromEntries(this[collection]);
    await writeFile(file, JSON.stringify(data, null, 2), "utf-8");
  }

  async set(collection, id, value) {
    this[collection].set(id, value);
    await this._save(collection);
    return value;
  }

  get(collection, id) {
    return this[collection].get(id) || null;
  }

  list(collection, filter = null) {
    const all = [...this[collection].values()];
    if (!filter) return all;
    return all.filter(filter);
  }

  async delete(collection, id) {
    const existed = this[collection].has(id);
    this[collection].delete(id);
    if (existed) await this._save(collection);
    return existed;
  }
}

const store = new PMStore();

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function now() {
  return new Date().toISOString();
}

function makeId(prefix = "item") {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function ensureInit(workspaceRoot) {
  if (!store._loaded) {
    return store.init(workspaceRoot);
  }
  return Promise.resolve();
}

// ---------------------------------------------------------------------------
// Skill definition
// ---------------------------------------------------------------------------

export const skill = {
  id: "pm_tools",
  name: "PM Tools",
  description:
    "Product Manager workspace: projects, roadmaps, PRDs, user stories, sprints, OKRs, milestones, personas, releases, retrospectives, and AI-assisted generation.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          // Projects
          "project:create",
          "project:get",
          "project:list",
          "project:update",
          "project:delete",
          "project:summary",
          // Roadmaps
          "roadmap:create",
          "roadmap:get",
          "roadmap:list",
          "roadmap:update",
          "roadmap:delete",
          "roadmap:add_item",
          "roadmap:update_item",
          "roadmap:remove_item",
          // PRDs
          "prd:create",
          "prd:get",
          "prd:list",
          "prd:update",
          "prd:delete",
          "prd:generate",
          "prd:add_section",
          // User Stories
          "story:create",
          "story:get",
          "story:list",
          "story:update",
          "story:delete",
          "story:generate",
          "story:bulk_create",
          "story:estimate",
          // Sprints
          "sprint:create",
          "sprint:get",
          "sprint:list",
          "sprint:update",
          "sprint:delete",
          "sprint:add_story",
          "sprint:remove_story",
          "sprint:start",
          "sprint:complete",
          "sprint:velocity",
          // OKRs
          "okr:create",
          "okr:get",
          "okr:list",
          "okr:update",
          "okr:delete",
          "okr:add_kr",
          "okr:update_kr",
          "okr:check_in",
          // Milestones
          "milestone:create",
          "milestone:get",
          "milestone:list",
          "milestone:update",
          "milestone:delete",
          "milestone:complete",
          // Personas
          "persona:create",
          "persona:get",
          "persona:list",
          "persona:update",
          "persona:delete",
          "persona:generate",
          // Releases
          "release:create",
          "release:get",
          "release:list",
          "release:update",
          "release:delete",
          "release:ship",
          "release:checklist",
          // Retros
          "retro:create",
          "retro:get",
          "retro:list",
          "retro:add_item",
          "retro:update",
          "retro:delete",
          // Analytics
          "analytics:burndown",
          "analytics:velocity",
          "analytics:kpis",
          // AI helpers
          "ai:generate_prd",
          "ai:breakdown_epic",
          "ai:write_acceptance_criteria",
          "ai:suggest_okrs",
          "ai:risk_analysis",
          "ai:roadmap_from_goals",
        ],
        description: "PM action to perform",
      },
      // Generic fields
      id: { type: "string", description: "Entity ID" },
      projectId: { type: "string", description: "Project ID" },
      data: { type: "object", description: "Entity data payload" },
      filter: { type: "object", description: "Filter criteria" },
      // AI prompt
      prompt: {
        type: "string",
        description: "Natural language input for AI-assisted generation",
      },
    },
    required: ["action"],
  },

  async run({ input, workspaceRoot }) {
    await ensureInit(workspaceRoot);

    const { action, id, projectId, data = {}, filter = {}, prompt } = input;

    try {
      switch (action) {
        // =================================================================
        // PROJECTS
        // =================================================================

        case "project:create": {
          const project = {
            id: makeId("proj"),
            name: data.name || "Untitled Project",
            description: data.description || "",
            status: data.status || "active", // active | paused | archived | completed
            owner: data.owner || null,
            team: data.team || [],
            tags: data.tags || [],
            startDate: data.startDate || now(),
            targetDate: data.targetDate || null,
            createdAt: now(),
            updatedAt: now(),
            metadata: data.metadata || {},
          };
          await store.set("projects", project.id, project);
          return { ok: true, project };
        }

        case "project:get": {
          const project = store.get("projects", id);
          if (!project) return { ok: false, error: `Project not found: ${id}` };
          // Enrich with related counts
          const roadmaps = store.list(
            "roadmaps",
            (r) => r.projectId === id,
          ).length;
          const prds = store.list("prds", (p) => p.projectId === id).length;
          const stories = store.list(
            "stories",
            (s) => s.projectId === id,
          ).length;
          const sprints = store.list(
            "sprints",
            (s) => s.projectId === id,
          ).length;
          const okrs = store.list("okrs", (o) => o.projectId === id).length;
          const milestones = store.list(
            "milestones",
            (m) => m.projectId === id,
          ).length;
          return {
            ok: true,
            project,
            counts: { roadmaps, prds, stories, sprints, okrs, milestones },
          };
        }

        case "project:list": {
          let projects = store.list("projects");
          if (filter.status)
            projects = projects.filter((p) => p.status === filter.status);
          if (filter.owner)
            projects = projects.filter((p) => p.owner === filter.owner);
          return { ok: true, projects, total: projects.length };
        }

        case "project:update": {
          const project = store.get("projects", id);
          if (!project) return { ok: false, error: `Project not found: ${id}` };
          const updated = { ...project, ...data, id, updatedAt: now() };
          await store.set("projects", id, updated);
          return { ok: true, project: updated };
        }

        case "project:delete": {
          const deleted = await store.delete("projects", id);
          return { ok: deleted, id };
        }

        case "project:summary": {
          const project = store.get("projects", id);
          if (!project) return { ok: false, error: `Project not found: ${id}` };

          const roadmaps = store.list("roadmaps", (r) => r.projectId === id);
          const prds = store.list("prds", (p) => p.projectId === id);
          const stories = store.list("stories", (s) => s.projectId === id);
          const sprints = store.list("sprints", (s) => s.projectId === id);
          const okrs = store.list("okrs", (o) => o.projectId === id);
          const milestones = store.list(
            "milestones",
            (m) => m.projectId === id,
          );

          const storyStats = {
            total: stories.length,
            byStatus: _groupBy(stories, "status"),
            totalPoints: stories.reduce((sum, s) => sum + (s.points || 0), 0),
          };

          const activeSprint = sprints.find((s) => s.status === "active");
          const completedMilestones = milestones.filter(
            (m) => m.status === "completed",
          ).length;

          return {
            ok: true,
            summary: {
              project,
              roadmapCount: roadmaps.length,
              prdCount: prds.length,
              storyStats,
              sprintCount: sprints.length,
              activeSprint: activeSprint || null,
              okrCount: okrs.length,
              milestones: {
                total: milestones.length,
                completed: completedMilestones,
                pct: milestones.length
                  ? Math.round((completedMilestones / milestones.length) * 100)
                  : 0,
              },
            },
          };
        }

        // =================================================================
        // ROADMAPS
        // =================================================================

        case "roadmap:create": {
          const roadmap = {
            id: makeId("rm"),
            projectId: projectId || data.projectId || null,
            title: data.title || "Product Roadmap",
            description: data.description || "",
            horizon: data.horizon || "quarterly", // weekly | monthly | quarterly | yearly
            status: data.status || "draft",
            items: [],
            createdAt: now(),
            updatedAt: now(),
          };
          await store.set("roadmaps", roadmap.id, roadmap);
          return { ok: true, roadmap };
        }

        case "roadmap:get": {
          const roadmap = store.get("roadmaps", id);
          if (!roadmap) return { ok: false, error: `Roadmap not found: ${id}` };
          return { ok: true, roadmap };
        }

        case "roadmap:list": {
          let roadmaps = store.list("roadmaps");
          if (projectId)
            roadmaps = roadmaps.filter((r) => r.projectId === projectId);
          return { ok: true, roadmaps };
        }

        case "roadmap:update": {
          const roadmap = store.get("roadmaps", id);
          if (!roadmap) return { ok: false, error: `Roadmap not found: ${id}` };
          const updated = {
            ...roadmap,
            ...data,
            id,
            items: roadmap.items,
            updatedAt: now(),
          };
          await store.set("roadmaps", id, updated);
          return { ok: true, roadmap: updated };
        }

        case "roadmap:delete": {
          return { ok: await store.delete("roadmaps", id), id };
        }

        case "roadmap:add_item": {
          const roadmap = store.get("roadmaps", id);
          if (!roadmap) return { ok: false, error: `Roadmap not found: ${id}` };
          const item = {
            id: makeId("rmi"),
            title: data.title || "Roadmap Item",
            description: data.description || "",
            theme: data.theme || null,
            priority: data.priority || "medium", // critical | high | medium | low
            status: data.status || "planned", // planned | in_progress | completed | cut
            quarter: data.quarter || null,
            startDate: data.startDate || null,
            endDate: data.endDate || null,
            owner: data.owner || null,
            storyIds: data.storyIds || [],
            tags: data.tags || [],
            confidence: data.confidence || "medium", // high | medium | low
            effort: data.effort || null,
            impact: data.impact || null,
            createdAt: now(),
          };
          roadmap.items.push(item);
          roadmap.updatedAt = now();
          await store.set("roadmaps", id, roadmap);
          return { ok: true, item, roadmapId: id };
        }

        case "roadmap:update_item": {
          const roadmap = store.get("roadmaps", id);
          if (!roadmap) return { ok: false, error: `Roadmap not found: ${id}` };
          const itemIdx = roadmap.items.findIndex((i) => i.id === data.itemId);
          if (itemIdx === -1)
            return { ok: false, error: `Item not found: ${data.itemId}` };
          roadmap.items[itemIdx] = {
            ...roadmap.items[itemIdx],
            ...data,
            id: data.itemId,
            updatedAt: now(),
          };
          roadmap.updatedAt = now();
          await store.set("roadmaps", id, roadmap);
          return { ok: true, item: roadmap.items[itemIdx] };
        }

        case "roadmap:remove_item": {
          const roadmap = store.get("roadmaps", id);
          if (!roadmap) return { ok: false, error: `Roadmap not found: ${id}` };
          roadmap.items = roadmap.items.filter((i) => i.id !== data.itemId);
          roadmap.updatedAt = now();
          await store.set("roadmaps", id, roadmap);
          return { ok: true, roadmapId: id, removedItemId: data.itemId };
        }

        // =================================================================
        // PRDs
        // =================================================================

        case "prd:create": {
          const prd = {
            id: makeId("prd"),
            projectId: projectId || data.projectId || null,
            title: data.title || "Product Requirements Document",
            status: data.status || "draft", // draft | review | approved | deprecated
            version: data.version || "1.0",
            authors: data.authors || [],
            reviewers: data.reviewers || [],
            approvers: data.approvers || [],
            overview: data.overview || "",
            problem: data.problem || "",
            goals: data.goals || [],
            nonGoals: data.nonGoals || [],
            userPersonas: data.userPersonas || [],
            requirements: data.requirements || [],
            successMetrics: data.successMetrics || [],
            outOfScope: data.outOfScope || [],
            assumptions: data.assumptions || [],
            risks: data.risks || [],
            dependencies: data.dependencies || [],
            timeline: data.timeline || null,
            sections: data.sections || [],
            createdAt: now(),
            updatedAt: now(),
          };
          await store.set("prds", prd.id, prd);
          return { ok: true, prd };
        }

        case "prd:get": {
          const prd = store.get("prds", id);
          if (!prd) return { ok: false, error: `PRD not found: ${id}` };
          return { ok: true, prd };
        }

        case "prd:list": {
          let prds = store.list("prds");
          if (projectId) prds = prds.filter((p) => p.projectId === projectId);
          if (filter.status)
            prds = prds.filter((p) => p.status === filter.status);
          return { ok: true, prds, total: prds.length };
        }

        case "prd:update": {
          const prd = store.get("prds", id);
          if (!prd) return { ok: false, error: `PRD not found: ${id}` };
          const updated = { ...prd, ...data, id, updatedAt: now() };
          await store.set("prds", id, updated);
          return { ok: true, prd: updated };
        }

        case "prd:delete": {
          return { ok: await store.delete("prds", id), id };
        }

        case "prd:generate": {
          // Generate a PRD template from a product description
          const desc = prompt || data.description || "A new product feature";
          const title = data.title || desc.slice(0, 60);
          const prd = {
            id: makeId("prd"),
            projectId: projectId || data.projectId || null,
            title,
            status: "draft",
            version: "0.1",
            authors: [],
            overview: `## Overview\n\n${desc}`,
            problem: `## Problem Statement\n\n[Describe the problem this feature solves and the user pain points]`,
            goals: [
              "Increase user engagement by X%",
              "Reduce time-to-complete-task by Y%",
              "Enable [key use case]",
            ],
            nonGoals: [
              "This version will NOT support [out-of-scope feature]",
              "We are NOT redesigning the entire [component]",
            ],
            userPersonas: [],
            requirements: _generateRequirementsTemplate(desc),
            successMetrics: [
              { metric: "Daily Active Users", target: "TBD", baseline: "TBD" },
              {
                metric: "Task Completion Rate",
                target: ">80%",
                baseline: "TBD",
              },
              {
                metric: "User Satisfaction (CSAT)",
                target: ">4.0/5.0",
                baseline: "TBD",
              },
            ],
            risks: [
              {
                risk: "Technical complexity",
                severity: "medium",
                mitigation: "Spike in Sprint 1",
              },
              {
                risk: "User adoption",
                severity: "low",
                mitigation: "Beta testing with target segment",
              },
            ],
            assumptions: [
              "Users have [prerequisite capability]",
              "Backend API is available by [date]",
            ],
            dependencies: [],
            timeline: {
              discovery: "Week 1-2",
              design: "Week 2-3",
              development: "Week 3-6",
              qa: "Week 6-7",
              launch: "Week 8",
            },
            sections: [],
            createdAt: now(),
            updatedAt: now(),
          };
          await store.set("prds", prd.id, prd);
          return { ok: true, prd, generated: true };
        }

        case "prd:add_section": {
          const prd = store.get("prds", id);
          if (!prd) return { ok: false, error: `PRD not found: ${id}` };
          const section = {
            id: makeId("sec"),
            title: data.title || "New Section",
            content: data.content || "",
            order: data.order || prd.sections.length,
            createdAt: now(),
          };
          prd.sections.push(section);
          prd.updatedAt = now();
          await store.set("prds", id, prd);
          return { ok: true, section, prdId: id };
        }

        // =================================================================
        // USER STORIES
        // =================================================================

        case "story:create": {
          const story = {
            id: makeId("story"),
            projectId: projectId || data.projectId || null,
            sprintId: data.sprintId || null,
            epicId: data.epicId || null,
            title: data.title || "User Story",
            description: data.description || "",
            // Classic format
            asA: data.asA || "",
            iWant: data.iWant || "",
            soThat: data.soThat || "",
            // Story details
            acceptanceCriteria: data.acceptanceCriteria || [],
            points: data.points || null,
            priority: data.priority || "medium",
            status: data.status || "backlog", // backlog | ready | in_progress | review | done | rejected
            type: data.type || "feature", // feature | bug | chore | spike | tech_debt
            labels: data.labels || [],
            assignee: data.assignee || null,
            reporter: data.reporter || null,
            linkedPrdId: data.linkedPrdId || null,
            dependencies: data.dependencies || [],
            notes: data.notes || "",
            createdAt: now(),
            updatedAt: now(),
          };
          await store.set("stories", story.id, story);
          return { ok: true, story };
        }

        case "story:get": {
          const story = store.get("stories", id);
          if (!story) return { ok: false, error: `Story not found: ${id}` };
          return { ok: true, story };
        }

        case "story:list": {
          let stories = store.list("stories");
          if (projectId)
            stories = stories.filter((s) => s.projectId === projectId);
          if (filter.sprintId)
            stories = stories.filter((s) => s.sprintId === filter.sprintId);
          if (filter.epicId)
            stories = stories.filter((s) => s.epicId === filter.epicId);
          if (filter.status)
            stories = stories.filter((s) => s.status === filter.status);
          if (filter.assignee)
            stories = stories.filter((s) => s.assignee === filter.assignee);
          if (filter.type)
            stories = stories.filter((s) => s.type === filter.type);
          return { ok: true, stories, total: stories.length };
        }

        case "story:update": {
          const story = store.get("stories", id);
          if (!story) return { ok: false, error: `Story not found: ${id}` };
          const updated = { ...story, ...data, id, updatedAt: now() };
          await store.set("stories", id, updated);
          return { ok: true, story: updated };
        }

        case "story:delete": {
          return { ok: await store.delete("stories", id), id };
        }

        case "story:generate": {
          // Generate user stories from a feature description
          const featureDesc = prompt || data.feature || "A new feature";
          const count = data.count || 5;
          const stories = _generateStoriesFromFeature(
            featureDesc,
            count,
            projectId,
          );
          const created = [];
          for (const s of stories) {
            await store.set("stories", s.id, s);
            created.push(s);
          }
          return { ok: true, stories: created, generated: true };
        }

        case "story:bulk_create": {
          const items = data.stories || [];
          const created = [];
          for (const item of items) {
            const story = {
              id: makeId("story"),
              projectId: projectId || item.projectId || null,
              sprintId: item.sprintId || null,
              epicId: item.epicId || null,
              title: item.title || "Story",
              description: item.description || "",
              asA: item.asA || "",
              iWant: item.iWant || "",
              soThat: item.soThat || "",
              acceptanceCriteria: item.acceptanceCriteria || [],
              points: item.points || null,
              priority: item.priority || "medium",
              status: item.status || "backlog",
              type: item.type || "feature",
              labels: item.labels || [],
              assignee: item.assignee || null,
              reporter: item.reporter || null,
              linkedPrdId: item.linkedPrdId || null,
              dependencies: item.dependencies || [],
              notes: item.notes || "",
              createdAt: now(),
              updatedAt: now(),
            };
            await store.set("stories", story.id, story);
            created.push(story);
          }
          return { ok: true, stories: created, count: created.length };
        }

        case "story:estimate": {
          // T-shirt sizing or Fibonacci estimation helpers
          const stories = store.list(
            "stories",
            (s) =>
              s.projectId === projectId && s.status === "backlog" && !s.points,
          );
          return {
            ok: true,
            unestimated: stories.length,
            stories: stories.map((s) => ({
              id: s.id,
              title: s.title,
              type: s.type,
              suggestedPoints: _suggestPoints(s),
            })),
          };
        }

        // =================================================================
        // SPRINTS
        // =================================================================

        case "sprint:create": {
          const sprint = {
            id: makeId("spr"),
            projectId: projectId || data.projectId || null,
            name: data.name || `Sprint ${Date.now()}`,
            goal: data.goal || "",
            status: "planned", // planned | active | completed
            startDate: data.startDate || null,
            endDate: data.endDate || null,
            capacity: data.capacity || null, // story points
            storyIds: [],
            createdAt: now(),
            updatedAt: now(),
          };
          await store.set("sprints", sprint.id, sprint);
          return { ok: true, sprint };
        }

        case "sprint:get": {
          const sprint = store.get("sprints", id);
          if (!sprint) return { ok: false, error: `Sprint not found: ${id}` };
          const stories = store.list("stories", (s) => s.sprintId === id);
          const totalPoints = stories.reduce(
            (sum, s) => sum + (s.points || 0),
            0,
          );
          const donePoints = stories
            .filter((s) => s.status === "done")
            .reduce((sum, s) => sum + (s.points || 0), 0);
          return {
            ok: true,
            sprint,
            stories,
            stats: {
              totalStories: stories.length,
              totalPoints,
              donePoints,
              remainingPoints: totalPoints - donePoints,
              completionPct: totalPoints
                ? Math.round((donePoints / totalPoints) * 100)
                : 0,
              byStatus: _groupBy(stories, "status"),
            },
          };
        }

        case "sprint:list": {
          let sprints = store.list("sprints");
          if (projectId)
            sprints = sprints.filter((s) => s.projectId === projectId);
          if (filter.status)
            sprints = sprints.filter((s) => s.status === filter.status);
          return { ok: true, sprints, total: sprints.length };
        }

        case "sprint:update": {
          const sprint = store.get("sprints", id);
          if (!sprint) return { ok: false, error: `Sprint not found: ${id}` };
          const updated = {
            ...sprint,
            ...data,
            id,
            storyIds: sprint.storyIds,
            updatedAt: now(),
          };
          await store.set("sprints", id, updated);
          return { ok: true, sprint: updated };
        }

        case "sprint:delete": {
          return { ok: await store.delete("sprints", id), id };
        }

        case "sprint:add_story": {
          const sprint = store.get("sprints", id);
          if (!sprint) return { ok: false, error: `Sprint not found: ${id}` };
          const story = store.get("stories", data.storyId);
          if (!story)
            return { ok: false, error: `Story not found: ${data.storyId}` };
          if (!sprint.storyIds.includes(data.storyId)) {
            sprint.storyIds.push(data.storyId);
            sprint.updatedAt = now();
            await store.set("sprints", id, sprint);
          }
          // Update story sprintId
          story.sprintId = id;
          story.updatedAt = now();
          await store.set("stories", data.storyId, story);
          return { ok: true, sprintId: id, storyId: data.storyId };
        }

        case "sprint:remove_story": {
          const sprint = store.get("sprints", id);
          if (!sprint) return { ok: false, error: `Sprint not found: ${id}` };
          sprint.storyIds = sprint.storyIds.filter(
            (sid) => sid !== data.storyId,
          );
          sprint.updatedAt = now();
          await store.set("sprints", id, sprint);
          const story = store.get("stories", data.storyId);
          if (story) {
            story.sprintId = null;
            story.updatedAt = now();
            await store.set("stories", data.storyId, story);
          }
          return { ok: true, sprintId: id, storyId: data.storyId };
        }

        case "sprint:start": {
          const sprint = store.get("sprints", id);
          if (!sprint) return { ok: false, error: `Sprint not found: ${id}` };
          // Ensure no other active sprint for same project
          const activeSprintExists =
            store.list(
              "sprints",
              (s) =>
                s.projectId === sprint.projectId &&
                s.status === "active" &&
                s.id !== id,
            ).length > 0;
          if (activeSprintExists) {
            return {
              ok: false,
              error: "Another sprint is already active for this project",
            };
          }
          sprint.status = "active";
          sprint.startDate = sprint.startDate || now();
          sprint.updatedAt = now();
          await store.set("sprints", id, sprint);
          // Move planned stories to in_progress
          for (const sid of sprint.storyIds) {
            const story = store.get("stories", sid);
            if (story && story.status === "ready") {
              story.status = "in_progress";
              story.updatedAt = now();
              await store.set("stories", sid, story);
            }
          }
          return { ok: true, sprint };
        }

        case "sprint:complete": {
          const sprint = store.get("sprints", id);
          if (!sprint) return { ok: false, error: `Sprint not found: ${id}` };
          sprint.status = "completed";
          sprint.endDate = sprint.endDate || now();
          sprint.updatedAt = now();
          await store.set("sprints", id, sprint);
          const stories = store.list("stories", (s) => s.sprintId === id);
          const doneStories = stories.filter((s) => s.status === "done");
          const velocity = doneStories.reduce(
            (sum, s) => sum + (s.points || 0),
            0,
          );
          return {
            ok: true,
            sprint,
            velocity,
            completedStories: doneStories.length,
            incompleteStories: stories.length - doneStories.length,
          };
        }

        case "sprint:velocity": {
          const sprints = store.list(
            "sprints",
            (s) => s.projectId === projectId && s.status === "completed",
          );
          const velocities = sprints.map((s) => {
            const stories = store.list(
              "stories",
              (st) => st.sprintId === s.id && st.status === "done",
            );
            return {
              sprintId: s.id,
              name: s.name,
              velocity: stories.reduce((sum, st) => sum + (st.points || 0), 0),
            };
          });
          const avg = velocities.length
            ? Math.round(
                velocities.reduce((sum, v) => sum + v.velocity, 0) /
                  velocities.length,
              )
            : 0;
          return { ok: true, velocities, averageVelocity: avg };
        }

        // =================================================================
        // OKRs
        // =================================================================

        case "okr:create": {
          const okr = {
            id: makeId("okr"),
            projectId: projectId || data.projectId || null,
            title: data.title || "Objective",
            description: data.description || "",
            type: data.type || "company", // company | team | individual
            quarter: data.quarter || null,
            year: data.year || new Date().getFullYear(),
            owner: data.owner || null,
            status: data.status || "on_track", // on_track | at_risk | off_track | completed
            progress: 0,
            keyResults: [],
            createdAt: now(),
            updatedAt: now(),
          };
          await store.set("okrs", okr.id, okr);
          return { ok: true, okr };
        }

        case "okr:get": {
          const okr = store.get("okrs", id);
          if (!okr) return { ok: false, error: `OKR not found: ${id}` };
          return { ok: true, okr };
        }

        case "okr:list": {
          let okrs = store.list("okrs");
          if (projectId) okrs = okrs.filter((o) => o.projectId === projectId);
          if (filter.quarter)
            okrs = okrs.filter((o) => o.quarter === filter.quarter);
          if (filter.year) okrs = okrs.filter((o) => o.year === filter.year);
          return { ok: true, okrs, total: okrs.length };
        }

        case "okr:update": {
          const okr = store.get("okrs", id);
          if (!okr) return { ok: false, error: `OKR not found: ${id}` };
          const updated = {
            ...okr,
            ...data,
            id,
            keyResults: okr.keyResults,
            updatedAt: now(),
          };
          await store.set("okrs", id, updated);
          return { ok: true, okr: updated };
        }

        case "okr:delete": {
          return { ok: await store.delete("okrs", id), id };
        }

        case "okr:add_kr": {
          const okr = store.get("okrs", id);
          if (!okr) return { ok: false, error: `OKR not found: ${id}` };
          const kr = {
            id: makeId("kr"),
            title: data.title || "Key Result",
            description: data.description || "",
            metric: data.metric || null,
            baseline: data.baseline ?? 0,
            target: data.target ?? 100,
            current: data.current ?? data.baseline ?? 0,
            unit: data.unit || "%",
            progress: 0,
            status: "on_track",
            owner: data.owner || null,
            dueDate: data.dueDate || null,
            checkIns: [],
            createdAt: now(),
          };
          kr.progress =
            kr.target !== kr.baseline
              ? Math.round(
                  ((kr.current - kr.baseline) / (kr.target - kr.baseline)) *
                    100,
                )
              : 0;
          okr.keyResults.push(kr);
          okr.progress = Math.round(
            okr.keyResults.reduce((sum, k) => sum + k.progress, 0) /
              okr.keyResults.length,
          );
          okr.updatedAt = now();
          await store.set("okrs", id, okr);
          return { ok: true, kr, okrId: id };
        }

        case "okr:update_kr": {
          const okr = store.get("okrs", id);
          if (!okr) return { ok: false, error: `OKR not found: ${id}` };
          const krIdx = okr.keyResults.findIndex((k) => k.id === data.krId);
          if (krIdx === -1)
            return { ok: false, error: `Key Result not found: ${data.krId}` };
          const kr = {
            ...okr.keyResults[krIdx],
            ...data,
            id: data.krId,
            updatedAt: now(),
          };
          kr.progress =
            kr.target !== kr.baseline
              ? Math.round(
                  ((kr.current - kr.baseline) / (kr.target - kr.baseline)) *
                    100,
                )
              : 0;
          okr.keyResults[krIdx] = kr;
          okr.progress = Math.round(
            okr.keyResults.reduce((sum, k) => sum + k.progress, 0) /
              okr.keyResults.length,
          );
          okr.updatedAt = now();
          await store.set("okrs", id, okr);
          return { ok: true, kr, okrId: id };
        }

        case "okr:check_in": {
          const okr = store.get("okrs", id);
          if (!okr) return { ok: false, error: `OKR not found: ${id}` };
          const krIdx = okr.keyResults.findIndex((k) => k.id === data.krId);
          if (krIdx === -1)
            return { ok: false, error: `Key Result not found: ${data.krId}` };
          const kr = okr.keyResults[krIdx];
          const checkIn = {
            id: makeId("ci"),
            value: data.value,
            note: data.note || "",
            confidence: data.confidence || "medium",
            timestamp: now(),
          };
          kr.checkIns = kr.checkIns || [];
          kr.checkIns.push(checkIn);
          kr.current = data.value;
          kr.progress =
            kr.target !== kr.baseline
              ? Math.round(
                  ((kr.current - kr.baseline) / (kr.target - kr.baseline)) *
                    100,
                )
              : 0;
          okr.keyResults[krIdx] = kr;
          okr.progress = Math.round(
            okr.keyResults.reduce((sum, k) => sum + k.progress, 0) /
              okr.keyResults.length,
          );
          okr.updatedAt = now();
          await store.set("okrs", id, okr);
          return { ok: true, checkIn, kr, okrId: id };
        }

        // =================================================================
        // MILESTONES
        // =================================================================

        case "milestone:create": {
          const milestone = {
            id: makeId("ms"),
            projectId: projectId || data.projectId || null,
            title: data.title || "Milestone",
            description: data.description || "",
            status: data.status || "upcoming", // upcoming | in_progress | completed | at_risk | missed
            dueDate: data.dueDate || null,
            completedAt: null,
            owner: data.owner || null,
            storyIds: data.storyIds || [],
            criteria: data.criteria || [],
            tags: data.tags || [],
            priority: data.priority || "medium",
            createdAt: now(),
            updatedAt: now(),
          };
          await store.set("milestones", milestone.id, milestone);
          return { ok: true, milestone };
        }

        case "milestone:get": {
          const milestone = store.get("milestones", id);
          if (!milestone)
            return { ok: false, error: `Milestone not found: ${id}` };
          const stories = store.list("stories", (s) =>
            milestone.storyIds.includes(s.id),
          );
          const doneStories = stories.filter((s) => s.status === "done");
          return {
            ok: true,
            milestone,
            progress: stories.length
              ? Math.round((doneStories.length / stories.length) * 100)
              : 0,
            storyStats: {
              total: stories.length,
              done: doneStories.length,
              byStatus: _groupBy(stories, "status"),
            },
          };
        }

        case "milestone:list": {
          let milestones = store.list("milestones");
          if (projectId)
            milestones = milestones.filter((m) => m.projectId === projectId);
          if (filter.status)
            milestones = milestones.filter((m) => m.status === filter.status);
          return { ok: true, milestones, total: milestones.length };
        }

        case "milestone:update": {
          const milestone = store.get("milestones", id);
          if (!milestone)
            return { ok: false, error: `Milestone not found: ${id}` };
          const updated = { ...milestone, ...data, id, updatedAt: now() };
          await store.set("milestones", id, updated);
          return { ok: true, milestone: updated };
        }

        case "milestone:delete": {
          return { ok: await store.delete("milestones", id), id };
        }

        case "milestone:complete": {
          const milestone = store.get("milestones", id);
          if (!milestone)
            return { ok: false, error: `Milestone not found: ${id}` };
          milestone.status = "completed";
          milestone.completedAt = now();
          milestone.updatedAt = now();
          await store.set("milestones", id, milestone);
          return { ok: true, milestone };
        }

        // =================================================================
        // PERSONAS
        // =================================================================

        case "persona:create": {
          const persona = {
            id: makeId("per"),
            projectId: projectId || data.projectId || null,
            name: data.name || "User Persona",
            role: data.role || "",
            age: data.age || null,
            bio: data.bio || "",
            goals: data.goals || [],
            painPoints: data.painPoints || [],
            behaviors: data.behaviors || [],
            techSavviness: data.techSavviness || "medium",
            quote: data.quote || "",
            channels: data.channels || [],
            tags: data.tags || [],
            createdAt: now(),
            updatedAt: now(),
          };
          await store.set("personas", persona.id, persona);
          return { ok: true, persona };
        }

        case "persona:get": {
          const persona = store.get("personas", id);
          if (!persona) return { ok: false, error: `Persona not found: ${id}` };
          return { ok: true, persona };
        }

        case "persona:list": {
          let personas = store.list("personas");
          if (projectId)
            personas = personas.filter((p) => p.projectId === projectId);
          return { ok: true, personas, total: personas.length };
        }

        case "persona:update": {
          const persona = store.get("personas", id);
          if (!persona) return { ok: false, error: `Persona not found: ${id}` };
          const updated = { ...persona, ...data, id, updatedAt: now() };
          await store.set("personas", id, updated);
          return { ok: true, persona: updated };
        }

        case "persona:delete": {
          return { ok: await store.delete("personas", id), id };
        }

        case "persona:generate": {
          const desc = prompt || data.description || "A typical user";
          const generated = [
            {
              id: makeId("per"),
              projectId: projectId || null,
              name: "Alex Chen",
              role: "Power User",
              age: 32,
              bio: `A tech-savvy professional who ${desc}`,
              goals: [
                "Complete tasks quickly",
                "Stay organized",
                "Collaborate with team",
              ],
              painPoints: [
                "Too many clicks to complete simple tasks",
                "Lack of offline support",
                "Slow load times",
              ],
              behaviors: [
                "Uses keyboard shortcuts",
                "Checks app 5+ times daily",
                "Shares features with colleagues",
              ],
              techSavviness: "high",
              quote:
                "I need tools that get out of my way and let me focus on my work.",
              channels: ["email", "slack", "mobile"],
              tags: ["power-user", "b2b"],
              createdAt: now(),
              updatedAt: now(),
            },
            {
              id: makeId("per"),
              projectId: projectId || null,
              name: "Sam Rivera",
              role: "Occasional User",
              age: 45,
              bio: `An occasional user who ${desc}`,
              goals: [
                "Get tasks done without frustration",
                "Avoid learning complex tools",
              ],
              painPoints: [
                "Confusing interface",
                "Too many features",
                "Hard to find help",
              ],
              behaviors: [
                "Uses app weekly",
                "Prefers guided flows",
                "Relies on search",
              ],
              techSavviness: "low",
              quote:
                "Just make it simple — I don't have time to figure this out.",
              channels: ["email", "phone"],
              tags: ["casual-user", "b2c"],
              createdAt: now(),
              updatedAt: now(),
            },
          ];
          for (const p of generated) {
            await store.set("personas", p.id, p);
          }
          return { ok: true, personas: generated, generated: true };
        }

        // =================================================================
        // RELEASES
        // =================================================================

        case "release:create": {
          const release = {
            id: makeId("rel"),
            projectId: projectId || data.projectId || null,
            name: data.name || "v1.0.0",
            version: data.version || "1.0.0",
            description: data.description || "",
            status: data.status || "planned", // planned | in_progress | rc | shipped | deprecated
            targetDate: data.targetDate || null,
            shippedAt: null,
            owner: data.owner || null,
            storyIds: data.storyIds || [],
            checklist: data.checklist || _defaultReleaseChecklist(),
            notes: data.notes || "",
            changelog: data.changelog || "",
            tags: data.tags || [],
            createdAt: now(),
            updatedAt: now(),
          };
          await store.set("releases", release.id, release);
          return { ok: true, release };
        }

        case "release:get": {
          const release = store.get("releases", id);
          if (!release) return { ok: false, error: `Release not found: ${id}` };
          const stories = store.list("stories", (s) =>
            release.storyIds.includes(s.id),
          );
          const checklistDone = release.checklist.filter((c) => c.done).length;
          return {
            ok: true,
            release,
            stories,
            readiness: release.checklist.length
              ? Math.round((checklistDone / release.checklist.length) * 100)
              : 0,
          };
        }

        case "release:list": {
          let releases = store.list("releases");
          if (projectId)
            releases = releases.filter((r) => r.projectId === projectId);
          if (filter.status)
            releases = releases.filter((r) => r.status === filter.status);
          return { ok: true, releases, total: releases.length };
        }

        case "release:update": {
          const release = store.get("releases", id);
          if (!release) return { ok: false, error: `Release not found: ${id}` };
          const updated = {
            ...release,
            ...data,
            id,
            checklist: release.checklist,
            updatedAt: now(),
          };
          await store.set("releases", id, updated);
          return { ok: true, release: updated };
        }

        case "release:delete": {
          return { ok: await store.delete("releases", id), id };
        }

        case "release:ship": {
          const release = store.get("releases", id);
          if (!release) return { ok: false, error: `Release not found: ${id}` };
          const incomplete = release.checklist.filter(
            (c) => c.required && !c.done,
          );
          if (incomplete.length > 0 && !data.force) {
            return {
              ok: false,
              error: "Release has incomplete required checklist items",
              incomplete,
            };
          }
          release.status = "shipped";
          release.shippedAt = now();
          release.updatedAt = now();
          await store.set("releases", id, release);
          return { ok: true, release };
        }

        case "release:checklist": {
          const release = store.get("releases", id);
          if (!release) return { ok: false, error: `Release not found: ${id}` };
          if (data.itemId !== undefined) {
            // Update a checklist item
            const itemIdx = release.checklist.findIndex(
              (c) => c.id === data.itemId,
            );
            if (itemIdx !== -1) {
              release.checklist[itemIdx] = {
                ...release.checklist[itemIdx],
                ...data,
                id: data.itemId,
              };
              release.updatedAt = now();
              await store.set("releases", id, release);
            }
          }
          const done = release.checklist.filter((c) => c.done).length;
          return {
            ok: true,
            checklist: release.checklist,
            progress: {
              done,
              total: release.checklist.length,
              pct: release.checklist.length
                ? Math.round((done / release.checklist.length) * 100)
                : 0,
            },
          };
        }

        // =================================================================
        // RETROS
        // =================================================================

        case "retro:create": {
          const retro = {
            id: makeId("retro"),
            projectId: projectId || data.projectId || null,
            sprintId: data.sprintId || null,
            title: data.title || "Sprint Retrospective",
            format: data.format || "start_stop_continue", // start_stop_continue | 4ls | mad_sad_glad | custom
            status: data.status || "open",
            items: [],
            actionItems: [],
            facilitator: data.facilitator || null,
            attendees: data.attendees || [],
            createdAt: now(),
            updatedAt: now(),
          };
          await store.set("retros", retro.id, retro);
          return { ok: true, retro };
        }

        case "retro:get": {
          const retro = store.get("retros", id);
          if (!retro) return { ok: false, error: `Retro not found: ${id}` };
          return { ok: true, retro };
        }

        case "retro:list": {
          let retros = store.list("retros");
          if (projectId)
            retros = retros.filter((r) => r.projectId === projectId);
          return { ok: true, retros, total: retros.length };
        }

        case "retro:add_item": {
          const retro = store.get("retros", id);
          if (!retro) return { ok: false, error: `Retro not found: ${id}` };
          const item = {
            id: makeId("ri"),
            category: data.category || "general", // start | stop | continue | action | positive | negative | custom
            content: data.content || "",
            author: data.author || "anonymous",
            votes: 0,
            createdAt: now(),
          };
          retro.items.push(item);
          retro.updatedAt = now();
          await store.set("retros", id, retro);
          return { ok: true, item, retroId: id };
        }

        case "retro:update": {
          const retro = store.get("retros", id);
          if (!retro) return { ok: false, error: `Retro not found: ${id}` };
          const updated = {
            ...retro,
            ...data,
            id,
            items: retro.items,
            actionItems: retro.actionItems,
            updatedAt: now(),
          };
          await store.set("retros", id, updated);
          return { ok: true, retro: updated };
        }

        case "retro:delete": {
          return { ok: await store.delete("retros", id), id };
        }

        // =================================================================
        // ANALYTICS
        // =================================================================

        case "analytics:burndown": {
          const sprint = store.get("sprints", id || filter.sprintId);
          if (!sprint)
            return { ok: false, error: "Sprint ID required for burndown" };
          const stories = store.list(
            "stories",
            (s) => s.sprintId === sprint.id,
          );
          const totalPoints = stories.reduce(
            (sum, s) => sum + (s.points || 0),
            0,
          );
          const donePoints = stories
            .filter((s) => s.status === "done")
            .reduce((sum, s) => sum + (s.points || 0), 0);
          return {
            ok: true,
            sprint: {
              id: sprint.id,
              name: sprint.name,
              startDate: sprint.startDate,
              endDate: sprint.endDate,
            },
            totalPoints,
            remainingPoints: totalPoints - donePoints,
            completedPoints: donePoints,
            completionPct: totalPoints
              ? Math.round((donePoints / totalPoints) * 100)
              : 0,
            byStatus: _groupBy(stories, "status"),
          };
        }

        case "analytics:velocity": {
          const sprints = store
            .list(
              "sprints",
              (s) =>
                (!projectId || s.projectId === projectId) &&
                s.status === "completed",
            )
            .slice(-10);
          const velocityData = sprints.map((s) => {
            const done = store.list(
              "stories",
              (st) => st.sprintId === s.id && st.status === "done",
            );
            return {
              sprintId: s.id,
              name: s.name,
              points: done.reduce((sum, st) => sum + (st.points || 0), 0),
              stories: done.length,
            };
          });
          const avg = velocityData.length
            ? Math.round(
                velocityData.reduce((sum, v) => sum + v.points, 0) /
                  velocityData.length,
              )
            : 0;
          const trend =
            velocityData.length >= 2
              ? velocityData[velocityData.length - 1].points -
                velocityData[velocityData.length - 2].points
              : 0;
          return {
            ok: true,
            velocityData,
            averageVelocity: avg,
            trend,
            sprintCount: velocityData.length,
          };
        }

        case "analytics:kpis": {
          const allStories = store.list(
            "stories",
            (s) => !projectId || s.projectId === projectId,
          );
          const allSprints = store.list(
            "sprints",
            (s) => !projectId || s.projectId === projectId,
          );
          const allMilestones = store.list(
            "milestones",
            (m) => !projectId || m.projectId === projectId,
          );
          const allOkrs = store.list(
            "okrs",
            (o) => !projectId || o.projectId === projectId,
          );

          return {
            ok: true,
            kpis: {
              stories: {
                total: allStories.length,
                done: allStories.filter((s) => s.status === "done").length,
                inProgress: allStories.filter((s) => s.status === "in_progress")
                  .length,
                backlog: allStories.filter((s) => s.status === "backlog")
                  .length,
                totalPoints: allStories.reduce(
                  (sum, s) => sum + (s.points || 0),
                  0,
                ),
                completionRate: allStories.length
                  ? Math.round(
                      (allStories.filter((s) => s.status === "done").length /
                        allStories.length) *
                        100,
                    )
                  : 0,
              },
              sprints: {
                total: allSprints.length,
                completed: allSprints.filter((s) => s.status === "completed")
                  .length,
                active: allSprints.filter((s) => s.status === "active").length,
              },
              milestones: {
                total: allMilestones.length,
                completed: allMilestones.filter((m) => m.status === "completed")
                  .length,
                atRisk: allMilestones.filter((m) => m.status === "at_risk")
                  .length,
              },
              okrs: {
                total: allOkrs.length,
                avgProgress: allOkrs.length
                  ? Math.round(
                      allOkrs.reduce((sum, o) => sum + o.progress, 0) /
                        allOkrs.length,
                    )
                  : 0,
                onTrack: allOkrs.filter((o) => o.status === "on_track").length,
                atRisk: allOkrs.filter((o) => o.status === "at_risk").length,
              },
            },
          };
        }

        // =================================================================
        // AI HELPERS (template-based generation)
        // =================================================================

        case "ai:generate_prd": {
          return skill.run({
            input: { action: "prd:generate", data, prompt, projectId },
            workspaceRoot,
          });
        }

        case "ai:breakdown_epic": {
          const epicTitle = prompt || data.epic || "Epic feature";
          const stories = _generateStoriesFromFeature(
            epicTitle,
            data.count || 6,
            projectId,
          );
          const created = [];
          for (const s of stories) {
            await store.set("stories", s.id, s);
            created.push(s);
          }
          return {
            ok: true,
            epic: epicTitle,
            stories: created,
            count: created.length,
          };
        }

        case "ai:write_acceptance_criteria": {
          const storyTitle = prompt || data.story || "User story";
          const criteria = [
            `GIVEN the user is on the ${data.page || "feature"} page`,
            `WHEN they perform the ${data.action || "primary action"}`,
            `THEN they should see ${data.outcome || "the expected result"}`,
            `AND the system should ${data.sideEffect || "update accordingly"}`,
            `AND an error message should be shown if ${data.errorCase || "the action fails"}`,
          ];
          return { ok: true, story: storyTitle, acceptanceCriteria: criteria };
        }

        case "ai:suggest_okrs": {
          const goal = prompt || data.goal || "Grow the product";
          const suggested = [
            {
              title: `Accelerate ${goal}`,
              keyResults: [
                {
                  title: "Increase key metric by 20%",
                  target: 120,
                  baseline: 100,
                  unit: "%",
                },
                {
                  title: "Reduce churn to below 5%",
                  target: 5,
                  baseline: 10,
                  unit: "%",
                },
                {
                  title: "Launch 3 new features",
                  target: 3,
                  baseline: 0,
                  unit: "features",
                },
              ],
            },
            {
              title: `Improve quality for ${goal}`,
              keyResults: [
                {
                  title: "Achieve >4.5 CSAT score",
                  target: 4.5,
                  baseline: 3.8,
                  unit: "score",
                },
                {
                  title: "Reduce P1 bugs to zero",
                  target: 0,
                  baseline: 5,
                  unit: "bugs",
                },
              ],
            },
          ];
          return { ok: true, goal, suggestedOkrs: suggested };
        }

        case "ai:risk_analysis": {
          const context = prompt || data.context || "Product launch";
          const risks = [
            {
              category: "Technical",
              risk: "Integration complexity higher than estimated",
              probability: "medium",
              impact: "high",
              mitigation:
                "Spike in first sprint, set up integration tests early",
            },
            {
              category: "Market",
              risk: "Competitor releases similar feature",
              probability: "low",
              impact: "medium",
              mitigation:
                "Accelerate differentiation features, monitor competitors",
            },
            {
              category: "Resources",
              risk: "Key engineer unavailable",
              probability: "low",
              impact: "high",
              mitigation: "Document architecture, cross-train team members",
            },
            {
              category: "Adoption",
              risk: "Low user adoption at launch",
              probability: "medium",
              impact: "high",
              mitigation:
                "Run beta program, collect early feedback, plan onboarding flow",
            },
            {
              category: "Scope",
              risk: "Scope creep delays delivery",
              probability: "high",
              impact: "medium",
              mitigation: "Strict change control, weekly scope reviews",
            },
          ];
          return {
            ok: true,
            context,
            risks,
            riskScore: "medium",
            recommendation: "Address high-impact risks in discovery phase",
          };
        }

        case "ai:roadmap_from_goals": {
          const goals = data.goals || [prompt || "Launch MVP"];
          const roadmapItems = goals.flatMap((goal, i) => [
            {
              title: `Discovery: ${goal}`,
              theme: "discovery",
              priority: "high",
              quarter: "Q1",
              confidence: "high",
              effort: "medium",
              impact: "high",
            },
            {
              title: `Build: ${goal}`,
              theme: "delivery",
              priority: "high",
              quarter: "Q2",
              confidence: "medium",
              effort: "high",
              impact: "high",
            },
            {
              title: `Scale: ${goal}`,
              theme: "growth",
              priority: "medium",
              quarter: "Q3",
              confidence: "medium",
              effort: "medium",
              impact: "high",
            },
          ]);
          return { ok: true, goals, suggestedRoadmapItems: roadmapItems };
        }

        default:
          return { ok: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { ok: false, error: err.message, action };
    }
  },
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function _groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const val = item[key] || "unknown";
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
}

function _generateRequirementsTemplate(description) {
  return [
    {
      id: "FR-001",
      type: "functional",
      priority: "must_have",
      title: "Core functionality",
      description: `The system must support: ${description}`,
      status: "draft",
    },
    {
      id: "FR-002",
      type: "functional",
      priority: "must_have",
      title: "User authentication",
      description:
        "Users must be able to log in and access their data securely",
      status: "draft",
    },
    {
      id: "FR-003",
      type: "functional",
      priority: "should_have",
      title: "Error handling",
      description:
        "The system should provide clear error messages for all failure states",
      status: "draft",
    },
    {
      id: "NFR-001",
      type: "non_functional",
      priority: "must_have",
      title: "Performance",
      description: "Page load time must be under 2 seconds for 95th percentile",
      status: "draft",
    },
    {
      id: "NFR-002",
      type: "non_functional",
      priority: "should_have",
      title: "Accessibility",
      description: "Must meet WCAG 2.1 AA standards",
      status: "draft",
    },
  ];
}

function _generateStoriesFromFeature(feature, count, projectId) {
  const templates = [
    {
      asA: "product manager",
      iWant: `to view ${feature}`,
      soThat: "I can make data-driven decisions",
      type: "feature",
      points: 3,
    },
    {
      asA: "developer",
      iWant: `to integrate ${feature} via API`,
      soThat: "I can build on top of the platform",
      type: "feature",
      points: 5,
    },
    {
      asA: "admin",
      iWant: `to configure ${feature} settings`,
      soThat: "I can customize behavior for my team",
      type: "feature",
      points: 3,
    },
    {
      asA: "end user",
      iWant: `to use ${feature} on mobile`,
      soThat: "I can access it anywhere",
      type: "feature",
      points: 5,
    },
    {
      asA: "end user",
      iWant: `to receive notifications about ${feature}`,
      soThat: "I stay informed of changes",
      type: "feature",
      points: 2,
    },
    {
      asA: "analyst",
      iWant: `to export ${feature} data`,
      soThat: "I can analyze it in external tools",
      type: "feature",
      points: 3,
    },
    {
      asA: "developer",
      iWant: `to write tests for ${feature}`,
      soThat: "I can ensure quality and prevent regressions",
      type: "chore",
      points: 2,
    },
    {
      asA: "end user",
      iWant: `to search within ${feature}`,
      soThat: "I can quickly find what I need",
      type: "feature",
      points: 3,
    },
  ];

  return templates.slice(0, count).map((t, i) => ({
    id: makeId("story"),
    projectId: projectId || null,
    sprintId: null,
    epicId: null,
    title: `As a ${t.asA}, I want to ${t.iWant}`,
    description: `As a ${t.asA}, I want ${t.iWant}, so that ${t.soThat}.`,
    asA: t.asA,
    iWant: t.iWant,
    soThat: t.soThat,
    acceptanceCriteria: [
      `GIVEN the user is authenticated`,
      `WHEN they access the ${feature} feature`,
      `THEN they should be able to ${t.iWant}`,
      `AND the action should complete within 2 seconds`,
    ],
    points: t.points,
    priority: i < 2 ? "high" : "medium",
    status: "backlog",
    type: t.type,
    labels: [feature.toLowerCase().replace(/\s+/g, "-")],
    assignee: null,
    reporter: null,
    linkedPrdId: null,
    dependencies: [],
    notes: "",
    createdAt: now(),
    updatedAt: now(),
  }));
}

function _suggestPoints(story) {
  const title = (story.title || "").toLowerCase();
  const desc = (story.description || "").toLowerCase();
  const combined = title + " " + desc;

  if (story.type === "chore") return 1;
  if (story.type === "bug") return combined.includes("critical") ? 3 : 1;
  if (
    combined.includes("integrate") ||
    combined.includes("api") ||
    combined.includes("migration")
  )
    return 8;
  if (
    combined.includes("design") ||
    combined.includes("complex") ||
    combined.includes("refactor")
  )
    return 5;
  if (
    combined.includes("update") ||
    combined.includes("add") ||
    combined.includes("improve")
  )
    return 3;
  if (
    combined.includes("fix") ||
    combined.includes("minor") ||
    combined.includes("small")
  )
    return 1;
  return 2;
}

function _defaultReleaseChecklist() {
  return [
    {
      id: makeId("cl"),
      title: "All stories in release are Done",
      done: false,
      required: true,
    },
    {
      id: makeId("cl"),
      title: "QA sign-off completed",
      done: false,
      required: true,
    },
    {
      id: makeId("cl"),
      title: "Regression tests passing",
      done: false,
      required: true,
    },
    {
      id: makeId("cl"),
      title: "Performance benchmarks met",
      done: false,
      required: true,
    },
    {
      id: makeId("cl"),
      title: "Security review completed",
      done: false,
      required: true,
    },
    {
      id: makeId("cl"),
      title: "Documentation updated",
      done: false,
      required: false,
    },
    {
      id: makeId("cl"),
      title: "Release notes written",
      done: false,
      required: false,
    },
    {
      id: makeId("cl"),
      title: "Stakeholder sign-off received",
      done: false,
      required: true,
    },
    {
      id: makeId("cl"),
      title: "Feature flags configured",
      done: false,
      required: false,
    },
    {
      id: makeId("cl"),
      title: "Rollback plan documented",
      done: false,
      required: true,
    },
    {
      id: makeId("cl"),
      title: "Monitoring alerts configured",
      done: false,
      required: false,
    },
    {
      id: makeId("cl"),
      title: "Customer comms prepared",
      done: false,
      required: false,
    },
  ];
}
