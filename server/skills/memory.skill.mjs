import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const skill = {
  id: "memory",
  name: "Memory",
  description: "Persistent knowledge graph for storing and retrieving information across sessions. Use entities, relations, and observations.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create_entities", "create_relations", "add_observations", "delete_entities", "delete_observations", "delete_relations", "read_graph", "search_nodes", "open_nodes", "summarize"],
        description: "Memory action to perform"
      },
      entities: {
        type: "array",
        description: "Entities to create",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            entityType: { type: "string" },
            observations: { type: "array", items: { type: "string" } }
          }
        }
      },
      relations: {
        type: "array",
        description: "Relations to create",
        items: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            relationType: { type: "string" }
          }
        }
      },
      entityName: {
        type: "string",
        description: "Entity name (for add_observations, delete)"
      },
      observations: {
        type: "array",
        description: "Observations to add/delete",
        items: { type: "string" }
      },
      relationType: {
        type: "string",
        description: "Relation type to delete"
      },
      query: {
        type: "string",
        description: "Search query"
      },
      names: {
        type: "array",
        description: "Entity names to open",
        items: { type: "string" }
      }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const memoryDir = path.join(workspaceRoot, "data", "memory");
    const memoryPath = path.join(memoryDir, "knowledge-graph.json");

    await mkdir(memoryDir, { recursive: true });

    const loadGraph = async () => {
      if (!existsSync(memoryPath)) {
        return { entities: {}, relations: [] };
      }
      try {
        const data = await readFile(memoryPath, "utf8");
        return JSON.parse(data);
      } catch {
        return { entities: {}, relations: [] };
      }
    };

    const saveGraph = async (graph) => {
      await writeFile(memoryPath, JSON.stringify(graph, null, 2), "utf8");
    };

    const graph = await loadGraph();

    switch (action) {
      case "create_entities": {
        const entities = input?.entities || [];
        for (const entity of entities) {
          const name = entity.name;
          if (!name) continue;
          
          if (!graph.entities[name]) {
            graph.entities[name] = {
              name,
              entityType: entity.entityType || "entity",
              observations: entity.observations || [],
              created: new Date().toISOString()
            };
          } else {
            for (const obs of (entity.observations || [])) {
              if (!graph.entities[name].observations.includes(obs)) {
                graph.entities[name].observations.push(obs);
              }
            }
          }
        }
        await saveGraph(graph);
        return { ok: true, action, created: entities.length };
      }

      case "create_relations": {
        const relations = input?.relations || [];
        for (const rel of relations) {
          if (rel.from && rel.to && rel.relationType) {
            graph.relations.push({
              from: rel.from,
              to: rel.to,
              relationType: rel.relationType,
              created: new Date().toISOString()
            });
          }
        }
        await saveGraph(graph);
        return { ok: true, action, created: relations.length };
      }

      case "add_observations": {
        const entityName = input?.entityName;
        const observations = input?.observations || [];
        
        if (!entityName || !graph.entities[entityName]) {
          return { ok: false, error: `Entity not found: ${entityName}` };
        }
        
        for (const obs of observations) {
          if (!graph.entities[entityName].observations.includes(obs)) {
            graph.entities[entityName].observations.push(obs);
          }
        }
        await saveGraph(graph);
        return { ok: true, action, added: observations.length };
      }

      case "delete_entities": {
        const names = input?.names || [];
        for (const name of names) {
          delete graph.entities[name];
          graph.relations = graph.relations.filter(r => r.from !== name && r.to !== name);
        }
        await saveGraph(graph);
        return { ok: true, action, deleted: names.length };
      }

      case "delete_observations": {
        const entityName = input?.entityName;
        const observations = input?.observations || [];
        
        if (!entityName || !graph.entities[entityName]) {
          return { ok: false, error: `Entity not found: ${entityName}` };
        }
        
        graph.entities[entityName].observations = graph.entities[entityName].observations
          .filter(o => !observations.includes(o));
        await saveGraph(graph);
        return { ok: true, action, deleted: observations.length };
      }

      case "delete_relations": {
        const from = input?.entityName;
        const relationType = input?.relationType;
        
        graph.relations = graph.relations.filter(r => {
          if (from && r.from !== from) return true;
          if (relationType && r.relationType !== relationType) return true;
          return false;
        });
        await saveGraph(graph);
        return { ok: true, action };
      }

      case "read_graph": {
        return {
          ok: true,
          action,
          entityCount: Object.keys(graph.entities).length,
          relationCount: graph.relations.length,
          graph: {
            entities: graph.entities,
            relations: graph.relations.slice(-100)
          }
        };
      }

      case "search_nodes": {
        const query = (input?.query || "").toLowerCase();
        const results = [];
        
        for (const [name, entity] of Object.entries(graph.entities)) {
          const matchName = name.toLowerCase().includes(query);
          const matchType = entity.entityType?.toLowerCase().includes(query);
          const matchObs = entity.observations?.some(o => o.toLowerCase().includes(query));
          
          if (matchName || matchType || matchObs) {
            results.push(entity);
          }
        }
        
        return { ok: true, action, query, count: results.length, results: results.slice(0, 20) };
      }

      case "open_nodes": {
        const names = input?.names || [];
        const nodes = names
          .filter(n => graph.entities[n])
          .map(n => graph.entities[n]);
        return { ok: true, action, nodes };
      }

      case "summarize": {
        const entityCount = Object.keys(graph.entities).length;
        const relationCount = graph.relations.length;
        const entityTypes = {};
        
        for (const entity of Object.values(graph.entities)) {
          const type = entity.entityType || "unknown";
          entityTypes[type] = (entityTypes[type] || 0) + 1;
        }
        
        return {
          ok: true,
          action,
          summary: {
            entityCount,
            relationCount,
            entityTypes
          }
        };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
};
