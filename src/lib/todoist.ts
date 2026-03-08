import { getHouseholdTodoistRuntimeConfig } from "@/lib/household-integrations";
import {
  TodoistApi,
  TodoistRequestError,
  type Task as TodoistTask,
} from "@doist/todoist-api-typescript";

export type TodoistTaskItem = {
  id: string;
  content: string;
  description: string | null;
  dueLabel: string | null;
  priority: number;
  url: string | null;
};

export type TodoistModuleData = {
  projectId: string | null;
  tasks: TodoistTaskItem[];
  fetchedAt: string;
};

export type TodoistCacheDiagnostics = {
  configSource: "env" | "household";
  cacheSeconds: number;
  hasApiToken: boolean;
  cacheKey: string;
  cacheHit: boolean;
  fetchedAt: string | null;
  expiresAt: string | null;
  secondsUntilExpiry: number | null;
};

export type TodoistCacheOverview = {
  entryCount: number;
  activeEntryCount: number;
  latestFetchedAt: string | null;
  nextExpiryAt: string | null;
  nextExpiryInSeconds: number | null;
};

type CacheEntry = {
  expiresAt: number;
  data: TodoistModuleData;
};

declare global {
  var __todoistModuleCache: Map<string, CacheEntry> | undefined;
  var __todoistApiClientByToken: Map<string, TodoistApi> | undefined;
}

const todoistCache = global.__todoistModuleCache ?? new Map<string, CacheEntry>();
if (!global.__todoistModuleCache) {
  global.__todoistModuleCache = todoistCache;
}

const todoistClientByToken = global.__todoistApiClientByToken ?? new Map<string, TodoistApi>();
if (!global.__todoistApiClientByToken) {
  global.__todoistApiClientByToken = todoistClientByToken;
}

type TodoistTaskLike = Pick<
  TodoistTask,
  "id" | "content" | "description" | "due" | "priority" | "url"
>;

function getTodoistClient(apiToken: string) {
  const cached = todoistClientByToken.get(apiToken);
  if (cached) {
    return cached;
  }

  const client = new TodoistApi(apiToken);
  todoistClientByToken.set(apiToken, client);
  return client;
}

function formatTodoistDueLabel(due: TodoistTask["due"]) {
  const iso = due?.datetime ?? due?.date;

  if (!iso) {
    return null;
  }

  const asDate = due?.datetime ? new Date(due.datetime) : new Date(`${iso}T00:00:00`);
  if (Number.isNaN(asDate.getTime())) {
    return null;
  }

  if (due?.datetime) {
    return new Intl.DateTimeFormat("nl-NL", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(asDate);
  }

  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(asDate);
}

function mapAndSortTasks(rawTasks: TodoistTaskLike[], maxVisible: number): TodoistTaskItem[] {
  return rawTasks
    .map((task) => {
      const idValue = task.id ? String(task.id) : "";
      const content = task.content?.trim() ?? "";

      if (!idValue || !content) {
        return null;
      }

      return {
        id: idValue,
        content,
        description: task.description?.trim() || null,
        dueLabel: formatTodoistDueLabel(task.due),
        priority: task.priority ?? 1,
        url: task.url ?? null,
        dueSortValue: task.due?.datetime ?? task.due?.date ?? "9999-12-31",
      };
    })
    .filter((task): task is NonNullable<typeof task> => Boolean(task))
    .sort((a, b) => {
      if (a.dueSortValue !== b.dueSortValue) {
        return a.dueSortValue.localeCompare(b.dueSortValue);
      }

      return b.priority - a.priority;
    })
    .slice(0, Math.max(1, maxVisible))
    .map((task) => ({
      id: task.id,
      content: task.content,
      description: task.description,
      dueLabel: task.dueLabel,
      priority: task.priority,
      url: task.url,
    }));
}

function shouldRetryWithoutProjectFilter(error: TodoistRequestError) {
  const responseData = error.responseData as
    | { error_tag?: string; error_code?: number }
    | undefined;
  return (
    error.httpStatusCode === 400 &&
    (responseData?.error_tag === "V1_ID_CANNOT_BE_USED" ||
      responseData?.error_code === 557)
  );
}

export async function getTodoistModuleData({
  householdId,
  projectId: projectIdOverride,
  maxVisible,
}: {
  householdId: string;
  projectId: string;
  maxVisible: number;
}): Promise<TodoistModuleData | null> {
  const todoist = await getHouseholdTodoistRuntimeConfig(householdId);
  const apiToken = todoist.apiToken.trim();
  const projectId = (projectIdOverride || todoist.projectId || "").trim();

  if (!apiToken) {
    return null;
  }

  const cacheKey = buildTodoistCacheKey({
    householdId,
    apiToken,
    projectId,
    maxVisible,
  });
  const cached = todoistCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const client = getTodoistClient(apiToken);
    const pageLimit = Math.max(50, Math.min(200, maxVisible * 4));
    let rawTasks: TodoistTaskLike[];

    try {
      const taskPage = await client.getTasks({
        ...(projectId ? { projectId } : {}),
        limit: pageLimit,
      });
      rawTasks = taskPage.results;
    } catch (error) {
      if (
        error instanceof TodoistRequestError &&
        projectId &&
        shouldRetryWithoutProjectFilter(error)
      ) {
        console.warn("Todoist projectId is deprecated voor API v1; retry zonder projectfilter", {
          projectId,
          status: error.httpStatusCode,
          responseData: error.responseData ?? null,
        });
        try {
          const projects = await client.getProjects({ limit: 50 });
          console.warn(
            "Todoist v1 project IDs (gebruik een van deze IDs in de moduleconfig/.env)",
            projects.results.map((project) => ({
              id: project.id,
              name: project.name,
            })),
          );
        } catch {
          // Niet blokkeren als projectlijst ophalen faalt; taken zonder projectfilter blijven bruikbaar.
        }
        const fallbackTaskPage = await client.getTasks({
          limit: pageLimit,
        });
        rawTasks = fallbackTaskPage.results;
      } else {
        throw error;
      }
    }

    const tasks = mapAndSortTasks(rawTasks, maxVisible);

    const data: TodoistModuleData = {
      projectId: projectId || null,
      tasks,
      fetchedAt: new Date().toISOString(),
    };

    todoistCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + Math.max(15, todoist.cacheSeconds) * 1000,
    });

    return data;
  } catch (error) {
    if (error instanceof TodoistRequestError) {
      console.error("Kon Todoist items niet ophalen (TodoistRequestError)", {
        projectId,
        message: error.message,
        status: error.httpStatusCode,
        responseData: error.responseData ?? null,
      });
      return null;
    }

    console.error("Kon Todoist items niet ophalen", {
      projectId,
      error: error instanceof Error ? error.message : "Onbekende fout",
    });
    return null;
  }
}

function buildTodoistCacheKey({
  householdId,
  apiToken,
  projectId,
  maxVisible,
}: {
  householdId: string;
  apiToken: string;
  projectId: string;
  maxVisible: number;
}) {
  return `${householdId}:${apiToken}:${projectId || "all"}:${maxVisible}`;
}

export async function getTodoistCacheDiagnostics({
  householdId,
  projectId: projectIdOverride,
  maxVisible,
}: {
  householdId: string;
  projectId: string;
  maxVisible: number;
}): Promise<TodoistCacheDiagnostics> {
  const todoist = await getHouseholdTodoistRuntimeConfig(householdId);
  const apiToken = todoist.apiToken.trim();
  const projectId = (projectIdOverride || todoist.projectId || "").trim();
  const cacheKey = buildTodoistCacheKey({
    householdId,
    apiToken,
    projectId,
    maxVisible,
  });
  const cached = todoistCache.get(cacheKey);
  const now = Date.now();
  const cacheHit = Boolean(cached && cached.expiresAt > now);

  return {
    configSource: todoist.source,
    cacheSeconds: Math.max(15, todoist.cacheSeconds),
    hasApiToken: Boolean(apiToken),
    cacheKey,
    cacheHit,
    fetchedAt: cached?.data.fetchedAt ?? null,
    expiresAt: cached ? new Date(cached.expiresAt).toISOString() : null,
    secondsUntilExpiry: cached ? Math.max(0, Math.ceil((cached.expiresAt - now) / 1000)) : null,
  };
}

export function getTodoistCacheOverview(householdId: string): TodoistCacheOverview {
  const prefix = `${householdId}:`;
  const now = Date.now();

  let entryCount = 0;
  let activeEntryCount = 0;
  let latestFetchedAtMs: number | null = null;
  let nextExpiryMs: number | null = null;

  for (const [cacheKey, entry] of todoistCache.entries()) {
    if (!cacheKey.startsWith(prefix)) {
      continue;
    }

    entryCount += 1;

    if (entry.expiresAt > now) {
      activeEntryCount += 1;
      if (nextExpiryMs === null || entry.expiresAt < nextExpiryMs) {
        nextExpiryMs = entry.expiresAt;
      }
    }

    const fetchedAtMs = Date.parse(entry.data.fetchedAt);
    if (!Number.isNaN(fetchedAtMs) && (latestFetchedAtMs === null || fetchedAtMs > latestFetchedAtMs)) {
      latestFetchedAtMs = fetchedAtMs;
    }
  }

  return {
    entryCount,
    activeEntryCount,
    latestFetchedAt: latestFetchedAtMs ? new Date(latestFetchedAtMs).toISOString() : null,
    nextExpiryAt: nextExpiryMs ? new Date(nextExpiryMs).toISOString() : null,
    nextExpiryInSeconds: nextExpiryMs ? Math.max(0, Math.ceil((nextExpiryMs - now) / 1000)) : null,
  };
}
